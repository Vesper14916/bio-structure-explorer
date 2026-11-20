/**
 * @module kin/chain
 * Free single-stranded nucleic acid chain kinematics (PLAN.md §8.1, §8.3, §10 R3-K2).
 * Builds centripetal Catmull-Rom splines with 512-sample arc-length tables, applies deterministic
 * anchor-damped gentle undulation, and poses A-form single-strand nucleotides with rotation-minimising
 * frames and bounded backbone-closure tilt.
 *
 * Pure math module: zero DOM and zero three.js dependencies.
 */
import { sampleCatmullRom, rotationMinimizingFrames, matToQuat, quatToMat, writeFrame16 } from './frames.js';
import { HELIX_A, BACKBONE_RNA } from '../science/templates.js';

const DEG = Math.PI / 180;
const EPS = 1e-12;
const DEFAULT_SAMPLES = 512;
const DEFAULT_RISE = HELIX_A.rise;            // 2.81 A
const DEFAULT_TWIST_DEG = HELIX_A.twistDeg;   // 32.72727272727273 deg
const DEFAULT_SWAY_AMP = 6.0;                 // A
const DEFAULT_SWAY_PERIOD = 7.0;              // s
const DEFAULT_DAMP_RADIUS = 30.0;             // A
const IDEAL_O3P = 1.6017;                     // A (ideal A-form O3'(k)-P(k+1))
const MAX_TILT_XY = 4.5 * DEG;                // keeps axial rise strictly inside 2.81 +/- 0.05 A
const MAX_TILT_Z = 4.0 * DEG;                 // slight twist slack without affecting helix axis

const O3_LOCAL = BACKBONE_RNA["O3'"];
const P_LOCAL = BACKBONE_RNA.P;

/** FNV-1a 32-bit string hash for deterministic chain seeding. */
function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic Mulberry32 PRNG returning values in `[0, 1)`. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function smoothstep01(x) {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
}

/** Construct a right-handed orthonormal 3x3 row-major matrix whose +z column is `unit(z)`. */
function basisFromZ(z, out = new Array(9)) {
  const zl = Math.hypot(z[0], z[1], z[2]) || 1;
  const zx = z[0] / zl, zy = z[1] / zl, zz = z[2] / zl;
  let ux, uy, uz;
  if (Math.abs(zx) < 0.9) {
    ux = 1; uy = 0; uz = 0;
  } else {
    ux = 0; uy = 1; uz = 0;
  }
  const d = ux * zx + uy * zy + uz * zz;
  ux -= d * zx; uy -= d * zy; uz -= d * zz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = zy * uz - zz * uy;
  const vy = zz * ux - zx * uz;
  const vz = zx * uy - zy * ux;
  out[0] = ux; out[1] = vx; out[2] = zx;
  out[3] = uy; out[4] = vy; out[5] = zy;
  out[6] = uz; out[7] = vz; out[8] = zz;
  return out;
}

/** Align a seed rotation matrix so its +z column matches `targetZ` via minimal rotation. */
function alignMatrixZ(R, targetZ, out = new Array(9)) {
  const zl = Math.hypot(targetZ[0], targetZ[1], targetZ[2]) || 1;
  const tx = targetZ[0] / zl, ty = targetZ[1] / zl, tz = targetZ[2] / zl;
  // Project seed x onto plane perpendicular to targetZ
  let ux = R[0], uy = R[3], uz = R[6];
  const dx = ux * tx + uy * ty + uz * tz;
  ux -= dx * tx; uy -= dx * ty; uz -= dx * tz;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-6) return basisFromZ(targetZ, out);
  ux /= ul; uy /= ul; uz /= ul;
  const vx = ty * uz - tz * uy;
  const vy = tz * ux - tx * uz;
  const vz = tx * uy - ty * ux;
  out[0] = ux; out[1] = vx; out[2] = tx;
  out[3] = uy; out[4] = vy; out[5] = ty;
  out[6] = uz; out[7] = vz; out[8] = tz;
  return out;
}

