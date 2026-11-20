/**
 * @module kin/peptide-path
 * Nascent polypeptide path kinematics (PLAN.md §8.1, §8.3, §10 R3-K2, docs/CONTRACTS.md §7.4).
 * Precomputes centerline-referenced rigid residue templates from ideal Engh & Huber peptide geometry
 * (`js/science/peptide.js` + `js/science/residues.js`), threads them along the 50S exit tunnel and
 * solvent-side free path using rotation-minimising frames, and relaxes inter-residue peptide bonds
 * `C(i)-N(i+1)` strictly within `1.33 +/- 0.25 A` while preserving exact intra-residue geometry.
 *
 * Pure math module: zero DOM and zero three.js dependencies.
 */
import { sampleCatmullRom, rotationMinimizingFrames } from './frames.js';
import { sampleFreeChainAt } from './chain.js';
import { buildPeptide } from '../science/peptide.js';
import { placeAtom } from '../science/residues.js';

const EPS = 1e-12;
const STEP_RESIDUE = 3.40;        // A per residue along tunnel + free path (PLAN.md §8.3)
const IDEAL_CN = 1.329;           // A (Engh & Huber 1991 trans peptide bond)
const DEFAULT_SAMPLES = 512;      // arc-length table samples
const SMOOTH_PASSES = 16;         // endpoint-preserving Laplacian passes for voxelised tunnels
const RELAX_PASSES = 8;           // rigid-body origin Gauss-Seidel passes for C-N closure
const TETHER_WEIGHT = 0.15;       // keeps residue origins within ~0.15 A of exact path curve
const DEFAULT_RELEASE_TAIL = 15;  // A beyond tunnel exit at releaseProgress = 1

// ---- precomputed residue local templates (built lazily once per code3) -------------------------

const residueTemplateCache = new Map();

function normalizeCode3(code) {
  const up = String(code ?? 'ALA').trim().toUpperCase();
  if (up === 'FMET' || up === 'FME') return 'FME';
  return up;
}

/**
 * Build and cache one residue's rigid local template from an ideal `ALA-X-ALA` tripeptide
 * (`phi = -139, psi = 135, omega = 180`), referenced to the tripeptide centerline:
 * - `origin = 0.5 * (CA_1 + 0.5 * (CA_0 + CA_2))` (so alternating parity flips keep C-N aligned)
 * - `local x = unit(CA_2 - CA_0)` (chain N -> C direction)
 * - `local y = unit(perp_x(CB - CA_1))` (for GLY, virtual L-CB via Engh & Huber `placeAtom`)
 * - `local z = x x y`
 */
