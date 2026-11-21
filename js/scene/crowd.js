/**
 * @module scene/crowd
 * Round 3 cytoplasmic crowding generator (PLAN.md §4.3, §4.5, §8.1, §10 R3-R4).
 *
 * Generates deterministic, non-overlapping crowder transforms for `viewer.setCrowd`. Pure: no DOM, no
 * three.js, no clock; every random number comes from a PRNG seeded by `opts.seed`.
 *
 * Placement is random sequential addition inside a box centred on the gene midpoint. A candidate is accepted
 * when its centre lies inside the box, its whole bounding sphere (radius = `asset.bounds.radius`) lies outside
 * the gene capsule and the ribosome exclusion sphere, and its centre is at least `0.8 * (r_i + r_j)` from every crowder placed
 * before it. All constraints are pairwise or per crowder, so the first `n` crowders of a class are valid on
 * their own: the `medium` tier is the first 50 % of each class of the `high` tier, and changing tier never
 * reshuffles the rest.
 */
import { mulberry32 } from '../sim/util.js';
import { RIBO_LAYOUT } from '../sim/gene/translation.js';

/** Crowding box (Å), centred on the gene midpoint (world origin). PLAN.md §10 R3-R4. */
export const CROWD_BOX = Object.freeze({ size: Object.freeze([1600, 1000, 1000]), center: Object.freeze([0, 0, 0]) });
/** Radius (Å) of the capsule around the gene axis that no crowder may enter. */
export const CROWD_GENE_CAPSULE_RADIUS = 180;
/** Radius (Å) of the sphere around the ribosome pose that no crowder may enter. */
export const CROWD_RIBOSOME_EXCLUSION = 320;
/** Rise per base pair along the gene axis (Å); the axis is the world x axis through the gene midpoint. */
const RISE = 3.38;
/** Minimum centre separation as a fraction of the sum of the two bounds radii. */
export const CROWD_MIN_SEPARATION = 0.8;
/** Share of the `high` tier kept per class. */
export const CROWD_TIER_FRACTION = Object.freeze({ high: 1, medium: 0.5, low: 0 });

/**
 * Crowder classes in placement order. Densities are illustrative cytoplasm values (µm⁻³); the instance
 * counts are `round(density × box volume)` for the 1.6e-3 µm³ box (docs/SCIENCE.md §5 Crowding).
 */
export const CROWD_CLASSES = Object.freeze([
  Object.freeze({ assetId: 'ribosome-70s', density: 25000, count: 40 }),
  Object.freeze({ assetId: 'ef-tu', density: 60000, count: 96 }),
  Object.freeze({ assetId: 'rnap-holo', density: 3000, count: 5 }),
]);

const MAX_ATTEMPTS = 4000;

/** Number of instances of a class for a tier (`round`, half up). */
export function crowdCount(cls, tier = 'high') {
  const f = CROWD_TIER_FRACTION[tier] ?? CROWD_TIER_FRACTION.high;
  return Math.round(cls.count * f);
}

function distToSegment(px, py, pz, ax, bx) {
  // Segment on the x axis from (ax, 0, 0) to (bx, 0, 0).
  const cx = px < ax ? ax : px > bx ? bx : px;
  const dx = px - cx;
  return Math.sqrt(dx * dx + py * py + pz * pz);
}

