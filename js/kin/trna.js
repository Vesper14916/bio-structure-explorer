/**
 * @module kin/trna
 * tRNA anticodon, aminoacyl-end and codon-pairing kinematics (PLAN.md §2 D7, §5.3 item 6, §7.3–§7.4,
 * §8.1, task R3-K3).
 *
 * - Places a `trna-init` / `trna-aa` asset at a ribosome site (`siteAT`, `siteA`, `siteAP`, `siteP`,
 *   `sitePE`, `siteE`), interpolating between sites by slerp (`trnaSiteFrame`).
 * - Poses the three procedural anticodon nucleotides (standard numbers 34, 35, 36) on the asset's
 *   `anticodon` track. When the anticodon is paired (`pair > 0`) each nucleotide blends toward the exact
 *   Watson–Crick partner frame of its codon nucleotide (34↔codon position 3, 35↔2, 36↔1), so the
 *   C1′–C1′ distance is the ideal 10.69 Å of the template geometry and the H-bonds close.
 * - Gives the aminoacyl ester carbon (1.33 Å along `acceptor` +z), the aminoacyl residue pose and the
 *   peptidyl attachment point (Cα of the residue esterified to A76) that starts the peptide path.
 *
 * Pure functions on plain frames and typed arrays; no DOM and no three.js.
 */
import { slerpFrame, composeFrame, writeFrame16, readFrame16 } from './frames.js';
import { sampleTrack } from './track.js';
import { partnerFrame } from '../science/math.js';
import { nucleotideTemplate } from '../science/assembly.js';
import { residueTemplate } from '../science/residues.js';

/** Standard tRNA numbers of the anticodon (5′→3′). */
export const ANTICODON_NUMBERS = Object.freeze([34, 35, 36]);

/** Ester bond length O3′(A76)–C(aminoacyl) in Å (PLAN.md §10 R3-K3). */
export const ESTER_BOND = 1.33;

/** Ribosome anchor of each tRNA site (PLAN.md §7.4). */
export const SITE_ANCHORS = Object.freeze({
  AT: 'siteAT', A: 'siteA', AP: 'siteAP', P: 'siteP', PE: 'sitePE', E: 'siteE',
});

/** Classic-site fallback when a conditional hybrid anchor is absent (PLAN.md §7.4: interpolate between classic sites). */
const SITE_FALLBACK = Object.freeze({ AP: ['A', 'P'], PE: ['P', 'E'] });

const RNA_COMPLEMENT = Object.freeze({ A: 'U', U: 'A', G: 'C', C: 'G' });

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

function copyFrame(src, dst) {
  dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
  for (let i = 0; i < 9; i++) dst.R[i] = src.R[i];
  return dst;
}

function clamp01(x) {
  return x > 0 ? (x < 1 ? x : 1) : 0;
}

/**
 * Anticodon written 5′→3′ as the exact Watson–Crick complement of an RNA codon (PLAN.md §2 D7, §5.1).
 *
 * @param {string} codon - Three-letter RNA codon, 5′→3′ (e.g. `'AUG'`).
 * @returns {string} Anticodon 5′→3′ (e.g. `'CAU'`).
 */
export function anticodonOf(codon) {
  const c = String(codon).toUpperCase().replace(/T/g, 'U');
  if (c.length !== 3) throw new RangeError(`kin/trna: codon must have 3 nucleotides, got "${codon}"`);
  let s = '';
  for (let i = 2; i >= 0; i--) {
    const b = RNA_COMPLEMENT[c[i]];
    if (!b) throw new RangeError(`kin/trna: invalid RNA base "${c[i]}"`);
    s += b;
  }
  return s;
}

/**
 * Codon position (0-based, 5′→3′ along the mRNA) that pairs with anticodon nucleotide `q`
 * (0, 1, 2 for standard numbers 34, 35, 36). Antiparallel: 34↔3rd, 35↔2nd, 36↔1st.
 *
 * @param {number} q - Anticodon index 0..2.
 * @returns {number} Codon position 0..2.
 */
export function pairedCodonPosition(q) {
  return 2 - q;
}

/** Local (ribosome-frame) anchor frame for a site, or null when the asset lacks it. */
function siteAnchor(riboAsset, site) {
  const a = riboAsset && riboAsset.anchors;
  if (!a) return null;
  const name = SITE_ANCHORS[site];
  return name && a[name] ? a[name] : null;
}

