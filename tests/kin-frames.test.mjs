// R3-K1 step 1: rigid-frame math, splines, arc-length tables and track sampling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  matToQuat, quatToMat, slerpQuat, slerpFrame, composeFrame, invertFrame, screwStep,
  rotationMinimizingFrames, arcLengthTable, cubicBezier, catmullRomCentripetal, sampleCatmullRom,
  writeFrame16, readFrame16,
} from '../js/kin/frames.js';
import { sampleTrack, blendTrackFrame, codingFrameAt, trackStepSign } from '../js/kin/track.js';
import { mulMM, helixFrame, partnerFrame, rotX, rotY, rotZ, mulMV } from '../js/science/math.js';
import { mulberry32, orthoError } from '../js/sim/util.js';
import { decodeAsset } from '../js/assets/format.js';

const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
const frameDiff = (a, b) => Math.max(maxDiff(a.o, b.o), maxDiff(a.R, b.R));
const axisAngle = (axis, ang) => {
  const l = Math.hypot(...axis), [x, y, z] = axis.map(v => v / l), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
const randRot = rng => {
  const ax = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
  return axisAngle(ax, rng() * 2 * Math.PI);
};
const randFrame = rng => ({ o: [rng() * 20 - 10, rng() * 20 - 10, rng() * 20 - 10], R: randRot(rng) });

test('quaternion round trip, random rotations', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const R = randRot(rng), q = matToQuat(R);
    assert.ok(q[3] >= 0);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12);
    assert.ok(maxDiff(quatToMat(q), R) <= 1e-9);
  }
});

test('quaternion round trip, 180 degree rotations', () => {
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [1, -2, 3]]) {
    const R = axisAngle(axis, Math.PI), q = matToQuat(R);
    assert.ok(q[3] >= 0, 'w >= 0');
    assert.ok(maxDiff(quatToMat(q), R) <= 1e-9, `axis ${axis}`);
  }
});

test('slerpFrame endpoints, midpoint and shortest arc', () => {
  const rng = mulberry32(11);
  const a = randFrame(rng), b = randFrame(rng);
  assert.ok(frameDiff(slerpFrame(a, b, 0), a) <= 1e-9);
  assert.ok(frameDiff(slerpFrame(a, b, 1), b) <= 1e-9);
  const A = { o: [0, 0, 0], R: rotZ(0) }, B = { o: [2, 4, 6], R: rotZ(Math.PI / 2) };
  const m = slerpFrame(A, B, 0.5);
  assert.ok(maxDiff(m.R, rotZ(Math.PI / 4)) <= 1e-12);
  assert.deepEqual(m.o, [1, 2, 3]);
  // shortest arc: -170 deg -> +170 deg passes through 180 deg, not through 0
  const m2 = slerpFrame({ o: [0, 0, 0], R: rotZ(-170 * Math.PI / 180) }, { o: [0, 0, 0], R: rotZ(170 * Math.PI / 180) }, 0.5);
  assert.ok(maxDiff(m2.R, rotZ(Math.PI)) <= 1e-9);
  // negated-hemisphere quaternion gives the same result
  const q = matToQuat(rotY(0.3)), qn = q.map(v => -v);
  assert.ok(maxDiff(slerpQuat(matToQuat(rotY(0)), q, 0.5), slerpQuat(matToQuat(rotY(0)), qn, 0.5)) <= 1e-12);
  assert.ok(orthoError(slerpFrame(a, b, 0.37).R) <= 1e-12);
});

