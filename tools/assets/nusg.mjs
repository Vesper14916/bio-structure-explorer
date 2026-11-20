// Recipe module for E. coli transcription-translation coupling factor NusG (Round 3, task R3-A4):
//   - nusg (PDB 6ZTJ chain CF, superposed into the rnap-ec frame via 6ZTJ RNAP beta/beta' Calpha)
// Provenance and measurements: docs/assets/rnap.md.
import { ASSET_FORMAT, ASSET_VERSION, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../../js/assets/format.js';
import { dist, add, sub, scale, dot, cross, norm, mulMV } from '../../js/science/math.js';
import { polymerChains } from '../lib/mmcif.mjs';
import { envelope, meshStats } from '../lib/surface.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const L0_SIGMA = 4.5, L0_SPACING = 2.5, L0_MAX_TRIANGLES = 8000, L0_MIN_INSIDE = 0.95;
const L1_MAX_BEADS = 900;
const NTD_RANGE = [1, 117];    // E. coli NusG N-terminal RNAP-binding domain (residues 1-117; 6-117 modelled in 6ZTJ)
const CTD_RANGE = [125, 181];  // E. coli NusG C-terminal uS10-binding KOW domain (residues 125-181; 125-180 modelled in 6ZTJ)

const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });
const frameFromAxes = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;
const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const ptOf = T => p => add(mulMV(T.R, p), T.o);

function axisFrame(o, z, refs = [[1, 0, 0], [0, 1, 0]]) {
  let ref = refs[0];
  if (angleDeg(z, ref) < 10 || angleDeg(z, ref) > 170) ref = refs[1];
  const x = norm(sub(ref, scale(z, dot(ref, z))));
  return { o, R: frameFromAxes(x, cross(z, x), z) };
}

