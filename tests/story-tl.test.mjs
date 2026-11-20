// R3-S4: Translation choreography (PLAN.md §5.3 items 3-6 and 8, §6.1 chapters 8-16, §6.2 caption 14, §10 R3-S4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../js/assets/format.js';
import { Assembly, TRUE_SCALE_GENE_CONSTRUCT as SCENARIO, codonTable } from '../js/science/index.js';
import { buildStory, stateAt, createWorldState } from '../js/sim/gene/story.js';
import { RIBO_LAYOUT, FACTOR_DIRS, LARGE_DIR } from '../js/sim/gene/translation.js';
import { createPoser } from '../js/kin/pose.js';
import { composeFrame } from '../js/kin/frames.js';
import { sampleTrack } from '../js/kin/track.js';
import { anticodonOf, residueCode3 } from '../js/kin/trna.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));
const IDS = ['rnap-holo', 'rnap-ec', 'nusg', 'ribosome-70s', 'trna-init', 'trna-aa', 'ef-tu', 'ef-g', 'if1', 'if2', 'if3', 'rf1'];
const ASSETS = Object.fromEntries(IDS.map(id => [id, loadAsset(id)]));
const ribo = ASSETS['ribosome-70s'];
const story = buildStory(SCENARIO, ASSETS);
const CODONS = codonTable(SCENARIO);
const RESIDUES = CODONS.slice(0, 40).map(c => residueCode3(c.aa3));
const ch = id => story.chapters.find(c => c.id === id);
const TL_CHAPTERS = story.chapters.slice(7); // chapters 8-16

