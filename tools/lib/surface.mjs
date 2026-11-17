// Gaussian density envelopes and marching cubes, in plain JavaScript (no dependencies).
//
// The marching-cubes case table is generated at load time rather than typed in: for each of the
// 256 corner configurations, every cube face contributes iso-line segments between its sign-change
// edges (an ambiguous face, with two diagonal inside corners, always cuts off each inside corner
// separately, so neighbouring cubes agree), the segments are chained into closed loops, and each
// loop is triangulated as a fan and oriented so its normal points from the inside corners outward.
// The rule depends only on a shared face's corners, so the extracted surface is closed and welded.

// Corner c of a unit cube has offset (c & 1, (c >> 1) & 1, (c >> 2) & 1).
const CORNER = Array.from({ length: 8 }, (_, c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1]);
// Cube edges: [lower corner, axis]; the upper corner is lower | (1 << axis).
const EDGES = [];
for (let c = 0; c < 8; c++) for (let a = 0; a < 3; a++) if (!(c & (1 << a))) EDGES.push([c, a]);
const edgeOf = (c1, c2) => {
  const lo = Math.min(c1, c2), a = Math.log2(c1 ^ c2);
  return EDGES.findIndex(e => e[0] === lo && e[1] === a);
};
const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

// Each face listed counter-clockwise as seen from outside the cube (checked below).
const FACE_CCW = FACES.map(f => {
  const [p0, p1, p2] = f.map(c => CORNER[c]);
  const u = [0, 1, 2].map(k => p1[k] - p0[k]), v = [0, 1, 2].map(k => p2[k] - p1[k]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const centre = [0, 1, 2].map(k => f.reduce((s, c) => s + CORNER[c][k], 0) / 4);
  const out = centre.map(x => x - 0.5);
  return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0 ? f : f.slice().reverse();
});

function buildCase(mask) {
  const inside = c => (mask >> c) & 1;
  // Directed segments: on each face (walked counter-clockwise from outside), from the crossing that
  // enters a run of inside corners to the crossing that leaves it. An ambiguous face therefore cuts
  // off each inside corner separately. A face shared by two cubes is walked in opposite directions
  // by the two cubes, so their segments are opposite and the surface closes with consistent winding.
  const segs = [];
  for (const f of FACE_CCW) {
    const cross = [];
    for (let k = 0; k < 4; k++) {
      const a = f[k], b = f[(k + 1) % 4];
      if (inside(a) !== inside(b)) cross.push({ e: edgeOf(a, b), enters: !inside(a) });
    }
    for (let k = 0; k < cross.length; k++) if (cross[k].enters) segs.push([cross[k].e, cross[(k + 1) % cross.length].e]);
  }
  const loops = [], used = new Array(segs.length).fill(false);
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const loop = [segs[s][0]];
    let cur = segs[s][1];
    while (cur !== loop[0]) {
      loop.push(cur);
      const n = segs.findIndex((g, i) => !used[i] && g[0] === cur);
      if (n < 0) throw new Error(`marching cubes table: open loop in case ${mask}`);
      used[n] = true;
      cur = segs[n][1];
    }
    loops.push(loop);
  }
  // Fan triangulation; the sign convention (outward normals) is fixed once, below, from a test case.
  const tris = [];
  for (const loop of loops) for (let i = 1; i + 1 < loop.length; i++) tris.push(loop[0], loop[i], loop[i + 1]);
  return tris;
}
const RAW_TABLE = Array.from({ length: 256 }, (_, m) => buildCase(m));
// Case 1 (only corner 0 inside) is one triangle; its normal must point away from corner 0, i.e. toward +x+y+z.
const outwardSign = (() => {
  const [a, b, c] = RAW_TABLE[1].map(e => { const [k, ax] = EDGES[e], p = CORNER[k].slice(); p[ax] += 0.5; return p; });
  const u = [0, 1, 2].map(k => b[k] - a[k]), v = [0, 1, 2].map(k => c[k] - a[k]);
  return (u[1] * v[2] - u[2] * v[1]) + (u[2] * v[0] - u[0] * v[2]) + (u[0] * v[1] - u[1] * v[0]) > 0;
})();
export const MC_TABLE = outwardSign ? RAW_TABLE : RAW_TABLE.map(t => { const r = []; for (let i = 0; i < t.length; i += 3) r.push(t[i], t[i + 2], t[i + 1]); return r; });

/**
 * Sample a sum of unit-amplitude isotropic Gaussians (width sigma) on a regular grid.
 * points: flat [x, y, z, ...]. The grid covers the points plus a 3 sigma margin (truncation radius 3 sigma).
 */
export function gaussianDensity(points, sigma, spacing) {
  const pad = 3 * sigma, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], points[i + k]); hi[k] = Math.max(hi[k], points[i + k]); }
  const origin = lo.map(v => v - pad), dims = [0, 1, 2].map(k => Math.ceil((hi[k] + pad - origin[k]) / spacing) + 1);
  const [nx, ny, nz] = dims, values = new Float64Array(nx * ny * nz), inv = 1 / (2 * sigma * sigma), r = Math.ceil(pad / spacing);
  for (let i = 0; i < points.length; i += 3) {
    const g = [0, 1, 2].map(k => Math.round((points[i + k] - origin[k]) / spacing));
    for (let z = Math.max(0, g[2] - r); z <= Math.min(nz - 1, g[2] + r); z++) {
      const dz = origin[2] + z * spacing - points[i + 2];
      for (let y = Math.max(0, g[1] - r); y <= Math.min(ny - 1, g[1] + r); y++) {
        const dy = origin[1] + y * spacing - points[i + 1];
        for (let x = Math.max(0, g[0] - r); x <= Math.min(nx - 1, g[0] + r); x++) {
          const dx = origin[0] + x * spacing - points[i];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 <= pad * pad) values[(z * ny + y) * nx + x] += Math.exp(-d2 * inv);
        }
      }
    }
  }
  return { origin, spacing, dims, values };
}

