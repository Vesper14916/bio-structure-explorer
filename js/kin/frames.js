/**
 * @module kin/frames
 * Rigid-frame math, quaternion interpolation, splines and arc-length primitives
 * (PLAN.md §8.3, docs/tasks/R3-ST3-design.md §3.1-§3.3, task R3-K1).
 *
 * A frame is `{ o: [x, y, z], R: [9] }` with a row-major rotation whose columns are the frame axes
 * (docs/CONTRACTS.md §1). Quaternions are `[x, y, z, w]`. Every function is pure; functions that take an
 * optional `out` write into it (aliasing the inputs is safe) and return it, so hot paths can avoid allocation.
 */
import { HELIX_B } from '../science/templates.js';

const DEG = Math.PI / 180;
const EPS = 1e-12;

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

/** @returns {{ o: number[], R: number[] }} A fresh identity frame. */
export function identityFrame() {
  return newFrame();
}

/**
 * Convert a row-major 3x3 rotation matrix to a unit quaternion `[x, y, z, w]` with `w >= 0`.
 * Uses Shepperd's method (largest of trace / diagonal as pivot), so 180 degree rotations are exact.
 *
 * @param {number[] | Float32Array} R - 9-element row-major rotation matrix.
 * @param {number[]} [out] - Optional 4-element result array.
 * @returns {number[]} Unit quaternion `[x, y, z, w]`.
 */
export function matToQuat(R, out = [0, 0, 0, 0]) {
  const m00 = R[0], m01 = R[1], m02 = R[2];
  const m10 = R[3], m11 = R[4], m12 = R[5];
  const m20 = R[6], m21 = R[7], m22 = R[8];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr >= m00 && tr >= m11 && tr >= m22) {
    const s = 2 * Math.sqrt(Math.max(1 + tr, EPS));
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 >= m11 && m00 >= m22) {
    const s = 2 * Math.sqrt(Math.max(1 + m00 - m11 - m22, EPS));
    x = 0.25 * s; w = (m21 - m12) / s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 >= m22) {
    const s = 2 * Math.sqrt(Math.max(1 + m11 - m00 - m22, EPS));
    y = 0.25 * s; w = (m02 - m20) / s; x = (m01 + m10) / s; z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(Math.max(1 + m22 - m00 - m11, EPS));
    z = 0.25 * s; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s;
  }
  const n = 1 / Math.hypot(x, y, z, w);
  const sg = w < 0 ? -n : n;
  out[0] = x * sg; out[1] = y * sg; out[2] = z * sg; out[3] = w * sg;
  return out;
}

/**
 * Convert a quaternion `[x, y, z, w]` to a row-major 3x3 rotation matrix (the input is normalised first).
 *
 * @param {number[] | Float32Array} q - Quaternion `[x, y, z, w]`.
 * @param {number[]} [out] - Optional 9-element result array.
 * @returns {number[]} 9-element row-major rotation matrix.
 */
export function quatToMat(q, out = new Array(9)) {
  const n = 1 / Math.hypot(q[0], q[1], q[2], q[3]);
  const x = q[0] * n, y = q[1] * n, z = q[2] * n, w = q[3] * n;
  out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y - w * z); out[2] = 2 * (x * z + w * y);
  out[3] = 2 * (x * y + w * z); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z - w * x);
  out[6] = 2 * (x * z - w * y); out[7] = 2 * (y * z + w * x); out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

/**
 * Shortest-arc spherical interpolation of two unit quaternions `[x, y, z, w]`.
 * If `a . b < 0` the end point is negated first; nearly parallel pairs fall back to a normalised lerp.
 *
 * @param {number[]} a - Start quaternion.
 * @param {number[]} b - End quaternion.
 * @param {number} t - Parameter in `[0, 1]`.
 * @param {number[]} [out] - Optional 4-element result array (may alias `a` or `b`).
 * @returns {number[]} Unit quaternion.
 */
export function slerpQuat(a, b, t, out = [0, 0, 0, 0]) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka, kb;
  if (d > 0.9995) {
    ka = 1 - t; kb = t;
  } else {
    const th = Math.acos(d), s = Math.sin(th);
    ka = Math.sin((1 - t) * th) / s; kb = Math.sin(t * th) / s;
  }
  const x = ka * a[0] + kb * bx, y = ka * a[1] + kb * by, z = ka * a[2] + kb * bz, w = ka * a[3] + kb * bw;
  const n = 1 / Math.hypot(x, y, z, w);
  out[0] = x * n; out[1] = y * n; out[2] = z * n; out[3] = w * n;
  return out;
}

