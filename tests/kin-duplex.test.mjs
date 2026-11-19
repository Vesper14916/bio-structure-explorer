// R3-K1 step 2: duplex kinematics gates of docs/tasks/R3-ST3-design.md §3.6.
// Measured numbers are printed with console.log so a handoff can quote them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poseDuplex, downstreamAxis, machinePoseForRegister, duplexBackboneGaps, lastBubbleClosure } from '../js/kin/duplex.js';
import { screwStep, composeFrame, readFrame16, slerpFrame } from '../js/kin/frames.js';
import { nucleotideTemplate, buildDuplex } from '../js/science/assembly.js';
import { HELIX_B } from '../js/science/templates.js';
import { applyFrame, partnerFrame, kabsch, dist } from '../js/science/math.js';
import { TRUE_SCALE_GENE_CONSTRUCT as C } from '../js/science/scenario.js';
import { decodeAsset } from '../js/assets/format.js';

const load = id => decodeAsset(JSON.parse(readFileSync(new URL(`../assets/${id}.asset.json`, import.meta.url), 'utf8')));
const EC = load('rnap-ec');
const HOLO = load('rnap-holo');
const ASSETS = { 'rnap-ec': EC, 'rnap-holo': HOLO };
const N = C.codingDna.length;
const W = { o: [0, 0, 0], R: [0, 0, 1, 0, 1, 0, -1, 0, 0] };
const TPL = EC.tracks.template, NT = EC.tracks.nontemplate;
const r0 = TPL.registers[0], r1 = TPL.registers[TPL.registers.length - 1];
const f2 = v => v.toFixed(2);
const mx = a => a.reduce((m, v) => Math.max(m, v), -Infinity);

function pose(register, bend, { relax = 0, bubble = [0, 0], out = new Float32Array(32 * N), trackBlend, machine = true, assets = ASSETS, M } = {}) {
  const transform = M || machinePoseForRegister(EC, register);
  const opts = { machine: machine ? { assetId: 'rnap-ec', transform } : null };
  if (trackBlend !== undefined) opts.trackBlend = trackBlend;
  poseDuplex(C, { machineId: 'rnap', register, bend, bubble, relax }, assets, out, opts);
  return out;
}
const originOf = (buf, i) => [buf[16 * i + 12], buf[16 * i + 13], buf[16 * i + 14]];
const zAxisOf = (buf, i) => [buf[16 * i + 8], buf[16 * i + 9], buf[16 * i + 10]];

// ---- helpers: atoms placed by frames, source gaps from the asset's own track frames ---------------------------------

function heavyAtoms(buf) {
  const pts = [];
  for (let g = 0; g < N; g++) {
    for (const [i, base] of [[g, C.codingDna[g]], [N + g, C.templateDna[g]]]) {
      const t = nucleotideTemplate(base), f = readFrame16(buf, i);
      for (let a = 0; a < t.names.length; a++) pts.push(applyFrame(f, [t.local[3 * a], t.local[3 * a + 1], t.local[3 * a + 2]]));
    }
  }
  return pts;
}
const atomAt = (f, base, name) => {
  const t = nucleotideTemplate(base), k = t.index[name] * 3;
  return applyFrame(f, [t.local[k], t.local[k + 1], t.local[k + 2]]);
};
const gapCoding = (fa, fb, ba = 'A', bb = 'A') => dist(atomAt(fa, ba, "O3'"), atomAt(fb, bb, 'P'));

const gapsOf = buf => duplexBackboneGaps(C, buf);

// ---- API -------------------------------------------------------------------------------------------------------

test('downstreamAxis is a unit vector within 8 degrees of the asset +z', () => {
  const zd = downstreamAxis(EC);
  assert.ok(Math.abs(Math.hypot(...zd) - 1) < 1e-5); // asset rotations are int16-quantised
  const ang = Math.acos(zd[2]) * 180 / Math.PI;
  console.log(`downstreamAxis(rnap-ec) = [${zd.map(v => v.toFixed(4))}], ${f2(ang)} deg from +z`);
  assert.ok(ang < 8.5, `z_d is ${ang} deg from +z`); // design §3.1 says 'about 8 degrees'; measured 8.14
  // it is the +z of C_{r1} = partnerFrame(T_{r1})
  const C1 = partnerFrame(TPL.frames[TPL.frames.length - 1]);
  assert.ok(Math.hypot(zd[0] - C1.R[2], zd[1] - C1.R[5], zd[2] - C1.R[8]) < 1e-12);
});

