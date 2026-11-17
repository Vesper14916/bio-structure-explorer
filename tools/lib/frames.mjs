// Base reference frames fitted to observed nucleotides, and track interpolation.
// Convention: docs/CONTRACTS.md section 1 (Olson et al. 2001 standard base frame, local z = 0).
import { BASE_ATOMS } from '../../js/science/bases.js';
import { kabsch, applyFrame, dist } from '../../js/science/math.js';
import { slerpMat } from '../../js/sim/util.js';

export const MIN_MATCHED = 6;
export const MAX_RMSD = 0.5;

const RESIDUE_BASE = { DA: 'A', DC: 'C', DG: 'G', DT: 'T', A: 'A', C: 'C', G: 'G', U: 'U' };
/** Map a residue name (DA/DC/DG/DT or A/C/G/U) to its one-letter base, or null. */
export const residueBase = comp => RESIDUE_BASE[comp] || null;

/**
 * Fit the standard base (BASE_ATOMS[base], including C1') onto observed atoms with the same names.
 * residueAtoms: { atomName: [x, y, z] }. Returns { o, R, rmsd, matched, usable }.
 * The frame maps standard coordinates into structure coordinates. usable is false when fewer than
 * MIN_MATCHED atoms match or rmsd > MAX_RMSD; such a fit must be treated as missing.
 */
export function fitBaseFrame(residueAtoms, base) {
  const std = BASE_ATOMS[base];
  if (!std) throw new Error(`unknown base ${base}`);
  const P = [], Q = [];
  for (const [name, , x, y] of std) if (residueAtoms[name]) { P.push([x, y, 0]); Q.push(residueAtoms[name]); }
  if (P.length < MIN_MATCHED) return { o: null, R: null, rmsd: Infinity, matched: P.length, usable: false };
  const f = kabsch(P, Q);
  const rmsd = Math.sqrt(P.reduce((s, p, i) => s + dist(applyFrame(f, p), Q[i]) ** 2, 0) / P.length);
  return { o: f.o, R: f.R, rmsd, matched: P.length, usable: rmsd <= MAX_RMSD };
}

/**
 * Least-squares line through points ([[x,y,z], ...]): returns { centroid, dir } where dir is the unit principal
 * axis (largest eigenvalue of the scatter matrix, power iteration), oriented from the first point toward the last.
 */
export function fitLine(points) {
  const n = points.length, c = [0, 1, 2].map(k => points.reduce((s, p) => s + p[k], 0) / n);
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += (p[i] - c[i]) * (p[j] - c[j]);
  let v = [0, 1, 2].map(k => points[n - 1][k] - points[0][k]);
  for (let it = 0; it < 500; it++) {
    const w = [0, 1, 2].map(i => S[i * 3] * v[0] + S[i * 3 + 1] * v[1] + S[i * 3 + 2] * v[2]);
    const l = Math.hypot(...w);
    v = w.map(x => x / l);
  }
  const span = [0, 1, 2].map(k => points[n - 1][k] - points[0][k]);
  if (v[0] * span[0] + v[1] * span[1] + v[2] * span[2] < 0) v = v.map(x => -x);
  return { centroid: c, dir: v };
}

/**
 * Fill missing frames (null entries) that lie between two fitted neighbours: linear interpolation of the
 * origin and spherical interpolation of the rotation. Leading and trailing missing entries are dropped.
 * Input: array of { o, R } or null. Returns { start, frames: [{ o, R }], synthetic: [0|1] } where start is
 * the input index of the first returned entry. Returns null when nothing was fitted.
 */
export function interpolateFrames(frames) {
  let a = 0, b = frames.length - 1;
  while (a <= b && !frames[a]) a++;
  while (b >= a && !frames[b]) b--;
  if (a > b) return null;
  const out = [], synthetic = [];
  let prev = a;
  for (let i = a; i <= b; i++) {
    if (frames[i]) { out.push({ o: frames[i].o.slice(), R: Array.from(frames[i].R) }); synthetic.push(0); prev = i; continue; }
    let next = i + 1;
    while (!frames[next]) next++;
    const t = (i - prev) / (next - prev), A = frames[prev], B = frames[next];
    const R = new Array(9);
    slerpMat(R, A.R, B.R, t);
    out.push({ o: [0, 1, 2].map(k => A.o[k] + (B.o[k] - A.o[k]) * t), R });
    synthetic.push(1);
  }
  return { start: a, frames: out, synthetic };
}
