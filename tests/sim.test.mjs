// Run: node --test tests/sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/science/index.js';
import { createMeltSim } from '../js/sim/melt.js';
import { createReplicationSim } from '../js/sim/replication.js';
import { orthoError, mulberry32, slerpMat, quatToMat, matToQuat, orthonormalize } from '../js/sim/util.js';

const SEQ_MELT = 'GCGCGCGCATATATATGCGCGCGC';          // GC arms around an AT island, Tm ≈ 74 °C at 0.1 M Na+
const SEQ_REP = 'GATTACAGCTAGCTAGGCATCGAT';           // 24-mer
const TM = S.duplexThermo(SEQ_MELT, { Na: 0.1 }).Tm;

const allFinite = arr => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };
const maxOrtho = asm => asm.nucleotides.reduce((m, n) => Math.max(m, orthoError(n.frame.R)), 0);
const linkLengths = asm => asm.links.map(l => ({ l, d: S.dist(asm.position(l.a), asm.position(l.b)) }));

// ================================================================================== util
test('util: mulberry32 is deterministic and in [0,1); slerp keeps rotations orthonormal', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xa = Array.from({ length: 8 }, a), xb = Array.from({ length: 8 }, b), xc = Array.from({ length: 8 }, c);
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  assert.ok(xa.every(v => v >= 0 && v < 1));
  const A = S.rotZ(0.3), B = S.mulMM(S.rotX(2.0), S.rotY(-1.1)), out = new Array(9);
  for (let t = 0; t <= 1; t += 0.125) { slerpMat(out, A, B, t); assert.ok(orthoError(out) < 1e-12); }
  slerpMat(out, A, B, 0); out.forEach((v, i) => assert.ok(Math.abs(v - A[i]) < 1e-12));
  slerpMat(out, A, B, 1); out.forEach((v, i) => assert.ok(Math.abs(v - B[i]) < 1e-12));
  const R = quatToMat(new Array(9), matToQuat([0, 0, 0, 0], B)); R.forEach((v, i) => assert.ok(Math.abs(v - B[i]) < 1e-12));
  const bad = A.map((v, i) => v + 1e-3 * ((i * 7) % 5)); assert.ok(orthoError(orthonormalize(bad)) < 1e-12);
});

// ================================================================================== melting
test('melt: no NaN and orthonormal frames after 20 s at 20, 60 and 95 °C', () => {
  for (const T of [20, 60, 95]) {
    const sim = createMeltSim(SEQ_MELT, { T, Na: 0.1, seed: 3 });
    for (let i = 0; i < 20 * 60; i++) {
      sim.update(1 / 60);
      if (i % 30 === 0) { assert.ok(allFinite(sim.assembly.atoms.pos), `NaN positions at ${T} °C`); assert.ok(maxOrtho(sim.assembly) < 1e-6); }
    }
    assert.ok(allFinite(sim.assembly.atoms.pos));
    assert.ok(maxOrtho(sim.assembly) < 1e-6);
    assert.ok(allFinite(sim.state.openness) && sim.state.openness.every(v => v >= 0 && v <= 1));
    assert.ok(sim.assembly.pairs.every(p => p.strength >= 0 && p.strength <= 1 && Number.isFinite(p.strength)));
    assert.deepEqual(sim.blobs, []);
  }
});

test('melt: state exposes thermodynamics consistent with the science layer', () => {
  const sim = createMeltSim(SEQ_MELT, { T: 30, Na: 0.1, Ct: 1e-6 });
  const th = S.duplexThermo(SEQ_MELT, { Na: 0.1, Ct: 1e-6 }), st = sim.state;
  for (const k of ['Tm', 'dH', 'dS', 'dG37', 'gc']) assert.equal(st[k], th[k], k);
  assert.equal(st.T, 30); assert.equal(st.Na, 0.1); assert.equal(st.Ct, 1e-6);
  assert.ok(st.closed instanceof Float64Array && st.closed.length === SEQ_MELT.length);
  assert.ok(st.openness instanceof Float32Array && st.openness.length === SEQ_MELT.length);
  const hc = S.helixCoil(SEQ_MELT, 30, { Na: 0.1, Ct: 1e-6 });
  assert.deepEqual(Array.from(st.closed), Array.from(hc.closed));
  assert.equal(st.duplexFraction, hc.duplex);
  assert.equal(st.curve.length, 111);
  assert.ok(st.curve[0].paired > 0.95 && st.curve[110].paired < 0.05);
  const curve0 = st.curve;
  sim.setConditions({ T: 50 });
  assert.equal(sim.state.curve, curve0, 'curve is only recomputed when Na/Ct change');
  assert.equal(sim.state.T, 50);
  sim.setConditions({ Na: 1.0 });
  assert.notEqual(sim.state.curve, curve0);
  assert.ok(sim.state.Tm > th.Tm, 'more salt, higher Tm');
});

