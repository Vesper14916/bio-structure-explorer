// R3-P1: Port of Round 1 Express invariants (formerly tests/sim.test.mjs:478-614) onto Round 3 Construct v3.
// Run: node --test tests/story-legacy-port.test.mjs
//
// Mapping from Round 1 Express (js/sim/expression.js, deleted in R3-P1) to Round 3 (js/sim/gene/*, js/kin/pose.js,
// js/scene/story-scene.js):
//   - Round 1 `createExpressionSim` single-object API (`update`, `seek`, `play`, `pause`, `dispose`, `setSpeed`,
//     `setCutaway`, `setCameraMode`, `focusTargetFor`, `blobs`) is split into the stateless story/poser core
//     (`buildStory`, `stateAt`, `chapterAt`, `createWorldState`, `createPoser` -> `{ pose, reset }`) plus the
//     scene controller `createStoryScene` (`tick`, `seek`, `seekProgress`, `play`, `pause`, `restart`, `setSpeed`,
//     `setMode`, `setCameraOption`, `setToggles`, `setChapter`, `selectCodon`, `clearInspect`, `pick`, `state`,
//     `dispose`).
//     * `update` -> `tick(dt)` on StoryScene (or stateless `stateAt` + `poser.pose`).
//     * `setCutaway` -> `setToggles({ cutaway })` (per-actor `cutaway` flag on `ActorSpec`).
//     * `setCameraMode` -> `setCameraOption(opt)` (`'auto' | 'free' | 'wide'`).
//     * `focusTargetFor` -> superseded by `CameraRails` (`js/scene/camera-rails.js`) and `target.focus`.
//     * `blobs` (translucent volumetric envelopes) -> superseded by experimental cryo-EM `ActorSpec` entries in
//       `target.actors` / `world.machines`.
//   - Round 1 construct (48-bp DNA, 44-nt mRNA, 33-nt tRNA, 11 sense codons + UAA, ~45 s) is superseded by
//     Construct v3 (`TRUE_SCALE_GENE_CONSTRUCT`, PLAN.md §5.1): 248-bp DNA, 179-nt mRNA, 120-nt tRNA anticodons
//     (40 x 3), 40 sense codons (first 11 identical to Round 1: fMet-A-E-F-K-G-S-D-Y-Q-A) + codon 41 UAA stop,
//     16 sequential chapters totaling 164.05 s (DEC-024).
//   - Round 1 `asm.residues` (`resPos`, `resVis`, `resOp`, `resBond`, `code3 === 'fMet'`) is superseded by the
//     procedural `peptide` `AtomGroup` in `target.groups` (`count`, `pos`, `bonds`, `visible`, `opacity`,
//     `residues` using PDB CCD 3-letter codes where initiator N-formylmethionine is `'FME'`).
//   - Round 1 `sim.state.phase` (`'transcription' | 'initiation' | 'termination' | 'complete'`) is superseded by
//     `world.chapter.id` (`'elongate-tx'`, `'start'`, `'release'`, `'finale'`) and `world.chapter.group`.
//   - Round 1 end-of-story sample `seek(1)` maps to `t = story.duration - 1e-3` (`END_EPSILON`), because the S2
//     contract (`PLAN.md §8.2`) resets `stateAt(story, story.duration)` to boundary defaults.
//   - Round 1 `maxOrtho(asm) < 1e-6` is relaxed to `< 1e-5` (still 10x tighter than `validateAsset`'s `1e-4` in
//     `js/assets/format.js:94,129`): Round 1 built frames analytically in float64, whereas Round 3 composes track
//     and anchor rotation matrices serialized to 6 decimal places in `assets/*.asset.json` (observed worst error
//     across 121 samples x 795 nucleotides is ~2.24e-6; worst actor transform is ~1.26e-6).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../js/assets/format.js';
import {
  Assembly,
  TRUE_SCALE_GENE_CONSTRUCT as SCENARIO,
  codonTable,
} from '../js/science/index.js';
import {
  buildStory,
  stateAt,
  chapterAt,
  createWorldState,
} from '../js/sim/gene/story.js';
import { createPoser } from '../js/kin/pose.js';
import { residueCode3 } from '../js/kin/trna.js';
import { createStoryScene, END_EPSILON } from '../js/scene/story-scene.js';
import { orthoError } from '../js/sim/util.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));
const ASSET_IDS = [
  'rnap-holo', 'rnap-ec', 'nusg', 'ribosome-70s',
  'trna-init', 'trna-aa', 'if1', 'if2', 'if3', 'ef-tu', 'ef-g', 'rf1',
];
const ASSETS = Object.fromEntries(ASSET_IDS.map(id => [id, loadAsset(id)]));

