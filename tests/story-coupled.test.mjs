// R3-S5: Coupled transcription-translation mode tests (PLAN.md §5.3 items 1-8, §6.4 chapters 1-12, §10 R3-S5, DEC-024, DEC-032).
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
  complement,
  dnaToRna,
  reverseComplementRna,
} from '../js/science/index.js';
import { buildStory, stateAt, createWorldState } from '../js/sim/gene/story.js';
import { EXPRESSOME_ANCHOR, NUSG_DIR, buildCoupledTimeline } from '../js/sim/gene/coupled.js';
import { createPoser } from '../js/kin/pose.js';
import { composeFrame } from '../js/kin/frames.js';
import { machinePoseForRegister } from '../js/kin/duplex.js';
import { sampleTrack } from '../js/kin/track.js';
import { anticodonOf, residueCode3 } from '../js/kin/trna.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));
const IDS = ['rnap-holo', 'rnap-ec', 'nusg', 'ribosome-70s', 'trna-init', 'trna-aa', 'ef-tu', 'ef-g', 'if1', 'if2', 'if3', 'rf1'];
const ASSETS = Object.fromEntries(IDS.map(id => [id, loadAsset(id)]));
const ec = ASSETS['rnap-ec'];
const ribo = ASSETS['ribosome-70s'];
const nusg = ASSETS.nusg;

const story = buildStory(SCENARIO, ASSETS, { mode: 'coupled' });
const CODONS = codonTable(SCENARIO);
const RESIDUES = CODONS.slice(0, 40).map(c => residueCode3(c.aa3));
const ch = id => story.chapters.find(c => c.id === id);

const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
const world = createWorldState();
const target = { asm: new Assembly(), groups: [], actors: [] };

