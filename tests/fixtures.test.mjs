import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Construct v3 transcript from PLAN.md §5.1 (DNA [45, 224), 179 nt, TSS +1 at DNA index 45).
const CONSTRUCT_V3_TSS = 45;
const CONSTRUCT_V3_MIDPOINT_BP = 124;
const B_DNA_RISE_A = 3.38;
const CONSTRUCT_V3_TRANSCRIPT =
  'ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUACCCUGGUUCGUAACAUCCACUGGGAACUGACUAAAGUUAUGGACCGCUGCACCAACCUGGCGGAAAAGAUCCACGGCUCUUACCUGUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU';

// Exact captions from PLAN.md §6.2 (plain text for UI textContent).
const CAPTIONS = {
  1: 'A 248-base-pair gene in a patch of E. coli cytoplasm. Everything here is at true scale, built from experimental structures.',
  2: 'RNA polymerase holoenzyme scans the DNA. Its σ⁷⁰ subunit (violet) recognises the −35 TTGACA and −10 TATAAT promoter elements.',
  3: 'σ⁷⁰ melts about 13 base pairs around the start site. The template strand enters the active site and the DNA bends sharply.',
  6: 'The polymerase reads the template 3′→5′ and builds RNA 5′→3′. About nine base pairs of RNA·DNA hybrid stay inside; the DNA re-closes behind.',
};

// Complete event type allowlist from PLAN.md §8.2.
const VALID_EVENT_TYPES = new Set([
  'machine.move',
  'machine.bind',
  'part.release',
  'dna.open',
  'dna.close',
  'dna.relax',
  'ntp.enter',
  'bond.phosphodiester',
  'ppi.leave',
  'rna.hairpin',
  'rna.release',
  'mrna.layout',
  'ribosome.bind',
  'ribosome.join',
  'factor.enter',
  'factor.leave',
  'gtp.hydrolyse',
  'trna.enter',
  'trna.move',
  'trna.leave',
  'codon.pair',
  'bond.peptide',
  'translocate',
  'peptide.release',
  'couple.lock',
  'couple.unlock',
]);

const VALID_GROUPS = new Set(['O', 'T', 'I', 'E']);

const VALID_SHOTS = new Set([
  'wide',
  'rnap-side',
  'rnap-active',
  'rnap-follow',
  'rnap-exit',
  'ribo-30s',
  'ribo-decode',
  'ribo-side',
  'ribo-ptc',
  'ribo-tunnel',
  'ribo-exit',
  'coupled-wide',
  'coupled-follow',
]);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8'));
}

function assertOrthonormalRotation(R, label, eps = 1e-4) {
  assert.ok(Array.isArray(R) && R.length === 9, `${label}: R must be a 9-element array`);
  for (const v of R) {
    assert.ok(typeof v === 'number' && Number.isFinite(v), `${label}: R entries must be finite numbers`);
  }
  // Check R^T * R = I (row-major 3x3).
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let dot = 0;
      for (let k = 0; k < 3; k++) {
        dot += R[k * 3 + i] * R[k * 3 + j];
      }
      const expected = i === j ? 1 : 0;
      assert.ok(
        Math.abs(dot - expected) < eps,
        `${label}: (R^T R)[${i},${j}] = ${dot}, expected ${expected}`
      );
    }
  }
  const det =
    R[0] * (R[4] * R[8] - R[5] * R[7]) -
    R[1] * (R[3] * R[8] - R[5] * R[6]) +
    R[2] * (R[3] * R[7] - R[4] * R[6]);
  assert.ok(Math.abs(det - 1) < eps, `${label}: det(R) = ${det}, expected +1`);
}

function assertTransform(tf, label) {
  assert.ok(tf && typeof tf === 'object', `${label}: transform must be an object`);
  assert.ok(Array.isArray(tf.o) && tf.o.length === 3, `${label}: o must be a 3-element array`);
  for (const v of tf.o) {
    assert.ok(typeof v === 'number' && Number.isFinite(v), `${label}: o entries must be finite numbers`);
  }
  assertOrthonormalRotation(tf.R, label);
}

