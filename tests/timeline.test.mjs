// R3-S2 part a: timeline and shots (docs/tasks/R3-ST3-design.md §4.2, §4.3, §4.6). No stateAt here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, EVENT_TYPES } from '../js/sim/gene/timeline.js';
import { getShot, resolveChapterShot, shotSegments, SHOT_IDS } from '../js/sim/gene/shots.js';
import { TRUE_SCALE_GENE_CONSTRUCT as C, codonTable } from '../js/science/scenario.js';
import { decodeAsset } from '../js/assets/format.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ribo = decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', 'ribosome-70s.asset.json'), 'utf8')));
const assets = { 'ribosome-70s': ribo };

const seq = buildTimeline(C, assets);
const cpl = buildTimeline(C, assets, { mode: 'coupled', D: 48 });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-3, `${msg ?? ''} ${a} vs ${b}`);
const count = (tl, type, ch) => tl.events.filter(e => e.type === type && (ch === undefined || e.chapter === ch)).length;

const CAPTIONS = [
  'A 248-base-pair gene in a patch of E. coli cytoplasm. Everything here is at true scale, built from experimental structures.',
  'RNA polymerase holoenzyme scans the DNA. Its σ⁷⁰ subunit (violet) recognises the −35 TTGACA and −10 TATAAT promoter elements.',
  'σ⁷⁰ melts about 13 base pairs around the start site. The template strand enters the active site and the DNA bends sharply.',
  'Each incoming NTP pairs with the template. The RNA 3′-OH attacks its α-phosphate, adding one nucleotide and releasing pyrophosphate.',
  'After about 12 nucleotides the enzyme leaves the promoter. Here σ⁷⁰ is shown leaving; in cells it often stays bound for longer.',
  'The polymerase reads the template 3′→5′ and builds RNA 5′→3′. About nine base pairs of RNA·DNA hybrid stay inside; the DNA re-closes behind.',
  'A GC-rich hairpin folds in the new RNA as the U-tract is copied. The weak U·A hybrid gives way, releasing the RNA and the DNA.',
  'The 30S subunit, with IF1 and IF3, finds the Shine–Dalgarno sequence AGGAGG by pairing it with the 3′ end of its 16S rRNA.',
  'IF2 brings the initiator fMet-tRNA to the P site, where its anticodon pairs with AUG. This sets the reading frame.',
  'The 50S subunit joins. IF3 and IF1 leave, and IF2 hydrolyses GTP and departs, leaving a 70S ribosome ready to read codon 2.',
  'EF-Tu brings an aminoacyl-tRNA to the A site. When its anticodon pairs with the codon, EF-Tu hydrolyses GTP and releases the tRNA.',
  'In the peptidyl-transferase centre of the 23S rRNA, the new amino acid attacks the ester bond. The growing chain moves to the A-site tRNA.',
  'EF-G uses GTP to move both tRNAs and the mRNA by exactly one codon: A to P, P to E. The A site is empty again.',
  'Each cycle adds one amino acid to the C-terminus. The chain threads through the 50S exit tunnel and emerges after about 26 residues.',
  'UAA has no tRNA. Release factor RF1 reads it in the A site and its GGQ motif hydrolyses the ester bond, freeing the 40-residue peptide.',
  'One gene, one transcript, one peptide. More ribosomes could read the same mRNA; the peptide would now fold, which is not modelled here.',
];
const SEQ_ROWS = [
  ['establish', 'A gene in the cytoplasm', 'O', 6.0, 'wide'],
  ['search', 'Finding the promoter', 'T', 8.0, 'rnap-side'],
  ['open', 'Opening the DNA', 'T', 6.0, 'rnap-side'],
  ['initiate', 'First bonds', 'T', 6.4, 'rnap-active'],
  ['escape', 'Promoter escape', 'T', 6.0, 'rnap-side'],
  ['elongate-tx', 'Elongation', 'T', 20.7, 'rnap-follow'],
  ['terminate-tx', 'Termination', 'T', 13.15, 'rnap-exit'],
  ['scan', 'Ribosome meets mRNA', 'I', 8.0, 'ribo-30s'],
  ['start', 'Start codon', 'I', 6.0, 'ribo-decode'],
  ['join', '70S assembly', 'I', 6.0, 'ribo-side'],
  ['decode', 'Decoding', 'E', 9.0, 'ribo-decode'],
  ['bond', 'Peptide bond', 'E', 4.0, 'ribo-ptc'],
  ['translocate', 'Translocation', 'E', 6.0, 'ribo-side'],
  ['elongate-tl', 'Elongation', 'E', 41.8, 'ribo-tunnel'],
  ['release', 'Stop codon', 'E', 11.0, 'ribo-decode'],
  ['finale', 'Finished', 'O', 6.0, 'wide'],
];
// D = 48: cycles = floor((179 - 24 - 48) / 3) = 35; remaining codons = 40 - 1 - 35 = 4.
const CPL_ROWS = [
  ...SEQ_ROWS.slice(0, 5),
  ['elongate-early', 'RNA emerges', 'T', 9.0, 'rnap-follow'],
  ['couple-scan', 'Ribosome joins early', 'I', 10.0, 'ribo-30s'],
  ['couple-join', '70S assembly', 'I', 7.5, 'coupled-wide'],
  ['couple-run', 'Coupled elongation', 'E', 38.5, 'coupled-follow'],
  ['couple-terminate', 'Transcription ends', 'T', 4.0, 'rnap-exit'],
  ['release', 'Stop codon', 'E', 15.4, 'ribo-exit'],
  ['finale', 'Finished', 'O', 6.0, 'wide'],
];
const CPL_CAPTIONS = [
  ...CAPTIONS.slice(0, 5),
  'The 5′ end of the mRNA, with its Shine–Dalgarno sequence, leaves the polymerase while transcription continues.',
  'In bacteria a ribosome can start on an mRNA that is still being made. Here transcription pauses briefly so the steps can be seen.',
  'The 50S subunit joins and the initiation factors leave. NusG links the ribosome to the polymerase, 48 nucleotides behind its active site.',
  'The polymerase and ribosome move together. Every three nucleotides transcribed match one codon translated.',
  'The terminator hairpin has folded and the polymerase releases the RNA. The ribosome continues on its own.',
  'Release factor RF1 reads UAA and frees the 40-residue peptide.',
  'In coupled expression, transcription and translation overlap in time and space, which is possible because bacteria have no nucleus.',
];