/** Normalise input control points (`number[][]` or flat `Float32Array`/`Float64Array`) to `number[][]`. */
function normalizeControlPoints(controlPoints) {
  if (!controlPoints) throw new TypeError('kin/chain: controlPoints is required');
  if (ArrayBuffer.isView(controlPoints)) {
    const n = Math.floor(controlPoints.length / 3);
    if (n < 2) throw new RangeError('kin/chain: controlPoints must contain at least 2 points');
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      pts[i] = [controlPoints[i * 3], controlPoints[i * 3 + 1], controlPoints[i * 3 + 2]];
    }
    return pts;
  }
  if (!Array.isArray(controlPoints) || controlPoints.length < 2) {
    throw new RangeError('kin/chain: controlPoints must contain at least 2 points');
  }
  return controlPoints.map(p => [Number(p[0]), Number(p[1]), Number(p[2])]);
}

/**
 * Deterministically generate tail control points extending from `startOrigin` along `startTangent`.
 * Places one control point every `stepNt` nucleotides (default 20 nt = 56.2 A), turning at most
 * `maxTurnDeg` (default 35 deg) from the previous segment tangent using `mulberry32(seed ^ hash(chainId))`.
 *
 * @param {number[]} startOrigin - Starting point `[x, y, z]`.
 * @param {number[]} startTangent - Initial direction vector `[dx, dy, dz]`.
 * @param {number} ntCount - Target tail length in nucleotides.
 * @param {{ seed?: number, chainId?: string, stepNt?: number, maxTurnDeg?: number, rise?: number }} [opts]
 * @returns {number[][]} Control points starting with `startOrigin`.
 */
export function generateTailControlPoints(startOrigin, startTangent, ntCount, opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const chainId = opts.chainId ?? 'chain';
  const stepNt = Math.max(1, opts.stepNt ?? 20);
  const rise = opts.rise ?? DEFAULT_RISE;
  const maxTurnRad = Math.max(0, Math.min(180, opts.maxTurnDeg ?? 35)) * DEG;
  const cosMax = Math.cos(maxTurnRad);
  const stepLen = stepNt * rise;
  const segCount = Math.max(1, Math.ceil(Math.max(1, ntCount) / stepNt));

  const rng = mulberry32((seed ^ hashString(chainId)) >>> 0);
  const pts = [[Number(startOrigin[0]), Number(startOrigin[1]), Number(startOrigin[2])]];

  const tl = Math.hypot(startTangent[0], startTangent[1], startTangent[2]) || 1;
  let tx = startTangent[0] / tl, ty = startTangent[1] / tl, tz = startTangent[2] / tl;
  const basis = new Array(9);

  for (let i = 0; i < segCount; i++) {
    basisFromZ([tx, ty, tz], basis);
    const azimuth = rng() * Math.PI * 2;
    const cosTheta = cosMax + rng() * (1 - cosMax);
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const lx = sinTheta * Math.cos(azimuth);
    const ly = sinTheta * Math.sin(azimuth);
    const lz = cosTheta;
    const nx = basis[0] * lx + basis[1] * ly + basis[2] * lz;
    const ny = basis[3] * lx + basis[4] * ly + basis[5] * lz;
    const nz = basis[6] * lx + basis[7] * ly + basis[8] * lz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    tx = nx / nl; ty = ny / nl; tz = nz / nl;
    const prev = pts[pts.length - 1];
    pts.push([prev[0] + tx * stepLen, prev[1] + ty * stepLen, prev[2] + tz * stepLen]);
  }
  return pts;
}

/** Fill a reusable cumulative arc-length table for `points` into `cum` (`samples + 1` entries). */
function fillArcTable(points, samples, cum, pA, pB) {
  cum[0] = 0;
  sampleCatmullRom(points, 0, pA);
  for (let i = 1; i <= samples; i++) {
    sampleCatmullRom(points, i / samples, pB);
    cum[i] = cum[i - 1] + Math.hypot(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]);
    pA[0] = pB[0]; pA[1] = pB[1]; pA[2] = pB[2];
  }
  return cum[samples];
}