test('poseDuplex fills 2 N column-major frames, rejects a short buffer', () => {
  const out = pose(45, 1);
  assert.equal(out.length, 32 * N);
  for (let i = 0; i < 2 * N; i++) {
    assert.equal(out[16 * i + 3], 0); assert.equal(out[16 * i + 7], 0); assert.equal(out[16 * i + 11], 0); assert.equal(out[16 * i + 15], 1);
  }
  assert.throws(() => poseDuplex(C, { register: 45, bend: 0, bubble: [0, 0], relax: 0 }, ASSETS, new Float32Array(10), { machine: null }));
  // template frame = partnerFrame(coding frame) outside the bubble: x column equal, y and z columns negated
  for (const g of [3, 100, 247]) {
    const a = readFrame16(out, g), b = readFrame16(out, N + g);
    assert.ok(Math.hypot(...a.o.map((v, i) => v - b.o[i])) < 1e-4);
    for (const [i, s] of [[0, 1], [1, -1], [2, -1], [3, 1], [4, -1], [5, -1], [6, 1], [7, -1], [8, -1]]) assert.ok(Math.abs(a.R[i] * s - b.R[i]) < 1e-5);
  }
});

// ---- gate: arms and every K1-generated step ----------------------------------------------------------------------

function stepStats(buf, gs) {
  let maxGap = 0, minSp = Infinity, maxSp = -Infinity;
  const gaps = gapsOf(buf);
  for (const g of gs) {
    maxGap = Math.max(maxGap, gaps[g], gaps[N - 1 + g]);
    const a = originOf(buf, g), b = originOf(buf, g + 1), z = zAxisOf(buf, g);
    const sp = (b[0] - a[0]) * z[0] + (b[1] - a[1]) * z[1] + (b[2] - a[2]) * z[2];
    minSp = Math.min(minSp, sp); maxSp = Math.max(maxSp, sp);
  }
  return { maxGap, minSp, maxSp };
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

test('gate: arms at beta = 1 (downstream, curved upstream) and K1-generated steps at beta = 0', () => {
  const rows = [];
  for (const reg of [45, 105, 165, 45.37, 120.8]) {
    const lastUp = Math.ceil(reg + r0) - 1;                 // last upstream-arm gene index (r < r0)
    const firstDown = Math.floor(reg + r1) + 1;             // first downstream-arm gene index (r > r1)
    for (const beta of [1, 0.5]) {
      const buf = pose(reg, beta);
      const up = stepStats(buf, range(0, lastUp - 1));      // steps with both ends upstream
      const down = stepStats(buf, range(firstDown, N - 2));
      rows.push(`reg ${reg} beta ${beta}: upstream arm gap ${f2(up.maxGap)} spacing ${f2(up.minSp)}..${f2(up.maxSp)} | downstream arm gap ${f2(down.maxGap)} spacing ${f2(down.minSp)}..${f2(down.maxSp)}`);
      for (const s of [up, down]) {
        assert.ok(s.maxGap <= 1.9, `arm O3'-P ${s.maxGap} at register ${reg}, beta ${beta}`);
        assert.ok(s.minSp >= 3.23 && s.maxSp <= 3.53, `arm spacing ${s.minSp}..${s.maxSp} at register ${reg}, beta ${beta}`);
      }
    }
    // beta = 0: every step, in-track included, both strands
    const all = stepStats(pose(reg, 0), range(0, N - 2));
    rows.push(`reg ${reg} beta 0: all steps gap ${f2(all.maxGap)} spacing ${f2(all.minSp)}..${f2(all.maxSp)}`);
    assert.ok(all.maxGap <= 1.9 && all.minSp >= 3.23 && all.maxSp <= 3.53, `beta 0 at ${reg}: ${JSON.stringify(all)}`);
    // relax = 1 with bend = 1 is beta = 0
    const rel = stepStats(pose(reg, 1, { relax: 1 }), range(0, N - 2));
    assert.ok(rel.maxGap <= 1.9, `relaxed gap ${rel.maxGap}`);
  }
  // no machine: straight world duplex
  const none = stepStats(pose(0, 0, { machine: false }), range(0, N - 2));
  rows.push(`no machine: gap ${f2(none.maxGap)} spacing ${f2(none.minSp)}..${f2(none.maxSp)}`);
  assert.ok(none.maxGap <= 1.9 && none.minSp >= 3.23 && none.maxSp <= 3.53);
  console.log(rows.join('\n'));
});

// ---- gate: track-to-arm junctions ------------------------------------------------------------------------------

test('gate: track-to-arm junction O3\'-P <= 2.6 A at beta = 1', () => {
  const rows = [];
  for (const reg of [45, 105, 165]) {
    const buf = pose(reg, 1), gaps = gapsOf(buf);
    const gUp = reg + r0 - 1;      // gene index of register r0 - 1; step gUp -> gUp + 1 crosses the upstream junction
    const gDn = reg + r1;          // gene index of register r1; step gDn -> gDn + 1 crosses the downstream junction
    const vals = { upC: gaps[gUp], upT: gaps[N - 1 + gUp], dnC: gaps[gDn], dnT: gaps[N - 1 + gDn] };
    rows.push(`reg ${reg} junctions: upstream coding ${f2(vals.upC)} template ${f2(vals.upT)}; downstream coding ${f2(vals.dnC)} template ${f2(vals.dnT)}`);
    for (const [k, v] of Object.entries(vals)) assert.ok(v <= 2.6, `junction ${k} = ${v} at register ${reg}`);
  }
  console.log(rows.join('\n'));
});

// ---- gate: inside the track ------------------------------------------------------------------------------------

test('gate: in-track O3\'-P adds no error to the source asset frames (beta = 1 and 0.5)', () => {
  // source: the asset's own frames, blended toward the ideal straight frames by beta with the same slerp
  const C1 = partnerFrame(TPL.frames[TPL.frames.length - 1]);
  const ideal = r => composeFrame(C1, screwStep(r - r1));
  const src = beta => {
    const out = {};
    for (let r = r0; r < r1; r++) {
      const ca = slerpFrame(ideal(r), partnerFrame(TPL.frames[r - r0]), beta);
      const cb = slerpFrame(ideal(r + 1), partnerFrame(TPL.frames[r + 1 - r0]), beta);
      out[r] = { coding: gapCoding(ca, cb), template: gapCoding(partnerFrame(cb), partnerFrame(ca)) };
    }
    return out;
  };
  const srcAsset = src(1);
  const rows = [];
  for (const beta of [1, 0.5]) {
    const sb = src(beta);
    for (const reg of [45, 105]) {
      const gaps = gapsOf(pose(reg, beta));
      let worstK1 = 0, worstSrc = 0, worst = -Infinity;
      for (let r = r0; r < r1; r++) {
        const g = reg + r, k1 = gaps[g], k1t = gaps[N - 1 + g];
        worstK1 = Math.max(worstK1, k1, k1t);
        worstSrc = Math.max(worstSrc, sb[r].coding, sb[r].template);
        // beta = 1: the source is the asset frames; beta = 0.5: the bound is the asset gap at that step (design §3.6)
        const bound = (a, b) => Math.max(a, b, 1.6) + 0.05;
        worst = Math.max(worst, k1 - bound(srcAsset[r].coding, sb[r].coding), k1t - bound(srcAsset[r].template, sb[r].template));
        assert.ok(k1 <= bound(srcAsset[r].coding, sb[r].coding), `coding r ${r}: ${k1} vs asset ${srcAsset[r].coding}`);
        assert.ok(k1t <= bound(srcAsset[r].template, sb[r].template), `template r ${r}: ${k1t} vs asset ${srcAsset[r].template}`);
      }
      rows.push(`beta ${beta} register ${reg}: max in-track gap ${f2(worstK1)} (blended source ${f2(worstSrc)}, asset ${f2(mx(Object.values(srcAsset).flatMap(v => [v.coding, v.template])))}), worst margin ${f2(worst)}`);
    }
  }
  // per-step table at beta 1 and 0.5, register 45
  const g1 = gapsOf(pose(45, 1)), g5 = gapsOf(pose(45, 0.5));
  rows.push('step r->r+1: coding b1/b.5/asset, template b1/b.5/asset');
  for (let r = r0; r < r1; r++) {
    const g = 45 + r;
    rows.push(`  ${String(r).padStart(3)}: ${f2(g1[g])}/${f2(g5[g])}/${f2(srcAsset[r].coding)}  ${f2(g1[N - 1 + g])}/${f2(g5[N - 1 + g])}/${f2(srcAsset[r].template)}`);
  }
  console.log(rows.join('\n'));
});

// ---- gate: stationarity ----------------------------------------------------------------------------------------

test('gate: downstream base pairs stay fixed while the machine translates along z_d', () => {
  const zd = downstreamAxis(EC), reg0 = 45, M0 = machinePoseForRegister(EC, reg0);
  const g = reg0 + 30; // 30 bp downstream of template register 0
  let ref = null, worst = 0;
  for (let d = 0; d <= 10; d += 0.25) {
    // M = M0 . translate(z_d 3.38 d) in machine coordinates
    const loc = zd.map(v => v * HELIX_B.rise * d);
    const M = { o: applyFrame(M0, loc), R: M0.R.slice() };
    const buf = pose(reg0 + d, 1, { M });
    const o = originOf(buf, g);
    if (!ref) ref = o;
    worst = Math.max(worst, Math.hypot(o[0] - ref[0], o[1] - ref[1], o[2] - ref[2]));
  }
  console.log(`stationarity: max drift of base pair g = register + 30 over 10 bp of machine travel = ${worst.toExponential(2)} A`);
  assert.ok(worst < 0.01, `drift ${worst}`);
});

// ---- gate: beta = 0 equals ideal B-DNA --------------------------------------------------------------------------

test('gate: beta = 0 equals ideal B-DNA (heavy atoms, one rigid superposition)', () => {
  const ideal = buildDuplex(C.codingDna, HELIX_B);
  const Q = [];
  for (let i = 0; i < ideal.atoms.count; i++) Q.push(ideal.position(i));
  const rows = [];
  for (const [reg, opt] of [[45, {}], [105.5, {}], [60, { relax: 1 }]]) {
    const buf = pose(reg, reg === 60 ? 1 : 0, opt);
    const P = heavyAtoms(buf);
    assert.equal(P.length, Q.length);
    const f = kabsch(P, Q);
    let s = 0;
    for (let i = 0; i < P.length; i++) { const p = applyFrame(f, P[i]), d = dist(p, Q[i]); s += d * d; }
    const rmsd = Math.sqrt(s / P.length);
    rows.push(`register ${reg}${opt.relax ? ' (bend 1, relax 1)' : ''}: RMSD to buildDuplex = ${rmsd.toExponential(2)} A (${P.length} heavy atoms)`);
    assert.ok(rmsd < 0.01, `rmsd ${rmsd}`);
  }
  console.log(rows.join('\n'));
});

// ---- gate: machinePoseForRegister --------------------------------------------------------------------------------

test('gate: machinePoseForRegister makes the beta = 0 duplex equal the straight world duplex', () => {
  let worstO = 0, worstR = 0, n = 0;
  for (const reg of [0, 45, 60.25, 105, 150.75, 200]) {
    const buf = pose(reg, 0);
    for (let g = 0; g < N; g++) {
      const w = composeFrame(W, screwStep(g - 124));
      const f = readFrame16(buf, g);
      worstO = Math.max(worstO, dist(f.o, w.o));
      worstR = Math.max(worstR, ...f.R.map((v, i) => Math.abs(v - w.R[i])));
      const t = readFrame16(buf, N + g), wp = partnerFrame(w);
      worstO = Math.max(worstO, dist(t.o, wp.o));
      worstR = Math.max(worstR, ...t.R.map((v, i) => Math.abs(v - wp.R[i])));
      n++;
    }
  }
  console.log(`machinePoseForRegister: max origin error ${worstO.toExponential(2)} A, max rotation entry error ${worstR.toExponential(2)} over ${n} pairs`);
  assert.ok(worstO < 0.01 && worstR < 1e-4);
  // the no-machine duplex is the same straight duplex
  const none = pose(0, 0, { machine: false });
  for (let g = 0; g < N; g += 17) {
    const w = composeFrame(W, screwStep(g - 124)), f = readFrame16(none, g);
    assert.ok(dist(f.o, w.o) < 1e-3);
  }
});

// ---- bubble and track blend ------------------------------------------------------------------------------------

test('bubble: the coding strand follows the non-template track at beta = 1 and the ideal frame at beta = 0', () => {
  const reg = 45, bub = [-11, 2];
  const M = machinePoseForRegister(EC, reg);
  const buf = pose(reg, 1, { bubble: bub });
  let worst = 0;
  for (let r = bub[0]; r <= bub[1]; r++) {
    const f = readFrame16(buf, reg + r), want = composeFrame(M, NT.frames[r - NT.registers[0]]);
    worst = Math.max(worst, dist(f.o, want.o), ...f.R.map((v, i) => Math.abs(v - want.R[i])));
  }
  assert.ok(worst < 1e-3, `bubble coding frames off the non-template track by ${worst}`);
  // template strand unchanged by the bubble
  const closed = pose(reg, 1);
  for (let g = 0; g < N; g++) for (let k = 0; k < 16; k++) assert.ok(Math.abs(buf[16 * (N + g) + k] - closed[16 * (N + g) + k]) < 1e-5);
  // beta = 0: the bubble has no effect
  const a = pose(reg, 0, { bubble: bub }), b = pose(reg, 0);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-4);
  const gaps = gapsOf(buf);
  let w = 0; for (let r = bub[0]; r < bub[1]; r++) w = Math.max(w, gaps[reg + r]);
  console.log(`bubble [-11, 2] at beta 1: coding strand on non-template track (max frame error ${worst.toExponential(1)}), max coding O3'-P inside the bubble ${f2(w)} A`);
});

