/**
 * @module kin/duplex
 * DNA duplex kinematics (PLAN.md §8.3, docs/CONTRACTS.md §7.4, docs/tasks/R3-ST3-design.md §3.1-§3.5, task R3-K1).
 *
 * The duplex is computed on **coding-oriented base-pair frames** `C`. For an RNAP template track `T_r` (whose +z
 * points 3'-ward along the template strand, i.e. upstream), `C_r = partnerFrame(T_r)`; template-strand frames are
 * always `partnerFrame(C)`. With this reading every formula of PLAN.md §8.3 holds as written: `C_{r+1} = C_r . S(1)`
 * downstream, `t0 = -z(C_{r0})` points upstream, and the upstream twist is -34.2857 degrees per base pair.
 *
 * Output layout (design §3.2): `outFrames` holds `2 N` column-major 4x4 matrices of 16 floats; frame `g` is the
 * coding nucleotide at gene index `g`, frame `N + g` the template nucleotide paired with it.
 *
 * Scratch (frames, the Bezier table, the track caches) is cached per construct object in a `WeakMap`, so after the
 * first call for a construct `poseDuplex` allocates nothing that it keeps and nothing per nucleotide.
 */
import { matToQuat, quatToMat, slerpQuat, screwStep, cubicBezier, writeFrame16 } from './frames.js';
import { codingFrameAt } from './track.js';
import { nucleotideTemplate } from '../science/assembly.js';
import { HELIX_B } from '../science/templates.js';

const DEG = Math.PI / 180;
const RISE = HELIX_B.rise;               // 3.38 A
const TWIST = HELIX_B.twistDeg * DEG;    // 34.2857 degrees per base pair, in radians
const ARM_STEPS = 40;                    // length of the curved upstream section in base pairs
const TABLE = 512;                       // arc-length table segments
const MID_BP = 124;                      // gene index at the world origin
/** World frame of the gene: local helix z -> world +x, y -> +y (design §3.1). */
const W = { o: [0, 0, 0], R: [0, 0, 1, 0, 1, 0, -1, 0, 0] };

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