const CODONS = codonTable(SCENARIO);
const EXPECTED_PEPTIDE_1 = 'fMet-A-E-F-K-G-S-D-Y-Q-A-T-L-V-R-N-I-H-W-E-L-T-K-V-M-D-R-C-T-N-L-A-E-K-I-H-G-S-Y-L';
const EXPECTED_RESIDUES_CODE3 = CODONS.slice(0, 40).map(c => residueCode3(c.aa3));

const allFinite = arr => {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
};
const maxOrtho = asm => asm.nucleotides.reduce((m, n) => Math.max(m, orthoError(n.frame.R)), 0);

/** Minimal headless viewer stand-in for verifying StoryScene controller API shape. */
function makeStubViewer() {
  return {
    getState: () => ({ quality: 'high', tier: 'high' }),
    setAssembly: () => {},
    setActors: () => {},
    setAtomGroups: () => {},
    setFx: () => {},
    setLabels: () => {},
    setCrowd: () => {},
    setDetailFocus: () => {},
    setFollowTarget: () => {},
    setHighlight: () => {},
    on: () => () => {},
    off: () => {},
  };
}

/** Capture a full pose + world snapshot analogous to Round 1 `expSnapshot`. */
function storySnapshot(world, target) {
  const A = target.asm;
  const pep = target.groups.find(g => g.id === 'peptide') || null;
  return {
    pos: Float32Array.from(A.atoms.pos),
    vis: A.nucleotides.map(x => x.visible),
    op: A.nucleotides.map(x => x.opacity),
    link: A.links.map(l => l.active),
    str: A.pairs.map(p => p.strength),
    pepPos: pep ? Float32Array.from(pep.pos.subarray(0, pep.count * 3)) : new Float32Array(0),
    pepCount: pep ? pep.count : 0,
    pepVis: pep ? pep.visible : false,
    pepOp: pep ? pep.opacity : 0,
    pepResidues: pep && pep.residues ? pep.residues.map(r => r.code3) : [],
    groups: target.groups.map(g => ({
      id: g.id,
      count: g.count,
      visible: g.visible,
      opacity: g.opacity,
      pos: Float32Array.from(g.pos.subarray(0, g.count * 3)),
    })),
    actors: JSON.stringify(target.actors.map(a => ({
      id: a.id,
      assetId: a.assetId,
      transform: a.transform,
      opacity: a.opacity,
      visible: a.visible,
      parts: a.parts,
    }))),
    caption: world.caption,
    chapterId: world.chapter.id,
  };
}