test('composeFrame and invertFrame identities', () => {
  const rng = mulberry32(3);
  const I = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  for (let i = 0; i < 50; i++) {
    const a = randFrame(rng), b = randFrame(rng);
    assert.ok(frameDiff(composeFrame(a, invertFrame(a)), I) <= 1e-9);
    assert.ok(frameDiff(composeFrame(invertFrame(a), a), I) <= 1e-9);
    const ab = composeFrame(a, b);
    assert.ok(maxDiff(ab.R, mulMM(a.R, b.R)) <= 1e-12);
    const p = [1, -2, 3], pa = mulMV(a.R, mulMV(b.R, p).map((v, k) => v + b.o[k])).map((v, k) => v + a.o[k]);
    assert.ok(maxDiff(mulMV(ab.R, p).map((v, k) => v + ab.o[k]), pa) <= 1e-9);
    // aliasing
    const c = { o: a.o.slice(), R: a.R.slice() };
    composeFrame(c, b, c);
    assert.ok(frameDiff(c, ab) <= 1e-12);
    const d = { o: a.o.slice(), R: a.R.slice() };
    invertFrame(d, d);
    assert.ok(frameDiff(d, invertFrame(a)) <= 1e-12);
  }
});

test('screwStep equals helixFrame and is additive', () => {
  for (const x of [-7.5, -1, 0, 0.25, 1, 3.3, 10]) {
    assert.ok(frameDiff(screwStep(x), helixFrame(x, 3.38, 34.2857142857)) <= 1e-9);
  }
  const rng = mulberry32(5);
  for (let i = 0; i < 20; i++) {
    const a = rng() * 10 - 5, b = rng() * 10 - 5;
    assert.ok(frameDiff(composeFrame(screwStep(a), screwStep(b)), screwStep(a + b)) <= 1e-9);
  }
});

test('rotationMinimizingFrames: straight line is pure translation of the seed', () => {
  const seed = { o: [1, 2, 3], R: axisAngle([1, 2, 3], 0.7) };
  const dir = [seed.R[2], seed.R[5], seed.R[8]]; // seed z is the tangent
  const pts = Array.from({ length: 30 }, (_, i) => [1 + dir[0] * i * 1.7, 2 + dir[1] * i * 1.7, 3 + dir[2] * i * 1.7]);
  const fr = rotationMinimizingFrames(pts, seed);
  for (let i = 0; i < pts.length; i++) {
    assert.ok(maxDiff(fr[i].R, seed.R) <= 1e-9);
    assert.ok(maxDiff(fr[i].o, pts[i]) <= 1e-12);
  }
});

test('rotationMinimizingFrames: circle arc stays orthonormal and follows the tangent', () => {
  const Rr = 20, n = 200, pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 1.5; pts.push([Rr * Math.cos(a), Rr * Math.sin(a), 0]); }
  // seed: z = tangent at angle 0 (+y), y = (-1,0,0), x = y cross z
  const y = [-1, 0, 0], z = [0, 1, 0], x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  const seed = { o: pts[0], R: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]] };
  const fr = rotationMinimizingFrames(pts, seed);
  for (let i = 0; i <= n; i++) {
    assert.ok(orthoError(fr[i].R) <= 1e-12);
    const a = (i / n) * Math.PI * 1.5, tan = [-Math.sin(a), Math.cos(a), 0];
    const zc = [fr[i].R[2], fr[i].R[5], fr[i].R[8]];
    const ang = Math.acos(Math.min(1, zc[0] * tan[0] + zc[1] * tan[1] + zc[2] * tan[2]));
    assert.ok(ang <= 1e-3, `tangent error ${ang} at ${i}`);
  }
});

