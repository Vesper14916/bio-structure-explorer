// Recipe module for the six bacterial translation factor assets (Round 3, task R3-A3):
//   - rf1   (PDB 8FZH chain w; 23S-only superposition onto 7K00; L2 site ggq 8 A)
//   - ef-tu (PDB 5WE4 chain z; 16S+23S superposition onto 7K00)
//   - ef-g  (PDB 7PJV chain x; 23S-only superposition onto 7K00 per DEC-010)
//   - if1   (PDB 9ZN2 chain y; 16S+23S superposition onto 7K00)
//   - if2   (PDB 9ZN2 chain x; 16S+23S superposition onto 7K00)
//   - if3   (PDB 9FDA chain J; 16S-only superposition onto 7K00; edeine excluded)
// All six assets are stored in the 7K00 `ribo` frame (bound pose = identity relative to ribosome-70s).
// Provenance, superpositions, anchors, and clash reports: docs/assets/factors.md.
import {
  ASSET_FORMAT, ASSET_VERSION, QUANT_STEP,
  encodeArray, encodePositions, decodePositions, validateAsset,
} from '../../js/assets/format.js';
import { applyFrame, dist } from '../../js/science/math.js';
import { polymerChains } from '../lib/mmcif.mjs';
import { fitBaseFrame, residueBase } from '../lib/frames.mjs';
import { matchChains } from '../lib/match.mjs';
import { superposeIterative } from '../lib/superpose.mjs';
import { envelope, meshStats, insideMesh } from '../lib/surface.mjs';
import { frameAtoms } from './ribosome.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ELEMENT_Z = { C: 6, N: 7, O: 8, P: 15, S: 16, MG: 12 };
const COVALENT = { C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07 };
const BOND_TOL = 0.45;
const SUPERPOSE_GATE_RMSD = 1.5;        // A (PLAN.md 7.3)
const SUPERPOSE_GATE_KEPT = 0.50;       // minimum kept fraction (DEC-010)
const L0_MIN_INSIDE = 0.95;
const LIMITS = { l0Triangles: 8000, l1Beads: 900, l2Atoms: 400, fileBytes: 120000 };
const RF1_SITEA_GATE = 10.0;            // A (PLAN.md R3-A3)
const EFTU_SRL_GATE = 25.0;             // A (PLAN.md R3-A3)
const CLASH_CUTOFF = 3.0;               // A (PLAN.md R3-A3)
const L2_RADIUS = 8;                    // A (PLAN.md 7.4)
const NON_RIBO_7K00_CHAINS = new Set(['X', 'Y', 'Z', '5']);
const RNA_7K00_CHAINS = new Set(['A', 'a', 'b']);
// DEC-019 L3: chain.name must not contain RNAP subunit colour triggers in js/render/actors.js.
const RNAP_TINT_RE = /alpha|beta|omega|sigma|[αβωσ]/i;

const AA3TO1 = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);

// Cache 7K00 reference data keyed by sourcesDir so 7K00.cif is parsed once per build run.
const refCache = new Map();

