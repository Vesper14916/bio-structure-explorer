// Asset format v1: round-trip, validator, and the committed synthetic fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodePositions, decodePositions, encodeArray, decodeArray, validateAsset, decodeAsset, trackFrame, QUANT_STEP } from '../js/assets/format.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../assets/fixture-machine.asset.json', import.meta.url), 'utf8'));

test('positions round-trip within half a quantisation step', () => {
  const xyz = [0, 1.234, -77.77, 512.3, -1000.01, 3.38];
  const back = decodePositions(encodePositions(xyz));
  xyz.forEach((v, i) => assert.ok(Math.abs(back[i] - v) <= QUANT_STEP / 2 + 1e-6));
  assert.throws(() => encodePositions([5000]));
  assert.deepEqual(Array.from(decodeArray(encodeArray(Uint16Array.from([1, 65535, 7])), Uint16Array)), [1, 65535, 7]);
});

test('fixture asset validates and decodes', () => {
  assert.deepEqual(validateAsset(fixture), []);
  const a = decodeAsset(fixture);
  assert.equal(a.lod1.count, 630);
  assert.equal(a.lod0.length, 2);
  assert.equal(a.lod2.bonds.length, 59 * 2);
  assert.deepEqual(trackFrame(a.tracks.template, 0).o, [0, 0, 0]);
  assert.equal(trackFrame(a.tracks.template, 99), null);
});

test('validator rejects broken assets', () => {
  const bad = structuredClone(fixture);
  bad.anchors.activeSite.R = [2, 0, 0, 0, 1, 0, 0, 0, 1];
  bad.tracks.template.registers[3] = 99;
  bad.chains[0].class = 'lipid';
  const problems = validateAsset(bad);
  assert.ok(problems.some(m => m.includes('activeSite')));
  assert.ok(problems.some(m => m.includes('consecutive')));
  assert.ok(problems.some(m => m.includes('bad class')));
});