// ================================================================================== Block 1
// Port of tests/sim.test.mjs:497-540:
// API shape, construct topology, RNA chemistry (O2' & U), DNA lacks O2', peptide sequence & UAA stop codon.
test('legacy-port (Block 1): Story/Poser/Scene API shape, Construct v3 topology (248-bp DNA + 179-nt ribose mRNA + 120-nt tRNA), O2′/U chemistry, and 40-aa peptide + UAA stop', () => {
  // Core Story + Poser API functions
  for (const [name, fn] of Object.entries({ buildStory, stateAt, chapterAt, createWorldState, createPoser })) {
    assert.equal(typeof fn, 'function', `story/poser export ${name}`);
  }
  const story = buildStory(SCENARIO, ASSETS, { mode: 'sequential', seed: 1 });
  const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
  assert.equal(typeof poser.pose, 'function', 'poser.pose');
  assert.equal(typeof poser.reset, 'function', 'poser.reset');

  // StoryScene controller API (Round 3 equivalent of Round 1 createExpressionSim controller methods;
  // Round 1 `blobs` and `focusTargetFor` are superseded by cryo-EM `ActorSpec` and `CameraRails`/`target.focus`).
  const scene = createStoryScene(makeStubViewer(), { scenario: SCENARIO, assets: ASSETS, mode: 'sequential', tier: 'high' });
  try {
    for (const f of [
      'tick', 'seek', 'seekProgress', 'play', 'pause', 'restart',
      'setSpeed', 'setMode', 'setCameraOption', 'setToggles', 'setChapter',
      'selectCodon', 'clearInspect', 'pick', 'state', 'dispose',
    ]) {
      assert.equal(typeof scene[f], 'function', `StoryScene.${f}`);
    }
    assert.equal(scene.state().playing, false, 'starts paused');
  } finally {
    scene.dispose();
  }

  // Construct v3 sequential duration & chapter count (replaces Round 1's 35-60 s mini-ORF duration)
  assert.equal(story.mode, 'sequential');
  assert.equal(story.chapters.length, 16);
  assert.ok(Math.abs(story.duration - 164.05) < 1e-6, `sequential duration ${story.duration} === 164.05 s (DEC-024)`);
  assert.equal(chapterAt(story, 0).id, 'establish');
  assert.equal(chapterAt(story, story.duration - END_EPSILON).id, 'finale');

  // Pose at finale (duration - END_EPSILON) so Assembly & full 40-aa peptide AtomGroup are materialized
  const world = createWorldState();
  const target = { asm: new Assembly(), groups: [], actors: [] };
  stateAt(story, story.duration - END_EPSILON, world);
  poser.pose(world, target);
  const A = target.asm;

  assert.ok(Array.isArray(target.actors), 'target.actors array replaces Round 1 sim.blobs');

  // Strands: 0 = coding DNA (248), 1 = template DNA (248), 2 = mRNA (179), 3 = tRNA anticodons (40 * 3 = 120)
  // (replaces Round 1 48-bp / 44-nt / 33-nt mini-ORF counts)
  assert.equal(A.strands.length, 4);
  assert.deepEqual(A.strands.map(s => s.length), [248, 248, 179, 120]);
  assert.equal(A.nucleotides.length, 248 + 248 + 179 + 120);

  // Verify DNA nucleotides use deoxyribose (no O2') and RNA nucleotides use ribose (with O2') and include Uracil (U)
  const mrnaNucs = A.strands[2].map(id => A.nucleotides[id]);
  const trnaNucs = A.strands[3].map(id => A.nucleotides[id]);
  assert.ok(mrnaNucs.some(nu => nu.base === 'U'), 'mRNA contains Uracil (U)');
  for (const nu of mrnaNucs) {
    assert.equal(nu.sugar, 'ribose');
    assert.equal(nu.role, 'mrna');
    assert.ok(A.atomOf(nu.id, "O2'") >= 0, `mRNA nucleotide ${nu.id} has 2′-OH O2' atom`);
  }
  for (const nu of trnaNucs) {
    assert.equal(nu.sugar, 'ribose');
    assert.equal(nu.role, 'trna');
    assert.ok(A.atomOf(nu.id, "O2'") >= 0, `tRNA anticodon nucleotide ${nu.id} has 2′-OH O2' atom`);
  }
  for (const strandIdx of [0, 1]) {
    for (const id of A.strands[strandIdx]) {
      assert.equal(A.nucleotides[id].sugar, 'deoxyribose');
      assert.equal(A.atomOf(id, "O2'"), -1, `DNA strand ${strandIdx} nucleotide ${id} lacks O2′`);
    }
  }

  // Verify 40 nascent polypeptide residues (first 11 match Round 1: fMet-A-E-F-K-G-S-D-Y-Q-A; ends S-Y-L)
  // and 41 codons (codons 1..40 sense, codon 41 UAA stop)
  assert.equal(SCENARIO.codons.length, 41);
  assert.equal(CODONS.length, 41);
  assert.equal(SCENARIO.peptide.length, 40);

  const peptideDash1 = SCENARIO.peptide.map((r, i) => (i === 0 ? 'fMet' : r.code1)).join('-');
  assert.equal(peptideDash1, EXPECTED_PEPTIDE_1);
  assert.ok(peptideDash1.startsWith('fMet-A-E-F-K-G-S-D-Y-Q-A-'), 'first 11 residues match Round 1 construct');
  assert.ok(peptideDash1.endsWith('-S-Y-L'), 'C-terminal residues match Construct v3');

  assert.equal(SCENARIO.peptide[0].code3, 'fMet');
  assert.equal(SCENARIO.peptide[0].kind, 'initiator');
  assert.equal(CODONS[0].triplet, 'AUG');
  assert.equal(CODONS[0].aa3, 'fMet');
  assert.equal(CODONS[0].isInitiator, true);
  assert.equal(CODONS[40].number, 41);
  assert.equal(CODONS[40].triplet, 'UAA');
  assert.equal(CODONS[40].isStop, true);

  // Posed peptide AtomGroup (replaces Round 1 asm.residues; residue 0 uses PDB CCD code 'FME')
  const pep = target.groups.find(g => g.id === 'peptide');
  assert.ok(pep && pep.visible, 'peptide AtomGroup present and visible at finale');
  assert.equal(pep.residues.length, 40);
  assert.equal(pep.residues[0].code3, 'FME', 'initiator residue 0 is FME (fMet)');
  assert.deepEqual(pep.residues.map(r => r.code3), EXPECTED_RESIDUES_CODE3);
});