const BUB = [-11, 2];
/** Per beta: worst coding O3'-P over the bubble steps (r -12 ... 2) and worst excess over max(gap at 0, gap at 1) per step. */
function bubbleStats(reg) {
  const g0 = gapsOf(pose(reg, 0, { bubble: BUB })), g1 = gapsOf(pose(reg, 1, { bubble: BUB })), out = [];
  for (let k = 1; k <= 9; k++) {
    const beta = k / 10, g = gapsOf(pose(reg, beta, { bubble: BUB })), cl = lastBubbleClosure(C);
    let worst = 0, margin = -Infinity, at = 0;
    for (let r = BUB[0] - 1; r <= BUB[1]; r++) {
      worst = Math.max(worst, g[reg + r]);
      const m = g[reg + r] - Math.max(g0[reg + r], g1[reg + r]);
      if (m > margin) { margin = m; at = r; }
    }
    out.push({ beta, worst, margin, at, cl });
  }
  return out;
}

test('bubble chain: beta = 0 and beta = 1 are the reference frames; the partial-bend path is continuous with both', () => {
  for (const reg of [45, 105]) {
    const M = machinePoseForRegister(EC, reg), b0 = pose(reg, 0, { bubble: BUB }), b1 = pose(reg, 1, { bubble: BUB });
    const closed0 = pose(reg, 0), closed1 = pose(reg, 1);
    for (let i = 0; i < b0.length; i++) assert.ok(Math.abs(b0[i] - closed0[i]) < 1e-4);
    for (let g = 0; g < N; g++) {
      const r = g - reg, f = readFrame16(b1, g);
      const want = r >= BUB[0] && r <= BUB[1] ? composeFrame(M, NT.frames[r - NT.registers[0]]) : readFrame16(closed1, g);
      assert.ok(dist(f.o, want.o) < 1e-3 && Math.max(...f.R.map((v, i) => Math.abs(v - want.R[i]))) < 1e-5, `beta 1 frame g ${g}`);
    }
    for (const [beta, ref] of [[1e-6, b0], [1 - 1e-6, b1]]) {
      const o = pose(reg, beta, { bubble: BUB });
      let w = 0; for (let g = 0; g < N; g++) w = Math.max(w, dist(originOf(o, g), originOf(ref, g)));
      assert.ok(w < 1e-2, `beta ${beta}: frames differ from the reference by ${w} A`);
    }
    // the last bubble frame joins its right anchor exactly: nothing outside the bubble changes with the chain
    const half = pose(reg, 0.5, { bubble: BUB }), halfClosed = pose(reg, 0.5);
    for (let g = 0; g < N; g++) {
      const r = g - reg;
      if (r >= BUB[0] && r <= BUB[1]) continue;
      for (let k = 0; k < 16; k++) assert.ok(Math.abs(half[16 * g + k] - halfClosed[16 * g + k]) < 1e-5);
    }
  }
});

