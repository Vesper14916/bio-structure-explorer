// Recipe module for the E. coli 70S ribosome asset (Round 3, task R3-A1, ST2 step 2):
//   - ribosome-70s (PDB 7K00 primary; 7ST2, 5WE4 and 7PJV superposed onto 7K00)
// Builds the `ribo` frame, chain table, parts, L0/L1/L2 (sites `decoding`, `ptc`), superpositions, the `mrna` track,
// all anchors, and the `tunnel` path (step 3).
// Also exports `frameAtoms(sourcesDir)`: every 7K00 polymer heavy atom in the `ribo` frame (for tasks A3 and A4).
// Design: docs/tasks/R3-ST2-design.md section 5; provenance and measurements: docs/assets/ribosome-70s.md.
import fs from 'node:fs';
import path from 'node:path';
import { ASSET_FORMAT, ASSET_VERSION, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../../js/assets/format.js';
import { dist, mulMM, mulMV, cross, dot, norm, sub, add, scale, rotZ, DEG } from '../../js/science/math.js';
import { parseMmcif, polymerChains } from '../lib/mmcif.mjs';
import { fitBaseFrame, residueBase } from '../lib/frames.mjs';
import { envelope, meshStats } from '../lib/surface.mjs';
import { superposeIterative } from '../lib/superpose.mjs';
import { trnaFrame, standardNumbering } from './trna.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15, S: 16, MG: 12 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07 };
const BOND_TOL = 0.45;
const PAIR_MAX_ORIGIN = 2.5;                 // A, codon-anticodon base pairing rule (as for the RNAP pair rule)
const SUPERPOSE_GATE = 1.5;                  // A (PLAN.md 7.3)
const E_SITE_GATE = 3.0;                     // A, 75-76 heavy-atom RMSD (PLAN.md R3-A1 acceptance)
const HYBRID_MAX_ORIGIN = 4.0;               // A, siteAP / sitePE condition (PLAN.md 7.4)
const L0 = { sigma: 5, spacing: 4, maxTrianglesPerPart: 30000, minInside: 0.95 };
const L2_SITE_RADIUS = 12, L2_ION_RADIUS = 8;
const LIMITS = { l0Triangles: 70000, l1Beads: 15000, l2Atoms: 4000, fileBytes: 1200000 };
const MRNA_RANGE = [-16, 15];
const A_FORM_RISE = 2.81, A_FORM_TWIST = 32.73;

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });
const transpose = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const frameFromAxes = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;
const col = (R, k) => [R[k], R[3 + k], R[6 + k]];
const COMPLEMENT = { A: 'U', U: 'A', G: 'C', C: 'G' };

/** Frame whose +z is `z` and whose +x is the component of `ref` (default +x of the ribo frame) perpendicular to z (PLAN.md 7.4 rule). */
function axisFrame(o, z, refs = [[1, 0, 0], [0, 1, 0]]) {
  let ref = refs[0];
  if (angleDeg(z, ref) < 10 || angleDeg(z, ref) > 170) ref = refs[1];     // z within 10 degrees of +-x: use +y
  const x = norm(sub(ref, scale(z, dot(ref, z))));
  return { o, R: frameFromAxes(x, cross(z, x), z) };
}

// ---------------------------------------------------------------------------------------------------------------
// Rigid transforms. A transform is { R, o } with p' = R p + o.
const ptOf = T => p => add(mulMV(T.R, p), T.o);
const frameOf = T => f => ({ o: add(mulMV(T.R, f.o), T.o), R: mulMM(T.R, f.R) });

/** Transform from source coordinates into the ribo frame, given the ribo frame A (columns = axes) and a superposition (or null for 7K00). */
function toRibo(A, sup) {
  const At = transpose(A.R);
  const R = sup ? mulMM(At, sup.R) : At;
  const o = mulMV(At, sub(sup ? sup.o : [0, 0, 0], A.o));
  return { R, o };
}

// ---------------------------------------------------------------------------------------------------------------
// Chains and classification.
const CLASSES = [
  { re: /^16S/i, klass: 'rna', part: 'small', subunit: 'rRNA16S' },
  { re: /^30S ribosomal protein/i, klass: 'protein', part: 'small', subunit: 'rprotein30S' },
  { re: /^23S/i, klass: 'rna', part: 'large', subunit: 'rRNA23S' },
  { re: /^5S/i, klass: 'rna', part: 'large', subunit: 'rRNA5S' },
  { re: /^50S ribosomal protein/i, klass: 'protein', part: 'large', subunit: 'rprotein50S' },
];
const PARTS = [
  { id: 'small', name: '30S subunit (16S rRNA, S proteins)', role: 'body' },
  { id: 'large', name: '50S subunit (23S and 5S rRNA, L proteins)', role: 'body' },
];

function entityMap(parsed) { return new Map(parsed.entities.map(e => [e.id, e])); }

/** Chain table of 7K00: ribosomal chains in file order with part and subunit tag; excluded chains (mRNA, tRNA) listed separately. */
function inventory7K00(parsed, chains) {
  const ent = entityMap(parsed);
  const rows = [], excluded = [];
  for (const c of chains.values()) {
    const e = ent.get(c.entity);
    const cls = CLASSES.find(k => k.klass === e.class && k.re.test(e.description));
    if (cls) rows.push({ id: c.id, entity: e.id, description: e.description, class: e.class, part: cls.part, subunit: cls.subunit, chain: c, organism: e.organism });
    else if (/mRNA|tRNA/i.test(e.description)) excluded.push({ id: c.id, entity: e.id, description: e.description, class: e.class, residues: c.residues.length, chain: c });
    else throw new Error(`7K00 chain ${c.id}: unclassified polymer "${e.description}"`);
  }
  rows.sort((p, q) => (p.part === q.part ? 0 : p.part === 'small' ? -1 : 1));        // stable: small first, file order inside a part
  return { rows, excluded };
}

// ---------------------------------------------------------------------------------------------------------------
// Base fits and codon-anticodon pairing.
function fitRes(r) {
  const base = residueBase(r.comp);
  if (!base) return null;
  const f = fitBaseFrame(r.atoms, base);
  return f.usable ? { o: f.o, R: f.R, base, rmsd: f.rmsd } : null;
}

/** Watson-Crick test of a codon (3 mRNA residues, 5' to 3') against anticodon nucleotides 36, 35, 34 of a standard-numbered tRNA. */
function pairCodon(codon, numbering) {
  const anti = [36, 35, 34].map(n => numbering.get(n));
  if (anti.some(r => !r)) return null;
  const positions = [];
  for (let i = 0; i < 3; i++) {
    const cf = fitRes(codon[i]), af = fitRes(anti[i]);
    if (!cf || !af) return null;
    const zc = col(cf.R, 2), za = col(af.R, 2);
    const d = dist(cf.o, af.o), ang = angleDeg(zc, scale(za, -1));
    const complementary = COMPLEMENT[cf.base] === af.base;
    positions.push({
      position: i + 1, mrnaAuthSeq: codon[i].authSeq, mrnaBase: cf.base, trnaNumber: 36 - i, trnaBase: af.base, complementary,
      originDistanceA: r3(d), normalAngleDeg: r3(ang), antiparallel: dot(zc, za) < 0,
      ok: complementary && d <= PAIR_MAX_ORIGIN && dot(zc, za) < 0,
    });
  }
  return { codon: codon.map(r => residueBase(r.comp)).join(''), anticodon: [...anti].reverse().map(r => residueBase(r.comp)).join(''), positions, ok: positions.every(p => p.ok) };
}

function triplets(mrna) {
  const out = [];
  for (let i = 0; i + 2 < mrna.residues.length; i++) {
    const t = mrna.residues.slice(i, i + 3);
    if (t[1].authSeq === t[0].authSeq + 1 && t[2].authSeq === t[0].authSeq + 2) out.push(t);
  }
  return out;
}