for (const [name, tl, rows, caps, total] of [
  ['sequential', seq, SEQ_ROWS, CAPTIONS, 164.05],
  ['coupled', cpl, CPL_ROWS, CPL_CAPTIONS, 122.8],
]) {
  test(`${name}: total duration and chapter table`, () => {
    near(tl.duration, total, 'duration');
    assert.equal(tl.duration, tl.chapters.at(-1).t1);
    assert.equal(tl.chapters.length, rows.length);
    rows.forEach(([id, title, group, d, shot], i) => {
      const ch = tl.chapters[i];
      assert.equal(ch.index, i);
      assert.equal(ch.id, id);
      assert.equal(ch.title, title);
      assert.equal(ch.group, group);
      assert.equal(ch.shot, shot);
      assert.equal(ch.caption, caps[i]);
      near(ch.t1 - ch.t0, d, `${id} duration`);
      assert.equal(ch.shots[0].id, shot);
      assert.equal(ch.shots[0].t0, ch.t0);
    });
  });

  test(`${name}: chapters contiguous from 0, no placeholders left`, () => {
    assert.equal(tl.chapters[0].t0, 0);
    for (let i = 0; i + 1 < tl.chapters.length; i++) assert.equal(tl.chapters[i].t1, tl.chapters[i + 1].t0);
    for (const ch of tl.chapters) assert.ok(!ch.caption.includes('{'), ch.caption);
    for (const ch of tl.chapters) assert.ok(!ch.caption.includes('*'), 'plain text (DEC-006)');
  });

  test(`${name}: event ids, order, types, containment`, () => {
    const lastN = new Map();
    const seen = new Set();
    const byType = new Map();
    for (const e of tl.events) {
      assert.ok(!seen.has(e.id), `duplicate ${e.id}`);
      seen.add(e.id);
      assert.ok(EVENT_TYPES.includes(e.type), e.type);
      assert.equal(EVENT_TYPES.length, 26);
      const m = /^(.+):(\d+)$/.exec(e.id);
      assert.ok(m && m[1] === e.type, e.id);
      assert.ok(typeof e.data.target === 'string' && e.data.target.length > 0, `${e.id} target`);
      assert.ok(e.t0 <= e.t1, e.id);
      const ch = tl.chapters[e.chapter];
      assert.ok(e.t0 >= ch.t0 && e.t1 <= ch.t1 + 1e-9, `${e.id} inside chapter ${ch.id}`);
      if (!byType.has(e.type)) byType.set(e.type, []);
      byType.get(e.type).push({ n: Number(m[2]), t0: e.t0 });
    }
    for (let i = 1; i < tl.events.length; i++) {
      const a = tl.events[i - 1], b = tl.events[i];
      assert.ok(a.t0 < b.t0 || (a.t0 === b.t0 && a.id < b.id), `order ${a.id} ${b.id}`);
    }
    // numbered per type in time order, 1..n without gaps
    for (const [type, list] of byType) {
      list.sort((x, y) => x.n - y.n);
      list.forEach((x, i) => assert.equal(x.n, i + 1, `${type} numbering`));
      for (let i = 1; i < list.length; i++) assert.ok(list[i].t0 >= list[i - 1].t0, `${type} time order`);
    }
    void lastN;
  });

  test(`${name}: ntp.enter bases equal the transcript; tRNA amino acids equal the codon table`, () => {
    const ntps = tl.events.filter(e => e.type === 'ntp.enter').sort((a, b) => a.data.n - b.data.n);
    assert.equal(ntps.length, 179);
    ntps.forEach((e, i) => { assert.equal(e.data.n, i + 1); assert.equal(e.data.base, C.mrna[i]); });
    assert.equal(ntps.map(e => e.data.base).join(''), C.mrna);
    const table = codonTable(C);
    const enters = tl.events.filter(e => e.type === 'trna.enter');
    assert.equal(enters.length, 40);
    const codons = enters.map(e => e.data.codon).sort((a, b) => a - b);
    assert.deepEqual(codons, Array.from({ length: 40 }, (_, i) => i + 1));
    for (const e of enters) {
      assert.equal(e.data.aa, table[e.data.codon - 1].aa3);
      assert.equal(e.data.kind, e.data.codon === 1 ? 'init' : 'aa');
      assert.equal(e.data.target, `trna:${(e.data.codon - 1) % 4}`);
      assert.equal(e.data.site, e.data.codon === 1 ? 'P' : 'AT');
    }
  });

  test(`${name}: totals of bonds, translocations, cycles`, () => {
    assert.equal(count(tl, 'bond.phosphodiester'), 179);
    assert.equal(count(tl, 'ppi.leave'), 179);
    assert.equal(count(tl, 'bond.peptide'), 39);
    assert.equal(count(tl, 'translocate'), 39);
    assert.equal(count(tl, 'codon.pair'), 40);
    assert.equal(count(tl, 'peptide.release'), 1);
    assert.equal(count(tl, 'rna.release'), 1);
    const peptides = tl.events.filter(e => e.type === 'bond.peptide').map(e => e.data.codon).sort((a, b) => a - b);
    assert.deepEqual(peptides, Array.from({ length: 39 }, (_, i) => i + 2));
  });

  test(`${name}: determinism`, () => {
    const again = buildTimeline(C, assets, name === 'coupled' ? { mode: 'coupled', D: 48 } : {});
    assert.deepEqual(again, tl);
  });
}

