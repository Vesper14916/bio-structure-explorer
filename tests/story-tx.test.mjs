// R3-S3: Transcription choreography unit & acceptance tests (PLAN.md §5.3 items 1, 2, 7, 8, §6.1, §8.2-§8.3, §10 R3-S3, Argon C1-C6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRUE_SCALE_GENE_CONSTRUCT as DEFAULT_SCENARIO,
  Assembly,
  complement,
  reverseComplementRna,
  dnaToRna,
} from '../js/science/index.js';
import { decodeAsset } from '../js/assets/format.js';
import { buildStory, stateAt, createWorldState } from '../js/sim/gene/story.js';
import { contributeTx } from '../js/sim/gene/transcription.js';
import { poseNtp, posePpi } from '../js/kin/ntp.js';
import { createPoser } from '../js/kin/pose.js';
import { machinePoseForRegister } from '../js/kin/duplex.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));

const rnapHolo = loadAsset('rnap-holo');
const rnapEc = loadAsset('rnap-ec');
const nusg = loadAsset('nusg');
const ribo = loadAsset('ribosome-70s');
const ASSETS = {
  'rnap-holo': rnapHolo,
  'rnap-ec': rnapEc,
  nusg,
  'ribosome-70s': ribo,
};

const story = buildStory(DEFAULT_SCENARIO, ASSETS);

/** Compute 64 evenly-spaced sample times inside chapter `chIdx` (0-based, chapters 0..6 = Chapters 1..7). */
function chapterSampleTimes(chIdx, count = 64) {
  const ch = story.chapters[chIdx];
  const times = new Float64Array(count);
  const span = ch.t1 - ch.t0;
  for (let i = 0; i < count; i++) {
    times[i] = ch.t0 + ((i + 0.5) / count) * span;
  }
  return times;
}

test('§5.3 Item 1: Sequence identity & 675-nt Assembly topology (248 coding + 248 template + 179 mRNA)', () => {
  // Transcript equals coding strand over [45, 224) with T->U, and reverse complement of template strand
  const codingSlice = DEFAULT_SCENARIO.codingDna.slice(45, 224);
  assert.equal(codingSlice.length, 179);
  assert.equal(DEFAULT_SCENARIO.mrna, dnaToRna(codingSlice));
  assert.equal(DEFAULT_SCENARIO.templateDna, complement(DEFAULT_SCENARIO.codingDna));
  const templateSlice5to3 = DEFAULT_SCENARIO.templateDna.slice(45, 224).split('').reverse().join('');
  assert.equal(DEFAULT_SCENARIO.mrna, reverseComplementRna( dnaToRna(templateSlice5to3) ));

  const poser = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const world = stateAt(story, 35.0);
  const target = { asm: new Assembly(), groups: [], actors: [] };
  poser.pose(world, target);

  assert.equal(target.asm.nucleotides.length, 675, '248 coding + 248 template + 179 mRNA = 675 nucleotides');
  assert.equal(target.asm.strands[0].length, 248);
  assert.equal(target.asm.strands[1].length, 248);
  assert.equal(target.asm.strands[2].length, 179);
  assert.equal(target.asm.pairs.length, 248);
  assert.equal(target.asm.links.length, 247 + 247 + 178);

  for (let g = 0; g < 248; g++) {
    const cNuc = target.asm.nucleotides[g];
    const tNuc = target.asm.nucleotides[248 + g];
    assert.equal(cNuc.base, DEFAULT_SCENARIO.codingDna[g]);
    assert.equal(cNuc.role, 'coding');
    assert.equal(tNuc.base, DEFAULT_SCENARIO.templateDna[g]);
    assert.equal(tNuc.role, 'template');
  }
  for (let j = 0; j < 179; j++) {
    const rNuc = target.asm.nucleotides[496 + j];
    assert.equal(rNuc.base, DEFAULT_SCENARIO.mrna[j]);
    assert.equal(rNuc.role, 'mrna');
    assert.equal(rNuc.sugar, 'ribose');
  }
});