function getReference7K00(sourcesDir) {
  if (refCache.has(sourcesDir)) return refCache.get(sourcesDir);
  const { frame, atoms } = frameAtoms(sourcesDir);

  const byChain = new Map();
  for (const a of atoms) {
    if (!byChain.has(a.chain)) byChain.set(a.chain, new Map());
    const cm = byChain.get(a.chain);
    if (!cm.has(a.labelSeq)) {
      cm.set(a.labelSeq, { seq: a.labelSeq, authSeq: a.authSeq, comp: a.comp, atoms: {}, el: {} });
    }
    const r = cm.get(a.labelSeq);
    r.atoms[a.name] = [a.x, a.y, a.z];
    r.el[a.name] = a.element;
  }
  const chains = new Map();
  for (const [cid, cm] of byChain) {
    chains.set(cid, { id: cid, residues: [...cm.values()].sort((p, q) => p.seq - q.seq) });
  }
  const s16 = chains.get('A'), s23 = chains.get('a');
  if (!s16 || !s23) throw new Error('7K00 frameAtoms missing expected 16S (A) or 23S (a) chain');

  // Ribosomal L1 beads (exact 52 ribosomal chains of 7K00: P for 16S/23S/5S, CA for r-proteins).
  const riboL1 = [];
  for (const [cid, ch] of chains) {
    if (NON_RIBO_7K00_CHAINS.has(cid)) continue;
    const isRna = RNA_7K00_CHAINS.has(cid);
    const atomName = isRna ? 'P' : 'CA';
    for (const r of ch.residues) {
      if (r.atoms[atomName]) {
        riboL1.push({ p: r.atoms[atomName], chain: cid, authSeq: r.authSeq, comp: r.comp });
      }
    }
  }

  // 7K00 A-site codon (chain X, author 19..21 = GUA, registers +3..+5) base-frame origins centroid & C1' centroid.
  const mrna = chains.get('X');
  const aSiteRes = [19, 20, 21].map(n => {
    const r = mrna && mrna.residues.find(x => x.authSeq === n);
    if (!r) throw new Error(`7K00 mRNA chain X missing A-site residue ${n}`);
    return r;
  });
  const aSiteBaseOrigins = aSiteRes.map(r => {
    const f = fitBaseFrame(r.atoms, residueBase(r.comp));
    if (!f.usable) throw new Error(`7K00 mRNA ${r.authSeq}: unusable base frame`);
    return f.o;
  });
  const siteACodonCentroid = centroid(aSiteBaseOrigins);
  const siteAC1Centroid = centroid(aSiteRes.map(r => r.atoms["C1'"]));

  // 7K00 23S sarcin-ricin loop (author 2653..2667) heavy-atom centroid and P-atom centroid.
  const srlRes = s23.residues.filter(r => r.authSeq >= 2653 && r.authSeq <= 2667);
  if (srlRes.length !== 15) throw new Error(`7K00 23S SRL 2653-2667: expected 15 residues, got ${srlRes.length}`);
  const srlCentroid = centroid(srlRes.flatMap(r => Object.values(r.atoms)));
  const srlPCentroid = centroid(srlRes.filter(r => r.atoms.P).map(r => r.atoms.P));

  // 7K00 PTC origin (P-site tRNA Z author 76 O3') and decoding center (16S A1492, A1493, G530 heavy atoms).
  const z76 = chains.get('Z')?.residues.find(r => r.authSeq === 76);
  const ptcO = z76?.atoms["O3'"] || null;
  const decPts = [1492, 1493, 530].flatMap(n => Object.values(s16.residues.find(r => r.authSeq === n).atoms));
  const decodingO = centroid(decPts);

  const data = {
    frame, chains, riboL1,
    siteACodonCentroid, siteAC1Centroid,
    srlCentroid, srlPCentroid, srlSeq: srlRes.map(r => r.comp).join(''),
    ptcO, decodingO,
  };
  refCache.set(sourcesDir, data);
  return data;
}

function entityMap(parsed) {
  return new Map(parsed.entities.map(e => [e.id, e]));
}

function confirmRrnaChains(parsed, chains, expected, pdbId) {
  const ent = entityMap(parsed);
  const found = {};
  if (expected.s16) {
    const matches = [...chains.values()].filter(c => ent.get(c.entity).class === 'rna' && /^16S/i.test(ent.get(c.entity).description));
    if (matches.length !== 1 || matches[0].id !== expected.s16) {
      throw new Error(`${pdbId}: expected 16S chain "${expected.s16}", found ${matches.map(c => c.id).join(', ')}`);
    }
    found.s16 = matches[0];
  }
  if (expected.s23) {
    const matches = [...chains.values()].filter(c => ent.get(c.entity).class === 'rna' && /^23S/i.test(ent.get(c.entity).description));
    if (matches.length !== 1 || matches[0].id !== expected.s23) {
      throw new Error(`${pdbId}: expected 23S chain "${expected.s23}", found ${matches.map(c => c.id).join(', ')}`);
    }
    found.s23 = matches[0];
  }
  return found;
}

function fitScope(pdbId, mobileChains, refChains, scope, rrna) {
  const pairs = scope === '16S+23S'
    ? [[rrna.s16.id, 'A'], [rrna.s23.id, 'a']]
    : scope === '23S'
      ? [[rrna.s23.id, 'a']]
      : [[rrna.s16.id, 'A']];
  const m = matchChains(mobileChains, refChains, pairs, 'P', { key: 'authSeq', matchComp: true });
  const res = superposeIterative(m.mobilePts, m.targetPts, { cutoff: 2.0, passes: 2 });
  const keptFraction = res.n / res.nBefore;
  const sup = { R: res.R, o: res.t };
  const record = {
    mobile: pdbId,
    reference: '7K00',
    scope,
    mobileChains: pairs.map(p => p[0]),
    referenceChains: pairs.map(p => p[1]),
    matching: 'P atoms of rRNA residues matched by (auth_seq_id, comp) via tools/lib/match.mjs (DEC-011)',
    matchedPerChain: Object.fromEntries(m.byChain.map(b => [b.targetChain === 'A' ? '16S' : '23S', b.n])),
    nBefore: res.nBefore,
    nAfter: res.n,
    keptFraction: r3(keptFraction),
    rmsdBeforeA: r3(res.rmsdBefore),
    rmsdAfterA: r3(res.rmsd),
    mismatches: m.mismatches,
    cutoffA: 2.0,
    passes: 2,
    gateRmsdA: SUPERPOSE_GATE_RMSD,
    gateKeptFraction: SUPERPOSE_GATE_KEPT,
    passesGate: res.rmsd <= SUPERPOSE_GATE_RMSD && keptFraction >= SUPERPOSE_GATE_KEPT,
  };
  return { sup, record };
}

