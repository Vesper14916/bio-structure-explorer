// Atomic model of DNA as an assembly of rigid nucleotides.
// Every nucleotide carries its atoms in its own standard base reference frame ("local"
// coordinates, Å) plus a rigid frame placing it in the world. Animations move frames and
// call assembly.updatePositions(); covalent links between nucleotides and Watson-Crick
// pairs are explicit objects that can be switched on/off (strand separation, synthesis).
import { BASE_ATOMS, BASE_BONDS, BACKBONE_BONDS, COMPLEMENT, WC_HBONDS } from './bases.js';
import { BACKBONE, HELIX_B, CRYSTAL_1BNA } from './templates.js';
import { applyFrame, invApplyFrame, helixFrame, partnerFrame, kabsch, dist } from './math.js';

export const ELEMENTS = ['C', 'N', 'O', 'P'];
export const PARTS = ['base', 'sugar', 'phosphate'];
const BB_ORDER = ['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'"];
const BB_ELEMENT = n => (n === 'P' ? 'P' : n[0]);
const partOf = n => (['P', 'OP1', 'OP2', "O5'"].includes(n) ? 2 : n.includes("'") ? 1 : 0);

const tplCache = {};
/** Ideal B-DNA nucleotide (5'-phosphate, deoxyribose, base) in its base frame. */
export function nucleotideTemplate(base) {
  if (tplCache[base]) return tplCache[base];
  const names = [], el = [], xyz = [];
  for (const n of BB_ORDER) { names.push(n); el.push(BB_ELEMENT(n)); xyz.push(...BACKBONE[n]); }
  for (const [n, e, x, y] of BASE_ATOMS[base]) { names.push(n); el.push(e); xyz.push(x, y, 0); }
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  const bonds = [...BACKBONE_BONDS, ...BASE_BONDS[base]].map(([a, b]) => [index[a], index[b]]);
  return (tplCache[base] = { base, names, el, part: names.map(partOf), local: Float32Array.from(xyz), bonds, index });
}

export class Assembly {
  constructor() {
    this.nucleotides = []; this.links = []; this.pairs = []; this.strands = [];
    this.waters = null; this.meta = {};
  }
  /** Add a nucleotide. spec: { base, strand, frame, names?, el?, local?, bonds?, bfactor? } */
  addNucleotide(spec) {
    const t = nucleotideTemplate(spec.base);
    const names = spec.names || t.names;
    const n = {
      id: this.nucleotides.length, base: spec.base, strand: spec.strand, index: 0,
      frame: spec.frame, names, el: spec.el || t.el, part: names.map(partOf),
      local: spec.local || t.local, localBonds: spec.bonds || t.bonds,
      atomIndex: Object.fromEntries(names.map((nm, i) => [nm, i])),
      bfactor: spec.bfactor || null, atomStart: 0, atomCount: names.length,
      visible: true, opacity: 1, pair: -1, tag: spec.tag || '',
    };
    (this.strands[n.strand] ||= []).push(n.id);
    n.index = this.strands[n.strand].length - 1;
    this.nucleotides.push(n);
    return n;
  }
  /** Phosphodiester bond O3'(from) -> P(to); `from` is the 5' neighbour. */
  addLink(from, to, active = true) {
    const l = { id: this.links.length, from: from.id, to: to.id, active };
    this.links.push(l); return l;
  }
  /** Watson-Crick pair between two nucleotides (bases must be complementary). */
  addPair(a, b, strength = 1) {
    const type = a.base + b.base;
    if (!WC_HBONDS[type]) throw new Error(`not a Watson-Crick pair: ${type}`);
    const p = { id: this.pairs.length, a: a.id, b: b.id, type, strength, hbonds: WC_HBONDS[type].map(([x, y, d]) => ({ an: x, bn: y, donor: d })) };
    a.pair = b.pair = p.id; this.pairs.push(p); return p;
  }
  /** Freeze topology: allocate flat typed arrays. Call once after adding everything. */
  finalize() {
    let count = 0;
    for (const n of this.nucleotides) { n.atomStart = count; count += n.atomCount; }
    const A = this.atoms = {
      count, pos: new Float32Array(count * 3), el: new Uint8Array(count), part: new Uint8Array(count),
      nuc: new Uint16Array(count), bfactor: new Float32Array(count), names: new Array(count),
    };
    const bonds = [];
    for (const n of this.nucleotides) {
      for (let i = 0; i < n.atomCount; i++) {
        const g = n.atomStart + i;
        A.el[g] = ELEMENTS.indexOf(n.el[i]); A.part[g] = n.part[i]; A.nuc[g] = n.id; A.names[g] = n.names[i];
        A.bfactor[g] = n.bfactor ? n.bfactor[i] : 0;
      }
      for (const [i, j] of n.localBonds) bonds.push(n.atomStart + i, n.atomStart + j);
    }
    this.bonds = Uint32Array.from(bonds);
    for (const l of this.links) {
      l.a = this.atomOf(l.from, "O3'"); l.b = this.atomOf(l.to, 'P');
    }
    for (const p of this.pairs) for (const h of p.hbonds) {
      h.a = this.atomOf(p.a, h.an); h.b = this.atomOf(p.b, h.bn);
    }
    this.updatePositions();
    return this;
  }
  /** Global atom index of a named atom in a nucleotide (-1 if absent). */
  atomOf(nucId, name) {
    const n = this.nucleotides[nucId], i = n.atomIndex[name];
    return i === undefined ? -1 : n.atomStart + i;
  }
  /** World position of a global atom index as [x, y, z]. */
  position(i) { const p = this.atoms.pos; return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]; }
  /** Recompute world coordinates of all atoms (or of the given nucleotides) from frames. */
  updatePositions(nucs = this.nucleotides) {
    const pos = this.atoms.pos;
    for (const n of nucs) {
      const { o, R } = n.frame, L = n.local;
      for (let i = 0, g = n.atomStart * 3; i < n.atomCount; i++, g += 3) {
        const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
        pos[g] = R[0] * x + R[1] * y + R[2] * z + o[0];
        pos[g + 1] = R[3] * x + R[4] * y + R[5] * z + o[1];
        pos[g + 2] = R[6] * x + R[7] * y + R[8] * z + o[2];
      }
    }
  }
  /** Current donor...acceptor distance (Å) of every hydrogen bond of a pair. */
  hbondLengths(pair) { return pair.hbonds.map(h => dist(this.position(h.a), this.position(h.b))); }
}