function getResidueTemplate(rawCode) {
  const code = normalizeCode3(rawCode);
  let tpl = residueTemplateCache.get(code);
  if (tpl) return tpl;

  const pep = buildPeptide(['ALA', code, 'ALA'], { cTerminalOxt: false });
  const r0 = pep.residues[0];
  const r1 = pep.residues[1];
  const r2 = pep.residues[2];
  const pos = pep.atoms.pos;
  const names = pep.atoms.name;
  const els = pep.atoms.el;

  const atomPos = (res, targetName) => {
    for (let i = 0; i < res.atomCount; i++) {
      const g = res.atomStart + i;
      if (names[g] === targetName) return [pos[g * 3], pos[g * 3 + 1], pos[g * 3 + 2]];
    }
    return null;
  };

  const ca0 = atomPos(r0, 'CA');
  const ca1 = atomPos(r1, 'CA');
  const ca2 = atomPos(r2, 'CA');
  const n1 = atomPos(r1, 'N');
  const c1 = atomPos(r1, 'C');
  let cb1 = atomPos(r1, 'CB');
  if (!cb1) {
    // GLY lacks CB: place virtual L-CB using exact Engh & Huber internal coordinates
    cb1 = placeAtom(c1, n1, ca1, 1.521, 110.5, -122.5);
  }

  // Local axes: x = unit(ca2 - ca0), y = unit(perp_x(cb1 - ca1)), z = x x y
  let xx = ca2[0] - ca0[0], xy = ca2[1] - ca0[1], xz = ca2[2] - ca0[2];
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;

  let yx = cb1[0] - ca1[0], yy = cb1[1] - ca1[1], yz = cb1[2] - ca1[2];
  const yd = yx * xx + yy * xy + yz * xz;
  yx -= yd * xx; yy -= yd * xy; yz -= yd * xz;
  const yl = Math.hypot(yx, yy, yz) || 1;
  yx /= yl; yy /= yl; yz /= yl;

  const zx = xy * yz - xz * yy;
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;

  // Tripeptide centerline origin so alternating parity residues sit symmetrically on the strand axis
  const ox = 0.5 * (ca1[0] + 0.5 * (ca0[0] + ca2[0]));
  const oy = 0.5 * (ca1[1] + 0.5 * (ca0[1] + ca2[1]));
  const oz = 0.5 * (ca1[2] + 0.5 * (ca0[2] + ca2[2]));

  const count = r1.atomCount;
  const local = new Float32Array(count * 3);
  const localNames = new Array(count);
  const localEl = new Array(count);
  let idxN = -1, idxCA = -1, idxC = -1;

  for (let i = 0; i < count; i++) {
    const g = r1.atomStart + i;
    const dx = pos[g * 3] - ox;
    const dy = pos[g * 3 + 1] - oy;
    const dz = pos[g * 3 + 2] - oz;
    local[i * 3]     = dx * xx + dy * xy + dz * xz;
    local[i * 3 + 1] = dx * yx + dy * yy + dz * yz;
    local[i * 3 + 2] = dx * zx + dy * zy + dz * zz;
    localNames[i] = names[g];
    localEl[i] = els[g];
    if (names[g] === 'N') idxN = i;
    else if (names[g] === 'CA') idxCA = i;
    else if (names[g] === 'C') idxC = i;
  }

  // Extract intra-residue bonds relative to r1.atomStart
  const bonds = [];
  const start = r1.atomStart;
  const end = start + count;
  for (let i = 0; i < pep.bonds.length; i += 2) {
    const a = pep.bonds[i], b = pep.bonds[i + 1];
    if (a >= start && a < end && b >= start && b < end) {
      bonds.push(a - start, b - start);
    }
  }

  tpl = {
    code,
    count,
    local,
    names: localNames,
    el: localEl,
    bonds: Uint16Array.from(bonds),
    idxN,
    idxCA,
    idxC,
    localN: [local[idxN * 3], local[idxN * 3 + 1], local[idxN * 3 + 2]],
    localC: [local[idxC * 3], local[idxC * 3 + 1], local[idxC * 3 + 2]],
  };
  residueTemplateCache.set(code, tpl);
  return tpl;
}

// ---- path normalisation, smoothing, and arc-length sampling ------------------------------------

function clamp01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

/** Right-handed 3x3 row-major rotation matrix with +z along `unit(z)`. */
function basisFromZ(z) {
  const zl = Math.hypot(z[0], z[1], z[2]) || 1;
  const zx = z[0] / zl, zy = z[1] / zl, zz = z[2] / zl;
  let ux = Math.abs(zx) < 0.9 ? 1 : 0;
  let uy = Math.abs(zx) < 0.9 ? 0 : 1;
  let uz = 0;
  const d = ux * zx + uy * zy + uz * zz;
  ux -= d * zx; uy -= d * zy; uz -= d * zz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = zy * uz - zz * uy;
  const vy = zz * ux - zx * uz;
  const vz = zx * uy - zy * ux;
  return [ux, vx, zx, uy, vy, zy, uz, vz, zz];
}