/** Uniform random rotation (Shoemake). Returns a row-major 3 × 3 array. */
function randomRotation(rng) {
  const u1 = rng(), u2 = rng(), u3 = rng();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  const a = 2 * Math.PI * u2, b = 2 * Math.PI * u3;
  const x = s1 * Math.sin(a), y = s1 * Math.cos(a), z = s2 * Math.sin(b), w = s2 * Math.cos(b);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** World position of the ribosome centre: pose origin plus the pose rotation applied to the asset centre. */
export function ribosomeCentre(pose, ribosomeAsset) {
  const o = (pose && pose.o) || RIBO_LAYOUT.o;
  const R = (pose && pose.R) || RIBO_LAYOUT.R;
  const c = (ribosomeAsset && ribosomeAsset.bounds && ribosomeAsset.bounds.center) || [0, 0, 0];
  return [
    o[0] + R[0] * c[0] + R[1] * c[1] + R[2] * c[2],
    o[1] + R[3] * c[0] + R[4] * c[1] + R[5] * c[2],
    o[2] + R[6] * c[0] + R[7] * c[1] + R[8] * c[2],
  ];
}

/**
 * Generate seeded cytoplasmic crowder instance batches (`[{ assetId, transforms: Float32Array }]`)
 * inside a 1600 x 1000 x 1000 angstrom box centred on the gene midpoint, excluding the gene-axis
 * capsule (radius 180 angstroms) and ribosome exclusion sphere (radius 320 angstroms).
 *
 * Contract (PLAN.md §4.3, §4.5, §10 R3-R4):
 * - Deterministic for a given `seed`.
 * - Respects quality tier counts (`high`: 100%, `medium`: 50%, `low`: 0%).
 * - Minimum centre separation equals `0.8 * (r_i + r_j)`.
 *
 * Each `transforms` entry holds 16 floats per instance in `THREE.Matrix4.elements` (column-major) layout. The
 * matrix maps asset coordinates to the world and moves the asset's bounds centre to the placed position, so
 * the bounding sphere of an instance is `{ centre: position, radius: asset.bounds.radius }`.
 *
 * @param {object} scenario - Gene construct / scenario definition (`length` sets the gene axis length).
 * @param {object} assets - Decoded machine asset map providing bounds radii.
 * @param {{ seed?: number, tier?: 'low' | 'medium' | 'high', ribosomePose?: object }} [opts] - Crowding options.
 * @returns {Array<{ assetId: string, transforms: Float32Array, positions: Float32Array, radius: number }>} Instanced crowder batches for `viewer.setCrowd`.
 */
export function generateCrowd(scenario, assets, opts = {}) {
  const tier = CROWD_TIER_FRACTION[opts.tier] === undefined ? 'high' : opts.tier;
  if (CROWD_TIER_FRACTION[tier] === 0) return [];
  const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : 19;
  const rng = mulberry32(seed);
  const lookup = id => (assets instanceof Map ? assets.get(id) : assets && assets[id]) || null;

  const half = ((scenario && scenario.length) || 248) * RISE / 2;
  const [bx, by, bz] = CROWD_BOX.size.map(v => v / 2);
  const rc = ribosomeCentre(opts.ribosomePose, lookup('ribosome-70s'));

  // Spheres of everything already placed: [x, y, z, r].
  const placed = [];
  const out = [];

  for (let ci = 0; ci < CROWD_CLASSES.length; ci++) {
    const cls = CROWD_CLASSES[ci];
    const asset = lookup(cls.assetId);
    if (!asset || !asset.bounds || !(asset.bounds.radius > 0)) continue;
    const r = asset.bounds.radius;
    const c = asset.bounds.center || [0, 0, 0];
    const want = cls.count; // generate the full `high` set so the tiers share a prefix
    const keep = crowdCount(cls, tier);
    const positions = new Float32Array(want * 3);
    const transforms = new Float32Array(want * 16);
    let n = 0;

    for (let attempt = 0; n < want && attempt < MAX_ATTEMPTS * want; attempt++) {
      // Draw all random numbers of a candidate first, so the stream does not depend on early rejection.
      const x = (rng() * 2 - 1) * bx;
      const y = (rng() * 2 - 1) * by;
      const z = (rng() * 2 - 1) * bz;
      const R = randomRotation(rng);
      if (distToSegment(x, y, z, -half, half) < CROWD_GENE_CAPSULE_RADIUS + r) continue;
      const dx = x - rc[0], dy = y - rc[1], dz = z - rc[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < CROWD_RIBOSOME_EXCLUSION + r) continue;
      let ok = true;
      for (let k = 0; k < placed.length; k++) {
        const s = placed[k];
        const ex = x - s[0], ey = y - s[1], ez = z - s[2];
        const min = CROWD_MIN_SEPARATION * (r + s[3]);
        if (ex * ex + ey * ey + ez * ez < min * min) { ok = false; break; }
      }
      if (!ok) continue;

      placed.push([x, y, z, r]);
      positions[n * 3] = x; positions[n * 3 + 1] = y; positions[n * 3 + 2] = z;
      const m = n * 16;
      // Column-major Matrix4: columns are the rotation columns; translation = position − R · centre.
      transforms[m] = R[0]; transforms[m + 1] = R[3]; transforms[m + 2] = R[6]; transforms[m + 3] = 0;
      transforms[m + 4] = R[1]; transforms[m + 5] = R[4]; transforms[m + 6] = R[7]; transforms[m + 7] = 0;
      transforms[m + 8] = R[2]; transforms[m + 9] = R[5]; transforms[m + 10] = R[8]; transforms[m + 11] = 0;
      transforms[m + 12] = x - (R[0] * c[0] + R[1] * c[1] + R[2] * c[2]);
      transforms[m + 13] = y - (R[3] * c[0] + R[4] * c[1] + R[5] * c[2]);
      transforms[m + 14] = z - (R[6] * c[0] + R[7] * c[1] + R[8] * c[2]);
      transforms[m + 15] = 1;
      n++;
    }

    const count = Math.min(n, keep);
    if (count > 0) {
      out.push({
        assetId: cls.assetId,
        transforms: transforms.slice(0, count * 16),
        positions: positions.slice(0, count * 3),
        radius: r,
      });
    }
  }
  return out;
}