export const cleanSequence = s => (s || '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
export const complement = s => [...s].map(b => COMPLEMENT[b]).join('');
export const reverseComplement = s => [...complement(s)].reverse().join('');

/** Base-pair frame k (0-based) of an ideal B helix of n pairs, centred on the origin, axis +z. */
export function idealPairFrame(k, n, helix = HELIX_B) {
  const f = helixFrame(k, helix.rise, helix.twistDeg);
  f.o[2] -= ((n - 1) * helix.rise) / 2;
  return f;
}

/**
 * Ideal B-DNA duplex. `sequence` is strand I written 5'->3' (it runs toward +z);
 * strand II is its reverse complement and runs toward -z (antiparallel).
 * Nucleotide ids: strand I pair k -> id 2k, its strand-II partner -> id 2k+1.
 */
export function buildDuplex(sequence, helix = HELIX_B) {
  const seq = cleanSequence(sequence), n = seq.length, asm = new Assembly();
  const I = [], II = [];
  for (let k = 0; k < n; k++) {
    const f = idealPairFrame(k, n, helix);
    I.push(asm.addNucleotide({ base: seq[k], strand: 0, frame: f }));
    II.push(asm.addNucleotide({ base: COMPLEMENT[seq[k]], strand: 1, frame: partnerFrame(f) }));
    asm.addPair(I[k], II[k]);
  }
  asm.strands[1].reverse();                      // store strand II 5'->3'
  II.forEach((nuc, k) => (nuc.index = n - 1 - k));
  for (let k = 0; k + 1 < n; k++) { asm.addLink(I[k], I[k + 1]); asm.addLink(II[k + 1], II[k]); }
  asm.meta = { kind: 'ideal', sequence: seq, length: n, helix, axis: [[0, 0, -(n - 1) * helix.rise / 2], [0, 0, (n - 1) * helix.rise / 2]] };
  return asm.finalize();
}

/** The experimental 1BNA crystal structure (Dickerson dodecamer) as an Assembly, with waters. */
export function buildCrystal() {
  const asm = new Assembly(), chains = CRYSTAL_1BNA.chains, made = [];
  chains.forEach((chain, s) => {
    made[s] = chain.map(res => {
      const names = res.atoms.map(a => a[0]), el = res.atoms.map(a => a[1]);
      const world = res.atoms.map(a => [a[2], a[3], a[4]]);
      const std = BASE_ATOMS[res.base].filter(a => a[0] !== "C1'");
      const frame = kabsch(std.map(a => [a[2], a[3], 0]), std.map(a => world[names.indexOf(a[0])]));
      const local = Float32Array.from(world.flatMap(p => invApplyFrame(frame, p)));
      const idx = Object.fromEntries(names.map((nm, i) => [nm, i]));
      const bonds = [...BACKBONE_BONDS, ...BASE_BONDS[res.base]].filter(([a, b]) => a in idx && b in idx).map(([a, b]) => [idx[a], idx[b]]);
      return asm.addNucleotide({ base: res.base, strand: s, frame, names, el, local, bonds, bfactor: res.atoms.map(a => a[5]) });
    });
    for (let i = 0; i + 1 < made[s].length; i++) asm.addLink(made[s][i], made[s][i + 1]);
  });
  const n = made[0].length;
  for (let k = 0; k < n; k++) asm.addPair(made[0][k], made[1][n - 1 - k]);
  asm.waters = { count: CRYSTAL_1BNA.waters.length, pos: Float32Array.from(CRYSTAL_1BNA.waters.flatMap(w => w.slice(0, 3))), bfactor: Float32Array.from(CRYSTAL_1BNA.waters.map(w => w[3])) };
  asm.meta = { kind: 'crystal', id: '1BNA', title: CRYSTAL_1BNA.title, resolution: CRYSTAL_1BNA.resolution, sequence: chains[0].map(r => r.base).join(''), length: n };
  return asm.finalize();
}

/**
 * Geometric read-out of a duplex Assembly (works for ideal and crystal structures).
 * Groove widths follow the usual convention: shortest cross-strand P...P distance
 * minus 5.8 Å (two phosphate-group radii).
 */
export function measureDuplex(asm) {
  const P = s => asm.strands[s].map(id => asm.atomOf(id, 'P')).map(i => (i < 0 ? null : asm.position(i)));
  const p0 = P(0), p1 = P(1), n = p0.length;
  const hb = asm.pairs.flatMap(p => asm.hbondLengths(p));
  const radius = [...p0, ...p1].filter(Boolean).map(p => Math.hypot(p[0], p[1]));
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  // Strand-I residue i pairs with strand-II residue (5'->3' index) n-1-i. With off = (pair
  // index of the strand-II phosphate) - i, the closest phosphates across the minor groove sit
  // near off = -4 and across the major groove near off = +3.
  const widths = { minor: [], major: [] };
  for (let i = 0; i < n; i++) {
    if (!p0[i]) continue;
    const scan = (lo, hi) => {
      if (i + lo < 0 || i + hi > n - 1) return null;       // need the whole window inside the duplex
      let m = Infinity;
      for (let off = lo; off <= hi; off++) { const q = p1[n - 1 - (i + off)]; if (q) m = Math.min(m, dist(p0[i], q)); }
      return m - 5.8;
    };
    const mi = scan(-6, -2), ma = scan(1, 5);
    if (mi !== null) widths.minor.push(mi);
    if (ma !== null) widths.major.push(ma);
  }
  const helix = asm.meta.helix;
  return {
    basePairs: n,
    phosphateRadius: mean(radius), diameter: 2 * (mean(radius) + 1.5),
    minorGrooveWidth: widths.minor.length ? mean(widths.minor) : NaN,
    majorGrooveWidth: widths.major.length ? mean(widths.major) : NaN,
    hbondMean: mean(hb), hbondMin: Math.min(...hb), hbondMax: Math.max(...hb),
    rise: helix ? helix.rise : NaN, twistDeg: helix ? helix.twistDeg : NaN,
    pitch: helix ? helix.rise * 360 / helix.twistDeg : NaN,
    length: helix ? (n - 1) * helix.rise : NaN,
  };
}