test('bubble chain: partial-bend coding gaps stay near the end-point gaps (regression guard)', () => {
  const rows = [];
  for (const reg of [45, 105]) {
    for (const s of bubbleStats(reg)) {
      rows.push(`register ${reg} beta ${s.beta.toFixed(1)}: worst bubble coding gap ${f2(s.worst)} A, worst excess over max(gap0, gap1) ${f2(s.margin)} A (r ${s.at}), closure error before distribution ${f2(s.cl.trans)} A / ${f2(s.cl.angleDeg)} deg`);
      assert.ok(s.worst <= 6.0, `register ${reg} beta ${s.beta}: worst bubble gap ${s.worst}`); // was up to 16.1 A with independent slerps
    }
  }
  console.log(rows.join('\n'));
});

// Stage-lead gate decision (ST3): the per-step "max(gap0, gap1) + 1.0 A" gate is not met by the step-chained bubble
// interpolation (worst excess about 2.0 A at single edge steps near beta 0.4, from distributing a closure error of up
// to 175 degrees). The accepted gates are: (a) at every partial beta the worst bubble gap does not exceed the worst
// bubble gap of the asset itself at beta = 1, and (b) no single step exceeds max(gap0, gap1) + 2.5 A. Both measured
// values are recorded in docs/handoffs/R3-K1.md.
test('gate: bubble coding gaps at partial bend never exceed the beta = 1 worst gap; per step <= max(gap0, gap1) + 2.5 A', () => {
  for (const reg of [45, 105]) {
    const g1 = gapsOf(pose(reg, 1, { bubble: BUB }));
    let atOne = 0;
    for (let r = BUB[0] - 1; r <= BUB[1]; r++) atOne = Math.max(atOne, g1[reg + r]);
    assert.ok(atOne > 6 && atOne < 7, `beta-1 worst bubble gap ${atOne}`);
    for (const s of bubbleStats(reg)) {
      assert.ok(s.worst <= atOne + 1e-6, `register ${reg} beta ${s.beta}: worst ${s.worst} > beta-1 worst ${atOne}`);
      assert.ok(s.margin <= 2.5, `register ${reg} beta ${s.beta}: excess ${s.margin} at r ${s.at}`);
    }
  }
});