test('§5.3 Item 2: Monotonic integer mRNA length (0..179) and bit-for-bit determinism across random seeks', () => {
  const world = createWorldState();
  let prevLen = 0;
  const samplePts = [];
  for (let chIdx = 0; chIdx < 7; chIdx++) {
    const times = chapterSampleTimes(chIdx, 64);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      samplePts.push(t);
      stateAt(story, t, world);
      assert.ok(Number.isInteger(world.rna.length), `rna.length integer at t=${t}`);
      assert.ok(world.rna.length >= 0 && world.rna.length <= 179, `rna.length in [0, 179] at t=${t}`);
      assert.ok(world.rna.length >= prevLen, `rna.length monotonic: ${world.rna.length} >= ${prevLen} at t=${t}`);
      assert.equal(world.rna.length, world.counters.mrna, `rna.length matches counters.mrna at t=${t}`);
      prevLen = world.rna.length;
    }
  }
  assert.equal(prevLen, 179, 'reaches 179 nt by end of Chapter 7');

  // Verify bit-for-bit determinism of Float32Array positions, actor transforms, and NTP/PPi positions
  const poserA = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const poserB = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const targetA = { asm: new Assembly(), groups: [], actors: [] };
  const targetB = { asm: new Assembly(), groups: [], actors: [] };
  const worldA = createWorldState();
  const worldB = createWorldState();

  const checkTimes = [1.5, 10.2, 17.5, 20.4, 21.0, 21.5, 28.0, 30.65, 42.75, 58.5, 62.95, 64.5];
  const expectedSnapshots = new Map();

  // Forward evaluation
  for (const t of checkTimes) {
    stateAt(story, t, worldA);
    poserA.pose(worldA, targetA);
    expectedSnapshots.set(t, {
      pos: new Float32Array(targetA.asm.atoms.pos),
      actors: JSON.stringify(targetA.actors.map(a => ({ id: a.id, assetId: a.assetId, transform: a.transform, opacity: a.opacity, parts: a.parts }))),
      groups: targetA.groups.map(g => ({ id: g.id, count: g.count, opacity: g.opacity, pos: new Float32Array(g.pos.subarray(0, g.count * 3)) })),
    });
  }

  // Scrambled backward/forward seek order
  const scrambled = [...checkTimes].reverse();
  for (const t of scrambled) {
    stateAt(story, t, worldB);
    poserB.pose(worldB, targetB);
    const snap = expectedSnapshots.get(t);
    assert.deepEqual(targetB.asm.atoms.pos, snap.pos, `bit-for-bit identical Assembly pos at t=${t}`);
    const actStr = JSON.stringify(targetB.actors.map(a => ({ id: a.id, assetId: a.assetId, transform: a.transform, opacity: a.opacity, parts: a.parts })));
    assert.equal(actStr, snap.actors, `bit-for-bit identical actor transforms at t=${t}`);
    assert.equal(targetB.groups.length, snap.groups.length, `group count at t=${t}`);
    for (let k = 0; k < snap.groups.length; k++) {
      assert.equal(targetB.groups[k].id, snap.groups[k].id);
      assert.deepEqual(targetB.groups[k].pos.subarray(0, snap.groups[k].count * 3), snap.groups[k].pos, `bit-for-bit identical ${snap.groups[k].id} pos at t=${t}`);
    }
  }
});

test('§5.3 Item 7: Bubble <= 15 bp, DNA outside bubble fully paired, and 9-bp RNA-DNA hybrid in Chapter 6', () => {
  const poser = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const world = createWorldState();

  for (let chIdx = 0; chIdx < 7; chIdx++) {
    const times = chapterSampleTimes(chIdx, 64);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      stateAt(story, t, world);
      poser.pose(world, target);

      const [bLo, bHi] = world.dna.bubble;
      const beta = world.dna.bend * (1 - world.dna.relax);
      const isOpen = beta > 0 && bHi > bLo;
      const width = isOpen ? (bHi - bLo + 1) : 0;

      if (chIdx < 2) {
        assert.equal(width, 0, `bubble closed in Chapter ${chIdx + 1} at t=${t}`);
      } else {
        assert.ok(width <= 15, `bubble width ${width} <= 15 bp at t=${t}`);
      }

      // Verify pair.strength === 1 for every DNA base pair outside the open bubble
      const reg = world.dna.register;
      const gMin = isOpen ? Math.ceil(reg + bLo) : 1e9;
      const gMax = isOpen ? Math.floor(reg + bHi) : -1e9;
      for (let g = 0; g < 248; g++) {
        if (g < gMin || g > gMax) {
          assert.equal(target.asm.pairs[g].strength, 1, `pair ${g} outside bubble paired at t=${t}`);
        } else {
          assert.equal(target.asm.pairs[g].strength, 0, `pair ${g} inside bubble melted at t=${t}`);
        }
      }

      // Throughout Chapter 6 (elongate-tx, chIdx === 5), RNA-DNA hybrid is 9 bp (within 8-10 bp invariant)
      if (chIdx === 5) {
        assert.equal(world.counters.hybrid, 9, `hybrid is 9 bp in Chapter 6 at t=${t}`);
        assert.ok(world.rna.length >= 12 && !world.rna.released);
      }
    }
  }
});