/** Find contiguous sequence motif occurrences on a polymer protein chain (matched on 1-letter canonical AA codes). */
function findContiguousMotif(chain, regex) {
  const res = chain.residues;
  const seq = res.map(r => AA3TO1[r.comp] || 'X').join('');
  const hits = [];
  for (const m of seq.matchAll(new RegExp(regex, 'g'))) {
    const slice = res.slice(m.index, m.index + m[0].length);
    const contiguous = slice.every((r, k) => k === 0 || r.authSeq === slice[k - 1].authSeq + 1);
    if (!contiguous) continue;
    if (slice.some(r => !r.atoms.CA)) continue;
    hits.push({
      sequence: m[0],
      authRange: [slice[0].authSeq, slice[slice.length - 1].authSeq],
      residues: slice,
    });
  }
  return hits;
}

/** Build covalent + peptide C-N bonds for L2 protein atoms (ions have no bonds). */
function l2ProteinBonds(atoms) {
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.isIon) continue;
    const ra = COVALENT[a.element];
    if (ra === undefined) continue;
    for (let j = i + 1; j < atoms.length; j++) {
      const b = atoms[j];
      if (b.isIon) continue;
      const rb = COVALENT[b.element];
      if (rb === undefined) continue;
      let bonded = false;
      if (a.seq === b.seq) {
        bonded = dist(a.p, b.p) < ra + rb + BOND_TOL;
      } else if (b.seq === a.seq + 1 && a.name === 'C' && b.name === 'N') {
        bonded = dist(a.p, b.p) < ra + rb + BOND_TOL;
      }
      if (bonded) bonds.push(i, j);
    }
  }
  return bonds;
}

/** Build L0 envelope guaranteeing >= 95% containment even after 0.05 A int16 quantisation. */
function buildEnvelope(l1Pts, spec) {
  const flat = l1Pts.flat();
  const sigma = l1Pts.length <= 120 ? 4.0 : 5.0;
  const spacing = l1Pts.length <= 120 ? 2.5 : 3.5;
  const qBeads = decodePositions(encodePositions(flat));
  const qPts = Array.from({ length: l1Pts.length }, (_, i) => [qBeads[3 * i], qBeads[3 * i + 1], qBeads[3 * i + 2]]);

  for (let minInside = L0_MIN_INSIDE; minInside <= 0.9951; minInside += 0.005) {
    const env = envelope(flat, { sigma, spacing, maxTriangles: LIMITS.l0Triangles, minInside });
    const qPos = decodePositions(encodePositions(env.positions));
    const msRaw = meshStats(env.positions, env.indices);
    const msQuant = meshStats(qPos, env.indices);
    if (!msRaw.closed || msRaw.signedVolume <= 0 || !msQuant.closed || msQuant.signedVolume <= 0) {
      throw new Error(`${spec.id} L0: mesh not closed/outward`);
    }
    let insideQuant = 0;
    for (const p of qPts) if (insideMesh(qPos, env.indices, p)) insideQuant++;
    const containedQuant = insideQuant / qPts.length;
    if (env.insideByRay >= L0_MIN_INSIDE && containedQuant >= L0_MIN_INSIDE) {
      return { env, ms: msQuant, containedRaw: env.insideByRay, containedQuant, minInsideTarget: r3(minInside) };
    }
  }
  throw new Error(`${spec.id} L0: failed to reach ${L0_MIN_INSIDE} quantised bead containment`);
}

function computeClashes(chain, toRiboPt, riboL1) {
  const clashes = [];
  for (const r of chain.residues) {
    if (!r.atoms.CA) continue;
    const p = toRiboPt(r.atoms.CA);
    let bestD = Infinity, bestRibo = null;
    for (let j = 0; j < riboL1.length; j++) {
      const d = dist(p, riboL1[j].p);
      if (d < bestD) { bestD = d; bestRibo = riboL1[j]; }
    }
    if (bestD < CLASH_CUTOFF) {
      clashes.push({
        authSeq: r.authSeq,
        comp: r.comp,
        distA: r3(bestD),
        nearestRiboChain: bestRibo.chain,
        nearestRiboAuthSeq: bestRibo.authSeq,
        nearestRiboComp: bestRibo.comp,
      });
    }
  }
  return clashes;
}

