// Recipe module for the two tRNA assets (Round 3, task R3-A2):
//   - trna-init  (PDB 7K00 chain Z, P-site tRNA-fMet, initiator)
//   - trna-aa    (PDB 7K00 chain Y, A-site tRNA-Val, elongator)
// Also exports `trnaFrame`, the only implementation of the `trna` frame (PLAN.md 7.3). The ribosome recipe
// imports it to define the site anchors siteA, siteP, siteE and siteAT, so placing a tRNA asset at a site
// anchor reproduces the source coordinates exactly.
import { ASSET_FORMAT, ASSET_VERSION, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../../js/assets/format.js';
import { dist, invApplyFrame, mulMM, cross, dot, norm, sub, scale, add } from '../../js/science/math.js';
import { polymerChains } from '../lib/mmcif.mjs';
import { fitBaseFrame, residueBase } from '../lib/frames.mjs';
import { envelope, meshStats, insideMesh } from '../lib/surface.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, P: 1.07 };
const ANTICODON = [34, 35, 36];
const ELBOW = [18, 19, 55, 56];
const L0_SIGMA = 3.5, L0_SPACING = 2.5, L0_MIN_INSIDE = 0.95, L0_MAX_TRIANGLES_TOTAL = 4000;
const L2_RADIUS = 8, L2_MAX_ATOMS = 400, L1_MAX_BEADS = 80, MAX_FILE_BYTES = 60000;
const SPAN_MIN = 65, SPAN_MAX = 80;
const LAST3_MIN = 72;                  // the 3' nucleotide used for +z must be at least this number
const DEFAULT_KEYS = [...Array.from({ length: 76 }, (_, i) => i + 1), '17A'];

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const transpose = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const frameFromAxes = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });

/** Number part of a standard tRNA key ('17A' -> 17, 76 -> 76). */
export const keyNumber = key => parseInt(String(key), 10);

/**
 * Standard tRNA numbering for one parsed polymer chain (an entry of `polymerChains(parsed)`).
 * Key = author number (`authSeq`); the second residue of a duplicated author number gets the suffix `A`
 * (for example 7K00 chain Z has two residues numbered 17: the first is `17`, the second `17A`).
 * Residues are visited in label_seq_id order. Returns Map(key -> residue), keys are numbers or strings like '17A'.
 */
export function standardNumbering(chain) {
  const out = new Map(), seen = new Set();
  for (const r of chain.residues) {
    const key = seen.has(r.authSeq) ? `${r.authSeq}A` : r.authSeq;
    if (seen.has(r.authSeq) && out.has(key)) throw new Error(`chain ${chain.id}: author number ${r.authSeq} occurs more than twice`);
    seen.add(r.authSeq);
    out.set(key, r);
  }
  return out;
}

/**
 * The `trna` frame (PLAN.md 7.3), the single implementation used by the tRNA recipes and by the ribosome recipe.
 *
 * @param {Map<number|string, {atoms: Object<string, number[]>}> | ((key: number|string) => ({atoms: Object<string, number[]>}) | undefined)
 *   | Object<string, {atoms: Object<string, number[]>}>} residues
 *   Residues by standard tRNA number: a Map, a plain object, or a lookup function. Keys are numbers, or strings for
 *   insertion residues such as '17A' (see `standardNumbering`). A residue is `{ atoms: { atomName: [x, y, z] } }`
 *   (any extra fields are ignored). A function is probed with keys 1..76 and '17A' (override with `opts.keys`).
 * @param {{ transform?: (p: number[]) => number[], keys?: Array<number|string> }} [opts]
 *   `transform` is applied to every coordinate first (use it to put an entry into the 7K00 `ribo` frame after a
 *   superposition); the result is expressed in the transformed coordinates.
 * @returns {{ o: number[], R: number[], last3: number }}
 *   `o`: centroid of the C1' atoms of nucleotides 34, 35 and 36. `R`: row-major 3x3 whose columns are the axes,
 *   +z = unit vector from o to the P atom of nucleotide 76 (or the highest-numbered nucleotide up to 76 that has
 *   a P atom, never below 72), +x = component of (centroid of all P atoms - o) perpendicular to z, +y = z x x.
 *   `last3`: the 3' nucleotide number actually used for +z.
 */