const poser = createPoser({ construct: SCENARIO, assets: ASSETS });
const world = createWorldState();
const target = { asm: new Assembly(), groups: [], actors: [] };
function poseAt(t) {
  stateAt(story, t, world);
  poser.pose(world, target);
  return { world, target, asm: target.asm };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const atom = (asm, nuc, name) => asm.position(asm.atomOf(nuc, name));
const MRNA0 = 496;
const AC0 = 675;
const WC = new Set(['AU', 'UA', 'GC', 'CG']);

/** Event of `type` for `target` whose data matches `pred`. */
function findEvent(type, targetId, pred = () => true) {
  return story.events.find(e => e.type === type && e.data.target === targetId && pred(e.data));
}
/** A time at which the tRNA of codon k rests in the P site (paired), k = 1..40. */
function pRestTime(k) {
  if (k === 1) return ch('decode').t0 + 6.0; // fMet-tRNA in P while Ala-tRNA is in A/T
  if (k === 40) return ch('release').t0 + 2.0;
  const bond = findEvent('bond.peptide', `trna:${k % 4}`, d => d.codon === k + 1);
  return bond.t0 - 0.02; // cycle k+1: codon k in P, codon k+1 just accommodated in A
}

function l1Beads(machine, asset) {
  const l1 = asset.lod1, R = machine.transform.R, o = machine.transform.o;
  const out = [];
  for (let b = 0; b < l1.count; b++) {
    const part = asset.chains[l1.chain[b]].part;
    const ps = machine.parts && machine.parts[part];
    if (ps && (ps.visible === false || (ps.opacity ?? 1) <= 0.001)) continue;
    let x = l1.positions[3 * b], y = l1.positions[3 * b + 1], z = l1.positions[3 * b + 2];
    if (ps && ps.transform) { x += ps.transform.o[0]; y += ps.transform.o[1]; z += ps.transform.o[2]; }
    out.push([R[0] * x + R[1] * y + R[2] * z + o[0], R[3] * x + R[4] * y + R[5] * z + o[1], R[6] * x + R[7] * y + R[8] * z + o[2], l1.kind[b] === 1 ? 2.4 : 1.9]);
  }
  return out;
}
function maxPenetration(asm, nucId, beads) {
  const n = asm.nucleotides[nucId];
  const pos = asm.atoms.pos;
  let m = -Infinity;
  for (let a = n.atomStart; a < n.atomStart + n.atomCount; a++) {
    const x = pos[3 * a], y = pos[3 * a + 1], z = pos[3 * a + 2];
    for (const b of beads) {
      const dx = x - b[0];
      if (dx > 4 || dx < -4) continue;
      const p = b[3] - Math.hypot(dx, y - b[1], z - b[2]);
      if (p > m) m = p;
    }
  }
  return m;
}

test('S4: embedded ribosome layout and factor directions match the assets (§10 R3-S4 layout rule)', () => {
  // Re-derive the layout from the poser at the end of chapter 7: 250 Å along -z from the mRNA midpoint,
  // +z along the SD tangent (nt 12 -> 17), +x = perpendicular component of world -z.
  const fresh = createPoser({ construct: SCENARIO, assets: { 'rnap-holo': ASSETS['rnap-holo'], 'rnap-ec': ASSETS['rnap-ec'] } });
  const w = stateAt(story, story.chapters[6].t1);
  const tg = {};
  fresh.pose(w, tg);
  const nucs = tg.asm.nucleotides;
  const mid = [0, 0, 0];
  for (let j = 0; j < 179; j++) for (let i = 0; i < 3; i++) mid[i] += nucs[MRNA0 + j].frame.o[i] / 179;
  assert.ok(dist([mid[0], mid[1], mid[2] - 250], RIBO_LAYOUT.o) < 0.01, 'origin 250 Å along -z from the mRNA midpoint');
  const a = nucs[MRNA0 + 11].frame.o, b = nucs[MRNA0 + 16].frame.o;
  const l = dist(a, b);
  const z = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
  const R = RIBO_LAYOUT.R;
  assert.ok(dist(z, [R[2], R[5], R[8]]) < 1e-4, 'ribo +z follows the SD 5′→3′ tangent');
  assert.ok(R[6] < -0.9, 'ribo +x (toward the 50S) points away from the DNA');
  const unit = (p, q) => { const d = dist(p, q); return [(q[0] - p[0]) / d, (q[1] - p[1]) / d, (q[2] - p[2]) / d]; };
  for (const [id, dir] of Object.entries(FACTOR_DIRS)) {
    assert.ok(dist(unit(ribo.anchors.center.o, ASSETS[id].anchors.center.o), dir) < 1e-4, `${id} direction`);
  }
  assert.ok(dist(unit(ribo.anchors.center.o, ribo.anchors.largeCenter.o), LARGE_DIR) < 1e-4);
});

test('S4: {N} in caption 14 is computed from the tunnel path and 22 <= N <= 34', () => {
  const N = story.meta.N;
  assert.ok(Number.isInteger(N) && N >= 22 && N <= 34, `N = ${N}`);
  assert.match(ch('elongate-tl').caption, new RegExp(`after about ${N} residues`));
});

test('S4: ribosome stays fixed in the world once bound; the 50S joins; DNA keeps clear of the ribosome', () => {
  poseAt(ch('start').t0 + 0.5);
  const ribM = world.machines.find(m => m.id === 'ribosome');
  assert.ok(world.ribosome.bound);
  assert.deepEqual(ribM.transform.o.map(v => +v.toFixed(3)), RIBO_LAYOUT.o.map(v => +v.toFixed(3)));
  assert.equal(ribM.parts.large.visible, false, '50S absent before chapter 10');
  poseAt(ch('decode').t0 + 1);
  const r2 = world.machines.find(m => m.id === 'ribosome');
  assert.equal(r2.parts.large.visible, true);
  assert.ok(Math.hypot(...r2.parts.large.transform.o) < 1e-9, '50S joined');
  const beads = l1Beads(r2, ribo);
  let md = Infinity;
  for (let g = 0; g < 496; g++) for (const b of beads) md = Math.min(md, dist(target.asm.nucleotides[g].frame.o, b) - b[3]);
  assert.ok(md > 20, `DNA–ribosome clearance ${md.toFixed(1)} Å`);
});

test('§5.3 items 3, 4 and 6: P-site codon k is mRNA [24+3(k-1), 27+3(k-1)), paired Watson–Crick; peptide = first k residues', () => {
  const C1 = (asm, id) => atom(asm, id, "C1'");
  for (let k = 1; k <= 40; k++) {
    const t = pRestTime(k);
    const { asm } = poseAt(t);
    assert.equal(world.ribosome.codon, k, `P-site codon at t=${t}`);
    const pT = world.trnas.find(x => x.site === 'P' && x.blend === 1);
    assert.ok(pT, `tRNA in P for codon ${k}`);
    assert.equal(pT.codon, k);
    assert.equal(pT.pair, 1);
    assert.equal(pT.kind, k === 1 ? 'init' : 'aa');
    const j0 = 24 + 3 * (k - 1);
    // mRNA codon nucleotides sit on the ribosome track registers 0..2 (within the 0.85 Å clearance guard).
    for (let q = 0; q < 3; q++) {
      const want = composeFrame(world.ribosome.layout, sampleTrack(ribo.tracks.mrna, q, { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] }));
      assert.ok(dist(asm.nucleotides[MRNA0 + j0 + q].frame.o, want.o) < 1.0, `codon ${k} nt ${q} on register ${q}`);
      const ac = AC0 + 3 * (k - 1) + q;
      const cn = MRNA0 + j0 + 2 - q;
      const pair = asm.pairs[248 + 3 * (k - 1) + q];
      assert.equal(pair.a, cn); assert.equal(pair.b, ac);
      assert.ok(WC.has(pair.type), `Watson–Crick ${pair.type}`);
      assert.equal(pair.strength, 1);
      const d = dist(C1(asm, ac), C1(asm, cn));
      assert.ok(Math.abs(d - 10.5) <= 0.3, `codon ${k}: C1′–C1′ ${d.toFixed(3)}`);
    }
    assert.equal(asm.nucleotides.slice(AC0 + 3 * (k - 1), AC0 + 3 * k).map(n => n.base).join(''), anticodonOf(CODONS[k - 1].triplet));
    // Peptide after cycle k: the first k residues (codon k's residue joins at its bond midpoint).
    const pep = target.groups.find(g => g.id === 'peptide');
    const expectLen = k === 40 ? 40 : k;
    assert.equal(world.peptide.length, expectLen);
    assert.deepEqual(pep.residues.map(r => r.code3), RESIDUES.slice(0, expectLen));
  }
});