/** Map arc length `s` to spline parameter `u` via binary search over `cum`. */
function uAtArc(cum, samples, length, s) {
  if (!(s > 0) || !(length > EPS)) return 0;
  if (s >= length) return 1;
  let lo = 0, hi = samples;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  return (lo + (seg > 0 ? (s - cum[lo]) / seg : 0)) / samples;
}

/** Unit spline tangent at parameter `u` using central / second-order one-sided differences. */
function tangentAtU(points, samples, u, out, pA, pB, pC) {
  const h = 0.5 / samples;
  let x, y, z;
  if (u - h < 0 || u + h > 1) {
    const d = u - h < 0 ? 1 : -1;
    sampleCatmullRom(points, u, pA);
    sampleCatmullRom(points, u + d * h, pB);
    sampleCatmullRom(points, u + 2 * d * h, pC);
    x = d * (-3 * pA[0] + 4 * pB[0] - pC[0]);
    y = d * (-3 * pA[1] + 4 * pB[1] - pC[1]);
    z = d * (-3 * pA[2] + 4 * pB[2] - pC[2]);
  } else {
    sampleCatmullRom(points, u - h, pA);
    sampleCatmullRom(points, u + h, pB);
    x = pB[0] - pA[0];
    y = pB[1] - pA[1];
    z = pB[2] - pA[2];
  }
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/** Right-multiply rotation `R` by `Rx(rx) * Ry(ry) * Rz(rz)` into `out` (aliasing-safe). */
function applyLocalEuler(R, rx, ry, rz, out) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // E = Rx * Ry * Rz
  const e00 = cy * cz;
  const e01 = -cy * sz;
  const e02 = sy;
  const e10 = cx * sz + sx * sy * cz;
  const e11 = cx * cz - sx * sy * sz;
  const e12 = -sx * cy;
  const e20 = sx * sz - cx * sy * cz;
  const e21 = sx * cz + cx * sy * sz;
  const e22 = cx * cy;

  const r0 = R[0], r1 = R[1], r2 = R[2];
  const r3 = R[3], r4 = R[4], r5 = R[5];
  const r6 = R[6], r7 = R[7], r8 = R[8];
  out[0] = r0 * e00 + r1 * e10 + r2 * e20;
  out[1] = r0 * e01 + r1 * e11 + r2 * e21;
  out[2] = r0 * e02 + r1 * e12 + r2 * e22;
  out[3] = r3 * e00 + r4 * e10 + r5 * e20;
  out[4] = r3 * e01 + r4 * e11 + r5 * e21;
  out[5] = r3 * e02 + r4 * e12 + r5 * e22;
  out[6] = r6 * e00 + r7 * e10 + r8 * e20;
  out[7] = r6 * e01 + r7 * e11 + r8 * e21;
  out[8] = r6 * e02 + r7 * e12 + r8 * e22;
  return out;
}

/**
 * Build a reusable free-chain spline descriptor from 3D control points.
 *
 * Contract (PLAN.md §8.3, §10 R3-K2):
 * - Uses centripetal Catmull-Rom splines (`alpha = 0.5`) and a 512-sample arc-length table.
 * - Supports deterministic gentle thermal-style undulation (`6 A * sin(2 pi (t / 7 + phi_k))`)
 *   smoothly damped to 0 within `anchorDampRadius` (default 30 A) of any anchored point.
 *
 * @param {number[][] | Float32Array} controlPoints - At least 2 `[x, y, z]` control points.
 * @param {{
 *   seed?: number,
 *   chainId?: string,
 *   anchorEnds?: boolean,
 *   anchorStart?: boolean,
 *   anchorEnd?: boolean,
 *   anchorIndices?: number[],
 *   anchorDistances?: number[],
 *   anchorDampRadius?: number,
 *   swayAmplitude?: number,
 *   swayPeriod?: number,
 *   seedFrame?: { o: number[], R: number[] } | null,
 *   samples?: number,
 *   rise?: number,
 *   twistDeg?: number,
 *   tailLength?: number,
 *   extendTo?: number,
 * }} [opts] - Chain build options.
 * @returns {object} Precomputed free-chain descriptor.
 */