/** `out = a . b`; `out` may alias `a` or `b`. */
function mul(a, b, out) {
  const A = a.R, B = b.R, bo = b.o, ao = a.o;
  const o0 = A[0] * bo[0] + A[1] * bo[1] + A[2] * bo[2] + ao[0];
  const o1 = A[3] * bo[0] + A[4] * bo[1] + A[5] * bo[2] + ao[1];
  const o2 = A[6] * bo[0] + A[7] * bo[1] + A[8] * bo[2] + ao[2];
  const a0 = A[0], a1 = A[1], a2 = A[2], a3 = A[3], a4 = A[4], a5 = A[5], a6 = A[6], a7 = A[7], a8 = A[8];
  const b0 = B[0], b1 = B[1], b2 = B[2], b3 = B[3], b4 = B[4], b5 = B[5], b6 = B[6], b7 = B[7], b8 = B[8];
  const R = out.R;
  R[0] = a0 * b0 + a1 * b3 + a2 * b6; R[1] = a0 * b1 + a1 * b4 + a2 * b7; R[2] = a0 * b2 + a1 * b5 + a2 * b8;
  R[3] = a3 * b0 + a4 * b3 + a5 * b6; R[4] = a3 * b1 + a4 * b4 + a5 * b7; R[5] = a3 * b2 + a4 * b5 + a5 * b8;
  R[6] = a6 * b0 + a7 * b3 + a8 * b6; R[7] = a6 * b1 + a7 * b4 + a8 * b7; R[8] = a6 * b2 + a7 * b5 + a8 * b8;
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

/** `out = inverse(a) . b`; `out` may alias `a` or `b`. */
function invMul(a, b, out) {
  const A = a.R, B = b.R;
  const d0 = b.o[0] - a.o[0], d1 = b.o[1] - a.o[1], d2 = b.o[2] - a.o[2];
  const o0 = A[0] * d0 + A[3] * d1 + A[6] * d2, o1 = A[1] * d0 + A[4] * d1 + A[7] * d2, o2 = A[2] * d0 + A[5] * d1 + A[8] * d2;
  const a0 = A[0], a1 = A[1], a2 = A[2], a3 = A[3], a4 = A[4], a5 = A[5], a6 = A[6], a7 = A[7], a8 = A[8];
  const b0 = B[0], b1 = B[1], b2 = B[2], b3 = B[3], b4 = B[4], b5 = B[5], b6 = B[6], b7 = B[7], b8 = B[8];
  const R = out.R;
  R[0] = a0 * b0 + a3 * b3 + a6 * b6; R[1] = a0 * b1 + a3 * b4 + a6 * b7; R[2] = a0 * b2 + a3 * b5 + a6 * b8;
  R[3] = a1 * b0 + a4 * b3 + a7 * b6; R[4] = a1 * b1 + a4 * b4 + a7 * b7; R[5] = a1 * b2 + a4 * b5 + a7 * b8;
  R[6] = a2 * b0 + a5 * b3 + a8 * b6; R[7] = a2 * b1 + a5 * b4 + a8 * b7; R[8] = a2 * b2 + a5 * b5 + a8 * b8;
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

function copyFrame(a, out) {
  for (let i = 0; i < 9; i++) out.R[i] = a.R[i];
  out.o[0] = a.o[0]; out.o[1] = a.o[1]; out.o[2] = a.o[2];
  return out;
}

/** Write `partnerFrame(f)` (180 degrees about local x) into `out`; aliasing is safe. */
function partnerInto(f, out) {
  const R = f.R, P = out.R;
  P[0] = R[0]; P[3] = R[3]; P[6] = R[6];
  P[1] = -R[1]; P[4] = -R[4]; P[7] = -R[7];
  P[2] = -R[2]; P[5] = -R[5]; P[8] = -R[8];
  out.o[0] = f.o[0]; out.o[1] = f.o[1]; out.o[2] = f.o[2];
  return out;
}

/** Allocation-free `slerpFrame` (needs the scratch quaternions `qa`, `qb`, `qo`; `out` may alias `a` or `b`). */
function slerpInto(a, b, t, out, qa, qb, qo) {
  if (t <= 0) return a === out ? out : copyFrame(a, out);
  if (t >= 1) return b === out ? out : copyFrame(b, out);
  matToQuat(a.R, qa); matToQuat(b.R, qb); slerpQuat(qa, qb, t, qo);
  const o0 = a.o[0] + (b.o[0] - a.o[0]) * t, o1 = a.o[1] + (b.o[1] - a.o[1]) * t, o2 = a.o[2] + (b.o[2] - a.o[2]) * t;
  quatToMat(qo, out.R);
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---- track caches ----------------------------------------------------------------------------------------------

const trackCache = new WeakMap(); // decoded asset -> { r0, r1, C: Frame[], n0, n1, N: Frame[] | null }

/** Coding-oriented template frames `C_r = partnerFrame(T_r)` and the non-template frames of an asset (computed once). */
function trackData(asset) {
  if (!asset || !asset.tracks || !asset.tracks.template) return null;
  let d = trackCache.get(asset);
  if (d) return d;
  const t = asset.tracks.template;
  const r0 = t.registers[0], r1 = t.registers[t.registers.length - 1];
  const C = [];
  for (let r = r0; r <= r1; r++) C.push(codingFrameAt(t, r));
  let n0 = 0, n1 = -1, N = null;
  const nt = asset.tracks.nontemplate;
  if (nt) {
    n0 = nt.registers[0]; n1 = nt.registers[nt.registers.length - 1];
    N = nt.frames.map(f => ({ o: f.o.slice(), R: f.R.slice() }));
  }
  d = { r0, r1, C, n0, n1, N };
  trackCache.set(asset, d);
  return d;
}

/** Template-track range `[r0, r1]` and the coding-oriented frame at the downstream end of a decoded asset. */
function endFrame(asset) {
  const d = trackData(asset);
  if (!d) throw new Error(`kin/duplex: asset ${asset && asset.id} has no template track`);
  return d;
}

/**
 * Downstream axis `z_d` in the machine frame: the +z of `C_{r1}` (the axis of the downstream arm), as `[x, y, z]`.
 * For a template track whose frames point upstream this is `-z(T_{r1})`. The machine must translate along it for the
 * downstream base pairs to stay stationary (design §3.1); S3 (ST6) consumes this.
 *
 * @param {object} asset - Decoded asset with a template track (`rnap-ec`).
 * @param {number[]} [out] - Optional result vector.
 * @returns {number[]} Unit vector `[x, y, z]`.
 */
export function downstreamAxis(asset, out = [0, 0, 0]) {
  const d = endFrame(asset), R = d.C[d.C.length - 1].R;
  out[0] = R[2]; out[1] = R[5]; out[2] = R[8];
  return out;
}

/**
 * Machine pose `M` that places the asset so that at `beta = 0` the K1 duplex coincides with the straight world
 * duplex `C^W_g = W . S(g - 124)`: `M = W . S(register + r1 - 124) . inverse(C_{r1})`.
 *
 * @param {object} asset - Decoded asset with a template track (`rnap-ec`).
 * @param {number} register - Gene index of template register 0 (may be fractional).
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Machine transform `{ o, R }`.
 */
export function machinePoseForRegister(asset, register, out = newFrame()) {
  const d = endFrame(asset), C1 = d.C[d.C.length - 1];
  const s = screwStep(register + d.r1 - MID_BP);
  // inverse of C1: R^T, -R^T o
  const R = C1.R, o = C1.o;
  const inv = {
    R: [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]],
    o: [-(R[0] * o[0] + R[3] * o[1] + R[6] * o[2]), -(R[1] * o[0] + R[4] * o[1] + R[7] * o[2]), -(R[2] * o[0] + R[5] * o[1] + R[8] * o[2])],
  };
  return mul(mul(W, s, newFrame()), inv, out);
}

// ---- scratch ---------------------------------------------------------------------------------------------------

const scratchCache = new WeakMap(); // construct -> scratch

function makeScratch(N) {
  const f = () => newFrame();
  return {
    N,
    qa: [0, 0, 0, 0], qb: [0, 0, 0, 0], qo: [0, 0, 0, 0],
    M: f(), MC1: f(), I: f(), Ct: f(), B: f(), T: f(), A: f(), F: f(), Fg: f(), S: f(),
    zd: [0, 0, 0], t0: [0, 0, 0], tE: [0, 0, 0], t0p: [0, 0, 0],
    bez: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], v: [0, 0, 0], v2: [0, 0, 0], tL: [0, 0, 0],
    tNow: [0, 0, 0], tPrev: [0, 0, 0], pPrev: [0, 0, 0], pNow: [0, 0, 0], pu: [0, 0, 0],
    Rm: new Float64Array(9),
    bubLo: 0, bubHi: -1, chain: null, s0: f(), s1: f(), Ya: f(), Yb: f(), Fk: f(), E: f(), Ei: f(), Id: f(), closure: { trans: 0, angleDeg: 0 },
    cum: new Float64Array(TABLE + 1),
    blendKey: null, blendC: null, blendN: null, blendSet: { r0: 0, r1: -1, C: null, n0: 0, n1: -1, N: null },
  };
}

function scratchFor(construct) {
  let s = scratchCache.get(construct);
  if (!s) { s = makeScratch(construct.codingDna.length); scratchCache.set(construct, s); }
  return s;
}

/**
 * Track set for a blend between the `rnap-holo` (blend 0) and `rnap-ec` (blend 1) tracks, per register: the slerp of
 * both where both exist, whichever exists otherwise (DEC-007). Without holo tracks the ec tracks are used.
 */
function trackSet(S, ec, holo, blend) {
  if (!holo) return ec;
  if (!ec) return holo;
  if (blend <= 0) return holo;
  if (blend >= 1) return ec;
  if (S.blendKey && S.blendKey.ec === ec && S.blendKey.holo === holo && S.blendKey.blend === blend) return S.blendSet;
  const out = S.blendSet;
  out.r0 = Math.min(ec.r0, holo.r0); out.r1 = Math.max(ec.r1, holo.r1);
  out.C = blendList(S, out.C, holo.C, holo.r0, ec.C, ec.r0, out.r0, out.r1, blend);
  const hasN = holo.N || ec.N;
  out.n0 = hasN ? Math.min(holo.N ? holo.n0 : Infinity, ec.N ? ec.n0 : Infinity) : 0;
  out.n1 = hasN ? Math.max(holo.N ? holo.n1 : -Infinity, ec.N ? ec.n1 : -Infinity) : -1;
  out.N = hasN ? blendList(S, out.N, holo.N || [], holo.N ? holo.n0 : 0, ec.N || [], ec.N ? ec.n0 : 0, out.n0, out.n1, blend) : null;
  S.blendKey = { ec, holo, blend };
  return out;
}

function blendList(S, store, la, a0, lb, b0, lo, hi, t) {
  const n = hi - lo + 1;
  if (!store || store.length !== n) store = Array.from({ length: n }, newFrame);
  for (let r = lo; r <= hi; r++) {
    const a = la[r - a0], b = lb[r - b0];
    const ia = a && r >= a0 && r - a0 < la.length, ib = b && r >= b0 && r - b0 < lb.length;
    const dst = store[r - lo];
    if (ia && ib) slerpInto(a, b, t, dst, S.qa, S.qb, S.qo);
    else copyFrame(ia ? a : b, dst);
  }
  return store;
}

/** Frame of a coding-oriented list (registers `lo...`) at a possibly fractional register inside `[lo, hi]`. */
function sampleList(S, list, lo, hi, r, out) {
  let k = Math.floor(r);
  let t = r - k;
  if (k >= hi) { k = hi; t = 0; }
  if (k < lo) { k = lo; t = 0; }
  const a = list[k - lo];
  if (t === 0) return copyFrame(a, out);
  return slerpInto(a, list[k + 1 - lo], t, out, S.qa, S.qb, S.qo);
}

// ---- upstream arm ----------------------------------------------------------------------------------------------

/** Spherical interpolation of unit vectors (normalised lerp when nearly parallel); `out` may alias nothing. */
function slerpVec(a, b, t, out) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const th = Math.acos(d), s = Math.sin(th);
  let wa, wb;
  if (s < 1e-8) { wa = 1 - t; wb = t; } else { wa = Math.sin((1 - t) * th) / s; wb = Math.sin(t * th) / s; }
  const x = wa * a[0] + wb * b[0], y = wa * a[1] + wb * b[1], z = wa * a[2] + wb * b[2];
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/** Double-reflection step: reflect the three columns of row-major `R` and the vector `t` across the plane normal to `v`. */
function reflectAll(R, t, v, c) {
  for (let k = 0; k < 3; k++) {
    const d = 2 * (R[k] * v[0] + R[3 + k] * v[1] + R[6 + k] * v[2]) / c;
    R[k] -= d * v[0]; R[3 + k] -= d * v[1]; R[6 + k] -= d * v[2];
  }
  const d = 2 * (t[0] * v[0] + t[1] * v[1] + t[2] * v[2]) / c;
  t[0] -= d * v[0]; t[1] -= d * v[1]; t[2] -= d * v[2];
}

/**
 * Pose the upstream arm (all gene indices `g <= gmax`, i.e. registers below `r0`) into the machine frame and write
 * them (after `M`) into the buffer. `A` is the seed frame at register `r0`; `t0p` the tangent leaving it (upstream);
 * `tE` the straight tangent beyond the curve. Base pair `k = r0 - r` steps upstream sits at arc length `3.38 k`; its
 * frame is the rotation-minimising transport of `A` to that point (double reflection), then `rotZ(-34.2857 k)`.
 */
function poseUpstream(S, M, A, t0p, tE, k0, gmax, out, N) {
  const L = ARM_STEPS * RISE;
  const P0 = S.bez[0], P1 = S.bez[1], P2 = S.bez[2], P3 = S.bez[3];
  P0[0] = A.o[0]; P0[1] = A.o[1]; P0[2] = A.o[2];
  for (let c = 0; c < 3; c++) {
    P1[c] = P0[c] + t0p[c] * L / 3;
    P3[c] = P0[c] + (t0p[c] + tE[c]) * L / 2;
    P2[c] = P3[c] - tE[c] * L / 3;
  }
  // cumulative chord lengths of the Bezier at u = i / TABLE (the arc-length table)
  const cum = S.cum, pu = S.pu, pPrev = S.pPrev;
  cum[0] = 0;
  cubicBezier(P0, P1, P2, P3, 0, pPrev);
  for (let i = 1; i <= TABLE; i++) {
    cubicBezier(P0, P1, P2, P3, i / TABLE, pu);
    cum[i] = cum[i - 1] + Math.hypot(pu[0] - pPrev[0], pu[1] - pPrev[1], pu[2] - pPrev[2]);
    pPrev[0] = pu[0]; pPrev[1] = pu[1]; pPrev[2] = pu[2];
  }
  const len = cum[TABLE];
  const at = (s, p, tg) => { // point and unit tangent at arc length s
    if (s >= len) {
      for (let c = 0; c < 3; c++) { p[c] = P3[c] + tE[c] * (s - len); tg[c] = tE[c]; }
      return;
    }
    let lo = 0, hi = TABLE;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo];
    const u = (lo + (seg > 0 ? (s - cum[lo]) / seg : 0)) / TABLE, v = 1 - u;
    cubicBezier(P0, P1, P2, P3, u, p);
    for (let c = 0; c < 3; c++) {
      tg[c] = 3 * (v * v * (P1[c] - P0[c]) + 2 * v * u * (P2[c] - P1[c]) + u * u * (P3[c] - P2[c]));
    }
    const l = Math.hypot(tg[0], tg[1], tg[2]) || 1;
    tg[0] /= l; tg[1] /= l; tg[2] /= l;
  };

  const Rm = S.Rm, v = S.v, tL = S.tL, tPrev = S.tPrev, tNow = S.tNow, pNow = S.pNow;
  for (let i = 0; i < 9; i++) Rm[i] = A.R[i];
  pPrev[0] = P0[0]; pPrev[1] = P0[1]; pPrev[2] = P0[2];
  tPrev[0] = t0p[0]; tPrev[1] = t0p[1]; tPrev[2] = t0p[2];
  const F = S.F, Fg = S.Fg;
  for (let j = 0, g = gmax; g >= 0; j++, g--) {
    const k = k0 + j;
    at(k * RISE, pNow, tNow);
    v[0] = pNow[0] - pPrev[0]; v[1] = pNow[1] - pPrev[1]; v[2] = pNow[2] - pPrev[2];
    tL[0] = tPrev[0]; tL[1] = tPrev[1]; tL[2] = tPrev[2];
    const c1 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (c1 > 1e-12) reflectAll(Rm, tL, v, c1);
    v[0] = tNow[0] - tL[0]; v[1] = tNow[1] - tL[1]; v[2] = tNow[2] - tL[2];
    const c2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (c2 > 1e-12) reflectAll(Rm, tL, v, c2);
    // twist about local z by -34.2857 deg per base pair: R . rotZ(-theta k)
    const th = -TWIST * k, cs = Math.cos(th), sn = Math.sin(th), R = F.R;
    for (let r = 0; r < 3; r++) {
      const a = Rm[3 * r], b = Rm[3 * r + 1];
      R[3 * r] = a * cs + b * sn; R[3 * r + 1] = -a * sn + b * cs; R[3 * r + 2] = Rm[3 * r + 2];
    }
    F.o[0] = pNow[0]; F.o[1] = pNow[1]; F.o[2] = pNow[2];
    mul(M, F, Fg);
    writeFrame16(out, g, Fg);
    partnerInto(Fg, Fg);
    writeFrame16(out, N + g, Fg);
    pPrev[0] = pNow[0]; pPrev[1] = pNow[1]; pPrev[2] = pNow[2];
    tPrev[0] = tNow[0]; tPrev[1] = tNow[1]; tPrev[2] = tNow[2];
  }
}