function poseAt(t, st = story) {
  stateAt(st, t, world);
  poser.pose(world, target);
  return { world, target, asm: target.asm };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const atomPos = (asm, nuc, name) => asm.position(asm.atomOf(nuc, name));
const MRNA0 = 496;
const AC0 = 675;
const WC = new Set(['AU', 'UA', 'GC', 'CG']);

function findEvent(st, type, targetId, pred = () => true) {
  return st.events.find(e => e.type === type && e.data.target === targetId && pred(e.data));
}

/** A time at which the tRNA of codon k rests paired in the P site in coupled mode (k = 1..40). */
function coupledPRestTime(k) {
  if (k === 1) return ch('couple-join').t0 + 4.0;
  if (k === 40) return ch('release').t0 + 2.0;
  const bond = findEvent(story, 'bond.peptide', `trna:${k % 4}`, d => d.codon === k + 1);
  return bond.t0 - 0.015;
}

function createBeadBuf(cap = 12000) {
  return {
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    z: new Float32Array(cap),
    r: new Float32Array(cap),
    chain: new Array(cap),
    count: 0,
  };
}

function fillL1Beads(machine, asset, buf) {
  const l1 = asset.lod1;
  const R = machine.transform.R;
  const o = machine.transform.o;
  let n = 0;
  for (let b = 0; b < l1.count; b++) {
    const chMeta = asset.chains[l1.chain[b]];
    const ps = machine.parts && machine.parts[chMeta.part];
    if (ps && (ps.visible === false || (ps.opacity ?? 1) <= 0.001)) continue;
    let x = l1.positions[3 * b];
    let y = l1.positions[3 * b + 1];
    let z = l1.positions[3 * b + 2];
    if (ps && ps.transform && ps.transform.o) {
      x += ps.transform.o[0];
      y += ps.transform.o[1];
      z += ps.transform.o[2];
    }
    buf.x[n] = R[0] * x + R[1] * y + R[2] * z + o[0];
    buf.y[n] = R[3] * x + R[4] * y + R[5] * z + o[1];
    buf.z[n] = R[6] * x + R[7] * y + R[8] * z + o[2];
    buf.r[n] = l1.kind[b] === 1 ? 2.4 : 1.9;
    buf.chain[n] = chMeta.name || l1.chain[b];
    n++;
  }
  buf.count = n;
  return buf;
}

const nearScratch = new Int32Array(256);

function maxNucPenetration(asm, nucId, buf) {
  const nu = asm.nucleotides[nucId];
  const ox = nu.frame.o[0], oy = nu.frame.o[1], oz = nu.frame.o[2];
  const bx = buf.x, by = buf.y, bz = buf.z, br = buf.r, bc = buf.count;
  let nb = 0;
  for (let i = 0; i < bc; i++) {
    const dx = ox - bx[i]; if (dx > 13 || dx < -13) continue;
    const dy = oy - by[i]; if (dy > 13 || dy < -13) continue;
    const dz = oz - bz[i]; if (dz > 13 || dz < -13) continue;
    if (dx * dx + dy * dy + dz * dz <= 169) {
      nearScratch[nb++] = i;
      if (nb === 256) break;
    }
  }
  let maxPen = -Infinity;
  let minDist = Infinity;
  let hitChain = '';
  if (nb === 0) return { maxPen, minDist, hitChain };
  const pos = asm.atoms.pos;
  for (let a = nu.atomStart; a < nu.atomStart + nu.atomCount; a++) {
    const x = pos[3 * a], y = pos[3 * a + 1], z = pos[3 * a + 2];
    for (let k = 0; k < nb; k++) {
      const i = nearScratch[k];
      const d = Math.hypot(x - bx[i], y - by[i], z - bz[i]);
      const pen = br[i] - d;
      if (d < minDist) { minDist = d; hitChain = buf.chain[i]; }
      if (pen > maxPen) maxPen = pen;
    }
  }
  return { maxPen, minDist, hitChain };
}

const rnapBeadBuf = createBeadBuf(5000);
const riboBeadBuf = createBeadBuf(12000);

test('S5 (DEC-024 / Argon L3): D = 38 edge case — 121.30 s, 62-nt pause, 39 cycles, remainingCodons = 0, Ch 11 = 11.0 s', () => {
  assert.equal(story.mode, 'coupled');
  assert.equal(story.chapters.length, 12);
  assert.equal(story.meta.D, 38);
  assert.equal(story.meta.cycles, 39);
  assert.ok(Math.abs(story.duration - 121.30) < 1e-6, `duration ${story.duration}`);

  const remainingNt = 179 - 24 - story.meta.D - 3 * story.meta.cycles;
  const remainingCodons = 40 - 1 - story.meta.cycles;
  assert.equal(remainingNt, 0);
  assert.equal(remainingCodons, 0);

  // Ch 6 reaches 24 + D = 62 nt and transcription pauses at 62 nt throughout Ch 7 (couple-scan) and Ch 8 (couple-join)
  const ch6 = ch('elongate-early');
  const ch7 = ch('couple-scan');
  const ch8 = ch('couple-join');
  const ch9 = ch('couple-run');
  const ch10 = ch('couple-terminate');
  const ch11 = ch('release');
  const ch12 = ch('finale');

  assert.ok(Math.abs((ch6.t1 - ch6.t0) - 7.5) < 1e-6);
  assert.ok(Math.abs((ch7.t1 - ch7.t0) - 10.0) < 1e-6);
  assert.ok(Math.abs((ch8.t1 - ch8.t0) - 7.5) < 1e-6);
  assert.ok(Math.abs((ch9.t1 - ch9.t0) - 42.9) < 1e-6);
  assert.ok(Math.abs((ch10.t1 - ch10.t0) - 4.0) < 1e-6);
  assert.ok(Math.abs((ch11.t1 - ch11.t0) - 11.0) < 1e-6, 'Ch 11 is release-only (11.0 s) at D = 38');
  assert.ok(Math.abs((ch12.t1 - ch12.t0) - 6.0) < 1e-6);

  for (const t of [ch7.t0 + 0.1, ch7.t0 + 5.0, ch7.t1 - 0.05, ch8.t0 + 0.5, ch8.t1 - 0.05]) {
    const w = stateAt(story, t);
    assert.equal(w.rna.length, 62, `paused at 24 + 38 = 62 nt at t=${t}`);
    assert.equal(w.counters.mrna, 62);
  }

  // Caption 8 substitutes {D} -> 38; no unresolved braces in any chapter
  assert.ok(ch8.caption.includes('38 nucleotides'), `caption 8: ${ch8.caption}`);
  for (const c of story.chapters) assert.ok(!c.caption.includes('{'), `unsubstituted placeholder in ${c.id}: ${c.caption}`);

  // buildCoupledTimeline agrees with buildStory
  const tl = buildCoupledTimeline(SCENARIO, ASSETS);
  assert.equal(tl.duration, story.duration);
  assert.equal(tl.meta.D, 38);
});

test('S5: non-zero remainingCodons case (D = 48) completes Ch 10 remaining nt and Ch 11 codons + 11.0 s release cleanly', () => {
  const story48 = buildStory(SCENARIO, ASSETS, { mode: 'coupled', D: 48 });
  assert.equal(story48.meta.D, 48);
  assert.equal(story48.meta.cycles, 35);
  const remainingNt = 179 - 24 - 48 - 3 * 35;
  const remainingCodons = 40 - 1 - 35;
  assert.equal(remainingNt, 2);
  assert.equal(remainingCodons, 4);
  assert.ok(Math.abs(story48.duration - 122.80) < 1e-6);

  const c10 = story48.chapters[9];
  const c11 = story48.chapters[10];
  assert.ok(Math.abs((c11.t1 - c11.t0) - (4 * 1.1 + 11.0)) < 1e-6);
  assert.ok(story48.chapters[7].caption.includes('48 nucleotides'));

  // Ch 10 finishes nt 178 & 179 before rna.release at +1.0 s
  assert.equal(stateAt(story48, c10.t0 + 0.01).rna.length, 177);
  assert.equal(stateAt(story48, c10.t0 + 0.99).rna.length, 179);

  // Ch 11 translates codons 37..40 (4.4 s) then RF1 releases the 40-aa peptide (11.0 s)
  const midElong = poseAt(c11.t0 + 2.5, story48);
  assert.ok(midElong.world.ribosome.codon >= 37 && midElong.world.ribosome.codon <= 40);
  const midRel = poseAt(c11.t0 + 4.4 + 4.0, story48);
  assert.equal(midRel.world.counters.codon, 41);
  assert.equal(midRel.world.peptide.length, 40);
  assert.equal(midRel.world.peptide.attach, 'free');
  assert.ok(midRel.world.machines.some(m => m.id === 'rf1'));
  const pep = midRel.target.groups.find(g => g.id === 'peptide');
  assert.equal(pep.residues.length, 40);
  assert.deepEqual(pep.residues.map(r => r.code3), RESIDUES);
});

test('S5: embedded EXPRESSOME_ANCHOR matches rnap-ec asset; expressome stays locked Ch 7-10a and continuous through Ch 10b-12', () => {
  assert.ok(dist(EXPRESSOME_ANCHOR.o, ec.anchors.expressome.o) < 1e-4);
  for (let i = 0; i < 9; i++) {
    assert.ok(Math.abs(EXPRESSOME_ANCHOR.R[i] - ec.anchors.expressome.R[i]) < 1e-5);
  }
  const nLen = Math.hypot(...NUSG_DIR);
  assert.ok(Math.abs(nLen - 1) < 1e-5, 'NUSG_DIR is unit length');

  const ch7 = ch('couple-scan');
  const ch9 = ch('couple-run');
  const ch10 = ch('couple-terminate');
  const ch11 = ch('release');
  const ch12 = ch('finale');

  // Expressome lock during Ch 7-10a: ribosome.layout === M_rnap(reg) · EXPRESSOME_ANCHOR
  for (const t of [ch7.t0 + 0.5, ch7.t0 + 8.0, ch9.t0 + 1.0, ch9.t0 + 20.0, ch9.t1 - 0.1, ch10.t0 + 0.5]) {
    const w = stateAt(story, t);
    const rnapM = w.machines.find(m => m.id === 'rnap');
    assert.ok(rnapM, `RNAP present at t=${t}`);
    const wantExp = composeFrame(rnapM.transform, EXPRESSOME_ANCHOR);
    assert.ok(dist(w.ribosome.layout.o, wantExp.o) < 1e-4, `expressome origin match at t=${t}`);
    for (let i = 0; i < 9; i++) {
      assert.ok(Math.abs(w.ribosome.layout.R[i] - wantExp.R[i]) < 1e-5, `expressome R[${i}] match at t=${t}`);
    }
    if (w.ribosome.bound) {
      const ribM = w.machines.find(m => m.id === 'ribosome');
      assert.ok(dist(ribM.transform.o, wantExp.o) < 1e-4, `bound ribosome transform matches expressome at t=${t}`);
    }
  }

  // Continuity across Ch 10 rna.release (+1.0 s), couple.unlock (+4.0 s), Ch 11 (release), and Ch 12 (finale)
  const endRnap = machinePoseForRegister(ec, 223);
  const frozenExp = composeFrame(endRnap, EXPRESSOME_ANCHOR);
  for (const t of [ch10.t0 + 0.999, ch10.t0 + 1.001, ch10.t0 + 2.5, ch10.t0 + 3.999, ch11.t0 + 0.001, ch11.t0 + 5.0, ch12.t0 + 3.0]) {
    const w = stateAt(story, t);
    const ribM = w.machines.find(m => m.id === 'ribosome');
    assert.ok(ribM, `ribosome present at t=${t}`);
    assert.ok(dist(w.ribosome.layout.o, frozenExp.o) < 1e-3, `layout continuous at t=${t}`);
    assert.ok(dist(ribM.transform.o, frozenExp.o) < 1e-3, `ribosome stays at frozen expressome at t=${t}`);
  }
});

test('S5: NusG enter (Ch 8 [6.0, 7.5] s), bound (Ch 9-10a), leave (Ch 10 [1.0, 2.0] s), and L1 clearance along approach', () => {
  const ch8 = ch('couple-join');
  const ch9 = ch('couple-run');
  const ch10 = ch('couple-terminate');

  // Absent before Ch 8 +6.0 s
  assert.ok(!stateAt(story, ch8.t0 + 5.95).machines.some(m => m.id === 'nusg'));

  // Entering during Ch 8 [6.0, 7.5] s (220 Å -> 0 Å along NUSG_DIR, opacity 0 -> 1 over first 40%)
  const wMidEnter = stateAt(story, ch8.t0 + 6.75);
  const nMid = wMidEnter.machines.find(m => m.id === 'nusg');
  const rMid = wMidEnter.machines.find(m => m.id === 'rnap');
  assert.ok(nMid && nMid.assetId === 'nusg' && nMid.label === 'NusG' && nMid.pickable === true);
  assert.ok(Math.abs(dist(nMid.transform.o, rMid.transform.o) - 110) < 1e-3, 'halfway along 220 Å approach at p=0.5');
  assert.equal(nMid.opacity, 1, 'opacity reaches 1 by p=0.4');

  const wEarly = stateAt(story, ch8.t0 + 6.3); // p = 0.2 -> fade = ease(0.5) = 0.5
  const nEarly = wEarly.machines.find(m => m.id === 'nusg');
  assert.ok(nEarly && Math.abs(nEarly.opacity - 0.5) < 1e-3);

  // Bound at M_rnap throughout Ch 9 and Ch 10 [0, 1.0] s
  for (const t of [ch9.t0 + 0.1, ch9.t0 + 21.0, ch9.t1 - 0.05, ch10.t0 + 0.5, ch10.t0 + 0.99]) {
    const w = stateAt(story, t);
    const nm = w.machines.find(m => m.id === 'nusg');
    const rm = w.machines.find(m => m.id === 'rnap');
    assert.ok(nm && rm);
    assert.ok(dist(nm.transform.o, rm.transform.o) < 1e-5, `NusG bound in rnap frame at t=${t}`);
    assert.equal(nm.opacity, 1);
  }

  // Leaving during Ch 10 [1.0, 2.0] s (0 -> 60 Å along NUSG_DIR, fade over last 60%)
  const wLeaveMid = stateAt(story, ch10.t0 + 1.5);
  const nLeave = wLeaveMid.machines.find(m => m.id === 'nusg');
  const endRnap = machinePoseForRegister(ec, 223);
  assert.ok(nLeave);
  assert.ok(Math.abs(dist(nLeave.transform.o, endRnap.o) - 30) < 1e-2, 'halfway along 60 Å release at p=0.5');
  assert.ok(nLeave.opacity > 0.5 && nLeave.opacity < 1.0);

  // Absent after Ch 10 +2.0 s
  assert.ok(!stateAt(story, ch10.t0 + 2.05).machines.some(m => m.id === 'nusg'));

  // Zero L1 clash between NusG and RNAP/ribosome along approach [5, 220] Å
  const nusgLocal = [];
  for (let b = 0; b < nusg.lod1.count; b++) {
    nusgLocal.push([nusg.lod1.positions[3 * b], nusg.lod1.positions[3 * b + 1], nusg.lod1.positions[3 * b + 2], 1.9]);
  }
  const host = [];
  for (let b = 0; b < ec.lod1.count; b++) {
    host.push([ec.lod1.positions[3 * b], ec.lod1.positions[3 * b + 1], ec.lod1.positions[3 * b + 2], ec.lod1.kind[b] === 1 ? 2.4 : 1.9]);
  }
  const R = ec.anchors.expressome.R;
  const o = ec.anchors.expressome.o;
  for (let b = 0; b < ribo.lod1.count; b++) {
    const px = ribo.lod1.positions[3 * b], py = ribo.lod1.positions[3 * b + 1], pz = ribo.lod1.positions[3 * b + 2];
    host.push([
      R[0] * px + R[1] * py + R[2] * pz + o[0],
      R[3] * px + R[4] * py + R[5] * pz + o[1],
      R[6] * px + R[7] * py + R[8] * pz + o[2],
      ribo.lod1.kind[b] === 1 ? 2.4 : 1.9,
    ]);
  }
  let minApproachClear = Infinity;
  for (const s of [5, 10, 20, 40, 60, 120, 220]) {
    for (const a of nusgLocal) {
      const ax = a[0] + NUSG_DIR[0] * s;
      const ay = a[1] + NUSG_DIR[1] * s;
      const az = a[2] + NUSG_DIR[2] * s;
      for (const h of host) {
        const dx = ax - h[0]; if (dx > 8 || dx < -8) continue;
        const dy = ay - h[1]; if (dy > 8 || dy < -8) continue;
        const dz = az - h[2]; if (dz > 8 || dz < -8) continue;
        const c = Math.hypot(dx, dy, dz) - (a[3] + h[3]);
        if (c < minApproachClear) minApproachClear = c;
      }
    }
  }
  assert.ok(minApproachClear > 0, `NusG approach L1 clearance ${minApproachClear.toFixed(2)} Å > 0`);
});

test('S5 (§10 R3-S5): P-site to RNA 3′ end = D throughout couple-run; L0 footprints never overlap; RNAP–ribo L1 zero clash', () => {
  const ch9 = ch('couple-run');
  const D = story.meta.D; // 38

  // 1. At every cycle boundary in couple-run (j = 0..39), distance from P-site codon start to RNA 3' end === D exactly
  let minBoundSpan = Infinity, maxBoundSpan = -Infinity;
  for (let j = 0; j <= story.meta.cycles; j++) {
    const t = Math.min(ch9.t1 - 1e-4, ch9.t0 + j * 1.1);
    stateAt(story, t, world);
    const p0 = 24 + 3 * (world.ribosome.codon - 1);
    const span = world.rna.length - p0;
    minBoundSpan = Math.min(minBoundSpan, span);
    maxBoundSpan = Math.max(maxBoundSpan, span);
    assert.ok(Math.abs(span - D) <= 1.0, `cycle ${j} boundary span ${span} vs D=${D}`);
  }
  assert.equal(minBoundSpan, D);
  assert.equal(maxBoundSpan, D);

  // Also check dense intra-cycle sampling: 3 nt transcribed per 1.1 s cycle while ribosome translocates at [0.6, 1.0] s,
  // so continuous (L + addProg) - p0 stays in [D - 1, D + 2] and L0 footprints [p0-16, p0+7] vs [L-9, L-1] never overlap.
  let minGapNt = Infinity;
  let minSpanAny = Infinity, maxSpanAny = -Infinity;
  for (let i = 0; i < 400; i++) {
    const t = ch9.t0 + ((i + 0.5) / 400) * (ch9.t1 - ch9.t0);
    stateAt(story, t, world);
    const p0 = 24 + 3 * (world.ribosome.codon - 1);
    const span = world.rna.length - p0;
    minSpanAny = Math.min(minSpanAny, span);
    maxSpanAny = Math.max(maxSpanAny, span);
    const ribo3End = p0 + 7;       // 6ZTJ observed 30S mRNA entry channel (AV:23)
    const rnap5End = world.rna.length - 9; // RNAP 9-bp hybrid 5' boundary
    const gap = rnap5End - ribo3End;
    if (gap < minGapNt) minGapNt = gap;
    assert.ok(gap > 0, `L0 footprints overlap at t=${t.toFixed(2)}: ribo3End=${ribo3End}, rnap5End=${rnap5End}`);
  }
  console.log(`# couple-run: cycle-boundary span=[${minBoundSpan}, ${maxBoundSpan}], intra-cycle span=[${minSpanAny.toFixed(2)}, ${maxSpanAny.toFixed(2)}], min L0 footprint gap=${minGapNt.toFixed(2)} nt`);

  // 2. RNAP L1 vs Ribosome L1 across bound expressome poses (Ch 7 bound through Ch 10a)
  let minRnapRiboDist = Infinity;
  for (const t of [ch('couple-join').t0 + 5.0, ch9.t0 + 15.0, ch('couple-terminate').t0 + 0.5]) {
    stateAt(story, t, world);
    const rnapM = world.machines.find(m => m.id === 'rnap');
    const ribM = world.machines.find(m => m.id === 'ribosome');
    const bRnap = fillL1Beads(rnapM, ec, rnapBeadBuf);
    const bRibo = fillL1Beads(ribM, ribo, riboBeadBuf);
    for (let i = 0; i < bRnap.count; i++) {
      const ax = bRnap.x[i], ay = bRnap.y[i], az = bRnap.z[i];
      for (let j = 0; j < bRibo.count; j++) {
        const dx = ax - bRibo.x[j]; if (dx > 12 || dx < -12) continue;
        const dy = ay - bRibo.y[j]; if (dy > 12 || dy < -12) continue;
        const dz = az - bRibo.z[j]; if (dz > 12 || dz < -12) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < minRnapRiboDist) minRnapRiboDist = d;
      }
    }
  }
  console.log(`# RNAP L1 vs Ribosome L1 min center distance = ${minRnapRiboDist.toFixed(3)} A (0 contacts < 5 A)`);
  assert.ok(minRnapRiboDist >= 7.0, `RNAP-ribo L1 clash: min dist ${minRnapRiboDist.toFixed(3)} Å`);
});