test('§5.3 item 4: no residue is added at codon 41; RF1 reads UAA in the A site; peptide released', () => {
  const rel = ch('release');
  for (const t of [rel.t0 + 0.5, rel.t0 + 4, rel.t0 + 8, rel.t1 - 0.01, ch('finale').t0 + 3, story.duration - 0.01]) {
    poseAt(t);
    assert.equal(world.peptide.length, 40, `t=${t}`);
    const pep = target.groups.find(g => g.id === 'peptide');
    assert.equal(pep.residues.length, 40);
    assert.equal(pep.residues[39].code3, 'LEU');
    assert.ok(!world.trnas.some(x => x.codon > 40));
  }
  poseAt(rel.t0 + 4);
  assert.equal(world.counters.codon, 41);
  assert.ok(world.machines.some(m => m.id === 'rf1'));
  assert.equal(world.peptide.attach, 'free');
  poseAt(ch('finale').t0 + 1);
  assert.equal(world.peptide.release, 1);
});

test('§5.3 items 5 and 6: fMet-tRNA never in A/T or A; no pairs drawn in E or in A/T before recognition', () => {
  const step = 0.05;
  let checked = 0;
  for (let t = ch('scan').t0; t <= story.duration; t += step) {
    stateAt(story, t, world);
    for (const tr of world.trnas) {
      if (tr.kind === 'init') {
        assert.ok(!['AT', 'A', 'AP'].includes(tr.site) && !['AT', 'A', 'AP'].includes(tr.from), `fMet-tRNA at ${tr.from}->${tr.site} t=${t}`);
      }
      if (tr.site === 'E' && tr.from === 'E') assert.equal(tr.pair, 0, `E-site pairing at t=${t}`);
      if (tr.site === 'AT') {
        const pairEv = story.events.find(e => e.type === 'codon.pair' && e.data.target === `trna:${tr.slot}` && e.data.codon === tr.codon);
        if (t < pairEv.t0) assert.equal(tr.pair, 0, `A/T pairing before recognition at t=${t}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 1000);
  // Pose check: drawn pair strength follows the state (E and pre-recognition A/T: 0).
  const tE = ch('elongate-tl').t0 + 0.05; // codon 1 tRNA leaving E, codon 3 entering A/T
  const { asm } = poseAt(tE);
  for (const tr of world.trnas) {
    if (tr.site === 'E' || (tr.site === 'AT' && tr.pair === 0)) {
      for (let q = 0; q < 3; q++) assert.equal(asm.pairs[248 + 3 * (tr.codon - 1) + q].strength, 0);
    }
  }
});

test('§5.3 item 8: mRNA in the ribosome track and resting anticodons stay within 1.0 Å of the L1 beads (64 samples per chapter)', () => {
  let worst = -Infinity, where = '';
  for (const c of TL_CHAPTERS) {
    for (let i = 0; i < 64; i++) {
      const t = c.t0 + ((i + 0.5) / 64) * (c.t1 - c.t0);
      const { asm } = poseAt(t);
      if (!world.ribosome.bound) continue;
      const rm = world.machines.find(m => m.id === 'ribosome');
      const beads = l1Beads(rm, ribo);
      const p0 = 24 + 3 * (world.ribosome.codon - 1);
      for (let j = 0; j < 179; j++) {
        const r = j - p0;
        if (r < -16 || r > 15) continue;
        const p = maxPenetration(asm, MRNA0 + j, beads);
        if (p > worst) { worst = p; where = `mRNA ${j} r=${r.toFixed(2)} t=${t.toFixed(2)}`; }
      }
      for (const tr of world.trnas) {
        if (tr.approach > 0 || tr.depart > 0) continue;
        for (let q = 0; q < 3; q++) {
          const p = maxPenetration(asm, AC0 + 3 * (tr.codon - 1) + q, beads);
          if (p > worst) { worst = p; where = `anticodon ${tr.codon}/${q} t=${t.toFixed(2)}`; }
        }
      }
    }
  }
  assert.ok(worst <= 1.0, `max penetration ${worst.toFixed(3)} Å at ${where}`);
});

test('S4: peptide C(i)–N(i+1) within 1.33 ± 0.25 Å and the chain starts at the peptidyl-tRNA (64 samples per chapter)', () => {
  let worst = 0;
  for (const c of TL_CHAPTERS) {
    for (let i = 0; i < 64; i++) {
      const t = c.t0 + ((i + 0.5) / 64) * (c.t1 - c.t0);
      poseAt(t);
      const pep = target.groups.find(g => g.id === 'peptide');
      if (!pep) continue;
      const R = pep.residues;
      const find = (r, name) => { for (let a = R[r].atomStart; a < R[r].atomStart + R[r].atomCount; a++) if (pep.names[a] === name) return a; return -1; };
      const P = a => [pep.pos[3 * a], pep.pos[3 * a + 1], pep.pos[3 * a + 2]];
      for (let r = 0; r + 1 < R.length; r++) worst = Math.max(worst, Math.abs(dist(P(find(r, 'C')), P(find(r + 1, 'N'))) - 1.33));
    }
  }
  assert.ok(worst <= 0.25, `max |C–N − 1.33| = ${worst.toFixed(3)} Å`);
});

test('S4: stateAt is deterministic, seek-order independent and allocation-free for the translation pool', () => {
  const times = [];
  for (let i = 0; i < 300; i++) times.push(ch('scan').t0 + (story.duration - ch('scan').t0) * ((i * 7919) % 300) / 300);
  const snap = w => JSON.stringify({ m: w.machines, tr: w.trnas, p: w.peptide, r: w.ribosome, fx: w.fx });
  const ref = times.map(t => snap(stateAt(story, t)));
  const out = createWorldState();
  stateAt(story, times[0], out);
  const pool = out._tlPool;
  for (let k = times.length - 1; k >= 0; k--) {
    assert.equal(snap(stateAt(story, times[k], out)), ref[k], `t=${times[k]}`);
  }
  assert.equal(out._tlPool, pool);
  // Pose determinism: repeated pose at the same time gives bit-identical positions.
  const t = ch('elongate-tl').t0 + 7.77;
  poseAt(t);
  const a = Float32Array.from(target.asm.atoms.pos);
  const pa = Float32Array.from(target.groups.find(g => g.id === 'peptide').pos);
  poseAt(ch('bond').t0 + 1);
  poseAt(t);
  assert.deepEqual(Float32Array.from(target.asm.atoms.pos), a);
  assert.deepEqual(Float32Array.from(target.groups.find(g => g.id === 'peptide').pos), pa);
});

test('S4: factor and tRNA timing follows §6.1 (IF3 leaves first, EF-Tu carries A/T tRNA, EF-G present in translocation)', () => {
  const at = (id, s) => { stateAt(story, ch(id).t0 + s, world); return world; };
  let w = at('scan', 7.0);
  assert.deepEqual(w.machines.map(m => m.id).sort(), ['if1', 'if3', 'ribosome']);
  w = at('start', 4.0);
  assert.ok(w.machines.some(m => m.id === 'if2'));
  assert.equal(w.trnas.length, 1); assert.equal(w.trnas[0].aa, 'fMet'); assert.equal(w.trnas[0].site, 'P');
  w = at('join', 3.5);
  assert.ok(!w.machines.some(m => m.id === 'if3'), 'IF3 gone by 3.0 s');
  assert.ok(w.fx.some(f => f.type === 'gtp' && f.anchor.machineId === 'if2'));
  w = at('join', 5.5);
  assert.deepEqual(w.machines.map(m => m.id), ['ribosome']);
  w = at('decode', 1.5);
  const tu = w.machines.find(m => m.id === 'ef-tu');
  const tr = w.trnas.find(x => x.codon === 2);
  assert.ok(tu && tr.site === 'AT' && tr.carrier === 'ef-tu' && Math.abs(tr.approach - (1 - 0.5)) < 1e-9);
  w = at('translocate', 2.0);
  assert.ok(w.machines.some(m => m.id === 'ef-g'));
  assert.ok(w.ribosome.codon > 1 && w.ribosome.codon < 2, 'mRNA moving by one codon');
  w = at('finale', 3.0);
  assert.deepEqual(w.machines.map(m => m.id), ['ribosome']);
  assert.equal(w.trnas.length, 0);
});

test('S4: pose stays within budget (median <= 6 ms) and keeps the transcription topology without tRNA assets', () => {
  const d = [];
  const span = story.duration - ch('scan').t0;
  for (let i = 0; i < 120; i++) {
    const t = ch('scan').t0 + span * i / 120;
    const a = performance.now();
    poseAt(t);
    d.push(performance.now() - a);
  }
  d.sort((x, y) => x - y);
  assert.ok(d[60] <= 6, `median ${d[60].toFixed(2)} ms`);
  assert.equal(target.asm.nucleotides.length, 675 + 120);
  const p2 = createPoser({ construct: SCENARIO, assets: { 'rnap-ec': ASSETS['rnap-ec'], 'ribosome-70s': ribo } });
  const tg = {};
  p2.pose(stateAt(story, ch('decode').t0 + 1), tg);
  assert.equal(tg.asm.nucleotides.length, 675);
});
