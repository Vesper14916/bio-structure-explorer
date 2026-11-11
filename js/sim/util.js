// Shared helpers for the Helix simulations: seeded PRNG, easing, rotation algebra that
// stays orthonormal by construction (quaternions / axis-angle), smooth noise fields.
// Pure logic: no DOM, no three.js. Frames are { o: [x,y,z], R: [9 row-major] } as in science/math.js.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Small fast seeded PRNG (mulberry32). Returns a function giving floats in [0, 1). */
export function mulberry32(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Hermite smoothstep of x already normalised to 0..1 (clamped). */
export const smoothstep = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
/** Ken Perlin's smootherstep (C2). */
export const smootherstep = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (x * 6 - 15) + 10); };
/** Smoothstep between edges a and b. */
export const ramp = (x, a, b) => smoothstep((x - a) / (b - a));

// ---------------------------------------------------------------- 3x3 matrices (row-major arrays)
export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function copyMat(out, A) { for (let i = 0; i < 9; i++) out[i] = A[i]; return out; }

/** out = A * B (out may alias A or B). */
export function mulMM(out, A, B) {
  const a0 = A[0], a1 = A[1], a2 = A[2], a3 = A[3], a4 = A[4], a5 = A[5], a6 = A[6], a7 = A[7], a8 = A[8];
  const b0 = B[0], b1 = B[1], b2 = B[2], b3 = B[3], b4 = B[4], b5 = B[5], b6 = B[6], b7 = B[7], b8 = B[8];
  out[0] = a0 * b0 + a1 * b3 + a2 * b6; out[1] = a0 * b1 + a1 * b4 + a2 * b7; out[2] = a0 * b2 + a1 * b5 + a2 * b8;
  out[3] = a3 * b0 + a4 * b3 + a5 * b6; out[4] = a3 * b1 + a4 * b4 + a5 * b7; out[5] = a3 * b2 + a4 * b5 + a5 * b8;
  out[6] = a6 * b0 + a7 * b3 + a8 * b6; out[7] = a6 * b1 + a7 * b4 + a8 * b7; out[8] = a6 * b2 + a7 * b5 + a8 * b8;
  return out;
}
/** out = R * v for a 3-vector (out may alias v). */
export function mulMV(out, R, v) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = R[0] * x + R[1] * y + R[2] * z;
  out[1] = R[3] * x + R[4] * y + R[5] * z;
  out[2] = R[6] * x + R[7] * y + R[8] * z;
  return out;
}
/** out = Rᵀ * v. */
export function mulMtV(out, R, v) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = R[0] * x + R[3] * y + R[6] * z;
  out[1] = R[1] * x + R[4] * y + R[7] * z;
  out[2] = R[2] * x + R[5] * y + R[8] * z;
  return out;
}
export function transpose(out, R) {
  const r1 = R[1], r2 = R[2], r5 = R[5];
  out[0] = R[0]; out[4] = R[4]; out[8] = R[8];
  out[1] = R[3]; out[3] = r1; out[2] = R[6]; out[6] = r2; out[5] = R[7]; out[7] = r5;
  return out;
}

/** Rotation about the unit axis (ax, ay, az) by `angle` radians (Rodrigues; exactly orthonormal). */
export function axisAngle(out, ax, ay, az, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  out[0] = t * ax * ax + c; out[1] = t * ax * ay - s * az; out[2] = t * ax * az + s * ay;
  out[3] = t * ax * ay + s * az; out[4] = t * ay * ay + c; out[5] = t * ay * az - s * ax;
  out[6] = t * ax * az - s * ay; out[7] = t * ay * az + s * ax; out[8] = t * az * az + c;
  return out;
}
export const rotZInto = (out, a) => { const c = Math.cos(a), s = Math.sin(a); out[0] = c; out[1] = -s; out[2] = 0; out[3] = s; out[4] = c; out[5] = 0; out[6] = 0; out[7] = 0; out[8] = 1; return out; };
export const rotXInto = (out, a) => { const c = Math.cos(a), s = Math.sin(a); out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = c; out[5] = -s; out[6] = 0; out[7] = s; out[8] = c; return out; };
export const rotYInto = (out, a) => { const c = Math.cos(a), s = Math.sin(a); out[0] = c; out[1] = 0; out[2] = s; out[3] = 0; out[4] = 1; out[5] = 0; out[6] = -s; out[7] = 0; out[8] = c; return out; };