function buildNusg(ctx) {
  const ecBuild = ctx.built.get('rnap-ec');
  if (!ecBuild || !ecBuild.ztjToRnap) {
    throw new Error('nusg: depends on rnap-ec build providing ztjToRnap transform');
  }
  const entry = ecBuild.ztjEntry || ctx.lockEntry('6ZTJ');
  const parsed = ecBuild.ztjParsed || ctx.loadSource(entry);
  const chains = polymerChains(parsed);
  const ent = new Map(parsed.entities.map(e => [e.id, e]));

  const cf = chains.get('CF');
  if (!cf) throw new Error('6ZTJ: chain CF (NusG) not found');
  const eInfo = ent.get(cf.entity);
  if (!eInfo || eInfo.class !== 'protein' || !/NusG|antitermination/i.test(eInfo.description)) {
    throw new Error(`6ZTJ chain CF unexpected description: ${eInfo && eInfo.description}`);
  }

  const tf = ptOf(ecBuild.ztjToRnap);
  const l1Pos = [], l1Chain = [], l1Kind = [];
  const allPts = [], ntdPts = [], ctdPts = [];
  let minAuth = Infinity, maxAuth = -Infinity;

  for (const res of cf.residues) {
    if (!res.atoms.CA) continue;
    const p = tf(res.atoms.CA);
    l1Pos.push(p[0], p[1], p[2]);
    l1Chain.push(0);
    l1Kind.push(0);
    allPts.push(p);
    if (res.authSeq < minAuth) minAuth = res.authSeq;
    if (res.authSeq > maxAuth) maxAuth = res.authSeq;
    if (res.authSeq >= NTD_RANGE[0] && res.authSeq <= NTD_RANGE[1]) ntdPts.push(p);
    if (res.authSeq >= CTD_RANGE[0] && res.authSeq <= CTD_RANGE[1]) ctdPts.push(p);
  }
  if (!allPts.length) throw new Error('6ZTJ chain CF: no Calpha beads');
  if (allPts.length > L1_MAX_BEADS) throw new Error(`nusg: ${allPts.length} L1 beads exceeds ${L1_MAX_BEADS}`);
  if (ntdPts.length < 20 || ctdPts.length < 20) {
    throw new Error(`nusg: unexpected domain Calpha counts (NTD ${ntdPts.length}, CTD ${ctdPts.length})`);
  }

  const center = centroid(allPts);
  const ntdCenter = centroid(ntdPts);
  const ctdCenter = centroid(ctdPts);
  const bridgeAxis = norm(sub(ctdCenter, ntdCenter));

  const env = envelope(l1Pos, { sigma: L0_SIGMA, spacing: L0_SPACING, maxTriangles: L0_MAX_TRIANGLES });
  const ms = meshStats(env.positions, env.indices);
  const triCount = env.indices.length / 3;
  const vertCount = env.positions.length / 3;
  if (triCount > L0_MAX_TRIANGLES) throw new Error(`nusg L0: ${triCount} triangles exceeds ${L0_MAX_TRIANGLES}`);
  if (env.insideByRay < L0_MIN_INSIDE) throw new Error(`nusg L0: only ${(env.insideByRay * 100).toFixed(1)}% beads inside (< 95%)`);
  if (!ms.closed || ms.signedVolume <= 0) throw new Error(`nusg L0: mesh not closed/outward: ${JSON.stringify(ms)}`);

  let radius = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of allPts) {
    radius = Math.max(radius, dist(p, center));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }

  const sup = ecBuild.ztjRnapSuperposition;
  const asset = {
    format: ASSET_FORMAT,
    version: ASSET_VERSION,
    id: 'nusg',
    name: 'E. coli transcription-translation coupling factor NusG',
    kind: 'machine',
    units: 'angstrom',
    quantStep: QUANT_STEP,
    source: {
      type: 'pdb',
      pdbId: entry.pdbId,
      url: entry.url,
      title: parsed.title,
      method: parsed.method,
      resolutionA: parsed.resolutionA,
      organism: eInfo.organism,
      downloaded: entry.downloaded,
      revisionDate: parsed.revisionDate,
      sha256: entry.sha256,
      license: ctx.LICENSE,
      chainsUsed: [`CF (NusG, modelled auth ${minAuth}..${maxAuth}, ${allPts.length} Calpha)`],
      frameSource: `rnap-ec asset frame (6ALF), via 6ZTJ RNAP beta/beta' superposition`,
      superposition: sup,
      domains: {
        ntd: { authSeqRange: [minAuth, NTD_RANGE[1]], calphaCount: ntdPts.length },
        ctd: { authSeqRange: [CTD_RANGE[0], maxAuth], calphaCount: ctdPts.length },
        ntdToCtdDistanceA: r3(dist(ntdCenter, ctdCenter)),
      },
      notes: [
        'Generated by tools/build-assets.mjs (recipe tools/assets/nusg.mjs) from PDB 6ZTJ pinned in tools/sources.lock.json (model 1, altloc . or A, no hydrogens). Full provenance: docs/assets/rnap.md.',
        `Stored in the rnap frame via the 6ZTJ -> 6ALF RNAP beta/beta' Calpha superposition (${sup.nAfter}/${sup.nBefore} kept, RMSD ${sup.rmsdBeforeA} -> ${sup.rmsdAfterA} A).`,
        `Anchors: center = all ${allPts.length} Calpha centroid; ntd = N-terminal RNAP-binding domain (residues ${minAuth}-${NTD_RANGE[1]}, ${ntdPts.length} Calpha); ctd = C-terminal uS10-binding KOW domain (residues ${CTD_RANGE[0]}-${maxAuth}, ${ctdPts.length} Calpha); NTD-CTD separation ${dist(ntdCenter, ctdCenter).toFixed(2)} A.`,
        `L0: Gaussian density envelope (sigma ${env.sigma} A, grid ${env.spacing} A), ${triCount} triangles, closed, outward, ${(env.insideByRay * 100).toFixed(1)}% of beads inside.`,
        'L2 omitted (factor without catalytic L2 site per PLAN.md §7.4).',
      ],
    },
    bounds: { center: center.map(r3), radius: r3(radius), size: [0, 1, 2].map(k => r3(hi[k] - lo[k])) },
    parts: [{ id: 'body', name: 'NusG (NTD + CTD)', role: 'body' }],
    chains: [{ id: 'CF', part: 'body', class: 'protein', name: 'NusG (nusG)', residues: allPts.length, subunit: 'nusg' }],
    lod0: {
      parts: [{
        part: 'body',
        positions: encodePositions(env.positions),
        indices: vertCount < 65536 ? encodeArray(Uint16Array.from(env.indices)) : encodeArray(Uint32Array.from(env.indices)),
        indexType: vertCount < 65536 ? 'u16' : 'u32',
        vertexCount: vertCount,
        triangleCount: triCount,
        sigma: env.sigma,
        spacing: env.spacing,
        beadsInside: r3(env.insideByRay),
      }],
    },
    lod1: {
      count: allPts.length,
      positions: encodePositions(l1Pos),
      chain: encodeArray(Uint8Array.from(l1Chain)),
      kind: encodeArray(Uint8Array.from(l1Kind)),
    },
    anchors: {
      center: { o: center.map(r3), R: I3 },
      ntd: frameOut(axisFrame(ntdCenter, bridgeAxis)),
      ctd: frameOut(axisFrame(ctdCenter, bridgeAxis)),
    },
  };

  const problems = validateAsset(asset);
  if (problems.length) throw new Error('nusg invalid:\n' + problems.join('\n'));

  const report = {
    pdbId: entry.pdbId,
    chain: 'CF',
    l1: allPts.length,
    l0: { triangles: triCount, vertices: vertCount, spacing: env.spacing, beadsInside: env.insideByRay, closed: ms.closed, volume: ms.signedVolume },
    ntdCalpha: ntdPts.length,
    ctdCalpha: ctdPts.length,
    ntdToCtdDistanceA: r3(dist(ntdCenter, ctdCenter)),
    bounds: asset.bounds,
  };
  return { asset, report };
}

export const recipes = [
  { id: 'nusg', sources: ['6ZTJ', '6ALF'], dependsOn: ['rnap-ec'], build: buildNusg },
];