test('sequential: early chapters (2-5) key times and counts', () => {
  const c = seq.chapters;
  const inCh = (i, type) => seq.events.filter(e => e.chapter === i && e.type === type);
  const mv = inCh(1, 'machine.move')[0];
  near(mv.t0, 6.0); near(mv.t1, 14.0);
  assert.deepEqual([mv.data.assetId, mv.data.ease, mv.data.target], ['rnap-holo', 'easeInOutCubic', 'rnap']);
  const bind = inCh(1, 'machine.bind')[0];
  near(bind.t0, 14.0); near(bind.t1, 14.0);
  assert.equal(bind.data.register, 45);
  const open = inCh(2, 'dna.open')[0];
  near(open.t0, 14.0); near(open.t1, 20.0);
  assert.deepEqual(open.data.bubble, [-11, 2]);
  assert.deepEqual(open.data.bend, [0, 1]);

  // chapter 4 (index 3): 3 nt at 1.8 s, then 1.0 s hold
  const t4 = c[3].t0;
  for (let n = 1; n <= 3; n++) {
    const s = t4 + 1.8 * (n - 1);
    const ent = inCh(3, 'ntp.enter').find(e => e.data.n === n);
    const bnd = inCh(3, 'bond.phosphodiester').find(e => e.data.n === n);
    const ppi = inCh(3, 'ppi.leave').find(e => e.data.n === n);
    near(ent.t0, s); near(ent.t1, s + 0.8); near(bnd.t0, s + 0.8); near(bnd.t1, s + 1.2);
    near(ppi.t0, s + 1.2); near(ppi.t1, s + 1.8);
  }
  assert.equal(inCh(3, 'bond.phosphodiester').length, 3);

  // chapter 5 (index 4): nt 4..12 at 0.5 s, sigma [3.5, 5.0], trackBlend
  assert.equal(inCh(4, 'bond.phosphodiester').length, 9);
  const t5 = c[4].t0;
  const n11 = inCh(4, 'ntp.enter').find(e => e.data.n === 11);
  near(n11.t0, t5 + 3.5);
  const sig = inCh(4, 'part.release')[0];
  assert.equal(sig.data.target, 'sigma');
  near(sig.t0, t5 + 3.5); near(sig.t1, t5 + 5.0);
  const mb = inCh(4, 'machine.bind')[0];
  near(mb.t0, t5 + 3.5); near(mb.t1, t5 + 5.0);
  assert.deepEqual([mb.data.trackBlend, mb.data.assetSwitchAt, mb.data.assetId], [[0, 1], 0.5, 'rnap-ec']);
  for (let n = 4; n <= 12; n++) {
    const e = inCh(4, 'ntp.enter').find(x => x.data.n === n);
    near(e.t0, t5 + 0.5 * (n - 4));
    const b = inCh(4, 'bond.phosphodiester').find(x => x.data.n === n);
    const p = inCh(4, 'ppi.leave').find(x => x.data.n === n);
    near(p.t1, t5 + 0.5 * (n - 3));
    assert.ok(e.t1 <= b.t0 && b.t1 <= p.t0 + 1e-9);
    near(b.t1 - b.t0, 0.111, 'bond share'); // 0.4 / 1.8 of 0.5 s, whole milliseconds
  }
});