/** All (tRNA chain, codon start) pairs that pair in the structure's own coordinates. */
function findPairings(mrna, trnas) {
  const found = [];
  for (const t of trnas) {
    const numbering = standardNumbering(t);
    for (const codon of triplets(mrna)) {
      const p = pairCodon(codon, numbering);
      if (p && p.ok) found.push({ trna: t.id, start: codon[0].authSeq, pairing: p });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// 7K00 analysis shared by the recipe and frameAtoms: classification, P/A-site tRNAs, ribo frame.
function analyse7K00(parsed) {
  const chains = polymerChains(parsed);
  const inv = inventory7K00(parsed, chains);
  const mrna = chains.get('X');
  const ent = entityMap(parsed);
  if (!mrna || !/mRNA/i.test(ent.get(mrna.entity).description)) throw new Error('7K00 chain X is not the mRNA');
  const trnas = inv.excluded.filter(e => /tRNA/i.test(e.description) && e.residues >= 70).map(e => e.chain);
  const pairings = findPairings(mrna, trnas);
  // P-site codon: a codon paired with one tRNA whose next codon (+3) is paired with another tRNA (A site).
  const adjacent = [];
  for (const p of pairings) {
    const a = pairings.find(q => q.start === p.start + 3 && q.trna !== p.trna);
    if (a) adjacent.push({ P: p, A: a });
  }
  if (adjacent.length !== 1) throw new Error(`7K00: expected exactly one adjacent P/A codon-anticodon pair, found ${adjacent.length}: ${JSON.stringify(pairings.map(p => [p.trna, p.start]))}`);
  const { P: pSite, A: aSite } = adjacent[0];
  const c1 = start => centroid([0, 1, 2].map(i => {
    const r = mrna.residues.find(x => x.authSeq === start + i);
    if (!r.atoms["C1'"]) throw new Error(`7K00 mRNA ${start + i}: no C1'`);
    return r.atoms["C1'"];
  }));
  const o = c1(pSite.start), toA = sub(c1(aSite.start), o);
  const z = norm(toA);
  const rna23 = inv.rows.find(r => r.subunit === 'rRNA23S').chain;
  const pAll = rna23.residues.filter(r => r.atoms.P).map(r => r.atoms.P);
  const toLarge = sub(centroid(pAll), o);
  const x = norm(sub(toLarge, scale(z, dot(toLarge, z))));
  const A = { o, R: frameFromAxes(x, cross(z, x), z) };
  return { chains, inv, mrna, trnas, pairings, pSite, aSite, A, rna23P: pAll.length };
}

/**
 * Every 7K00 polymer heavy atom (rRNA, proteins, mRNA, tRNA; no ligands, ions or waters) in the `ribo` frame, for tasks A3 and A4.
 * Parses `<sourcesDir>/7K00.cif` itself (no build context). Deterministic: atoms in file order.
 * @returns {{ frame: { o: number[], R: number[] }, atoms: Array<{ chain: string, labelSeq: number, authSeq: number, comp: string, name: string, element: string, x: number, y: number, z: number }> }}
 */
export function frameAtoms(sourcesDir) {
  const parsed = parseMmcif(fs.readFileSync(path.join(sourcesDir, '7K00.cif'), 'utf8'));
  const { A } = analyse7K00(parsed);
  const T = ptOf(toRibo(A, null));
  const polymer = new Set(parsed.entities.filter(e => e.class).map(e => e.id));
  const atoms = [];
  for (const a of parsed.atoms) {
    if (!polymer.has(a.entity) || a.labelSeq === null) continue;
    const [x, y, z] = T([a.x, a.y, a.z]);
    atoms.push({ chain: a.authAsym, labelSeq: a.labelSeq, authSeq: a.authSeq, comp: a.comp, name: a.name, element: a.element, x, y, z });
  }
  return { frame: { o: A.o.slice(), R: Array.from(A.R) }, atoms };
}

// ---------------------------------------------------------------------------------------------------------------
// Superposition of another entry onto 7K00 on rRNA P atoms matched by AUTHOR number and residue name.
function matchP(mobileChain, refChain) {
  const refBy = new Map();
  for (const r of refChain.residues) if (r.atoms.P && !refBy.has(r.authSeq)) refBy.set(r.authSeq, r);
  const mobile = [], target = [];
  let nameMismatch = 0, unmatched = 0;
  for (const r of mobileChain.residues) {
    if (!r.atoms.P) continue;
    const q = refBy.get(r.authSeq);
    if (!q) { unmatched++; continue; }
    if (q.comp !== r.comp) { nameMismatch++; continue; }
    mobile.push(r.atoms.P); target.push(q.atoms.P);
  }
  return { mobile, target, nameMismatch, unmatched };
}

const SCOPES = { '16S+23S': ['s16', 's23'], '23S': ['s23'], '16S': ['s16'] };

function fitEntry(label, mob, ref, scope, role) {
  const mobile = [], target = [];
  let nameMismatch = 0, unmatched = 0;
  const perChain = {};
  for (const k of SCOPES[scope]) {
    const m = matchP(mob[k], ref[k]);
    mobile.push(...m.mobile); target.push(...m.target); nameMismatch += m.nameMismatch; unmatched += m.unmatched;
    perChain[k === 's16' ? '16S' : '23S'] = m.mobile.length;
  }
  const res = superposeIterative(mobile, target, { cutoff: 2.0, passes: 2 });
  const sup = { R: res.R, o: res.t };
  const record = {
    mobile: label, reference: '7K00', role, scope,
    mobileChains: SCOPES[scope].map(k => mob[k].id), referenceChains: SCOPES[scope].map(k => ref[k].id),
    matching: 'P atoms of rRNA residues with equal author number (auth_seq_id) and equal residue name',
    matchedPerChain: perChain, nBefore: res.nBefore, nAfter: res.n, keptFraction: r3(res.n / res.nBefore),
    rmsdBeforeA: r3(res.rmsdBefore), rmsdAfterA: r3(res.rmsd), nameMismatchesExcluded: nameMismatch, unmatchedByNumber: unmatched,
    cutoffA: 2.0, passes: 2, gateRmsdA: SUPERPOSE_GATE, passesGate: res.rmsd <= SUPERPOSE_GATE,
  };
  return { sup, record };
}

function rrnaChains(parsed, chains, expected, pdbId) {
  const ent = entityMap(parsed);
  const pick = re => {
    const m = [...chains.values()].filter(c => ent.get(c.entity).class === 'rna' && re.test(ent.get(c.entity).description));
    if (m.length !== 1) throw new Error(`${pdbId}: expected one chain for ${re}, found ${m.map(c => c.id)}`);
    return m[0];
  };
  const s16 = pick(/^16S/i), s23 = pick(/^23S/i);
  if (s16.id !== expected[0] || s23.id !== expected[1]) throw new Error(`${pdbId}: 16S/23S chains are ${s16.id}/${s23.id}, expected ${expected.join('/')}`);
  return { s16, s23 };
}

/** The tRNA chains of an entry (RNA chains whose description contains tRNA and with at least 70 residues). */
function trnaChainsOf(parsed, chains) {
  const ent = entityMap(parsed);
  return [...chains.values()].filter(c => ent.get(c.entity).class === 'rna' && /tRNA/i.test(ent.get(c.entity).description) && c.residues.length >= 70);
}

// ---------------------------------------------------------------------------------------------------------------
// L2 builder: heavy atoms of whole residues with any atom within `radius` of any site origin (deduplicated across sites),
// plus Mg2+ within L2_ION_RADIUS of any site origin. `sites` = [{ anchor, radius }], origins from `anchors` (ribo frame).
function buildL2(parsed, rows, T0, sites, anchors) {
  const chainIndex = new Map(rows.map((r, i) => [r.id, i]));
  const tf = ptOf(T0);
  const poly = [];
  for (const a of parsed.atoms) {
    const ci = chainIndex.get(a.authAsym);
    if (ci === undefined || a.labelSeq === null) continue;
    poly.push({ ci, seq: a.labelSeq, name: a.name, element: a.element, p: tf([a.x, a.y, a.z]) });
  }
  const origins = sites.map(s => anchors[s.anchor].o);
  const key = a => a.ci * 100000 + a.seq;
  const near = new Set();
  poly.forEach(a => sites.forEach((s, k) => { if (dist(a.p, origins[k]) <= s.radius) near.add(key(a)); }));
  const atoms = poly.filter(a => near.has(key(a)));
  atoms.sort((p, q) => p.ci - q.ci || p.seq - q.seq);                       // stable: file order inside a residue
  for (const a of atoms) if (!ELEMENT_Z[a.element]) throw new Error(`L2: no atomic number for element ${a.element}`);

  const bonds = [];
  const byRes = new Map();
  atoms.forEach((a, i) => { const k = key(a); if (!byRes.has(k)) byRes.set(k, []); byRes.get(k).push(i); });
  const bonded = (i, j) => {
    const ra = COVALENT[atoms[i].element], rb = COVALENT[atoms[j].element];
    return ra !== undefined && rb !== undefined && dist(atoms[i].p, atoms[j].p) < ra + rb + BOND_TOL;
  };
  for (const [k, idx] of byRes) {
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) if (bonded(idx[a], idx[b])) bonds.push(idx[a], idx[b]);
    const next = byRes.get(k + 1);                                          // consecutive residue, same chain
    if (!next) continue;
    for (const i of idx) for (const j of next) {
      const ni = atoms[i].name, nj = atoms[j].name;
      if (((ni === 'C' && nj === 'N') || (ni === "O3'" && nj === 'P')) && bonded(i, j)) bonds.push(i, j);   // peptide C-N, phosphodiester O3'-P
    }
  }

  const ions = parsed.atoms.filter(a => a.comp === 'MG' && a.labelSeq === null)
    .map(a => ({ a, p: tf([a.x, a.y, a.z]) }))
    .filter(m => origins.some(o => dist(m.p, o) <= L2_ION_RADIUS));
  const ionAtoms = ions.map(({ a, p }) => {
    let best = null, bd = Infinity;
    for (const q of poly) { const d = dist(p, q.p); if (d < bd) { bd = d; best = q; } }
    return { ci: best.ci, seq: 0, name: a.name, element: a.element, p, nearestPolymerA: bd };
  });
  const all = [...atoms, ...ionAtoms];
  const residues = new Set(near).size;
  return { all, nPolymer: atoms.length, nIons: ionAtoms.length, bonds, residues, ionNearest: ionAtoms.map(i => r3(i.nearestPolymerA)) };
}

// ---------------------------------------------------------------------------------------------------------------
// This function returns the 7K00 50S heavy atoms (23S, 5S, L proteins; no ions or waters)
// in the ribo frame. The tunnel search voxelises around `ptc` using exactly this list.
function largeSubunitAtoms(parsed, rows, T0) {
  const tf = ptOf(T0);
  const large = new Set(rows.filter(r => r.part === 'large').map(r => r.id));
  const out = [];
  for (const a of parsed.atoms) if (large.has(a.authAsym) && a.labelSeq !== null) out.push(tf([a.x, a.y, a.z]));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Exit tunnel (design 5.6; PLAN.md 7.4, 13). Deterministic: no randomness, ties broken by voxel index.
const TUNNEL = { cube: 140, voxel: 1.0, blockA: 3.0, clearCap: 10, rays: 162, solventClear: [8, 6, 4], targetRadius: 30, startOffsetA: 5,
  lengthMin: 75, lengthMax: 110, mouthMinArcA: 60, minClearA: 3.0, skipA: 6, chaikin: 3, step: 1.0 };

/** Exact nearest-atom-centre distance via a cell list (cell 6 A; rings of cells grow until the nearest hit is certain). */
function makeNearest(atoms) {
  const cell = 6, map = new Map();
  const key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  atoms.forEach((p, n) => { const kk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)); if (!map.has(kk)) map.set(kk, []); map.get(kk).push(n); });
  return (q, maxR = 80) => {
    const ci = Math.floor(q[0] / cell), cj = Math.floor(q[1] / cell), ck = Math.floor(q[2] / cell);
    let best = Infinity, bi = -1;
    for (let r = 0; (r - 1) * cell <= maxR; r++) {
      if (best < Infinity && best <= (r - 1) * cell) break;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const l = map.get(key(i, j, k));
        if (l) for (const n of l) { const d = dist(q, atoms[n]); if (d < best || (d === best && n < bi)) { best = d; bi = n; } }
      }
    }
    return { d: best, index: bi };
  };
}