test('S5 (ST8 S-04): posed terminator hairpin clears ribosome L1 (uS3) and RNAP L1 (<= 1.0 Å) across Ch 9 folding & Ch 10 completion', () => {
  const ch9 = ch('couple-run');
  const ch10 = ch('couple-terminate');
  const sampleTimes = [];
  for (let i = 0; i < 32; i++) sampleTimes.push(ch9.t1 - 6.0 + (i / 31) * 6.0);
  for (let i = 0; i < 16; i++) sampleTimes.push(ch10.t0 + (i / 15) * 0.99);

  let worstRiboPen = -Infinity, minRiboDist = Infinity, worstRiboDesc = '';
  let worstRiboFullPen = -Infinity, minRiboFullDist = Infinity, worstRiboFullDesc = '';
  let worstRnapPen = -Infinity, minRnapDist = Infinity;

  for (const t of sampleTimes) {
    const { asm } = poseAt(t);
    const rm = world.machines.find(m => m.id === 'ribosome');
    const em = world.machines.find(m => m.id === 'rnap');
    const rBeads = fillL1Beads(rm, ribo, riboBeadBuf);
    const eBeads = fillL1Beads(em, ec, rnapBeadBuf);
    const L = world.rna.length;
    const isFull = t >= ch10.t0;
    for (let j = 151; j <= Math.min(170, L - 1); j++) {
      const rr = maxNucPenetration(asm, MRNA0 + j, rBeads);
      if (rr.minDist < minRiboDist) { minRiboDist = rr.minDist; worstRiboDesc = `j=${j} t=${t.toFixed(2)} ${rr.hitChain}`; }
      if (rr.maxPen > worstRiboPen) worstRiboPen = rr.maxPen;
      if (isFull) {
        if (rr.minDist < minRiboFullDist) { minRiboFullDist = rr.minDist; worstRiboFullDesc = `j=${j} t=${t.toFixed(2)} ${rr.hitChain}`; }
        if (rr.maxPen > worstRiboFullPen) worstRiboFullPen = rr.maxPen;
      }
      const er = maxNucPenetration(asm, MRNA0 + j, eBeads);
      if (er.minDist < minRnapDist) minRnapDist = er.minDist;
      if (er.maxPen > worstRnapPen) worstRnapPen = er.maxPen;
    }
  }
  console.log(`# S-04 hairpin vs Ribo L1 (Ch 9-10a): minDist=${minRiboDist.toFixed(3)} A, maxPen=${worstRiboPen.toFixed(3)} A (${worstRiboDesc})`);
  console.log(`# S-04 hairpin vs Ribo L1 (Ch 10a full fold): minDist=${minRiboFullDist.toFixed(3)} A, maxPen=${worstRiboFullPen.toFixed(3)} A (${worstRiboFullDesc})`);
  console.log(`# S-04 hairpin vs RNAP L1 (Ch 9-10a): minDist=${minRnapDist.toFixed(3)} A, maxPen=${worstRnapPen.toFixed(3)} A`);
  assert.ok(worstRiboPen <= 1.0, `S-04 hairpin vs Ribo L1 penetration ${worstRiboPen.toFixed(3)} > 1.0 Å`);
  assert.ok(worstRnapPen <= 1.0, `S-04 hairpin vs RNAP L1 penetration ${worstRnapPen.toFixed(3)} > 1.0 Å`);
});

