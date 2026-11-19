// Asset size and LOD budget checks (PLAN.md §7.5).
// Reads assets/manifest.json and validates every committed asset against validateAsset()
// and its per-category L0/L1/L2/byte budgets, plus total asset size and standalone HTML size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset } from '../js/assets/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const manifestPath = path.join(assetsDir, 'manifest.json');
const standalonePath = path.join(root, 'dist', 'helix-standalone.html');

const FACTOR_IDS = new Set(['rf1', 'ef-tu', 'ef-g', 'if1', 'if2', 'if3', 'nusg']);
const RNAP_IDS = new Set(['rnap-ec', 'rnap-holo']);

const BUDGETS = {
  ribosome: { maxL0: 70_000, maxL1: 15_000, maxL2: 4_000, maxBytes: 1_200_000 },
  trna: { maxL0: 4_000, maxL1: 80, maxL2: 400, maxBytes: 60_000 },
  factor: { maxL0: 8_000, maxL1: 900, maxL2: 400, maxBytes: 120_000 },
  rnap: { maxBytes: 220_000 },
  totalAssetsBytes: 3_000_000,
  standaloneBytes: 7_500_000,
};

function budgetFor(id) {
  if (id === 'ribosome-70s') return { category: 'ribosome', ...BUDGETS.ribosome };
  if (id.startsWith('trna-')) return { category: 'trna', ...BUDGETS.trna };
  if (FACTOR_IDS.has(id)) return { category: 'factor', ...BUDGETS.factor };
  if (RNAP_IDS.has(id)) return { category: 'rnap', ...BUDGETS.rnap };
  return null;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Array.isArray(manifest.assets) ? manifest.assets : [];

test('asset budgets: every manifest asset validates with zero errors', () => {
  assert.ok(entries.length > 0, 'assets/manifest.json must list at least one asset');
  for (const entry of entries) {
    const filePath = path.join(assetsDir, entry.file);
    assert.ok(fs.existsSync(filePath), `missing asset file ${entry.file}`);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(raw.id, entry.id, `asset id mismatch for ${entry.file}`);
    const problems = validateAsset(raw);
    assert.deepEqual(problems, [], `${entry.id}: validateAsset failed: ${problems.join('; ')}`);
  }
});

test('asset budgets: per-asset L0, L1, L2, and file size budgets (PLAN.md §7.5)', () => {
  for (const entry of entries) {
    const budget = budgetFor(entry.id);
    if (!budget) continue;

    const filePath = path.join(assetsDir, entry.file);
    const bytes = fs.statSync(filePath).size;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const l0Triangles = (raw.lod0?.parts || []).reduce((sum, p) => sum + p.triangleCount, 0);
    const l1Beads = raw.lod1 ? raw.lod1.count : 0;
    const l2Atoms = raw.lod2 ? raw.lod2.count : 0;

    if (budget.maxL0 !== undefined) {
      assert.ok(
        l0Triangles <= budget.maxL0,
        `${entry.id} (${budget.category}): L0 triangles ${l0Triangles} > ${budget.maxL0}`
      );
    }
    if (budget.maxL1 !== undefined) {
      assert.ok(
        l1Beads <= budget.maxL1,
        `${entry.id} (${budget.category}): L1 beads ${l1Beads} > ${budget.maxL1}`
      );
    }
    if (budget.maxL2 !== undefined) {
      assert.ok(
        l2Atoms <= budget.maxL2,
        `${entry.id} (${budget.category}): L2 atoms ${l2Atoms} > ${budget.maxL2}`
      );
    }
    assert.ok(
      bytes <= budget.maxBytes,
      `${entry.id} (${budget.category}): file size ${bytes} bytes > ${budget.maxBytes} bytes`
    );
  }
});

test('asset budgets: total manifest assets <= 3.0 MB and standalone HTML <= 7.5 MB', () => {
  let totalBytes = 0;
  for (const entry of entries) {
    totalBytes += fs.statSync(path.join(assetsDir, entry.file)).size;
  }
  assert.ok(
    totalBytes <= BUDGETS.totalAssetsBytes,
    `total manifest assets size ${totalBytes} bytes > ${BUDGETS.totalAssetsBytes} bytes (3.0 MB)`
  );

  if (fs.existsSync(standalonePath)) {
    const standaloneBytes = fs.statSync(standalonePath).size;
    assert.ok(
      standaloneBytes <= BUDGETS.standaloneBytes,
      `dist/helix-standalone.html size ${standaloneBytes} bytes > ${BUDGETS.standaloneBytes} bytes (7.5 MB)`
    );
  }
});