test('trackBlend: holo and ec tracks are slerped per register (synthetic holo copy); without holo tracks the ec tracks are used', () => {
  const frames = TPL.frames.map(f => ({ o: [f.o[0] + 4, f.o[1], f.o[2]], R: f.R.slice() }));
  const holo = { ...HOLO, tracks: { template: { ...TPL, frames } } };
  const assets = { 'rnap-ec': EC, 'rnap-holo': holo };
  const base = pose(45, 1, { trackBlend: 1, assets });
  const alone = pose(45, 1, { assets: { 'rnap-ec': EC } });
  const real = pose(45, 1, { trackBlend: 0 }); // real holo asset has no tracks: ec tracks
  for (let i = 0; i < base.length; i++) { assert.equal(base[i], alone[i]); assert.equal(base[i], real[i]); }
  const zero = pose(45, 1, { trackBlend: 0, assets });
  const half = pose(45, 1, { trackBlend: 0.5, assets });
  const g = 45 + 3; // register 3 (inside the track)
  const o1 = originOf(base, g), o0 = originOf(zero, g), oh = originOf(half, g);
  const M = machinePoseForRegister(EC, 45);
  // holo origin is offset by 4 A along asset x, ec by 0; the half blend is in between
  const d = (a, b) => dist(a, b);
  assert.ok(Math.abs(d(o0, o1) - 4) < 1e-3, `holo/ec offset ${d(o0, o1)}`);
  assert.ok(Math.abs(d(oh, o1) - 2) < 1e-3 && Math.abs(d(oh, o0) - 2) < 1e-3);
  // default blend follows the machine asset (DEC-007): rnap-holo -> 0, otherwise 1
  const out = new Float32Array(32 * N);
  poseDuplex(C, { register: 45, bend: 1, bubble: [0, 0], relax: 0 }, assets, out, { machine: { assetId: 'rnap-holo', transform: machinePoseForRegister(EC, 45) } });
  for (let i = 0; i < out.length; i++) assert.equal(out[i], zero[i]);
  poseDuplex(C, { register: 45, bend: 1, bubble: [0, 0], relax: 0, trackBlend: 0.5 }, assets, out, { machine: { assetId: 'rnap-ec', transform: machinePoseForRegister(EC, 45) } });
  for (let i = 0; i < out.length; i++) assert.equal(out[i], half[i]);
});