/** Extract `number[][]` polyline from any supported path input (raw array, typed array, asset path, or free chain). */
function extractPathPoints(pathObj, t = 0) {
  if (!pathObj) return null;
  // Support buildFreeChain descriptors directly
  if (Array.isArray(pathObj.controlPoints) && pathObj._workPoints) {
    const restLen = pathObj.restLength || 100;
    const nSeg = Math.max(8, Math.ceil(restLen / 4.0));
    const first = sampleFreeChainAt(pathObj, 0, t);
    const total = first.length;
    const pts = new Array(nSeg + 1);
    pts[0] = first.point;
    for (let i = 1; i <= nSeg; i++) {
      pts[i] = sampleFreeChainAt(pathObj, (i / nSeg) * total, t).point;
    }
    return pts;
  }
  // Support asset path objects `{ points: Float32Array | number[][], count?: number }`
  const raw = pathObj.points ?? pathObj;
  if (ArrayBuffer.isView(raw)) {
    const n = pathObj.count ? Math.min(pathObj.count, Math.floor(raw.length / 3)) : Math.floor(raw.length / 3);
    if (n < 2) return null;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      pts[i] = [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]];
    }
    return pts;
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    return raw.map(p => [Number(p[0]), Number(p[1]), Number(p[2])]);
  }
  return null;
}

/** Endpoint-preserving Laplacian smoothing for dense voxelised tunnel polylines (like ribosome-70s). */
function smoothPolyline(pts, passes = SMOOTH_PASSES) {
  const n = pts.length;
  if (n < 5 || passes <= 0) return pts.map(p => p.slice());
  let total = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  }
  const meanStep = total / (n - 1);
  // Only smooth dense polylines (voxel step < 4 A); coarse spline control points stay exact
  if (meanStep >= 4.0) return pts.map(p => p.slice());

  let cur = pts.map(p => p.slice());
  let next = pts.map(p => p.slice());
  for (let pass = 0; pass < passes; pass++) {
    next[0][0] = cur[0][0]; next[0][1] = cur[0][1]; next[0][2] = cur[0][2];
    next[n - 1][0] = cur[n - 1][0]; next[n - 1][1] = cur[n - 1][1]; next[n - 1][2] = cur[n - 1][2];
    for (let i = 1; i < n - 1; i++) {
      next[i][0] = 0.25 * cur[i - 1][0] + 0.5 * cur[i][0] + 0.25 * cur[i + 1][0];
      next[i][1] = 0.25 * cur[i - 1][1] + 0.5 * cur[i][1] + 0.25 * cur[i + 1][1];
      next[i][2] = 0.25 * cur[i - 1][2] + 0.5 * cur[i][2] + 0.25 * cur[i + 1][2];
    }
    const tmp = cur; cur = next; next = tmp;
  }
  return cur;
}

const tunnelSmoothCache = new WeakMap();

function getSmoothedTunnelPoints(tunnelPath) {
  if (tunnelPath && typeof tunnelPath === 'object') {
    const cached = tunnelSmoothCache.get(tunnelPath);
    if (cached) return cached;
  }
  const raw = extractPathPoints(tunnelPath, 0);
  if (!raw) throw new TypeError('kin/peptide-path: tunnelPath must contain at least 2 points');
  const smoothed = smoothPolyline(raw, SMOOTH_PASSES);
  let len = 0;
  for (let i = 1; i < smoothed.length; i++) {
    len += Math.hypot(
      smoothed[i][0] - smoothed[i - 1][0],
      smoothed[i][1] - smoothed[i - 1][1],
      smoothed[i][2] - smoothed[i - 1][2]
    );
  }
  const entry = { points: smoothed, length: len };
  if (tunnelPath && typeof tunnelPath === 'object') {
    tunnelSmoothCache.set(tunnelPath, entry);
  }
  return entry;
}

