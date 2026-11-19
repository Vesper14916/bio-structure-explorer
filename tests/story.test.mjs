// R3-S2 part b: story engine (docs/tasks/R3-ST3-design.md §4.4-§4.6, docs/CONTRACTS.md §7.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStory, stateAt, chapterAt, createWorldState, lastStarted, completedCount, progressOf } from '../js/sim/gene/story.js';
import { buildCoupledTimeline, contributeCoupled } from '../js/sim/gene/coupled.js';
import { contributeTx } from '../js/sim/gene/transcription.js';
import { contributeTl } from '../js/sim/gene/translation.js';
import { resolveChapterShot } from '../js/sim/gene/shots.js';
import { TRUE_SCALE_GENE_CONSTRUCT as C } from '../js/science/scenario.js';
import { decodeAsset } from '../js/assets/format.js';
import { mulberry32 } from '../js/sim/util.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ribo = decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', 'ribosome-70s.asset.json'), 'utf8')));
const assets = { 'ribosome-70s': ribo };
const storyMini = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'story-mini.json'), 'utf8'));

const seq = buildStory(C, assets);
const cpl = buildStory(C, assets, { mode: 'coupled', D: 48 });

const SCHEMA_KEYS = ['t', 'chapter', 'chapterProgress', 'caption', 'machines', 'dna', 'rna', 'ribosome', 'trnas', 'peptide', 'ntp', 'ppi', 'fx', 'counters', 'highlight', 'shot'];

function checkDefaults(s, story, t) {
  assert.deepEqual(Object.keys(s).sort(), [...SCHEMA_KEYS].sort());
  assert.equal(s.t, t);
  assert.equal(s.chapter, chapterAt(story, t));
  assert.equal(s.caption, s.chapter.caption);
  assert.ok(s.chapterProgress >= 0 && s.chapterProgress <= 1);
  assert.deepEqual(s.machines, []);
  assert.deepEqual(s.dna, { machineId: null, register: 45, bend: 0, bubble: [0, 0], relax: 0, trackBlend: 0 });
  assert.deepEqual(s.rna, { length: 0, addProgress: 0, hairpin: 0, released: false, layout: 'rnap', layoutBlend: 0 });
  assert.deepEqual(s.ribosome, { codon: 0, bound: false });
  assert.deepEqual(s.trnas, []);
  assert.deepEqual(s.peptide, { length: 0, attach: 'free', release: 0 });
  assert.deepEqual(s.ntp, { base: null, path: 0, bonded: false });
  assert.deepEqual(s.ppi, { path: 0, opacity: 0 });
  assert.deepEqual(s.fx, []);
  assert.deepEqual(Object.keys(s.counters), ['mrna', 'hybrid', 'codon', 'peptide']);
  assert.equal(s.highlight.codon, s.counters.codon === 0 ? null : s.counters.codon);
  assert.deepEqual(Object.keys(s.shot), ['id', 'from', 'blend']);
}

test('both modes build with the story shape and a JSON-safe, non-enumerable index', () => {
  for (const [story, mode, dur] of [[seq, 'sequential', 164.05], [cpl, 'coupled', 122.8]]) {
    assert.equal(story.mode, mode);
    assert.ok(Math.abs(story.duration - dur) < 1e-3);
    assert.deepEqual(Object.keys(story), ['mode', 'duration', 'chapters', 'events', 'meta']);
    assert.ok(story.index);
    assert.doesNotThrow(() => JSON.stringify(story));
    assert.ok(!JSON.stringify(story).includes('"index":{'));
  }
  const ct = buildCoupledTimeline(C, assets, { D: 48 });
  assert.equal(ct.chapters.length, 12);
  assert.equal(ct.meta.mode, 'coupled');
});

test('stateAt(0) and stateAt(duration) are valid WorldStates with the S2 defaults', () => {
  for (const story of [seq, cpl]) {
    for (const t of [0, story.duration]) {
      const s = stateAt(story, t);
      checkDefaults(s, story, t);
    }
    assert.equal(stateAt(story, 0).chapter.index, 0);
    assert.equal(stateAt(story, story.duration).chapter.index, story.chapters.length - 1);
    // clamping
    assert.equal(stateAt(story, -5).t, 0);
    assert.equal(stateAt(story, story.duration + 9).t, story.duration);
  }
  checkDefaults({ ...createWorldState(), t: 0, chapter: seq.chapters[0], caption: seq.chapters[0].caption, highlight: { codon: null } }, seq, 0);
});

test('plug points return out unchanged', () => {
  const out = createWorldState();
  const before = JSON.stringify(out);
  assert.equal(contributeTx(seq, 1, out), out);
  assert.equal(contributeTl(seq, 1, out), out);
  assert.equal(contributeCoupled(cpl, 1, out), out);
  assert.equal(JSON.stringify(out), before);
});

test('shot matches resolveChapterShot everywhere', () => {
  const out = createWorldState();
  for (const story of [seq, cpl]) {
    for (let t = 0; t <= story.duration; t += 0.37) {
      const s = stateAt(story, t, out);
      assert.deepEqual({ ...s.shot }, resolveChapterShot(s.chapter, s.t));
    }
  }
});