/**
 * Rotation from a rotation vector (axis * angle), exact for any magnitude (exponential map).
 * Used for small thermal rotations.
 */
export function expMap(out, rx, ry, rz) {
  const a = Math.hypot(rx, ry, rz);
  if (a < 1e-12) return copyMat(out, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  return axisAngle(out, rx / a, ry / a, rz / a, a);
}

/** Gram-Schmidt re-orthonormalisation in place (rows of a rotation matrix are the axes). */
export function orthonormalize(R) {
  let x0 = R[0], x1 = R[3], x2 = R[6];             // column 0
  let l = Math.hypot(x0, x1, x2); x0 /= l; x1 /= l; x2 /= l;
  let y0 = R[1], y1 = R[4], y2 = R[7];
  const d = x0 * y0 + x1 * y1 + x2 * y2;
  y0 -= d * x0; y1 -= d * x1; y2 -= d * x2;
  l = Math.hypot(y0, y1, y2); y0 /= l; y1 /= l; y2 /= l;
  const z0 = x1 * y2 - x2 * y1, z1 = x2 * y0 - x0 * y2, z2 = x0 * y1 - x1 * y0;
  R[0] = x0; R[3] = x1; R[6] = x2; R[1] = y0; R[4] = y1; R[7] = y2; R[2] = z0; R[5] = z1; R[8] = z2;
  return R;
}

/** Largest |RᵀR − I| entry (orthonormality check). */
export function orthoError(R) {
  let e = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += R[k * 3 + i] * R[k * 3 + j];
    e = Math.max(e, Math.abs(s - (i === j ? 1 : 0)));
  }
  return e;
}

// ---------------------------------------------------------------- quaternions [w, x, y, z]
export function matToQuat(q, R) {
  const tr = R[0] + R[4] + R[8];
  let w, x, y, z;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (R[7] - R[5]) / s; y = (R[2] - R[6]) / s; z = (R[3] - R[1]) / s;
  } else if (R[0] > R[4] && R[0] > R[8]) {
    const s = Math.sqrt(1 + R[0] - R[4] - R[8]) * 2;
    w = (R[7] - R[5]) / s; x = 0.25 * s; y = (R[1] + R[3]) / s; z = (R[2] + R[6]) / s;
  } else if (R[4] > R[8]) {
    const s = Math.sqrt(1 + R[4] - R[0] - R[8]) * 2;
    w = (R[2] - R[6]) / s; x = (R[1] + R[3]) / s; y = 0.25 * s; z = (R[5] + R[7]) / s;
  } else {
    const s = Math.sqrt(1 + R[8] - R[0] - R[4]) * 2;
    w = (R[3] - R[1]) / s; x = (R[2] + R[6]) / s; y = (R[5] + R[7]) / s; z = 0.25 * s;
  }
  const l = Math.hypot(w, x, y, z);
  q[0] = w / l; q[1] = x / l; q[2] = y / l; q[3] = z / l;
  return q;
}
export function quatToMat(R, q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  const w = q[0] / l, x = q[1] / l, y = q[2] / l, z = q[3] / l;
  R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - w * z); R[2] = 2 * (x * z + w * y);
  R[3] = 2 * (x * y + w * z); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - w * x);
  R[6] = 2 * (x * z - w * y); R[7] = 2 * (y * z + w * x); R[8] = 1 - 2 * (x * x + y * y);
  return R;
}
/** Spherical linear interpolation of unit quaternions (shortest arc). */
export function slerpQuat(out, a, b, t) {
  let bw = b[0], bx = b[1], by = b[2], bz = b[3];
  let d = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
  if (d < 0) { d = -d; bw = -bw; bx = -bx; by = -by; bz = -bz; }
  let s0, s1;
  if (d > 0.9995) { s0 = 1 - t; s1 = t; }
  else { const th = Math.acos(d), sn = Math.sin(th); s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn; }
  out[0] = s0 * a[0] + s1 * bw; out[1] = s0 * a[1] + s1 * bx; out[2] = s0 * a[2] + s1 * by; out[3] = s0 * a[3] + s1 * bz;
  const l = Math.hypot(out[0], out[1], out[2], out[3]);
  out[0] /= l; out[1] /= l; out[2] /= l; out[3] /= l;
  return out;
}