export function buildFreeChain(controlPoints, opts = {}) {
  let restPoints = normalizeControlPoints(controlPoints);
  const seed = (opts.seed ?? 1) >>> 0;
  const chainId = opts.chainId ?? 'chain';
  const rise = opts.rise ?? DEFAULT_RISE;
  const twistRad = (opts.twistDeg ?? DEFAULT_TWIST_DEG) * DEG;
  const samples = Math.max(16, Math.floor(opts.samples ?? DEFAULT_SAMPLES));
  const swayAmplitude = opts.swayAmplitude ?? DEFAULT_SWAY_AMP;
  const swayPeriod = opts.swayPeriod ?? DEFAULT_SWAY_PERIOD;
  const anchorDampRadius = Math.max(0, opts.anchorDampRadius ?? DEFAULT_DAMP_RADIUS);

  // Optional deterministic tail extension when tailLength or extendTo is requested
  const targetExtendNt = opts.tailLength > 0 ? opts.tailLength : 0;
  if (targetExtendNt > 0 || opts.extendTo > 0) {
    let curLen = 0;
    for (let i = 1; i < restPoints.length; i++) {
      const a = restPoints[i - 1], b = restPoints[i];
      curLen += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const needNt = targetExtendNt > 0
      ? targetExtendNt
      : Math.max(0, Math.ceil((opts.extendTo * rise - curLen) / rise));
    if (needNt > 0) {
      const last = restPoints[restPoints.length - 1];
      const prev = restPoints[restPoints.length - 2];
      const tan = [last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]];
      const extra = generateTailControlPoints(last, tan, needNt, {
        seed,
        chainId: `${chainId}:tail`,
        rise,
      });
      restPoints = restPoints.concat(extra.slice(1));
    }
  }

  const nCtrl = restPoints.length;
  const cum = new Float64Array(samples + 1);
  const pA = [0, 0, 0], pB = [0, 0, 0], pC = [0, 0, 0];
  const restLength = fillArcTable(restPoints, samples, cum, pA, pB);

  // Exact rest arc length of each control point (uniform parameter u = i / (nCtrl - 1))
  const ctrlArc = new Float64Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) {
    const u = i / (nCtrl - 1);
    const scaled = u * samples;
    const lo = Math.min(Math.floor(scaled), samples - 1);
    const frac = scaled - lo;
    ctrlArc[i] = cum[lo] + (cum[lo + 1] - cum[lo]) * frac;
  }

  // Collect anchored arc-length positions along the rest curve
  const hasExplicitAnchors = (
    opts.anchorStart !== undefined ||
    opts.anchorEnd !== undefined ||
    (Array.isArray(opts.anchorIndices) && opts.anchorIndices.length > 0) ||
    (Array.isArray(opts.anchorDistances) && opts.anchorDistances.length > 0)
  );
  const anchorEnds = opts.anchorEnds !== undefined ? Boolean(opts.anchorEnds) : !hasExplicitAnchors;
  const anchorStart = opts.anchorStart !== undefined ? Boolean(opts.anchorStart) : anchorEnds;
  const anchorEnd = opts.anchorEnd !== undefined ? Boolean(opts.anchorEnd) : anchorEnds;

  const anchorSet = [];
  if (anchorStart) anchorSet.push(0);
  if (anchorEnd) anchorSet.push(restLength);
  if (Array.isArray(opts.anchorIndices)) {
    for (const idx of opts.anchorIndices) {
      if (idx >= 0 && idx < nCtrl) anchorSet.push(ctrlArc[idx]);
    }
  }
  if (Array.isArray(opts.anchorDistances)) {
    for (const d of opts.anchorDistances) {
      if (Number.isFinite(d)) anchorSet.push(d);
    }
  }

  // Precompute damping factor in [0, 1] per control point
  const damp = new Float64Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) {
    if (anchorSet.length === 0) {
      damp[i] = 1;
      continue;
    }
    let minD = Infinity;
    const s = ctrlArc[i];
    for (let j = 0; j < anchorSet.length; j++) {
      const ad = Math.abs(s - anchorSet[j]);
      if (ad < minD) minD = ad;
    }
    if (anchorDampRadius <= EPS) {
      damp[i] = minD <= EPS ? 0 : 1;
    } else {
      damp[i] = smoothstep01(minD / anchorDampRadius);
    }
  }

  // Rest RMF normals at control points for thermal-style undulation
  const startTan = tangentAtU(restPoints, samples, 0, [0, 0, 0], pA, pB, pC);
  const seedR = opts.seedFrame
    ? alignMatrixZ(quatToMat(matToQuat(opts.seedFrame.R)), startTan)
    : basisFromZ(startTan);
  const restCtrlFrames = rotationMinimizingFrames(restPoints, { o: restPoints[0].slice(), R: seedR.slice() });
  const swayNormals = restCtrlFrames.map(f => [f.R[0], f.R[3], f.R[6]]);

  // Deterministic phase per control point
  const rng = mulberry32((seed ^ hashString(chainId) ^ 0x9e3779b9) >>> 0);
  const phases = new Float64Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) phases[i] = rng();

  // Reusable scratch state so repeated poseFreeChain calls avoid GC churn
  const workPoints = restPoints.map(p => [p[0], p[1], p[2]]);

  return {
    controlPoints: restPoints.map(p => p.slice()),
    restLength,
    samples,
    rise,
    twistRad,
    seed,
    chainId,
    anchorEnds,
    anchorDampRadius,
    swayAmplitude,
    swayPeriod,
    seedFrame: opts.seedFrame ? { o: opts.seedFrame.o.slice(), R: quatToMat(matToQuat(opts.seedFrame.R)) } : null,
    _ctrlArc: ctrlArc,
    _damp: damp,
    _phases: phases,
    _swayNormals: swayNormals,
    _workPoints: workPoints,
    _cum: new Float64Array(samples + 1),
    _pA: [0, 0, 0],
    _pB: [0, 0, 0],
    _pC: [0, 0, 0],
    _endPt: [0, 0, 0],
    _endTan: [0, 0, 0],
    _startTan: [0, 0, 0],
    _seedR: seedR,
    _samplePts: [],
    _ax: new Float64Array(0),
    _ay: new Float64Array(0),
    _az: new Float64Array(0),
    _rotTmp: new Array(9),
    _rotA: new Array(9),
    _rotB: new Array(9),
    _outFrame: { o: [0, 0, 0], R: new Array(9) },
  };
}

