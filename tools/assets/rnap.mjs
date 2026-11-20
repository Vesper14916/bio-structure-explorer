// Recipe module for E. coli RNA polymerase assets (Asset Format v2, Round 3 task R3-A4):
//   - rnap-ec   (PDB 6ALF primary; 7YPA hairpin anchor; 6ZTJ expressome anchor, coupledMrna path, coupling distance D)
//   - rnap-holo (PDB 6C9Y primary; 6CA0 RPo open-promoter DNA tracks)
// Preserves L0, L1, and L2 geometry/buffers byte-for-byte from Round 2 Wave 1.
import fs from 'node:fs';
import path from 'node:path';
import { ASSET_FORMAT, ASSET_VERSION, QUANT_STEP, encodeArray, encodePositions, decodePositions, validateAsset } from '../../js/assets/format.js';
import { dist, invApplyFrame, applyFrame, kabsch, mulMM, mulMV, cross, dot, norm, sub, scale, add } from '../../js/science/math.js';
import { polymerChains } from '../lib/mmcif.mjs';
import { fitBaseFrame, residueBase, interpolateFrames, fitLine } from '../lib/frames.mjs';
import { envelope, meshStats } from '../lib/surface.mjs';
import { matchChains } from '../lib/match.mjs';
import { superposeIterative } from '../lib/superpose.mjs';
import { frameAtoms } from './ribosome.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15, S: 16, SE: 34, MG: 12, ZN: 30 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07 };
const PAIR_MAX_ORIGIN = 2.5;           // A, pairing rule (see pairStrands)
const L2_RADIUS = 12, L2_ION_RADIUS = 20, L2_MAX_ATOMS = 3000, ACTIVE_MG_MAX = 10;
const HOLO_MAX_RMSD = 6;
const RNAP_SUP_GATE = 2.5;             // A (PLAN.md 7.3, DEC-010)
const RIBO_SUP_GATE = 1.5;             // A (PLAN.md 7.3, DEC-010)
const MIN_KEPT_FRACTION = 0.5;         // DEC-010
const NTP_RAYS = 256, NTP_EXCLUDE_DEG = 35, NTP_T_LO = 5, NTP_T_HI = 35, NTP_ORIGIN_DIST = 30;
const DNA_COMP = { A: 'T', T: 'A', C: 'G', G: 'C' };

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });
const transpose = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const col = (R, k) => [R[k], R[3 + k], R[6 + k]];
const frameFromAxes = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const mid = (a, b) => scale(add(a, b), 0.5);
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;
const composeT = (A, B) => ({ R: mulMM(A.R, B.R), o: add(mulMV(A.R, B.o), A.o) });
const invertT = T => { const Rt = transpose(T.R); return { R: Rt, o: scale(mulMV(Rt, T.o), -1) }; };
const ptOf = T => p => add(mulMV(T.R, p), T.o);
const frameOf = T => f => ({ o: add(mulMV(T.R, f.o), T.o), R: mulMM(T.R, f.R) });

/** Frame whose +z is `z` and whose +x is the component of `ref` perpendicular to z (PLAN.md 7.4). */
function axisFrame(o, z, refs = [[1, 0, 0], [0, 1, 0]]) {
  let ref = refs[0];
  if (angleDeg(z, ref) < 10 || angleDeg(z, ref) > 170) ref = refs[1];
  const x = norm(sub(ref, scale(z, dot(ref, z))));
  return { o, R: frameFromAxes(x, cross(z, x), z) };
}

const SUBUNITS = [
  { key: 'alpha', re: /RNA polymerase subunit alpha$/i, label: 'α', gene: 'rpoA' },
  { key: 'betaPrime', re: /RNA polymerase subunit beta'$/i, label: 'β′', gene: 'rpoC' },
  { key: 'beta', re: /RNA polymerase subunit beta$/i, label: 'β', gene: 'rpoB' },
  { key: 'omega', re: /RNA polymerase subunit omega$/i, label: 'ω', gene: 'rpoZ' },
  { key: 'sigma70', re: /RNA polymerase sigma factor RpoD$/i, label: 'σ70', gene: 'rpoD' },
];
const SUBS = Object.fromEntries(SUBUNITS.map(s => [s.key, s]));
const CORE_KEYS = ['alpha', 'beta', 'betaPrime', 'omega'];

export function inventory(parsed) {
  const ent = new Map(parsed.entities.map(e => [e.id, e]));
  const chains = polymerChains(parsed);
  const rows = [];
  for (const c of chains.values()) {
    const e = ent.get(c.entity);
    const sub = e.class === 'protein' ? SUBUNITS.find(s => s.re.test(e.description)) : null;
    rows.push({ id: c.id, entity: e.id, description: e.description, class: e.class, residues: c.residues.length, organism: e.organism, subunit: sub ? sub.key : null, chain: c });
  }
  return rows;
}

export function fitChain(chain) {
  for (const r of chain.residues) {
    r.base = residueBase(r.comp);
    if (!r.base) throw new Error(`chain ${chain.id} residue ${r.seq}: unknown nucleotide ${r.comp}`);
    r.fit = fitBaseFrame(r.atoms, r.base);
  }
}

function pairStrands(c1, c2) {
  const u1 = c1.residues.filter(r => r.fit.usable), u2 = c2.residues.filter(r => r.fit.usable);
  const cand = [];
  for (const a of u1) for (const b of u2) {
    const d = dist(a.fit.o, b.fit.o);
    const za = [a.fit.R[2], a.fit.R[5], a.fit.R[8]], zb = [b.fit.R[2], b.fit.R[5], b.fit.R[8]];
    if (d <= PAIR_MAX_ORIGIN && dot(za, zb) < 0) cand.push({ a, b, d, normalAngle: angleDeg(za, scale(zb, -1)) });
  }
  cand.sort((p, q) => p.d - q.d || p.a.seq - q.a.seq || p.b.seq - q.b.seq);
  const usedA = new Set(), usedB = new Set(), pairs = [];
  for (const c of cand) {
    if (usedA.has(c.a) || usedB.has(c.b)) continue;
    usedA.add(c.a); usedB.add(c.b); pairs.push(c);
  }
  return pairs.sort((p, q) => p.a.seq - q.a.seq);
}

function analyseEc(parsed, pdbId) {
  const rows = inventory(parsed);
  const dna = rows.filter(r => r.class === 'dna'), rna = rows.filter(r => r.class === 'rna');
  if (rna.length !== 1) throw new Error(`${pdbId}: expected one RNA chain, found ${rna.length}`);
  if (dna.length !== 2) throw new Error(`${pdbId}: expected two DNA chains, found ${dna.length}`);
  for (const r of [...dna, ...rna]) fitChain(r.chain);
  const R = rna[0].chain;
  const hyb = dna.map(d => pairStrands(d.chain, R));
  const ti = hyb[0].length >= hyb[1].length ? 0 : 1;
  const T = dna[ti].chain, NT = dna[1 - ti].chain, hybrid = hyb[ti];
  if (hyb[1 - ti].length) throw new Error(`${pdbId}: both DNA chains pair with RNA`);
  const duplex = pairStrands(NT, T);

  const last = R.residues[R.residues.length - 1];
  const rnaReg = r => -1 - (last.seq - r.seq);
  const p1 = hybrid.find(p => p.b === last);
  if (!p1) throw new Error(`${pdbId}: RNA 3'-terminal nucleotide is not paired with the template`);
  const tReg = r => -1 + (p1.a.seq - r.seq);
  const hybridConsistent = hybrid.every(p => tReg(p.a) === rnaReg(p.b));
  if (!hybridConsistent) throw new Error(`${pdbId}: RNA-template pairs are not in register`);
  const ntPaired = new Map(duplex.map(p => [p.a.seq, tReg(p.b)]));
  const offsets = [...new Set(duplex.map(p => tReg(p.b) - p.a.seq))];
  const ntOffset = offsets.length === 1 ? offsets[0] : null;
  return { rows, T, NT, R, hybrid, duplex, rnaReg, tReg, ntPaired, ntOffset, offsets, last, pdbId,
    hybridBp: hybrid.length, downstreamBp: duplex.filter(p => tReg(p.b) >= 0).length };
}

export function buildTrack(kind, residues, regOf, seqRange) {
  const byReg = new Map();
  for (const r of residues) byReg.set(regOf(r), r);
  const regs = [...byReg.keys()];
  let lo = Math.min(...regs), hi = Math.max(...regs);
  if (seqRange) { lo = seqRange[0]; hi = seqRange[1]; }
  const frames = [], bases = [], registers = [], usedResidues = [];
  for (let k = lo; k <= hi; k++) {
    const r = byReg.get(k);
    frames.push(r && r.fit.usable ? { o: r.fit.o, R: r.fit.R } : null);
    bases.push(r ? r.base : null);
    registers.push(k);
    usedResidues.push(r || null);
  }
  const it = interpolateFrames(frames);
  const n = it.frames.length;
  return {
    kind, registers: registers.slice(it.start, it.start + n), frames: it.frames, synthetic: it.synthetic,
    basesRaw: bases.slice(it.start, it.start + n), residues: usedResidues.slice(it.start, it.start + n),
  };
}

function l2Atoms(parsed, chainIds, centre, radius) {
  const chainIndex = new Map(chainIds.map((id, i) => [id, i]));
  const prot = parsed.atoms.filter(a => chainIndex.has(a.authAsym) && a.group === 'ATOM' && a.labelSeq !== null);
  const resKey = a => a.authAsym + ':' + a.labelSeq;
  const near = new Set();
  for (const a of prot) if (dist([a.x, a.y, a.z], centre) <= radius) near.add(resKey(a));
  const atoms = prot.filter(a => near.has(resKey(a)));
  atoms.sort((p, q) => chainIndex.get(p.authAsym) - chainIndex.get(q.authAsym) || p.labelSeq - q.labelSeq);
  const ions = parsed.atoms.filter(a => (a.comp === 'MG' || a.comp === 'ZN') && dist([a.x, a.y, a.z], centre) <= L2_ION_RADIUS);
  return { atoms, ions };
}

function l2Bonds(atoms) {
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i], ra = COVALENT[a.element];
    if (ra === undefined) continue;
    for (let j = i + 1; j < atoms.length; j++) {
      const b = atoms[j];
      if (b.authAsym !== a.authAsym) break;
      if (b.labelSeq - a.labelSeq > 1) break;
      const rb = COVALENT[b.element];
      if (rb === undefined) continue;
      if (dist([a.x, a.y, a.z], [b.x, b.y, b.z]) < ra + rb + 0.45) bonds.push(i, j);
    }
  }
  return bonds;
}