export function trnaFrame(residues, opts = {}) {
  const tf = opts.transform || (p => p);
  const entries = [];
  if (residues instanceof Map) entries.push(...residues.entries());
  else if (typeof residues === 'function') {
    for (const k of opts.keys || DEFAULT_KEYS) { const r = residues(k); if (r) entries.push([k, r]); }
  } else if (residues && typeof residues === 'object') entries.push(...Object.entries(residues).map(([k, r]) => [/^\d+$/.test(k) ? Number(k) : k, r]));
  else throw new Error('trnaFrame: residues must be a Map, an object, or a function');
  const byKey = new Map(entries);

  const c1 = ANTICODON.map(n => {
    const r = byKey.get(n);
    if (!r || !r.atoms || !r.atoms["C1'"]) throw new Error(`trnaFrame: nucleotide ${n} has no C1' atom`);
    return tf(r.atoms["C1'"]);
  });
  const o = centroid(c1);

  const pAtoms = [];
  let last3 = null;
  for (const [k, r] of byKey) {
    if (!r || !r.atoms || !r.atoms.P) continue;
    pAtoms.push(tf(r.atoms.P));
    const n = keyNumber(k);
    if (n <= 76 && typeof k === 'number' && (last3 === null || n > last3)) last3 = n;
  }
  if (last3 === null || last3 < LAST3_MIN) throw new Error(`trnaFrame: no 3' nucleotide with a P atom in ${LAST3_MIN}..76 (found ${last3})`);
  if (pAtoms.length < 10) throw new Error(`trnaFrame: only ${pAtoms.length} P atoms`);
  const z = norm(sub(tf(byKey.get(last3).atoms.P), o));
  const toP = sub(centroid(pAtoms), o);
  const x = norm(sub(toP, scale(z, dot(toP, z))));
  const y = cross(z, x);
  return { o, R: frameFromAxes(x, y, z), last3 };
}

/** Covalent bonds inside one nucleotide, plus P-O3' between consecutive nucleotides. atoms carry `res` (order index) and `name`. */
function l2Bonds(atoms) {
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i], ra = COVALENT[a.element];
    for (let j = i + 1; j < atoms.length; j++) {
      const b = atoms[j], rb = COVALENT[b.element];
      let bonded = false;
      if (a.res === b.res) bonded = dist(a.p, b.p) < ra + rb + 0.45;
      else if (b.res === a.res + 1 && a.name === "O3'" && b.name === 'P') bonded = dist(a.p, b.p) < ra + rb + 0.45;
      if (bonded) bonds.push(i, j);
    }
  }
  return bonds;
}

const CODON_PAIR = { A: 'U', U: 'A', G: 'C', C: 'G' };
const reverseComplement = s => [...s].reverse().map(c => CODON_PAIR[c]).join('');

/** Compact description of the label_seq_id -> standard number map, as ranges. */
function numberingRanges(rows) {
  const runs = [];
  for (const { label, key } of rows) {
    const last = runs[runs.length - 1];
    if (last && typeof key === 'number' && typeof last.lastKey === 'number' && key === last.lastKey + 1 && label === last.lastLabel + 1) { last.lastKey = key; last.lastLabel = label; }
    else runs.push({ firstLabel: label, lastLabel: label, firstKey: key, lastKey: key });
  }
  return runs.map(r => r.firstLabel === r.lastLabel ? `label ${r.firstLabel} = ${r.firstKey}` : `label ${r.firstLabel}-${r.lastLabel} = ${r.firstKey}-${r.lastKey}`).join('; ');
}