test('sequential: chapter 6 and 7 (transcription elongation and termination)', () => {
  const inCh = (i, type) => seq.events.filter(e => e.chapter === i && e.type === type);
  assert.equal(inCh(5, 'bond.phosphodiester').length, 138);
  const nts = inCh(5, 'ntp.enter').map(e => e.data.n).sort((a, b) => a - b);
  assert.equal(nts[0], 13); assert.equal(nts.at(-1), 150);
  const t6 = seq.chapters[5].t0;
  near(inCh(5, 'ntp.enter').find(e => e.data.n === 14).t0, t6 + 0.15);
  assert.equal(inCh(6, 'bond.phosphodiester').length, 29);
  const t7 = seq.chapters[6].t0;
  near(inCh(6, 'ntp.enter').find(e => e.data.n === 152).t0, t7 + 0.35);
  const hp = inCh(6, 'rna.hairpin')[0];
  assert.deepEqual([hp.data.stem, hp.data.loop, hp.data.stem3], [[151, 159], [159, 163], [163, 171]]);
  near(hp.t0, t7 + 13 * 0.35); // nucleotide 164 is mRNA index 163, first of termStem3
  near(hp.t1, t7 + 10.15);
  for (const type of ['rna.release']) near(inCh(6, type)[0].t0, t7 + 10.15);
  for (const type of ['dna.close', 'dna.relax', 'machine.move']) {
    const e = inCh(6, type)[0];
    near(e.t0, t7 + 10.15); near(e.t1, t7 + 13.15);
  }
  assert.equal(inCh(6, 'machine.move')[0].data.leave, true);
  assert.equal(count(seq, 'bond.phosphodiester'), 179);
  assert.equal(count(seq, 'bond.phosphodiester', 3) + count(seq, 'bond.phosphodiester', 4) + 138 + 29, 179);
});