function machineLods(parsed, groups, P, activeSite, centre) {
  const chains = [], l1Pos = [], l1Chain = [], l1Kind = [], partBeads = [];
  let alphaSeen = 0;
  for (const g of groups) {
    const beads = [];
    for (const r of g.rows) {
      const ci = chains.length;
      let n = 0;
      for (const res of r.chain.residues) if (res.atoms.CA) { const q = P(res.atoms.CA); l1Pos.push(...q); beads.push(...q); l1Chain.push(ci); l1Kind.push(0); n++; }
      const s2 = SUBS[r.subunit];
      const tag = r.subunit === 'alpha' ? (++alphaSeen === 1 ? ' I' : ' II') : '';
      chains.push({ id: r.id, part: g.part, class: 'protein', name: `${s2.label}${tag} (${s2.gene})`, residues: n, subunit: r.subunit });
    }
    partBeads.push({ part: g.part, beads });
  }
  const parts = partBeads.map(({ part, beads }) => {
    const env = envelope(beads, { sigma: 5, spacing: 5, maxTriangles: 12000 });
    const ms = meshStats(env.positions, env.indices);
    if (env.insideByRay < 0.95) throw new Error(`L0 ${part}: only ${env.insideByRay} of beads inside`);
    if (!ms.closed || ms.signedVolume <= 0) throw new Error(`L0 ${part}: mesh not closed/outward: ${JSON.stringify(ms)}`);
    return { part, env, ms };
  });
  const lod0 = { parts: parts.map(({ part, env }) => {
    const nv = env.positions.length / 3;
    return {
      part, positions: encodePositions(env.positions),
      indices: nv < 65536 ? encodeArray(Uint16Array.from(env.indices)) : encodeArray(Uint32Array.from(env.indices)),
      indexType: nv < 65536 ? 'u16' : 'u32', vertexCount: nv, triangleCount: env.indices.length / 3,
      sigma: env.sigma, spacing: env.spacing, beadsInside: r3(env.insideByRay),
    };
  }) };
  const ids = chains.map(c => c.id);
  let radius = L2_RADIUS, l2;
  for (;;) {
    l2 = l2Atoms(parsed, ids, activeSite, radius);
    if (l2.atoms.length + l2.ions.length <= L2_MAX_ATOMS) break;
    radius -= 1;
  }
  const bonds = l2Bonds(l2.atoms);
  const l2All = [...l2.atoms, ...l2.ions];
  const l2Pos = [], l2El = [], l2Ch = [];
  for (const a of l2All) {
    const zEl = ELEMENT_Z[a.element];
    if (!zEl) throw new Error(`L2: no atomic number for element ${a.element}`);
    l2Pos.push(...P([a.x, a.y, a.z])); l2El.push(zEl); l2Ch.push(Math.max(0, ids.indexOf(a.authAsym)));
  }
  const centreA = P(centre);
  let rad = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < l1Pos.length; i += 3) {
    const p = [l1Pos[i], l1Pos[i + 1], l1Pos[i + 2]];
    rad = Math.max(rad, dist(p, centreA));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return {
    chains, parts, l1Pos,
    bounds: { center: centreA.map(r3), radius: r3(rad), size: [0, 1, 2].map(k => r3(hi[k] - lo[k])) },
    lod0,
    lod1: { count: l1Chain.length, positions: encodePositions(l1Pos), chain: encodeArray(Uint8Array.from(l1Chain)), kind: encodeArray(Uint8Array.from(l1Kind)) },
    lod2: {
      count: l2All.length, positions: encodePositions(l2Pos), element: encodeArray(Uint8Array.from(l2El)), chain: encodeArray(Uint8Array.from(l2Ch)),
      bonds: encodeArray(Uint16Array.from(bonds)), bondCount: bonds.length / 2, sites: [{ anchor: 'activeSite', radius }],
    },
    report: {
      l1: l1Chain.length,
      l0: parts.map(({ part, env, ms }) => ({ part, triangles: env.indices.length / 3, vertices: env.positions.length / 3, spacing: env.spacing,
        iso: env.iso, isoQuantile: env.quantile, beadsInside: env.insideByRay, closed: ms.closed, volume: ms.signedVolume })),
      l2Atoms: l2All.length, l2Ions: l2.ions.length, l2Bonds: bonds.length / 2, l2Radius: radius,
    },
  };
}

function entitySequence(parsed, entityId) {
  const seq = parsed.entityPolySeq && parsed.entityPolySeq[entityId];
  if (!seq) throw new Error(`no _entity_poly sequence for entity ${entityId}`);
  return seq;
}

function segments(t) {
  const out = [];
  for (let i = 0; i < t.synthetic.length; i++) {
    if (!t.synthetic[i]) continue;
    let j = i; while (j + 1 < t.synthetic.length && t.synthetic[j + 1]) j++;
    out.push([t.registers[i], t.registers[j]]); i = j;
  }
  return out;
}

function additionalSourceMeta(entry, parsed, usedFor, chainsUsed) {
  return {
    pdbId: entry.pdbId,
    url: entry.url,
    title: parsed.title,
    method: parsed.method,
    resolutionA: parsed.resolutionA,
    downloaded: entry.downloaded,
    revisionDate: parsed.revisionDate,
    sha256: entry.sha256,
    chainsUsed,
    usedFor,
  };
}

/**
 * Secondary-channel NTP entrance anchor via 256-ray Fibonacci-sphere casting (PLAN.md §7.4).
 * Discards rays within 35 deg of +z, -z, or activeSite -> rnaExit. For each kept ray, takes
 * the exact minimum distance to any L1 bead over t in [5, 35] A along the ray and picks the
 * ray with the largest minimum clearance. Origin = activeSite + 30 * ray; +z = -ray.
 */
function computeNtpEntry(activeSite, rnaExit, l1Positions) {
  const toExit = norm(sub(rnaExit, activeSite));
  const phi = Math.PI * (3 - Math.sqrt(5));
  const nBeads = l1Positions.length / 3;
  let bestDir = null, bestMin = -Infinity, raysKept = 0;

  for (let i = 0; i < NTP_RAYS; i++) {
    const y = 1 - 2 * (i + 0.5) / NTP_RAYS;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    const dir = [Math.cos(theta) * r, y, Math.sin(theta) * r];
    if (angleDeg(dir, [0, 0, 1]) < NTP_EXCLUDE_DEG) continue;
    if (angleDeg(dir, [0, 0, -1]) < NTP_EXCLUDE_DEG) continue;
    if (angleDeg(dir, toExit) < NTP_EXCLUDE_DEG) continue;
    raysKept++;

    let minD2 = Infinity;
    for (let j = 0; j < nBeads; j++) {
      const dx = l1Positions[3 * j] - activeSite[0];
      const dy = l1Positions[3 * j + 1] - activeSite[1];
      const dz = l1Positions[3 * j + 2] - activeSite[2];
      let t = dx * dir[0] + dy * dir[1] + dz * dir[2];
      if (t < NTP_T_LO) t = NTP_T_LO;
      else if (t > NTP_T_HI) t = NTP_T_HI;
      const ex = dx - t * dir[0], ey = dy - t * dir[1], ez = dz - t * dir[2];
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < minD2) minD2 = d2;
    }
    const minD = Math.sqrt(minD2);
    if (minD > bestMin) { bestMin = minD; bestDir = dir; }
  }
  if (!bestDir) throw new Error('computeNtpEntry: no rays remained after 35 deg exclusions');

  const origin = add(activeSite, scale(bestDir, NTP_ORIGIN_DIST));
  const frame = axisFrame(origin, scale(bestDir, -1));
  return {
    anchor: { ...frameOut(frame), synthetic: 1 },
    report: {
      raysTotal: NTP_RAYS,
      raysKept,
      excludeDeg: NTP_EXCLUDE_DEG,
      rangeA: [NTP_T_LO, NTP_T_HI],
      originDistA: NTP_ORIGIN_DIST,
      minClearanceA: r3(bestMin),
      ray: bestDir.map(r6),
    },
  };
}