/**
 * Ribosome-frame placement of a tRNA asset at `site`, or between `from` and `site` at `blend` (slerp per
 * PLAN.md §5.2: hybrid states only where the asset provides them). A missing hybrid anchor (`AP`, `PE`)
 * resolves to the midpoint slerp of its two classic sites. `'out'` resolves to the `from` site.
 *
 * @param {object} riboAsset - Decoded `ribosome-70s` asset.
 * @param {string} from - Start site (`'AT'|'A'|'AP'|'P'|'PE'|'E'|'out'`).
 * @param {string} site - End site.
 * @param {number} blend - Progress 0..1 from `from` to `site`.
 * @param {{ o: number[], R: number[] }} [out] - Result frame.
 * @returns {{ o: number[], R: number[] }} Placement of the tRNA asset frame in the ribosome frame.
 */
export function trnaSiteFrame(riboAsset, from, site, blend, out = newFrame()) {
  const to = site === 'out' ? from : site;
  const fr = from === 'out' || !from ? to : from;
  const b = clamp01(blend);
  const fa = resolveSite(riboAsset, fr, out._ta || (out._ta = newFrame()));
  const fb = resolveSite(riboAsset, to, out._tb || (out._tb = newFrame()));
  if (!fa || !fb) throw new Error(`kin/trna: ribosome asset lacks site ${fa ? to : fr}`);
  if (b <= 0) return copyFrame(fa, out);
  if (b >= 1) return copyFrame(fb, out);
  return slerpFrame(fa, fb, b, out);
}

function resolveSite(riboAsset, site, scratch) {
  const direct = siteAnchor(riboAsset, site);
  if (direct) return direct;
  const fb = SITE_FALLBACK[site];
  if (!fb) return null;
  const a = siteAnchor(riboAsset, fb[0]);
  const c = siteAnchor(riboAsset, fb[1]);
  if (!a || !c) return null;
  return slerpFrame(a, c, 0.5, scratch);
}

/**
 * World frame of each anticodon nucleotide (numbers 34, 35, 36) of a placed tRNA.
 *
 * `trnaSpec.transform` is the world placement of the tRNA asset. With `trnaSpec.pair` in `(0, 1]` and
 * `trnaSpec.codonFrames` (3 world frames of the codon nucleotides, 5′→3′, as `{ o, R }` or a
 * `Float32Array` of 48 floats), each nucleotide is slerped from its track frame toward the
 * Watson–Crick partner frame of its codon nucleotide. `pair = 1` gives exact pairing geometry. With
 * `trnaSpec.anticodon` and `trnaSpec.codon` (5′→3′ base strings) the partner is tightened to C1′–C1′ ≤ 10.6 Å.
 *
 * @param {{ transform: { o: number[], R: number[] }, pair?: number, codonFrames?: object[] | Float32Array, anticodon?: string, codon?: string }} trnaSpec
 * @param {object} asset - Decoded `trna-init` or `trna-aa` asset with track `anticodon`.
 * @param {Float32Array} [outFrames] - Output buffer, 16 floats per nucleotide (3 nucleotides).
 * @returns {Float32Array} `outFrames` with nucleotides 34, 35, 36 at indices 0, 1, 2.
 */
export function poseTrnaAnticodon(trnaSpec, asset, outFrames = new Float32Array(48)) {
  const track = asset && asset.tracks && asset.tracks.anticodon;
  if (!track) throw new Error('kin/trna: asset lacks track "anticodon"');
  if (outFrames.length < 48) throw new RangeError('kin/trna: outFrames needs 48 floats');
  const M = trnaSpec.transform;
  const pair = clamp01(trnaSpec.pair ?? 0);
  const cf = trnaSpec.codonFrames || null;
  const s = poseTrnaAnticodon._s || (poseTrnaAnticodon._s = { l: newFrame(), w: newFrame(), c: newFrame(), p: newFrame() });
  for (let q = 0; q < 3; q++) {
    sampleTrack(track, ANTICODON_NUMBERS[q], s.l);
    composeFrame(M, s.l, s.w);
    if (pair > 0 && cf) {
      readCodonFrame(cf, pairedCodonPosition(q), s.c);
      const pf = partnerFrame(s.c);
      copyFrame(pf, s.p);
      if (trnaSpec.anticodon && trnaSpec.codon) {
        tightenPair(s.p, s.c, trnaSpec.anticodon[q], trnaSpec.codon[pairedCodonPosition(q)]);
      }
      if (pair >= 1) copyFrame(s.p, s.w);
      else slerpFrame(s.w, s.p, pair, s.w);
    }
    writeFrame16(outFrames, q, s.w);
  }
  return outFrames;
}

/** Target C1′–C1′ distance for paired anticodon nucleotides (ideal 10.5 Å; PLAN.md §10 R3-K3 gate ±0.3 Å). */
export const PAIR_C1_TARGET = 10.6;
const c1Cache = new Map();
function c1Local(base) {
  let v = c1Cache.get(base);
  if (!v) {
    const t = nucleotideTemplate(base, 'ribose');
    const i = t.index["C1'"];
    v = [t.local[3 * i], t.local[3 * i + 1], t.local[3 * i + 2]];
    c1Cache.set(base, v);
  }
  return v;
}