test('§5.3 Item 8: Slot-track L1 clearance <= 1.0 A across 64 sample times per chapter (Chapters 1-7)', () => {
  const poser = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const world = createWorldState();

  let maxDnaPen = -Infinity;
  let maxRnaPen = -Infinity;
  let maxNtpPen = -Infinity;

  for (let chIdx = 0; chIdx < 7; chIdx++) {
    const times = chapterSampleTimes(chIdx, 64);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      stateAt(story, t, world);
      poser.pose(world, target);

      const rnapAct = target.actors.find(a => a.id === 'rnap');
      if (!rnapAct || !rnapAct.visible || !rnapAct.asset) continue;

      const asset = rnapAct.asset;
      const l1 = asset.lod1;
      const M = rnapAct.transform;

      // Transform visible RNAP L1 beads into world space (applying part.transform per DEC-026)
      const bx = new Float32Array(l1.count);
      const by = new Float32Array(l1.count);
      const bz = new Float32Array(l1.count);
      const br = new Float32Array(l1.count);
      let bCount = 0;
      for (let b = 0; b < l1.count; b++) {
        const chId = l1.chain[b];
        const partId = asset.chains[chId].part;
        const pSpec = rnapAct.parts && rnapAct.parts[partId];
        if (pSpec && (pSpec.visible === false || (pSpec.opacity !== undefined && pSpec.opacity <= 0.001))) continue;
        let lx = l1.positions[3 * b], ly = l1.positions[3 * b + 1], lz = l1.positions[3 * b + 2];
        if (pSpec && pSpec.transform && pSpec.transform.o) {
          lx += pSpec.transform.o[0];
          ly += pSpec.transform.o[1];
          lz += pSpec.transform.o[2];
        }
        bx[bCount] = M.R[0] * lx + M.R[1] * ly + M.R[2] * lz + M.o[0];
        by[bCount] = M.R[3] * lx + M.R[4] * ly + M.R[5] * lz + M.o[1];
        bz[bCount] = M.R[6] * lx + M.R[7] * ly + M.R[8] * lz + M.o[2];
        br[bCount] = l1.kind[b] === 1 ? 2.4 : 1.9;
        bCount++;
      }

      const pos = target.asm.atoms.pos;
      const nearB = new Int32Array(256);

      // Helper to check a nucleotide against nearby L1 beads
      const checkNuc = (nuc, kindLabel) => {
        const ox = nuc.frame.o[0], oy = nuc.frame.o[1], oz = nuc.frame.o[2];
        let nb = 0;
        for (let b = 0; b < bCount; b++) {
          const dx = ox - bx[b], dy = oy - by[b], dz = oz - bz[b];
          if (dx * dx + dy * dy + dz * dz <= 110.0) {
            nearB[nb++] = b;
            if (nb === 256) break;
          }
        }
        if (nb === 0) return;
        for (let a = 0; a < nuc.atomCount; a++) {
          const idx3 = (nuc.atomStart + a) * 3;
          const ax = pos[idx3], ay = pos[idx3 + 1], az = pos[idx3 + 2];
          for (let k = 0; k < nb; k++) {
            const b = nearB[k];
            const pen = br[b] - Math.hypot(ax - bx[b], ay - by[b], az - bz[b]);
            if (kindLabel === 'DNA') {
              if (pen > maxDnaPen) maxDnaPen = pen;
            } else {
              if (pen > maxRnaPen) maxRnaPen = pen;
            }
            assert.ok(pen <= 1.0, `${kindLabel} L1 penetration ${pen.toFixed(3)} > 1.0 A at ch=${chIdx + 1} t=${t.toFixed(2)}`);
          }
        }
      };

      // 1. Active open-complex DNA slot tracks (bend === 1 && relax === 0)
      if (world.dna.bend === 1 && world.dna.relax === 0) {
        const r0 = asset.id === 'rnap-holo' ? -45 : -15;
        const r1 = asset.id === 'rnap-holo' ? 11 : 13;
        const reg = world.dna.register;
        const gLo = Math.max(0, Math.ceil(reg + r0));
        const gHi = Math.min(247, Math.floor(reg + r1));
        for (let g = gLo; g <= gHi; g++) {
          checkNuc(target.asm.nucleotides[g], 'DNA');
          checkNuc(target.asm.nucleotides[248 + g], 'DNA');
        }
      }

      // 2. Hybrid & terminator hairpin mRNA inside RNAP tracks
      if (!world.rna.released && world.rna.length > 0) {
        const L = world.rna.length;
        const H = Math.min(L, 9);
        const startJ = world.rna.hairpin > 0 ? Math.min(151, L - H) : (L - H);
        for (let j = Math.max(0, startJ); j < L; j++) {
          checkNuc(target.asm.nucleotides[496 + j], 'mRNA');
        }
      }

      // 3. Incoming NTP and departing PPi atom groups
      for (const grp of target.groups) {
        const gpos = grp.pos;
        for (let a = 0; a < grp.count; a++) {
          const ax = gpos[3 * a], ay = gpos[3 * a + 1], az = gpos[3 * a + 2];
          for (let b = 0; b < bCount; b++) {
            const pen = br[b] - Math.hypot(ax - bx[b], ay - by[b], az - bz[b]);
            if (pen > maxNtpPen) maxNtpPen = pen;
            assert.ok(pen <= 1.0, `${grp.id} L1 penetration ${pen.toFixed(3)} > 1.0 A at ch=${chIdx + 1} t=${t.toFixed(2)}`);
          }
        }
      }
    }
  }

  console.log(`# §5.3 Item 8 (448 samples): maxDnaPen=${maxDnaPen.toFixed(3)} A, maxRnaPen=${maxRnaPen.toFixed(3)} A, maxNtpPen=${maxNtpPen.toFixed(3)} A`);
});