test('world-state.json includes every PLAN.md §8.2 WorldState field with valid types', () => {
  const ws = readJson('world-state.json');

  const requiredKeys = [
    't',
    'chapter',
    'chapterProgress',
    'caption',
    'machines',
    'dna',
    'rna',
    'ribosome',
    'trnas',
    'peptide',
    'ntp',
    'ppi',
    'fx',
    'counters',
    'highlight',
    'shot',
  ];
  for (const key of requiredKeys) {
    assert.ok(key in ws, `missing top-level WorldState field: ${key}`);
  }

  assert.equal(ws.t, 42.75);
  assert.equal(ws.chapterProgress, 0.5);
  assert.deepEqual(ws.chapter, {
    index: 5,
    id: 'elongate-tx',
    title: 'Elongation',
    group: 'T',
    t0: 32.4,
    t1: 53.1,
    shot: 'rnap-follow',
    caption: CAPTIONS[6],
  });
  assert.equal(ws.caption, CAPTIONS[6]);
  assert.ok(ws.caption.length <= 230, 'caption must be <= 230 characters (PLAN.md §4.1)');
  assert.ok(Math.abs(ws.t - (ws.chapter.t0 + ws.chapter.t1) / 2) < 1e-9);

  assert.ok(Array.isArray(ws.machines) && ws.machines.length >= 1);
  assert.ok(Array.isArray(ws.trnas));
  assert.ok(Array.isArray(ws.fx));
  assert.ok(VALID_SHOTS.has(ws.shot.id));
  assert.equal(ws.shot.id, ws.chapter.shot);
  assert.equal(ws.shot.from, null);
  assert.equal(ws.shot.blend, 1);
});

test('world-state.json machines have valid orthonormal transforms and RNAP placement', () => {
  const ws = readJson('world-state.json');
  for (const m of ws.machines) {
    assert.equal(typeof m.id, 'string');
    assert.equal(typeof m.assetId, 'string');
    assertTransform(m.transform, `machine ${m.id}`);
    assert.equal(typeof m.opacity, 'number');
    assert.ok(m.opacity >= 0 && m.opacity <= 1);
    assert.equal(typeof m.visible, 'boolean');
    assert.equal(typeof m.label, 'string');
    assert.equal(typeof m.pickable, 'boolean');
    assert.ok(m.parts && typeof m.parts === 'object');
    for (const [partId, part] of Object.entries(m.parts)) {
      assert.equal(typeof part.visible, 'boolean');
      assert.equal(typeof part.opacity, 'number');
      assert.ok(part.opacity >= 0 && part.opacity <= 1);
      if (part.transform) {
        assertTransform(part.transform, `machine ${m.id} part ${partId}`);
      }
    }
  }

  const rnap = ws.machines.find((m) => m.id === 'rnap');
  assert.ok(rnap, 'rnap machine must be present');
  assert.equal(rnap.assetId, 'rnap-ec');
  assert.equal(rnap.label, 'RNA polymerase');
  assert.equal(rnap.pickable, true);
  assert.ok(rnap.parts.core, 'rnap core part must be present');

  const expectedX = (ws.dna.register - CONSTRUCT_V3_MIDPOINT_BP) * B_DNA_RISE_A;
  assert.ok(
    Math.abs(rnap.transform.o[0] - expectedX) < 1e-4,
    `rnap origin x (${rnap.transform.o[0]}) should equal (${ws.dna.register} - 124) * 3.38 = ${expectedX}`
  );
  // Local +z (column 2 of R) must point along world +x (downstream gene axis).
  assert.ok(Math.abs(rnap.transform.R[2] - 1) < 1e-4);
  assert.ok(Math.abs(rnap.transform.R[5]) < 1e-4);
  assert.ok(Math.abs(rnap.transform.R[8]) < 1e-4);
});

test('world-state.json biological state and counters match Construct v3 at chapter 6 midpoint', () => {
  const ws = readJson('world-state.json');

  assert.equal(CONSTRUCT_V3_TRANSCRIPT.length, 179);
  assert.equal(ws.dna.machineId, 'rnap');
  assert.equal(ws.dna.register, CONSTRUCT_V3_TSS + ws.rna.length);
  assert.equal(ws.dna.register, 126);
  assert.equal(ws.dna.bend, 1);
  assert.ok(Array.isArray(ws.dna.bubble) && ws.dna.bubble.length === 2);
  const [lo, hi] = ws.dna.bubble;
  assert.ok(lo < hi && hi - lo <= 15, 'transcription bubble must not exceed 15 bp (§5.3)');
  assert.equal(ws.dna.relax, 0);

  assert.ok(Number.isInteger(ws.rna.length));
  assert.equal(ws.rna.length, 81);
  assert.ok(ws.rna.addProgress >= 0 && ws.rna.addProgress <= 1);
  assert.equal(ws.rna.hairpin, 0);
  assert.equal(ws.rna.released, false);
  assert.equal(ws.rna.layout, 'rnap');
  assert.equal(ws.rna.layoutBlend, 0);

  // Incoming NTP is the next transcript nucleotide (0-based index = rna.length = 81).
  const expectedNextBase = CONSTRUCT_V3_TRANSCRIPT[ws.rna.length];
  assert.equal(expectedNextBase, 'G');
  assert.equal(ws.ntp.base, expectedNextBase);
  assert.ok(ws.ntp.path >= 0 && ws.ntp.path <= 1);
  assert.equal(ws.ntp.bonded, false);

  assert.deepEqual(ws.ppi, { path: 0, opacity: 0 });
  assert.deepEqual(ws.ribosome, { codon: 0, bound: false });
  assert.deepEqual(ws.trnas, []);
  assert.deepEqual(ws.peptide, { length: 0, attach: 'free', release: 0 });
  assert.deepEqual(ws.highlight, { codon: null });

  assert.deepEqual(ws.counters, {
    mrna: 81,
    hybrid: 9,
    codon: 0,
    peptide: 0,
  });
  assert.equal(ws.counters.mrna, ws.rna.length);
  assert.ok(ws.counters.hybrid >= 8 && ws.counters.hybrid <= 10);
});