class MinHeap {
  constructor() { this.c = []; this.v = []; }
  get size() { return this.c.length; }
  less(a, b) { return this.c[a] < this.c[b] || (this.c[a] === this.c[b] && this.v[a] < this.v[b]); }
  swap(a, b) { [this.c[a], this.c[b]] = [this.c[b], this.c[a]]; [this.v[a], this.v[b]] = [this.v[b], this.v[a]]; }
  push(cost, v) {
    this.c.push(cost); this.v.push(v);
    let i = this.c.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  pop() {
    const cost = this.c[0], v = this.v[0], lc = this.c.pop(), lv = this.v.pop();
    const n = this.c.length;
    if (n) {
      this.c[0] = lc; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return { cost, v };
  }
}

function fibonacciDirections(n) {
  const g = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => { const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z); return [r * Math.cos(g * i), r * Math.sin(g * i), z]; });
}

function chaikin(pts, iters) {
  let p = pts;
  for (let it = 0; it < iters; it++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) q.push(add(scale(p[i], 0.75), scale(p[i + 1], 0.25)), add(scale(p[i], 0.25), scale(p[i + 1], 0.75)));
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Points at arc lengths 0, step, 2 step, ... plus the end point (the last spacing may be shorter). */
function resample(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[cum.length - 1], out = [pts[0]];
  let seg = 0;
  for (let s = step; s < total - 1e-9; s += step) {
    while (cum[seg + 1] < s) seg++;
    const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg]);
    out.push(add(pts[seg], scale(sub(pts[seg + 1], pts[seg]), t)));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * atoms: 50S heavy atom centres (ribo frame). ptc: origin. targetPoint: centroid of uL23 and uL29 CA.
 * Returns { path, record } or { fallback: reason, record, targetQ } when no route exists.
 */
function computeTunnel(atoms, ptc, targetPoint) {
  const T = TUNNEL, N = Math.round(T.cube / T.voxel) + 1, H = (N - 1) / 2, N2 = N * N, total = N2 * N;
  const lo = ptc.map(c => c - H * T.voxel);
  const idxOf = (i, j, k) => (i * N + j) * N + k;
  const posOf = idx => { const k = idx % N, j = ((idx - k) / N) % N, i = (idx - k - j * N) / N2; return [lo[0] + i * T.voxel, lo[1] + j * T.voxel, lo[2] + k * T.voxel]; };
  // Clearance grid capped at clearCap: exact distance to the nearest atom centre wherever it is below the cap.
  const clear = new Float32Array(total).fill(T.clearCap);
  const R = Math.ceil(T.clearCap / T.voxel), cap2 = T.clearCap * T.clearCap;
  for (const p of atoms) {
    const ci = Math.round((p[0] - lo[0]) / T.voxel), cj = Math.round((p[1] - lo[1]) / T.voxel), ck = Math.round((p[2] - lo[2]) / T.voxel);
    if (ci < -R || cj < -R || ck < -R || ci > N - 1 + R || cj > N - 1 + R || ck > N - 1 + R) continue;
    for (let i = Math.max(0, ci - R); i <= Math.min(N - 1, ci + R); i++) {
      const dx = lo[0] + i * T.voxel - p[0];
      for (let j = Math.max(0, cj - R); j <= Math.min(N - 1, cj + R); j++) {
        const dy = lo[1] + j * T.voxel - p[1], dxy = dx * dx + dy * dy;
        if (dxy >= cap2) continue;
        for (let k = Math.max(0, ck - R); k <= Math.min(N - 1, ck + R); k++) {
          const dz = lo[2] + k * T.voxel - p[2], d2 = dxy + dz * dz, id = idxOf(i, j, k);
          if (d2 < clear[id] * clear[id]) clear[id] = Math.sqrt(d2);
        }
      }
    }
  }
  const open = id => clear[id] > T.blockA;            // unblocked: farther than 3.0 A from every 50S heavy atom
  const at = q => {
    const i = Math.round((q[0] - lo[0]) / T.voxel), j = Math.round((q[1] - lo[1]) / T.voxel), k = Math.round((q[2] - lo[2]) / T.voxel);
    return i < 0 || j < 0 || k < 0 || i >= N || j >= N || k >= N ? -1 : idxOf(i, j, k);
  };
  const dirs = fibonacciDirections(T.rays);
  const solvent = (id, minClear) => {
    const o = posOf(id);
    for (const d of dirs) {
      let ok = true, escaped = false;
      for (let s = 1; ; s++) {
        const qi = at([o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s]);
        if (qi < 0) { escaped = true; break; }
        if (!open(qi) || (s > 8 && clear[qi] <= minClear)) { ok = false; break; }
      }
      if (ok && escaped) return true;
    }
    return false;
  };
  const voxelRec = id => { const q = posOf(id); return { index: id, xyz: q.map(r3), clearanceCappedA: r3(clear[id]), distToPtcA: r3(dist(q, ptc)) }; };
  const rec = { cubeA: T.cube, voxelA: T.voxel, grid: N, blockedWithinA: T.blockA, clearanceCapA: T.clearCap, atoms50S: atoms.length, targetCentroid: targetPoint.map(r3) };

  let target = -1, relax = null;
  for (const minClear of T.solventClear) {
    const cands = [];
    for (let id = 0; id < total; id++) if (open(id)) { const d = dist(posOf(id), targetPoint); if (d <= T.targetRadius) cands.push([d, id]); }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, id] of cands) if (solvent(id, minClear)) { target = id; break; }
    rec.solventCandidates = cands.length;
    if (target >= 0) { relax = minClear; break; }
  }
  rec.relaxationA = relax;
  let start = -1, sd = Infinity;
  const startQ = [ptc[0] - T.startOffsetA, ptc[1], ptc[2]];
  for (let id = 0; id < total; id++) if (open(id)) { const d = dist(posOf(id), startQ); if (d < sd) { sd = d; start = id; } }
  if (target < 0) return { fallback: 'no solvent-side target voxel within 30 A of the uL23/uL29 centroid at 8, 6 or 4 A', record: rec, targetQ: null };
  rec.targetVoxel = voxelRec(target); rec.startVoxel = voxelRec(start);

  // Dijkstra over 26 neighbours; cost = step length / clearance(destination)^2; ties broken by the smaller predecessor index.
  const nb = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) nb.push([a, b, c, Math.sqrt(a * a + b * b + c * c) * T.voxel]);
  const best = new Float64Array(total).fill(Infinity), prev = new Int32Array(total).fill(-1);
  const heap = new MinHeap();
  best[start] = 0; heap.push(0, start);
  while (heap.size) {
    const { cost, v } = heap.pop();
    if (cost > best[v]) continue;
    if (v === target) break;
    const k = v % N, j = ((v - k) / N) % N, i = (v - k - j * N) / N2;
    for (const [a, b, c, len] of nb) {
      const ii = i + a, jj = j + b, kk = k + c;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= N || jj >= N || kk >= N) continue;
      const w = idxOf(ii, jj, kk);
      if (!open(w)) continue;
      const nc = cost + len / (clear[w] * clear[w]);
      if (nc < best[w] || (nc === best[w] && v < prev[w])) { best[w] = nc; prev[w] = v; heap.push(nc, w); }
    }
  }
  if (!Number.isFinite(best[target])) return { fallback: 'no connected unblocked route from the start voxel to the target voxel', record: rec, targetQ: posOf(target) };
  const route = [];
  for (let v = target; v !== -1; v = prev[v]) route.push(posOf(v));
  route.reverse();
  rec.routeVoxels = route.length; rec.routeCost = r6(best[target]);
  return { path: resample(chaikin(route, T.chaikin), T.step), record: rec, targetQ: posOf(target), cubeLo: lo, cubeHi: lo.map(v => v + (N - 1) * T.voxel) };
}