test('arcLengthTable: line and circle', () => {
  const line = arcLengthTable(u => [3 * u, 4 * u, 12 * u]);
  assert.ok(Math.abs(line.length - 13) / 13 < 1e-3);
  const circ = arcLengthTable(u => [30 * Math.cos(2 * Math.PI * u), 30 * Math.sin(2 * Math.PI * u), 0]);
  assert.ok(Math.abs(circ.length - 60 * Math.PI) / (60 * Math.PI) < 1e-3);
  let prev = -1;
  for (let k = 0; k <= 400; k++) {
    const u = circ.uAt((k / 400) * circ.length);
    assert.ok(u >= prev); prev = u;
  }
  assert.equal(circ.uAt(-5), 0);
  assert.equal(circ.uAt(1e9), 1);
  for (let k = 0; k <= 50; k++) {
    const s = (k / 50) * circ.length, th = s / 30;
    const p = circ.pointAt(s);
    assert.ok(Math.hypot(p[0] - 30 * Math.cos(th), p[1] - 30 * Math.sin(th), p[2]) <= 0.01, `circle s=${s}`);
    const t = circ.tangentAt(s);
    assert.ok(Math.hypot(t[0] + Math.sin(th), t[1] - Math.cos(th), t[2]) <= 1e-3);
    const q = line.pointAt((k / 50) * 13);
    assert.ok(Math.hypot(q[0] - 3 * k / 50, q[1] - 4 * k / 50, q[2] - 12 * k / 50) <= 0.01);
  }
});

test('cubicBezier and catmullRomCentripetal interpolate control points', () => {
  const p = [[0, 0, 0], [1, 2, 3], [4, -1, 2], [7, 5, 5]];
  assert.deepEqual(cubicBezier(...p, 0), p[0]);
  assert.deepEqual(cubicBezier(...p, 1), p[3]);
  assert.ok(maxDiff(cubicBezier(...p, 0.5), p[0].map((v, k) => (v + 3 * p[1][k] + 3 * p[2][k] + p[3][k]) / 8)) <= 1e-12);
  const pts = [[0, 0, 0], [10, 5, 0], [12, 20, 3], [30, 25, -4], [40, 0, 8]];
  const m = 7, s = catmullRomCentripetal(pts, (pts.length - 1) * m + 1);
  assert.equal(s.length, (pts.length - 1) * m + 1);
  pts.forEach((q, i) => assert.ok(maxDiff(s[i * m], q) <= 1e-9, `control point ${i}`));
  assert.ok(maxDiff(sampleCatmullRom(pts, 1), pts[4]) <= 1e-9);
  assert.ok(s.every(q => q.every(Number.isFinite)));
});