test('counters are monotonic over a forward sweep and reach the end values', () => {
  for (const story of [seq, cpl]) {
    const out = createWorldState();
    let prev = { mrna: 0, codon: 0, peptide: 0 };
    let sawHybridMax = 0;
    for (let t = 0; t <= story.duration + 1e-9; t += 0.02) {
      const c = stateAt(story, t, out).counters;
      assert.ok(c.mrna >= prev.mrna && c.codon >= prev.codon && c.peptide >= prev.peptide, `monotonic at ${t}`);
      assert.ok(c.hybrid <= 9 && c.hybrid <= c.mrna);
      sawHybridMax = Math.max(sawHybridMax, c.hybrid);
      prev = { mrna: c.mrna, codon: c.codon, peptide: c.peptide };
    }
    const e = stateAt(story, story.duration).counters;
    assert.deepEqual({ ...e }, { mrna: 179, hybrid: 0, codon: 41, peptide: 40 });
    assert.equal(sawHybridMax, 9);
  }
});

test('counter spot checks (sequential)', () => {
  const ch = seq.chapters;
  assert.equal(stateAt(seq, ch[3].t1).counters.mrna, 3); // end of chapter 4
  assert.equal(stateAt(seq, ch[4].t1).counters.mrna, 12); // end of chapter 5
  assert.equal(stateAt(seq, ch[5].t1).counters.mrna, 150); // end of chapter 6
  assert.equal(stateAt(seq, ch[5].t1).counters.hybrid, 9);
  assert.equal(stateAt(seq, ch[6].t1).counters.hybrid, 0); // after rna.release
  assert.equal(stateAt(seq, ch[7].t1).counters.peptide, 0);
  // peptide 1 right after the start pairing (chapter 9 codon.pair 1 completes at +4.5 s)
  assert.equal(stateAt(seq, ch[8].t0 + 4.4).counters.peptide, 0);
  assert.equal(stateAt(seq, ch[8].t0 + 4.5).counters.peptide, 1);
  assert.equal(stateAt(seq, ch[8].t0 + 4.5).counters.codon, 1);
  assert.equal(stateAt(seq, ch[8].t0 + 4.5).highlight.codon, 1);
  assert.equal(stateAt(seq, ch[10].t1).counters.codon, 2);
  assert.equal(stateAt(seq, ch[10].t1).counters.peptide, 1);
  assert.equal(stateAt(seq, ch[11].t1).counters.peptide, 2); // after chapter 12's bond
  // after codon 26's bond (cycle k starts at t0 + 1.1 (k-3), bond ends at +0.5)
  const t26 = ch[13].t0 + 1.1 * 23 + 0.5;
  assert.equal(stateAt(seq, t26 + 1e-6).counters.peptide, 26);
  assert.equal(stateAt(seq, t26 - 0.01).counters.peptide, 25);
  // codon 41 only once rf1 enter completes
  const rf1 = seq.events.find(e => e.type === 'factor.enter' && e.data.target === 'rf1');
  assert.equal(stateAt(seq, rf1.t1 - 0.01).counters.codon, 40);
  assert.equal(stateAt(seq, rf1.t1).counters.codon, 41);
});

test('determinism: random seeks equal the forward sweep (fresh and reused out)', () => {
  for (const story of [seq, cpl]) {
    const rnd = mulberry32(7);
    const times = Array.from({ length: 1000 }, () => rnd() * story.duration);
    times.push(0, story.duration);
    const sorted = [...times].sort((a, b) => a - b);
    const expected = new Map();
    const sweepOut = createWorldState();
    for (const t of sorted) expected.set(t, JSON.stringify(stateAt(story, t, sweepOut)));
    const reused = createWorldState();
    for (const t of times) {
      assert.equal(JSON.stringify(stateAt(story, t)), expected.get(t), `fresh at ${t}`);
      assert.equal(JSON.stringify(stateAt(story, t, reused)), expected.get(t), `reused at ${t}`);
    }
  }
});

function sweepTimes(story, n) {
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 0.6180339887 % 1) * story.duration;
  return a;
}

test('allocation: heap growth over 10,000 reused-out calls is at most 1 MB (median of 5)', () => {
  const out = createWorldState();
  const times = sweepTimes(seq, 10000);
  for (let i = 0; i < 2000; i++) stateAt(seq, times[i], out);
  const growth = [];
  for (let rep = 0; rep < 5; rep++) {
    if (global.gc) global.gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10000; i++) stateAt(seq, times[i], out);
    growth.push(process.memoryUsage().heapUsed - h0);
  }
  growth.sort((a, b) => a - b);
  console.log(`# stateAt heap growth per 10,000 calls (bytes): ${growth.join(', ')}`);
  assert.ok(growth[2] <= 1024 * 1024, `median growth ${growth[2]} bytes`);
});