test('Downstream DNA lock (<= 0.01 A drift) & seamless promoter escape (trackBlend 0 -> 1)', () => {
  const poser = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const world = createWorldState();

  // Reference straight DNA positions at t = 0
  stateAt(story, 0, world);
  poser.pose(world, target);
  const refOrigins = Array.from({ length: 248 }, (_, g) => [...target.asm.nucleotides[g].frame.o]);

  let maxDownstreamDriftAll = 0;
  let maxDownstreamDriftEarly = 0;

  for (let chIdx = 0; chIdx < 7; chIdx++) {
    const times = chapterSampleTimes(chIdx, 64);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      stateAt(story, t, world);
      poser.pose(world, target);

      // bp 240..247 stay downstream of RNAP (register <= 223, r1 = 13 -> reg + r1 <= 236) across all Chapters 1-7
      for (let g = 240; g < 248; g++) {
        const o = target.asm.nucleotides[g].frame.o;
        const r = refOrigins[g];
        const d = Math.hypot(o[0] - r[0], o[1] - r[1], o[2] - r[2]);
        if (d > maxDownstreamDriftAll) maxDownstreamDriftAll = d;
      }
      // bp 100..247 stay downstream while register <= 86 (Chapters 1-5 and early Chapter 6)
      if (world.dna.register <= 86) {
        for (let g = 100; g < 248; g++) {
          const o = target.asm.nucleotides[g].frame.o;
          const r = refOrigins[g];
          const d = Math.hypot(o[0] - r[0], o[1] - r[1], o[2] - r[2]);
          if (d > maxDownstreamDriftEarly) maxDownstreamDriftEarly = d;
        }
      }
    }
  }

  console.log(`# Downstream DNA drift: bp 240..247 max=${maxDownstreamDriftAll.toExponential(2)} A, bp 100..247 (reg<=86) max=${maxDownstreamDriftEarly.toExponential(2)} A`);
  assert.ok(maxDownstreamDriftAll <= 0.01, `bp 240..247 drift ${maxDownstreamDriftAll} <= 0.01 A`);
  assert.ok(maxDownstreamDriftEarly <= 0.01, `bp 100..247 drift ${maxDownstreamDriftEarly} <= 0.01 A`);

  // Continuity across promoter escape trackBlend 0 -> 1 and assetSwitchAt = 0.5 (t in [29.9, 31.4] s)
  let prevRnapO = null;
  let maxRnapStep = 0;
  let sawHolo = false, sawEc = false;
  for (let t = 29.85; t <= 31.45; t += 0.01) {
    stateAt(story, t, world);
    poser.pose(world, target);
    const rnapAct = target.actors.find(a => a.id === 'rnap');
    assert.ok(rnapAct, `rnap actor present at t=${t}`);
    if (rnapAct.assetId === 'rnap-holo') sawHolo = true;
    if (rnapAct.assetId === 'rnap-ec') sawEc = true;
    const o = rnapAct.transform.o;
    if (prevRnapO) {
      const d = Math.hypot(o[0] - prevRnapO[0], o[1] - prevRnapO[1], o[2] - prevRnapO[2]);
      if (d > maxRnapStep) maxRnapStep = d;
    }
    prevRnapO = [...o];
  }
  console.log(`# Promoter escape max 10-ms RNAP origin step: ${maxRnapStep.toFixed(3)} A (holo->ec switch verified)`);
  assert.ok(sawHolo && sawEc, 'RNAP switches from rnap-holo to rnap-ec at trackBlend = 0.5');
  assert.ok(maxRnapStep < 1.2, `no discontinuous RNAP pose jump across promoter escape (${maxRnapStep.toFixed(3)} A)`);
});