test('§5.3 Items 1 & 2: sequence fidelity, monotonic integer mRNA length (0..179), and bit-for-bit Float32Array seek determinism across all 12 chapters', () => {
  // Item 1: transcript equals coding [45, 224) with T->U and reverse complement of template
  const codingSlice = SCENARIO.codingDna.slice(45, 224);
  assert.equal(SCENARIO.mrna, dnaToRna(codingSlice));
  assert.equal(SCENARIO.templateDna, complement(SCENARIO.codingDna));
  const templateSlice5to3 = SCENARIO.templateDna.slice(45, 224).split('').reverse().join('');
  assert.equal(SCENARIO.mrna, reverseComplementRna(dnaToRna(templateSlice5to3)));

  // Item 2a: monotonic integer mRNA length across all 12 chapters
  let prevLen = 0;
  for (const c of story.chapters) {
    for (let i = 0; i < 64; i++) {
      const t = c.t0 + ((i + 0.5) / 64) * (c.t1 - c.t0);
      stateAt(story, t, world);
      assert.ok(Number.isInteger(world.rna.length));
      assert.ok(world.rna.length >= prevLen && world.rna.length <= 179);
      assert.equal(world.rna.length, world.counters.mrna);
      prevLen = world.rna.length;
    }
  }
  assert.equal(prevLen, 179);

  // Item 2b: bit-for-bit Float32Array determinism across forward, backward, and scrambled seek orders (36 times across all 12 chapters)
  const checkTimes = [];
  for (const c of story.chapters) {
    checkTimes.push(c.t0 + 0.1 * (c.t1 - c.t0), c.t0 + 0.5 * (c.t1 - c.t0), c.t0 + 0.9 * (c.t1 - c.t0));
  }
  const pA = createPoser({ construct: SCENARIO, assets: ASSETS });
  const pB = createPoser({ construct: SCENARIO, assets: ASSETS });
  const tgA = { asm: new Assembly(), groups: [], actors: [] };
  const tgB = { asm: new Assembly(), groups: [], actors: [] };
  const wA = createWorldState();
  const wB = createWorldState();

  const ref = new Map();
  for (const t of checkTimes) {
    stateAt(story, t, wA);
    pA.pose(wA, tgA);
    const pep = tgA.groups.find(g => g.id === 'peptide');
    ref.set(t, {
      pos: Float32Array.from(tgA.asm.atoms.pos),
      pepPos: pep ? Float32Array.from(pep.pos.subarray(0, pep.count * 3)) : null,
      actors: JSON.stringify(tgA.actors.map(a => ({ id: a.id, o: a.transform.o, R: a.transform.R, op: a.opacity }))),
    });
  }

  // Scrambled order
  const scrambled = checkTimes.map((t, i) => checkTimes[(i * 17 + 5) % checkTimes.length]);
  for (const t of [...checkTimes].reverse().concat(scrambled)) {
    stateAt(story, t, wB);
    pB.pose(wB, tgB);
    const r = ref.get(t);
    assert.deepEqual(Float32Array.from(tgB.asm.atoms.pos), r.pos, `bit-identical Assembly pos at t=${t.toFixed(3)}`);
    const pep = tgB.groups.find(g => g.id === 'peptide');
    if (r.pepPos) {
      assert.ok(pep);
      assert.deepEqual(Float32Array.from(pep.pos.subarray(0, pep.count * 3)), r.pepPos, `bit-identical peptide pos at t=${t.toFixed(3)}`);
    } else {
      assert.equal(pep, undefined);
    }
    const actStr = JSON.stringify(tgB.actors.map(a => ({ id: a.id, o: a.transform.o, R: a.transform.R, op: a.opacity })));
    assert.equal(actStr, r.actors, `bit-identical actors at t=${t.toFixed(3)}`);
  }
});