/**
 * Interpolate between two rigid frames at `t`: origin linearly, rotation by shortest-arc quaternion slerp.
 * The returned rotation is exactly orthonormal. `t = 0` and `t = 1` return the endpoints (re-orthonormalised).
 *
 * @param {{ o: number[], R: number[] }} a - Start frame.
 * @param {{ o: number[], R: number[] }} b - End frame.
 * @param {number} t - Blend factor in `[0, 1]`.
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame (may alias `a` or `b`).
 * @returns {{ o: number[], R: number[] }} Interpolated frame.
 */
export function slerpFrame(a, b, t, out = newFrame()) {
  const q = slerpQuat(matToQuat(a.R), matToQuat(b.R), t);
  const o0 = a.o[0] + (b.o[0] - a.o[0]) * t;
  const o1 = a.o[1] + (b.o[1] - a.o[1]) * t;
  const o2 = a.o[2] + (b.o[2] - a.o[2]) * t;
  quatToMat(q, out.R);
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

/**
 * Compose two rigid frames, `a . b` (apply `b` first, then `a`; right-multiplied per PLAN.md §8.3).
 *
 * @param {{ o: number[], R: number[] }} a - Left (parent) frame.
 * @param {{ o: number[], R: number[] }} b - Right (local) frame.
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame (may alias `a` or `b`).
 * @returns {{ o: number[], R: number[] }} Composed frame.
 */
export function composeFrame(a, b, out = newFrame()) {
  const A = a.R, B = b.R, bo = b.o;
  const o0 = A[0] * bo[0] + A[1] * bo[1] + A[2] * bo[2] + a.o[0];
  const o1 = A[3] * bo[0] + A[4] * bo[1] + A[5] * bo[2] + a.o[1];
  const o2 = A[6] * bo[0] + A[7] * bo[1] + A[8] * bo[2] + a.o[2];
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  }
  for (let k = 0; k < 9; k++) out.R[k] = r[k];
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

/**
 * Invert a rigid frame.
 *
 * @param {{ o: number[], R: number[] }} f - Frame to invert.
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame (may alias `f`).
 * @returns {{ o: number[], R: number[] }} Inverse frame.
 */
export function invertFrame(f, out = newFrame()) {
  const R = f.R, o = f.o;
  const t0 = -(R[0] * o[0] + R[3] * o[1] + R[6] * o[2]);
  const t1 = -(R[1] * o[0] + R[4] * o[1] + R[7] * o[2]);
  const t2 = -(R[2] * o[0] + R[5] * o[1] + R[8] * o[2]);
  const r = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  for (let k = 0; k < 9; k++) out.R[k] = r[k];
  out.o[0] = t0; out.o[1] = t1; out.o[2] = t2;
  return out;
}

/**
 * Canonical B-DNA screw step `S(x)` (PLAN.md §8.3): translation `3.38 * x` A along local z composed with a
 * rotation of `34.2857142857 * x` degrees about local z. Equal to `helixFrame(x, 3.38, 34.2857142857)`.
 * `S(a) . S(b) = S(a + b)`.
 *
 * @param {number} x - Number of base-pair steps (fractional or negative allowed).
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Screw-step frame.
 */
export function screwStep(x, out = newFrame()) {
  const th = x * HELIX_B.twistDeg * DEG, c = Math.cos(th), s = Math.sin(th);
  const R = out.R;
  R[0] = c; R[1] = -s; R[2] = 0; R[3] = s; R[4] = c; R[5] = 0; R[6] = 0; R[7] = 0; R[8] = 1;
  out.o[0] = 0; out.o[1] = 0; out.o[2] = HELIX_B.rise * x;
  return out;
}

/**
 * Rotation-minimising frames along sampled curve points by the double-reflection method
 * (Wang, Juttler, Zheng, Yu 2008; PLAN.md §8.3). The whole seed rotation (all three axes) is transported;
 * if the seed's tangent axis is parallel to the curve tangent at `points[0]` it stays so along the curve.
 * Tangents are estimated by central differences (second-order one-sided at the ends). Frame `i` has origin `points[i]`.
 *
 * @param {number[][]} points - Ordered curve points `[x, y, z]` (at least 1).
 * @param {{ o: number[], R: number[] }} seedFrame - Frame at `points[0]` (its origin is replaced by `points[0]`).
 * @returns {Array<{ o: number[], R: number[] }>} One orthonormal frame per point.
 */
export function rotationMinimizingFrames(points, seedFrame) {
  const n = points.length;
  const tan = new Array(n);
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  for (let i = 0; i < n; i++) {
    let p, q, c;
    if (n >= 3 && i === 0) { p = points[0]; q = points[1]; c = points[2]; tan[i] = unit(-3 * p[0] + 4 * q[0] - c[0], -3 * p[1] + 4 * q[1] - c[1], -3 * p[2] + 4 * q[2] - c[2]); continue; }
    if (n >= 3 && i === n - 1) { p = points[n - 3]; q = points[n - 2]; c = points[n - 1]; tan[i] = unit(3 * c[0] - 4 * q[0] + p[0], 3 * c[1] - 4 * q[1] + p[1], 3 * c[2] - 4 * q[2] + p[2]); continue; }
    p = points[Math.max(i - 1, 0)]; q = points[Math.min(i + 1, n - 1)];
    tan[i] = unit(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  }
  const out = new Array(n);
  let R = quatToMat(matToQuat(seedFrame.R));
  out[0] = { o: points[0].slice(), R: R.slice() };
  for (let i = 0; i < n - 1; i++) {
    const v1 = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1], points[i + 1][2] - points[i][2]];
    const c1 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
    const cols = [0, 1, 2].map(k => [R[k], R[3 + k], R[6 + k]]);
    let tL = tan[i];
    if (c1 > EPS) {
      for (let k = 0; k < 3; k++) cols[k] = reflect(cols[k], v1, c1);
      tL = reflect(tL, v1, c1);
    }
    const v2 = [tan[i + 1][0] - tL[0], tan[i + 1][1] - tL[1], tan[i + 1][2] - tL[2]];
    const c2 = v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2];
    if (c2 > EPS) for (let k = 0; k < 3; k++) cols[k] = reflect(cols[k], v2, c2);
    R = [cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]];
    R = quatToMat(matToQuat(R));
    out[i + 1] = { o: points[i + 1].slice(), R: R.slice() };
  }
  return out;
}