/**
 * Evaluate the chain's deformed centerline and arc-length table at story time `t`.
 * Updates `chain._workPoints` and `chain._cum` in place and returns the current arc length.
 */
function updateDeformedSpline(chain, t) {
  const rest = chain.controlPoints;
  const work = chain._workPoints;
  const damp = chain._damp;
  const phases = chain._phases;
  const normals = chain._swayNormals;
  const amp = chain.swayAmplitude;
  const period = chain.swayPeriod;
  const time = Number.isFinite(t) ? t : 0;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < rest.length; i++) {
    const p = rest[i], w = work[i];
    if (amp === 0 || damp[i] === 0 || !(period > 0)) {
      w[0] = p[0]; w[1] = p[1]; w[2] = p[2];
    } else {
      const disp = amp * damp[i] * Math.sin(twoPi * (time / period + phases[i]));
      const n = normals[i];
      w[0] = p[0] + n[0] * disp;
      w[1] = p[1] + n[1] * disp;
      w[2] = p[2] + n[2] * disp;
    }
  }
  return fillArcTable(work, chain.samples, chain._cum, chain._pA, chain._pB);
}

/**
 * Sample a point `[x, y, z]` and unit tangent along a free chain at arc length `s` and time `t`.
 * Useful for downstream modules attaching structures or querying spline endpoints.
 *
 * @param {object} chain - Free-chain descriptor built by `buildFreeChain`.
 * @param {number} s - Arc length in angstroms (`>= 0`; linearly extrapolated past `length`).
 * @param {number} [t=0] - Story time in seconds.
 * @returns {{ point: number[], tangent: number[], length: number }}
 */