test('§5.3 Items 3, 4, 5 & 6: P-site codon indexing, peptide fidelity, fMet direct to P, WC pairing in both P and A sites', () => {
  const C1 = (asm, id) => atomPos(asm, id, "C1'");

  // Items 3, 4, 6 (P site across all 40 codons)
  for (let k = 1; k <= 40; k++) {
    const t = coupledPRestTime(k);
    const { asm } = poseAt(t);
    assert.equal(world.ribosome.codon, k, `P-site codon ${k} at t=${t.toFixed(3)}`);
    const pT = world.trnas.find(x => x.site === 'P' && x.blend === 1);
    assert.ok(pT && pT.codon === k && pT.pair === 1, `paired P-tRNA for codon ${k}`);
    assert.equal(pT.kind, k === 1 ? 'init' : 'aa');

    const j0 = 24 + 3 * (k - 1);
    for (let q = 0; q < 3; q++) {
      const want = composeFrame(world.ribosome.layout, sampleTrack(ribo.tracks.mrna, q, { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] }));
      assert.ok(dist(asm.nucleotides[MRNA0 + j0 + q].frame.o, want.o) < 1.0, `codon ${k} nt ${q} on track register ${q}`);
      const ac = AC0 + 3 * (k - 1) + q;
      const cn = MRNA0 + j0 + 2 - q;
      const pair = asm.pairs[248 + 3 * (k - 1) + q];
      assert.equal(pair.a, cn);
      assert.equal(pair.b, ac);
      assert.ok(WC.has(pair.type), `P-site WC ${pair.type}`);
      assert.equal(pair.strength, 1);
      const d = dist(C1(asm, ac), C1(asm, cn));
      assert.ok(Math.abs(d - 10.5) <= 0.3, `P-site codon ${k} C1′-C1′ ${d.toFixed(3)}`);
    }
    const pep = target.groups.find(g => g.id === 'peptide');
    assert.equal(world.peptide.length, k);
    assert.deepEqual(pep.residues.map(r => r.code3), RESIDUES.slice(0, k));
  }

  // Item 6 (A site Watson-Crick pairing at trna.move AT->A end for codons 2..40)
  for (let k = 2; k <= 40; k++) {
    const mv = findEvent(story, 'trna.move', `trna:${(k - 1) % 4}`, d => d.from === 'AT' && d.to === 'A' && d.codon === k);
    assert.ok(mv, `AT->A move event for codon ${k}`);
    const { asm } = poseAt(mv.t1);
    const aT = world.trnas.find(x => x.codon === k && x.site === 'A');
    assert.ok(aT && aT.pair === 1, `A-site tRNA paired for codon ${k}`);
    const j0 = 24 + 3 * (k - 1);
    for (let q = 0; q < 3; q++) {
      const ac = AC0 + 3 * (k - 1) + q;
      const cn = MRNA0 + j0 + 2 - q;
      const pair = asm.pairs[248 + 3 * (k - 1) + q];
      assert.ok(WC.has(pair.type), `A-site WC ${pair.type}`);
      assert.equal(pair.strength, 1);
      const d = dist(C1(asm, ac), C1(asm, cn));
      assert.ok(Math.abs(d - 10.5) <= 0.3, `A-site codon ${k} C1′-C1′ ${d.toFixed(3)}`);
    }
  }

  // Item 4: 0 residues added at codon 41 (UAA), RF1 binds, peptide released; C(i)-N(i+1) within 1.33 +/- 0.25 A
  const ch11 = ch('release');
  const ch12 = ch('finale');
  for (const t of [ch11.t0 + 0.5, ch11.t0 + 4.0, ch11.t0 + 8.0, ch12.t0 + 3.0, story.duration - 0.01]) {
    poseAt(t);
    assert.equal(world.peptide.length, 40);
    const pep = target.groups.find(g => g.id === 'peptide');
    assert.equal(pep.residues.length, 40);
    assert.equal(pep.residues[39].code3, 'LEU');
    assert.ok(!world.trnas.some(x => x.codon > 40));
  }
  poseAt(ch11.t0 + 4.0);
  assert.equal(world.counters.codon, 41);
  assert.ok(world.machines.some(m => m.id === 'rf1'));
  assert.equal(world.peptide.attach, 'free');

  let maxCN = 0;
  for (let ci = 6; ci < 12; ci++) {
    const c = story.chapters[ci];
    for (let i = 0; i < 32; i++) {
      poseAt(c.t0 + ((i + 0.5) / 32) * (c.t1 - c.t0));
      const pep = target.groups.find(g => g.id === 'peptide');
      if (!pep) continue;
      const R = pep.residues;
      const findAtom = (r, name) => {
        for (let a = R[r].atomStart; a < R[r].atomStart + R[r].atomCount; a++) if (pep.names[a] === name) return a;
        return -1;
      };
      const P = a => [pep.pos[3 * a], pep.pos[3 * a + 1], pep.pos[3 * a + 2]];
      for (let r = 0; r + 1 < R.length; r++) {
        maxCN = Math.max(maxCN, Math.abs(dist(P(findAtom(r, 'C')), P(findAtom(r + 1, 'N'))) - 1.33));
      }
    }
  }
  assert.ok(maxCN <= 0.25, `max |C-N - 1.33| = ${maxCN.toFixed(3)} Å`);

  // Item 5: fMet-tRNA placed directly in P site, never A/T or A
  let sawInit = 0;
  for (let t = ch('couple-scan').t0; t < story.duration; t += 0.05) {
    stateAt(story, t, world);
    for (const tr of world.trnas) {
      if (tr.kind === 'init') {
        assert.ok(!['AT', 'A', 'AP'].includes(tr.site) && !['AT', 'A', 'AP'].includes(tr.from), `fMet at ${tr.from}->${tr.site} t=${t}`);
        sawInit++;
      }
    }
  }
  assert.ok(sawInit > 50);
});