/** Local position of the backbone P atom (identical for all bases of the rigid templates). */
const PHOSPHATE = (() => { const t = nucleotideTemplate('A'), k = t.index.P * 3; return [t.local[k], t.local[k + 1], t.local[k + 2]]; })();

/**
 * Blend of two relative steps: rotation by quaternion slerp, translation chosen so that the image of the point `p`
 * (the next nucleotide's P atom, expressed in the previous nucleotide's frame) is the linear blend of its two images.
 * The O3'-P gap of the blended step is then at most the blend of the two end gaps (convexity of the distance), unlike
 * an origin-linear blend, whose rotation lever arm can exceed both. `out` may alias `s0` or `s1`.
 */
function blendStep(s0, s1, t, p, out, qa, qb, qo) {
  const A = s0.R, B = s1.R;
  const ax = A[0] * p[0] + A[1] * p[1] + A[2] * p[2] + s0.o[0], ay = A[3] * p[0] + A[4] * p[1] + A[5] * p[2] + s0.o[1], az = A[6] * p[0] + A[7] * p[1] + A[8] * p[2] + s0.o[2];
  const bx = B[0] * p[0] + B[1] * p[1] + B[2] * p[2] + s1.o[0], by = B[3] * p[0] + B[4] * p[1] + B[5] * p[2] + s1.o[1], bz = B[6] * p[0] + B[7] * p[1] + B[8] * p[2] + s1.o[2];
  matToQuat(A, qa); matToQuat(B, qb); slerpQuat(qa, qb, t, qo);
  const R = quatToMat(qo, out.R);
  out.o[0] = (1 - t) * ax + t * bx - (R[0] * p[0] + R[1] * p[1] + R[2] * p[2]);
  out.o[1] = (1 - t) * ay + t * by - (R[3] * p[0] + R[4] * p[1] + R[5] * p[2]);
  out.o[2] = (1 - t) * az + t * bz - (R[6] * p[0] + R[7] * p[1] + R[8] * p[2]);
  return out;
}