export function sampleFreeChainAt(chain, s, t = 0) {
  const len = updateDeformedSpline(chain, t);
  const work = chain._workPoints;
  const pt = [0, 0, 0];
  const tan = [0, 0, 0];
  if (s <= len) {
    const u = uAtArc(chain._cum, chain.samples, len, Math.max(0, s));
    sampleCatmullRom(work, u, pt);
    tangentAtU(work, chain.samples, u, tan, chain._pA, chain._pB, chain._pC);
  } else {
    sampleCatmullRom(work, 1, pt);
    tangentAtU(work, chain.samples, 1, tan, chain._pA, chain._pB, chain._pC);
    const ex = s - len;
    pt[0] += tan[0] * ex;
    pt[1] += tan[1] * ex;
    pt[2] += tan[2] * ex;
  }
  return { point: pt, tangent: tan, length: len };
}

/**
 * Pose `count` A-form single-strand nucleotides (rise 2.81 A, twist 32.73 deg,
 * rotation-minimising frames with bounded local backbone closure) along `chain` at story time `t`.
 *
 * @param {object} chain - Free-chain descriptor built by `buildFreeChain`.
 * @param {number} count - Number of nucleotides to pose (`>= 0`).
 * @param {number} t - Story time in seconds (drives deterministic gentle motion).
 * @param {Float32Array} [outFrames] - Preallocated output frame buffer (16 floats per nucleotide).
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseFreeChain(chain, count, t, outFrames) {
  if (!chain || !Array.isArray(chain.controlPoints)) {
    throw new TypeError('kin/chain: invalid chain descriptor');
  }
  const n = Math.max(0, Math.floor(count));
  const out = outFrames ?? new Float32Array(n * 16);
  if (out.length < n * 16) {
    throw new RangeError(`kin/chain: outFrames length ${out.length} < required ${n * 16}`);
  }
  if (n === 0) return out;

  const length = updateDeformedSpline(chain, t);
  const work = chain._workPoints;
  const cum = chain._cum;
  const samples = chain.samples;
  const rise = chain.rise;
  const twist = chain.twistRad;

  const startTan = tangentAtU(work, samples, 0, chain._startTan, chain._pA, chain._pB, chain._pC);
  const endPt = sampleCatmullRom(work, 1, chain._endPt);
  const endTan = tangentAtU(work, samples, 1, chain._endTan, chain._pA, chain._pB, chain._pC);

  // Sample `n` nucleotide origins at exact arc lengths `k * rise`
  const samplePts = chain._samplePts;
  while (samplePts.length < n) samplePts.push([0, 0, 0]);
  samplePts.length = n;

  for (let k = 0; k < n; k++) {
    const s = k * rise;
    const dst = samplePts[k];
    if (s <= length) {
      const u = uAtArc(cum, samples, length, s);
      sampleCatmullRom(work, u, dst);
    } else {
      const ex = s - length;
      dst[0] = endPt[0] + endTan[0] * ex;
      dst[1] = endPt[1] + endTan[1] * ex;
      dst[2] = endPt[2] + endTan[2] * ex;
    }
  }

  // Align seed frame to current start tangent and transport along sampled points via double-reflection RMF
  const seedR = alignMatrixZ(chain._seedR, startTan, chain._rotTmp);
  const rmf = rotationMinimizingFrames(samplePts, { o: samplePts[0], R: seedR });

  // Apply cumulative A-form helical twist about local z
  for (let k = 0; k < n; k++) {
    applyLocalEuler(rmf[k].R, 0, 0, k * twist, rmf[k].R);
  }

  // Bounded Gauss-Seidel local orientation relaxation so consecutive O3'(k)-P(k+1) bonds stay <= 1.9 A
  // even on sharp 35-degree spline bends while preserving exact spline origins and axial rise 2.81 +/- 0.05 A.
  if (n >= 2) {
    if (chain._ax.length < n) {
      chain._ax = new Float64Array(n);
      chain._ay = new Float64Array(n);
      chain._az = new Float64Array(n);
    }
    const ax = chain._ax, ay = chain._ay, az = chain._az;
    ax.fill(0, 0, n); ay.fill(0, 0, n); az.fill(0, 0, n);
    const RA = chain._rotA, RB = chain._rotB;
    const o3x = O3_LOCAL[0], o3y = O3_LOCAL[1], o3z = O3_LOCAL[2];
    const px = P_LOCAL[0], py = P_LOCAL[1], pz = P_LOCAL[2];

    for (let pass = 0; pass < 6; pass++) {
      let maxErr = 0;
      for (let k = 0; k < n - 1; k++) {
        const fA = rmf[k], fB = rmf[k + 1];
        applyLocalEuler(fA.R, ax[k], ay[k], az[k], RA);
        applyLocalEuler(fB.R, ax[k + 1], ay[k + 1], az[k + 1], RB);

        const a0 = RA[0] * o3x + RA[1] * o3y + RA[2] * o3z + fA.o[0];
        const a1 = RA[3] * o3x + RA[4] * o3y + RA[5] * o3z + fA.o[1];
        const a2 = RA[6] * o3x + RA[7] * o3y + RA[8] * o3z + fA.o[2];

        const b0 = RB[0] * px + RB[1] * py + RB[2] * pz + fB.o[0];
        const b1 = RB[3] * px + RB[4] * py + RB[5] * pz + fB.o[1];
        const b2 = RB[6] * px + RB[7] * py + RB[8] * pz + fB.o[2];

        const dx = b0 - a0, dy = b1 - a1, dz = b2 - a2;
        const d = Math.hypot(dx, dy, dz);
        const err = d - IDEAL_O3P;
        const aerr = Math.abs(err);
        if (aerr > maxErr) maxErr = aerr;
        if (aerr < 0.005) continue;

        const invd = 1 / (d || 1);
        const nx = dx * invd, ny = dy * invd, nz = dz * invd;

        const gAx = -(nx * (RA[1] * -o3z + RA[2] * o3y) + ny * (RA[4] * -o3z + RA[5] * o3y) + nz * (RA[7] * -o3z + RA[8] * o3y));
        const gBx =  (nx * (RB[1] * -pz  + RB[2] * py)  + ny * (RB[4] * -pz  + RB[5] * py)  + nz * (RB[7] * -pz  + RB[8] * py));
        const gAy = -(nx * (RA[0] * o3z  - RA[2] * o3x) + ny * (RA[3] * o3z  - RA[5] * o3x) + nz * (RA[6] * o3z  - RA[8] * o3x));
        const gBy =  (nx * (RB[0] * pz   - RB[2] * px)  + ny * (RB[3] * pz   - RB[5] * px)  + nz * (RB[6] * pz   - RB[8] * px));
        const gAz = -(nx * (RA[0] * -o3y + RA[1] * o3x) + ny * (RA[3] * -o3y + RA[4] * o3x) + nz * (RA[6] * -o3y + RA[7] * o3x));
        const gBz =  (nx * (RB[0] * -py  + RB[1] * px)  + ny * (RB[3] * -py  + RB[4] * px)  + nz * (RB[6] * -py  + RB[7] * px));

        const denom = gAx * gAx + gBx * gBx + gAy * gAy + gBy * gBy + gAz * gAz + gBz * gBz + 1e-6;
        const step = (-0.8 * err) / denom;

        ax[k] += step * gAx; ay[k] += step * gAy; az[k] += step * gAz;
        ax[k + 1] += step * gBx; ay[k + 1] += step * gBy; az[k + 1] += step * gBz;

        for (let idx = k; idx <= k + 1; idx++) {
          const rxy = Math.hypot(ax[idx], ay[idx]);
          if (rxy > MAX_TILT_XY) {
            const sc = MAX_TILT_XY / rxy;
            ax[idx] *= sc; ay[idx] *= sc;
          }
          if (az[idx] > MAX_TILT_Z) az[idx] = MAX_TILT_Z;
          else if (az[idx] < -MAX_TILT_Z) az[idx] = -MAX_TILT_Z;
        }
      }
      if (maxErr < 0.01) break;
    }

    for (let k = 0; k < n; k++) {
      if (ax[k] !== 0 || ay[k] !== 0 || az[k] !== 0) {
        applyLocalEuler(rmf[k].R, ax[k], ay[k], az[k], rmf[k].R);
      }
    }
  }

  for (let k = 0; k < n; k++) {
    writeFrame16(out, k, rmf[k]);
  }
  return out;
}