/**
 * Hairpin anchor on rnap-ec from PDB 7YPA (termination hairpin nucleation complex).
 * Superposes 7YPA beta (C) and beta' (D) Calpha onto 6ALF (I, J) (2-pass iterative, 2.0 A cutoff),
 * identifies the closing base pair of the RNA hairpin stem (I:10 C - H:-10 G), and defines the
 * anchor frame with origin at the closing pair midpoint, +z along the fitted 10-bp stem axis
 * toward the apical loop, and +x along the closing-pair dyad perpendicular to +z.
 */
function computeHairpinAnchor(ctx, alfChains, alfBetaId, alfBetaPrimeId, alfToRnap, rnaExit) {
  const ypaEntry = ctx.lockEntry('7YPA');
  const ypaParsed = ctx.loadSource(ypaEntry);
  const ypaRows = inventory(ypaParsed);
  const ypaBeta = ypaRows.find(r => r.subunit === 'beta');
  const ypaBetaPrime = ypaRows.find(r => r.subunit === 'betaPrime');
  const ypaRna = ypaRows.filter(r => r.class === 'rna');
  if (!ypaBeta || !ypaBetaPrime) throw new Error('7YPA: missing beta or beta\' chain');
  if (ypaRna.length !== 2) throw new Error(`7YPA: expected 2 RNA chains, found ${ypaRna.length}`);

  const ypaChains = polymerChains(ypaParsed);
  const m = matchChains(ypaChains, alfChains, [[ypaBeta.id, alfBetaId], [ypaBetaPrime.id, alfBetaPrimeId]], 'CA');
  const fit = superposeIterative(m.mobilePts, m.targetPts, { cutoff: 2.0, passes: 2 });
  const keptFraction = fit.n / fit.nBefore;
  ctx.log(`7YPA -> 6ALF RNAP beta/beta' superposition (${ypaBeta.id}->${alfBetaId}, ${ypaBetaPrime.id}->${alfBetaPrimeId}): ${fit.n}/${fit.nBefore} (${(keptFraction * 100).toFixed(1)}%), RMSD ${fit.rmsdBefore.toFixed(3)} -> ${fit.rmsd.toFixed(3)} A`);
  if (fit.rmsd > RNAP_SUP_GATE) throw new Error(`7YPA RNAP superposition RMSD ${fit.rmsd.toFixed(3)} A exceeds ${RNAP_SUP_GATE} A`);
  if (keptFraction < MIN_KEPT_FRACTION) throw new Error(`7YPA RNAP kept fraction ${keptFraction.toFixed(3)} < ${MIN_KEPT_FRACTION}`);

  const ypaToRnap = composeT(alfToRnap, { R: fit.R, o: fit.t });
  const tfF = frameOf(ypaToRnap);
  for (const r of ypaRna) fitChain(r.chain);
  // Identify the two arms: the shorter chain (I, 5' stem arm) vs the hybrid+3'-stem chain (H).
  const [arm5, arm3] = ypaRna[0].chain.residues.length <= ypaRna[1].chain.residues.length
    ? [ypaRna[0].chain, ypaRna[1].chain]
    : [ypaRna[1].chain, ypaRna[0].chain];
  const stemPairs = pairStrands(arm5, arm3);
  if (stemPairs.length < 8) throw new Error(`7YPA: expected >= 8 hairpin stem bp, found ${stemPairs.length}`);

  const bpData = stemPairs.map(p => {
    const fA = tfF(p.a.fit), fB = tfF(p.b.fit);
    return { p, fA, fB, center: mid(fA.o, fB.o) };
  });
  // Order from closing pair (nearest RNAP rnaExit) toward the apical loop.
  if (dist(bpData[bpData.length - 1].center, rnaExit) < dist(bpData[0].center, rnaExit)) bpData.reverse();
  const closing = bpData[0];
  const stemLine = fitLine(bpData.map(b => b.center));
  let z = stemLine.dir;
  if (dot(z, sub(bpData[bpData.length - 1].center, closing.center)) < 0) z = scale(z, -1);
  const dyad = norm(add(col(closing.fA.R, 0), col(closing.fB.R, 0)));
  const x = norm(sub(dyad, scale(z, dot(dyad, z))));
  const y = cross(z, x);
  const anchor = frameOut({ o: closing.center, R: frameFromAxes(x, y, z) });

  const superposition = {
    mobile: '7YPA',
    reference: '6ALF',
    role: 'hairpin anchor',
    scope: "beta + beta' Calpha",
    mobileChains: [ypaBeta.id, ypaBetaPrime.id],
    referenceChains: [alfBetaId, alfBetaPrimeId],
    matching: 'Calpha atoms matched by label_seq_id',
    nBefore: fit.nBefore,
    nAfter: fit.n,
    keptFraction: r3(keptFraction),
    rmsdBeforeA: r3(fit.rmsdBefore),
    rmsdAfterA: r3(fit.rmsd),
    cutoffA: 2.0,
    passes: 2,
    gateRmsdA: RNAP_SUP_GATE,
    gateKeptFraction: MIN_KEPT_FRACTION,
    passesGate: fit.rmsd <= RNAP_SUP_GATE && keptFraction >= MIN_KEPT_FRACTION,
  };
  const closingPair = {
    arm5: `${arm5.id}:${closing.p.a.authSeq} (${closing.p.a.base})`,
    arm3: `${arm3.id}:${closing.p.b.authSeq} (${closing.p.b.base})`,
    originDistanceA: r3(closing.p.d),
    stemBpCount: bpData.length,
    distanceToRnaExitA: r3(dist(closing.center, rnaExit)),
  };
  return {
    anchor,
    superposition,
    closingPair,
    sourceMeta: additionalSourceMeta(
      ypaEntry,
      ypaParsed,
      'hairpin anchor (termination hairpin closing base pair and stem axis)',
      [`${ypaBeta.id} (β)`, `${ypaBetaPrime.id} (β′)`, `${arm5.id} (RNA 5' hairpin arm)`, `${arm3.id} (RNA hybrid + 3' hairpin arm)`],
    ),
  };
}

/**
 * Load ribosome-70s mrnaEntry anchor and L1 bead positions in the ribo frame from ctx.built
 * (when built in the same run) or from committed assets/ribosome-70s.asset.json.
 */
function loadRiboAnchorAndL1(ctx) {
  const builtRibo = ctx.built.get('ribosome-70s');
  const raw = builtRibo
    ? builtRibo.asset
    : JSON.parse(fs.readFileSync(path.join(ctx.root, 'assets', 'ribosome-70s.asset.json'), 'utf8'));
  const mrnaEntry = raw.anchors && raw.anchors.mrnaEntry && raw.anchors.mrnaEntry.o;
  if (!mrnaEntry) throw new Error('ribosome-70s: missing anchors.mrnaEntry');
  const l1Positions = decodePositions(raw.lod1.positions);
  return { mrnaEntry, l1Positions };
}

/**
 * Expressome coupling geometry from PDB 6ZTJ (NusG-coupled expressome):
 * - Superposes 6ZTJ RNAP beta (CC) + beta' (CD) Calpha onto 6ALF (gate <= 2.5 A, kept >= 50%).
 * - Superposes 6ZTJ ribosome 16S (AA) + 23S (BA) P atoms onto 7K00 in the ribo frame via
 *   tools/assets/ribosome.mjs#frameAtoms matched by (authSeq, comp) (DEC-011; gate <= 1.5 A, kept >= 50%).
 * - Computes the `expressome` anchor placing ribosome-70s (ribo frame) into the rnap frame.
 * - Builds the `coupledMrna` path from RNAP rnaExit through observed 6ZTJ mRNA AV:41..23 to ribosome mrnaEntry.
 * - Computes exact coupling distance D from 6ZTJ mRNA numbering (AV:16 P-site nt 1 to AV:53 RNA 3' end).
 */