// ---- bubble chain (partial bend) --------------------------------------------------------------------------------

/**
 * Coding strand inside the bubble for 0 < beta < 1. Blending each frame independently between the ideal and the
 * non-template-track frame lets neighbours take unrelated interpolation paths (backbone gaps of 10-16 A). Instead the
 * *steps* between neighbouring frames are blended (`slerp(s0, s1, beta)`, `s0 = S(1)` the ideal step, `s1` the step of
 * the beta = 1 frames) and chained from the left anchor (gene `gA - 1`, the blended frame outside the bubble); the
 * closure error against the right anchor (gene `gB + 1`) is spread as `slerp(identity, E, k / n)` so the last frame
 * lands exactly on it. beta = 0 and beta = 1 do not use this path and are unchanged.
 */
function poseBubbleChain(S, set, M, C1, r1, r0, reg, beta, gA, gB, out, N) {
  const n = gB - gA + 2; // steps from gene gA - 1 to gene gB + 1
  if (!S.chain || S.chain.length < N + 2) S.chain = Array.from({ length: N + 2 }, newFrame);
  const chain = S.chain, { s0, s1, Ya, Yb, Fk, E, Ei, Id, I, B, qa, qb, qo } = S;
  const bLo = Math.max(S.bubLo, set.n0), bHi = Math.min(S.bubHi, set.n1);
  // beta = 1 coding frame: non-template track inside the bubble, template-track coding frame outside
  const Y = (r, dst) => ((r >= bLo && r <= bHi) ? sampleList(S, set.N, set.n0, set.n1, r, dst) : sampleList(S, set.C, r0, r1, r, dst));
  const blendAt = (g, dst) => { // blended coding frame outside the bubble, machine frame
    const r = g - reg;
    screwStep(r - r1, S.S); mul(C1, S.S, I);
    sampleList(S, set.C, r0, r1, r, S.Ct);
    return slerpInto(I, S.Ct, beta, dst, qa, qb, qo);
  };
  const PB = PHOSPHATE; // backbone P in the nucleotide frame (base independent)
  blendAt(gA - 1, chain[0]);
  blendAt(gB + 1, B);
  screwStep(1, s0);
  Y(gA - 1 - reg, Ya);
  for (let k = 1; k <= n; k++) {
    Y(gA - 1 + k - reg, Yb);
    invMul(Ya, Yb, s1);
    blendStep(s0, s1, beta, PB, s1, qa, qb, qo);
    mul(chain[k - 1], s1, chain[k]);
    copyFrame(Yb, Ya);
  }
  invMul(chain[n], B, E); // closure error E = inverse(F_end) . B (reported by lastBubbleClosure)
  matToQuat(E.R, qa);
  S.closure.trans = Math.hypot(E.o[0], E.o[1], E.o[2]);
  S.closure.angleDeg = 2 * Math.acos(Math.min(1, qa[3])) / DEG;
  Id.R[0] = Id.R[4] = Id.R[8] = 1; Id.R[1] = Id.R[2] = Id.R[3] = Id.R[5] = Id.R[6] = Id.R[7] = 0;
  Id.o[0] = Id.o[1] = Id.o[2] = 0;
  // Spread the error in the left anchor's frame, P_k = inverse(F_0) . F_k, with D = P_B . inverse(P_n) and
  // P'_k = slerp(identity, D, k / n) . P_k, so that neighbouring steps are perturbed only slightly (a right-multiplied
  // slerp(identity, E, k / n) conjugates every step by a large rotation).
  const F0 = chain[0], Fg = S.Fg;
  invMul(F0, chain[n], Fk);          // P_n
  invMul(Fk, Id, Ei);                // inverse(P_n)
  invMul(F0, B, E);                  // P_B
  mul(E, Ei, E);                     // D
  for (let k = 1; k < n; k++) {
    slerpInto(Id, E, k / n, Ei, qa, qb, qo);
    invMul(F0, chain[k], Fk);        // P_k
    mul(Ei, Fk, Fk);
    mul(F0, Fk, Fk);                 // F'_k
    mul(M, Fk, Fg);
    writeFrame16(out, gA - 1 + k, Fg);
  }
}