test('sequential: chapters 8-13 key times', () => {
  const find = (i, type, target) => seq.events.filter(e => e.chapter === i && e.type === type && (!target || e.data.target === target));
  const rel = (i, e) => [e.t0 - seq.chapters[i].t0, e.t1 - seq.chapters[i].t0];
  const check = (i, type, target, a, b) => {
    const [e] = find(i, type, target);
    assert.ok(e, `${type} ${target}`);
    const [x, y] = rel(i, e);
    near(x, a, `${type} ${target} t0`); near(y, b, `${type} ${target} t1`);
    return e;
  };
  check(7, 'mrna.layout', 'ribosome', 0, 3.0);
  check(7, 'factor.enter', 'if1', 3.0, 6.0);
  check(7, 'factor.enter', 'if3', 3.0, 6.0);
  assert.deepEqual(check(7, 'ribosome.bind', 'small', 3.0, 8.0).data.sd, [11, 17]);
  check(8, 'factor.enter', 'if2', 0, 3.0);
  assert.deepEqual(
    (({ kind, aa, site, codon }) => ({ kind, aa, site, codon }))(check(8, 'trna.enter', 'trna:0', 0, 3.0).data),
    { kind: 'init', aa: 'fMet', site: 'P', codon: 1 });
  check(8, 'codon.pair', 'trna:0', 3.0, 4.5);
  check(9, 'ribosome.join', 'large', 0, 2.5);
  check(9, 'factor.leave', 'if3', 1.0, 3.0);
  check(9, 'gtp.hydrolyse', 'if2', 3.0, 4.4);
  check(9, 'factor.leave', 'if1', 3.0, 5.0);
  check(9, 'factor.leave', 'if2', 3.0, 5.0);
  const ala = check(10, 'trna.enter', 'trna:1', 0, 3.0);
  assert.equal(ala.data.aa, 'Ala'); assert.equal(ala.data.site, 'AT'); assert.equal(ala.data.codon, 2);
  assert.equal(check(10, 'factor.enter', 'ef-tu', 0, 3.0).data.carries, 'trna:1');
  check(10, 'codon.pair', 'trna:1', 3.0, 5.0);
  check(10, 'gtp.hydrolyse', 'ef-tu', 5.0, 6.4);
  check(10, 'factor.leave', 'ef-tu', 5.0, 7.0);
  assert.deepEqual([find(10, 'trna.move')[0].data.from, find(10, 'trna.move')[0].data.to], ['AT', 'A']);
  near(rel(10, find(10, 'trna.move')[0])[0], 7.0); near(rel(10, find(10, 'trna.move')[0])[1], 9.0);
  const pb = check(11, 'bond.peptide', null, 1.0, 3.0);
  assert.deepEqual([pb.data.codon, pb.data.from, pb.data.to], [2, 'trna:0', 'trna:1']);
  check(12, 'factor.enter', 'ef-g', 0, 1.5);
  check(12, 'gtp.hydrolyse', 'ef-g', 1.5, 2.9);
  check(12, 'translocate', 'ribosome', 1.5, 4.0);
  check(12, 'factor.leave', 'ef-g', 4.0, 6.0);
  const moves = find(12, 'trna.move').map(e => `${e.data.target}:${e.data.from}>${e.data.to}`).sort();
  assert.deepEqual(moves, ['trna:0:P>E', 'trna:1:A>P']);
});

