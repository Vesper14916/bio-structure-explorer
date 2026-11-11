// Small allocation-free helpers shared by the render layers.
import * as THREE from 'three';

/** Write a uniformly scaled translation matrix (column-major) at instance slot i. */
export function writeSphere(arr, i, x, y, z, s) {
  const o = i * 16;
  arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

/** Zero matrix: hides an instance without touching the instance count. */
export function writeHidden(arr, i) {
  const o = i * 16;
  for (let k = 0; k < 16; k++) arr[o + k] = 0;
}

/**
 * Matrix mapping a unit cylinder (radius 1, height 1, centred, along +Y) onto the segment
 * a->b with radius r. Returns false (and hides the slot) for a degenerate segment.
 */
export function writeCylinder(arr, i, ax, ay, az, bx, by, bz, r) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 1e-5 || r <= 0) { writeHidden(arr, i); return false; }
  dx /= L; dy /= L; dz /= L;
  // x = normalize(helper × y)
  let hx = 1, hy = 0, hz = 0;
  if (Math.abs(dx) > 0.9) { hx = 0; hy = 1; }
  let xx = hy * dz - hz * dy, xy = hz * dx - hx * dz, xz = hx * dy - hy * dx;
  const xl = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
  xx *= xl; xy *= xl; xz *= xl;
  // z = x × y
  const zx = xy * dz - xz * dy, zy = xz * dx - xx * dz, zz = xx * dy - xy * dx;
  const o = i * 16;
  arr[o] = xx * r; arr[o + 1] = xy * r; arr[o + 2] = xz * r; arr[o + 3] = 0;
  arr[o + 4] = dx * L; arr[o + 5] = dy * L; arr[o + 6] = dz * L; arr[o + 7] = 0;
  arr[o + 8] = zx * r; arr[o + 9] = zy * r; arr[o + 10] = zz * r; arr[o + 11] = 0;
  arr[o + 12] = (ax + bx) * 0.5; arr[o + 13] = (ay + by) * 0.5; arr[o + 14] = (az + bz) * 0.5; arr[o + 15] = 1;
  return true;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Sphere geometry used for atoms; tessellation follows the quality tier. */
export function sphereGeometry(tier) {
  const seg = tier === 'high' ? [22, 16] : tier === 'medium' ? [16, 12] : [10, 8];
  return new THREE.SphereGeometry(1, seg[0], seg[1]);
}

export function cylinderGeometry(tier) {
  return new THREE.CylinderGeometry(1, 1, 1, tier === 'high' ? 12 : tier === 'medium' ? 9 : 6, 1, true);
}

/** Dispose every geometry / material / texture below an object. */
export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(mm => {
      for (const k in mm) { const v = mm[k]; if (v && v.isTexture) v.dispose(); }
      mm.dispose();
    });
    if (o.dispose && o.isInstancedMesh) o.dispose();
  });
}