// ---- poseDuplex ------------------------------------------------------------------------------------------------

/**
 * Compute coding-strand and template-strand nucleotide frames for the DNA duplex (design §3.5, PLAN.md §8.3) and
 * write them into `outFrames` (`2 N` column-major 4x4 matrices; see the module header).
 *
 * Per gene index `g`, with register `r = g - dna.register` and effective bend `beta = bend (1 - relax)`:
 * inside the track `M . slerp(I_r, C_r, beta)` with `I_r = C_{r1} . S(r - r1)`; downstream `M . C_{r1} . S(r - r1)`;
 * upstream the cubic-Bezier arm of design §3.5 step 6. Inside `dna.bubble` the coding strand follows the
 * `nontemplate` track (blended toward the ideal frame by `beta`). With no machine the duplex is the straight world
 * duplex `W . S(g - 124)`.
 *
 * @param {object} construct - Gene construct (`TRUE_SCALE_GENE_CONSTRUCT`); only its length is used here.
 * @param {object} dnaState - `WorldState.dna` slice (`{ register, bend, bubble, relax, trackBlend? }`).
 * @param {object} assets - Decoded asset map (`{ 'rnap-ec': decoded, 'rnap-holo': decoded }`); tracks come from here.
 * @param {Float32Array} outFrames - Output buffer of `2 N * 16` floats.
 * @param {object} [opts]
 * @param {{ assetId: string, transform: { o: number[], R: number[] } } | null} [opts.machine] - RNAP actor transform
 *   (for relaxation after release the caller passes the frozen pose); `null`/absent gives the straight duplex.
 * @param {number} [opts.trackBlend] - 0 = `rnap-holo` tracks, 1 = `rnap-ec` tracks; defaults to `dnaState.trackBlend`,
 *   else 0 for `rnap-holo` and 1 otherwise (DEC-007). Without `rnap-holo` tracks the `rnap-ec` tracks are used.
 * @returns {Float32Array} `outFrames`.
 */