/** Exact clearance profile of a path against the 50S atoms (nearest from makeNearest). */
function tunnelProfile(path, nearest) {
  const arc = [0];
  for (let i = 1; i < path.length; i++) arc.push(arc[i - 1] + dist(path[i], path[i - 1]));
  const cl = path.map(p => nearest(p).d);
  let minBeyond = Infinity, at = -1;
  cl.forEach((c, i) => { if (arc[i] > TUNNEL.skipA && c < minBeyond) { minBeyond = c; at = i; } });
  const every5 = [];
  for (let s = 0; s <= arc[arc.length - 1]; s += 5) { let i = 0; while (i + 1 < arc.length && arc[i + 1] <= s) i++; every5.push({ arcA: s, clearanceA: r3(cl[i]) }); }
  return { length: arc[arc.length - 1], arc, cl, minBeyond, minAtArcA: arc[at], every5 };
}

// ---------------------------------------------------------------------------------------------------------------
// mrna track.
const rotationAngleDeg = (Ra, Rb) => {
  const M = mulMM(transpose(Ra), Rb);
  return Math.acos(Math.max(-1, Math.min(1, (M[0] + M[4] + M[8] - 1) / 2))) * 180 / Math.PI;
};

/** Step a frame by n A-form single-strand steps (rise along local z, twist about local z); s = +1 or -1 sets the sense. */
function stepFrame(f, n, s) {
  let o = f.o.slice(), R = Array.from(f.R);
  for (let i = 0; i < n; i++) {
    o = add(o, mulMV(R, [0, 0, s * A_FORM_RISE]));
    R = mulMM(R, rotZ(s * A_FORM_TWIST * DEG));
  }
  return { o, R };
}

function buildMrnaTrack(fitted, seqBase = () => null) {
  // fitted: Map(register -> { f: {o,R} ribo frame, base, src })
  // seqBase(register) -> { base, src } from the deposited _entity_poly sequences, for registers without coordinates.
  const [lo, hi] = MRNA_RANGE;
  const regs = [...fitted.keys()].sort((a, b) => a - b);
  const frames = [], synthetic = [], sources = [];
  let bases = '';
  const stepInfo = [];
  for (let k = lo; k <= hi; k++) {
    const hit = fitted.get(k);
    if (hit) { frames.push(hit.f); synthetic.push(0); sources.push(hit.src); bases += hit.base; continue; }
    let nearest = regs[0];
    for (const r of regs) if (Math.abs(r - k) < Math.abs(nearest - k)) nearest = r;
    const F = fitted.get(nearest);
    const nb = fitted.get(nearest + 1) ? 1 : fitted.get(nearest - 1) ? -1 : 0;
    // The sense s_inc makes a step toward increasing register follow the local origin difference (5' to 3').
    const d = nb === 1 ? sub(fitted.get(nearest + 1).f.o, F.f.o) : nb === -1 ? sub(F.f.o, fitted.get(nearest - 1).f.o) : [0, 0, 1];
    const sInc = dot(col(F.f.R, 2), d) >= 0 ? 1 : -1;
    const dir = k > nearest ? 1 : -1;
    frames.push(stepFrame(F.f, Math.abs(k - nearest), sInc * dir));
    const sb = seqBase(k);
    if (!sb) throw new Error(`mrna register ${k}: no coordinates and no deposited sequence`);
    synthetic.push(1); sources.push('synthetic'); bases += sb.base;
    stepInfo.push({ register: k, from: nearest, senseIncreasing: sInc, baseFrom: sb.src });
  }
  return { registers: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), frames, synthetic, sources, bases, stepInfo };
}