/**
 * Translate the partner (anticodon) frame along its C1′→codon C1′ direction so that C1′–C1′ is at most
 * `PAIR_C1_TARGET` (the flip-partner geometry of the templates gives 10.70 Å for A·U and 10.80 Å for G·C).
 */
function tightenPair(pf, cf, aBase, cBase) {
  const a = applyPt(pf, c1Local(aBase));
  const c = applyPt(cf, c1Local(cBase));
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const d = Math.hypot(dx, dy, dz);
  if (!(d > PAIR_C1_TARGET)) return pf;
  const k = (d - PAIR_C1_TARGET) / d;
  pf.o[0] += dx * k; pf.o[1] += dy * k; pf.o[2] += dz * k;
  return pf;
}

function applyPt(f, p) {
  const R = f.R;
  return [
    R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + f.o[0],
    R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + f.o[1],
    R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + f.o[2],
  ];
}

function readCodonFrame(cf, i, out) {
  if (ArrayBuffer.isView(cf)) return readFrame16(cf, i, out);
  return copyFrame(cf[i], out);
}

/**
 * World frame of the aminoacyl ester carbon: o = acceptor O3′ + 1.33 Å along acceptor +z; R = acceptor R,
 * composed with the tRNA world placement.
 *
 * @param {{ transform: { o: number[], R: number[] } }} trnaSpec - tRNA with world transform.
 * @param {object} asset - Decoded tRNA asset with anchor `acceptor`.
 * @param {{ o: number[], R: number[] }} [out] - Result frame.
 * @returns {{ o: number[], R: number[] }} World-space aminoacyl attachment frame.
 */
export function poseAminoacylEnd(trnaSpec, asset, out = newFrame()) {
  const acc = asset && asset.anchors && asset.anchors.acceptor;
  if (!acc) throw new Error('kin/trna: asset lacks anchor "acceptor"');
  const s = poseAminoacylEnd._s || (poseAminoacylEnd._s = newFrame());
  copyFrame(acc, s);
  s.o[0] += acc.R[2] * ESTER_BOND;
  s.o[1] += acc.R[5] * ESTER_BOND;
  s.o[2] += acc.R[8] * ESTER_BOND;
  return composeFrame(trnaSpec.transform, s, out);
}

