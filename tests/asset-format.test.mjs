// Asset format v1 & v2: round-trip, validator, v1/v2 compatibility, and the committed synthetic fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  encodePositions, decodePositions, encodeArray, decodeArray,
  validateAsset, decodeAsset, trackFrame, QUANT_STEP, ASSET_VERSION, PART_ROLES,
} from '../js/assets/format.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../assets/fixture-machine.asset.json', import.meta.url), 'utf8'));
const rnapEc = JSON.parse(fs.readFileSync(new URL('../assets/rnap-ec.asset.json', import.meta.url), 'utf8'));

function makeV1Sample(v2Asset) {
  const v1 = structuredClone(v2Asset);
  v1.version = 1;
  delete v1.paths;
  for (const p of v1.parts) delete p.role;
  if (v1.lod2 && Array.isArray(v1.lod2.sites) && v1.lod2.sites.length) {
    v1.lod2.anchor = v1.lod2.sites[0].anchor;
    v1.lod2.radius = v1.lod2.sites[0].radius;
    delete v1.lod2.sites;
  }
  return v1;
}
const v1Sample = makeV1Sample(rnapEc);

test('positions round-trip within half a quantisation step', () => {
  const xyz = [0, 1.234, -77.77, 512.3, -1000.01, 3.38];
  const back = decodePositions(encodePositions(xyz));
  xyz.forEach((v, i) => assert.ok(Math.abs(back[i] - v) <= QUANT_STEP / 2 + 1e-6));
  assert.throws(() => encodePositions([5000]));
  assert.deepEqual(Array.from(decodeArray(encodeArray(Uint16Array.from([1, 65535, 7])), Uint16Array)), [1, 65535, 7]);
});

test('v2 fixture asset validates and decodes paths, multi-site lod2, and part roles', () => {
  assert.equal(fixture.version, ASSET_VERSION);
  assert.equal(fixture.version, 2);
  assert.deepEqual(validateAsset(fixture), []);
  const a = decodeAsset(fixture);
  assert.equal(a.version, 2);
  assert.equal(a.lod1.count, 630);
  assert.equal(a.lod0.length, 2);
  assert.equal(a.lod2.bonds.length, 59 * 2);
  assert.equal(a.lod2.sites.length, 2);
  assert.deepEqual(a.lod2.sites, [{ anchor: 'activeSite', radius: 12 }, { anchor: 'rnaExit', radius: 8 }]);
  // Backwards-compatible convenience fields mirror sites[0]
  assert.equal(a.lod2.anchor, 'activeSite');
  assert.equal(a.lod2.radius, 12);
  assert.deepEqual(a.parts.map(p => p.role), ['body', 'release']);
  assert.ok(a.paths.channel);
  assert.equal(a.paths.channel.count, 16);
  assert.equal(a.paths.channel.points.length, 16 * 3);
  assert.equal(a.paths.channel.synthetic, 1);
  assert.deepEqual(trackFrame(a.tracks.template, 0).o, [0, 0, 0]);
  assert.equal(trackFrame(a.tracks.template, 99), null);
});

test('v1 assets remain valid and decode with normalized lod2.sites and empty paths', () => {
  assert.equal(v1Sample.version, 1);
  assert.deepEqual(validateAsset(v1Sample), []);
  const d = decodeAsset(v1Sample);
  assert.equal(d.version, 1);
  assert.deepEqual(d.paths, {});
  assert.equal(d.lod2.sites.length, 1);
  assert.equal(d.lod2.sites[0].anchor, v1Sample.lod2.anchor);
  assert.equal(d.lod2.sites[0].radius, v1Sample.lod2.radius);
  assert.equal(d.parts[0].role, 'body');
});

test('validator rejects broken v1 and v2 assets', () => {
  const bad = structuredClone(fixture);
  bad.anchors.activeSite.R = [2, 0, 0, 0, 1, 0, 0, 0, 1];
  bad.tracks.template.registers[3] = 99;
  bad.tracks.template.synthetic[0] = '7K00';
  bad.chains[0].class = 'lipid';
  bad.parts[0].role = 'catalyst';
  bad.lod2.sites.push({ anchor: 'nonexistent', radius: -5 });
  bad.paths.channel.count = 10;
  bad.paths.channel.synthetic = 2;
  const problems = validateAsset(bad);
  assert.ok(problems.some(m => m.includes('activeSite')));
  assert.ok(problems.some(m => m.includes('consecutive')));
  assert.ok(problems.some(m => m.includes('synthetic entries must be 0 or 1')));
  assert.ok(problems.some(m => m.includes('bad class')));
  assert.ok(problems.some(m => m.includes('bad role')));
  assert.ok(problems.some(m => m.includes('unknown anchor')));
  assert.ok(problems.some(m => m.includes('radius must be > 0')));
  assert.ok(problems.some(m => m.includes('points length mismatch')));
  assert.ok(problems.some(m => m.includes('path channel: synthetic')));
  assert.deepEqual(PART_ROLES, ['body', 'replaceable', 'release']);

  // v2 must not bypass lod2.sites using legacy v1 lod2.anchor
  const v2Legacy = structuredClone(fixture);
  delete v2Legacy.lod2.sites;
  v2Legacy.lod2.anchor = 'activeSite';
  v2Legacy.lod2.radius = 12;
  assert.ok(validateAsset(v2Legacy).some(m => m.includes('lod2.sites missing')));

  // v2 empty sites array rejected
  const v2EmptySites = structuredClone(fixture);
  v2EmptySites.lod2.sites = [];
  assert.ok(validateAsset(v2EmptySites).some(m => m.includes('non-empty array')));

  // v1 invalid lod2.anchor / lod2.radius rejected
  const v1BadLod2 = structuredClone(v1Sample);
  v1BadLod2.lod2.anchor = 'missingAnchor';
  v1BadLod2.lod2.radius = 0;
  const v1Problems = validateAsset(v1BadLod2);
  assert.ok(v1Problems.some(m => m.includes('unknown anchor')));
  assert.ok(v1Problems.some(m => m.includes('lod2.radius must be > 0')));
});
