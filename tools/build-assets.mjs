#!/usr/bin/env node
// Offline asset pipeline: PDB mmCIF -> Helix asset format v1 (docs/CONTRACTS.md section 6).
//
//   node tools/build-assets.mjs            build assets/rnap-ec.asset.json and assets/manifest.json
//   node tools/build-assets.mjs --check    rebuild in memory and compare byte-for-byte with the committed files
//   node tools/build-assets.mjs --dry-run  build a test asset from tools/1bna.cif into a temporary directory
//
// Inputs are the mmCIF files listed in tools/sources.lock.json, stored in tools/sources/ (ignored by Git).
// Download them with: curl -sS --retry 3 -o tools/sources/<ID>.cif https://files.rcsb.org/download/<ID>.cif
// Every coordinate in the output is derived from the source file; interpolated track frames are flagged synthetic.
// The tool is deterministic: no clocks, no randomness, fixed iteration orders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ASSET_FORMAT, ASSET_VERSION, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../js/assets/format.js';
import { dist, invApplyFrame, mulMM, cross, dot, norm, sub, scale, add } from '../js/science/math.js';
import { parseMmcif, polymerChains } from './lib/mmcif.mjs';
import { fitBaseFrame, residueBase, interpolateFrames, fitLine } from './lib/frames.mjs';
import { envelope, meshStats } from './lib/surface.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE = 'CC0 1.0 Universal: wwPDB archive data are free of copyright restrictions (https://www.wwpdb.org/about/usage-policies)';
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15, S: 16, SE: 34, MG: 12, ZN: 30 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07 };
const PAIR_MAX_ORIGIN = 2.5;           // A, pairing rule (see pairStrands)
const L2_RADIUS = 12, L2_ION_RADIUS = 20, L2_MAX_ATOMS = 3000, ACTIVE_MG_MAX = 10;

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });
const transpose = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const mid = (a, b) => scale(add(a, b), 0.5);
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;
const log = (...a) => { if (!QUIET) console.log(...a); };
let QUIET = false;

// ---------------------------------------------------------------------------------------------
// Sources

function readLock() {
  return JSON.parse(fs.readFileSync(path.join(root, 'tools', 'sources.lock.json'), 'utf8'));
}
function loadSource(entry) {
  const file = path.join(root, entry.file);
  if (!fs.existsSync(file)) throw new Error(`missing ${entry.file}; download ${entry.url} into tools/sources/`);
  const buf = fs.readFileSync(file);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== entry.sha256) throw new Error(`${entry.file}: sha256 ${sha} does not match the lock file (${entry.sha256})`);
  if (buf.length !== entry.bytes) throw new Error(`${entry.file}: ${buf.length} bytes, lock file says ${entry.bytes}`);
  return parseMmcif(buf.toString('utf8'));
}

// ---------------------------------------------------------------------------------------------
// Chain inventory and roles

