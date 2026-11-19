// Recipe module for E. coli RNA polymerase assets:
//   - rnap-ec   (PDB 6ALF elongation complex, core α2ββ′ω)
//   - rnap-holo (PDB 6C9Y σ70 holoenzyme, superposed into the rnap-ec frame)
// Preserves exact byte-for-byte v1 output from Round 2 Wave 1; A4 extends these in Stage ST5.
import { ASSET_FORMAT, ASSET_VERSION_V1, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../../js/assets/format.js';
import { dist, invApplyFrame, applyFrame, kabsch, mulMM, cross, dot, norm, sub, scale, add } from '../../js/science/math.js';
import { polymerChains } from '../lib/mmcif.mjs';
import { fitBaseFrame, residueBase, interpolateFrames, fitLine } from '../lib/frames.mjs';
import { envelope, meshStats } from '../lib/surface.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15, S: 16, SE: 34, MG: 12, ZN: 30 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07 };
const PAIR_MAX_ORIGIN = 2.5;           // A, pairing rule (see pairStrands)
const L2_RADIUS = 12, L2_ION_RADIUS = 20, L2_MAX_ATOMS = 3000, ACTIVE_MG_MAX = 10;
const HOLO_MAX_RMSD = 6;

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });
const transpose = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const mid = (a, b) => scale(add(a, b), 0.5);
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;

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
  const synthSegments = Object.fromEntries(Object.entries(tracks).map(([k, t]) => [k, segments(t)]));
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION_V1, id: 'rnap-ec',
    name: 'E. coli RNA polymerase elongation complex (core α2ββ′ω)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: s.pdbId, url: s.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: core[0].organism, nucleicAcidSource: `synthetic scaffold (entity source: ${ec.rows.find(r => r.class === 'rna').organism})`,
      downloaded: s.downloaded, revisionDate: parsed.revisionDate, sha256: s.sha256, license: ctx.LICENSE,
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

  const ca = [];
  for (const r of [...core, ...sigma]) for (const res of r.chain.residues) if (res.atoms.CA) ca.push(res.atoms.CA);
  const centre = [0, 1, 2].map(k => ca.reduce((acc, p) => acc + p[k], 0) / ca.length);
  const ecSite = ecBuild.asset.anchors.activeSite.o;
  const mgs = parsed.atoms.filter(a => a.comp === 'MG').map(a => ({ a, d: dist(P([a.x, a.y, a.z]), ecSite) })).sort((p, q) => p.d - q.d);
  if (!mgs.length) throw new Error(`${s.pdbId}: no MG ion for the activeSite anchor`);
  const site = [mgs[0].a.x, mgs[0].a.y, mgs[0].a.z];
  const siteSource = `MG ion (label_asym ${mgs[0].a.labelAsym}, auth ${mgs[0].a.authAsym} ${mgs[0].a.authSeq}); ${mgs[0].d.toFixed(2)} A from the rnap-ec activeSite after superposition`;
  const lods = machineLods(parsed, [{ part: 'core', rows: core }, { part: 'sigma', rows: sigma }], P, site, centre);

  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION_V1, id: 'rnap-holo',
    name: 'E. coli RNA polymerase σ70 holoenzyme (α2ββ′ωσ70)', kind: 'machine', units: 'angstrom', quantStep: QUANT_STEP,
    source: {
      type: 'pdb', pdbId: s.pdbId, url: s.url, title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA,
      organism: core[0].organism, downloaded: s.downloaded, revisionDate: parsed.revisionDate, sha256: s.sha256, license: ctx.LICENSE,
      chainsUsed: [...core, ...sigma].map(r => `${r.id} (${SUBS[r.subunit].label})`),
      frameSource: `rnap-ec asset frame (${ecBuild.sourceEntry.pdbId})`,
      superposition: { method: "least-squares (quaternion) on beta' Calpha atoms matched by label_seq_id", reference: `${ecBuild.sourceEntry.pdbId} chain ${ecBp.id}`, mobile: `${s.pdbId} chain ${hoBp.id}`, atoms: Pm.length, rmsdA: r3(rmsd) },
      notes: [
        'Generated by tools/build-assets.mjs from the mmCIF file pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens).',
        `Coordinates are placed in the rnap-ec frame by one rigid superposition on beta' Calpha atoms (${Pm.length} atoms, RMSD ${rmsd.toFixed(2)} A). The holoenzyme is a different structure: domains that move between holoenzyme and elongation complex (for example the clamp) do not coincide with rnap-ec.`,
        `activeSite anchor: ${siteSource}.`,
        `L0: one envelope per part (Gaussian density of Calpha beads, sigma 5 A, marching cubes); L2 radius ${lods.lod2.radius} A around activeSite.`,
        'No DNA or RNA in this entry, so there are no tracks; dnaEntry, dnaExit and rnaExit anchors are not defined for this asset.',
        ...(excluded.length ? [`Excluded chains: ${excluded.map(r => r.id + ' ' + r.description).join('; ')}.`] : []),
      ],
    },
    bounds: lods.bounds,
    parts: [{ id: 'core', name: 'RNA polymerase core (α2ββ′ω)' }, { id: 'sigma', name: 'σ70 (RpoD)' }],
    chains: lods.chains, lod0: lods.lod0, lod1: lods.lod1, lod2: lods.lod2,
    anchors: { center: { o: P(centre).map(r3), R: I3 }, activeSite: { o: P(site).map(r3), R: I3 } },
  };
  const problems = validateAsset(asset);
  if (problems.length) throw new Error('rnap-holo invalid:\n' + problems.join('\n'));
  return { asset, report: { pdbId: s.pdbId, superpositionAtoms: Pm.length, rmsd, siteSource, ...lods.report, bounds: asset.bounds } };
}

export const recipes = [
  { id: 'rnap-ec', sources: ['6ALF', '6ALH'], build: buildRnapEc },
  { id: 'rnap-holo', sources: ['6C9Y', '6CA0'], dependsOn: ['rnap-ec'], build: buildRnapHolo },
];