test('timing: median stateAt is at most 2 ms', () => {
  const out = createWorldState();
  const times = sweepTimes(seq, 3000);
  for (let i = 0; i < 500; i++) stateAt(seq, times[i], out);
  const dts = [];
  for (let i = 0; i < times.length; i++) {
    const a = process.hrtime.bigint();
    stateAt(seq, times[i], out);
    dts.push(Number(process.hrtime.bigint() - a) / 1e6);
  }
  dts.sort((a, b) => a - b);
  console.log(`# stateAt median ${dts[dts.length >> 1].toFixed(5)} ms, p99 ${dts[Math.floor(dts.length * 0.99)].toFixed(5)} ms`);
  assert.ok(dts[dts.length >> 1] <= 2);
});

test('chapterAt boundaries and clamping', () => {
  for (const story of [seq, cpl]) {
    const n = story.chapters.length;
    assert.equal(chapterAt(story, -1), story.chapters[0]);
    assert.equal(chapterAt(story, 0), story.chapters[0]);
    for (let i = 1; i < n; i++) {
      const b = story.chapters[i].t0;
      assert.equal(chapterAt(story, b), story.chapters[i], `at boundary ${i}`);
      assert.equal(chapterAt(story, b - 1e-6), story.chapters[i - 1]);
    }
    assert.equal(chapterAt(story, story.duration), story.chapters[n - 1]);
    assert.equal(chapterAt(story, story.duration + 100), story.chapters[n - 1]);
    const mid = story.chapters[3];
    assert.equal(chapterAt(story, (mid.t0 + mid.t1) / 2), mid);
  }
});

test('lastStarted / completedCount / progressOf agree with brute force', () => {
  for (const story of [seq, cpl]) {
    const rnd = mulberry32(11);
    const pairs = [...new Set(story.events.map(e => `${e.type}|${e.data.target}`))].map(s => s.split('|'));
    for (let k = 0; k < 500; k++) {
      const [type, targetStr] = pairs[Math.floor(rnd() * pairs.length)];
      const target = rnd() < 0.3 ? null : targetStr;
      const t = rnd() * story.duration;
      const match = story.events.map((e, i) => [e, i]).filter(([e]) => e.type === type && (target === null || e.data.target === target));
      let last = -1;
      for (const [e, i] of match) if (e.t0 <= t) last = i; // events are sorted by (t0, id)
      assert.equal(lastStarted(story, type, target, t), last, `lastStarted ${type} ${target} ${t}`);
      assert.equal(completedCount(story, type, target, t), match.filter(([e]) => e.t1 <= t).length);
      if (last >= 0) {
        const e = story.events[last];
        const exp = e.t1 > e.t0 ? Math.min(1, Math.max(0, (t - e.t0) / (e.t1 - e.t0))) : 1;
        assert.equal(progressOf(story, last, t), exp);
      }
    }
    assert.equal(lastStarted(story, 'no.such.type', null, 5), -1);
    assert.equal(completedCount(story, 'bond.peptide', 'nobody', 5), 0);
  }
});

test('fixture story-mini loads through opts.timeline and evaluates', () => {
  const story = buildStory(C, {}, { timeline: storyMini });
  assert.equal(story.duration, storyMini.duration);
  assert.equal(story.chapters, storyMini.chapters);
  const out = createWorldState();
  for (let t = 0; t <= story.duration; t += 0.05) {
    const s = stateAt(story, t, out);
    assert.equal(s.caption, chapterAt(story, t).caption);
    assert.equal(s.caption, storyMini.chapters.find(c => t >= c.t0 && (t < c.t1 || c.t1 === storyMini.duration)).caption);
    assert.ok(Number.isFinite(s.chapterProgress));
  }
  assert.ok(stateAt(story, story.duration).counters.mrna >= 0);
});

test('caption substitution: {N} = 26 in chapter 14; coupled caption 8 carries D', () => {
  assert.ok(seq.chapters[13].caption.includes('after about 26 residues'));
  assert.equal(stateAt(seq, seq.chapters[13].t0 + 1).caption, seq.chapters[13].caption);
  for (const story of [seq, cpl]) for (const c of story.chapters) assert.ok(!c.caption.includes('{'), c.caption);
  assert.ok(cpl.chapters[7].caption.includes('48 nucleotides'));
  const cpl60 = buildStory(C, assets, { mode: 'coupled', D: 60 });
  assert.ok(cpl60.chapters[7].caption.includes('60 nucleotides'));
});

test('shot.from carries the previous chapter shot across chapter boundaries', async () => {
  const { buildStory, stateAt } = await import('../js/sim/gene/story.js');
  const { TRUE_SCALE_GENE_CONSTRUCT } = await import('../js/science/scenario.js');
  for (const mode of ['sequential', 'coupled']) {
    const s = buildStory(TRUE_SCALE_GENE_CONSTRUCT, {}, { mode });
    assert.equal(stateAt(s, 0).shot.from, null);
    for (let i = 1; i < s.chapters.length; i++) {
      const prev = s.chapters[i - 1].shots, w = stateAt(s, s.chapters[i].t0 + 1e-6);
      assert.equal(w.shot.from, prev[prev.length - 1].id, `${mode} chapter ${s.chapters[i].id}`);
    }
  }
});