test('§5.3 Item 7: bubble <= 15 bp and DNA outside bubble fully paired across ALL 12 chapters (including Ch 10-12 re-annealing)', () => {
  for (let ci = 0; ci < 12; ci++) {
    const c = story.chapters[ci];
    for (let i = 0; i < 64; i++) {
      const t = c.t0 + ((i + 0.5) / 64) * (c.t1 - c.t0);
      const { asm } = poseAt(t);
      const [bLo, bHi] = world.dna.bubble;
      const beta = world.dna.bend * (1 - world.dna.relax);
      const isOpen = beta > 0 && bHi > bLo;
      const width = isOpen ? (bHi - bLo + 1) : 0;
      assert.ok(width <= 15, `ch ${ci + 1} bubble width ${width} <= 15`);
      if (ci < 2 || ci >= 10) {
        assert.equal(width, 0, `bubble closed in ch ${ci + 1} at t=${t.toFixed(2)}`);
      }
      const reg = world.dna.register;
      const gMin = isOpen ? Math.ceil(reg + bLo) : 1e9;
      const gMax = isOpen ? Math.floor(reg + bHi) : -1e9;
      for (let g = 0; g < 248; g++) {
        const want = (g < gMin || g > gMax) ? 1 : 0;
        assert.equal(asm.pairs[g].strength, want, `ch ${ci + 1} bp ${g} strength at t=${t.toFixed(2)}`);
      }
    }
  }
});

