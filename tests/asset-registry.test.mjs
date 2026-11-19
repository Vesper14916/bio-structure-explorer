// Asset registry tests: Node disk loading, simulated browser fetch loading, and inlined standalone store.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAssets, loadAsset, loadManifest, clearAssetCache } from '../js/assets/registry.js';

const fixtureRaw = JSON.parse(fs.readFileSync(new URL('../assets/fixture-machine.asset.json', import.meta.url), 'utf8'));
const manifestRaw = JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));

test('registry loads manifest and decodes assets from disk in Node', async () => {
  clearAssetCache();
  const manifest = await loadManifest();
  assert.ok(manifest.assets.some(a => a.id === 'fixture-machine'));
  assert.ok(manifest.assets.some(a => a.id === 'rnap-ec'));
  assert.ok(manifest.assets.some(a => a.id === 'rnap-holo'));

  const loaded = await loadAssets(['fixture-machine', 'rnap-ec']);
  assert.deepEqual(Object.keys(loaded).sort(), ['fixture-machine', 'rnap-ec']);
  assert.equal(loaded['fixture-machine'].version, 2);
  assert.equal(loaded['fixture-machine'].paths.channel.count, 16);
  assert.equal(loaded['rnap-ec'].version, 1);
  assert.ok(loaded['rnap-ec'].lod1.positions instanceof Float32Array);

  // Cache returns identical object reference on repeat load
  const cached = await loadAsset('rnap-ec');
  assert.equal(cached, loaded['rnap-ec']);
});

test('registry loads from inlined window.__HELIX_ASSETS__ without disk or network', async () => {
  clearAssetCache();
  const prev = globalThis.__HELIX_ASSETS__;
  globalThis.__HELIX_ASSETS__ = { 'fixture-machine': fixtureRaw };
  try {
    const map = await loadAssets(['fixture-machine'], { noCache: true });
    assert.equal(map['fixture-machine'].id, 'fixture-machine');
    assert.equal(map['fixture-machine'].lod2.sites.length, 2);
  } finally {
    if (prev === undefined) delete globalThis.__HELIX_ASSETS__;
    else globalThis.__HELIX_ASSETS__ = prev;
  }
});

test('registry loads via fetch in browser mode', async () => {
  clearAssetCache();
  const requested = [];
  const fakeFetch = async url => {
    requested.push(url);
    if (url.endsWith('manifest.json')) return { ok: true, status: 200, json: async () => manifestRaw };
    if (url.endsWith('fixture-machine.asset.json')) return { ok: true, status: 200, json: async () => fixtureRaw };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const map = await loadAssets(['fixture-machine'], { baseUrl: 'https://example.local/assets/', fetch: fakeFetch });
  assert.equal(map['fixture-machine'].id, 'fixture-machine');
  assert.deepEqual(requested, [
    'https://example.local/assets/manifest.json',
    'https://example.local/assets/fixture-machine.asset.json',
  ]);
  await assert.rejects(() => loadAsset('does-not-exist', { baseUrl: 'https://example.local/assets/', fetch: fakeFetch }), /unknown asset id/);
});