function buildTrna(ctx, spec) {
  const parsed = ctx.loadSource('7K00');
  const entry = ctx.lockEntry('7K00');
  const chains = polymerChains(parsed);
  const chain = chains.get(spec.chain);
  if (!chain) throw new Error(`7K00 chain ${spec.chain} not found`);
  const entity = parsed.entities.find(e => e.id === chain.entity);
  if (!entity || !entity.description.toLowerCase().includes(spec.description)) {
    throw new Error(`7K00 chain ${spec.chain}: entity description "${entity && entity.description}" does not contain "${spec.description}"`);
  }
  const numbering = standardNumbering(chain);
  const keyOf = new Map([...numbering].map(([k, r]) => [r, k]));

  // Anticodon identity, checked against the 7K00 mRNA codons (chain X, author numbering).
  const mrna = chains.get('X');
  const codon = [spec.codonAuthStart, spec.codonAuthStart + 1, spec.codonAuthStart + 2].map(n => mrna.residues.find(r => r.authSeq === n));
  if (codon.some(r => !r)) throw new Error(`7K00 chain X: codon residues ${spec.codonAuthStart}..${spec.codonAuthStart + 2} missing`);
  const codonSeq = codon.map(r => r.comp).join('');
  const anticodonSeq = ANTICODON.map(n => { const r = numbering.get(n); if (!r) throw new Error(`chain ${spec.chain}: nucleotide ${n} missing`); return residueBase(r.comp); }).join('');
  if (anticodonSeq !== spec.anticodon) throw new Error(`chain ${spec.chain}: anticodon ${anticodonSeq}, expected ${spec.anticodon}`);
  if (reverseComplement(codonSeq) !== anticodonSeq) throw new Error(`chain ${spec.chain}: anticodon ${anticodonSeq} does not pair with codon ${codonSeq}`);

  // The trna frame in source coordinates.
  const fr = trnaFrame(numbering);
  const A = { o: fr.o, R: fr.R };
  const Rt = transpose(A.R);
  const P = p => invApplyFrame(A, p);
  const last = numbering.get(fr.last3);
  const pSpan = dist(last.atoms.P, fr.o);
  // The 65-80 A acceptance range is recorded, not enforced: 7K00 chain Y measures above it (see notes and docs/assets/trna.md).
  const spanInRange = pSpan >= SPAN_MIN && pSpan <= SPAN_MAX;
  if (!(pSpan > 0 && pSpan < 100)) throw new Error(`${spec.id}: implausible anticodon-to-P(${fr.last3}) distance ${pSpan.toFixed(2)} A`);

  // Parts and chains.
  const isAc = k => ANTICODON.includes(k);
  const chainDefs = [
    { id: spec.chain, part: 'body', class: 'rna', name: `${entity.description} (body)` },
    { id: `${spec.chain}-ac`, part: 'anticodon', class: 'rna', name: `${entity.description} anticodon (nucleotides 34-36)` },
  ];
  const chainOfKey = k => (isAc(k) ? 1 : 0);

  // L1: one P bead per nucleotide, grouped by chain, in numbering order.
  const l1 = [[], []], l1Missing = [];
  for (const [k, r] of numbering) {
    if (!r.atoms.P) { l1Missing.push(k); continue; }
    l1[chainOfKey(k)].push(P(r.atoms.P));
  }
  chainDefs[0].residues = l1[0].length; chainDefs[1].residues = l1[1].length;
  const l1Count = l1[0].length + l1[1].length;
  if (l1Count > L1_MAX_BEADS) throw new Error(`${spec.id}: ${l1Count} L1 beads exceeds ${L1_MAX_BEADS}`);

  // L0: envelope per part from P beads plus C4' and N1/N9 of every nucleotide.
  const envPoints = [[], []];
  for (const [k, r] of numbering) {
    const ci = chainOfKey(k);
    if (r.atoms.P) envPoints[ci].push(...P(r.atoms.P));
    if (r.atoms["C4'"]) envPoints[ci].push(...P(r.atoms["C4'"]));
    const base = residueBase(r.comp);
    const nAtom = base === 'A' || base === 'G' ? 'N9' : 'N1';
    if (r.atoms[nAtom]) envPoints[ci].push(...P(r.atoms[nAtom]));
  }
  const budgets = [3600, 400];
  const l0 = [0, 1].map(ci => {
    // Raise the all-points containment target until >= 95 % of the L1 beads are inside (the P beads are only a third of the points).
    for (let minInside = L0_MIN_INSIDE; minInside <= 0.9951; minInside += 0.005) {
      const env = envelope(envPoints[ci], { sigma: L0_SIGMA, spacing: L0_SPACING, maxTriangles: budgets[ci], minInside });
      const ms = meshStats(env.positions, env.indices);
      if (!ms.closed || ms.signedVolume <= 0) throw new Error(`${spec.id} L0 ${chainDefs[ci].part}: mesh not closed/outward: ${JSON.stringify(ms)}`);
      let inside = 0;
      for (const b of l1[ci]) if (insideMesh(env.positions, env.indices, b)) inside++;
      const contained = inside / l1[ci].length;
      if (contained >= L0_MIN_INSIDE) return { env, ms, contained, minInside: r3(minInside) };
    }
    throw new Error(`${spec.id} L0 ${chainDefs[ci].part}: L1 bead containment below ${L0_MIN_INSIDE} even at all-points target 0.995`);
  });
  const triTotal = l0.reduce((s, m) => s + m.env.indices.length / 3, 0);
  if (triTotal > L0_MAX_TRIANGLES_TOTAL) throw new Error(`${spec.id}: L0 ${triTotal} triangles exceeds ${L0_MAX_TRIANGLES_TOTAL}`);
  const lod0 = {
    parts: l0.map(({ env, contained }, ci) => {
      const nv = env.positions.length / 3;
      return {
        part: chainDefs[ci].part, positions: encodePositions(env.positions),
        indices: encodeArray(Uint16Array.from(env.indices)), indexType: 'u16', vertexCount: nv, triangleCount: env.indices.length / 3,
        sigma: env.sigma, spacing: env.spacing, beadsInside: r3(contained), pointsInsideTarget: l0[ci].minInside,
      };
    }),
  };

  // Anchors (asset frame = trna frame).
  const o3 = last.atoms["O3'"], c3 = last.atoms["C3'"];
  if (!o3 || !c3) throw new Error(`${spec.id}: nucleotide ${fr.last3} lacks O3' or C3'`);
  const accZ = norm(sub(P(o3), P(c3)));
  const ex = [1, 0, 0];                                 // trna +x in the asset frame
  const accX = norm(sub(ex, scale(accZ, dot(ex, accZ))));
  const accY = cross(accZ, accX);
  const elbowAtoms = ELBOW.flatMap(n => { const r = numbering.get(n); if (!r) throw new Error(`${spec.id}: nucleotide ${n} missing`); return Object.values(r.atoms).map(P); });
  const pAll = [...numbering.values()].filter(r => r.atoms.P).map(r => P(r.atoms.P));
  const anchors = {
    center: { o: centroid(pAll).map(r3), R: I3 },
    acceptor: { o: P(o3).map(r3), R: Array.from(frameFromAxes(accX, accY, accZ), r6) },
    elbow: { o: centroid(elbowAtoms).map(r3), R: I3 },
  };

  // Track: anticodon registers 34-36, base frames fitted by Kabsch on the observed atoms (not synthetic).
  const trackFrames = [], observedC1 = [], fitRmsd = [];
  for (const n of ANTICODON) {
    const r = numbering.get(n), f = fitBaseFrame(r.atoms, residueBase(r.comp));
    if (!f.usable) throw new Error(`${spec.id}: base-frame fit for nucleotide ${n} unusable (rmsd ${f.rmsd}, matched ${f.matched})`);
    trackFrames.push(frameOut({ o: P(f.o), R: mulMM(Rt, f.R) }));
    observedC1.push(P(r.atoms["C1'"]).map(r3));
    fitRmsd.push(r6(f.rmsd));
  }
  const tracks = { anticodon: { kind: 'rna', registers: [...ANTICODON], frames: trackFrames, synthetic: [0, 0, 0], bases: anticodonSeq } };

  // L2: whole nucleotides with any atom within L2_RADIUS of the acceptor origin.
  const accO = anchors.acceptor.o;
  const l2Res = [];
  [...numbering].forEach(([k, r], idx) => {
    if (Object.values(r.atoms).some(p => dist(P(p), accO) <= L2_RADIUS)) l2Res.push({ k, r, idx });
  });
  const l2Atoms = [];
  for (const { k, r, idx } of l2Res) {
    for (const [name, p] of Object.entries(r.atoms)) {
      const element = r.el[name];
      if (!ELEMENT_Z[element]) throw new Error(`${spec.id}: unsupported element ${element} (${name} of nucleotide ${k})`);
      l2Atoms.push({ p: P(p), name, element, res: idx, ci: chainOfKey(k) });
    }
  }
  if (l2Atoms.length > L2_MAX_ATOMS) throw new Error(`${spec.id}: L2 ${l2Atoms.length} atoms exceeds ${L2_MAX_ATOMS}`);
  const bonds = l2Bonds(l2Atoms);
  const lod2 = {
    count: l2Atoms.length, positions: encodePositions(l2Atoms.flatMap(a => a.p)),
    element: encodeArray(Uint8Array.from(l2Atoms.map(a => ELEMENT_Z[a.element]))), chain: encodeArray(Uint8Array.from(l2Atoms.map(a => a.ci))),
    bonds: encodeArray(Uint16Array.from(bonds)), bondCount: bonds.length / 2, sites: [{ anchor: 'acceptor', radius: L2_RADIUS }],
  };

  // Bounds: L1 beads and L0 vertices.
  const pts = [...l1[0], ...l1[1]];
  for (const m of l0) for (let i = 0; i < m.env.positions.length; i += 3) pts.push([m.env.positions[i], m.env.positions[i + 1], m.env.positions[i + 2]]);
  const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
  const bc = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
  const bounds = { center: bc.map(r3), radius: r3(Math.max(...pts.map(p => dist(p, bc)))), size: [0, 1, 2].map(k => r3(hi[k] - lo[k])) };

  const mapRows = [...numbering].map(([key, r]) => ({ label: r.seq, key }));
  const modified = [...numbering].filter(([, r]) => !residueBase(r.comp)).map(([k, r]) => `${k} ${r.comp}`);
  const dup = [...numbering.keys()].filter(k => typeof k === 'string');
  const notAdjacent = [];
  const keys = [...numbering.keys()].filter(k => typeof k === 'number');
  for (let n = keys[0]; n <= 76; n++) if (!numbering.has(n)) notAdjacent.push(n);
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: spec.id, name: spec.name, kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: '7K00', url: entry.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: entity.organism, downloaded: entry.downloaded, revisionDate: parsed.revisionDate, sha256: entry.sha256, license: ctx.LICENSE,
      chainsUsed: [`${spec.chain} (${entity.description})`, 'X (mRNA, anticodon-codon identity check only)'],
      trnaFrame: { last3: fr.last3, anticodonToLast3PhosphateA: r3(pSpan), designRangeA: [SPAN_MIN, SPAN_MAX], withinDesignRange: spanInRange },
      anticodonC1prime: { note: "Observed C1' atoms of nucleotides 34, 35, 36 in the asset frame (test reference)", positions: observedC1, baseFitRmsdA: fitRmsd },
      notes: [
        'Generated by tools/build-assets.mjs (recipe tools/assets/trna.mjs) from the mmCIF file pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens, waters excluded).',
        `Chain ${spec.chain}: ${chain.residues.length} modelled nucleotides. Standard numbering = author number; a repeated author number gets the suffix A on its second residue (${dup.length ? dup.join(', ') : 'none in this chain'}). label_seq_id -> standard number: ${numberingRanges(mapRows)}.`,
        notAdjacent.length ? `Numbers not modelled (between ${keys[0]} and 76): ${notAdjacent.join(', ')}.` : `All numbers ${keys[0]}-76 are modelled.`,
        modified.length ? `Modified nucleotides kept in L1 and L2 but not fitted: ${modified.join(', ')}.` : 'No modified nucleotides: every residue of this chain is A, C, G or U in the entry.',
        `Anticodon 34-36 = ${anticodonSeq} (5' to 3'), pairs with mRNA codon ${codonSeq} (7K00 chain X author ${spec.codonAuthStart}-${spec.codonAuthStart + 2}).`,
        `trna frame (PLAN.md 7.3): origin = centroid of C1' of nucleotides 34-36; +z toward the P atom of nucleotide ${fr.last3}; +x = component of (centroid of all P atoms - origin) perpendicular to z; +y = z x x. Implemented by trnaFrame() in tools/assets/trna.mjs.`,
        `L0: one envelope per part (Gaussian density, sigma ${L0_SIGMA} A, requested spacing ${L0_SPACING} A, actual spacing ${lod0.parts.map(m => `${m.part} ${m.spacing}`).join(', ')} A) of P atoms plus C4' and N9 (purine) or N1 (pyrimidine) of every nucleotide; L1 beads inside: ${lod0.parts.map(m => `${m.part} ${m.beadsInside}`).join(', ')} (all-points containment target raised from 0.95 until L1 beads reached 0.95: ${lod0.parts.map(m => `${m.part} ${m.pointsInsideTarget}`).join(', ')}).`,
        l1Missing.length ? `L1: one P bead per nucleotide; nucleotide(s) ${l1Missing.join(', ')} have no P atom in the entry (5' end) and have no bead.` : 'L1: one P bead per nucleotide.',
        `L2 site acceptor (${L2_RADIUS} A): heavy atoms of whole nucleotides with any atom within ${L2_RADIUS} A of the acceptor anchor origin (O3' of nucleotide ${fr.last3}); nucleotides ${l2Res.map(m => m.k).join(', ')}.`,
        "acceptor anchor: o = O3' of the 3' nucleotide; z = unit(O3' - C3'); x = component of the trna +x perpendicular to z. elbow anchor: o = centroid of all heavy atoms of nucleotides 18, 19, 55, 56. center anchor: centroid of all P atoms. Rotations of center and elbow are the identity.",
        `Span check: anticodon origin to P of nucleotide ${fr.last3} = ${r3(pSpan).toFixed(3)} A; PLAN.md 7.4 acceptance range ${SPAN_MIN}-${SPAN_MAX} A: ${spanInRange ? 'met' : 'NOT met (value recorded as measured, not adjusted)'}.`,
        'Track anticodon: Kabsch-fitted standard base frames (tools/lib/frames.mjs) on 34-36, none synthetic. source.anticodonC1prime holds the observed C1\' positions for tests.',
      ],
    },
    bounds,
    parts: [{ id: 'body', name: 'tRNA body', role: 'body' }, { id: 'anticodon', name: 'Anticodon (nucleotides 34-36)', role: 'replaceable' }],
    chains: chainDefs,
    lod0,
    lod1: {
      count: l1Count, positions: encodePositions([...l1[0], ...l1[1]].flat()),
      chain: encodeArray(Uint8Array.from([...l1[0].map(() => 0), ...l1[1].map(() => 1)])), kind: encodeArray(Uint8Array.from(Array(l1Count).fill(1))),
    },
    lod2, anchors, tracks,
  };
  const problems = validateAsset(asset);
  if (problems.length) throw new Error(`${spec.id} invalid:\n` + problems.join('\n'));
  const bytes = Buffer.byteLength(JSON.stringify(asset));
  if (bytes > MAX_FILE_BYTES) throw new Error(`${spec.id}: ${bytes} bytes exceeds ${MAX_FILE_BYTES}`);

  const report = {
    pdbId: '7K00', chain: spec.chain, nucleotides: chain.residues.length, last3: fr.last3, anticodon: anticodonSeq, codon: codonSeq,
    anticodonToP76A: r3(pSpan), spanWithinDesignRange: spanInRange, l1Beads: l1Count, l0: lod0.parts.map(m => ({ part: m.part, triangles: m.triangleCount, vertices: m.vertexCount, sigma: m.sigma, spacing: m.spacing, beadsInside: m.beadsInside, pointsInsideTarget: m.pointsInsideTarget })),
    l0TrianglesTotal: triTotal, l2Atoms: l2Atoms.length, l2Bonds: bonds.length / 2, l2Nucleotides: l2Res.map(m => m.k), fileBytes: bytes,
    modified, insertionKeys: dup, bounds, baseFitRmsdA: fitRmsd,
  };
  return { asset, report };
}

export const recipes = [
  { id: 'trna-init', sources: ['7K00'], build: ctx => buildTrna(ctx, { id: 'trna-init', chain: 'Z', description: 'p-site trna-fmet', anticodon: 'CAU', codonAuthStart: 16, name: 'E. coli initiator tRNA-fMet (7K00 chain Z, P site)' }) },
  { id: 'trna-aa', sources: ['7K00'], build: ctx => buildTrna(ctx, { id: 'trna-aa', chain: 'Y', description: 'a-site trna-val', anticodon: 'UAC', codonAuthStart: 19, name: 'E. coli elongator tRNA-Val (7K00 chain Y, A site)' }) },
];