test('story-mini.json satisfies PLAN.md §8.2 Story schema with 3 chapters and 12 sorted events', () => {
  const story = readJson('story-mini.json');

  assert.equal(story.mode, 'sequential');
  assert.equal(story.duration, 20.0);
  assert.deepEqual(story.meta, {
    seed: 19,
    constructVersion: 3,
    fixture: true,
  });

  // Chapters 1..3 from PLAN.md §6.1 and §6.2.
  assert.ok(Array.isArray(story.chapters));
  assert.equal(story.chapters.length, 3);
  const expectedChapters = [
    { index: 0, id: 'establish', title: 'A gene in the cytoplasm', group: 'O', t0: 0.0, t1: 6.0, shot: 'wide', caption: CAPTIONS[1] },
    { index: 1, id: 'search', title: 'Finding the promoter', group: 'T', t0: 6.0, t1: 14.0, shot: 'rnap-side', caption: CAPTIONS[2] },
    { index: 2, id: 'open', title: 'Opening the DNA', group: 'T', t0: 14.0, t1: 20.0, shot: 'rnap-side', caption: CAPTIONS[3] },
  ];
  assert.deepEqual(story.chapters, expectedChapters);

  let cursor = 0;
  for (let i = 0; i < story.chapters.length; i++) {
    const ch = story.chapters[i];
    assert.equal(ch.index, i);
    assert.ok(VALID_GROUPS.has(ch.group));
    assert.ok(VALID_SHOTS.has(ch.shot));
    assert.equal(ch.t0, cursor, `chapter ${i} must start contiguously at ${cursor}`);
    assert.ok(ch.t1 > ch.t0, `chapter ${i} must have positive duration`);
    assert.ok(ch.caption.length <= 230, `chapter ${i} caption must be <= 230 chars`);
    cursor = ch.t1;
  }
  assert.equal(cursor, story.duration, 'chapters must sum to story.duration');

  // Events: exactly 12, unique stable <type>:<n> ids, valid types, sorted by (t0, id).
  assert.ok(Array.isArray(story.events));
  assert.equal(story.events.length, 12);

  const seenIds = new Set();
  const chaptersSeen = new Set();
  for (let i = 0; i < story.events.length; i++) {
    const ev = story.events[i];
    assert.equal(typeof ev.id, 'string');
    assert.ok(!seenIds.has(ev.id), `duplicate event id: ${ev.id}`);
    seenIds.add(ev.id);

    assert.ok(VALID_EVENT_TYPES.has(ev.type), `invalid event type: ${ev.type}`);
    assert.ok(
      ev.id.startsWith(`${ev.type}:`) && /^\d+$/.test(ev.id.slice(ev.type.length + 1)),
      `event id ${ev.id} must have form <type>:<n>`
    );

    assert.equal(typeof ev.t0, 'number');
    assert.equal(typeof ev.t1, 'number');
    assert.ok(ev.t0 >= 0 && ev.t0 <= ev.t1 && ev.t1 <= story.duration, `invalid interval [${ev.t0}, ${ev.t1}] for ${ev.id}`);

    assert.ok(Number.isInteger(ev.chapter) && ev.chapter >= 0 && ev.chapter < story.chapters.length);
    const ch = story.chapters[ev.chapter];
    assert.ok(
      ev.t0 >= ch.t0 && ev.t1 <= ch.t1,
      `event ${ev.id} [${ev.t0}, ${ev.t1}] outside chapter ${ev.chapter} [${ch.t0}, ${ch.t1}]`
    );
    chaptersSeen.add(ev.chapter);

    assert.ok(ev.data && typeof ev.data === 'object' && !Array.isArray(ev.data));

    if (ev.type === 'ntp.enter') {
      const mrnaIndex = ev.data.register - CONSTRUCT_V3_TSS;
      assert.equal(ev.data.base, CONSTRUCT_V3_TRANSCRIPT[mrnaIndex]);
    }

    if (i > 0) {
      const prev = story.events[i - 1];
      const ordered = prev.t0 < ev.t0 || (prev.t0 === ev.t0 && prev.id < ev.id);
      assert.ok(ordered, `events out of order: ${prev.id} (${prev.t0}) before ${ev.id} (${ev.t0})`);
    }
  }

  assert.equal(chaptersSeen.size, 3, 'mini story events should span all 3 chapters');
});