// ---------------------------------------------------------------------------------------------------------------
function buildRibosome(ctx) {
  const entry = id => ctx.lockEntry(id);
  const p7k = ctx.loadSource('7K00'), p7st = ctx.loadSource('7ST2'), p5we = ctx.loadSource('5WE4'), p7pj = ctx.loadSource('7PJV');
  const an = analyse7K00(p7k);
  const { chains: c7k, inv, A, pSite, aSite } = an;
  const { rows } = inv;
  const T0 = toRibo(A, null);
  const P0 = ptOf(T0), F0 = frameOf(T0);

  ctx.log('\n7K00 chain table (part, subunit, chain, residues, description):');
  for (const r of rows) ctx.log(`  ${r.part.padEnd(5)} ${r.subunit.padEnd(12)} ${r.id.padEnd(3)} ${String(r.chain.residues.length).padStart(5)}  ${r.description}`);
  ctx.log(`excluded: ${inv.excluded.map(e => `${e.id} (${e.description}, ${e.residues} nt)`).join('; ')}`);
  ctx.log(`P-site codon X author ${pSite.start}-${pSite.start + 2} ${pSite.pairing.codon} pairs with tRNA ${pSite.trna} (${pSite.pairing.anticodon}); A-site codon ${aSite.start}-${aSite.start + 2} ${aSite.pairing.codon} with tRNA ${aSite.trna} (${aSite.pairing.anticodon})`);

  // --- L1 beads and chain table --------------------------------------------------------------------------------
  const chainDefs = [], l1Pos = [], l1Chain = [], l1Kind = [], partBeads = { small: [], large: [] };
  rows.forEach((r, ci) => {
    let n = 0;
    for (const res of r.chain.residues) {
      const a = r.class === 'rna' ? res.atoms.P : res.atoms.CA;
      if (!a) continue;
      const q = P0(a);
      l1Pos.push(...q); partBeads[r.part].push(...q); l1Chain.push(ci); l1Kind.push(r.class === 'rna' ? 1 : 0); n++;
    }
    chainDefs.push({ id: r.id, part: r.part, class: r.class, name: r.description, residues: n, modelled: r.chain.residues.length, subunit: r.subunit });
  });
  const l1Count = l1Chain.length;
  if (l1Count > LIMITS.l1Beads) throw new Error(`L1 ${l1Count} beads exceeds ${LIMITS.l1Beads}`);

  // --- L0 --------------------------------------------------------------------------------------------------------
  const l0 = PARTS.map(part => {
    const env = envelope(partBeads[part.id], { sigma: L0.sigma, spacing: L0.spacing, maxTriangles: L0.maxTrianglesPerPart, minInside: L0.minInside });
    const ms = meshStats(env.positions, env.indices);
    if (env.insideByRay < L0.minInside) throw new Error(`L0 ${part.id}: only ${env.insideByRay} of beads inside`);
    if (!ms.closed || ms.signedVolume <= 0) throw new Error(`L0 ${part.id}: mesh not closed/outward: ${JSON.stringify(ms)}`);
    return { part: part.id, env, ms };
  });
  const triTotal = l0.reduce((s, m) => s + m.env.indices.length / 3, 0);
  if (triTotal > LIMITS.l0Triangles) throw new Error(`L0 ${triTotal} triangles exceeds ${LIMITS.l0Triangles}`);
  const lod0 = {
    parts: l0.map(({ part, env }) => {
      const nv = env.positions.length / 3;
      return {
        part, positions: encodePositions(env.positions),
        indices: nv < 65536 ? encodeArray(Uint16Array.from(env.indices)) : encodeArray(Uint32Array.from(env.indices)),
        indexType: nv < 65536 ? 'u16' : 'u32', vertexCount: nv, triangleCount: env.indices.length / 3,
        sigma: env.sigma, spacing: env.spacing, beadsInside: r3(env.insideByRay),
      };
    }),
  };

  // --- Anchors that come from 7K00 ------------------------------------------------------------------------------
  const anchors = {};
  const setAnchor = (name, f, extra) => { anchors[name] = { ...frameOut(f), ...(extra || {}) }; };
  const l1c = centroid(Array.from({ length: l1Count }, (_, i) => [l1Pos[3 * i], l1Pos[3 * i + 1], l1Pos[3 * i + 2]]));
  setAnchor('center', { o: l1c, R: I3 });

  const numbering = id => standardNumbering(c7k.get(id));
  const frameP = trnaFrame(numbering(pSite.trna), { transform: P0 });
  const frameA = trnaFrame(numbering(aSite.trna), { transform: P0 });
  setAnchor('siteA', frameA); setAnchor('siteP', frameP);

  // --- Superpositions ---------------------------------------------------------------------------------------------
  const ref = rrnaChains(p7k, c7k, ['A', 'a'], '7K00');
  const superpositions = [];
  const ent7st = entityMap(p7st);
  const c7st = polymerChains(p7st), c5we = polymerChains(p5we), c7pj = polymerChains(p7pj);
  const m7st = rrnaChains(p7st, c7st, ['3', '1'], '7ST2');
  const m5we = rrnaChains(p5we, c5we, ['a', 'A'], '5WE4');
  const m7pj = rrnaChains(p7pj, c7pj, ['a', 'A'], '7PJV');

  const f7st = fitEntry('7ST2', m7st, ref, '16S+23S', 'primary');
  const f5we = fitEntry('5WE4', m5we, ref, '16S+23S', 'primary');
  const f7pj = fitEntry('7PJV', m7pj, ref, '16S+23S', 'primary');
  const f7pj23 = fitEntry('7PJV', m7pj, ref, '23S', 'alternative');
  const f7pj16 = fitEntry('7PJV', m7pj, ref, '16S', 'alternative');
  superpositions.push(f7st.record, f5we.record, f7pj.record, f7pj23.record, f7pj16.record);
  for (const f of [f7st, f5we]) {
    ctx.log(`superposition ${f.record.mobile}: n ${f.record.nBefore} -> ${f.record.nAfter}, RMSD ${f.record.rmsdBeforeA} -> ${f.record.rmsdAfterA} A, ${f.record.nameMismatchesExcluded} name mismatches excluded`);
    if (!f.record.passesGate) throw new Error(`${f.record.mobile}: RMSD ${f.record.rmsdAfterA} A exceeds ${SUPERPOSE_GATE} A; stop and report`);
  }
  for (const f of [f7pj, f7pj23, f7pj16]) ctx.log(`superposition 7PJV ${f.record.scope}: n ${f.record.nBefore} -> ${f.record.nAfter}, RMSD ${f.record.rmsdBeforeA} -> ${f.record.rmsdAfterA} A`);
  const T7st = toRibo(A, f7st.sup), T5we = toRibo(A, f5we.sup);
  const P7st = ptOf(T7st), P5we = ptOf(T5we), F7st = frameOf(T7st);

  // --- E site (7ST2) ---------------------------------------------------------------------------------------------
  const e7k = c7k.get('5');
  const refE = new Map(e7k.residues.filter(r => r.authSeq === 75 || r.authSeq === 76).map(r => [r.authSeq, r]));
  if (refE.size !== 2) throw new Error('7K00 chain 5 lacks nucleotides 75 and 76');
  const eCandidates = trnaChainsOf(p7st, c7st).map(t => {
    let sum = 0, n = 0, comps = [];
    for (const num of [75, 76]) {
      const mr = t.residues.find(r => r.authSeq === num), rr = refE.get(num);
      if (!mr) continue;
      comps.push(mr.comp);
      for (const [name, p] of Object.entries(mr.atoms)) if (rr.atoms[name]) { const d = dist(ptOfSup(f7st.sup)(p), rr.atoms[name]); sum += d * d; n++; }
    }
    return { chain: t.id, description: ent7st.get(t.entity).description, atoms: n, rmsdA: n ? Math.sqrt(sum / n) : Infinity, comps: comps.join('') };
  });
  const passing = eCandidates.filter(c => c.rmsdA <= E_SITE_GATE);
  const ePick = passing.find(c => c.chain === '6') || passing[0];
  if (!ePick) throw new Error(`7ST2: no tRNA passes the E-site check (<= ${E_SITE_GATE} A): ${JSON.stringify(eCandidates)}`);
  const frameE = trnaFrame(standardNumbering(c7st.get(ePick.chain)), { transform: P7st });
  setAnchor('siteE', frameE);
  ctx.log(`E-site tRNA 7ST2 chain ${ePick.chain}: ${ePick.atoms} atoms, RMSD ${r3(ePick.rmsdA)} A vs 7K00 chain 5; candidates ${eCandidates.map(c => `${c.chain} ${r3(c.rmsdA)}`).join(', ')}`);

  // --- A/T site (5WE4) -------------------------------------------------------------------------------------------
  const frameAT = trnaFrame(standardNumbering(c5we.get('y')), { transform: P5we });
  setAnchor('siteAT', frameAT);

  // --- Hybrid sites (7PJV), conditional ------------------------------------------------------------------------
  const hybrid = { conditionA: HYBRID_MAX_ORIGIN, fits: [] };
  const hybridFor = (tag, f) => {
    const T = toRibo(A, f.sup);
    const row = { fit: tag };
    for (const [chain, key, field, siteFrame] of [['w', 'AP', 'wToSiteA', frameA], ['v', 'PE', 'vToSiteP', frameP]]) {
      try {
        const fr = trnaFrame(standardNumbering(c7pj.get(chain)), { transform: ptOf(T) });
        row[field] = r3(dist(fr.o, siteFrame.o));          // anticodon origin distance in A
        row[`_frame${key}`] = fr;
      } catch (e) { row[`${chain}Error`] = e.message; }
    }
    return row;
  };
  const hyRows = [['16S+23S', f7pj], ['23S', f7pj23], ['16S', f7pj16]].map(([tag, f]) => hybridFor(tag, f));
  const primaryHy = hyRows[0];
  const keepAP = primaryHy._frameAP && dist(primaryHy._frameAP.o, frameA.o) <= HYBRID_MAX_ORIGIN;
  const keepPE = primaryHy._framePE && dist(primaryHy._framePE.o, frameP.o) <= HYBRID_MAX_ORIGIN;
  hybrid.fits = hyRows.map(({ _frameAP, _framePE, ...rest }) => rest);
  hybrid.decision = {
    fitUsed: '16S+23S (rule as written, PLAN.md 7.3)',
    siteAP: keepAP ? 'kept' : `omitted: anticodon origin of 7PJV tRNA w is ${primaryHy.wToSiteA} A from siteA (> ${HYBRID_MAX_ORIGIN} A)`,
    sitePE: keepPE ? 'kept' : `omitted: anticodon origin of 7PJV tRNA v is ${primaryHy.vToSiteP} A from siteP (> ${HYBRID_MAX_ORIGIN} A)`,
  };
  if (keepAP) setAnchor('siteAP', primaryHy._frameAP);
  if (keepPE) setAnchor('sitePE', primaryHy._framePE);
  ctx.log(`hybrid sites (16S+23S fit): w to siteA ${primaryHy.wToSiteA} A (${keepAP ? 'keep' : 'omit'} siteAP), v to siteP ${primaryHy.vToSiteP} A (${keepPE ? 'keep' : 'omit'} sitePE)`);

  // --- decoding ---------------------------------------------------------------------------------------------------
  const dec = [[1492, 'A'], [1493, 'A'], [530, 'G']].map(([n, comp]) => {
    const r = ref.s16.residues.find(x => x.authSeq === n);
    if (!r || r.comp !== comp) throw new Error(`7K00 16S ${n}: expected ${comp}, found ${r && r.comp}`);
    return Object.values(r.atoms).map(P0);
  }).flat();
  setAnchor('decoding', { o: centroid(dec), R: I3 });

  // --- mrna track -------------------------------------------------------------------------------------------------
  const fitted = new Map();
  const s7k = pSite.start;                                                 // register 0 = first nucleotide of the P-site codon
  for (const r of an.mrna.residues) {
    const f = fitRes(r);
    if (f) fitted.set(r.authSeq - s7k, { f: F0(f), base: f.base, src: '7K00' });
  }
  const n7k = fitted.size;
  // 7ST2: confirm the register by finding the P-site tRNA (pairs with its codon and lies at the 7K00 P site after superposition).
  const mrna7st = [...c7st.values()].filter(c => /mRNA/i.test(ent7st.get(c.entity).description));
  if (mrna7st.length !== 1) throw new Error(`7ST2: expected one mRNA chain, found ${mrna7st.length}`);
  const pairings7st = findPairings(mrna7st[0], trnaChainsOf(p7st, c7st)).map(p => {
    const fr = trnaFrame(standardNumbering(c7st.get(p.trna)), { transform: P7st });
    return { ...p, anticodonToSitePA: dist(fr.o, frameP.o) };
  }).sort((a, b) => a.anticodonToSitePA - b.anticodonToSitePA);
  if (!pairings7st.length) throw new Error('7ST2: no tRNA pairs with the mRNA');
  const p7 = pairings7st[0];
  if (p7.anticodonToSitePA > HYBRID_MAX_ORIGIN) throw new Error(`7ST2: closest paired tRNA ${p7.trna} is ${p7.anticodonToSitePA} A from siteP`);
  const reg7st = r => r.authSeq - p7.start;
  const deviations = [];
  const only7st = [];
  for (const r of mrna7st[0].residues) {
    const f = fitRes(r);
    if (!f) continue;
    const k = reg7st(r), Ff = F7st(f);
    if (fitted.has(k)) {
      const o = fitted.get(k);
      deviations.push({ register: k, originA: r3(dist(o.f.o, Ff.o)), rotationDeg: r3(rotationAngleDeg(o.f.R, Ff.R)) });
    } else if (k >= MRNA_RANGE[0] && k <= MRNA_RANGE[1]) { fitted.set(k, { f: Ff, base: f.base, src: '7ST2' }); only7st.push(k); }
  }
  deviations.sort((a, b) => a.register - b.register);
  // Bases for synthetic registers come from the deposited mRNA sequences (_entity_poly), 7K00 first, then 7ST2.
  // Register -> label_seq_id offset is taken from one modelled residue of each chain.
  const entitySeqLookup = (parsed, chain, regOf, src) => {
    const seq = parsed.entityPolySeq[chain.entity] || '';
    const r0 = chain.residues[0], off = r0.seq - regOf(r0);
    return k => { const i = k + off - 1; return i >= 0 && i < seq.length && /^[ACGU]$/.test(seq[i]) ? { base: seq[i], src } : null; };
  };
  const seq7k = entitySeqLookup(p7k, an.mrna, r => r.authSeq - s7k, '7K00 _entity_poly');
  const seq7st = entitySeqLookup(p7st, mrna7st[0], reg7st, '7ST2 _entity_poly');
  const mt = buildMrnaTrack(fitted, k => seq7k(k) || seq7st(k));
  for (const k of mt.registers) if (k < MRNA_RANGE[0] || k > MRNA_RANGE[1]) throw new Error('mrna register out of range');
  const tracks = { mrna: { kind: 'rna', registers: mt.registers, frames: mt.frames.map(frameOut), synthetic: mt.synthetic, sources: mt.sources, bases: mt.bases } };
  const fAt = k => mt.frames[k - MRNA_RANGE[0]];
  setAnchor('mrnaEntry', fAt(15), { synthetic: mt.synthetic[15 - MRNA_RANGE[0]] });
  setAnchor('mrnaExit', fAt(-16), { synthetic: mt.synthetic[-16 - MRNA_RANGE[0]] });
  ctx.log(`mrna: 7K00 registers ${[...fitted].filter(([, v]) => v.src === '7K00').map(([k]) => k).sort((a, b) => a - b).join(',')}; 7ST2 registers ${only7st.sort((a, b) => a - b).join(',')}; synthetic ${mt.stepInfo.map(s => s.register).join(',')}`);

  // --- antiSD (7ST2 16S author 1535-1540) -------------------------------------------------------------------------
  const antiRes = [1535, 1536, 1537, 1538, 1539, 1540].map(n => m7st.s16.residues.find(r => r.authSeq === n));
  if (antiRes.some(r => !r)) throw new Error('7ST2 16S: author 1535-1540 not all modelled');
  const antiSeq = antiRes.map(r => residueBase(r.comp)).join('');
  if (antiSeq !== 'CCUCCU') throw new Error(`7ST2 16S 1535-1540 reads ${antiSeq}, expected CCUCCU`);
  const antiC1 = antiRes.map(r => P7st(r.atoms["C1'"]));
  const antiF = axisFrame(centroid(antiRes.flatMap(r => Object.values(r.atoms).map(P7st))), norm(sub(antiC1[5], antiC1[0])));
  setAnchor('antiSD', antiF, { synthetic: 0 });

  // --- smallCenter, largeCenter ------------------------------------------------------------------------------------
  for (const [name, id] of [['smallCenter', 'small'], ['largeCenter', 'large']]) {
    const b = partBeads[id];
    setAnchor(name, { o: centroid(Array.from({ length: b.length / 3 }, (_, i) => [b[3 * i], b[3 * i + 1], b[3 * i + 2]])), R: I3 });
  }

  // --- Tunnel (step 3) --------------------------------------------------------------------------------------------
  const zChain = c7k.get(pSite.trna);
  const a76 = zChain && zChain.residues.find(r => r.authSeq === 76);
  if (!a76 || !a76.atoms["O3'"]) throw new Error(`7K00 chain ${pSite.trna}: A76 O3' not modelled`);
  const ptcO = P0(a76.atoms["O3'"]);
  const atoms50 = largeSubunitAtoms(p7k, rows, T0);
  const targetCa = [];
  for (const id of ['s', 'x']) {
    const r = rows.find(q => q.id === id);
    if (!r || !/L23|L29/.test(r.description)) throw new Error(`7K00 chain ${id} is not uL23/uL29: ${r && r.description}`);
    for (const res of r.chain.residues) if (res.atoms.CA) targetCa.push(P0(res.atoms.CA));
  }
  const targetPoint = centroid(targetCa);
  const t0 = Date.now();
  const tun = computeTunnel(atoms50, ptcO, targetPoint);
  if (!tun.path) throw new Error(`tunnel: ${tun.fallback}; stop and report (no straight-line fallback, stage-lead decision)`);
  const nearest = makeNearest(atoms50);
  const quant = pts => pts.map(q => q.map(v => Math.round(v / QUANT_STEP) * QUANT_STEP));      // the stored points, so anchors and profile match the asset
  const fullPath = quant(tun.path);
  const fullProf = tunnelProfile(fullPath, nearest);
  // Deviation from PLAN.md 7.4 step 2 (stage-lead decision): truncate at the tunnel mouth = first resampled point with arc >= 60 A that is
  // solvent-side by the target test (162 rays reach the cube boundary, all 1 A samples unblocked, samples beyond 8 A have clearance > 8 A), exact clearances.
  const cubeLo = tun.cubeLo, cubeHi = tun.cubeHi, dirs162 = fibonacciDirections(TUNNEL.rays);
  const solventExact = o => {
    for (const d of dirs162) {
      let ok = true;
      for (let s = 1; ; s++) {
        const q = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
        if (q.some((v, k) => v < cubeLo[k] || v > cubeHi[k])) break;
        const c = nearest(q, 30).d;
        if (c <= TUNNEL.blockA || (s > 8 && c <= 8)) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  };
  let mouth = -1;
  for (let i = 0; i < fullPath.length; i++) if (fullProf.arc[i] >= TUNNEL.mouthMinArcA && solventExact(fullPath[i])) { mouth = i; break; }
  if (mouth < 0) throw new Error(`tunnel: no solvent-side point after ${TUNNEL.mouthMinArcA} A on the ${r3(fullProf.length)} A route; stop and report`);
  const tunnelPath = fullPath.slice(0, mouth + 1), tunnelSynthetic = 0;
  const prof = tunnelProfile(tunnelPath, nearest);
  if (prof.length < TUNNEL.lengthMin || prof.length > TUNNEL.lengthMax) throw new Error(`tunnel: truncated length ${r3(prof.length)} A outside ${TUNNEL.lengthMin}-${TUNNEL.lengthMax} A (route ${r3(fullProf.length)} A, mouth arc ${r3(fullProf.arc[mouth])} A); stop and report`);
  if (prof.minBeyond < TUNNEL.minClearA) throw new Error(`tunnel: minimum clearance ${r3(prof.minBeyond)} A at arc ${r3(prof.minAtArcA)} A beyond ${TUNNEL.skipA} A is below ${TUNNEL.minClearA} A (length ${r3(prof.length)} A); stop and report`);
  setAnchor('ptc', axisFrame(ptcO, norm(sub(tunnelPath[1], tunnelPath[0]))));
  setAnchor('tunnelExit', axisFrame(tunnelPath[tunnelPath.length - 1], norm(sub(tunnelPath[tunnelPath.length - 1], tunnelPath[tunnelPath.length - 2]))));
  // Sanity (not a gate): path clearance next to the closest C-alpha of uL4 (chain e) and uL22 (chain r), on the final path.
  const constriction = {};
  for (const [name, id] of [['uL4', 'e'], ['uL22', 'r']]) {
    const r = rows.find(q => q.id === id);
    let bd = Infinity, bi = -1, bres = null;
    for (const res of r.chain.residues) if (res.atoms.CA) {
      const q = P0(res.atoms.CA);
      tunnelPath.forEach((p, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; bres = res.authSeq; } });
    }
    constriction[name] = { chain: id, description: r.description, closestCaAuthSeq: bres, caToPathA: r3(bd), pathArcA: r3(prof.arc[bi]), clearanceAtPathPointA: r3(prof.cl[bi]) };
  }
  const tunnelSource = {
    algorithm: 'design 5.6 / PLAN.md 7.4, truncated at the tunnel mouth (recorded deviation from 7.4 step 2)', synthetic: tunnelSynthetic,
    ...tun.record, ptcO3Prime: ptcO.map(r3), pathPoints: tunnelPath.length, lengthA: r3(prof.length), gateLengthA: [TUNNEL.lengthMin, TUNNEL.lengthMax],
    fullRoute: { lengthA: r3(fullProf.length), points: fullPath.length, minClearanceBeyondSkipA: r3(fullProf.minBeyond) },
    mouth: { rule: `first resampled point with arc >= ${TUNNEL.mouthMinArcA} A that is solvent-side (${TUNNEL.rays} rays, 1 A samples, exact clearances, samples beyond 8 A with clearance > 8 A)`, index: mouth, arcA: r3(fullProf.arc[mouth]), xyz: tunnelPath[mouth].map(r3) },
    minClearanceBeyondSkipA: r3(prof.minBeyond), minClearanceArcA: r3(prof.minAtArcA), skipA: TUNNEL.skipA, gateMinClearanceA: TUNNEL.minClearA,
    clearanceProfile: prof.cl.map(c => Math.round(c * 100) / 100), clearanceProfileStepA: 1, clearanceMaxA: r3(Math.max(...prof.cl.slice(1))), constriction,
    startToPtcA: r3(dist(tunnelPath[0], ptcO)), exitToTargetVoxelA: r3(dist(tunnelPath[tunnelPath.length - 1], tun.targetQ)),
    clearance: 'exact distance from each stored path point to the nearest 50S heavy atom centre (23S, 5S, L proteins of 7K00; no ions or waters)',
  };
  ctx.log(`tunnel: full route ${tunnelSource.fullRoute.lengthA} A, mouth arc ${tunnelSource.mouth.arcA} A, final length ${tunnelSource.lengthA} A, relaxation ${tun.record.relaxationA}, min clearance beyond ${TUNNEL.skipA} A ${tunnelSource.minClearanceBeyondSkipA} A at arc ${tunnelSource.minClearanceArcA}; ${Date.now() - t0} ms`);
  ctx.log(`tunnel clearance every 5 A: ${prof.every5.map(e => e.clearanceA).join(' ')}; uL4 ${JSON.stringify(constriction.uL4)}; uL22 ${JSON.stringify(constriction.uL22)}`);
  const paths = { tunnel: { points: encodePositions(tunnelPath.flat()), count: tunnelPath.length, synthetic: tunnelSynthetic } };
  const L2_SITES = [{ anchor: 'decoding', radius: L2_SITE_RADIUS }, { anchor: 'ptc', radius: L2_SITE_RADIUS }];

  // --- L2 -------------------------------------------------------------------------------------------------------------
  const l2 = buildL2(p7k, rows, T0, L2_SITES, anchors);
  if (l2.all.length > LIMITS.l2Atoms) throw new Error(`L2 ${l2.all.length} atoms exceeds ${LIMITS.l2Atoms}`);
  const lod2 = {
    count: l2.all.length, positions: encodePositions(l2.all.flatMap(a => a.p)),
    element: encodeArray(Uint8Array.from(l2.all.map(a => ELEMENT_Z[a.element]))), chain: encodeArray(Uint8Array.from(l2.all.map(a => a.ci))),
    bonds: encodeArray(Uint16Array.from(l2.bonds)), bondCount: l2.bonds.length / 2, sites: L2_SITES.map(s => ({ ...s })),
  };

  // --- Bounds ---------------------------------------------------------------------------------------------------------
  const pts = Array.from({ length: l1Count }, (_, i) => [l1Pos[3 * i], l1Pos[3 * i + 1], l1Pos[3 * i + 2]]);
  for (const m of l0) for (let i = 0; i < m.env.positions.length; i += 3) pts.push([m.env.positions[i], m.env.positions[i + 1], m.env.positions[i + 2]]);
  const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
  const bc = anchors.center.o;
  const bounds = { center: bc.slice(), radius: r3(Math.max(...pts.map(p => dist(p, bc)))), size: [0, 1, 2].map(k => r3(hi[k] - lo[k])) };

  // --- Source block ----------------------------------------------------------------------------------------------------
  const e7 = entry('7K00');
  const secondary = ['7ST2', '5WE4', '7PJV'].map(id => {
    const e = entry(id), p = { '7ST2': p7st, '5WE4': p5we, '7PJV': p7pj }[id];
    return {
      pdbId: id, url: e.url, title: p.title, method: p.method, resolutionA: p.resolutionA, downloaded: e.downloaded, revisionDate: p.revisionDate, sha256: e.sha256,
      role: { '7ST2': 'siteE, mrna registers -14 to -4, antiSD', '5WE4': 'siteAT', '7PJV': 'siteAP and sitePE (conditional; tested, omitted)' }[id],
    };
  });
  const siteChecks = {
    eSite: { mobile: '7ST2', chain: ePick.chain, reference: '7K00 chain 5', nucleotides: [75, 76], matching: 'heavy atoms matched by author number and atom name', atoms: ePick.atoms, rmsdA: r3(ePick.rmsdA), gateA: E_SITE_GATE, candidates: eCandidates.map(c => ({ chain: c.chain, description: c.description, atoms: c.atoms, rmsdA: r3(c.rmsdA) })) },
    trnaFrames: {
      siteP: { source: `7K00 chain ${pSite.trna}`, last3: frameP.last3 }, siteA: { source: `7K00 chain ${aSite.trna}`, last3: frameA.last3 },
      siteE: { source: `7ST2 chain ${ePick.chain}`, last3: frameE.last3 }, siteAT: { source: '5WE4 chain y', last3: frameAT.last3 },
    },
    hybrid,
    stSiteP: { sevenST2PSiteTrna: p7.trna, codonStartAuth: p7.start, anticodonToSitePA: r3(p7.anticodonToSitePA), allPairings: pairings7st.map(p => ({ trna: p.trna, codonStartAuth: p.start, anticodonToSitePA: r3(p.anticodonToSitePA) })) },
  };
  const codonPairing = { source: '7K00', rule: `complementary identities (A-U, G-C), fitted base-frame origins <= ${PAIR_MAX_ORIGIN} A, antiparallel base normals`,
    P: { trnaChain: pSite.trna, codonAuthStart: pSite.start, ...pSite.pairing }, A: { trnaChain: aSite.trna, codonAuthStart: aSite.start, ...aSite.pairing } };
  const mrnaRec = {
    registerRule: { '7K00': `register = author - ${s7k} (chain X)`, '7ST2': `register = author - ${p7.start} (chain ${mrna7st[0].id}; confirmed by P-site tRNA ${p7.trna} pairing at author ${p7.start}-${p7.start + 2})` },
    counts: { '7K00': mt.sources.filter(s => s === '7K00').length, '7ST2': mt.sources.filter(s => s === '7ST2').length, synthetic: mt.sources.filter(s => s === 'synthetic').length },
    registersFrom7ST2: only7st, syntheticRegisters: mt.stepInfo.map(s => s.register), syntheticSteps: mt.stepInfo,
    deviation7ST2vs7K00: deviations,
    originSpacingA: mt.frames.slice(1).map((f, i) => r3(dist(f.o, mt.frames[i].o))),          // between consecutive registers, -16 to +15
    steps: { riseA: A_FORM_RISE, twistDeg: A_FORM_TWIST },
  };
  const antiSD = { sequence: antiSeq, source: '7ST2 16S author 1535-1540 after superposition', synthetic: 0, c1Distance1535to1540A: r3(dist(antiC1[0], antiC1[5])) };
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: 'ribosome-70s', name: 'E. coli 70S ribosome (30S and 50S subunits)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: '7K00', url: e7.url, title: p7k.title, method: p7k.method, resolutionA: p7k.resolutionA, organism: rows[0].organism,
      downloaded: e7.downloaded, revisionDate: p7k.revisionDate, sha256: e7.sha256, license: ctx.LICENSE,
      chainsUsed: [`${rows.length} ribosomal chains: ${rows.map(r => r.id).join(' ')} (16S, 30S proteins, 23S, 5S, 50S proteins)`, `X (mRNA, mrna track registers -3 to +8)`, `${pSite.trna} (P-site tRNA-fMet, siteP)`, `${aSite.trna} (A-site tRNA-Val, siteA)`, '5 (E-site fragment, check only)'],
      additionalSources: secondary,
      frame: { name: 'ribo', origin: `centroid of C1' of 7K00 chain X author ${pSite.start}-${pSite.start + 2}`, z: `unit vector to the centroid of C1' of author ${aSite.start}-${aSite.start + 2}`, x: `component of (centroid of ${an.rna23P} 23S P atoms - origin) perpendicular to z`, y: 'z x x', sourceFrame: { o: A.o.map(r3), R: Array.from(A.R, r6) } },
      superpositions, siteChecks, codonPairing, mrna: mrnaRec, antiSD, tunnel: tunnelSource,
      notes: [
        'Generated by tools/build-assets.mjs (recipe tools/assets/ribosome.mjs) from the mmCIF files pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens). Full provenance: docs/assets/ribosome-70s.md.',
        `Ribo frame (PLAN.md 7.3): origin = centroid of C1' of mRNA ${pSite.pairing.codon} (7K00 chain X author ${pSite.start}-${pSite.start + 2}); +z toward the centroid of C1' of the A-site codon ${aSite.pairing.codon} (author ${aSite.start}-${aSite.start + 2}); +x = component of (centroid of all 23S P atoms - origin) perpendicular to z; +y = z x x. The P- and A-site codons are found by geometric Watson-Crick pairing with the tRNAs, not assumed.`,
        'Parts: small = 16S + S2-S21; large = 23S + 5S + L proteins. mRNA, tRNAs and the E-site fragment are excluded from parts, L0, L1 and L2. L1: P beads for RNA (kind 1), CA beads for protein (kind 0). chains[].residues = L1 beads; chains[].modelled = modelled residues.',
        `L0: one envelope per part from all its L1 beads (Gaussian density sigma ${L0.sigma} A, requested spacing ${L0.spacing} A, per-part triangle limit ${L0.maxTrianglesPerPart}; actual spacing ${lod0.parts.map(m => `${m.part} ${m.spacing}`).join(', ')} A); L1 beads inside: ${lod0.parts.map(m => `${m.part} ${m.beadsInside}`).join(', ')}.`,
        `L2 sites ${L2_SITES.map(s => `${s.anchor} ${s.radius} A`).join(', ')}: heavy atoms of whole rRNA and protein residues with any atom within the radius of the anchor origin (deduplicated across sites), plus Mg2+ within ${L2_ION_RADIUS} A of a site origin (chain index = chain of the nearest polymer heavy atom; the entry's auth_asym_id of ions is not used). Bonds by covalent radii inside a residue, plus peptide C-N and phosphodiester O3'-P between consecutive residues.`,
        'Site anchors siteA, siteP, siteE and siteAT are the trna frame (trnaFrame in tools/assets/trna.mjs) of the tRNA in the ribo frame, so placing a trna-* asset with an anchor reproduces the source coordinates. See source.siteChecks and source.superpositions.',
        'Superposition (other entries onto 7K00): P atoms of 16S and 23S residues with equal author number and equal residue name, superposeIterative (2.0 A cutoff, two passes). Author numbers are used because the 7ST2 16S label_seq_id is the author number minus one.',
        'siteAP and sitePE are decided by source.siteChecks.hybrid.decision (4.0 A anticodon-origin condition, 16S+23S fit as written in PLAN.md 7.3).',
        'Track mrna: registers -16 to +15, register 0 = first nucleotide of the P-site codon; tracks.mrna.sources gives 7K00, 7ST2 or synthetic per register; synthetic registers are A-form single-strand steps (rise 2.81 A, twist 32.73 degrees about the local z axis) from the nearest fitted register; their bases come from the deposited _entity_poly mRNA sequence of 7K00 (registers -16, -15, +9 to +11) or 7ST2 (+12 to +15), recorded per register (baseFrom) in the syntheticSteps list of the mRNA record in source. Anchors mrnaEntry and mrnaExit are frames of registers +15 and -16 and are marked synthetic.',
        'antiSD: centroid of the heavy atoms of 7ST2 16S author 1535-1540 (CCUCCU) after superposition; z = unit vector from C1\' of 1535 to C1\' of 1540. 7K00 16S ends at 1534.',
        `Path tunnel (starts at the ptc end, residue k at arc length k x 3.40 A, ends at tunnelExit = the tunnel mouth): Dijkstra on a 1 A voxel grid around the 50S (blocked within 3.0 A of any 50S heavy atom; cost = step / clearance squared), three Chaikin passes, resampled at 1.0 A, truncated at the first solvent-side point after 60 A of arc (deviation from PLAN.md 7.4 step 2; the 13 straight-line fallback was rejected because it crosses rRNA); see source.tunnel. Anchors ptc (O3 prime of A76 of the P-site tRNA; z = first path segment) and tunnelExit (last path point; z = last segment).`,
      ],
    },
    bounds,
    parts: PARTS.map(p => ({ ...p })),
    chains: chainDefs,
    lod0,
    lod1: { count: l1Count, positions: encodePositions(l1Pos), chain: encodeArray(Uint8Array.from(l1Chain)), kind: encodeArray(Uint8Array.from(l1Kind)) },
    lod2, anchors, tracks, paths,
  };
  const problems = validateAsset(asset);
  if (problems.length) throw new Error('ribosome-70s invalid:\n' + problems.join('\n'));
  const bytes = Buffer.byteLength(JSON.stringify(asset));
  if (bytes > LIMITS.fileBytes) throw new Error(`ribosome-70s: ${bytes} bytes exceeds ${LIMITS.fileBytes}`);

  const count = (cls, part) => chainDefs.filter(c => c.part === part && c.subunit === cls).length;
  const report = {
    chains: chainDefs.length, parts: { small: chainDefs.filter(c => c.part === 'small').length, large: chainDefs.filter(c => c.part === 'large').length },
    subunits: Object.fromEntries(CLASSES.map(c => [c.subunit, count(c.subunit, c.part)])),
    l1Beads: l1Count, l0: l0.map(({ part, env, ms }) => ({ part, triangles: env.indices.length / 3, vertices: env.positions.length / 3, sigma: env.sigma, spacing: env.spacing, beadsInside: env.insideByRay, closed: ms.closed })),
    l0TrianglesTotal: triTotal, l2Atoms: l2.all.length, l2Polymer: l2.nPolymer, l2Ions: l2.nIons, l2Bonds: l2.bonds.length / 2, l2Residues: l2.residues, fileBytes: bytes,
    superpositions: superpositions.map(s => ({ mobile: s.mobile, scope: s.scope, nBefore: s.nBefore, nAfter: s.nAfter, rmsdBeforeA: s.rmsdBeforeA, rmsdAfterA: s.rmsdAfterA, mismatches: s.nameMismatchesExcluded })),
    eSite: siteChecks.eSite, hybrid: hybrid.decision, hybridFits: hybrid.fits, mrna: mrnaRec.counts, deviations, codonPairing, stSiteP: siteChecks.stSiteP, bounds,
  };
  return { asset, report };

  function ptOfSup(sup) { return p => add(mulMV(sup.R, p), sup.o); }
}

export const recipes = [
  { id: 'ribosome-70s', sources: ['7K00', '7ST2', '5WE4', '7PJV'], build: buildRibosome },
];