// ================================================================================== Block 2
// Port of tests/sim.test.mjs:542-574:
// Pure deterministic seek across forward/backward scrubbing + 120-sample finiteness & frame orthonormality.
test('legacy-port (Block 2): stateAt + pose is purely deterministic across forward/backward scrubbing (0.75 -> 0.25 -> 0.95 -> 0.25 -> 0.75) and finite/orthonormal across 120 samples', () => {
  const story = buildStory(SCENARIO, ASSETS, { mode: 'sequential', seed: 7 });
  const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
  const world = createWorldState();
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const maxT = story.duration - END_EPSILON;

  const seekAndSnap = frac => {
    stateAt(story, frac * maxT, world);
    poser.pose(world, target);
    return storySnapshot(world, target);
  };

  // Round 1 scrub sequence 0.75 -> 0.25 -> 0.95 -> 0.25, extended back to 0.75 so peptide AtomGroup
  // coordinates during translation elongation (p = 0.75) are also verified bit-identical.
  const snap75a = seekAndSnap(0.75);
  const snap25a = seekAndSnap(0.25);
  const snap95 = seekAndSnap(0.95);
  const snap25b = seekAndSnap(0.25);
  const snap75b = seekAndSnap(0.75);

  assert.notDeepEqual(Array.from(snap25a.pos), Array.from(snap75a.pos));
  assert.notDeepEqual(Array.from(snap25a.pos), Array.from(snap95.pos));
  assert.ok(snap75a.pepCount > 0 && snap75a.pepResidues.length > 0, 'p = 0.75 is in translation with active peptide AtomGroup');

  // Bit-identical Float32Array atom coordinates, peptide AtomGroup positions, flags, actors, caption, and chapter
  for (const [label, a, b] of [['p=0.25', snap25a, snap25b], ['p=0.75', snap75a, snap75b]]) {
    assert.deepEqual(a.pos, b.pos, `${label}: bit-identical asm.atoms.pos`);
    assert.deepEqual(a.pepPos, b.pepPos, `${label}: bit-identical peptide AtomGroup pos`);
    assert.equal(a.groups.length, b.groups.length, `${label}: group count`);
    for (let i = 0; i < a.groups.length; i++) {
      assert.equal(a.groups[i].id, b.groups[i].id, `${label}: group[${i}].id`);
      assert.equal(a.groups[i].count, b.groups[i].count, `${label}: group[${i}].count`);
      assert.equal(a.groups[i].visible, b.groups[i].visible, `${label}: group[${i}].visible`);
      assert.equal(a.groups[i].opacity, b.groups[i].opacity, `${label}: group[${i}].opacity`);
      assert.deepEqual(a.groups[i].pos, b.groups[i].pos, `${label}: bit-identical group[${i}].pos`);
    }
    for (const k of ['vis', 'op', 'link', 'str', 'pepCount', 'pepVis', 'pepOp', 'pepResidues', 'actors', 'caption', 'chapterId']) {
      assert.deepEqual(a[k], b[k], `${label}: field ${k} matches identically after scrubbing`);
    }
  }

  // 120 samples across [0, duration - 1e-3]: all atom/group/actor coordinates finite and frames orthonormal.
  // Tolerance is 1e-5 (vs Round 1's 1e-6) because committed `assets/*.asset.json` track/anchor rotation matrices
  // are serialized to 6 decimal places (~1e-6 per matrix; composed frames reach ~2.24e-6, still 10x below the
  // `1e-4` validation ceiling in `js/assets/format.js:94,129`).
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * maxT;
    stateAt(story, t, world);
    poser.pose(world, target);
    assert.ok(allFinite(target.asm.atoms.pos), `finite Assembly atoms at sample ${i} (t=${t.toFixed(3)})`);
    const nucErr = maxOrtho(target.asm);
    assert.ok(nucErr < 1e-5, `orthonormal nucleotide frames at sample ${i} (t=${t.toFixed(3)}, err=${nucErr})`);
    for (const g of target.groups) {
      assert.ok(allFinite(g.pos.subarray(0, g.count * 3)), `finite AtomGroup ${g.id} at sample ${i}`);
    }
    for (const a of target.actors) {
      assert.ok(allFinite(a.transform.o), `finite actor ${a.id} origin at sample ${i}`);
      assert.ok(allFinite(a.transform.R), `finite actor ${a.id} rotation at sample ${i}`);
      const actErr = orthoError(a.transform.R);
      assert.ok(actErr < 1e-5, `orthonormal actor ${a.id} frame at sample ${i} (err=${actErr})`);
    }
  }
});