const SUBUNITS = [
  { key: 'alpha', re: /RNA polymerase subunit alpha$/i, label: 'α', gene: 'rpoA' },
  { key: 'betaPrime', re: /RNA polymerase subunit beta'$/i, label: 'β′', gene: 'rpoC' },
  { key: 'beta', re: /RNA polymerase subunit beta$/i, label: 'β', gene: 'rpoB' },
  { key: 'omega', re: /RNA polymerase subunit omega$/i, label: 'ω', gene: 'rpoZ' },
  { key: 'sigma70', re: /RNA polymerase sigma factor RpoD$/i, label: 'σ70', gene: 'rpoD' },
];
const SUBS = Object.fromEntries(SUBUNITS.map(s => [s.key, s]));
const CORE_KEYS = ['alpha', 'beta', 'betaPrime', 'omega'];

function inventory(parsed) {
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

// Fit base frames for every nucleotide of a nucleic-acid chain.
function fitChain(chain) {
  for (const r of chain.residues) {
    r.base = residueBase(r.comp);
    if (!r.base) throw new Error(`chain ${chain.id} residue ${r.seq}: unknown nucleotide ${r.comp}`);
    r.fit = fitBaseFrame(r.atoms, r.base);
  }
}

/**
 * Pairing rule (used everywhere): residues a (chain 1) and b (chain 2) are candidates when the origins of their
 * fitted base frames are at most 2.5 A apart and their base normals are antiparallel (z_a . z_b < 0). For a
 * Watson-Crick pair both frames share the base-pair origin, and the partner frame is the strand-I frame rotated
 * 180 degrees about x (section 1). Candidates are assigned one-to-one in order of increasing origin distance
 * (ties broken by label_seq_id), so each residue pairs at most once.
 */
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

/** Identify roles, pairings, and registers for an elongation complex. Throws (stop and report) when impossible. */
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
  const duplex = pairStrands(NT, T);                // a = non-template, b = template

  // RNA registers: 3'-terminal modelled nucleotide = -1.
  const last = R.residues[R.residues.length - 1];
  const rnaReg = r => -1 - (last.seq - r.seq);
  // Template registers: anchored on the template partner of rna(-1), then sequence order (template runs 3'->5'
  // in the direction of transcription, so downstream = lower label_seq_id).
  const p1 = hybrid.find(p => p.b === last);
  if (!p1) throw new Error(`${pdbId}: RNA 3'-terminal nucleotide is not paired with the template`);
  const tReg = r => -1 + (p1.a.seq - r.seq);
  const hybridConsistent = hybrid.every(p => tReg(p.a) === rnaReg(p.b));
  if (!hybridConsistent) throw new Error(`${pdbId}: RNA-template pairs are not in register`);
  // Non-template registers: copy the template partner where paired; between paired flanks by sequence order
  // (the non-template strand runs 5'->3' downstream, so register increases with label_seq_id).
  const ntPaired = new Map(duplex.map(p => [p.a.seq, tReg(p.b)]));
  const offsets = [...new Set(duplex.map(p => tReg(p.b) - p.a.seq))];
  const ntOffset = offsets.length === 1 ? offsets[0] : null;
  return { rows, T, NT, R, hybrid, duplex, rnaReg, tReg, ntPaired, ntOffset, offsets, last, pdbId,
    hybridBp: hybrid.length, downstreamBp: duplex.filter(p => tReg(p.b) >= 0).length };
}

// Build a register-indexed track from residues with a register function.
function buildTrack(kind, residues, regOf, seqRange) {
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

// ---------------------------------------------------------------------------------------------
// Levels of detail

function l2Atoms(parsed, chainIds, centre, radius) {
  const chainIndex = new Map(chainIds.map((id, i) => [id, i]));
  const prot = parsed.atoms.filter(a => chainIndex.has(a.authAsym) && a.group === 'ATOM' && a.labelSeq !== null);
  const resKey = a => a.authAsym + ':' + a.labelSeq;
  const near = new Set();
  for (const a of prot) if (dist([a.x, a.y, a.z], centre) <= radius) near.add(resKey(a));
  const atoms = prot.filter(a => near.has(resKey(a)));
  atoms.sort((p, q) => chainIndex.get(p.authAsym) - chainIndex.get(q.authAsym) || p.labelSeq - q.labelSeq);   // stable sort keeps file order inside a residue
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

// ---------------------------------------------------------------------------------------------
// rnap-ec

function selectEntry(lock) {
  const cands = lock.sources.filter(s => s.target === 'rnap-ec');
  const analysed = [];
  for (const s of cands) {
    const parsed = loadSource(s);
    const ec = analyseEc(parsed, s.pdbId);
    analysed.push({ s, parsed, ec });
    log(`\n${s.pdbId}: ${parsed.title}; ${parsed.method}; ${parsed.resolutionA} A`);
    log('  chain  entity  class    residues  role         description');
    for (const r of ec.rows) {
      const role = r.chain === ec.T ? 'template' : r.chain === ec.NT ? 'nontemplate' : r.class === 'rna' ? 'rna' : r.subunit || 'EXCLUDED';
      log(`  ${r.id.padEnd(5)}  ${r.entity.padEnd(6)}  ${r.class.padEnd(7)}  ${String(r.residues).padStart(8)}  ${role.padEnd(11)}  ${r.description} [${r.organism}]`);
    }
    log(`  RNA-DNA hybrid ${ec.hybridBp} bp; downstream duplex ${ec.downstreamBp} bp; upstream duplex ${ec.duplex.length - ec.downstreamBp} bp`);
  }
  analysed.sort((p, q) => q.ec.hybridBp - p.ec.hybridBp || q.ec.downstreamBp - p.ec.downstreamBp || p.parsed.resolutionA - q.parsed.resolutionA);
  const pick = analysed[0];
  if (pick.ec.hybridBp < 8) throw new Error(`${pick.s.pdbId}: RNA-DNA hybrid only ${pick.ec.hybridBp} bp (< 8); stop and report`);
  log(`\nselected ${pick.s.pdbId} (rule: longer hybrid, then longer downstream duplex, then better resolution)`);
  return pick;
}

function buildRnapEc(lock) {
  const { s, parsed, ec } = selectEntry(lock);
  const protRows = ec.rows.filter(r => r.class === 'protein');
  const excluded = protRows.filter(r => !CORE_KEYS.includes(r.subunit));
  if (excluded.length) log(`excluded chains: ${excluded.map(r => r.id + ' ' + r.description).join('; ')}`);
  const core = protRows.filter(r => CORE_KEYS.includes(r.subunit));
  const counts = core.reduce((m, r) => (m[r.subunit] = (m[r.subunit] || 0) + 1, m), {});
  if (counts.alpha !== 2 || counts.beta !== 1 || counts.betaPrime !== 1 || counts.omega !== 1) throw new Error(`unexpected core composition ${JSON.stringify(counts)}`);

  // Tracks (structure coordinates).
  const rnaT = buildTrack('rna', ec.R.residues, ec.rnaReg);
  const tplT = buildTrack('dna', ec.T.residues, ec.tReg);
  if (ec.ntOffset === null) throw new Error(`non-template registers inconsistent between flanks: offsets ${ec.offsets}`);
  const ntReg = r => ec.ntPaired.has(r.seq) ? ec.ntPaired.get(r.seq) : r.seq + ec.ntOffset;
  // Full sequence range of the non-template entity, so residues absent from the model become null slots.
  const ntSeqs = ec.NT.residues.map(r => r.seq);
  const ntT = buildTrack('dna', ec.NT.residues, ntReg, [Math.min(...ntSeqs) + ec.ntOffset, Math.max(...ntSeqs) + ec.ntOffset]);

  // Base-pair centres per register.
  const fAt = (t, k) => { const i = k - t.registers[0]; return i >= 0 && i < t.frames.length ? t : null; };
  const pairedRegs = ec.duplex.map(p => ec.tReg(p.b)).sort((a, b) => a - b);
  const bpCentre = k => mid(tplT.frames[k - tplT.registers[0]].o, ntT.frames[k - ntT.registers[0]].o);
  const down = pairedRegs.filter(k => k >= 2), up = pairedRegs.filter(k => k < -1);
  if (down.length < 4) throw new Error(`only ${down.length} paired downstream registers >= +2`);
  const downLine = fitLine(down.map(bpCentre));
  const upLine = up.length >= 3 ? fitLine(up.map(bpCentre)) : null;
  const bend = upLine ? angleDeg(upLine.dir, downLine.dir) : null;

  // Asset frame.
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

  // Anchors (structure coordinates first).
  const lastO3 = ec.last.atoms["O3'"];
  const mgs = parsed.atoms.filter(a => a.comp === 'MG').map(a => ({ a, d: dist([a.x, a.y, a.z], lastO3) })).sort((p, q) => p.d - q.d);
  let activeSite, activeSiteSource;
  if (mgs.length && mgs[0].d <= ACTIVE_MG_MAX) {
    activeSite = [mgs[0].a.x, mgs[0].a.y, mgs[0].a.z];
    activeSiteSource = `MG ion (label_asym ${mgs[0].a.labelAsym}, auth ${mgs[0].a.authAsym} ${mgs[0].a.authSeq}), ${mgs[0].d.toFixed(2)} A from O3' of rna(-1)`;
  } else { activeSite = lastO3; activeSiteSource = "O3' of rna(-1) (no MG within 10 A)"; }
  const first = ec.R.residues[0];
  if (!first.atoms.P) throw new Error('most 5\' RNA nucleotide has no P atom');
  const anchorsW = {
    center: caCentroid, activeSite, dnaEntry: bpCentre(pairedRegs[pairedRegs.length - 1]),
    dnaExit: bpCentre(pairedRegs[0]), rnaExit: first.atoms.P,
  };
  const anchors = {};
  for (const [k, v] of Object.entries(anchorsW)) anchors[k] = { o: P(v).map(r3), R: I3 };

  const lods = machineLods(parsed, [{ part: 'core', rows: core }], P, activeSite, caCentroid);
  const { env } = lods.parts[0];

  const trackOut = t => ({
    kind: t.kind, registers: t.registers, frames: t.frames.map(f => frameOut(F(f))), synthetic: t.synthetic,
    bases: t.basesRaw.map((b, i) => b || ntBaseFromEntity(t, i)).join(''),
  });
  // Bases of residues absent from the model come from the entity sequence (_entity_poly), via label_seq_id.
  const ntSeqCan = entitySequence(parsed, ec.NT.entity);
  const ntBaseFromEntity = (t, i) => {
    if (t !== ntT) throw new Error('missing base outside the non-template track');
    const seq = t.registers[i] - ec.ntOffset;
    return ntSeqCan[seq - 1];
  };

  const tracks = { template: trackOut(tplT), nontemplate: trackOut(ntT), rna: trackOut(rnaT) };
  const synthSegments = Object.fromEntries(Object.entries(tracks).map(([k, t]) => [k, segments(t)]));
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: 'rnap-ec',
    name: 'E. coli RNA polymerase elongation complex (core α2ββ′ω)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: s.pdbId, url: s.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: core[0].organism, nucleicAcidSource: `synthetic scaffold (entity source: ${ec.rows.find(r => r.class === 'rna').organism})`,
      downloaded: s.downloaded, revisionDate: parsed.revisionDate, sha256: s.sha256, license: LICENSE,
      chainsUsed: [...core.map(r => `${r.id} (${SUBS[r.subunit].label})`), `${ec.T.id} (template DNA)`, `${ec.NT.id} (non-template DNA)`, `${ec.R.id} (RNA)`],
      notes: [
        'Generated by tools/build-assets.mjs from the mmCIF file pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens).',
        'Asset frame (docs/CONTRACTS.md 6.3): origin = midpoint of the fitted base-frame origins of rna(-1) and template(-1); +z = least-squares axis through base-pair centres of template registers >= +2; +x = protein Calpha centroid direction perpendicular to z.',
        `Base pairing rule: fitted base-frame origins within ${PAIR_MAX_ORIGIN} A and antiparallel base normals, assigned one-to-one in order of increasing origin distance.`,
        `activeSite anchor: ${activeSiteSource}.`,
        `L0: Gaussian density of Calpha beads (sigma ${env.sigma} A, grid ${env.spacing} A), marching cubes, welded, closed, outward winding; iso-level = ${(env.quantile * 100).toFixed(2)}th percentile of bead densities, ${(env.insideByRay * 100).toFixed(1)} % of beads inside (ray-parity test).`,
        `L2: heavy atoms of protein residues with any atom within ${lods.lod2.radius} A of activeSite, plus MG/ZN within ${L2_ION_RADIUS} A; ions are assigned to the chain of their auth_asym_id.`,
        'Track frames with synthetic = 1 were interpolated (linear origin, slerp rotation) between fitted neighbours; their bases come from _entity_poly.',
        'Nucleic-acid chains are tracks only; they are not part of L0/L1/L2.',
      ],
    },
    bounds: lods.bounds,
    parts: [{ id: 'core', name: 'RNA polymerase core (α2ββ′ω)' }],
    chains: lods.chains,
    lod0: lods.lod0,
    lod1: lods.lod1,
    lod2: lods.lod2,
    anchors,
    tracks,
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
  };
  return { asset, report, frame: A, P, sourceEntry: s, parsed, core };
}

/**
 * Shared L0/L1/L2/bounds builder for machine assets. groups: [{ part, rows }] (protein chain rows);
 * P maps structure coordinates into the asset frame; activeSite and centre are structure coordinates.
 */
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
  // L0: one envelope per part.
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
  // L2 active site.
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
  // Bounds from Calpha beads.
  const centreA = P(centre);
  let rad = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < l1Pos.length; i += 3) {
    const p = [l1Pos[i], l1Pos[i + 1], l1Pos[i + 2]];
    rad = Math.max(rad, dist(p, centreA));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return {
    chains, parts,
    bounds: { center: centreA.map(r3), radius: r3(rad), size: [0, 1, 2].map(k => r3(hi[k] - lo[k])) },
    lod0,
    lod1: { count: l1Chain.length, positions: encodePositions(l1Pos), chain: encodeArray(Uint8Array.from(l1Chain)), kind: encodeArray(Uint8Array.from(l1Kind)) },
    lod2: {
      count: l2All.length, positions: encodePositions(l2Pos), element: encodeArray(Uint8Array.from(l2El)), chain: encodeArray(Uint8Array.from(l2Ch)),
      bonds: encodeArray(Uint16Array.from(bonds)), bondCount: bonds.length / 2, anchor: 'activeSite', radius,
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
  // Rebuilt from residue names would miss unmodelled residues, so use the canonical one-letter sequence.
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

// ---------------------------------------------------------------------------------------------
// Dry run on tools/1bna.cif (exercises mmCIF, frames, mesh, and validation; output is not committed)

function dryRun() {
  const parsed = parseMmcif(fs.readFileSync(path.join(root, 'tools', '1bna.cif'), 'utf8'));
  const rows = inventory(parsed);
  const l1Pos = [], l1Chain = [], l1Kind = [], chains = [], tracks = {};
  rows.forEach((r, ci) => {
    fitChain(r.chain);
    let n = 0;
    for (const res of r.chain.residues) if (res.atoms.P) { l1Pos.push(...res.atoms.P); l1Chain.push(ci); l1Kind.push(1); n++; }
    chains.push({ id: r.id, part: 'dna', class: r.class, name: `Strand ${r.id}`, residues: n });
    const t = buildTrack('dna', r.chain.residues, res => res.seq);
    tracks['strand' + r.id] = { kind: 'dna', registers: t.registers, frames: t.frames.map(frameOut), synthetic: t.synthetic, bases: t.basesRaw.join('') };
  });
  const env = envelope(l1Pos, { sigma: 5, spacing: 5, maxTriangles: 12000 });
  const ms = meshStats(env.positions, env.indices);
  const c = [0, 1, 2].map(k => l1Pos.filter((_, i) => i % 3 === k).reduce((s, v) => s + v, 0) / (l1Pos.length / 3));
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION, id: 'dry-run-1bna', name: 'Dry run: 1BNA (pipeline test only)', kind: 'machine',
    units: 'angstrom', quantStep: QUANT_STEP,
    source: { type: 'pdb', pdbId: '1BNA', title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA, organism: 'synthetic construct',
      downloaded: 'bundled tools/1bna.cif', sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'tools', '1bna.cif'))).digest('hex'), license: LICENSE, chainsUsed: rows.map(r => r.id) },
    bounds: { center: c.map(r3), radius: 30, size: [40, 40, 50] },
    parts: [{ id: 'dna', name: 'DNA dodecamer' }], chains,
    lod0: { parts: [{ part: 'dna', positions: encodePositions(env.positions), indices: encodeArray(Uint16Array.from(env.indices)), indexType: 'u16', vertexCount: env.positions.length / 3, triangleCount: env.indices.length / 3 }] },
    lod1: { count: l1Chain.length, positions: encodePositions(l1Pos), chain: encodeArray(Uint8Array.from(l1Chain)), kind: encodeArray(Uint8Array.from(l1Kind)) },
    anchors: { center: { o: c.map(r3), R: I3 } }, tracks,
  };
  const problems = validateAsset(asset);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-assets-dry-run-'));
  const out = path.join(dir, 'dry-run-1bna.asset.json');
  fs.writeFileSync(out, JSON.stringify(asset));
  console.log(`dry run: ${rows.length} chains, ${l1Chain.length} P beads, L0 ${env.indices.length / 3} triangles (closed ${ms.closed}, volume ${ms.signedVolume.toFixed(0)} A^3, ${(env.insideByRay * 100).toFixed(1)} % beads inside), wrote ${out}`);
  console.log(problems.length ? 'INVALID:\n' + problems.join('\n') : 'validateAsset: OK');
  return problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------

function manifest() {
  return JSON.stringify({ version: 1, assets: [
    { id: 'fixture-machine', file: 'fixture-machine.asset.json', synthetic: true },
    { id: 'rnap-ec', file: 'rnap-ec.asset.json', synthetic: false },
  ] }, null, 2) + '\n';
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) return dryRun();
  const check = args.includes('--check');
  QUIET = args.includes('--quiet');
  const lock = readLock();
  const { asset, report } = buildRnapEc(lock);
  const outputs = { 'assets/rnap-ec.asset.json': JSON.stringify(asset), 'assets/manifest.json': manifest() };
  log('\nreport ' + JSON.stringify(report, null, 1));
  if (check) {
    let bad = 0;
    for (const [rel, text] of Object.entries(outputs)) {
      const cur = fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null;
      const same = cur === text;
      console.log(`${same ? 'identical' : 'DIFFERS'}  ${rel}`);
      if (!same) bad++;
    }
    return bad ? 1 : 0;
  }
  for (const [rel, text] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(root, rel), text);
    console.log(`wrote ${rel} (${Buffer.byteLength(text)} bytes)`);
  }
  return 0;
}

process.exitCode = main();