test('sequential: chapter 14 cycles, slots, chapter 15 and 16', () => {
  const ch = seq.chapters[13];
  const ev = seq.events.filter(e => e.chapter === 13);
  assert.equal(ev.filter(e => e.type === 'bond.peptide').length, 38);
  assert.equal(ev.filter(e => e.type === 'translocate').length, 38);
  for (let k = 3; k <= 40; k++) {
    const c = ch.t0 + 1.1 * (k - 3);
    const slot = (k - 1) % 4;
    const get = type => ev.filter(e => e.type === type && e.data.codon === k);
    const tin = get('trna.enter')[0];
    near(tin.t0, c); near(tin.t1, c + 0.15);
    assert.equal(tin.data.target, `trna:${slot}`);
    const pair = get('codon.pair')[0];
    near(pair.t0, c + 0.15); near(pair.t1, c + 0.25);
    const bp = get('bond.peptide')[0];
    near(bp.t0, c + 0.35); near(bp.t1, c + 0.5);
    assert.deepEqual([bp.data.from, bp.data.to], [`trna:${(k - 2) % 4}`, `trna:${slot}`]);
    const tr = get('translocate')[0];
    near(tr.t0, c + 0.6); near(tr.t1, c + 1.0);
    // E-site tRNA of codon k-2 leaves 0..0.35 and frees its slot for codon k+2
    const lv = ev.find(e => e.type === 'trna.leave' && e.data.codon === k - 2);
    assert.equal(lv.data.target, `trna:${(k - 3) % 4}`);
    near(lv.t0, c); near(lv.t1, c + 0.35);
    const efg = get('factor.leave').find(e => e.data.target === 'ef-g');
    near(efg.t0, c + 1.0); near(efg.t1, c + 1.1);
  }
  const rel = seq.chapters[14];
  const at = (type, target) => seq.events.find(e => e.chapter === 14 && e.type === type && (!target || e.data.target === target));
  const rf1 = at('factor.enter', 'rf1');
  assert.deepEqual([rf1.data.codon, rf1.data.site], [41, 'A']);
  near(rf1.t1 - rel.t0, 3.0);
  const pr = at('peptide.release');
  near(pr.t0 - rel.t0, 3.0); near(pr.t1 - rel.t0, 9.0);
  assert.deepEqual([pr.data.hydrolysis, pr.data.slide], [[3.0, 5.0], [5.0, 9.0]]);
  const lv = at('trna.leave');
  assert.equal(lv.data.target, 'trna:2'); near(lv.t1 - rel.t0, 1.0);
  const rl = at('factor.leave', 'rf1');
  near(rl.t0 - rel.t0, 9.0); near(rl.t1 - rel.t0, 11.0);
  const fin = seq.events.find(e => e.chapter === 15);
  assert.equal(fin.type, 'trna.leave'); assert.equal(fin.data.target, 'trna:3');
  near(fin.t1 - seq.chapters[15].t0, 2.0);
  // four slots only
  for (const e of seq.events) if (e.data.target.startsWith('trna:')) assert.ok(/^trna:[0-3]$/.test(e.data.target));
});

test('event counts per type (sequential)', () => {
  const expected = {
    'machine.move': 2, 'machine.bind': 2, 'part.release': 1, 'dna.open': 1, 'dna.close': 1, 'dna.relax': 1,
    'ntp.enter': 179, 'bond.phosphodiester': 179, 'ppi.leave': 179, 'rna.hairpin': 1, 'rna.release': 1,
    'mrna.layout': 1, 'ribosome.bind': 1, 'ribosome.join': 1, 'bond.peptide': 39, translocate: 39,
    'codon.pair': 40, 'trna.enter': 40, 'trna.leave': 40, 'trna.move': 117, 'peptide.release': 1,
  };
  for (const [type, n] of Object.entries(expected)) assert.equal(count(seq, type), n, type);
  assert.equal(count(seq, 'couple.lock'), 0);
});

