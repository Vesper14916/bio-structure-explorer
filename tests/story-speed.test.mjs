// R3-INT3 / Gate G3: playback speed must not change the content shown at a given story time
// (PLAN.md §12 G3: "4× speed and 0.5× speed are identical in content at the same story time").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../js/assets/format.js';
import { TRUE_SCALE_GENE_CONSTRUCT as SCENARIO } from '../js/science/index.js';
import { createStoryScene } from '../js/scene/story-scene.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['rnap-holo', 'rnap-ec', 'nusg', 'ribosome-70s', 'trna-init', 'trna-aa', 'if1', 'if2', 'if3', 'ef-tu', 'ef-g', 'rf1'];
const ASSETS = Object.fromEntries(IDS.map(id => [id, decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')))]));

/** Minimal stand-in for the viewer: records what the scene hands to it. */
function stubViewer() {
  const calls = { actors: null, fx: null, labels: null, crowd: null };
  return {
    calls,
    getState: () => ({ quality: 'high', tier: 'high' }),
    setActors: a => { calls.actors = JSON.stringify(a.map(x => ({ id: x.id, transform: x.transform, opacity: x.opacity, visible: x.visible, parts: x.parts }))); },
    setFx: f => { calls.fx = JSON.stringify(f); },
    setLabels: l => { calls.labels = JSON.stringify(l); },
    setCrowd: c => { calls.crowd = c.length; },
    on: () => () => {},
    off: () => {},
  };
}

function snapshot(scene, viewer) {
  const pos = scene.target.asm.atoms.pos;
  return {
    world: JSON.stringify(scene.world, (k, v) => (k.startsWith('_') ? undefined : v)),
    pos: Array.from(pos.subarray(0, pos.length)),
    actors: viewer.calls.actors,
    fx: viewer.calls.fx,
  };
}

function playTo(scene, from, to, speed, dt) {
  scene.setSpeed(speed);
  scene.seek(from, { instantCamera: true });
  scene.play();
  const n = Math.round((to - from) / (dt * speed));
  for (let i = 0; i < n; i++) scene.tick(dt);
  scene.pause();
}

test('G3: the content at a story time is the same after playing at 0.5×, 1× and 4×, and after a direct seek', () => {
  for (const target of [20.5, 80, 118.4, 160]) {
    const results = [];
    for (const [speed, dt] of [[0.5, 0.1], [1, 0.1], [4, 0.1]]) {
      const v = stubViewer();
      const scene = createStoryScene(v, { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high', maxTime: 1e9 });
      // Reach `target` by playing from 10 s before it, then land on it exactly (the last tick rounds to the grid).
      playTo(scene, target - 10, target, speed, dt);
      scene.seek(target, { instantCamera: true });
      results.push(snapshot(scene, v));
      scene.dispose();
    }
    const v0 = stubViewer();
    const direct = createStoryScene(v0, { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high', maxTime: 1e9 });
    direct.seek(target, { instantCamera: true });
    results.push(snapshot(direct, v0));
    for (let i = 1; i < results.length; i++) {
      assert.equal(results[i].world, results[0].world, `world state at ${target} s differs (run ${i})`);
      assert.deepEqual(results[i].pos, results[0].pos, `atom positions at ${target} s differ (run ${i})`);
      assert.equal(results[i].actors, results[0].actors, `actor transforms at ${target} s differ (run ${i})`);
      assert.equal(results[i].fx, results[0].fx, `fx at ${target} s differ (run ${i})`);
    }
  }
});

test('the scene reaches the end of the story: the last shown time is duration − 1 ms and the peptide is released', () => {
  const v = stubViewer();
  const scene = createStoryScene(v, { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high' });
  assert.ok(Math.abs(scene.maxTime - (scene.story.duration - 1e-3)) < 1e-9);
  scene.seek(scene.story.duration + 10, { instantCamera: true });
  assert.equal(scene.world.peptide.length, 40);
  assert.equal(scene.world.peptide.release, 1);
  assert.ok(scene.world.machines.some(m => m.id === 'ribosome'), 'finale still shows the ribosome');
  assert.equal(scene.state().progress > 0.999, true);
  scene.dispose();
});

test('the Crowding toggle and quality tier drive viewer.setCrowd', () => {
  const v = stubViewer();
  const scene = createStoryScene(v, { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high' });
  assert.equal(v.calls.crowd, 3, 'three crowder batches (ribosome, EF-Tu, RNAP) at high');
  scene.setToggles({ crowding: false });
  assert.equal(v.calls.crowd, 0);
  scene.setToggles({ crowding: true });
  assert.equal(v.calls.crowd, 3);
  scene.dispose();
});

test('G3: the peptide emerges from tunnelExit during chapter 14 and stands at least 40 Å outside it before chapter 15 ends', () => {
  const v = stubViewer();
  const scene = createStoryScene(v, { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high' });
  const chapters = scene.story.chapters;
  const ch15 = chapters[14];
  const ribo = ASSETS['ribosome-70s'];
  const ea = ribo.anchors.tunnelExit;
  /** Largest distance (Å) of a peptide atom beyond the tunnelExit plane, along the exit axis (anchor frame z). */
  function beyondExit(t) {
    scene.seek(t, { instantCamera: true });
    const m = scene.world.machines.find(x => x.id === 'ribosome');
    const { o, R } = m.transform;
    const rot = (a) => [R[0] * a[0] + R[1] * a[1] + R[2] * a[2], R[3] * a[0] + R[4] * a[1] + R[5] * a[2], R[6] * a[0] + R[7] * a[1] + R[8] * a[2]];
    const rl = rot(ea.o);
    const ex = [o[0] + rl[0], o[1] + rl[1], o[2] + rl[2]];
    const axis = rot([ea.R[2], ea.R[5], ea.R[8]]);
    const g = scene.target.groups.find(x => x.id === 'peptide');
    let best = -Infinity;
    for (let i = 0; i < g.count; i++) {
      const d = (g.pos[3 * i] - ex[0]) * axis[0] + (g.pos[3 * i + 1] - ex[1]) * axis[1] + (g.pos[3 * i + 2] - ex[2]) * axis[2];
      if (d > best) best = d;
    }
    return best;
  }
  assert.ok(beyondExit(chapters[13].t0 + 1) < 0, 'at the start of chapter 14 the short peptide is still inside the tunnel');
  assert.ok(beyondExit(ch15.t0 - 1e-3) >= 40, 'the peptide protrudes ≥ 40 Å from tunnelExit at the end of chapter 14');
  assert.ok(beyondExit(ch15.t1 - 1e-3) >= 40, 'and still does at the end of chapter 15');
  scene.dispose();
});