function reflect(v, n, nn) {
  const k = 2 * (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / nn;
  return [v[0] - k * n[0], v[1] - k * n[1], v[2] - k * n[2]];
}

/**
 * Piecewise arc-length table for a parametric curve `sampleFn(u)`, `u` in `[0, 1]` (PLAN.md §8.3).
 * Inversion is a binary search over the cumulative chord lengths plus linear interpolation inside a segment.
 *
 * @param {(u: number) => number[]} sampleFn - Function returning `[x, y, z]`.
 * @param {number} [samples=512] - Number of uniform parameter segments.
 * @returns {{ length: number, samples: number, uAt: (s: number) => number,
 *   pointAt: (s: number, out?: number[]) => number[], tangentAt: (s: number, out?: number[]) => number[] }}
 *   `uAt(s)` maps arc length (clamped to `[0, length]`) to the parameter; `pointAt` and `tangentAt` (unit) use it.
 */
export function arcLengthTable(sampleFn, samples = 512) {
  const cum = new Float64Array(samples + 1);
  let prev = sampleFn(0);
  for (let i = 1; i <= samples; i++) {
    const p = sampleFn(i / samples);
    cum[i] = cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  const length = cum[samples];
  const uAt = s => {
    if (!(s > 0)) return 0;
    if (s >= length) return 1;
    let lo = 0, hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    return (lo + (seg > 0 ? (s - cum[lo]) / seg : 0)) / samples;
  };
  const pointAt = (s, out = [0, 0, 0]) => {
    const p = sampleFn(uAt(s));
    out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
    return out;
  };
  const tangentAt = (s, out = [0, 0, 0]) => {
    const u = uAt(s), h = 0.5 / samples;
    let x, y, z;
    if (u - h < 0 || u + h > 1) { // second-order one-sided difference at the curve ends
      const d = u - h < 0 ? 1 : -1;
      const a = sampleFn(u), b = sampleFn(u + d * h), c = sampleFn(u + 2 * d * h);
      x = d * (-3 * a[0] + 4 * b[0] - c[0]); y = d * (-3 * a[1] + 4 * b[1] - c[1]); z = d * (-3 * a[2] + 4 * b[2] - c[2]);
    } else {
      const a = sampleFn(u - h), b = sampleFn(u + h);
      x = b[0] - a[0]; y = b[1] - a[1]; z = b[2] - a[2];
    }
    const l = Math.hypot(x, y, z) || 1;
    out[0] = x / l; out[1] = y / l; out[2] = z / l;
    return out;
  };
  return { length, samples, uAt, pointAt, tangentAt };
}

/**
 * Evaluate a cubic Bezier curve at `u` in `[0, 1]`.
 *
 * @param {number[]} p0 - Start point.
 * @param {number[]} p1 - First control point.
 * @param {number[]} p2 - Second control point.
 * @param {number[]} p3 - End point.
 * @param {number} u - Curve parameter.
 * @param {number[]} [out] - Optional result array.
 * @returns {number[]} Point `[x, y, z]`.
 */
export function cubicBezier(p0, p1, p2, p3, u, out = [0, 0, 0]) {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  for (let k = 0; k < 3; k++) out[k] = a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k];
  return out;
}

/** Alias of {@link cubicBezier} under the W0 stub name. */
export const sampleCubicBezier = cubicBezier;

/**
 * Evaluate a centripetal (alpha = 0.5) Catmull-Rom spline through `points` at `u` in `[0, 1]`.
 * The parameter is uniform in control-point index: `u = i / (n - 1)` returns `points[i]` exactly. Phantom end
 * points are reflected (`2 p0 - p1`). Needs at least 2 points.
 *
 * @param {number[][]} points - Control points `[[x, y, z], ...]`.
 * @param {number} u - Spline parameter in `[0, 1]`.
 * @param {number[]} [out] - Optional result array.
 * @returns {number[]} Point `[x, y, z]`.
 */
export function sampleCatmullRom(points, u, out = [0, 0, 0]) {
  const n = points.length;
  const f = Math.min(Math.max(u, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2), lt = f - i;
  const p1 = points[i], p2 = points[i + 1];
  const p0 = i > 0 ? points[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1], 2 * p1[2] - p2[2]];
  const p3 = i + 2 < n ? points[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1], 2 * p2[2] - p1[2]];
  const kn = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), 1e-6);
  const t0 = 0, t1 = t0 + kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
  const t = t1 + (t2 - t1) * lt;
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - t) * p0[k] + (t - t0) * p1[k]) / (t1 - t0);
    const a2 = ((t2 - t) * p1[k] + (t - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - t) * p2[k] + (t - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
    const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
  }
  return out;
}