const _qa = [1, 0, 0, 0], _qb = [1, 0, 0, 0], _qc = [1, 0, 0, 0];
/** Rotation matrix slerp: out = slerp(A, B, t); the result is exactly orthonormal. */
export function slerpMat(out, A, B, t) {
  matToQuat(_qa, A); matToQuat(_qb, B);
  slerpQuat(_qc, _qa, _qb, t);
  return quatToMat(out, _qc);
}
/** Frame blend: position lerp + rotation slerp. out may alias neither a nor b rotation arrays. */
export function blendFrames(out, a, b, t) {
  out.o[0] = a.o[0] + (b.o[0] - a.o[0]) * t;
  out.o[1] = a.o[1] + (b.o[1] - a.o[1]) * t;
  out.o[2] = a.o[2] + (b.o[2] - a.o[2]) * t;
  slerpMat(out.R, a.R, b.R, t);
  return out;
}

export const newFrame = () => ({ o: [0, 0, 0], R: identity() });
export function copyFrame(dst, src) {
  dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
  copyMat(dst.R, src.R);
  return dst;
}
export const cloneFrame = f => ({ o: f.o.slice(), R: f.R.slice() });

/** out = a ∘ b  (apply b first, then a), in place-safe through temporaries. */
export function composeInto(out, a, b) {
  const x = b.o[0], y = b.o[1], z = b.o[2], R = a.R;
  const ox = R[0] * x + R[1] * y + R[2] * z + a.o[0];
  const oy = R[3] * x + R[4] * y + R[5] * z + a.o[1];
  const oz = R[6] * x + R[7] * y + R[8] * z + a.o[2];
  mulMM(out.R, a.R, b.R);
  out.o[0] = ox; out.o[1] = oy; out.o[2] = oz;
  return out;
}
/** out = inverse of f. */
export function invertInto(out, f) {
  const x = f.o[0], y = f.o[1], z = f.o[2], R = f.R;
  const ox = -(R[0] * x + R[3] * y + R[6] * z);
  const oy = -(R[1] * x + R[4] * y + R[7] * z);
  const oz = -(R[2] * x + R[5] * y + R[8] * z);
  transpose(out.R, f.R);
  out.o[0] = ox; out.o[1] = oy; out.o[2] = oz;
  return out;
}

// ---------------------------------------------------------------- vectors
export const v3len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function v3normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// ---------------------------------------------------------------- critically damped smoothing
/**
 * Exact critically-damped spring step (as in SmoothDamp). `s` = {x, v}; moves x toward
 * `target` with natural frequency `omega` (1/s). Continuous in x and v, never NaN for dt >= 0.
 */
export function dampStep(s, target, omega, dt) {
  const e = Math.exp(-omega * dt);
  const dx = s.x - target, tmp = (s.v + omega * dx) * dt;
  s.x = target + (dx + tmp) * e;
  s.v = (s.v - omega * tmp) * e;
  return s.x;
}

// ---------------------------------------------------------------- smooth noise
/**
 * A bank of smooth, deterministic noise channels. Channel c, at "time" t and "space" u, is a sum of
 * `waves` travelling sinusoids  sum_m a_m sin(2π(f_m t + g_m u) + φ_m), with random frequency f_m in
 * [fMin, fMax] Hz, spatial frequency g_m in [-gMax, gMax] (cycles per unit u) and phase. The result is
 * bounded by `amp`, C-infinity in t and u and a pure function of (t, u): scrubbing-safe.
 */
export function createNoise(rng, channels, { fMin = 0.4, fMax = 1.4, gMax = 0, waves = 2, amp = 1 } = {}) {
  const f = new Float64Array(channels * waves), g = new Float64Array(channels * waves);
  const ph = new Float64Array(channels * waves), a = new Float64Array(channels * waves);
  for (let c = 0; c < channels; c++) {
    let sum = 0;
    for (let m = 0; m < waves; m++) {
      const i = c * waves + m;
      f[i] = fMin + (fMax - fMin) * rng();
      g[i] = (rng() * 2 - 1) * gMax;
      ph[i] = rng() * TAU;
      a[i] = 0.6 + 0.4 * rng();
      sum += a[i];
    }
    for (let m = 0; m < waves; m++) a[c * waves + m] *= amp / sum;
  }
  return {
    channels, waves,
    /** value of channel c at time t and position u, within ±amp */
    at(c, t, u = 0) {
      let s = 0;
      for (let m = 0, i = c * waves; m < waves; m++, i++) s += a[i] * Math.sin(TAU * (f[i] * t + g[i] * u) + ph[i]);
      return s;
    },
  };
}