// ---- gate: clash -------------------------------------------------------------------------------------------------

test('gate: DNA inside the track range penetrates rnap-ec L1 beads by at most 1.0 A at beta = 1', () => {
  const pos = EC.lod1.positions, kind = EC.lod1.kind, nb = EC.lod1.count;
  const radius = k => (k === 1 ? 2.4 : 1.9);
  const rows = [];
  let worst = -Infinity;
  for (const reg of [45, 105, 165]) {
    const M = machinePoseForRegister(EC, reg), buf = pose(reg, 1, { M });
    const beads = new Float64Array(3 * nb);
    for (let i = 0; i < nb; i++) { const p = applyFrame(M, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]); beads.set(p, 3 * i); }
    let pen = -Infinity, at = '';
    for (let r = r0; r <= r1; r++) {
      const g = reg + r;
      for (const [i, base, strand] of [[g, C.codingDna[g], 'coding'], [N + g, C.templateDna[g], 'template']]) {
        const t = nucleotideTemplate(base), f = readFrame16(buf, i);
        for (let a = 0; a < t.names.length; a++) {
          const p = applyFrame(f, [t.local[3 * a], t.local[3 * a + 1], t.local[3 * a + 2]]);
          for (let b = 0; b < nb; b++) {
            const d = Math.hypot(p[0] - beads[3 * b], p[1] - beads[3 * b + 1], p[2] - beads[3 * b + 2]);
            const pn = radius(kind[b]) - d;
            if (pn > pen) { pen = pn; at = `${strand} r ${r} ${t.names[a]}`; }
          }
        }
      }
    }
    rows.push(`register ${reg}: max penetration ${f2(pen)} A (${at})`);
    worst = Math.max(worst, pen);
  }
  console.log(rows.join('\n'));
  assert.ok(worst <= 1.0, `max penetration ${worst}`);
});

