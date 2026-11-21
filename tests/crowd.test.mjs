// R3-R4: cytoplasmic crowders (PLAN.md §4.3, §4.5, §10 R3-R4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../js/assets/format.js';
import { TRUE_SCALE_GENE_CONSTRUCT as SCENARIO } from '../js/science/index.js';
import {
  generateCrowd, ribosomeCentre, CROWD_BOX, CROWD_CLASSES, CROWD_GENE_CAPSULE_RADIUS,
  CROWD_RIBOSOME_EXCLUSION, CROWD_MIN_SEPARATION, crowdCount,
} from '../js/scene/crowd.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));
const ASSETS = Object.fromEntries(CROWD_CLASSES.map(c => [c.assetId, load(c.assetId)]));
const HALF_GENE = SCENARIO.length * 3.38 / 2;

const high = generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'high' });
const total = list => list.reduce((n, b) => n + b.transforms.length / 16, 0);

test('counts: 40 ribosomes, 96 EF-Tu, 5 RNAP at high; 50 % at medium; none at low', () => {
  const by = Object.fromEntries(high.map(b => [b.assetId, b.transforms.length / 16]));
  assert.deepEqual(by, { 'ribosome-70s': 40, 'ef-tu': 96, 'rnap-holo': 5 });
  const med = generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'medium' });
  const mby = Object.fromEntries(med.map(b => [b.assetId, b.transforms.length / 16]));
  assert.deepEqual(mby, { 'ribosome-70s': 20, 'ef-tu': 48, 'rnap-holo': 3 });
  assert.equal(generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'low' }).length, 0);
  // Counts follow density x box volume (1.6e-3 um^3).
  const vol = CROWD_BOX.size.reduce((a, b) => a * b, 1) / 1e12;
  for (const c of CROWD_CLASSES) assert.equal(Math.round(c.density * vol), c.count, c.assetId);
  assert.equal(crowdCount(CROWD_CLASSES[2], 'medium'), 3);
});

test('deterministic for a seed, different for another seed, and medium is a prefix of high', () => {
  const again = generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'high' });
  assert.equal(again.length, high.length);
  for (let i = 0; i < high.length; i++) {
    assert.equal(again[i].assetId, high[i].assetId);
    assert.deepEqual(Array.from(again[i].transforms), Array.from(high[i].transforms));
  }
  const other = generateCrowd(SCENARIO, ASSETS, { seed: 20, tier: 'high' });
  assert.notDeepEqual(Array.from(other[0].transforms.subarray(0, 16)), Array.from(high[0].transforms.subarray(0, 16)));
  const med = generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'medium' });
  for (let i = 0; i < med.length; i++) {
    assert.deepEqual(Array.from(med[i].transforms), Array.from(high[i].transforms.subarray(0, med[i].transforms.length)));
  }
});

test('every crowder centre is inside the box and its sphere is outside the gene capsule and ribosome exclusion sphere', () => {
  const rc = ribosomeCentre(undefined, ASSETS['ribosome-70s']);
  for (const b of high) {
    const n = b.transforms.length / 16;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = [b.positions[3 * i], b.positions[3 * i + 1], b.positions[3 * i + 2]];
      const r = b.radius;
      assert.ok(Math.abs(x) <= CROWD_BOX.size[0] / 2 + 1e-3, 'x in box');
      assert.ok(Math.abs(y) <= CROWD_BOX.size[1] / 2 + 1e-3, 'y in box');
      assert.ok(Math.abs(z) <= CROWD_BOX.size[2] / 2 + 1e-3, 'z in box');
      const cx = Math.max(-HALF_GENE, Math.min(HALF_GENE, x));
      const dAxis = Math.hypot(x - cx, y, z);
      assert.ok(dAxis >= CROWD_GENE_CAPSULE_RADIUS + r - 1e-3, `${b.assetId} #${i} clear of the gene capsule`);
      const dRibo = Math.hypot(x - rc[0], y - rc[1], z - rc[2]);
      assert.ok(dRibo >= CROWD_RIBOSOME_EXCLUSION + r - 1e-3, `${b.assetId} #${i} clear of the ribosome sphere`);
    }
  }
});