/** Build a piecewise-smooth combined centerline (`tunnelPts` + optional `freePts`) with 512-sample arc table. */
function buildCombinedCurve(tunnelPts, freePts) {
  // Combine polylines, avoiding a duplicate/near-zero segment at the exit junction
  const combined = tunnelPts.map(p => p.slice());
  let freeLen = 0;
  if (freePts && freePts.length >= 2) {
    // If freePts are coarse control points (mean step > 6 A), densify via centripetal Catmull-Rom
    let rawFreeLen = 0;
    for (let i = 1; i < freePts.length; i++) {
      rawFreeLen += Math.hypot(
        freePts[i][0] - freePts[i - 1][0],
        freePts[i][1] - freePts[i - 1][1],
        freePts[i][2] - freePts[i - 1][2]
      );
    }
    freeLen = rawFreeLen;
    let denseFree = freePts;
    if (rawFreeLen / (freePts.length - 1) > 6.0) {
      const m = Math.max(8, Math.ceil(rawFreeLen / 3.5));
      denseFree = new Array(m + 1);
      for (let i = 0; i <= m; i++) denseFree[i] = sampleCatmullRom(freePts, i / m);
    }
    const lastT = combined[combined.length - 1];
    const firstF = denseFree[0];
    const gap = Math.hypot(firstF[0] - lastT[0], firstF[1] - lastT[1], firstF[2] - lastT[2]);
    const startIdx = gap < 1.0 ? 1 : 0;
    for (let i = startIdx; i < denseFree.length; i++) combined.push(denseFree[i].slice());
  }

  // Build cumulative arc lengths directly along the dense combined polyline
  const n = combined.length;
  const polyCum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    polyCum[i] = polyCum[i - 1] + Math.hypot(
      combined[i][0] - combined[i - 1][0],
      combined[i][1] - combined[i - 1][1],
      combined[i][2] - combined[i - 1][2]
    );
  }
  const totalPolyLen = polyCum[n - 1];

  // Resample to evenly spaced ~3.0 A knots so Catmull-Rom has uniform chord density across the junction
  const knotCount = Math.max(2, Math.min(256, Math.round(totalPolyLen / 3.0) + 1));
  const knots = new Array(knotCount);
  let j = 0;
  for (let k = 0; k < knotCount; k++) {
    const s = (k / (knotCount - 1)) * totalPolyLen;
    while (j < n - 2 && polyCum[j + 1] < s) j++;
    const seg = polyCum[j + 1] - polyCum[j];
    const f = seg > EPS ? (s - polyCum[j]) / seg : 0;
    const a = combined[j], b = combined[j + 1];
    knots[k] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // 512-sample arc-length table over centripetal Catmull-Rom through the uniform knots
  const samples = DEFAULT_SAMPLES;
  const cum = new Float64Array(samples + 1);
  let prev = sampleCatmullRom(knots, 0);
  for (let i = 1; i <= samples; i++) {
    const p = sampleCatmullRom(knots, i / samples);
    cum[i] = cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  const length = cum[samples];

  const uAt = s => {
    if (!(s > 0) || !(length > EPS)) return 0;
    if (s >= length) return 1;
    let lo = 0, hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    return (lo + (seg > 0 ? (s - cum[lo]) / seg : 0)) / samples;
  };

  const endPt = sampleCatmullRom(knots, 1);
  const pBefore = sampleCatmullRom(knots, Math.max(0, 1 - 1 / samples));
  const ex = endPt[0] - pBefore[0], ey = endPt[1] - pBefore[1], ez = endPt[2] - pBefore[2];
  const el = Math.hypot(ex, ey, ez) || 1;
  const endTan = [ex / el, ey / el, ez / el];

  const pAfter = sampleCatmullRom(knots, Math.min(1, 1 / samples));
  const pStart = sampleCatmullRom(knots, 0);
  const sx = pAfter[0] - pStart[0], sy = pAfter[1] - pStart[1], sz = pAfter[2] - pStart[2];
  const sl = Math.hypot(sx, sy, sz) || 1;
  const startTan = [sx / sl, sy / sl, sz / sl];

  const pointAt = s => {
    if (s <= length) return sampleCatmullRom(knots, uAt(s));
    const extra = s - length;
    return [endPt[0] + endTan[0] * extra, endPt[1] + endTan[1] * extra, endPt[2] + endTan[2] * extra];
  };

  return { length, freeLen, startTan, endTan, pointAt };
}

/** Ensure `outGroup` has typed arrays of sufficient capacity and reuse them in place. */
function prepareOutGroup(outGroup, atomCount, bondFloats, resCount) {
  const g = outGroup && typeof outGroup === 'object' ? outGroup : {};
  if (g.id == null) g.id = 'peptide';
  g.kind = 'peptide';
  g.count = atomCount;
  if (typeof g.opacity !== 'number') g.opacity = 1;
  if (g.detail === undefined) g.detail = 'auto';

  if (!(g._posBuf instanceof Float32Array) || g._posBuf.length < atomCount * 3) {
    g._posBuf = new Float32Array(Math.max(3, atomCount * 3));
  }
  g.pos = g._posBuf.subarray(0, atomCount * 3);

  if (!(g._resBuf instanceof Uint16Array) || g._resBuf.length < atomCount) {
    g._resBuf = new Uint16Array(Math.max(1, atomCount));
  }
  g.residue = g._resBuf.subarray(0, atomCount);

  if (!(g._bondsBuf instanceof Uint16Array) || g._bondsBuf.length < bondFloats) {
    g._bondsBuf = new Uint16Array(Math.max(2, bondFloats));
  }
  g.bonds = g._bondsBuf.subarray(0, bondFloats);

  if (!Array.isArray(g.el)) g.el = new Array(atomCount);
  g.el.length = atomCount;
  if (!Array.isArray(g.names)) g.names = new Array(atomCount);
  g.names.length = atomCount;

  if (!Array.isArray(g.residues)) g.residues = [];
  while (g.residues.length < resCount) {
    g.residues.push({ index: 0, code3: 'ALA', atomStart: 0, atomCount: 0, ca: [0, 0, 0] });
  }
  g.residues.length = resCount;

  return g;
}

/**
 * Pose atomic coordinates for a peptide of three-letter residue codes `codes3` along
 * the exit tunnel (`tunnelPath`) and solvent continuation (`freePath`), shifting outward
 * according to `releaseProgress` in `[0, 1]`.
 *
 * Indexing and orientation (PLAN.md §8.3, docs/CONTRACTS.md §7.4):
 * - `codes3[0]` is the N-terminus (e.g. `'FME'`), `codes3[codes3.length - 1]` is the C-terminus.
 * - Residue `k` from the C-terminus (`k = 0` at `codes3[L - 1]`, attached to the P-site tRNA at `ptc`;
 *   higher `k` toward the N-terminus) sits at arc length `s_k = k * 3.40 + releaseOffset` A along
 *   `tunnelPath` then `freePath`.
 * - Each residue keeps its exact rigid Engh & Huber local geometry while bounded rigid-body origin
 *   relaxation holds every inter-residue `C(i)-N(i+1)` bond strictly within `1.33 +/- 0.25 A`.
 * - Writes an `AtomGroupLayer`-compatible `AtomGroup` directly into `outGroup` (reusing buffers).
 *
 * @param {string[]} codes3 - Ordered three-letter residue codes from N-terminus to C-terminus.
 * @param {object | Float32Array | number[][]} tunnelPath - Exit-tunnel path in world coordinates.
 * @param {object | Float32Array | number[][] | null} freePath - Solvent-side continuation path (or `buildFreeChain` descriptor).
 * @param {number} releaseProgress - Post-termination release slide progress in `[0, 1]`.
 * @param {object} [outGroup] - Reusable AtomGroup object to populate in place.
 * @param {{ t?: number, releaseDistance?: number }} [opts] - Optional story time (for swaying `freePath`) and release distance.
 * @returns {object} Populated `outGroup`.
 */
export function posePeptideOnPath(codes3, tunnelPath, freePath, releaseProgress, outGroup, opts = {}) {
  if (!Array.isArray(codes3)) {
    throw new TypeError('kin/peptide-path: codes3 must be an array of residue codes');
  }
  const L = codes3.length;
  if (L === 0) {
    return prepareOutGroup(outGroup, 0, 0, 0);
  }

  const tunnel = getSmoothedTunnelPoints(tunnelPath);
  const t = Number.isFinite(opts?.t) ? opts.t : 0;
  const freePts = extractPathPoints(freePath, t);
  const curve = buildCombinedCurve(tunnel.points, freePts);

  // Release slide distance: slides C-terminal residue past tunnel exit into solvent
  const rp = clamp01(Number.isFinite(releaseProgress) ? releaseProgress : 0);
  const releaseDistance = Number.isFinite(opts?.releaseDistance)
    ? Math.max(0, opts.releaseDistance)
    : tunnel.length + (curve.freeLen > 0 ? Math.min(25, Math.max(DEFAULT_RELEASE_TAIL, curve.freeLen * 0.25)) : DEFAULT_RELEASE_TAIL);
  const releaseOffset = rp * releaseDistance;

  // Lookup templates and compute total atoms & bonds
  const tpls = new Array(L);
  let totalAtoms = 0;
  let totalBondPairs = Math.max(0, L - 1); // L - 1 inter-residue C-N peptide bonds
  for (let r = 0; r < L; r++) {
    const tpl = getResidueTemplate(codes3[r]);
    tpls[r] = tpl;
    totalAtoms += tpl.count;
    totalBondPairs += tpl.bonds.length >> 1;
  }

  const g = prepareOutGroup(outGroup, totalAtoms, totalBondPairs * 2, L);

  // Sample path positions ordered by k = 0 .. L - 1 (k = 0 is C-term r = L - 1, k = L - 1 is N-term r = 0)
  const kPts = new Array(L);
  for (let k = 0; k < L; k++) {
    kPts[k] = curve.pointAt(k * STEP_RESIDUE + releaseOffset);
  }

  // Rotation-minimising frames along the sampled residue origins
  let seedTan;
  if (L >= 2) {
    const dx = kPts[1][0] - kPts[0][0], dy = kPts[1][1] - kPts[0][1], dz = kPts[1][2] - kPts[0][2];
    const dl = Math.hypot(dx, dy, dz);
    seedTan = dl > EPS ? [dx / dl, dy / dl, dz / dl] : curve.startTan;
  } else {
    seedTan = curve.startTan;
  }
  const rmf = rotationMinimizingFrames(kPts, { o: kPts[0], R: basisFromZ(seedTan) });

  // Build residue rigid frames indexed by residue r = 0 (N-term) .. L - 1 (C-term).
  // Path tangent (+z_rmf) goes from C-term (k = 0) toward N-term (k = L - 1), whereas
  // residue local +x goes N -> C, so local x = -z_rmf. Parity (r & 1) flips (y, z) by 180 deg about x
  // so consecutive trans peptide planes align cleanly.
  const resR = new Array(L);
  const origins = new Array(L);
  const restOrigins = new Array(L);
  for (let r = 0; r < L; r++) {
    const k = L - 1 - r;
    const f = rmf[k];
    const R = f.R;
    const ux = R[0], uy = R[3], uz = R[6];
    const vx = R[1], vy = R[4], vz = R[7];
    const tx = R[2], ty = R[5], tz = R[8];
    const sgn = (r & 1) === 0 ? 1 : -1;
    // Columns [local_x, local_y, local_z] = [-t, sgn * u, -sgn * v]; det = (-1)*(sgn)*(-sgn)*det(t,u,v) = +1
    resR[r] = [
      -tx,  sgn * ux, -sgn * vx,
      -ty,  sgn * uy, -sgn * vy,
      -tz,  sgn * uz, -sgn * vz,
    ];
    origins[r] = [f.o[0], f.o[1], f.o[2]];
    restOrigins[r] = [f.o[0], f.o[1], f.o[2]];
  }

  // Rigid-body origin Gauss-Seidel relaxation for C(r)-N(r+1) = 1.329 A.
  // Keeps residue C-term (r = L - 1) pinned at s_0 and gently tethers interior origins to the path.
  if (L >= 2) {
    const rotC = new Array(L);
    const rotN = new Array(L);
    for (let r = 0; r < L; r++) {
      const R = resR[r];
      const lc = tpls[r].localC;
      const ln = tpls[r].localN;
      rotC[r] = [
        R[0] * lc[0] + R[1] * lc[1] + R[2] * lc[2],
        R[3] * lc[0] + R[4] * lc[1] + R[5] * lc[2],
        R[6] * lc[0] + R[7] * lc[1] + R[8] * lc[2],
      ];
      rotN[r] = [
        R[0] * ln[0] + R[1] * ln[1] + R[2] * ln[2],
        R[3] * ln[0] + R[4] * ln[1] + R[5] * ln[2],
        R[6] * ln[0] + R[7] * ln[1] + R[8] * ln[2],
      ];
    }

    for (let pass = 0; pass < RELAX_PASSES; pass++) {
      for (let r = L - 2; r >= 0; r--) {
        const oA = origins[r], oB = origins[r + 1];
        const rc = rotC[r], rn = rotN[r + 1];
        const dx = (oB[0] + rn[0]) - (oA[0] + rc[0]);
        const dy = (oB[1] + rn[1]) - (oA[1] + rc[1]);
        const dz = (oB[2] + rn[2]) - (oA[2] + rc[2]);
        const d = Math.hypot(dx, dy, dz);
        if (d < EPS) continue;
        const err = d - IDEAL_CN;
        const corr = err / d;
        if (r + 1 === L - 1) {
          // C-terminal residue pinned at s_0; adjust r only
          oA[0] += dx * corr;
          oA[1] += dy * corr;
          oA[2] += dz * corr;
        } else {
          const half = 0.5 * corr;
          oA[0] += dx * half; oA[1] += dy * half; oA[2] += dz * half;
          oB[0] -= dx * half; oB[1] -= dy * half; oB[2] -= dz * half;
        }
      }
      // Gentle elastic tether to keep interior origins hugging the tunnel centerline
      for (let r = 0; r < L - 1; r++) {
        const o = origins[r], ro = restOrigins[r];
        o[0] += (ro[0] - o[0]) * TETHER_WEIGHT;
        o[1] += (ro[1] - o[1]) * TETHER_WEIGHT;
        o[2] += (ro[2] - o[2]) * TETHER_WEIGHT;
      }
    }
  }

  // Write world atom coordinates, elements, names, residue indices, and covalent bonds into outGroup
  const pos = g.pos;
  const el = g.el;
  const names = g.names;
  const residueIdx = g.residue;
  const bonds = g.bonds;
  const residues = g.residues;

  let atomCursor = 0;
  let bondCursor = 0;
  let prevCGlobal = -1;

  for (let r = 0; r < L; r++) {
    const tpl = tpls[r];
    const R = resR[r];
    const o = origins[r];
    const loc = tpl.local;
    const atomStart = atomCursor;

    for (let i = 0; i < tpl.count; i++) {
      const lx = loc[i * 3], ly = loc[i * 3 + 1], lz = loc[i * 3 + 2];
      const p3 = atomCursor * 3;
      pos[p3]     = R[0] * lx + R[1] * ly + R[2] * lz + o[0];
      pos[p3 + 1] = R[3] * lx + R[4] * ly + R[5] * lz + o[1];
      pos[p3 + 2] = R[6] * lx + R[7] * ly + R[8] * lz + o[2];
      el[atomCursor] = tpl.el[i];
      names[atomCursor] = tpl.names[i];
      residueIdx[atomCursor] = r;
      atomCursor++;
    }

    // Intra-residue bonds
    const tb = tpl.bonds;
    for (let i = 0; i < tb.length; i += 2) {
      bonds[bondCursor++] = atomStart + tb[i];
      bonds[bondCursor++] = atomStart + tb[i + 1];
    }

    // Inter-residue peptide bond C(r - 1) - N(r)
    if (prevCGlobal >= 0) {
      bonds[bondCursor++] = prevCGlobal;
      bonds[bondCursor++] = atomStart + tpl.idxN;
    }
    prevCGlobal = atomStart + tpl.idxC;

    // Residue metadata for AtomGroupLayer (CA coordinates + code3 + atom slice)
    const caGlobal = atomStart + tpl.idxCA;
    const rec = residues[r];
    rec.index = r;
    rec.code3 = tpl.code;
    rec.atomStart = atomStart;
    rec.atomCount = tpl.count;
    rec.ca[0] = pos[caGlobal * 3];
    rec.ca[1] = pos[caGlobal * 3 + 1];
    rec.ca[2] = pos[caGlobal * 3 + 2];
  }

  return g;
}