// ---- gate: determinism, NaN, timing, allocation -------------------------------------------------------------------

test('determinism, no NaN over a register / bend / relax / bubble sweep', () => {
  const a = new Float32Array(32 * N), b = new Float32Array(32 * N);
  let calls = 0;
  for (let reg = -5; reg <= 260; reg += 7.25) {
    for (const bend of [0, 0.3, 1]) for (const relax of [0, 0.6, 1]) for (const bubble of [[0, 0], [-11, 2]]) {
      const M = machinePoseForRegister(EC, reg);
      pose(reg, bend, { relax, bubble, out: a, M });
      pose(reg, bend, { relax, bubble, out: b, M });
      for (let i = 0; i < a.length; i++) { assert.ok(Number.isFinite(a[i]), `NaN at register ${reg}`); assert.equal(a[i], b[i]); }
      calls++;
    }
  }
  console.log(`sweep ok: ${calls} poses`);
});

test('timing: poseDuplex median <= 1.5 ms for 248 bp; scratch is cached (no per-call growth)', () => {
  const out = new Float32Array(32 * N), M = machinePoseForRegister(EC, 105);
  const run = i => poseDuplex(C, { machineId: 'rnap', register: 105 + (i % 40) * 0.37, bend: 1, bubble: [-11, 2], relax: 0 }, ASSETS, out, { machine: { assetId: 'rnap-ec', transform: M } });
  for (let i = 0; i < 300; i++) run(i); // warm-up
  const times = [];
  for (let i = 0; i < 600; i++) { const t = process.hrtime.bigint(); run(i); times.push(Number(process.hrtime.bigint() - t) / 1e6); }
  times.sort((x, y) => x - y);
  const med = times[times.length >> 1];
  console.log(`poseDuplex timing: median ${med.toFixed(3)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms, max ${times[times.length - 1].toFixed(3)} ms`);
  assert.ok(med <= 1.5, `median ${med} ms`);

  // allocation: heap growth over many calls, median of several runs (no --expose-gc needed)
  const growth = [];
  for (let k = 0; k < 5; k++) {
    if (global.gc) global.gc();
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 4000; i++) run(i);
    growth.push(process.memoryUsage().heapUsed - h0);
  }
  growth.sort((x, y) => x - y);
  console.log(`poseDuplex heap growth over 4000 calls: median ${(growth[2] / 1024).toFixed(0)} KiB`);
  assert.ok(growth[2] <= 1024 * 1024, `heap growth ${growth[2]} bytes`);
});