export function poseDuplex(construct, dnaState, assets, outFrames, opts = {}) {
  const S = scratchFor(construct), N = S.N;
  if (!outFrames || outFrames.length < 32 * N) throw new Error(`poseDuplex: outFrames needs ${32 * N} floats`);
  const machine = opts.machine || null;
  const Fg = S.Fg;

  if (!machine) { // straight world duplex C^W_g = W . S(g - 124)
    for (let g = 0; g < N; g++) {
      screwStep(g - MID_BP, S.S);
      mul(W, S.S, Fg);
      writeFrame16(outFrames, g, Fg);
      partnerInto(Fg, Fg);
      writeFrame16(outFrames, N + g, Fg);
    }
    return outFrames;
  }

  const ec = trackData(assets['rnap-ec']), holo = trackData(assets['rnap-holo']);
  if (!ec && !holo) throw new Error('poseDuplex: no template track in assets (need rnap-ec or rnap-holo)');
  const tb = clamp01(opts.trackBlend ?? dnaState.trackBlend ?? (machine.assetId === 'rnap-holo' ? 0 : 1));
  const set = trackSet(S, ec, holo, tb);
  const { r0, r1, C } = set;
  const reg = dnaState.register;
  const beta = clamp01(dnaState.bend) * (1 - clamp01(dnaState.relax));
  const bub = dnaState.bubble, bLo = bub ? bub[0] : 0, bHi = bub ? bub[1] : -1;
  S.bubLo = bLo; S.bubHi = bHi;
  const useBubble = !!bub && bHi > bLo && set.N !== null; // [0, 0] is the closed default
  copyFrame(machine.transform, S.M);
  const M = S.M, C1 = C[C.length - 1];
  mul(M, C1, S.MC1);

  // downstream axis and upstream seed
  const zd = S.zd, tE = S.tE, t0 = S.t0, t0p = S.t0p;
  zd[0] = C1.R[2]; zd[1] = C1.R[5]; zd[2] = C1.R[8];
  tE[0] = -zd[0]; tE[1] = -zd[1]; tE[2] = -zd[2];
  const Cr0 = C[0];
  t0[0] = -Cr0.R[2]; t0[1] = -Cr0.R[5]; t0[2] = -Cr0.R[8];
  slerpVec(tE, t0, beta, t0p);

  // upstream arm start: first gene index with r < r0 is gmax
  let gmax = Math.ceil(reg + r0) - 1;
  if (gmax > N - 1) gmax = N - 1;
  const gUp = gmax; // gene indices 0..gUp are upstream of the track (none when gUp < 0)
  const gLow = gUp < 0 ? -1 : gUp;
  // Partial bend with an open bubble: the bubble coding strand is chained from relative steps (poseBubbleChain)
  let gA = 0, gB = -1;
  if (useBubble && beta > 0 && beta < 1) {
    gA = Math.ceil(reg + Math.max(bLo, set.n0)); gB = Math.floor(reg + Math.min(bHi, set.n1));
    if (gA < 1 || gB > N - 2 || gB < gA || gA - 1 - reg < r0 || gB + 1 - reg > r1) gB = -1;
  }
  const chained = gB >= gA;

  for (let g = N - 1; g > gLow; g--) {
    const r = g - reg;
    if (r > r1) { // downstream arm: M . C_{r1} . S(r - r1)
      screwStep(r - r1, S.S);
      mul(S.MC1, S.S, Fg);
    } else { // inside the track [r0, r1]
      screwStep(r - r1, S.S);
      mul(C1, S.S, S.I);                                  // ideal straight frame I_r = C_{r1} . S(r - r1)
      sampleList(S, C, r0, r1, r, S.Ct);                  // track frame C_r
      slerpInto(S.I, S.Ct, beta, S.B, S.qa, S.qb, S.qo);   // blended in the machine frame
      mul(M, S.B, Fg);
      if (useBubble && !chained && r >= bLo && r <= bHi && r >= set.n0 && r <= set.n1) {
        // template strand stays partnerFrame of the blended template-track frame; the coding strand follows the
        // non-template track (blended toward the ideal frame by beta)
        writeFrame16(outFrames, g, Fg);
        partnerInto(Fg, Fg);
        writeFrame16(outFrames, N + g, Fg);
        sampleList(S, set.N, set.n0, set.n1, r, S.T);
        slerpInto(S.I, S.T, beta, S.B, S.qa, S.qb, S.qo);
        mul(M, S.B, Fg);
        writeFrame16(outFrames, g, Fg);
        continue;
      }
    }
    writeFrame16(outFrames, g, Fg);
    partnerInto(Fg, Fg);
    writeFrame16(outFrames, N + g, Fg);
  }

  if (chained) poseBubbleChain(S, set, M, C1, r1, r0, reg, beta, gA, gB, outFrames, N);

  if (gUp >= 0) {
    // seed A = slerp(I_{r0}, C_{r0}, beta)
    screwStep(r0 - r1, S.S);
    mul(C1, S.S, S.I);
    slerpInto(S.I, Cr0, beta, S.A, S.qa, S.qb, S.qo);
    const k0 = reg + r0 - gUp; // arm steps of the nearest upstream base pair, in (0, 1]
    poseUpstream(S, M, S.A, t0p, tE, k0, gUp, outFrames, N);
  }
  return outFrames;
}