test('melt: at low temperature the duplex stays closed and sits on the ideal B-DNA frames (within thermal jitter)', () => {
  const ref = S.buildDuplex(SEQ_MELT), n = SEQ_MELT.length;
  for (const T of [5, 20]) {
    const sim = createMeltSim(SEQ_MELT, { T, Na: 0.1, seed: 5 });
    let strengthSum = 0, count = 0;
    for (let i = 0; i < 10 * 30; i++) {
      sim.update(1 / 30);
      for (let k = 3; k < n - 3; k++) { strengthSum += sim.assembly.pairs[k].strength; count++; }
    }
    assert.ok(strengthSum / count > 0.99, `interior strength ${strengthSum / count} at ${T} °C`);
    assert.ok(sim.state.fractionPaired > 0.85, `fractionPaired ${sim.state.fractionPaired}`);
    assert.equal(sim.state.phase === 'duplex' || sim.state.phase === 'fraying', true);
    let worst = 0;
    for (const nu of sim.assembly.nucleotides) {
      const k = nu.id >> 1;
      if (k < 3 || k > n - 4) continue;                                  // ends may fray
      for (let a = nu.atomStart; a < nu.atomStart + nu.atomCount; a++) worst = Math.max(worst, S.dist(sim.assembly.position(a), ref.position(a)));
    }
    assert.ok(worst < 0.8, `interior atoms deviate by ${worst.toFixed(2)} Å from ideal`);
    // the dissociation machinery does not interfere: strands stay together
    assert.equal(sim.state.separation, 0);
  }
});