test('coupled: chapters 6-12 structure for D = 48', () => {
  assert.equal(cpl.meta.mode, 'coupled');
  assert.equal(cpl.meta.D, 48);
  assert.equal(cpl.meta.dSource, 'option opts.D');
  const dflt = buildTimeline(C, assets, { mode: 'coupled' });
  assert.equal(dflt.meta.D, 48);
  assert.equal(dflt.meta.dSource, 'default 48 (PLAN.md §6.4); pending task A4');
  assert.deepEqual(dflt.events, cpl.events);
  const inCh = (i, type) => cpl.events.filter(e => e.chapter === i && e.type === type);
  const rel = (i, e) => [e.t0 - cpl.chapters[i].t0, e.t1 - cpl.chapters[i].t0];
  // chapter 6: nt 13..72
  assert.equal(inCh(5, 'bond.phosphodiester').length, 60);
  // chapter 7
  const lay = inCh(6, 'mrna.layout')[0];
  assert.equal(lay.data.to, 'coupled'); near(rel(6, lay)[1], 2.0);
  const sb = inCh(6, 'ribosome.bind')[0];
  assert.equal(sb.data.pose, 'expressome');
  assert.ok(rel(6, sb)[0] >= 2.0 - 1e-9);
  const cp = inCh(6, 'codon.pair')[0];
  near(rel(6, cp)[1], 10.0);
  // chapter 8
  assert.equal(inCh(7, 'ribosome.join').length, 1);
  const nus = inCh(7, 'factor.enter').find(e => e.data.target === 'nusg');
  near(rel(7, nus)[0], 6.0); near(rel(7, nus)[1], 7.5);
  const lock = inCh(7, 'couple.lock')[0];
  near(rel(7, lock)[0], 7.5); near(rel(7, lock)[1], 7.5);
  // chapter 9: 35 cycles, 105 nt (73..177), codons 2..36
  assert.equal(inCh(8, 'bond.phosphodiester').length, 105);
  assert.equal(inCh(8, 'bond.peptide').length, 35);
  const nts = inCh(8, 'ntp.enter').map(e => e.data.n);
  assert.equal(Math.min(...nts), 73); assert.equal(Math.max(...nts), 177);
  const codons = inCh(8, 'translocate').map(e => e.data.codon);
  assert.equal(Math.min(...codons), 2); assert.equal(Math.max(...codons), 36);
  assert.equal(inCh(8, 'trna.leave').length, 34); // codon 2 has no E-site occupant
  assert.equal(inCh(8, 'rna.hairpin').length, 1);
  // chapter 10
  assert.equal(inCh(9, 'bond.phosphodiester').length, 2);
  const rr = inCh(9, 'rna.release')[0];
  assert.equal(rel(9, rr)[0], 1.0);
  const un = inCh(9, 'couple.unlock')[0];
  near(rel(9, un)[0], 4.0);
  assert.equal(inCh(9, 'rna.hairpin')[0].data.part, 'complete');
  // chapter 11: codons 37..40 then the release events
  assert.equal(inCh(10, 'bond.peptide').length, 4);
  assert.equal(inCh(10, 'peptide.release').length, 1);
  near(rel(10, inCh(10, 'peptide.release')[0])[0], 4 * 1.1 + 3.0);
  const lastTr = inCh(10, 'translocate').map(e => e.data.codon);
  assert.deepEqual(lastTr, [37, 38, 39, 40]);
  // coupled-run: one translation cycle per three nucleotides
  for (let j = 0; j < 35; j++) {
    const c = cpl.chapters[8].t0 + 1.1 * j;
    const nIn = inCh(8, 'bond.phosphodiester').filter(e => e.t0 >= c - 1e-9 && e.t1 <= c + 1.1 + 1e-9).length;
    assert.equal(nIn, 3, `cycle ${j}`);
  }
  assert.equal(count(cpl, 'couple.lock'), 1);
  assert.equal(count(cpl, 'couple.unlock'), 1);
  assert.equal(count(cpl, 'rna.hairpin'), 2);
});

test('coupled: D from the option, other D values stay consistent', () => {
  for (const D of [38, 47, 50, 100, 139]) {
    const tl = buildTimeline(C, assets, { mode: 'coupled', D });
    assert.equal(tl.meta.D, D);
    assert.equal(tl.meta.dSource, 'option opts.D');
    assert.equal(count(tl, 'bond.phosphodiester'), 179, `D=${D}`);
    assert.equal(count(tl, 'bond.peptide'), 39, `D=${D}`);
    const cycles = Math.floor((155 - D) / 3);
    near(tl.chapters[8].t1 - tl.chapters[8].t0, cycles * 1.1);
    near(tl.chapters[10].t1 - tl.chapters[10].t0, (39 - cycles) * 1.1 + 11.0);
    near(tl.chapters[5].t1 - tl.chapters[5].t0, (12 + D) * 0.15);
    assert.ok(tl.chapters[7].caption.includes(`${D} nucleotides`));
    for (let i = 0; i + 1 < tl.chapters.length; i++) assert.equal(tl.chapters[i].t1, tl.chapters[i + 1].t0);
  }
  assert.throws(() => buildTimeline(C, assets, { mode: 'coupled', D: 140 }), RangeError);
  assert.throws(() => buildTimeline(C, assets, { mode: 'coupled', D: 37 }), RangeError);
  assert.throws(() => buildTimeline(C, assets, { mode: 'coupled', D: 12.5 }), RangeError);
});

test('{N}: 26 with the committed ribosome asset, kept when no asset is given', () => {
  assert.equal(seq.meta.N, 26);
  assert.ok(seq.chapters[13].caption.includes('after about 26 residues'));
  const bare = buildTimeline(C, undefined);
  assert.equal(bare.meta.N, null);
  assert.ok(bare.chapters[13].caption.includes('{N}'));
  const none = buildTimeline(C, {});
  assert.equal(none.meta.N, null);
});

