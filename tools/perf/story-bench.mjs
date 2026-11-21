#!/usr/bin/env node
// R3-Q2 Node benchmark: `stateAt` (js/sim/gene/story.js) and `poser.pose` (js/kin/pose.js, createPoser).
//
// Samples 2,000 evenly spaced story times, t_i = duration * i / 1999 for i = 0..1999 (both ends included),
// for the Step by step story and the Coupled story. A warm-up pass (every 10th time, untimed) runs first.
// Each sample times `stateAt(story, t, world)` and `poser.pose(world, target)` separately, reusing one
// WorldState and one target object, as js/scene/story-scene.js does.
//
// Budgets (PLAN.md §8.2, §8.3): median stateAt <= 2 ms and median pose <= 6 ms.
// Exit code 1 when a measured story breaks a budget; otherwise 0.
// Quantiles use linear interpolation between order statistics (type 7).
// Output: a table on stdout, and docs/evidence/r3/Q2/story-bench.json.
// Usage: node tools/perf/story-bench.mjs   (or `npm run perf`)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../../js/assets/format.js';
import { Assembly, TRUE_SCALE_GENE_CONSTRUCT as SCENARIO } from '../../js/science/index.js';
import { buildStory, stateAt, createWorldState } from '../../js/sim/gene/story.js';
import { createPoser } from '../../js/kin/pose.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FILE = path.join(root, 'docs', 'evidence', 'r3', 'Q2', 'story-bench.json');
const SAMPLES = 2000;
const WARMUP_STRIDE = 10;
const BUDGET_MS = { stateAtMedian: 2, poseMedian: 6 };

// All twelve assets: chapters 8-16 need the translation set and the transcription set (as in tests/story-tl.test.mjs).
const ASSET_IDS = ['rnap-holo', 'rnap-ec', 'nusg', 'ribosome-70s', 'trna-init', 'trna-aa', 'ef-tu', 'ef-g', 'if1', 'if2', 'if3', 'rf1'];
const ASSETS = Object.fromEntries(ASSET_IDS.map(id => [
  id,
  decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8'))),
]));

/** Linear-interpolated quantile of an ascending-sorted array. */
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function summarize(values) {
  const sorted = Float64Array.from(values).sort();
  return {
    medianMs: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
    samples: values.length,
  };
}

/** Evenly spaced story times, both ends included. */
function sampleTimes(duration, count) {
  const times = new Float64Array(count);
  for (let i = 0; i < count; i++) times[i] = (duration * i) / (count - 1);
  return times;
}

/** Benchmark one story. Throws on any error so the caller can record it. */
function benchStory(story) {
  const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
  const world = createWorldState();
  const target = {
    asm: new Assembly(),
    groups: [],
    actors: [],
    fx: { pulses: [], flashes: [] },
    focus: { center: [0, 0, 0], radius: 32 },
  };
  const times = sampleTimes(story.duration, SAMPLES);

  // Warm-up: untimed, covers the whole story at a coarser stride.
  for (let i = 0; i < SAMPLES; i += WARMUP_STRIDE) {
    stateAt(story, times[i], world);
    poser.pose(world, target);
  }

  const stateMs = new Array(SAMPLES);
  const poseMs = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    stateAt(story, times[i], world);
    const t1 = performance.now();
    poser.pose(world, target);
    const t2 = performance.now();
    stateMs[i] = t1 - t0;
    poseMs[i] = t2 - t1;
  }
  const stateAtStats = summarize(stateMs);
  const poseStats = summarize(poseMs);
  return {
    duration: story.duration,
    chapters: story.chapters.length,
    events: story.events.length,
    stateAt: stateAtStats,
    pose: poseStats,
    pass: stateAtStats.medianMs <= BUDGET_MS.stateAtMedian && poseStats.medianMs <= BUDGET_MS.poseMedian,
  };
}

const f = v => v.toFixed(4);
const rows = [];
const stories = {};
let failed = false;

for (const [key, label, mode] of [['sequential', 'Step by step', 'sequential'], ['coupled', 'Coupled', 'coupled']]) {
  try {
    const story = buildStory(SCENARIO, ASSETS, { mode });
    const result = benchStory(story);
    stories[key] = { label, mode, ...result };
    rows.push([label, 'stateAt', result.stateAt, BUDGET_MS.stateAtMedian]);
    rows.push([label, 'pose', result.pose, BUDGET_MS.poseMedian]);
    if (!result.pass) failed = true;
  } catch (err) {
    stories[key] = { label, mode, skipped: true, error: String(err && err.message ? err.message : err) };
    console.log(`${label}: SKIPPED (${stories[key].error})`);
  }
}

console.log(`story-bench: ${SAMPLES} evenly spaced times per story, warm-up stride ${WARMUP_STRIDE}, node ${process.version}`);
console.log('Story           Function  Median ms   p95 ms     Max ms     Budget  Result');
for (const [label, fn, s, budget] of rows) {
  const ok = s.medianMs <= budget;
  console.log(
    `${label.padEnd(15)} ${fn.padEnd(9)} ${f(s.medianMs).padStart(9)}  ${f(s.p95Ms).padStart(9)}  ${f(s.maxMs).padStart(9)}  ` +
    `median <= ${String(budget).padEnd(2)} ${ok ? 'PASS' : 'FAIL'}`,
  );
}

const result = failed ? 'FAIL' : 'PASS';
console.log(`STORY-BENCH ${result}${failed ? ': median budget exceeded (stateAt <= 2 ms, pose <= 6 ms)' : ''}`);

const json = {
  task: 'R3-Q2',
  generatedAt: new Date().toISOString(),
  node: process.version,
  cpu: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
  samples: SAMPLES,
  timeSpacing: 't_i = duration * i / (samples - 1), i = 0..samples-1',
  warmup: { stride: WARMUP_STRIDE, timed: false },
  budgetsMs: { stateAtMedian: BUDGET_MS.stateAtMedian, poseMedian: BUDGET_MS.poseMedian },
  stories,
  result,
};
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(json, null, 2)}\n`);
console.log(`wrote ${path.relative(root, OUT_FILE)}`);
process.exitCode = failed ? 1 : 0;