// ---- backbone gaps ---------------------------------------------------------------------------------------------

/**
 * O3'(i)-P(i+1) distance (angstrom) of every strand step, measured with the rigid `nucleotideTemplate` (deoxyribose)
 * atoms placed by the frames: entries `0 ... N-2` are the coding strand, step `g -> g+1`, `|O3'(coding g) - P(coding g+1)|`;
 * entries `N-1 ... 2N-3` are the template strand, `|O3'(template g+1) - P(template g)|` (the template runs 5'->3'
 * toward decreasing `g`). Coding bases come from `construct.codingDna`, template bases from `construct.templateDna`.
 *
 * @param {object} construct - Gene construct.
 * @param {Float32Array} outFrames - Frame buffer written by {@link poseDuplex}.
 * @param {Float64Array | number[]} [out] - Optional result array of `2 (N - 1)` entries.
 * @returns {Float64Array | number[]} Gap per step.
 */
export function duplexBackboneGaps(construct, outFrames, out) {
  const N = construct.codingDna.length;
  const res = out || new Float64Array(2 * (N - 1));
  const p = [0, 0, 0], q = [0, 0, 0];
  const place = (i, tpl, name, dst) => {
    const k = tpl.index[name] * 3, x = tpl.local[k], y = tpl.local[k + 1], z = tpl.local[k + 2], b = i * 16;
    dst[0] = outFrames[b] * x + outFrames[b + 4] * y + outFrames[b + 8] * z + outFrames[b + 12];
    dst[1] = outFrames[b + 1] * x + outFrames[b + 5] * y + outFrames[b + 9] * z + outFrames[b + 13];
    dst[2] = outFrames[b + 2] * x + outFrames[b + 6] * y + outFrames[b + 10] * z + outFrames[b + 14];
  };
  for (let g = 0; g + 1 < N; g++) {
    const a = nucleotideTemplate(construct.codingDna[g]), b = nucleotideTemplate(construct.codingDna[g + 1]);
    place(g, a, "O3'", p); place(g + 1, b, 'P', q);
    res[g] = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const ta = nucleotideTemplate(construct.templateDna[g + 1]), tb = nucleotideTemplate(construct.templateDna[g]);
    place(N + g + 1, ta, "O3'", p); place(N + g, tb, 'P', q);
    res[N - 1 + g] = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return res;
}

/**
 * Closure error of the last partial-bend bubble chain computed for a construct (translation in angstrom, rotation in
 * degrees), before it was distributed over the steps. For diagnostics and tests; `null` before any chained pose.
 *
 * @param {object} construct - Gene construct.
 * @returns {{ trans: number, angleDeg: number } | null} Closure error.
 */
export function lastBubbleClosure(construct) {
  const S = scratchCache.get(construct);
  return S && S.chain ? { trans: S.closure.trans, angleDeg: S.closure.angleDeg } : null;
}