function computeExpressome(ctx, alfChains, alfBetaId, alfBetaPrimeId, alfToRnap, rnaExit, ecL1Positions) {
  const ztjEntry = ctx.lockEntry('6ZTJ');
  const ztjParsed = ctx.loadSource(ztjEntry);
  const ztjChains = polymerChains(ztjParsed);
  const ztjEnt = new Map(ztjParsed.entities.map(e => [e.id, e]));

  const findChain = (pred, label) => {
    const hits = [...ztjChains.values()].filter(c => pred(c, ztjEnt.get(c.entity)));
    if (hits.length !== 1) throw new Error(`6ZTJ: expected 1 chain for ${label}, found ${hits.map(c => c.id).join(', ')}`);
    return hits[0];
  };
  const ztjBeta = findChain((c, e) => e.class === 'protein' && /RNA polymerase subunit beta$/i.test(e.description), 'RNAP beta');
  const ztjBetaPrime = findChain((c, e) => e.class === 'protein' && /RNA polymerase subunit beta'$/i.test(e.description), "RNAP beta'");
  const ztj16S = findChain((c, e) => e.class === 'rna' && /^16S/i.test(e.description), '16S rRNA');
  const ztj23S = findChain((c, e) => e.class === 'rna' && /^23S/i.test(e.description), '23S rRNA');
  const ztjMrna = ztjChains.get('AV');
  const ztjTemplate = ztjChains.get('CT');
  const ztjPtrna = ztjChains.get('AW');
  if (!ztjMrna || !ztjTemplate || !ztjPtrna) throw new Error('6ZTJ: expected mRNA AV, template CT, and P-tRNA AW');

  // 1. 6ZTJ RNAP -> 6ALF (beta + beta' Calpha)
  const rnapMatch = matchChains(ztjChains, alfChains, [[ztjBeta.id, alfBetaId], [ztjBetaPrime.id, alfBetaPrimeId]], 'CA');
  const rnapFit = superposeIterative(rnapMatch.mobilePts, rnapMatch.targetPts, { cutoff: 2.0, passes: 2 });
  const rnapKept = rnapFit.n / rnapFit.nBefore;
  ctx.log(`6ZTJ -> 6ALF RNAP beta/beta' superposition (${ztjBeta.id}->${alfBetaId}, ${ztjBetaPrime.id}->${alfBetaPrimeId}): ${rnapFit.n}/${rnapFit.nBefore} (${(rnapKept * 100).toFixed(1)}%), RMSD ${rnapFit.rmsdBefore.toFixed(3)} -> ${rnapFit.rmsd.toFixed(3)} A`);
  if (rnapFit.rmsd > RNAP_SUP_GATE) throw new Error(`6ZTJ RNAP superposition RMSD ${rnapFit.rmsd.toFixed(3)} A exceeds ${RNAP_SUP_GATE} A`);
  if (rnapKept < MIN_KEPT_FRACTION) throw new Error(`6ZTJ RNAP kept fraction ${rnapKept.toFixed(3)} < ${MIN_KEPT_FRACTION}`);
  const ztjToRnap = composeT(alfToRnap, { R: rnapFit.R, o: rnapFit.t });

  // 2. 6ZTJ ribosome -> 7K00 in ribo frame (16S + 23S P atoms matched by authSeq + comp, DEC-011)
  const riboRef = frameAtoms(ctx.sourcesDir);
  const riboRefChains = new Map();
  for (const a of riboRef.atoms) {
    if (a.name !== 'P') continue;
    let c = riboRefChains.get(a.chain);
    if (!c) { c = { id: a.chain, residues: [] }; riboRefChains.set(a.chain, c); }
    c.residues.push({ seq: a.labelSeq, authSeq: a.authSeq, comp: a.comp, atoms: { P: [a.x, a.y, a.z] } });
  }
  const riboMatch = matchChains(ztjChains, riboRefChains, [[ztj16S.id, 'A'], [ztj23S.id, 'a']], 'P', { key: 'authSeq', matchComp: true });
  const riboFit = superposeIterative(riboMatch.mobilePts, riboMatch.targetPts, { cutoff: 2.0, passes: 2 });
  const riboKept = riboFit.n / riboFit.nBefore;
  ctx.log(`6ZTJ -> 7K00(ribo) 16S/23S P superposition (${ztj16S.id}->A, ${ztj23S.id}->a): ${riboFit.n}/${riboFit.nBefore} (${(riboKept * 100).toFixed(1)}%), RMSD ${riboFit.rmsdBefore.toFixed(3)} -> ${riboFit.rmsd.toFixed(3)} A`);
  if (riboFit.rmsd > RIBO_SUP_GATE) throw new Error(`6ZTJ ribosome superposition RMSD ${riboFit.rmsd.toFixed(3)} A exceeds ${RIBO_SUP_GATE} A`);
  if (riboKept < MIN_KEPT_FRACTION) throw new Error(`6ZTJ ribosome kept fraction ${riboKept.toFixed(3)} < ${MIN_KEPT_FRACTION}`);
  const ztjToRibo = { R: riboFit.R, o: riboFit.t };

  // 3. expressome anchor: places ribosome-70s (ribo frame) into the rnap frame
  const expressome = composeT(ztjToRnap, invertT(ztjToRibo));
  const expressomeAnchor = frameOut(expressome);

  // 4. Verify coupling distance D from 6ZTJ mRNA AV numbering and base-pairing
  fitChain(ztjMrna);
  fitChain(ztjTemplate);
  for (const r of ztjPtrna.residues) {
    r.base = residueBase(r.comp);
    r.fit = r.base ? fitBaseFrame(r.atoms, r.base) : { usable: false };
  }
  const hybridPairs = pairStrands(ztjTemplate, ztjMrna);
  if (hybridPairs.length < 8) throw new Error(`6ZTJ: expected >= 8 bp RNA-DNA hybrid, found ${hybridPairs.length}`);
  const rna3End = ztjMrna.residues[ztjMrna.residues.length - 1];
  const rna3Paired = hybridPairs.some(p => p.b === rna3End);
  if (!rna3Paired) throw new Error(`6ZTJ: mRNA 3' end AV:${rna3End.authSeq} is not paired with template CT`);

  const antiPairs = pairStrands(ztjMrna, ztjPtrna);
  if (antiPairs.length < 3) throw new Error(`6ZTJ: expected P-site codon-anticodon triplet on AV/AW, found ${antiPairs.length} pairs`);
  const pCodonStart = Math.min(...antiPairs.map(p => p.a.authSeq));
  const pCodonSeqs = [pCodonStart, pCodonStart + 1, pCodonStart + 2];
  const avByAuth = new Map(ztjMrna.residues.map(r => [r.authSeq, r]));
  const pCodonBases = pCodonSeqs.map(k => avByAuth.get(k)?.base || '?').join('');
  if (pCodonBases !== 'AUG') throw new Error(`6ZTJ: expected P-site codon AUG at AV:${pCodonStart}, found ${pCodonBases}`);

  // Count modelled and unmodelled nucleotides from pCodonStart (inclusive) to rna3End (inclusive).
  let unmodelledInSpan = 0;
  for (let k = pCodonStart; k <= rna3End.authSeq; k++) {
    if (!avByAuth.has(k)) unmodelledInSpan++;
  }
  const D = rna3End.authSeq - pCodonStart + 1;
  const tfZ = ptOf(ztjToRnap);
  const tfE = ptOf(expressome);

  // 5. Clash audit: minimum distance between ribosome-70s L1 (at expressome) and rnap-ec L1
  const { mrnaEntry, l1Positions: riboL1Raw } = loadRiboAnchorAndL1(ctx);
  const mrnaEntryInRnap = tfE(mrnaEntry);
  const nRibo = riboL1Raw.length / 3;
  const nRnap = ecL1Positions.length / 3;
  let minRiboRnapD2 = Infinity;
  for (let i = 0; i < nRibo; i++) {
    const q = tfE([riboL1Raw[3 * i], riboL1Raw[3 * i + 1], riboL1Raw[3 * i + 2]]);
    for (let j = 0; j < nRnap; j++) {
      const dx = q[0] - ecL1Positions[3 * j];
      const dy = q[1] - ecL1Positions[3 * j + 1];
      const dz = q[2] - ecL1Positions[3 * j + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minRiboRnapD2) minRiboRnapD2 = d2;
    }
  }
  const minRiboRnapDistA = Math.sqrt(minRiboRnapD2);

  // 6. coupledMrna path: RNAP rnaExit -> observed 6ZTJ AV:41..23 (P atoms) -> synthetic bridge -> ribosome mrnaEntry
  // AV:41 is closest observed mRNA nucleotide outside RNAP exit channel (7.8 A from rnaExit);
  // AV:23 (ribosome register +7) is closest observed mRNA nucleotide to ribosome-70s mrnaEntry (25.5 A, min ribo L1 clearance 3.23 A).
  const pathPts = [];
  const pathSyn = [];
  pathPts.push(rnaExit);
  pathSyn.push(1);
  for (let k = 41; k >= 23; k--) {
    const res = avByAuth.get(k);
    const atom = res && (res.atoms.P || res.atoms["C4'"]);
    if (!atom) throw new Error(`6ZTJ: missing backbone atom for mRNA AV:${k}`);
    pathPts.push(tfZ(atom));
    pathSyn.push(0);
  }
  const bridgeStart = pathPts[pathPts.length - 1];
  const bridgeSteps = 5; // ~5.1 A per step over the 25.5 A gap to synthetic ribosome-70s mrnaEntry
  for (let s = 1; s <= bridgeSteps; s++) {
    const u = s / bridgeSteps;
    pathPts.push(add(scale(bridgeStart, 1 - u), scale(mrnaEntryInRnap, u)));
    pathSyn.push(1);
  }
  const flatPts = [];
  let pathLen = 0;
  for (let i = 0; i < pathPts.length; i++) {
    flatPts.push(pathPts[i][0], pathPts[i][1], pathPts[i][2]);
    if (i > 0) pathLen += dist(pathPts[i - 1], pathPts[i]);
  }
  const coupledMrna = {
    points: encodePositions(flatPts),
    count: pathPts.length,
    synthetic: pathSyn,
  };

  const superpositions = [
    {
      mobile: '6ZTJ',
      reference: '6ALF',
      role: 'expressome RNAP alignment',
      scope: "beta + beta' Calpha",
      mobileChains: [ztjBeta.id, ztjBetaPrime.id],
      referenceChains: [alfBetaId, alfBetaPrimeId],
      matching: 'Calpha atoms matched by label_seq_id',
      nBefore: rnapFit.nBefore,
      nAfter: rnapFit.n,
      keptFraction: r3(rnapKept),
      rmsdBeforeA: r3(rnapFit.rmsdBefore),
      rmsdAfterA: r3(rnapFit.rmsd),
      cutoffA: 2.0,
      passes: 2,
      gateRmsdA: RNAP_SUP_GATE,
      gateKeptFraction: MIN_KEPT_FRACTION,
      passesGate: rnapFit.rmsd <= RNAP_SUP_GATE && rnapKept >= MIN_KEPT_FRACTION,
    },
    {
      mobile: '6ZTJ',
      reference: '7K00',
      role: 'expressome ribosome alignment',
      scope: '16S + 23S P',
      mobileChains: [ztj16S.id, ztj23S.id],
      referenceChains: ['A', 'a'],
      matching: 'P atoms of rRNA residues matched by auth_seq_id and equal residue name (DEC-011)',
      matchedPerChain: { '16S': riboMatch.byChain[0].n, '23S': riboMatch.byChain[1].n },
      nameMismatchesExcluded: riboMatch.mismatches,
      nBefore: riboFit.nBefore,
      nAfter: riboFit.n,
      keptFraction: r3(riboKept),
      rmsdBeforeA: r3(riboFit.rmsdBefore),
      rmsdAfterA: r3(riboFit.rmsd),
      cutoffA: 2.0,
      passes: 2,
      gateRmsdA: RIBO_SUP_GATE,
      gateKeptFraction: MIN_KEPT_FRACTION,
      passesGate: riboFit.rmsd <= RIBO_SUP_GATE && riboKept >= MIN_KEPT_FRACTION,
    },
  ];
  const coupling = {
    sourcePdbId: '6ZTJ',
    mrnaChain: 'AV',
    D,
    pSiteCodonAuthSeq: [pCodonStart, pCodonStart + 2],
    pSiteCodonBases: pCodonBases,
    rna3EndAuthSeq: rna3End.authSeq,
    rna3EndBase: rna3End.base,
    unmodelledNucleotidesInSpan: unmodelledInSpan,
    countingMethod: 'Inclusive nucleotide count from first nucleotide of the ribosome P-site codon (AV:16 A, paired with P-tRNA AW) through the RNA 3\'-terminal nucleotide in the RNAP active site (AV:53 G, paired with template CT): 53 - 16 + 1 = 38 nt (0 unmodelled nucleotides in span; matches 6ZTJ PDB title "38 nt intervening mRNA" and PLAN.md §6.4 24+D transcript length rule). Kept at D = 38 per PLAN.md §13 because ribosome-70s L1 at the expressome pose has zero clash with rnap-ec L1.',
    minRiboRnapL1DistA: r3(minRiboRnapDistA),
    coupledMrnaPathLengthA: r3(pathLen),
    coupledMrnaObservedAuthSeq: [41, 23],
  };
  return {
    expressomeAnchor,
    expressome,
    ztjToRnap,
    ztjToRibo,
    coupledMrna,
    coupling,
    superpositions,
    ztjParsed,
    ztjEntry,
    sourceMeta: additionalSourceMeta(
      ztjEntry,
      ztjParsed,
      'expressome anchor, coupledMrna path, and coupling distance D',
      [`${ztjBeta.id} (β)`, `${ztjBetaPrime.id} (β′)`, `${ztj16S.id} (16S rRNA)`, `${ztj23S.id} (23S rRNA)`, 'AV (mRNA)', 'AW (P-site tRNA)', 'CT (template DNA)'],
    ),
  };
}

/**
 * Open-promoter (RPo) DNA tracks for rnap-holo from PDB 6CA0 (6C9Y contains protein only;
 * companion structure 6CA0 from the same Narayanan et al. 2018 study provides the RPo DNA).
 * Superposes 6CA0 beta (C) + beta' (D) Calpha onto 6C9Y (2-pass iterative, 2.0 A cutoff;
 * gate <= 2.5 A, kept >= 50%), transforms DNA chains G/H/I/J into the rnap frame, and builds
 * template and nontemplate tracks over registers -45..+11 (register 0 = +1 TSS).
 */
function buildRpoTracks(ctx, holoParsed, holoCore, holoToRnap) {
  const ca0Entry = ctx.lockEntry('6CA0');
  const ca0Parsed = ctx.loadSource(ca0Entry);
  const ca0Rows = inventory(ca0Parsed);
  const ca0Beta = ca0Rows.find(r => r.subunit === 'beta');
  const ca0BetaPrime = ca0Rows.find(r => r.subunit === 'betaPrime');
  const holoBeta = holoCore.find(r => r.subunit === 'beta');
  const holoBetaPrime = holoCore.find(r => r.subunit === 'betaPrime');
  if (!ca0Beta || !ca0BetaPrime || !holoBeta || !holoBetaPrime) throw new Error('6CA0/6C9Y: missing beta or beta\' chain');

  const ca0Chains = polymerChains(ca0Parsed);
  const holoChains = polymerChains(holoParsed);
  const m = matchChains(ca0Chains, holoChains, [[ca0Beta.id, holoBeta.id], [ca0BetaPrime.id, holoBetaPrime.id]], 'CA');
  const fit = superposeIterative(m.mobilePts, m.targetPts, { cutoff: 2.0, passes: 2 });
  const keptFraction = fit.n / fit.nBefore;
  ctx.log(`6CA0 -> 6C9Y RNAP beta/beta' superposition (${ca0Beta.id}->${holoBeta.id}, ${ca0BetaPrime.id}->${holoBetaPrime.id}): ${fit.n}/${fit.nBefore} (${(keptFraction * 100).toFixed(1)}%), RMSD ${fit.rmsdBefore.toFixed(3)} -> ${fit.rmsd.toFixed(3)} A`);
  if (fit.rmsd > RNAP_SUP_GATE) throw new Error(`6CA0 -> 6C9Y superposition RMSD ${fit.rmsd.toFixed(3)} A exceeds ${RNAP_SUP_GATE} A`);
  if (keptFraction < MIN_KEPT_FRACTION) throw new Error(`6CA0 -> 6C9Y kept fraction ${keptFraction.toFixed(3)} < ${MIN_KEPT_FRACTION}`);

  const ca0ToRnap = composeT(holoToRnap, { R: fit.R, o: fit.t });
  const tfF = frameOf(ca0ToRnap);
  const G = ca0Chains.get('G'), H = ca0Chains.get('H'), I = ca0Chains.get('I'), J = ca0Chains.get('J');
  if (!G || !H || !I || !J) throw new Error('6CA0: expected RPo DNA chains G, H, I, J');
  for (const c of [G, H, I, J]) fitChain(c);

  // Confirm -10 TATAAT element on G:36..41 (registers -12..-7) and pairing on G/H and I/J.
  const gByAuth = new Map(G.residues.map(r => [r.authSeq, r]));
  const tataat = [36, 37, 38, 39, 40, 41].map(k => gByAuth.get(k)?.base || '?').join('');
  if (tataat !== 'TATAAT') throw new Error(`6CA0: expected -10 TATAAT at G:36..41, found ${tataat}`);

  const ntObs = new Map(), tObs = new Map();
  for (const r of G.residues) if (r.fit.usable) ntObs.set(r.authSeq - 48, { frame: tfF(r.fit), base: r.base });      // -45..-1
  for (const r of I.residues) if (r.fit.usable) ntObs.set(r.authSeq - 14, { frame: tfF(r.fit), base: r.base });      // +1..+11
  for (const r of H.residues) if (r.fit.usable) tObs.set(15 - r.authSeq, { frame: tfF(r.fit), base: r.base });       // -45..-11
  for (const r of J.residues) if (r.fit.usable) tObs.set(14 - r.authSeq, { frame: tfF(r.fit), base: r.base });       // +1..+11

  const lo = -45, hi = 11;
  const buildCombined = (obsMap, fallbackBase) => {
    const registers = [], rawFrames = [], bases = [], sources = [];
    for (let k = lo; k <= hi; k++) {
      registers.push(k);
      const hit = obsMap.get(k);
      if (hit) {
        rawFrames.push(hit.frame);
        bases.push(hit.base);
        sources.push('6CA0');
      } else {
        rawFrames.push(null);
        bases.push(fallbackBase(k));
        sources.push('synthetic');
      }
    }
    const it = interpolateFrames(rawFrames);
    if (it.start !== 0 || it.frames.length !== registers.length) {
      throw new Error(`6CA0 RPo track trimmed endpoints unexpectedly (start=${it.start}, len=${it.frames.length})`);
    }
    return {
      kind: 'dna',
      registers,
      frames: it.frames.map(frameOut),
      synthetic: it.synthetic,
      bases: bases.join(''),
      sources,
    };
  };

  const nontemplate = buildCombined(ntObs, k => (k === 0 ? 'A' : 'A'));
  const template = buildCombined(tObs, k => {
    if (k === 0) return 'T';
    const ntHit = ntObs.get(k);
    return ntHit ? DNA_COMP[ntHit.base] : 'T';
  });

  // Verify the transcription bubble (-11..+2) is visibly unpaired (origin distance > 2.5 A).
  let minBubbleSepA = Infinity, maxBubbleSepA = 0;
  for (let k = -11; k <= 2; k++) {
    const idx = k - lo;
    const d = dist(template.frames[idx].o, nontemplate.frames[idx].o);
    if (d < minBubbleSepA) minBubbleSepA = d;
    if (d > maxBubbleSepA) maxBubbleSepA = d;
  }
  if (minBubbleSepA <= PAIR_MAX_ORIGIN) {
    throw new Error(`6CA0 RPo bubble register separation ${minBubbleSepA.toFixed(2)} A <= ${PAIR_MAX_ORIGIN} A`);
  }

  return {
    tracks: { template, nontemplate },
    bubbleSeparationA: [r3(minBubbleSepA), r3(maxBubbleSepA)],
    superposition: {
      mobile: '6CA0',
      reference: '6C9Y',
      role: 'RPo promoter DNA tracks',
      scope: "beta + beta' Calpha",
      mobileChains: [ca0Beta.id, ca0BetaPrime.id],
      referenceChains: [holoBeta.id, holoBetaPrime.id],
      matching: 'Calpha atoms matched by label_seq_id',
      nBefore: fit.nBefore,
      nAfter: fit.n,
      keptFraction: r3(keptFraction),
      rmsdBeforeA: r3(fit.rmsdBefore),
      rmsdAfterA: r3(fit.rmsd),
      cutoffA: 2.0,
      passes: 2,
      gateRmsdA: RNAP_SUP_GATE,
      gateKeptFraction: MIN_KEPT_FRACTION,
      passesGate: fit.rmsd <= RNAP_SUP_GATE && keptFraction >= MIN_KEPT_FRACTION,
    },
    sourceMeta: additionalSourceMeta(
      ca0Entry,
      ca0Parsed,
      'RPo open-promoter DNA tracks (6C9Y contains protein chains only)',
      [`${ca0Beta.id} (β)`, `${ca0BetaPrime.id} (β′)`, 'G (non-template DNA -45..-1)', 'H (template DNA -45..-11)', 'I (non-template DNA +1..+11)', 'J (template DNA +1..+11)'],
    ),
  };
}

function selectEcEntry(ctx) {
  const cands = ctx.lock.sources.filter(s => s.target === 'rnap-ec');
  const analysed = [];
  for (const s of cands) {
    const parsed = ctx.loadSource(s);
    const ec = analyseEc(parsed, s.pdbId);
    analysed.push({ s, parsed, ec });
    ctx.log(`\n${s.pdbId}: ${parsed.title}; ${parsed.method}; ${parsed.resolutionA} A`);
    ctx.log('  chain  entity  class    residues  role         description');
    for (const r of ec.rows) {
      const role = r.chain === ec.T ? 'template' : r.chain === ec.NT ? 'nontemplate' : r.class === 'rna' ? 'rna' : r.subunit || 'EXCLUDED';
      ctx.log(`  ${r.id.padEnd(5)}  ${r.entity.padEnd(6)}  ${r.class.padEnd(7)}  ${String(r.residues).padStart(8)}  ${role.padEnd(11)}  ${r.description} [${r.organism}]`);
    }
    ctx.log(`  RNA-DNA hybrid ${ec.hybridBp} bp; downstream duplex ${ec.downstreamBp} bp; upstream duplex ${ec.duplex.length - ec.downstreamBp} bp`);
  }
  analysed.sort((p, q) => q.ec.hybridBp - p.ec.hybridBp || q.ec.downstreamBp - p.ec.downstreamBp || p.parsed.resolutionA - q.parsed.resolutionA);
  const pick = analysed[0];
  if (pick.ec.hybridBp < 8) throw new Error(`${pick.s.pdbId}: RNA-DNA hybrid only ${pick.ec.hybridBp} bp (< 8); stop and report`);
  ctx.log(`\nselected ${pick.s.pdbId} (rule: longer hybrid, then longer downstream duplex, then better resolution)`);
  return pick;
}

function buildRnapEc(ctx) {
  const { s, parsed, ec } = selectEcEntry(ctx);
  const protRows = ec.rows.filter(r => r.class === 'protein');
  const excluded = protRows.filter(r => !CORE_KEYS.includes(r.subunit));
  if (excluded.length) ctx.log(`excluded chains: ${excluded.map(r => r.id + ' ' + r.description).join('; ')}`);
  const core = protRows.filter(r => CORE_KEYS.includes(r.subunit));
  const counts = core.reduce((m, r) => (m[r.subunit] = (m[r.subunit] || 0) + 1, m), {});
  if (counts.alpha !== 2 || counts.beta !== 1 || counts.betaPrime !== 1 || counts.omega !== 1) throw new Error(`unexpected core composition ${JSON.stringify(counts)}`);

  const rnaT = buildTrack('rna', ec.R.residues, ec.rnaReg);
  const tplT = buildTrack('dna', ec.T.residues, ec.tReg);
  if (ec.ntOffset === null) throw new Error(`non-template registers inconsistent between flanks: offsets ${ec.offsets}`);
  const ntReg = r => ec.ntPaired.has(r.seq) ? ec.ntPaired.get(r.seq) : r.seq + ec.ntOffset;
  const ntSeqs = ec.NT.residues.map(r => r.seq);
  const ntT = buildTrack('dna', ec.NT.residues, ntReg, [Math.min(...ntSeqs) + ec.ntOffset, Math.max(...ntSeqs) + ec.ntOffset]);

  const fAt = (t, k) => { const i = k - t.registers[0]; return i >= 0 && i < t.frames.length ? t : null; };
  const pairedRegs = ec.duplex.map(p => ec.tReg(p.b)).sort((a, b) => a - b);
  const bpCentre = k => mid(tplT.frames[k - tplT.registers[0]].o, ntT.frames[k - ntT.registers[0]].o);
  const down = pairedRegs.filter(k => k >= 2), up = pairedRegs.filter(k => k < -1);
  if (down.length < 4) throw new Error(`only ${down.length} paired downstream registers >= +2`);
  const downLine = fitLine(down.map(bpCentre));
  const upLine = up.length >= 3 ? fitLine(up.map(bpCentre)) : null;
  const bend = upLine ? angleDeg(upLine.dir, downLine.dir) : null;

  if (rnaT.registers[rnaT.registers.length - 1] !== -1 || !fAt(tplT, -1)) throw new Error('register -1 missing');
  const origin = mid(rnaT.frames[rnaT.frames.length - 1].o, tplT.frames[-1 - tplT.registers[0]].o);
  const z = downLine.dir;
  const caAll = [];
  for (const r of core) for (const res of r.chain.residues) if (res.atoms.CA) caAll.push(res.atoms.CA);
  const caCentroid = [0, 1, 2].map(k => caAll.reduce((s2, p) => s2 + p[k], 0) / caAll.length);
  const toC = sub(caCentroid, origin);
  const x = norm(sub(toC, scale(z, dot(toC, z))));
  const y = cross(z, x);
  const A = { o: origin, R: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]] };
  const Rt = transpose(A.R);
  const P = p => invApplyFrame(A, p);
  const F = f => ({ o: P(f.o), R: mulMM(Rt, f.R) });
  const alfToRnap = { R: Rt, o: scale(mulMV(Rt, A.o), -1) };

  const lastO3 = ec.last.atoms["O3'"];
  const mgs = parsed.atoms.filter(a => a.comp === 'MG').map(a => ({ a, d: dist([a.x, a.y, a.z], lastO3) })).sort((p, q) => p.d - q.d);
  let activeSite, activeSiteSource;
  if (mgs.length && mgs[0].d <= ACTIVE_MG_MAX) {
    activeSite = [mgs[0].a.x, mgs[0].a.y, mgs[0].a.z];
    activeSiteSource = `MG ion (label_asym ${mgs[0].a.labelAsym}, auth ${mgs[0].a.authAsym} ${mgs[0].a.authSeq}), ${mgs[0].d.toFixed(2)} A from O3' of rna(-1)`;
  } else { activeSite = lastO3; activeSiteSource = "O3' of rna(-1) (no MG within 10 A)"; }
  const first = ec.R.residues[0];
  if (!first.atoms.P) throw new Error("most 5' RNA nucleotide has no P atom");
  const anchorsW = {
    center: caCentroid, activeSite, dnaEntry: bpCentre(pairedRegs[pairedRegs.length - 1]),
    dnaExit: bpCentre(pairedRegs[0]), rnaExit: first.atoms.P,
  };
  const anchors = {};
  for (const [k, v] of Object.entries(anchorsW)) anchors[k] = { o: P(v).map(r3), R: I3 };

  const lods = machineLods(parsed, [{ part: 'core', rows: core }], P, activeSite, caCentroid);
  const { env } = lods.parts[0];

  // Round 3 v2 extensions: ntpEntry (ray cast), hairpin (7YPA), expressome + coupledMrna + D (6ZTJ).
  const ntp = computeNtpEntry(anchors.activeSite.o, anchors.rnaExit.o, lods.l1Pos);
  anchors.ntpEntry = ntp.anchor;

  const alfChains = polymerChains(parsed);
  const alfBeta = core.find(r => r.subunit === 'beta');
  const alfBetaPrime = core.find(r => r.subunit === 'betaPrime');
  const hairpin = computeHairpinAnchor(ctx, alfChains, alfBeta.id, alfBetaPrime.id, alfToRnap, anchors.rnaExit.o);
  anchors.hairpin = hairpin.anchor;

  const exp = computeExpressome(ctx, alfChains, alfBeta.id, alfBetaPrime.id, alfToRnap, anchors.rnaExit.o, lods.l1Pos);
  anchors.expressome = exp.expressomeAnchor;

  const ntSeqCan = entitySequence(parsed, ec.NT.entity);
  const ntBaseFromEntity = (t, i) => {
    if (t !== ntT) throw new Error('missing base outside the non-template track');
    const seq = t.registers[i] - ec.ntOffset;
    return ntSeqCan[seq - 1];
  };
  const trackOut = t => ({
    kind: t.kind, registers: t.registers, frames: t.frames.map(f => frameOut(F(f))), synthetic: t.synthetic,
    bases: t.basesRaw.map((b, i) => b || ntBaseFromEntity(t, i)).join(''),
  });

  const tracks = { template: trackOut(tplT), nontemplate: trackOut(ntT), rna: trackOut(rnaT) };
  const paths = { coupledMrna: exp.coupledMrna };
  const synthSegments = Object.fromEntries(Object.entries(tracks).map(([k, t]) => [k, segments(t)]));
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: 'rnap-ec',
    name: 'E. coli RNA polymerase elongation complex (core α2ββ′ω)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: s.pdbId, url: s.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: core[0].organism, nucleicAcidSource: `synthetic scaffold (entity source: ${ec.rows.find(r => r.class === 'rna').organism})`,
      downloaded: s.downloaded, revisionDate: parsed.revisionDate, sha256: s.sha256, license: ctx.LICENSE,
      chainsUsed: [...core.map(r => `${r.id} (${SUBS[r.subunit].label})`), `${ec.T.id} (template DNA)`, `${ec.NT.id} (non-template DNA)`, `${ec.R.id} (RNA)`],
      additionalSources: [hairpin.sourceMeta, exp.sourceMeta],
      superpositions: [hairpin.superposition, ...exp.superpositions],
      ntpEntryCheck: ntp.report,
      hairpinCheck: hairpin.closingPair,
      coupling: exp.coupling,
      notes: [
        'Generated by tools/build-assets.mjs from the mmCIF files pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens). Full provenance: docs/assets/rnap.md.',
        'Asset frame (docs/CONTRACTS.md 6.3): origin = midpoint of the fitted base-frame origins of rna(-1) and template(-1); +z = least-squares axis through base-pair centres of template registers >= +2; +x = protein Calpha centroid direction perpendicular to z.',
        `Base pairing rule: fitted base-frame origins within ${PAIR_MAX_ORIGIN} A and antiparallel base normals, assigned one-to-one in order of increasing origin distance.`,
        `activeSite anchor: ${activeSiteSource}.`,
        `ntpEntry anchor (synthetic): 256-ray Fibonacci-sphere ray cast from activeSite excluding 35 deg around +/-z and rnaExit (${ntp.report.raysKept} rays kept; max min-clearance ${ntp.report.minClearanceA} A over 5-35 A; origin at 30 A, +z inward).`,
        `hairpin anchor: closing base pair ${hairpin.closingPair.arm5} / ${hairpin.closingPair.arm3} of the ${hairpin.closingPair.stemBpCount}-bp termination hairpin in 7YPA (superposed on beta/beta' Calpha, RMSD ${hairpin.superposition.rmsdAfterA} A), +z along fitted stem axis toward the apical loop.`,
        `expressome anchor: places ribosome-70s (ribo frame) into the rnap frame from 6ZTJ (RNAP beta/beta' RMSD ${exp.superpositions[0].rmsdAfterA} A; 16S+23S P RMSD ${exp.superpositions[1].rmsdAfterA} A). Coupling distance D = ${exp.coupling.D} nt (AV:16 to AV:53 inclusive, 0 unmodelled); min ribosome-RNAP L1 distance ${exp.coupling.minRiboRnapL1DistA} A.`,
        `coupledMrna path: 25 points (${exp.coupling.coupledMrnaPathLengthA} A) from rnaExit (synthetic) through observed 6ZTJ mRNA AV:41..23 (19 points, synthetic = 0) and a 5-step synthetic bridge to ribosome-70s mrnaEntry in the rnap frame.`,
        `L0: Gaussian density of Calpha beads (sigma ${env.sigma} A, grid ${env.spacing} A), marching cubes, welded, closed, outward winding; iso-level = ${(env.quantile * 100).toFixed(2)}th percentile of bead densities, ${(env.insideByRay * 100).toFixed(1)} % of beads inside (ray-parity test).`,
        `L2: heavy atoms of protein residues with any atom within ${lods.lod2.sites[0].radius} A of activeSite, plus MG/ZN within ${L2_ION_RADIUS} A; ions are assigned to the chain of their auth_asym_id.`,
        'Track frames with synthetic = 1 were interpolated (linear origin, slerp rotation) between fitted neighbours; their bases come from _entity_poly.',
        'Nucleic-acid chains are tracks only; they are not part of L0/L1/L2.',
      ],
    },
    bounds: lods.bounds,
    parts: [{ id: 'core', name: 'RNA polymerase core (α2ββ′ω)', role: 'body' }],
    chains: lods.chains,
    lod0: lods.lod0,
    lod1: lods.lod1,
    lod2: lods.lod2,
    anchors,
    tracks,
    paths,
  };
  const problems = validateAsset(asset);
  if (problems.length) throw new Error('rnap-ec invalid:\n' + problems.join('\n'));

  const report = {
    pdbId: s.pdbId, template: ec.T.id, nontemplate: ec.NT.id, rna: ec.R.id, hybridBp: ec.hybridBp, downstreamBp: ec.downstreamBp,
    upstreamBp: up.length, duplexBp: ec.duplex.length, pairedRegisters: pairedRegs,
    ...lods.report,
    activeSiteSource, bendDeg: bend, bounds: asset.bounds, synthetic: synthSegments,
    trackRanges: Object.fromEntries(Object.entries(tracks).map(([k, t]) => [k, [t.registers[0], t.registers[t.registers.length - 1]]])),
    maxPairOrigin: Math.max(...ec.duplex.map(p => p.d), ...ec.hybrid.map(p => p.d)),
    maxPairNormalAngle: Math.max(...ec.duplex.map(p => p.normalAngle), ...ec.hybrid.map(p => p.normalAngle)),
    maxFitRmsd: Math.max(...[ec.T, ec.NT, ec.R].flatMap(c => c.residues.map(r => r.fit.rmsd))),
    ntpEntry: ntp.report,
    hairpin: { closingPair: hairpin.closingPair, superposition: hairpin.superposition },
    expressome: { coupling: exp.coupling, superpositions: exp.superpositions },
  };
  return {
    asset, report, frame: A, P, alfToRnap, sourceEntry: s, parsed, core,
    ztjToRnap: exp.ztjToRnap,
    ztjRnapSuperposition: exp.superpositions[0],
    ztjParsed: exp.ztjParsed,
    ztjEntry: exp.ztjEntry,
  };
}