test('melt: at high temperature the strands separate completely, unwound and apart', () => {
  const sim = createMeltSim(SEQ_MELT, { T: 95, Na: 0.1, seed: 2 });
  for (let i = 0; i < 20 * 30; i++) sim.update(1 / 30);
  assert.ok(sim.state.fractionPaired < 0.1, `fractionPaired ${sim.state.fractionPaired}`);
  assert.equal(sim.state.phase, 'single strands');
  assert.ok(sim.assembly.pairs.every(p => p.strength < 0.1));
  const A = sim.assembly, n = SEQ_MELT.length;
  const centroid = s => {
    const c = [0, 0, 0];
    for (const id of A.strands[s]) { const p = A.position(A.atomOf(id, "C1'")); c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    return c;
  };
  assert.ok(S.dist(centroid(0), centroid(1)) > 25, 'strand centroids move apart');
  // unwound strands: much smaller twist per residue than 34.3° (angle of P about the strand's own axis)
  const ps = A.strands[0].map(id => A.position(A.atomOf(id, 'P')));
  const c = centroid(0);
  const ang = ps.map(p => Math.atan2(p[1] - c[1], p[0] - c[0]));
  let tw = 0;
  for (let i = 1; i < ang.length; i++) tw += Math.abs(((ang[i] - ang[i - 1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / S.DEG / (ang.length - 1);
  assert.ok(tw < 34, `mean |twist| per residue ${tw}`);
  // links still bounded
  assert.ok(Math.max(...linkLengths(A).map(x => x.d)) < 4);
});

test('melt: time-averaged openness tracks 1 − closed[k] (interior pairs, within 0.12)', () => {
  const n = SEQ_MELT.length;
  for (const dT of [-20, -6, 6]) {
    const T = TM + dT, sim = createMeltSim(SEQ_MELT, { T, Na: 0.1, seed: 11 });
    const sum = new Float64Array(n);
    let cnt = 0;
    for (let i = 0; i < 12000; i++) {                                   // 1200 s
      sim.update(0.1);
      if (i > 200) { for (let k = 0; k < n; k++) sum[k] += 1 - sim.state.openness[k]; cnt++; }
    }
    for (let k = 3; k < n - 3; k++) {
      const avg = sum[k] / cnt, eq = sim.state.closed[k];
      assert.ok(Math.abs(avg - eq) < 0.12, `pair ${k} at Tm${dT >= 0 ? '+' : ''}${dT}: sim ${avg.toFixed(3)} vs equilibrium ${eq.toFixed(3)}`);
    }
  }
});

test('melt: close to Tm the long-run average is still within 0.2 of equilibrium', () => {
  const n = SEQ_MELT.length, sim = createMeltSim(SEQ_MELT, { T: TM, Na: 0.1, seed: 4 }), sum = new Float64Array(n);
  let cnt = 0;
  for (let i = 0; i < 30000; i++) { sim.update(0.1); if (i > 200) { for (let k = 0; k < n; k++) sum[k] += 1 - sim.state.openness[k]; cnt++; } }
  for (let k = 3; k < n - 3; k++) assert.ok(Math.abs(sum[k] / cnt - sim.state.closed[k]) < 0.2, `pair ${k}`);
});

test('melt: opening is cooperative (ends fray first), smooth, and links stay bounded', () => {
  const n = SEQ_MELT.length, sim = createMeltSim(SEQ_MELT, { T: TM - 3, Na: 0.1, seed: 8 });
  const sum = new Float64Array(n);
  let cnt = 0, maxLink = 0, maxStep = 0, prev = Float32Array.from(sim.assembly.atoms.pos);
  for (let i = 0; i < 60 * 300; i++) {                                  // 300 s at 60 Hz
    sim.update(1 / 60);
    if (i > 60) { for (let k = 0; k < n; k++) sum[k] += sim.state.openness[k]; cnt++; }
    const p = sim.assembly.atoms.pos;
    for (let j = 0; j < p.length; j++) { maxStep = Math.max(maxStep, Math.abs(p[j] - prev[j])); prev[j] = p[j]; }
    for (const l of sim.assembly.links) maxLink = Math.max(maxLink, S.dist(sim.assembly.position(l.a), sim.assembly.position(l.b)));
  }
  assert.ok(maxLink < 4, `max O3'-P link ${maxLink.toFixed(2)} Å`);
  assert.ok(maxStep < 1.5, `no atom coordinate jumps by more than 1.5 Å in 1/60 s (${maxStep.toFixed(2)})`);
  const avg = Array.from(sum, v => v / cnt);
  assert.ok(avg[0] > avg[5], 'terminal pair opens more often than a GC-arm interior pair');
  assert.ok(avg[n - 1] > avg[n - 6]);
});

test('melt: whole-run link bound while heating through the transition and cooling again (re-annealing)', () => {
  const sim = createMeltSim(SEQ_MELT, { T: 40, Na: 0.1, seed: 21 });
  let maxLink = 0, sawSeparated = false, sawBack = false;
  const run = (T, seconds) => {
    sim.setConditions({ T });
    for (let i = 0; i < seconds * 30; i++) {
      sim.update(1 / 30);
      for (const l of sim.assembly.links) maxLink = Math.max(maxLink, S.dist(sim.assembly.position(l.a), sim.assembly.position(l.b)));
    }
  };
  run(40, 5);
  assert.ok(sim.state.fractionPaired > 0.9);
  run(95, 30);
  assert.ok(sim.state.fractionPaired < 0.1 && sim.state.separation > 0.9); sawSeparated = true;
  run(30, 60);
  assert.ok(sim.state.fractionPaired > 0.85 && sim.state.separation < 0.1, `re-annealed: fp ${sim.state.fractionPaired}`); sawBack = true;
  assert.ok(sawSeparated && sawBack);
  assert.ok(maxLink < 4, `max link ${maxLink}`);
  assert.ok(allFinite(sim.assembly.atoms.pos) && maxOrtho(sim.assembly) < 1e-6);
});

test('melt: deterministic for a seed, different for another seed; dispose is safe', () => {
  const run = seed => { const s = createMeltSim(SEQ_MELT, { T: TM - 2, seed }); for (let i = 0; i < 600; i++) s.update(1 / 30); return Array.from(s.assembly.atoms.pos); };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
  const s = createMeltSim(SEQ_MELT); s.dispose(); s.update(1 / 60); s.setConditions({ T: 50 });
});

// ================================================================================== replication
const n = SEQ_REP.length;
function snapshot(sim) {
  const A = sim.assembly;
  return {
    pos: Float32Array.from(A.atoms.pos), vis: A.nucleotides.map(x => x.visible), op: A.nucleotides.map(x => x.opacity),
    tag: A.nucleotides.map(x => x.tag), link: A.links.map(l => l.active), str: A.pairs.map(p => p.strength), npair: A.nucleotides.map(x => x.pair),
  };
}

test('replication: API shape, duration, assembly layout', () => {
  const sim = createReplicationSim(SEQ_REP, { seed: 1 });
  const A = sim.assembly;
  assert.ok(sim.duration >= 30 && sim.duration <= 40, `duration ${sim.duration}`);
  assert.equal(A.nucleotides.length, 4 * n);
  assert.equal(A.strands.length, 4);
  assert.deepEqual(A.strands.map(s => s.length), [n, n, n, n]);
  assert.equal(A.pairs.length, 3 * n);
  assert.equal(A.links.length, 4 * (n - 1));
  assert.equal(sim.playing, false);
  for (const f of ['update', 'seek', 'play', 'pause', 'dispose', 'parentalPairOf', 'daughterPairOf']) assert.equal(typeof sim[f], 'function', f);
  assert.ok(Array.isArray(sim.blobs));
  // parental pair ids 0..n-1 follow the buildDuplex convention
  for (let k = 0; k < n; k++) {
    const p = A.pairs[sim.parentalPairOf(k)];
    assert.equal(p.id, k); assert.equal(p.a, 2 * k); assert.equal(p.b, 2 * k + 1);
  }
  // template-daughter pairs: n..2n-1 leading (strand 0 with strand 2), 2n..3n-1 lagging (strand 1 with strand 3)
  for (let k = 0; k < n; k++) {
    const pl = A.pairs[n + k], pg = A.pairs[2 * n + k];
    assert.equal(A.nucleotides[pl.a].strand, 0); assert.equal(A.nucleotides[pl.b].strand, 2);
    assert.equal(A.nucleotides[pg.a].strand, 1); assert.equal(A.nucleotides[pg.b].strand, 3);
    assert.equal(sim.daughterPairOf(2 * k), n + k); assert.equal(sim.daughterPairOf(pl.b), n + k);
    assert.equal(sim.daughterPairOf(2 * k + 1), 2 * n + k); assert.equal(sim.daughterPairOf(pg.b), 2 * n + k);
  }
  // strand order is 5'->3' with consecutive links, as buildDuplex does for the parental strands
  assert.equal(A.strands[1].map(id => A.nucleotides[id].base).join(''), S.reverseComplement(SEQ_REP));
  for (const s of A.strands) s.forEach((id, i) => assert.equal(A.nucleotides[id].index, i));
  for (const l of A.links) assert.equal(A.nucleotides[l.from].strand, A.nucleotides[l.to].strand);
  for (const l of A.links) assert.equal(A.nucleotides[l.to].index, A.nucleotides[l.from].index + 1);
});

test('replication: seek(0) is exactly the parental duplex; nothing else is visible', () => {
  const sim = createReplicationSim(SEQ_REP);
  sim.seek(0);
  const ref = S.buildDuplex(SEQ_REP), A = sim.assembly;
  for (let i = 0; i < ref.atoms.count * 3; i++) assert.ok(Math.abs(A.atoms.pos[i] - ref.atoms.pos[i]) < 1e-4, `atom coord ${i}`);
  A.nucleotides.forEach(nu => assert.equal(nu.visible, nu.strand < 2, `nucleotide ${nu.id}`));
  A.pairs.forEach(p => assert.equal(p.strength, p.id < n ? 1 : 0));
  A.links.forEach(l => assert.equal(l.active, A.nucleotides[l.from].strand < 2));
  assert.equal(sim.state.progress, 0); assert.equal(sim.state.finished, false);
  assert.equal(sim.blobs.length, 0, 'enzymes have not arrived yet');
});

test('replication: no NaN, orthonormal frames across 241 seek() samples', () => {
  const sim = createReplicationSim(SEQ_REP);
  for (let i = 0; i <= 240; i++) {
    sim.seek(i / 240);
    assert.ok(allFinite(sim.assembly.atoms.pos), `NaN at sample ${i}`);
    assert.ok(maxOrtho(sim.assembly) < 1e-6, `orthonormality at sample ${i}`);
    for (const b of sim.blobs) assert.ok(allFinite(b.pos) && Number.isFinite(b.opacity) && b.radius > 0);
    assert.ok(sim.assembly.nucleotides.every(nu => nu.opacity >= 0 && nu.opacity <= 1));
    assert.ok(sim.assembly.pairs.every(p => p.strength >= 0 && p.strength <= 1));
    assert.equal(typeof sim.state.caption, 'string'); assert.ok(sim.state.caption.length > 20);
  }
});

test('replication: continuity — no visible atom moves more than 2.5 Å between consecutive 1/60 s samples', () => {
  for (const [seq, seed] of [[SEQ_REP, 1], ['ACGTACGTACGT', 2]]) {
    const sim = createReplicationSim(seq, { seed }), A = sim.assembly, steps = Math.ceil(sim.duration * 60);
    sim.seek(0);
    let prev = Float32Array.from(A.atoms.pos), prevVis = A.nucleotides.map(x => x.visible), worst = 0, where = '';
    for (let i = 1; i <= steps; i++) {
      sim.seek(Math.min(1, i / 60 / sim.duration));
      const p = A.atoms.pos;
      for (let a = 0; a < A.atoms.count; a++) {
        const id = A.atoms.nuc[a];
        if (!A.nucleotides[id].visible || !prevVis[id]) continue;       // first frame of a new arrival is exempt
        const d = Math.hypot(p[a * 3] - prev[a * 3], p[a * 3 + 1] - prev[a * 3 + 1], p[a * 3 + 2] - prev[a * 3 + 2]);
        if (d > worst) { worst = d; where = `sample ${i}, nucleotide ${id}, ${A.atoms.names[a]}`; }
      }
      prev.set(p); A.nucleotides.forEach(x => { prevVis[x.id] = x.visible; });
    }
    assert.ok(worst < 2.5, `largest per-frame move ${worst.toFixed(2)} Å (${where})`);
  }
});

test('replication: end state — two complete, correctly paired daughter duplexes, every link sealed', () => {
  for (const seq of [SEQ_REP, 'CGCGAATTCGCG', 'ATGCGCATTAGCCGATCGGCTAATGCATGC']) {
    const sim = createReplicationSim(seq), A = sim.assembly, m = seq.length;
    sim.seek(1);
    assert.equal(sim.state.finished, true); assert.equal(sim.state.progress, 1);
    assert.ok(A.nucleotides.every(nu => nu.visible && nu.opacity === 1), 'every nucleotide visible and opaque');
    assert.ok(A.links.every(l => l.active), 'every link active');
    assert.ok(A.nucleotides.every(nu => nu.tag === ''), 'all primers replaced');
    assert.equal(sim.blobs.length, 0, 'enzymes faded out');
    assert.equal(sim.state.fragments.every(f => f.primed && f.complete && f.ligated), true);
    for (let k = 0; k < m; k++) {
      assert.equal(A.pairs[k].strength, 0, 'parental pairs fully unwound');
      for (const base of [m, 2 * m]) {
        const p = A.pairs[base + k];
        assert.equal(p.strength, 1);
        const hb = A.hbondLengths(p);
        assert.equal(hb.length, /[GC]/.test(p.type) ? 3 : 2);
        for (const d of hb) assert.ok(d > 2.6 && d < 3.2, `H-bond ${d.toFixed(2)} Å in pair ${p.id}`);
      }
    }
    for (const { l, d } of linkLengths(A)) assert.ok(Math.abs(d - 1.607) < 0.08, `link ${l.id} (${l.from}->${l.to}) = ${d.toFixed(3)} Å`);
    // sequences: leading daughter = reverse complement of its template read 5'->3'; same for lagging
    const seqOf = s => A.strands[s].map(id => A.nucleotides[id].base).join('');
    assert.equal(seqOf(0), seq);
    assert.equal(seqOf(2), S.reverseComplement(seqOf(0)));
    assert.equal(seqOf(3), S.reverseComplement(seqOf(1)));
    assert.equal(seqOf(2), S.reverseComplement(seq));
    assert.equal(seqOf(3), seq);
    // semi-conservative: each daughter duplex = one old + one new strand, antiparallel
    for (let k = 0; k < m; k++) {
      const a = A.nucleotides[A.pairs[m + k].a], b = A.nucleotides[A.pairs[m + k].b];
      assert.equal(S.COMPLEMENT[a.base], b.base);
      assert.equal(a.index + b.index, m - 1, 'antiparallel: 5\' end pairs with 3\' end');
    }
    // no steric clash between the arms (arm I = strands 0 + 2, arm II = strands 1 + 3)
    const arm = nu => (nu.strand === 0 || nu.strand === 2 ? 0 : 1);
    let minD = Infinity;
    const pos = A.atoms.pos;
    for (let a = 0; a < A.atoms.count; a++) for (let b = a + 1; b < A.atoms.count; b++) {
      if (arm(A.nucleotides[A.atoms.nuc[a]]) === arm(A.nucleotides[A.atoms.nuc[b]])) continue;
      minD = Math.min(minD, Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]));
    }
    assert.ok(minD > 3, `minimum inter-arm atom distance ${minD.toFixed(2)} Å`);
    assert.ok(maxOrtho(A) < 1e-6);
  }
});

test('replication: synthesis is always 5′→3′; links form only between placed nucleotides; primers only where allowed', () => {
  const sim = createReplicationSim(SEQ_REP), A = sim.assembly, frs = sim.layout.fragments;
  const dt = 1 / 20, steps = Math.ceil(sim.duration / dt);
  const firstVisible = new Map(), firstLink = new Map(), placed = new Map();
  let sawLaggingPrimer = false, sawLeadingPrimer = false, maxLeadPrimer = 0, sawLigase = false, sawPrimerRemoval = false;
  const linkWasActive = A.links.map(() => false);
  for (let i = 0; i <= steps; i++) {
    sim.seek(Math.min(1, i * dt / sim.duration));
    const t = sim.state.t;
    let leadPrimers = 0;
    for (const nu of A.nucleotides) {
      if (nu.strand < 2) continue;
      if (nu.visible && !firstVisible.has(nu.id)) firstVisible.set(nu.id, t);
      if (nu.visible && A.pairs[sim.daughterPairOf(nu.id)].strength >= 1 && !placed.has(nu.id)) placed.set(nu.id, t);
      if (nu.tag === 'primer') {
        assert.ok(nu.strand === 3 || (nu.strand === 2 && nu.index < 4), `stray primer on strand ${nu.strand} index ${nu.index}`);
        if (nu.strand === 3) {
          sawLaggingPrimer = true;
          assert.ok(frs.some(f => nu.index >= f.start && nu.index < f.start + f.primerLength), 'lagging primer sits at a fragment 5′ end');
        } else { sawLeadingPrimer = true; leadPrimers++; }
      }
    }
    maxLeadPrimer = Math.max(maxLeadPrimer, leadPrimers);
    for (const nu of A.nucleotides) if (nu.strand < 2) assert.equal(nu.tag, '');
    // links: a daughter link may only be active once BOTH ends are placed (visible, fully H-bonded)
    A.links.forEach((l, li) => {
      const from = A.nucleotides[l.from], to = A.nucleotides[l.to];
      if (!l.active || from.strand < 2) { linkWasActive[li] = l.active; return; }
      assert.ok(from.visible && to.visible, `link ${li} active before both ends exist`);
      assert.ok(A.pairs[sim.daughterPairOf(from.id)].strength >= 1 && A.pairs[sim.daughterPairOf(to.id)].strength >= 1, `link ${li} before H-bonds complete`);
      const sameFragment = from.strand === 2 || !frs.some(f => from.index === f.end);   // inter-fragment nicks are checked below
      if (sameFragment) assert.ok(placed.get(from.id) <= placed.get(to.id), '5′ neighbour is placed no later than the nucleotide joined to it');
      else assert.ok(placed.has(from.id) && placed.has(to.id));
      if (!linkWasActive[li]) firstLink.set(li, t);
      linkWasActive[li] = true;
    });
    if (sim.state.phase === 'primer-removal') sawPrimerRemoval = true;
    if (sim.blobs.some(b => b.id === 'ligase')) sawLigase = true;
  }
  assert.ok(sawLaggingPrimer && sawLeadingPrimer && sawLigase && sawPrimerRemoval);
  assert.ok(maxLeadPrimer >= 1 && maxLeadPrimer <= 3);
  // growth direction: along the leading strand (5′→3′ = increasing index) nucleotides appear strictly in order
  const lead = A.strands[2], lag = A.strands[3];
  for (let j = 1; j < n; j++) assert.ok(firstVisible.get(lead[j]) >= firstVisible.get(lead[j - 1]), `leading nucleotide ${j} appeared before ${j - 1}`);
  // lagging strand: inside each Okazaki fragment strictly 5′→3′ ...
  for (const f of frs) for (let k = f.start + 1; k < f.start + (f.end - f.start + 1); k++)
    assert.ok(firstVisible.get(lag[k]) >= firstVisible.get(lag[k - 1]), `lagging nucleotide ${k} before ${k - 1} within a fragment`);
  // ... while the fragments themselves are made in the opposite order along the strand (discontinuous, backwards)
  for (let i = 1; i < frs.length; i++) assert.ok(firstVisible.get(lag[frs[i].start]) > firstVisible.get(lag[frs[i - 1].start]), 'fragments are made one after another, away from the origin end');
  assert.ok(frs[0].start > frs[1].start, 'first fragment is nearest the origin (+z end)');
  // the leading daughter goes in the direction of fork movement (toward −z), the lagging fragments grow away from it
  const zOf = id => sim.assembly.position(sim.assembly.atomOf(id, "C1'"))[2];
  assert.ok(zOf(lead[0]) > zOf(lead[n - 1]), 'leading strand 5′→3′ runs toward −z, the fork direction');
  assert.ok(zOf(lag[0]) < zOf(lag[n - 1]), 'lagging strand 5′→3′ runs toward +z, away from the fork');
  // nicks: an inter-fragment link is only sealed after the primer ahead of it was replaced and its fragment completed
  for (let i = 1; i < frs.length; i++) {
    const hiLast = lag[frs[i].end], loPrev = lag[frs[i - 1].start];
    const li = A.links.findIndex(l => l.from === hiLast && l.to === loPrev);
    assert.ok(li >= 0 && firstLink.has(li), 'every nick is eventually ligated');
    sim.seek(firstLink.get(li) / sim.duration);
    assert.equal(A.nucleotides[loPrev].tag, '', 'primer replaced no later than ligation');
    assert.equal(sim.state.fragments[i].complete, true);
    sim.seek(Math.max(0, firstLink.get(li) - 0.2) / sim.duration);
    assert.equal(A.links[li].active, false, 'nick open just before ligation');
  }
});

test('replication: state fields are consistent and monotone over time; captions explain each phase', () => {
  const sim = createReplicationSim(SEQ_REP);
  const phases = new Set(), captions = new Set();
  let prev = null;
  for (let i = 0; i <= 400; i++) {
    sim.seek(i / 400);
    const st = sim.state;
    phases.add(st.phase); captions.add(st.caption);
    assert.ok(st.forkPair >= 0 && st.forkPair <= n - 1 && st.unwound >= 0 && st.unwound <= n);
    assert.equal(st.fragments.length, sim.layout.fragments.length);
    assert.ok(st.legend && st.legend.leadingTemplate === 0 && st.legend.laggingTemplate === 1);
    if (prev) {
      assert.ok(st.forkPair <= prev.forkPair + 1e-9 && st.unwound >= prev.unwound && st.leadingCount >= prev.leadingCount && st.laggingCount >= prev.laggingCount && st.t > prev.t);
    }
    prev = { forkPair: st.forkPair, unwound: st.unwound, leadingCount: st.leadingCount, laggingCount: st.laggingCount, t: st.t };
  }
  for (const ph of ['initiation', 'unwinding', 'leading', 'priming', 'lagging', 'primer-removal', 'ligation', 'separation', 'complete']) assert.ok(phases.has(ph), `phase ${ph}`);
  const text = [...captions].join(' ');
  // (the not-to-scale note on primer / fragment lengths lives in the Copy panel, not in the captions)
  for (const w of ['topoisomerase', 'RNA', 'Okazaki', 'ligase', 'pyrophosphate', 'hydrogen bond', 'Meselson', 'RNase H']) assert.ok(text.toLowerCase().includes(w.toLowerCase()), `caption mentions ${w}`);
  assert.equal(sim.state.leadingCount, n); assert.equal(sim.state.laggingCount, n);
  sim.seek(0);
  assert.equal(sim.state.unwound, 0); assert.equal(sim.state.leadingCount, 0);
});

test('replication: blobs — helicase, polymerases, primase and ligase appear with sane values', () => {
  const sim = createReplicationSim(SEQ_REP), seen = new Set();
  let helicaseZ = [];
  for (let i = 0; i <= 300; i++) {
    sim.seek(i / 300);
    for (const b of sim.blobs) {
      seen.add(b.id);
      assert.ok(typeof b.id === 'string' && Array.isArray(b.pos) && b.pos.length === 3 && b.radius > 0 && Number.isInteger(b.color) && b.opacity > 0 && b.opacity <= 1);
      if (b.id === 'helicase') { assert.equal(b.radius, 13); helicaseZ.push(b.pos[2]); }
    }
  }
  for (const l of ['helicase', 'pol-leading', 'pol-lagging', 'primase', 'ligase']) assert.ok(seen.has(l), l);
  // the helicase translocates along the axis from +z to −z
  assert.ok(helicaseZ[0] > helicaseZ[helicaseZ.length - 1] + 40);
  const mid = helicaseZ.filter((_, i) => i > 0); mid.forEach((z, i) => assert.ok(z <= helicaseZ[i] + 1e-9, 'monotone descent'));
});

test('replication: seek is a pure function of time — scrubbing backwards restores earlier states exactly', () => {
  const sim = createReplicationSim(SEQ_REP, { seed: 9 });
  sim.seek(0.3); const a = snapshot(sim), capA = sim.state.caption, blobsA = JSON.stringify(sim.blobs);
  sim.seek(0.8); const b = snapshot(sim);
  sim.seek(0.3); const c = snapshot(sim);
  assert.notDeepEqual(Array.from(a.pos), Array.from(b.pos));
  assert.deepEqual(Array.from(a.pos), Array.from(c.pos));
  for (const k of ['vis', 'op', 'tag', 'link', 'str', 'npair']) assert.deepEqual(a[k], c[k], k);
  assert.equal(sim.state.caption, capA); assert.equal(JSON.stringify(sim.blobs), blobsA);
  // and a second instance with the same seed agrees; another seed differs only in the random details
  const other = createReplicationSim(SEQ_REP, { seed: 9 }); other.seek(0.3);
  assert.deepEqual(Array.from(other.assembly.atoms.pos), Array.from(a.pos));
  const diff = createReplicationSim(SEQ_REP, { seed: 10 }); diff.seek(0.3);
  assert.notDeepEqual(Array.from(diff.assembly.atoms.pos), Array.from(a.pos));
});

test('replication: play/pause/update advance the timeline, respect speed and stop at the end', () => {
  const sim = createReplicationSim(SEQ_REP, { speed: 2 });
  sim.update(1); assert.equal(sim.state.t, 0, 'paused: no advance');
  sim.play(); assert.equal(sim.playing, true);
  sim.update(1.5); assert.ok(Math.abs(sim.state.t - 3) < 1e-9, 'speed 2 → 3 s of timeline');
  sim.pause(); sim.update(5); assert.ok(Math.abs(sim.state.t - 3) < 1e-9);
  sim.speed = 1; sim.play();
  const target = createReplicationSim(SEQ_REP, { speed: 1 }); target.seek(0.5);
  while (sim.state.t < 0.5 * sim.duration - 1 / 60) sim.update(1 / 60);
  sim.update(0.5 * sim.duration - sim.state.t); assert.ok(Math.abs(sim.state.progress - 0.5) < 1e-9);
  for (let i = 0; i < sim.assembly.atoms.pos.length; i++) assert.ok(Math.abs(sim.assembly.atoms.pos[i] - target.assembly.atoms.pos[i]) < 1e-3, 'update and seek agree');
  for (let i = 0; i < 100000 && !sim.state.finished; i++) sim.update(0.25);
  assert.equal(sim.state.finished, true); assert.equal(sim.playing, false); assert.equal(sim.state.progress, 1);
  sim.update(1); assert.equal(sim.state.progress, 1);
  sim.play(); assert.equal(sim.state.finished, false); assert.ok(sim.state.t < 1e-9, 'play() after the end restarts');
  sim.dispose(); sim.update(1);
});

test('replication: other lengths work (12-mer and 60-mer): duration scales, geometry holds', () => {
  const d12 = createReplicationSim('CGCGAATTCGCG').duration, d24 = createReplicationSim(SEQ_REP).duration;
  const seq60 = Array.from({ length: 60 }, (_, i) => 'ACGT'[(i * 5 + (i >> 2)) % 4]).join('');
  const s60 = createReplicationSim(seq60, { seed: 3 });
  assert.ok(d12 < d24 && d24 < s60.duration);
  s60.seek(1);
  const A = s60.assembly;
  assert.ok(A.links.every(l => l.active) && A.nucleotides.every(nu => nu.visible));
  for (const { d } of linkLengths(A)) assert.ok(Math.abs(d - 1.607) < 0.08);
  for (let i = 0; i <= 60; i++) { s60.seek(i / 60); assert.ok(allFinite(A.atoms.pos)); }
  assert.throws(() => createReplicationSim('AC'));
});