test('poseNtp and posePpi direct unit tests and performance budget (< 1.0 ms average)', () => {
  const M = machinePoseForRegister(rnapEc, 50);
  const ntpGrp = poseNtp({ base: 'G', path: 0.5, bonded: false, visible: true, phase: 'entering' }, M, rnapEc);
  assert.ok(ntpGrp && ntpGrp.visible);
  assert.equal(ntpGrp.id, 'ntp');
  assert.equal(ntpGrp.label, 'GTP');
  assert.ok(ntpGrp.count > 25);

  // When phase === 'leaving' or bonded === true, poseNtp returns null
  assert.equal(poseNtp({ base: 'G', path: 1, bonded: true, visible: false, phase: 'leaving' }, M, rnapEc, ntpGrp), null);

  const ppiGrp = posePpi({ path: 0.4, opacity: 0.6 }, M, rnapEc);
  assert.ok(ppiGrp && ppiGrp.visible);
  assert.equal(ppiGrp.id, 'ppi');
  assert.equal(ppiGrp.count, 9);
  assert.ok(Math.abs(ppiGrp.opacity - 0.6) < 1e-6);

  // Performance budget: warmed-up stateAt + poser.pose < 1.0 ms average
  const poser = createPoser({ construct: DEFAULT_SCENARIO, assets: ASSETS });
  const target = { asm: new Assembly(), groups: [], actors: [] };
  const world = createWorldState();

  for (let i = 0; i < 100; i++) {
    const t = 0.1 + (i / 100) * 66.0;
    stateAt(story, t, world);
    poser.pose(world, target);
  }

  const N = 400;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const t = 0.1 + (i / N) * 66.0;
    stateAt(story, t, world);
    poser.pose(world, target);
  }
  const avgMs = Number(process.hrtime.bigint() - t0) / (1e6 * N);
  console.log(`# Warmed-up stateAt + poser.pose average: ${avgMs.toFixed(3)} ms / frame (${N} frames)`);
  assert.ok(avgMs < 1.0, `average frame time ${avgMs.toFixed(3)} ms < 1.0 ms`);
});