test('§5.3 Item 8: 64 samples/chapter across ALL 12 chapters (no bound guard) — DNA, mRNA & anticodons clear both RNAP L1 and ribosome L1 (<= 1.0 Å)', () => {
  let worstRnapDna = -Infinity;
  let worstRnapRna = -Infinity;
  let worstRiboRna = -Infinity;
  let worstRiboAc = -Infinity;
  let where = '';

  for (let ci = 0; ci < 12; ci++) {
    const c = story.chapters[ci];
    for (let i = 0; i < 64; i++) {
      const t = c.t0 + ((i + 0.5) / 64) * (c.t1 - c.t0);
      const { asm } = poseAt(t);
      const L = world.rna.length;

      const rnapM = world.machines.find(m => m.id === 'rnap');
      if (rnapM && rnapM.visible !== false) {
        const rnapAsset = ASSETS[rnapM.assetId] || ec;
        const eBeads = fillL1Beads(rnapM, rnapAsset, rnapBeadBuf);
        if (world.dna.bend === 1 && world.dna.relax === 0) {
          const reg = world.dna.register;
          const r0 = rnapM.assetId === 'rnap-holo' ? -45 : -15;
          const r1 = rnapM.assetId === 'rnap-holo' ? 11 : 13;
          const gLo = Math.max(0, Math.ceil(reg + r0));
          const gHi = Math.min(247, Math.floor(reg + r1));
          for (let g = gLo; g <= gHi; g++) {
            const p0 = maxNucPenetration(asm, g, eBeads).maxPen;
            const p1 = maxNucPenetration(asm, 248 + g, eBeads).maxPen;
            const pm = Math.max(p0, p1);
            if (pm > worstRnapDna) worstRnapDna = pm;
            assert.ok(pm <= 1.0, `RNAP-DNA pen ${pm.toFixed(3)} > 1.0 Å at ch=${ci + 1} g=${g} t=${t.toFixed(2)}`);
          }
        }
        if (!world.rna.released && L > 0) {
          const H = Math.min(L, 9);
          const startJ = world.rna.layout === 'coupled'
            ? 0
            : (world.rna.hairpin > 0 ? Math.min(151, L - H) : (L - H));
          for (let j = Math.max(0, startJ); j < L; j++) {
            const pr = maxNucPenetration(asm, MRNA0 + j, eBeads).maxPen;
            if (pr > worstRnapRna) worstRnapRna = pr;
            assert.ok(pr <= 1.0, `RNAP-mRNA pen ${pr.toFixed(3)} > 1.0 Å at ch=${ci + 1} j=${j} t=${t.toFixed(2)}`);
          }
        }
      }

      const ribM = world.machines.find(m => m.id === 'ribosome');
      if (ribM && ribM.visible !== false) {
        // No `ribosome.bound` guard (DEC-030): checks 30S docking in Ch 7 as well as Ch 8-12!
        const rBeads = fillL1Beads(ribM, ribo, riboBeadBuf);
        for (let j = 0; j < L; j++) {
          const pr = maxNucPenetration(asm, MRNA0 + j, rBeads).maxPen;
          if (pr > worstRiboRna) { worstRiboRna = pr; where = `ch=${ci + 1} mRNA ${j} t=${t.toFixed(2)}`; }
          assert.ok(pr <= 1.0, `Ribo-mRNA pen ${pr.toFixed(3)} > 1.0 Å at ch=${ci + 1} j=${j} t=${t.toFixed(2)}`);
        }
        for (const tr of world.trnas) {
          if (tr.approach > 0 || tr.depart > 0) continue;
          for (let q = 0; q < 3; q++) {
            const pa = maxNucPenetration(asm, AC0 + 3 * (tr.codon - 1) + q, rBeads).maxPen;
            if (pa > worstRiboAc) worstRiboAc = pa;
            assert.ok(pa <= 1.0, `Ribo-anticodon pen ${pa.toFixed(3)} > 1.0 Å at ch=${ci + 1} k=${tr.codon}/${q} t=${t.toFixed(2)}`);
          }
        }
      }
    }
  }
  console.log(`# §5.3 Item 8 (768 coupled samples): maxRnapDna=${worstRnapDna.toFixed(3)} A, maxRnapRna=${worstRnapRna.toFixed(3)} A, maxRiboRna=${worstRiboRna.toFixed(3)} A (${where}), maxRiboAc=${worstRiboAc.toFixed(3)} A`);
});