/**
 * Sample a centripetal Catmull-Rom spline through `points` at `samples` uniform parameters
 * (`u = k / (samples - 1)`). With `samples = (n - 1) * m + 1` every control point is returned exactly.
 *
 * @param {number[][]} points - Control points (at least 2).
 * @param {number} samples - Number of output points (at least 2).
 * @returns {number[][]} Sampled points.
 */
export function catmullRomCentripetal(points, samples) {
  const out = new Array(samples);
  for (let k = 0; k < samples; k++) out[k] = sampleCatmullRom(points, k / (samples - 1));
  return out;
}

/**
 * Write a frame into a column-major 4x4 `Float32Array`/array buffer (three.js `Matrix4.elements` order,
 * design §3.2): `[R00, R10, R20, 0, R01, R11, R21, 0, R02, R12, R22, 0, ox, oy, oz, 1]` at floats `16 i ...`.
 *
 * @param {Float32Array | number[]} buf - Destination buffer.
 * @param {number} i - Frame index.
 * @param {{ o: number[], R: number[] }} f - Frame to write.
 * @returns {Float32Array | number[]} `buf`.
 */
export function writeFrame16(buf, i, f) {
  const b = i * 16, R = f.R, o = f.o;
  buf[b] = R[0]; buf[b + 1] = R[3]; buf[b + 2] = R[6]; buf[b + 3] = 0;
  buf[b + 4] = R[1]; buf[b + 5] = R[4]; buf[b + 6] = R[7]; buf[b + 7] = 0;
  buf[b + 8] = R[2]; buf[b + 9] = R[5]; buf[b + 10] = R[8]; buf[b + 11] = 0;
  buf[b + 12] = o[0]; buf[b + 13] = o[1]; buf[b + 14] = o[2]; buf[b + 15] = 1;
  return buf;
}

/**
 * Read frame `i` from a buffer written by {@link writeFrame16}.
 *
 * @param {Float32Array | number[]} buf - Source buffer.
 * @param {number} i - Frame index.
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Frame.
 */
export function readFrame16(buf, i, out = newFrame()) {
  const b = i * 16, R = out.R;
  R[0] = buf[b]; R[3] = buf[b + 1]; R[6] = buf[b + 2];
  R[1] = buf[b + 4]; R[4] = buf[b + 5]; R[7] = buf[b + 6];
  R[2] = buf[b + 8]; R[5] = buf[b + 9]; R[8] = buf[b + 10];
  out.o[0] = buf[b + 12]; out.o[1] = buf[b + 13]; out.o[2] = buf[b + 14];
  return out;
}