// Local residue placement: the carbonyl carbon sits on the ester carbon, the C→Cα bond follows acceptor +z,
// and the N side of Cα points along acceptor +x (perpendicular component).
const residueFrames = new Map();
function residueLocalFrame(code3) {
  let r = residueFrames.get(code3);
  if (r) return r;
  const tpl = residueTemplate(code3);
  const L = tpl.local;
  const ic = tpl.index.C, ia = tpl.index.CA, iN = tpl.index.N;
  const C = [L[3 * ic], L[3 * ic + 1], L[3 * ic + 2]];
  const CA = [L[3 * ia], L[3 * ia + 1], L[3 * ia + 2]];
  const N = [L[3 * iN], L[3 * iN + 1], L[3 * iN + 2]];
  const z = norm([CA[0] - C[0], CA[1] - C[1], CA[2] - C[2]]);
  const v = [N[0] - CA[0], N[1] - CA[1], N[2] - CA[2]];
  const d = v[0] * z[0] + v[1] * z[1] + v[2] * z[2];
  const x = norm([v[0] - d * z[0], v[1] - d * z[1], v[2] - d * z[2]]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  // Residue atoms expressed in the (x, y, z) basis with origin at C.
  const n = tpl.names.length;
  const local = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const px = L[3 * i] - C[0], py = L[3 * i + 1] - C[1], pz = L[3 * i + 2] - C[2];
    local[3 * i] = px * x[0] + py * x[1] + pz * x[2];
    local[3 * i + 1] = px * y[0] + py * y[1] + pz * y[2];
    local[3 * i + 2] = px * z[0] + py * z[1] + pz * z[2];
  }
  const bonds = new Uint16Array(tpl.bonds.length * 2);
  tpl.bonds.forEach(([a, b], k) => { bonds[2 * k] = a; bonds[2 * k + 1] = b; });
  r = { code3, n, local, el: tpl.el.slice(), names: tpl.names.slice(), bonds, ia, ic, iN, caDist: Math.hypot(CA[0] - C[0], CA[1] - C[1], CA[2] - C[2]) };
  residueFrames.set(code3, r);
  return r;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Normalise a residue code (`'fMet'`, `'Ala'`, `'ALA'`, `'FME'`) to the residue-template code. */
export function residueCode3(aa) {
  const u = String(aa || '').toUpperCase();
  if (u === 'FMET' || u === 'FME') return 'FME';
  return u;
}

/**
 * Pose the single aminoacyl residue esterified to A76 as an `AtomGroup` (`kind: 'peptide'`, one residue),
 * with its carbonyl carbon on the ester carbon (`poseAminoacylEnd`) and the C→Cα bond along acceptor +z.
 *
 * @param {{ transform: { o: number[], R: number[] } }} trnaSpec - tRNA with world transform.
 * @param {object} asset - Decoded tRNA asset with anchor `acceptor`.
 * @param {string} aa - Amino acid (`'fMet'`, `'Ala'`, …).
 * @param {object} [outGroup] - Reusable AtomGroup to fill.
 * @returns {object} AtomGroup `{ id, kind: 'peptide', count, pos, el, names, bonds, residues, opacity }`.
 */
export function poseAminoacylResidue(trnaSpec, asset, aa, outGroup = {}) {
  const r = residueLocalFrame(residueCode3(aa));
  const g = outGroup;
  if (!(g._pos instanceof Float32Array) || g._pos.length < 3 * r.n) g._pos = new Float32Array(3 * 20);
  g.pos = g._pos.subarray(0, 3 * r.n);
  g.count = r.n;
  g.kind = 'peptide';
  g.el = r.el;
  g.names = r.names;
  g.bonds = r.bonds;
  if (typeof g.opacity !== 'number') g.opacity = 1;
  const F = poseAminoacylEnd(trnaSpec, asset, g._frame || (g._frame = newFrame()));
  const R = F.R, o = F.o, L = r.local, P = g.pos;
  for (let i = 0; i < r.n; i++) {
    const x = L[3 * i], y = L[3 * i + 1], z = L[3 * i + 2];
    P[3 * i] = R[0] * x + R[1] * y + R[2] * z + o[0];
    P[3 * i + 1] = R[3] * x + R[4] * y + R[5] * z + o[1];
    P[3 * i + 2] = R[6] * x + R[7] * y + R[8] * z + o[2];
  }
  if (!Array.isArray(g.residues)) g.residues = [{ index: 0, code3: r.code3, atomStart: 0, atomCount: r.n, ca: [0, 0, 0] }];
  const res = g.residues[0];
  res.index = 0; res.code3 = r.code3; res.atomStart = 0; res.atomCount = r.n;
  res.ca[0] = P[3 * r.ia]; res.ca[1] = P[3 * r.ia + 1]; res.ca[2] = P[3 * r.ia + 2];
  g.residues.length = 1;
  return g;
}

/**
 * Peptidyl attachment point for the peptide path: the Cα of the residue esterified to A76
 * (ester carbon + |C–Cα| along acceptor +z). The peptide path starts here and then follows `tunnel`.
 *
 * @param {{ transform: { o: number[], R: number[] } }} trnaSpec - tRNA with world transform.
 * @param {object} asset - Decoded tRNA asset with anchor `acceptor`.
 * @param {number[]} [out] - Result point.
 * @returns {number[]} World point `[x, y, z]`.
 */
export function peptidylAttachPoint(trnaSpec, asset, out = [0, 0, 0]) {
  const F = poseAminoacylEnd(trnaSpec, asset, peptidylAttachPoint._f || (peptidylAttachPoint._f = newFrame()));
  const d = residueLocalFrame('ALA').caDist;
  out[0] = F.o[0] + F.R[2] * d;
  out[1] = F.o[1] + F.R[5] * d;
  out[2] = F.o[2] + F.R[8] * d;
  return out;
}

/**
 * C1′–C1′ distances (Å) between anticodon nucleotides 34, 35, 36 and their paired codon nucleotides.
 *
 * @param {Float32Array} anticodonFrames - 3 frames from `poseTrnaAnticodon`.
 * @param {Float32Array | object[]} codonFrames - 3 codon frames, 5′→3′.
 * @param {number[]} c1Local - C1′ position in the nucleotide's local frame.
 * @returns {number[]} Distances for nucleotides 34, 35, 36.
 */
export function pairC1Distances(anticodonFrames, codonFrames, c1Local) {
  const a = newFrame(), c = newFrame();
  const out = [];
  for (let q = 0; q < 3; q++) {
    readCodonFrame(anticodonFrames, q, a);
    readCodonFrame(codonFrames, pairedCodonPosition(q), c);
    const pa = apply(a, c1Local), pc = apply(c, c1Local);
    out.push(Math.hypot(pa[0] - pc[0], pa[1] - pc[1], pa[2] - pc[2]));
  }
  return out;
}

function apply(f, p) {
  const R = f.R;
  return [
    R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + f.o[0],
    R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + f.o[1],
    R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + f.o[2],
  ];
}