test('meta records mode, seed, N, D, construct version and initial values', () => {
  assert.deepEqual(
    [seq.meta.mode, seq.meta.seed, seq.meta.N, seq.meta.D, seq.meta.constructVersion],
    ['sequential', 19, 26, null, 3]);
  assert.equal(buildTimeline(C, assets, { seed: 7 }).meta.seed, 7);
  assert.ok(Array.isArray(seq.meta.initialValues) && seq.meta.initialValues.length > 5);
  assert.ok(cpl.meta.initialValues.every(s => typeof s === 'string'));
  assert.deepEqual(buildTimeline(C, assets, { seed: 7 }).events, seq.events, 'seed does not change the events');
});

test('shots: table rows and getShot', () => {
  assert.equal(SHOT_IDS.length, 13);
  for (const id of SHOT_IDS) {
    const s = getShot(id);
    assert.equal(s.id, id);
    for (const k of ['id', 'target', 'dir', 'distance', 'detailRadius', 'cut', 'follow']) assert.ok(k in s, `${id}.${k}`);
    assert.equal(s.distance === 'fit', 'fit' in s);
    assert.equal(s.dir.length, 3);
  }
  assert.throws(() => getShot('nope'), /unknown shot/);
  assert.deepEqual(getShot('wide').target, { frame: 'world', point: [0, 0, 0] });
  assert.equal(getShot('wide').distance, 'fit');
  assert.equal(getShot('wide').follow, false);
  assert.deepEqual(getShot('rnap-side').dir, [0.85, 0.35, -0.40]);
  assert.equal(getShot('rnap-active').distance, 95);
  assert.equal(getShot('rnap-active').cut, 'activeSite');
  assert.deepEqual(getShot('ribo-tunnel').target, { frame: 'ribo', path: 'tunnel', at: 'midpoint' });
  assert.equal(getShot('ribo-exit').detailRadius, 40);
  assert.equal(getShot('ribo-decode').cut, 'decoding');
  assert.equal(getShot('coupled-wide').follow, false);
  assert.equal(getShot('coupled-follow').follow, true);
  assert.deepEqual(getShot('coupled-wide').dir, [0.15, 0.80, 0.58]);
  // every shot used by a chapter exists
  for (const tl of [seq, cpl]) for (const ch of tl.chapters) for (const s of ch.shots) getShot(s.id);
});

test('shots: chapter 14 and 15 segments and resolveChapterShot', () => {
  const c14 = seq.chapters[13];
  assert.deepEqual(c14.shots.map(s => s.id), ['ribo-tunnel', 'ribo-exit']);
  near(c14.shots[1].t0, c14.t0 + 1.1 * 22); // codon 25's cycle starts at c = 1.1 (25 - 3)
  const c15 = seq.chapters[14];
  assert.deepEqual(c15.shots.map(s => s.id), ['ribo-decode', 'ribo-exit']);
  near(c15.shots[1].t0, c15.t0 + 5.0);
  assert.deepEqual(shotSegments(seq).map(s => s.length), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1]);
  assert.deepEqual(shotSegments(cpl).map(s => s.length), Array(12).fill(1));

  const t24 = c14.shots[1].t0;
  assert.deepEqual(resolveChapterShot(c14, c14.t0), { id: 'ribo-tunnel', from: 'ribo-side', blend: 0 });
  assert.equal(resolveChapterShot(c14, t24 - 0.01).id, 'ribo-tunnel');
  let r = resolveChapterShot(c14, t24);
  assert.deepEqual([r.id, r.from, r.blend], ['ribo-exit', 'ribo-tunnel', 0]);
  r = resolveChapterShot(c14, t24 + 0.6);
  near(r.blend, 0.5);
  assert.equal(resolveChapterShot(c14, t24 + 5).blend, 1);
  assert.equal(resolveChapterShot(c14, c14.t1).id, 'ribo-exit');
  assert.equal(resolveChapterShot(c15, c15.t0 + 4.99).id, 'ribo-decode');
  assert.equal(resolveChapterShot(c15, c15.t0 + 5.0).id, 'ribo-exit');
  assert.equal(resolveChapterShot(c15, c15.t0 + 6.0).from, 'ribo-decode');
  // a chapter without segments falls back to chapter.shot
  const bare = { t0: 10, shot: 'wide' };
  const rb = resolveChapterShot(bare, 10.6);
  assert.deepEqual([rb.id, rb.from], ['wide', null]);
  near(rb.blend, 0.5);
  assert.equal(resolveChapterShot(seq.chapters[0], 100).blend, 1);
});