test('S5 performance & GC: coupled stateAt median <= 2.0 ms, pose median <= 6.0 ms, bounded heap over 10,000 reused calls', () => {
  const out = createWorldState();
  const times = new Float64Array(10000);
  for (let i = 0; i < 10000; i++) times[i] = ((i * 0.6180339887) % 1) * story.duration;

  for (let i = 0; i < 2000; i++) stateAt(story, times[i], out);
  const cplPool = out._cplPool;
  const tlPool = out._tlPool;

  // Heap growth over 16 x 10,000 reused-out stateAt calls (DEC-029 nursery-sawtooth-safe metric <= 1 MB)
  const REPS = 16;
  const growth = [];
  if (global.gc) global.gc();
  const hStart = process.memoryUsage().heapUsed;
  for (let rep = 0; rep < REPS; rep++) {
    if (global.gc) global.gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10000; i++) stateAt(story, times[i], out);
    if (global.gc) global.gc();
    growth.push(process.memoryUsage().heapUsed - h0);
  }
  const netPer10k = (process.memoryUsage().heapUsed - hStart) / REPS;
  growth.sort((a, b) => a - b);
  const heapMetric = global.gc ? growth[REPS >> 1] : Math.min(growth[REPS >> 1], netPer10k);
  assert.equal(out._cplPool, cplPool);
  assert.equal(out._tlPool, tlPool);
  assert.ok(heapMetric <= 1024 * 1024, `coupled stateAt heap growth ${heapMetric} bytes > 1 MB`);

  // Timing budgets: stateAt <= 2.0 ms median, pose <= 6.0 ms median across 240 evenly spaced samples
  const dtsState = [];
  const dtsPose = [];
  for (let i = 0; i < 40; i++) {
    stateAt(story, (story.duration * i) / 39, out);
    poser.pose(out, target);
  }
  for (let i = 0; i < 240; i++) {
    const t = (story.duration * i) / 239;
    const t0 = performance.now();
    stateAt(story, t, out);
    const t1 = performance.now();
    poser.pose(out, target);
    const t2 = performance.now();
    dtsState.push(t1 - t0);
    dtsPose.push(t2 - t1);
  }
  dtsState.sort((a, b) => a - b);
  dtsPose.sort((a, b) => a - b);
  const medState = dtsState[dtsState.length >> 1];
  const medPose = dtsPose[dtsPose.length >> 1];
  console.log(`# Coupled perf: stateAt median=${medState.toFixed(4)} ms, pose median=${medPose.toFixed(4)} ms, heap metric=${Math.round(heapMetric)} B (net/10k=${Math.round(netPer10k)} B)`);
  assert.ok(medState <= 2.0, `coupled stateAt median ${medState.toFixed(4)} ms > 2.0 ms`);
  assert.ok(medPose <= 6.0, `coupled pose median ${medPose.toFixed(4)} ms > 6.0 ms`);
});

test('coupled decoding chapters drop the mRNA end tags (DEC-030 rule; R3-INT4, V1 M-03)', async () => {
  const { selectLabels } = await import('../js/scene/labels.js');
  for (const id of ['couple-run', 'release']) {
    const c = ch(id);
    for (const f of [0.1, 0.5, 0.9]) {
      const w = createWorldState();
      stateAt(story, c.t0 + f * (c.t1 - c.t0), w);
      const texts = selectLabels(w, ASSETS, { enabled: true }).map(l => l.text);
      assert.ok(!texts.includes('mRNA 5′') && !texts.includes('mRNA 3′'), `${id} @${f}: ${texts.join(', ')}`);
    }
  }
});