test('minimum centre distance is 0.8 x the sum of the bounds radii', () => {
  const pts = [];
  for (const b of high) for (let i = 0; i < b.transforms.length / 16; i++) pts.push([b.positions[3 * i], b.positions[3 * i + 1], b.positions[3 * i + 2], b.radius]);
  assert.equal(pts.length, 141);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      assert.ok(d >= CROWD_MIN_SEPARATION * (pts[i][3] + pts[j][3]) - 1e-3, `pair ${i},${j}`);
    }
  }
});

test('transforms are rigid, column-major Matrix4 layouts that place the asset centre at the position', () => {
  for (const b of high) {
    const c = ASSETS[b.assetId].bounds.center;
    const n = b.transforms.length / 16;
    for (let i = 0; i < n; i++) {
      const m = b.transforms.subarray(16 * i, 16 * i + 16);
      assert.equal(m[15], 1); assert.equal(m[3], 0); assert.equal(m[7], 0); assert.equal(m[11], 0);
      // Orthonormal columns, determinant +1.
      const col = k => [m[4 * k], m[4 * k + 1], m[4 * k + 2]];
      const dot = (a, c2) => a[0] * c2[0] + a[1] * c2[1] + a[2] * c2[2];
      const [c0, c1, c2] = [col(0), col(1), col(2)];
      assert.ok(Math.abs(dot(c0, c0) - 1) < 1e-4 && Math.abs(dot(c1, c1) - 1) < 1e-4 && Math.abs(dot(c2, c2) - 1) < 1e-4);
      assert.ok(Math.abs(dot(c0, c1)) < 1e-4 && Math.abs(dot(c0, c2)) < 1e-4 && Math.abs(dot(c1, c2)) < 1e-4);
      const det = c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) - c0[1] * (c1[0] * c2[2] - c1[2] * c2[0]) + c0[2] * (c1[0] * c2[1] - c1[1] * c2[0]);
      assert.ok(Math.abs(det - 1) < 1e-4);
      // M * centre == position.
      for (let k = 0; k < 3; k++) {
        const p = m[k] * c[0] + m[4 + k] * c[1] + m[8 + k] * c[2] + m[12 + k];
        assert.ok(Math.abs(p - b.positions[3 * i + k]) < 5e-3, `centre maps to position (${b.assetId} #${i})`);
      }
    }
  }
});

test('orientations are random: the first axis of each ribosome is not constant', () => {
  const b = high.find(x => x.assetId === 'ribosome-70s');
  let minX = 2, maxX = -2;
  for (let i = 0; i < b.transforms.length / 16; i++) { const v = b.transforms[16 * i]; minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
  assert.ok(maxX - minX > 0.8);
});

test('a missing asset is skipped without throwing; a moved ribosome pose moves the exclusion sphere', () => {
  const partial = generateCrowd(SCENARIO, { 'ef-tu': ASSETS['ef-tu'] }, { seed: 3, tier: 'high' });
  assert.deepEqual(partial.map(b => b.assetId), ['ef-tu']);
  const pose = { o: [0, 0, 400], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  const moved = generateCrowd(SCENARIO, ASSETS, { seed: 19, tier: 'high', ribosomePose: pose });
  const rc = ribosomeCentre(pose, ASSETS['ribosome-70s']);
  for (const b of moved) for (let i = 0; i < b.transforms.length / 16; i++) {
    assert.ok(Math.hypot(b.positions[3 * i] - rc[0], b.positions[3 * i + 1] - rc[1], b.positions[3 * i + 2] - rc[2]) >= CROWD_RIBOSOME_EXCLUSION + b.radius - 1e-3);
  }
  assert.equal(total(moved), 141);
});