test('writeFrame16 / readFrame16 round trip and layout', () => {
  const f = { o: [10, 11, 12], R: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
  const buf = new Float32Array(48);
  writeFrame16(buf, 2, f);
  assert.deepEqual(Array.from(buf.slice(32, 48)), [1, 4, 7, 0, 2, 5, 8, 0, 3, 6, 9, 0, 10, 11, 12, 1]);
  assert.equal(buf[0], 0);
  const g = readFrame16(buf, 2);
  assert.deepEqual(g, f);
  const rng = mulberry32(9), r = randFrame(rng), b2 = new Float32Array(16);
  assert.ok(frameDiff(readFrame16(writeFrame16(b2, 0, r), 0), r) <= 1e-5);
});

// ---- track sampling on the committed rnap-ec asset
const ec = decodeAsset(JSON.parse(readFileSync(new URL('../assets/rnap-ec.asset.json', import.meta.url), 'utf8')));
const tpl = ec.tracks.template, nt = ec.tracks.nontemplate, rna = ec.tracks.rna;
const r0 = tpl.registers[0], r1 = tpl.registers[tpl.registers.length - 1];

test('sampleTrack exact at integer registers, interpolated at fractions', () => {
  assert.equal(r0, -15); assert.equal(r1, 13);
  for (let r = r0; r <= r1; r++) assert.ok(frameDiff(sampleTrack(tpl, r), tpl.frames[r - r0]) <= 1e-12);
  const mid = sampleTrack(tpl, 3.5), a = tpl.frames[3 - r0], b = tpl.frames[4 - r0];
  assert.ok(maxDiff(mid.o, a.o.map((v, k) => (v + b.o[k]) / 2)) <= 1e-9);
  assert.ok(frameDiff(mid, slerpFrame(a, b, 0.5)) <= 1e-9);
  assert.ok(orthoError(mid.R) <= 1e-9);
  const out = { o: [0, 0, 0], R: new Array(9).fill(0) };
  assert.equal(sampleTrack(tpl, 3.5, out), out);
  assert.ok(frameDiff(out, mid) <= 1e-12);
  assert.ok(frameDiff(blendTrackFrame(a, b, 0.5), mid) <= 1e-12);
});

test('track orientation is estimated from the data', () => {
  assert.equal(trackStepSign(tpl, 'end'), -1);
  assert.equal(trackStepSign(tpl, 'start'), -1);
  assert.equal(trackStepSign(nt, 'end'), 1);
  assert.equal(trackStepSign(rna, 'end'), 1);
});

test('sampleTrack extrapolation: template continues downstream, upstream below r0', () => {
  const zAx = [0, 0, 1];
  // Downstream: T(13) . S(-x), origin moves ~3.38 A per step along -z_T, so along the asset downstream axis.
  const T13 = tpl.frames[r1 - r0];
  let prevProj = null;
  for (let x = 1; x <= 6; x++) {
    const f = sampleTrack(tpl, r1 + x);
    assert.ok(frameDiff(f, composeFrame(T13, screwStep(-x))) <= 1e-9);
    assert.ok(orthoError(f.R) <= 1e-6);
    const step = Math.hypot(...f.o.map((v, k) => v - T13.o[k]));
    assert.ok(Math.abs(step - 3.38 * x) <= 1e-4 * x); // asset R is rounded to 6 decimals
    const down = [-T13.R[2], -T13.R[5], -T13.R[8]]; // downstream arm axis
    assert.ok((f.o[0] - T13.o[0]) * down[0] + (f.o[1] - T13.o[1]) * down[1] + (f.o[2] - T13.o[2]) * down[2] > 0);
    const proj = f.o[2] * zAx[2];
    if (prevProj !== null) assert.ok(proj > prevProj, 'asset-z projection increases downstream');
    prevProj = proj;
  }
  const p13 = T13.o[2], p19 = sampleTrack(tpl, r1 + 6).o[2];
  assert.ok(p19 - p13 > 0 && Math.abs((p19 - p13) / 6 - 3.38 * -T13.R[8]) < 1e-4, 'about 3.38 Angstrom per step along the arm axis');
  // fractional extrapolation continuous with the track end
  assert.ok(frameDiff(sampleTrack(tpl, r1 + 1e-9), T13) <= 1e-6);
  // Upstream: moves against the downstream arm axis
  const T0 = tpl.frames[0];
  for (let x = 1; x <= 5; x++) {
    const f = sampleTrack(tpl, r0 - x);
    assert.ok(frameDiff(f, composeFrame(T0, screwStep(x))) <= 1e-9);
    const d = f.o.map((v, k) => v - T0.o[k]);
    assert.ok(d[0] * T0.R[2] + d[1] * T0.R[5] + d[2] * T0.R[8] > 0, 'upstream = +z_T for a template track');
  }
  // Non-template (coding orientation) extrapolates by S(+x) downstream
  const N13 = nt.frames[nt.frames.length - 1];
  assert.ok(frameDiff(sampleTrack(nt, nt.registers[nt.registers.length - 1] + 2), composeFrame(N13, screwStep(2))) <= 1e-9);
});

test('codingFrameAt equals partnerFrame(sampleTrack)', () => {
  for (const r of [-20, -15, -3.25, 0, 7.5, 13, 16]) {
    const c = codingFrameAt(tpl, r), p = partnerFrame(sampleTrack(tpl, r));
    assert.ok(frameDiff(c, p) <= 1e-12);
  }
  // coding frames step by S(+1): C(r+1) = C(r) . S(1) on the straight stretch beyond the track end
  const c1 = codingFrameAt(tpl, 14), c2 = codingFrameAt(tpl, 15);
  assert.ok(frameDiff(c2, composeFrame(c1, screwStep(1))) <= 1e-9);
  const out = { o: [0, 0, 0], R: new Array(9).fill(0) };
  assert.equal(codingFrameAt(tpl, 2, out), out);
});