function buildFactor(ctx, spec) {
  const ref = getReference7K00(ctx.sourcesDir);
  const parsed = ctx.loadSource(spec.pdbId);
  const lockEntry = ctx.lockEntry(spec.pdbId);
  const chains = polymerChains(parsed);
  const ent = entityMap(parsed);

  // Confirm factor chain identity.
  const factorChain = chains.get(spec.chain);
  if (!factorChain) throw new Error(`${spec.id}: chain "${spec.chain}" not found in ${spec.pdbId}`);
  const factorEntity = ent.get(factorChain.entity);
  if (!factorEntity || factorEntity.class !== 'protein' || !spec.descRe.test(factorEntity.description)) {
    throw new Error(`${spec.id}: chain "${spec.chain}" entity "${factorEntity?.description}" did not match ${spec.descRe}`);
  }
  if (RNAP_TINT_RE.test(spec.chainName)) {
    throw new Error(`${spec.id}: chainName "${spec.chainName}" triggers DEC-019 L3 RNAP tint`);
  }

  // Confirm rRNA chains and superpose into the 7K00 `ribo` frame.
  const rrna = confirmRrnaChains(parsed, chains, spec.rrna, spec.pdbId);
  const primaryFit = fitScope(spec.pdbId, chains, ref.chains, spec.scope, rrna);
  if (!primaryFit.record.passesGate) {
    throw new Error(
      `${spec.id} (${spec.pdbId} ${spec.scope}): superposition failed gate — ` +
      `RMSD ${primaryFit.record.rmsdAfterA} A (limit ${SUPERPOSE_GATE_RMSD}), ` +
      `kept ${(primaryFit.record.keptFraction * 100).toFixed(1)}% (limit ${SUPERPOSE_GATE_KEPT * 100}%)`,
    );
  }
  const altRecords = (spec.altScopes || []).map(sc => fitScope(spec.pdbId, chains, ref.chains, sc, rrna).record);
  const toRiboPt = p => applyFrame(primaryFit.sup, p);

  // L1: one CA bead per modelled residue.
  const l1Pts = [];
  const missingCa = [];
  for (const r of factorChain.residues) {
    if (!r.atoms.CA) { missingCa.push(r.authSeq); continue; }
    l1Pts.push(toRiboPt(r.atoms.CA));
  }
  const l1Count = l1Pts.length;
  if (l1Count === 0 || l1Count > LIMITS.l1Beads) {
    throw new Error(`${spec.id}: L1 bead count ${l1Count} outside 1..${LIMITS.l1Beads}`);
  }

  // L0: Gaussian density envelope covering >= 95% of L1 beads (both raw and quantised).
  const l0Res = buildEnvelope(l1Pts, spec);
  const env = l0Res.env;
  const nv = env.positions.length / 3;
  const triCount = env.indices.length / 3;
  if (triCount > LIMITS.l0Triangles) {
    throw new Error(`${spec.id}: L0 ${triCount} triangles exceeds ${LIMITS.l0Triangles}`);
  }
  const lod0 = {
    parts: [{
      part: 'body',
      positions: encodePositions(env.positions),
      indices: nv < 65536 ? encodeArray(Uint16Array.from(env.indices)) : encodeArray(Uint32Array.from(env.indices)),
      indexType: nv < 65536 ? 'u16' : 'u32',
      vertexCount: nv,
      triangleCount: triCount,
      sigma: env.sigma,
      spacing: env.spacing,
      beadsInside: r3(l0Res.containedQuant),
    }],
  };

  // Anchors (ribo frame; identity rotations).
  const anchors = {
    center: { o: centroid(l1Pts).map(r3), R: I3 },
  };
  const anchorProvenance = {};
  const geometryChecks = {};

  if (spec.motifs) {
    for (const m of spec.motifs) {
      let chosen;
      if (m.regex) {
        const hits = findContiguousMotif(factorChain, m.regex);
        if (hits.length !== 1) {
          throw new Error(`${spec.id} anchor ${m.anchor}: expected 1 hit for /${m.regex}/, found ${hits.length}`);
        }
        chosen = hits[0];
      } else if (m.authRange) {
        const [lo, hi] = m.authRange;
        const slice = factorChain.residues.filter(r => r.authSeq >= lo && r.authSeq <= hi && r.atoms.CA);
        if (slice.length < 3) throw new Error(`${spec.id} anchor ${m.anchor}: too few CA atoms in ${lo}..${hi}`);
        chosen = {
          sequence: `${slice[0].comp}${slice[0].authSeq}..${slice[slice.length - 1].comp}${slice[slice.length - 1].authSeq}`,
          authRange: [slice[0].authSeq, slice[slice.length - 1].authSeq],
          residues: slice,
        };
      }
      const o = centroid(chosen.residues.map(r => toRiboPt(r.atoms.CA)));
      anchors[m.anchor] = { o: o.map(r3), R: I3 };
      anchorProvenance[m.anchor] = {
        definition: m.definition,
        motif: chosen.sequence,
        authRange: chosen.authRange,
        residueCount: chosen.residues.length,
        originRiboA: o.map(r3),
      };
    }
  }

  // Factor-specific structural acceptance checks (PLAN.md R3-A3).
  if (spec.id === 'rf1') {
    const dSiteA = dist(anchors.codonReader.o, ref.siteACodonCentroid);
    const dSiteAC1 = dist(anchors.codonReader.o, ref.siteAC1Centroid);
    const dPtc = ref.ptcO ? dist(anchors.ggq.o, ref.ptcO) : null;
    geometryChecks.codonReaderToSiteACodonA = r3(dSiteA);
    geometryChecks.codonReaderToSiteAC1A = r3(dSiteAC1);
    geometryChecks.siteACodonCentroidRiboA = ref.siteACodonCentroid.map(r3);
    geometryChecks.codonReaderGateA = RF1_SITEA_GATE;
    geometryChecks.ggqToPtcA = dPtc !== null ? r3(dPtc) : null;
    if (dSiteA > RF1_SITEA_GATE) {
      throw new Error(`rf1: codonReader distance to siteA codon centroid is ${dSiteA.toFixed(3)} A (> ${RF1_SITEA_GATE} A)`);
    }
  }
  if (anchors.gDomain) {
    const dSrl = dist(anchors.gDomain.o, ref.srlCentroid);
    const dSrlP = dist(anchors.gDomain.o, ref.srlPCentroid);
    geometryChecks.gDomainToSrlHeavyA = r3(dSrl);
    geometryChecks.gDomainToSrlPhosphateA = r3(dSrlP);
    geometryChecks.srlRange = '7K00 23S (chain a) author 2653-2667';
    geometryChecks.srlSequence = ref.srlSeq;
    geometryChecks.srlCentroidRiboA = ref.srlCentroid.map(r3);
    if (spec.id === 'ef-tu') {
      geometryChecks.gDomainSrlGateA = EFTU_SRL_GATE;
      if (dSrl > EFTU_SRL_GATE) {
        throw new Error(`ef-tu: gDomain distance to 23S SRL centroid is ${dSrl.toFixed(3)} A (> ${EFTU_SRL_GATE} A)`);
      }
    }
  }
  if (spec.id === 'ef-g' && anchors.domainIV) {
    geometryChecks.domainIVToDecodingA = r3(dist(anchors.domainIV.o, ref.decodingO));
    geometryChecks.domainIVToSiteACodonA = r3(dist(anchors.domainIV.o, ref.siteACodonCentroid));
  }

  // L2 (rf1 only: site ggq, radius 8 A + Mg2+ ions within 8 A).
  let lod2 = null;
  let l2Report = null;
  if (spec.l2Site) {
    const siteO = anchors[spec.l2Site.anchor].o;
    const radius = spec.l2Site.radius;
    const l2Res = factorChain.residues.filter(r =>
      Object.values(r.atoms).some(p => dist(toRiboPt(p), siteO) <= radius),
    );
    const l2Atoms = [];
    for (const r of l2Res) {
      for (const [name, p] of Object.entries(r.atoms)) {
        const element = r.el[name];
        if (!ELEMENT_Z[element]) throw new Error(`${spec.id} L2: unsupported element ${element} (${r.authSeq} ${name})`);
        l2Atoms.push({ p: toRiboPt(p), name, element, seq: r.seq, authSeq: r.authSeq, isIon: false });
      }
    }
    const mgIons = parsed.atoms.filter(a => a.comp === 'MG' && dist(toRiboPt([a.x, a.y, a.z]), siteO) <= radius);
    for (const ion of mgIons) {
      l2Atoms.push({
        p: toRiboPt([ion.x, ion.y, ion.z]),
        name: ion.name,
        element: 'MG',
        seq: -1,
        authSeq: ion.authSeq,
        isIon: true,
        sourceChain: ion.authAsym,
      });
    }
    if (l2Atoms.length === 0 || l2Atoms.length > LIMITS.l2Atoms) {
      throw new Error(`${spec.id}: L2 atom count ${l2Atoms.length} outside 1..${LIMITS.l2Atoms}`);
    }
    const bonds = l2ProteinBonds(l2Atoms);
    for (let i = 0; i < bonds.length; i += 2) {
      const bl = dist(l2Atoms[bonds[i]].p, l2Atoms[bonds[i + 1]].p);
      if (!(bl > 0.9 && bl < 2.3)) {
        throw new Error(`${spec.id}: implausible L2 bond length ${bl.toFixed(3)} A`);
      }
    }
    lod2 = {
      count: l2Atoms.length,
      positions: encodePositions(l2Atoms.flatMap(a => a.p)),
      element: encodeArray(Uint8Array.from(l2Atoms.map(a => ELEMENT_Z[a.element]))),
      chain: encodeArray(Uint8Array.from(new Array(l2Atoms.length).fill(0))),
      bonds: encodeArray(Uint16Array.from(bonds)),
      bondCount: bonds.length / 2,
      sites: [{ anchor: spec.l2Site.anchor, radius }],
    };
    l2Report = {
      site: spec.l2Site.anchor,
      radiusA: radius,
      residues: l2Res.map(r => `${r.authSeq}${r.comp}`),
      proteinAtoms: l2Atoms.length - mgIons.length,
      mgIons: mgIons.map(ion => ({
        sourceChain: ion.authAsym,
        authSeq: ion.authSeq,
        distToSiteA: r3(dist(toRiboPt([ion.x, ion.y, ion.z]), siteO)),
      })),
      totalAtoms: l2Atoms.length,
      bonds: bonds.length / 2,
    };
  }

  // Bounds: cover all L1 beads and L0 vertices.
  const allPts = [...l1Pts];
  for (let i = 0; i < env.positions.length; i += 3) {
    allPts.push([env.positions[i], env.positions[i + 1], env.positions[i + 2]]);
  }
  const lo = [0, 1, 2].map(k => Math.min(...allPts.map(p => p[k])));
  const hi = [0, 1, 2].map(k => Math.max(...allPts.map(p => p[k])));
  const bc = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
  const bounds = {
    center: bc.map(r3),
    radius: r3(Math.max(...allPts.map(p => dist(p, bc)))),
    size: [0, 1, 2].map(k => r3(hi[k] - lo[k])),
  };

  // Clash report against 7K00 ribosome L1 beads (< 3.0 A).
  const clashes = computeClashes(factorChain, toRiboPt, ref.riboL1);

  const notes = [
    `Generated by tools/build-assets.mjs (recipe tools/assets/factors.mjs) from PDB ${spec.pdbId} (pinned in tools/sources.lock.json; model 1, altloc . or A, no hydrogens, ligands/antibiotics/waters dropped${spec.l2Site ? ', Mg2+ within 8 A of L2 site kept' : ''}).`,
    `Stored in the 7K00 ribo frame (bound pose = identity relative to ribosome-70s) via ${spec.scope} rRNA P-atom superposition onto 7K00 frameAtoms (n ${primaryFit.record.nBefore} -> ${primaryFit.record.nAfter}, kept ${(primaryFit.record.keptFraction * 100).toFixed(1)}%, RMSD ${primaryFit.record.rmsdBeforeA} -> ${primaryFit.record.rmsdAfterA} A, ${primaryFit.record.mismatches} mismatches excluded).`,
    ...spec.extraNotes,
    `L0: Gaussian density envelope (sigma ${env.sigma} A, spacing ${env.spacing} A, ${triCount} triangles, closed outward mesh, quantised L1 bead containment ${(l0Res.containedQuant * 100).toFixed(1)}%).`,
    `L1: ${l1Count} CA beads (kind 0) from chain ${spec.chain} (author ${factorChain.residues[0].authSeq}..${factorChain.residues[factorChain.residues.length - 1].authSeq}; raw PDB entity description: "${factorEntity.description}").`,
    `Clashes vs 7K00 ribosome-70s L1 beads (< ${CLASH_CUTOFF} A): ${clashes.length}.`,
  ];

  const asset = {
    format: ASSET_FORMAT,
    version: ASSET_VERSION,
    id: spec.id,
    name: spec.displayName,
    kind: 'machine',
    units: 'angstrom',
    quantStep: QUANT_STEP,
    source: {
      type: 'pdb',
      pdbId: spec.pdbId,
      url: lockEntry.url,
      title: parsed.title,
      method: parsed.method,
      resolutionA: parsed.resolutionA,
      organism: factorEntity.organism || 'Escherichia coli',
      downloaded: lockEntry.downloaded,
      revisionDate: parsed.revisionDate,
      sha256: lockEntry.sha256,
      license: ctx.LICENSE,
      chainsUsed: [
        `${spec.chain} (${factorEntity.description})`,
        ...primaryFit.record.mobileChains.map((cid, i) => `${cid} (${primaryFit.record.referenceChains[i] === 'A' ? '16S' : '23S'} rRNA, superposition)`),
      ],
      entityDescription: factorEntity.description,
      superposition: primaryFit.record,
      ...(altRecords.length ? { superpositionAlternatives: altRecords } : {}),
      anchorProvenance,
      ...(Object.keys(geometryChecks).length ? { geometryChecks } : {}),
      ...(l2Report ? { l2Summary: l2Report } : {}),
      clashes: { cutoffA: CLASH_CUTOFF, count: clashes.length, beads: clashes },
      notes,
    },
    bounds,
    parts: [{ id: 'body', name: spec.partName, role: 'body' }],
    chains: [{
      id: spec.chain,
      part: 'body',
      class: 'protein',
      name: spec.chainName,
      residues: l1Count,
      modelled: factorChain.residues.length,
      subunit: spec.id,
    }],
    lod0,
    lod1: {
      count: l1Count,
      positions: encodePositions(l1Pts.flat()),
      chain: encodeArray(Uint8Array.from(new Array(l1Count).fill(0))),
      kind: encodeArray(Uint8Array.from(new Array(l1Count).fill(0))),
    },
    ...(lod2 ? { lod2 } : {}),
    anchors,
  };

  const problems = validateAsset(asset);
  if (problems.length) throw new Error(`${spec.id} invalid:\n${problems.join('\n')}`);
  const bytes = Buffer.byteLength(JSON.stringify(asset));
  if (bytes > LIMITS.fileBytes) throw new Error(`${spec.id}: ${bytes} bytes exceeds ${LIMITS.fileBytes}`);

  const report = {
    pdbId: spec.pdbId,
    chain: spec.chain,
    residues: factorChain.residues.length,
    l1Beads: l1Count,
    l0Triangles: triCount,
    l0Spacing: env.spacing,
    l0Sigma: env.sigma,
    l0BeadsInsideQuant: r3(l0Res.containedQuant),
    l2Atoms: lod2 ? lod2.count : 0,
    l2Bonds: lod2 ? lod2.bondCount : 0,
    fileBytes: bytes,
    superposition: {
      scope: primaryFit.record.scope,
      nBefore: primaryFit.record.nBefore,
      nAfter: primaryFit.record.nAfter,
      keptFraction: primaryFit.record.keptFraction,
      rmsdBeforeA: primaryFit.record.rmsdBeforeA,
      rmsdAfterA: primaryFit.record.rmsdAfterA,
      mismatches: primaryFit.record.mismatches,
    },
    geometryChecks,
    clashCount: clashes.length,
  };
  return { asset, report };
}