function buildRnapHolo(ctx) {
  const ecBuild = ctx.built.get('rnap-ec') || buildRnapEc(ctx);
  const cands = ctx.lock.sources.filter(s => s.target === 'rnap-holo').map(s => {
    const parsed = ctx.loadSource(s);
    const rows = inventory(parsed);
    const keys = rows.map(r => r.subunit);
    const complete = CORE_KEYS.every(k => keys.includes(k)) && keys.filter(k => k === 'alpha').length === 2 && keys.includes('sigma70');
    ctx.log(`\n${s.pdbId}: ${parsed.title}; ${parsed.method}; ${parsed.resolutionA} A; core + sigma70 present: ${complete}`);
    for (const r of rows) ctx.log(`  ${r.id.padEnd(5)}  ${r.entity.padEnd(6)}  ${r.class.padEnd(7)}  ${String(r.residues).padStart(8)}  ${(r.subunit || 'EXCLUDED').padEnd(9)}  ${r.description}`);
    return { s, parsed, rows, complete };
  }).filter(c => c.complete);
  if (!cands.length) throw new Error('no rnap-holo candidate with core and sigma70');
  cands.sort((p, q) => p.parsed.resolutionA - q.parsed.resolutionA);
  const { s, parsed, rows } = cands[0];
  ctx.log(`\nselected ${s.pdbId} for rnap-holo (rule: complete core + sigma70, then better resolution)`);
  const core = rows.filter(r => CORE_KEYS.includes(r.subunit)), sigma = rows.filter(r => r.subunit === 'sigma70');
  const excluded = rows.filter(r => !CORE_KEYS.includes(r.subunit) && r.subunit !== 'sigma70');

  const ecBp = ecBuild.core.find(r => r.subunit === 'betaPrime'), hoBp = core.find(r => r.subunit === 'betaPrime');
  if (ecBuild.parsed.entityPolySeq[ecBp.entity] !== parsed.entityPolySeq[hoBp.entity]) throw new Error("beta' entity sequences differ; label_seq_id matching invalid");
  const ecRes = new Map(ecBp.chain.residues.map(r => [r.seq, r]));
  const Pm = [], Qm = [];
  let nameMismatch = 0;
  for (const r of hoBp.chain.residues) {
    const q = ecRes.get(r.seq);
    if (!q || !q.atoms.CA || !r.atoms.CA) continue;
    if (q.comp !== r.comp) nameMismatch++;
    Pm.push(r.atoms.CA); Qm.push(q.atoms.CA);
  }
  if (nameMismatch) throw new Error(`beta' residue names differ at ${nameMismatch} matched positions`);
  const sup = kabsch(Pm, Qm);
  const rmsd = Math.sqrt(Pm.reduce((acc, p, i) => acc + dist(applyFrame(sup, p), Qm[i]) ** 2, 0) / Pm.length);
  ctx.log(`beta' superposition ${s.pdbId} chain ${hoBp.id} -> ${ecBuild.sourceEntry.pdbId} chain ${ecBp.id}: ${Pm.length} Calpha, RMSD ${rmsd.toFixed(3)} A`);
  if (rmsd > HOLO_MAX_RMSD) throw new Error(`beta' RMSD ${rmsd.toFixed(2)} A exceeds ${HOLO_MAX_RMSD} A; stop and report`);
  const P = p => ecBuild.P(applyFrame(sup, p));
  const holoToRnap = composeT(ecBuild.alfToRnap, { R: sup.R, o: sup.o });

  const ca = [];
  for (const r of [...core, ...sigma]) for (const res of r.chain.residues) if (res.atoms.CA) ca.push(res.atoms.CA);
  const centre = [0, 1, 2].map(k => ca.reduce((acc, p) => acc + p[k], 0) / ca.length);
  const ecSite = ecBuild.asset.anchors.activeSite.o;
  const mgs = parsed.atoms.filter(a => a.comp === 'MG').map(a => ({ a, d: dist(P([a.x, a.y, a.z]), ecSite) })).sort((p, q) => p.d - q.d);
  if (!mgs.length) throw new Error(`${s.pdbId}: no MG ion for the activeSite anchor`);
  const site = [mgs[0].a.x, mgs[0].a.y, mgs[0].a.z];
  const siteSource = `MG ion (label_asym ${mgs[0].a.labelAsym}, auth ${mgs[0].a.authAsym} ${mgs[0].a.authSeq}); ${mgs[0].d.toFixed(2)} A from the rnap-ec activeSite after superposition`;
  const lods = machineLods(parsed, [{ part: 'core', rows: core }, { part: 'sigma', rows: sigma }], P, site, centre);

  const anchors = {
    center: { o: P(centre).map(r3), R: I3 },
    activeSite: { o: P(site).map(r3), R: I3 },
  };
  const ntp = computeNtpEntry(anchors.activeSite.o, ecBuild.asset.anchors.rnaExit.o, lods.l1Pos);
  anchors.ntpEntry = ntp.anchor;

  const rpo = buildRpoTracks(ctx, parsed, core, holoToRnap);

  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: 'rnap-holo',
    name: 'E. coli RNA polymerase σ70 holoenzyme (α2ββ′ωσ70)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: s.pdbId, url: s.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: core[0].organism, downloaded: s.downloaded, revisionDate: parsed.revisionDate, sha256: s.sha256, license: ctx.LICENSE,
      chainsUsed: [...core, ...sigma].map(r => `${r.id} (${SUBS[r.subunit].label})`),
      frameSource: `rnap-ec asset frame (${ecBuild.sourceEntry.pdbId})`,
      superposition: { method: "least-squares (quaternion) on beta' Calpha atoms matched by label_seq_id", reference: `${ecBuild.sourceEntry.pdbId} chain ${ecBp.id}`, mobile: `${s.pdbId} chain ${hoBp.id}`, atoms: Pm.length, rmsdA: r3(rmsd) },
      additionalSources: [rpo.sourceMeta],
      superpositions: [rpo.superposition],
      ntpEntryCheck: ntp.report,
      rpoBubbleCheck: { bubbleRegisters: [-11, 2], originSeparationRangeA: rpo.bubbleSeparationA },
      notes: [
        'Generated by tools/build-assets.mjs from the mmCIF files pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens). Full provenance: docs/assets/rnap.md.',
        `Coordinates are placed in the rnap-ec frame by one rigid superposition on beta' Calpha atoms (${Pm.length} atoms, RMSD ${rmsd.toFixed(2)} A). The holoenzyme is a different structure: domains that move between holoenzyme and elongation complex (for example the clamp) do not coincide with rnap-ec.`,
        `activeSite anchor: ${siteSource}.`,
        `ntpEntry anchor (synthetic): 256-ray Fibonacci-sphere ray cast from activeSite excluding 35 deg around +/-z and rnap-ec rnaExit (${ntp.report.raysKept} rays kept; max min-clearance ${ntp.report.minClearanceA} A over 5-35 A; origin at 30 A, +z inward).`,
        `RPo DNA tracks (template, nontemplate, registers -45..+11 with register 0 = +1 TSS) come from companion open-complex PDB 6CA0 (6C9Y contains protein only), superposed onto 6C9Y on beta/beta' Calpha (RMSD ${rpo.superposition.rmsdAfterA} A, ${(rpo.superposition.keptFraction * 100).toFixed(1)}% kept). Unmodelled bubble segments (nontemplate 0; template -10..0) are interpolated with synthetic = 1; bubble registers -11..+2 stay unpaired (${rpo.bubbleSeparationA[0]}..${rpo.bubbleSeparationA[1]} A).`,
        `L0: one envelope per part (Gaussian density of Calpha beads, sigma 5 A, marching cubes); L2 radius ${lods.lod2.sites[0].radius} A around activeSite.`,
        ...(excluded.length ? [`Excluded chains: ${excluded.map(r => r.id + ' ' + r.description).join('; ')}.`] : []),
      ],
    },
    bounds: lods.bounds,
    parts: [
      { id: 'core', name: 'RNA polymerase core (α2ββ′ω)', role: 'body' },
      { id: 'sigma', name: 'σ70 (RpoD)', role: 'release' },
    ],
    chains: lods.chains, lod0: lods.lod0, lod1: lods.lod1, lod2: lods.lod2,
    anchors,
    tracks: rpo.tracks,
  };
  const problems = validateAsset(asset);
  if (problems.length) throw new Error('rnap-holo invalid:\n' + problems.join('\n'));
  return {
    asset,
    report: {
      pdbId: s.pdbId, superpositionAtoms: Pm.length, rmsd, siteSource, ...lods.report, bounds: asset.bounds,
      ntpEntry: ntp.report,
      rpo: { superposition: rpo.superposition, bubbleSeparationA: rpo.bubbleSeparationA, trackRange: [-45, 11] },
    },
  };
}

export const recipes = [
  { id: 'rnap-ec', sources: ['6ALF', '6ALH', '7YPA', '6ZTJ', '7K00'], build: buildRnapEc },
  { id: 'rnap-holo', sources: ['6C9Y', '6CA0'], dependsOn: ['rnap-ec'], build: buildRnapHolo },
];