// ================================================================================== Block 3
// Port of tests/sim.test.mjs:576-614:
// Biological invariants — parental DNA re-closes behind RNAP, fMet is residue 0 in P site at AUG,
// UAA stop codon recruits RF1 without adding a 41st residue, and end state restores all 248 DNA pairs.
test('legacy-port (Block 3): biological invariants — parental DNA re-closes behind RNAP, fMet-tRNA in P site at AUG, UAA recruits RF1 without adding a 41st residue, and finale re-anneals all 248 bp', () => {
  const story = buildStory(SCENARIO, ASSETS, { mode: 'sequential', seed: 1 });
  const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
  const world = createWorldState();
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const ch = id => story.chapters.find(c => c.id === id);

  const poseAt = t => {
    stateAt(story, t, world);
    poser.pose(world, target);
    return target.asm;
  };

  // 1. Mid-transcription (elongate-tx): local bubble open (<= 15 bp), 8-10 bp RNA·DNA hybrid (9 bp),
  //    upstream promoter DNA pair 0 re-closed behind RNAP.
  const txCh = ch('elongate-tx');
  const A1 = poseAt(0.5 * (txCh.t0 + txCh.t1));
  assert.equal(world.chapter.id, 'elongate-tx');
  assert.equal(world.chapter.group, 'T');
  const [bLo, bHi] = world.dna.bubble;
  const bubbleOpen = bHi - bLo + 1;
  assert.ok(bubbleOpen >= 6 && bubbleOpen <= 15, `local transcription bubble open (${bubbleOpen} bp <= 15 bp)`);
  assert.ok(world.counters.hybrid >= 8 && world.counters.hybrid <= 10, `RNA·DNA hybrid in 8-10 bp (${world.counters.hybrid} bp)`);
  assert.equal(world.counters.hybrid, 9, 'RNA·DNA hybrid is 9 bp during elongation');
  assert.equal(A1.pairs[0].strength, 1, 'upstream parental DNA pair 0 re-closed behind RNAP');

  // 2. Translation initiation (start): codon 1 is AUG, initiator trna-init in P site, residue 0 is FME visible in peptide group.
  const startCh = ch('start');
  poseAt(startCh.t1 - 0.1);
  assert.equal(world.chapter.id, 'start');
  assert.equal(world.chapter.group, 'I');
  assert.equal(world.counters.codon, 1);
  assert.equal(world.ribosome.codon, 1);
  assert.equal(CODONS[0].triplet, 'AUG');
  const initTrna = world.trnas.find(tr => tr.kind === 'init' && tr.site === 'P');
  assert.ok(initTrna, 'initiator tRNA (kind === "init") occupies P site during start');
  assert.equal(initTrna.codon, 1);
  assert.equal(initTrna.aa, 'fMet');
  assert.ok(
    target.actors.some(a => a.assetId === 'trna-init' && a.visible),
    'trna-init actor present and visible during initiation',
  );
  const startPep = target.groups.find(g => g.id === 'peptide');
  assert.ok(startPep && startPep.visible, 'peptide AtomGroup visible with initiator residue');
  assert.equal(startPep.residues.length, 1);
  assert.equal(startPep.residues[0].code3, 'FME', 'residue 0 is FME (fMet)');

  // 3. Termination at UAA (codon 41, release): RF1 actor present, counters.codon === 41,
  //    peptide stays at 40 residues (0 added by UAA), no tRNA ever carries codon > 40.
  const relCh = ch('release');
  poseAt(relCh.t0 + 4.0);
  assert.equal(world.chapter.id, 'release');
  assert.equal(world.counters.codon, 41);
  assert.equal(CODONS[40].triplet, 'UAA');
  assert.equal(CODONS[40].isStop, true);
  assert.ok(world.machines.some(m => m.id === 'rf1'), 'RF1 machine present in world state at UAA');
  assert.ok(target.actors.some(a => a.id === 'rf1' && a.visible), 'Release Factor 1 (rf1) actor visible at UAA stop codon');
  assert.equal(world.peptide.length, 40, 'UAA adds zero amino acids; world.peptide remains 40 residues');
  assert.equal(world.counters.peptide, 40);
  const relPep = target.groups.find(g => g.id === 'peptide');
  assert.ok(relPep && relPep.visible);
  assert.equal(relPep.residues.length, 40, 'peptide AtomGroup has 40 residues (0 added by UAA)');
  for (let i = 0; i <= 32; i++) {
    const t = relCh.t0 + (i / 32) * (relCh.t1 - relCh.t0);
    stateAt(story, t, world);
    assert.ok(world.trnas.every(tr => tr.codon <= 40), `no tRNA with codon > 40 in release (sample ${i})`);
    assert.equal(world.peptide.length, 40, `peptide length stays 40 throughout release (sample ${i})`);
  }

  // 4. End state (finale at duration - 1e-3): all 248 parental DNA pairs re-annealed,
  //    all 179 mRNA nt transcribed, all 40 peptide residues complete and matching Construct v3.
  const AEnd = poseAt(story.duration - END_EPSILON);
  assert.equal(world.chapter.id, 'finale');
  assert.equal(world.counters.mrna, 179);
  assert.equal(world.rna.length, 179);
  assert.equal(world.counters.peptide, 40);
  assert.equal(world.peptide.length, 40);
  const endPep = target.groups.find(g => g.id === 'peptide');
  assert.ok(endPep && endPep.visible);
  assert.equal(endPep.residues.length, 40);
  assert.deepEqual(endPep.residues.map(r => r.code3), EXPECTED_RESIDUES_CODE3);
  for (let k = 0; k < 248; k++) {
    assert.equal(AEnd.pairs[k].strength, 1, `parental DNA pair ${k} re-annealed at end of expression`);
  }
});