const FACTOR_SPECS = [
  {
    id: 'rf1',
    pdbId: '8FZH',
    chain: 'w',
    descRe: /release factor 1/i,
    displayName: 'E. coli peptide chain release factor 1 (RF1, 8FZH chain w)',
    partName: 'Release factor RF1',
    chainName: 'Peptide chain release factor 1 (RF1)',
    rrna: { s16: 'a', s23: 'A' },
    scope: '23S',
    altScopes: ['16S+23S', '16S'],
    motifs: [
      { anchor: 'ggq', regex: 'GGQ', definition: 'Centroid of Gly-Gly-Gln catalytic motif CA atoms' },
      { anchor: 'codonReader', regex: 'P.T', definition: 'Centroid of PxT stop-codon recognition motif CA atoms' },
    ],
    l2Site: { anchor: 'ggq', radius: L2_RADIUS },
    extraNotes: [
      'Superposition scope deviation from PLAN.md 7.3 default (16S+23S -> 23S): 8FZH exhibits a +2.68% isotropic cryo-EM pixel-size/magnification offset relative to 7K00 (Rg 82.394 vs 80.245 A across 16S+23S P atoms), causing the 16S+23S 2.0 A pass to retain 48.4% (2069/4272, below the DEC-010 50% kept-fraction gate). Fitting on 23S retains 79.7% (2195/2753, RMSD 1.408 A), aligns the catalytic GGQ loop to the 50S PTC (5.961 A), and improves codonReader (PAT) proximity to siteA codon centroid (7.610 A vs 7.956 A). Diagnostic 16S+23S and 16S fits are recorded in source.superpositionAlternatives.',
    ],
  },
  {
    id: 'ef-tu',
    pdbId: '5WE4',
    chain: 'z',
    descRe: /elongation factor tu/i,
    displayName: 'E. coli elongation factor Tu (EF-Tu, 5WE4 chain z)',
    partName: 'Elongation factor EF-Tu',
    chainName: 'Elongation factor Tu (EF-Tu)',
    rrna: { s16: 'a', s23: 'A' },
    scope: '16S+23S',
    altScopes: ['23S', '16S'],
    motifs: [
      { anchor: 'gDomain', regex: 'G....GK[ST]', definition: 'Centroid of G-domain Walker A P-loop (GxxxxGK[ST]) CA atoms' },
    ],
    extraNotes: [
      'GTP analog (GppNHp / GNP), aminoacyl ligands, ions, and waters dropped per PLAN.md 7.2.',
    ],
  },
  {
    id: 'ef-g',
    pdbId: '7PJV',
    chain: 'x',
    descRe: /elongation factor g/i,
    displayName: 'E. coli elongation factor G (EF-G, 7PJV chain x)',
    partName: 'Elongation factor EF-G',
    chainName: 'Elongation factor G (EF-G)',
    rrna: { s16: 'a', s23: 'A' },
    scope: '23S',
    altScopes: ['16S+23S', '16S'],
    motifs: [
      {
        anchor: 'gDomain',
        regex: '[GA]....GK[ST]',
        definition: 'Centroid of G-domain Walker A P-loop CA atoms (E. coli EF-G canonical AHIDAGKT, author 16-23, matching [GA]xxxxGK[ST])',
      },
      {
        anchor: 'domainIV',
        authRange: [481, 603],
        definition: 'Centroid of EF-G Domain IV core CA atoms (7PJV chain x author 481-603 = UniProt P0A6M8 482-604, Met1 cleaved)',
      },
    ],
    extraNotes: [
      'Superposed on 23S rRNA P atoms only per DEC-010 (7PJV is a rotated hybrid-state ribosome; 16S+23S retains only 12.9%).',
      'E. coli EF-G Walker A P-loop is canonically AHIDAGKT (Ala16 in place of Gly; 6.576 A from bound GDP in 7PJV, 15.313 A from 7K00 23S SRL).',
      'Apramycin, GDP, Pi, ions, and waters dropped per PLAN.md 7.2.',
    ],
  },
  {
    id: 'if1',
    pdbId: '9ZN2',
    chain: 'y',
    descRe: /initiation factor if-?1/i,
    displayName: 'E. coli translation initiation factor IF1 (9ZN2 chain y)',
    partName: 'Initiation factor IF1',
    chainName: 'Translation initiation factor IF-1',
    rrna: { s16: 'a', s23: 'A' },
    scope: '16S+23S',
    altScopes: ['23S', '16S'],
    extraNotes: [
      '9ZN2 (70S IC*) exhibits a +2.28% isotropic magnification offset relative to 7K00 (Rg 82.060 vs 80.228 A); the PLAN.md 7.3 16S+23S superposition passes both gates (kept 50.7% >= 50%, RMSD 1.291 A <= 1.5 A). Diagnostic 23S and 16S fits are recorded in source.superpositionAlternatives.',
    ],
  },
  {
    id: 'if2',
    pdbId: '9ZN2',
    chain: 'x',
    descRe: /initiation factor if-?2/i,
    displayName: 'E. coli translation initiation factor IF2 (9ZN2 chain x)',
    partName: 'Initiation factor IF2',
    chainName: 'Translation initiation factor IF-2',
    rrna: { s16: 'a', s23: 'A' },
    scope: '16S+23S',
    altScopes: ['23S', '16S'],
    motifs: [
      { anchor: 'gDomain', regex: 'G....GK[ST]', definition: 'Centroid of G-domain Walker A P-loop (GxxxxGK[ST]) CA atoms' },
    ],
    extraNotes: [
      'Uses the same 9ZN2 16S+23S superposition as if1 (kept 50.7% >= 50%, RMSD 1.291 A <= 1.5 A).',
      'GDPCP, fMet ligand, ions, and waters dropped per PLAN.md 7.2. Modelled residues span author 296-890 (N-terminal disordered region 1-295 is unmodelled in 9ZN2).',
    ],
  },
  {
    id: 'if3',
    pdbId: '9FDA',
    chain: 'J',
    descRe: /initiation factor if-?3/i,
    displayName: 'E. coli translation initiation factor IF3 (9FDA chain J)',
    partName: 'Initiation factor IF3',
    chainName: 'Translation initiation factor IF-3',
    rrna: { s16: 'B' },
    scope: '16S',
    extraNotes: [
      '9FDA is a 30S-only initiation complex (16S chain B, 1051 modelled nucleotides); superposed onto 7K00 16S (chain A) P atoms.',
      'Antibiotic edeine B (entity 18), ions, and waters are excluded per PLAN.md 7.2. Modelled IF3 chain J spans author 76-177 (C-terminal domain; NTD 1-75 unmodelled in 9FDA).',
      'All 6 clashes (< 3.0 A) in the 70S ribo frame occur against 23S rRNA (50S subunit), reflecting IF3\'s physiological anti-association role blocking 50S joining prior to IF3 release.',
    ],
  },
];

export const recipes = FACTOR_SPECS.map(spec => ({
  id: spec.id,
  sources: [spec.pdbId, '7K00'],
  build: ctx => buildFactor(ctx, spec),
}));
