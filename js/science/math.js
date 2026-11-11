// Small linear-algebra helpers. A frame is { o: [x,y,z], R: [9 numbers, row-major] }
// whose columns are the frame's x, y, z axes expressed in world coordinates.
export const DEG = Math.PI / 180;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const norm = a => scale(a, 1 / len(a));
export const angle = (a, b, c) => Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(a, b)), norm(sub(c, b)))))) / DEG;
export function dihedral(a, b, c, d) {
  const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
  const n1 = cross(b1, b2), n2 = cross(b2, b3);
  return Math.atan2(dot(cross(n1, n2), norm(b2)), dot(n1, n2)) / DEG;
}
export const mulMV = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
export const mulMtV = (R, v) => [
  R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
  R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
  R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
export function mulMM(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
export const applyFrame = (f, v) => add(mulMV(f.R, v), f.o);
export const invApplyFrame = (f, v) => mulMtV(f.R, sub(v, f.o));
export const composeFrames = (a, b) => ({ o: applyFrame(a, b.o), R: mulMM(a.R, b.R) });
export const rotZ = t => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
export const rotX = t => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
export const rotY = t => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];

// Base-pair frame number k of an ideal straight helix whose axis is +z.
export const helixFrame = (k, rise, twistDeg) => ({ o: [0, 0, k * rise], R: rotZ(k * twistDeg * DEG) });
// Frame of the Watson-Crick partner (strand II) inside a base-pair frame: 180° about x.
export const FLIP_X = [1, 0, 0, 0, -1, 0, 0, 0, -1];
export const partnerFrame = f => ({ o: f.o.slice(), R: mulMM(f.R, FLIP_X) });

// Jacobi eigen-decomposition of a symmetric n×n matrix (array of rows).
function jacobi(A) {
  const n = A.length, V = A.map((_, i) => A.map((__, j) => +(i === j)));
  A = A.map(r => r.slice());
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

// Least-squares rigid superposition (Horn 1987, quaternion method).
// Returns the frame f minimising sum |f(P_i) - Q_i|^2.
export function kabsch(P, Q) {
  const n = P.length, cp = [0, 0, 0], cq = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { cp[k] += P[i][k] / n; cq[k] += Q[i][k] / n; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
    S[a][b] += (P[i][a] - cp[a]) * (Q[i][b] - cq[b]);
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  const { values, vectors } = jacobi(N);
  let m = 0; for (let i = 1; i < 4; i++) if (values[i] > values[m]) m = i;
  const [w, x, y, z] = vectors.map(r => r[m]);
  const R = [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z];
  return { o: sub(cq, mulMV(R, cp)), R };
}