/** Trilinear interpolation of a density grid at point p. */
export function sampleDensity(grid, p) {
  const { origin, spacing, dims: [nx, ny, nz], values } = grid;
  const f = [0, 1, 2].map(k => (p[k] - origin[k]) / spacing);
  const i = f.map((v, k) => Math.max(0, Math.min([nx, ny, nz][k] - 2, Math.floor(v))));
  const t = f.map((v, k) => Math.max(0, Math.min(1, v - i[k])));
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const [ox, oy, oz] = CORNER[c];
    const w = (ox ? t[0] : 1 - t[0]) * (oy ? t[1] : 1 - t[1]) * (oz ? t[2] : 1 - t[2]);
    s += w * values[((i[2] + oz) * ny + i[1] + oy) * nx + i[0] + ox];
  }
  return s;
}

/**
 * Extract the iso-surface { positions: flat xyz, indices: flat triangle indices } where density >= iso is
 * inside. Vertices are welded (one vertex per grid edge). Winding is counter-clockwise seen from outside.
 */
export function marchingCubes(grid, iso) {
  const { origin, spacing, dims: [nx, ny, nz], values } = grid;
  const at = (x, y, z) => values[(z * ny + y) * nx + x];
  const vid = new Map(), positions = [], indices = [];
  const vertex = (x, y, z, a) => {
    const key = ((z * ny + y) * nx + x) * 3 + a;
    let id = vid.get(key);
    if (id !== undefined) return id;
    const v0 = at(x, y, z), v1 = at(x + (a === 0), y + (a === 1), z + (a === 2));
    const t = v1 === v0 ? 0.5 : (iso - v0) / (v1 - v0);
    const p = [x, y, z]; p[a] += t;
    id = positions.length / 3; vid.set(key, id);
    positions.push(origin[0] + p[0] * spacing, origin[1] + p[1] * spacing, origin[2] + p[2] * spacing);
    return id;
  };
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let m = 0;
    for (let c = 0; c < 8; c++) if (at(x + CORNER[c][0], y + CORNER[c][1], z + CORNER[c][2]) >= iso) m |= 1 << c;
    if (m === 0 || m === 255) continue;
    for (const e of MC_TABLE[m]) { const [c, a] = EDGES[e]; indices.push(vertex(x + CORNER[c][0], y + CORNER[c][1], z + CORNER[c][2], a)); }
  }
  return { positions, indices };
}

/** Mesh checks: closed (every undirected edge used twice, each direction once) and signed volume. */
export function meshStats(positions, indices) {
  const directed = new Map();
  let bad = 0, vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    for (let k = 0; k < 3; k++) { const key = tri[k] + ',' + tri[(k + 1) % 3]; directed.set(key, (directed.get(key) || 0) + 1); }
    const [a, b, c] = tri.map(i => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]]);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (const [key, n] of directed) { const [i, j] = key.split(','); if (n !== 1 || directed.get(j + ',' + i) !== 1) bad++; }
  return { closed: bad === 0, badEdges: bad, signedVolume: vol };
}

/** Ray-parity point-in-mesh test (ray along a fixed slightly skewed direction). */
export function insideMesh(positions, indices, p) {
  const d = [1, 0.000123, 0.000271];
  let hits = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [p[0] - positions[a], p[1] - positions[a + 1], p[2] - positions[a + 2]];
    const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 0) hits++;
  }
  return hits % 2 === 1;
}

/**
 * Build an L0 envelope for one part from its bead positions (flat xyz).
 * Iso-level: start at the (1 - minInside) quantile of the density sampled at the beads, then lower the quantile in
 * steps of 0.25 percentage points until at least minInside of the beads are geometrically inside the extracted
 * mesh (ray-parity test). Grid spacing starts at `spacing` and grows in 0.5 A steps until the mesh has at most
 * maxTriangles triangles.
 */
export function envelope(points, { sigma = 5, spacing = 5, maxTriangles = 12000, minInside = 0.95 } = {}) {
  const n = points.length / 3;
  for (let h = spacing; ; h += 0.5) {
    const grid = gaussianDensity(points, sigma, h);
    const dens = [];
    for (let i = 0; i < points.length; i += 3) dens.push(sampleDensity(grid, [points[i], points[i + 1], points[i + 2]]));
    const sorted = dens.slice().sort((a, b) => a - b);
    let mesh = null, iso = 0, inside = 0, quantile = 1 - minInside;
    // Below the lowest bead density, keep lowering the iso-level by 2 % per step (small parts, beads on the surface).
    const qSteps = Math.ceil((1 - minInside) / 0.0025);
    for (let step = 0; step < qSteps + 200; step++) {
      quantile = Math.max(0, (1 - minInside) - 0.0025 * step);
      iso = sorted[Math.floor(quantile * n)] * (step > qSteps ? 0.98 ** (step - qSteps) : 1);
      mesh = marchingCubes(grid, iso);
      inside = 0;
      for (let i = 0; i < points.length; i += 3) if (insideMesh(mesh.positions, mesh.indices, [points[i], points[i + 1], points[i + 2]])) inside++;
      if (inside / n >= minInside) break;
    }
    const triangles = mesh.indices.length / 3;
    if (triangles <= maxTriangles) {
      return { ...mesh, triangles, vertices: mesh.positions.length / 3, spacing: h, sigma, iso, quantile, insideByRay: inside / n };
    }
  }
}
