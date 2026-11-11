// Thermal denaturation ("melting") of a DNA duplex.
//
// Physics (source of truth: science/thermo.js)
//   helixCoil() gives each base pair's equilibrium probability of being closed, duplexThermo()
//   gives Tm, ΔH, ΔS, ΔG37. Both are recomputed only when the conditions change.
//
// Dynamics (a stochastic simulation of ONE molecule, deterministic for a given seed)
//   * Every base pair has a boolean micro-state (closed / open) updated by heat-bath
//     (Glauber) dynamics on the same nearest-neighbour helix-coil model that helixCoil() solves
//     exactly: P(closed | neighbours) = R/(1+R) with R = σ^(1−nL−nR) · s(k−1,k)^nL · s(k,k+1)^nR,
//     s = exp(−ΔG_stack/RT), σ = cooperativity (bubble cost). Opening is therefore cooperative:
//     a pair next to an open one opens easily, a pair flanked by two closed ones hardly ever,
//     ends fray first, AT-rich islands before GC arms, and zipping spreads from a nucleus.
//   * The molecule as a whole is either associated ("A", pairs flicker) or dissociated ("D",
//     all pairs open, strands apart). A→D and D→A happen at rates whose ratio equals the
//     equilibrium duplex/single-strand ratio, so long-run pair statistics reproduce closed[k].
//     A→D unzips from the frayed ends; D→A brings the strands back and nucleates at a pair
//     chosen in proportion to closed[k] (GC-rich regions), then zips outward.
//   * openness[k] (0..1) is a critically damped follower of the micro-state; pair.strength = 1−openness.
//
// Geometry
//   * An open pair's two nucleotides rotate about the line through their own P and O3' atoms (so the
//     covalent link to both neighbours is untouched, "tilts about its backbone") and are pushed
//     outward along their local +y by a spatially smoothed amount (so neighbours never stretch the
//     O3'–P link beyond ~3.5 Å).
//   * When dissociated each strand translates away from the axis (±18 Å), unwinds to ~22° per residue
//     and undulates (smooth bend noise), built by chaining screw steps from the strand centre.
//   * Every nucleotide carries smooth thermal noise ∝ sqrt(T[K]).
import { buildDuplex, helixCoil, duplexThermo, meltingCurve, stackThermo, cleanSequence } from '../science/index.js';
import {
  mulberry32, clamp, smoothstep, dampStep, createNoise, DEG,
  mulMM, mulMV, axisAngle, expMap, rotZInto, rotXInto, rotYInto, composeInto, invertInto, newFrame, copyFrame,
} from './util.js';

const R_GAS = 1.98720425e-3;      // kcal mol^-1 K^-1 (same constant as science/thermo.js)
const SIGMA = 1e-4;               // helix-coil cooperativity: must equal helixCoil's default
const LOG_SIGMA = Math.log(SIGMA);
const LOG_UNZIP = Math.log(1e-4); // extra penalty on closing at a fraying front while unzipping
const RATE_FLICKER = 2.0;         // heat-bath attempts per pair per second  (flicker time ~0.5 s)
const SUBSTEP = 1 / 30;
const TARGET_FRONT_TIME = 4;      // s: a domain wall should be able to cross the molecule in about this long
const OMEGA_OPEN = 9;             // 1/s: critically damped follower of the micro-state
const OMEGA_SEP = 3;              // 1/s: strand separation follower
const A_TRANS = 3.0;              // Å: smoothed outward push of an open base along local +y
const THETA_MAX = 38 * DEG;       // swing about the P–O3' line
const SEP_SHIFT = 18;             // Å: translation of each strand away from the axis
const COIL_TWIST = 22.5;          // °/residue in the dissociated coil
const BEND_MAX = 3 * DEG;         // rad per residue step, amplitude of coil bending noise
const KERNEL = [1, 2, 3, 4, 3, 2, 1].map(v => v / 16);
const FLIP = [1, 0, 0, 0, -1, 0, 0, 0, -1];

export function createMeltSim(sequence, opts = {}) {
  const { T = 25, Na = 0.1, Ct = 1e-6, seed = 1 } = opts;
  const seq = cleanSequence(sequence);
  const n = seq.length;
  if (n < 2) throw new Error('createMeltSim: sequence needs at least 2 bases');
  const assembly = buildDuplex(seq);
  const N = assembly.nucleotides.length;
  // buildDuplex's partner frames share their `o` array with the strand-I frame: give every nucleotide its own.
  for (const nuc of assembly.nucleotides) nuc.frame = { o: nuc.frame.o.slice(), R: nuc.frame.R.slice() };
  const rng = mulberry32(seed);
  let disposed = false;

  // ---- ideal reference geometry --------------------------------------------------------------
  const ideal = [];                                           // per pair k: pair frame (strand-I nucleotide frame)
  for (let k = 0; k < n; k++) ideal.push({ o: assembly.nucleotides[2 * k].frame.o.slice(), R: assembly.nucleotides[2 * k].frame.R.slice() });
  const kc = (n - 1) >> 1;
  const rise = assembly.meta.helix.rise, twist0 = assembly.meta.helix.twistDeg * DEG;
  // The backbone attachment line (P ... O3') of a nucleotide, in its own frame (identical for all bases).
  const nuc0 = assembly.nucleotides[0];
  const iP = nuc0.atomIndex.P, iO3 = nuc0.atomIndex["O3'"];
  const Ploc = [nuc0.local[iP * 3], nuc0.local[iP * 3 + 1], nuc0.local[iP * 3 + 2]];
  const Oloc = [nuc0.local[iO3 * 3], nuc0.local[iO3 * 3 + 1], nuc0.local[iO3 * 3 + 2]];
  const axl = Math.hypot(Oloc[0] - Ploc[0], Oloc[1] - Ploc[1], Oloc[2] - Ploc[2]);
  const ax = [(Oloc[0] - Ploc[0]) / axl, (Oloc[1] - Ploc[1]) / axl, (Oloc[2] - Ploc[2]) / axl];

  // ---- conditions & equilibrium thermodynamics ------------------------------------------------
  let cond = { T, Na, Ct };
  const logS = new Float64Array(Math.max(n - 1, 1));
  let dup = 1;
  const openness = new Float32Array(n);
  const state = {
    T, Na, Ct, Tm: NaN, dH: 0, dS: 0, dG37: 0, gc: 0,
    closed: new Float64Array(n), openness, fractionPaired: 1, duplexFraction: 1,
    curve: [], phase: 'duplex', jitter: 0, separation: 0, length: n, sequence: seq,
  };

  function recomputeSalt() {
    const th = duplexThermo(seq, { Na: cond.Na, Ct: cond.Ct });
    state.Tm = th.Tm; state.dH = th.dH; state.dS = th.dS; state.dG37 = th.dG37; state.gc = th.gc;
    state.curve = meltingCurve(seq, { Na: cond.Na, Ct: cond.Ct });
  }
  function recomputeTemperature() {
    const tk = cond.T + 273.15, RT = R_GAS * tk;
    for (let k = 0; k + 1 < n; k++) {
      const { dH, dS } = stackThermo(seq, k, cond.Na);
      logS[k] = -(dH - tk * dS / 1000) / RT;
    }
    const hc = helixCoil(seq, cond.T, { Na: cond.Na, Ct: cond.Ct, sigma: SIGMA });
    state.closed = hc.closed;
    dup = clamp(hc.duplex, 1e-300, 1);
    state.duplexFraction = hc.duplex;
    state.T = cond.T; state.Na = cond.Na; state.Ct = cond.Ct;
  }

  // ---- micro-state machine ---------------------------------------------------------------------
  const rateFront = Math.max(RATE_FLICKER * 1.5, n / TARGET_FRONT_TIME * 1.5);   // attempts/s at a domain wall
  const rateUnzip = Math.max(4, n / 6);                                          // attempts/s per pair while unzipping
  const zipSpeed = Math.max(5, n / 4);                                           // pairs/s of the re-annealing zipper
  const T_UNZIP = (n / 2) / (rateUnzip * 0.9), T_ZIP = (n / 2) / zipSpeed;       // typical transient durations (s)
  const T_APPROACH = 1.2;                                                        // strands returning (s)
  const micro = new Uint8Array(n);        // 1 closed, 0 open
  const target = new Uint8Array(n);       // configuration being revealed by the zipper
  let closedCount = 0;
  let mode = 'A';                          // 'A' associated | 'unzip' | 'D' dissociated | 'approach' | 'zip'
  let zipJ = 0, zipR = 0;
  let flip = 0;

  // Attempt rates may depend on the neighbours (not on the pair itself) without disturbing detailed
  // balance, so domain walls (pairs whose neighbours differ) are attempted faster than bulk pairs.
  function heatBath(pBulk, pFront, unzipping, keepLast) {
    flip ^= 1;
    for (let q = 0; q < n; q++) {
      const k = flip ? n - 1 - q : q;
      const nL = k > 0 ? micro[k - 1] : 0, nR = k < n - 1 ? micro[k + 1] : 0;
      const pAttempt = (nL !== nR || (k === 0 && nR) || (k === n - 1 && nL)) ? pFront : pBulk;
      if (pAttempt < 1 && rng() >= pAttempt) continue;
      let logR = (1 - nL - nR) * LOG_SIGMA + (nL ? logS[k - 1] : 0) + (nR ? logS[k] : 0);
      if (unzipping && (k === 0 || k === n - 1 || !nL || !nR)) logR += LOG_UNZIP;
      const pc = 1 / (1 + Math.exp(-logR));
      const want = rng() < pc ? 1 : 0;
      if (want === micro[k]) continue;
      if (!want && keepLast && closedCount === 1) continue;       // an associated molecule keeps >=1 pair
      micro[k] = want; closedCount += want ? 1 : -1;
    }
  }

  // Exact sample (forward-backward) of a configuration of the helix-coil model conditioned on having
  // at least one closed pair, i.e. of an associated duplex. States: 0 open before the helix,
  // 1 closed, 2 open after the helix; weights as in science/thermo.js.
  const bk = new Float64Array(3 * n);
  function sampleAssociated(out) {
    bk[3 * (n - 1)] = 0; bk[3 * (n - 1) + 1] = 1; bk[3 * (n - 1) + 2] = 1;
    for (let k = n - 2; k >= 0; k--) {
      const s = Math.exp(logS[k]), o = 3 * (k + 1);
      let b0 = bk[o] + bk[o + 1], b1 = s * bk[o + 1] + bk[o + 2], b2 = bk[o + 2] + SIGMA * bk[o + 1];
      const m = Math.max(b0, b1, b2) || 1;
      bk[3 * k] = b0 / m; bk[3 * k + 1] = b1 / m; bk[3 * k + 2] = b2 / m;
    }
    const pick = (w0, w1, w2) => {
      const tot = w0 + w1 + w2;
      if (!(tot > 0)) return 1;
      const r = rng() * tot;
      return r < w0 ? 0 : r < w0 + w1 ? 1 : 2;
    };
    let st = pick(bk[0], bk[1], 0);
    out[0] = st === 1 ? 1 : 0;
    for (let k = 1; k < n; k++) {
      const s = Math.exp(logS[k - 1]), o = 3 * k;
      if (st === 0) st = pick(bk[o], bk[o + 1], 0);
      else if (st === 1) st = pick(0, s * bk[o + 1], bk[o + 2]);
      else st = pick(0, SIGMA * bk[o + 1], bk[o + 2]);
      out[k] = st === 1 ? 1 : 0;
    }
    return out;
  }
  function beginZip() {
    sampleAssociated(target);
    // nucleate at a closed pair of the sample, chosen in proportion to its equilibrium closing probability
    const cl = state.closed;
    let tot = 0;
    for (let k = 0; k < n; k++) if (target[k]) tot += cl[k] + 1e-300;
    let j = 0, r = rng() * tot;
    for (let k = 0; k < n; k++) if (target[k]) { j = k; r -= cl[k] + 1e-300; if (r <= 0) break; }
    zipJ = j; zipR = 0; mode = 'zip';
    micro.fill(0); micro[j] = 1; closedCount = 1;
  }

  // Association/dissociation rates. The molecule cycles A -> unzip -> D -> approach -> zip -> A; the
  // dwell times in A and D are chosen so that the fraction of time with closed pairs reproduces the
  // equilibrium duplex fraction, counting half of each (un)zipping transient as closed.
  let rateA = 0, rateD = 0;           // ka (D->approach) and kd (A->unzip)
  function setRates() {
    const U = T_UNZIP + T_ZIP, Xmin = 0.4, Ymin = 0.4;
    const du = clamp(dup, 0, 1);
    if (du > 1 - 1e-6) { rateD = 0; rateA = 1 / Ymin; return; }
    if (du < 1e-6) { rateA = 0; rateD = 1 / Xmin; return; }
    const C = Math.min(1e7, Math.max(10, (Xmin + 0.5 * U) / du, (Ymin + 0.5 * U + T_APPROACH) / (1 - du)));
    rateD = 1 / Math.max(Xmin, du * C - 0.5 * U);
    rateA = 1 / Math.max(Ymin, (1 - du) * C - 0.5 * U - T_APPROACH);
  }

  // ---- continuous variables -------------------------------------------------------------------------
  const open = Array.from({ length: n }, () => ({ x: 0, v: 0 }));
  const sepS = { x: 0, v: 0 };
  const eff = new Float64Array(n);

  recomputeSalt();
  recomputeTemperature();
  setRates();
  if (dup >= 0.5) {                                   // start as an equilibrated duplex (exact sample)
    sampleAssociated(micro); closedCount = micro.reduce((a, b) => a + b, 0); mode = 'A';
  } else { micro.fill(0); closedCount = 0; mode = 'D'; }
  for (let k = 0; k < n; k++) open[k].x = micro[k] ? 0 : 1;
  sepS.x = mode === 'D' ? 1 : 0;

  function stepDynamics(h) {
    if (mode === 'A') {
      heatBath(1 - Math.exp(-RATE_FLICKER * h), 1 - Math.exp(-rateFront * h), false, true);
      if (rng() < 1 - Math.exp(-rateD * h)) mode = 'unzip';
    } else if (mode === 'unzip') {
      heatBath(1 - Math.exp(-rateUnzip * h), 1 - Math.exp(-rateUnzip * h), true, false);
      if (closedCount === 0) mode = 'D';
    } else if (mode === 'D') {
      if (rng() < 1 - Math.exp(-rateA * h)) mode = 'approach';
    } else if (mode === 'approach') {
      if (sepS.x < 0.12) beginZip();
    } else if (mode === 'zip') {
      zipR += zipSpeed * h;
      closedCount = 0;
      for (let k = 0; k < n; k++) { micro[k] = target[k] && Math.abs(k - zipJ) <= zipR ? 1 : 0; closedCount += micro[k]; }
      if (zipR >= n) mode = 'A';
    }
  }

  // ---- noise sources (all smooth, deterministic) ------------------------------------------------
  const jitterNoise = createNoise(rng, 6 * N, { fMin: 0.5, fMax: 2.0, waves: 2 });
  const wobbleNoise = createNoise(rng, 8, { fMin: 0.25, fMax: 0.8, gMax: 0.07, waves: 2 });
  const bendNoise = createNoise(rng, 4, { fMin: 0.1, fMax: 0.3, gMax: 0.1, waves: 2 });
  const driftNoise = createNoise(rng, 6, { fMin: 0.06, fMax: 0.18, waves: 2 });

  // ---- scratch geometry -----------------------------------------------------------------------------------
  const chain = [Array.from({ length: n }, newFrame), Array.from({ length: n }, newFrame)];
  const step = newFrame(), stepInv = newFrame(), stepBend = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const mz = new Array(9), mx = new Array(9), my = new Array(9), mt = new Array(9);
  const ROff = new Array(9), Rn = new Array(9), Rtmp = new Array(9);
  const vtmp = [0, 0, 0], vtmp2 = [0, 0, 0];
  let time = 0;

  function buildChain(s, sepv, t) {
    const B = chain[s];
    const sgn = s === 0 ? 1 : -1;
    // direction pointing from the axis towards this strand's backbone at the strand centre
    const yAxis = [ideal[kc].R[1], ideal[kc].R[4], ideal[kc].R[7]];
    const shift = SEP_SHIFT * sepv * sgn;
    const drift = 2.5 * sepv;
    copyFrame(B[kc], ideal[kc]);
    B[kc].o[0] += yAxis[0] * shift + drift * driftNoise.at(s * 3, t);
    B[kc].o[1] += yAxis[1] * shift + drift * driftNoise.at(s * 3 + 1, t);
    B[kc].o[2] += yAxis[2] * shift + drift * driftNoise.at(s * 3 + 2, t);
    const w = twist0 + (COIL_TWIST * DEG - twist0) * sepv;
    const makeStep = j => {
      const bx = BEND_MAX * sepv * bendNoise.at(s * 2, t, j);
      const by = BEND_MAX * sepv * bendNoise.at(s * 2 + 1, t, j);
      rotZInto(mz, w); rotXInto(mx, bx); rotYInto(my, by);
      mulMM(mt, mz, mx); mulMM(stepBend, mt, my);
      for (let i = 0; i < 9; i++) step.R[i] = stepBend[i];
      step.o[0] = 0; step.o[1] = 0; step.o[2] = rise;
      return step;
    };
    for (let k = kc; k < n - 1; k++) composeInto(B[k + 1], B[k], makeStep(k));
    for (let k = kc; k > 0; k--) { invertInto(stepInv, makeStep(k - 1)); composeInto(B[k - 1], B[k], stepInv); }
  }

  function geometry() {
    const t = time;
    const sepv = clamp(sepS.x, 0, 1);
    const coil = sepv > 1e-4;
    // spatially smoothed openness (translation field)
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let m = -3; m <= 3; m++) s += KERNEL[m + 3] * clamp(open[clamp(k + m, 0, n - 1) | 0].x, 0, 1);
      eff[k] = s;
    }
    if (coil) { buildChain(0, sepv, t); buildChain(1, sepv, t); }
    const tk = cond.T + 273.15;
    const jAmp = 0.15 * Math.sqrt(tk / 298.15), rAmp = 0.02 * Math.sqrt(tk / 298.15);
    const nucs = assembly.nucleotides;
    for (let k = 0; k < n; k++) {
      const ok = clamp(open[k].x, 0, 1);
      for (let s = 0; s < 2; s++) {
        const id = 2 * k + s, nuc = nucs[id], F = nuc.frame;
        const base = coil ? chain[s][k] : (s === 0 ? ideal[k] : null);
        // base frame (pair frame for strand I, partner frame for strand II)
        const bR = base ? base.R : ideal[k].R, bo = base ? base.o : ideal[k].o;
        const baseR = Rtmp;
        for (let i = 0; i < 9; i++) baseR[i] = bR[i];
        if (s === 1) { baseR[1] = -baseR[1]; baseR[2] = -baseR[2]; baseR[4] = -baseR[4]; baseR[5] = -baseR[5]; baseR[7] = -baseR[7]; baseR[8] = -baseR[8]; }
        // open-state offset in the nucleotide's own frame
        const e = eff[k];
        const wob = wobbleNoise.at(s * 4 + 3, t, k);
        const theta = THETA_MAX * (0.6 * ok + 0.4 * e) * (1 + 0.25 * wob) + 0.22 * ok * wobbleNoise.at(s * 4 + 3, t * 1.7, k * 0.5);
        const push = A_TRANS * (1 - 0.65 * sepv) * e;
        axisAngle(ROff, ax[0], ax[1], ax[2], theta);
        // o_off = P − R_off P + (0, push, 0)
        mulMV(vtmp, ROff, Ploc);
        vtmp[0] = Ploc[0] - vtmp[0]; vtmp[1] = Ploc[1] - vtmp[1] + push; vtmp[2] = Ploc[2] - vtmp[2];
        mulMV(vtmp2, baseR, vtmp);
        // world translation wobble of frayed regions (spatially correlated so links are not torn)
        const wa = 0.5 * e;
        F.o[0] = bo[0] + vtmp2[0] + wa * wobbleNoise.at(s * 4, t, k) + jAmp * jitterNoise.at(6 * id, t);
        F.o[1] = bo[1] + vtmp2[1] + wa * wobbleNoise.at(s * 4 + 1, t, k) + jAmp * jitterNoise.at(6 * id + 1, t);
        F.o[2] = bo[2] + vtmp2[2] + wa * wobbleNoise.at(s * 4 + 2, t, k) + jAmp * jitterNoise.at(6 * id + 2, t);
        mulMM(Rn, baseR, ROff);
        expMap(mt, rAmp * jitterNoise.at(6 * id + 3, t), rAmp * jitterNoise.at(6 * id + 4, t), rAmp * jitterNoise.at(6 * id + 5, t));
        mulMM(F.R, mt, Rn);
      }
    }
    assembly.updatePositions();
  }

  function refreshState() {
    let sumOpen = 0;
    for (let k = 0; k < n; k++) {
      const o = clamp(open[k].x, 0, 1);
      openness[k] = o; sumOpen += o;
      assembly.pairs[k].strength = 1 - o;
    }
    const fp = 1 - sumOpen / n;
    state.fractionPaired = fp;
    state.separation = clamp(sepS.x, 0, 1);
    state.jitter = clamp(0.12 + 0.88 * clamp(cond.T / 100, 0, 1), 0, 1);
    state.phase = state.separation > 0.5 ? 'single strands'
      : (mode === 'unzip' || mode === 'approach' || mode === 'zip' || fp < 0.6) ? 'melting'
      : fp < 0.92 ? 'fraying' : 'duplex';
  }

  function update(dt) {
    if (disposed) return;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.5);
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, SUBSTEP);
      left -= h;
      stepDynamics(h);
      const sepTarget = mode === 'D' ? 1 : 0;
      dampStep(sepS, sepTarget, OMEGA_SEP, h);
      for (let k = 0; k < n; k++) {
        // pairs cannot be closed while the strands are still apart / unzipping uses micro-state as is
        dampStep(open[k], micro[k] ? 0 : 1, OMEGA_OPEN, h);
      }
      time += h;
    }
    refreshState();
    geometry();
  }

  function setConditions(c = {}) {
    if (disposed) return;
    const saltChanged = (c.Na !== undefined && c.Na !== cond.Na) || (c.Ct !== undefined && c.Ct !== cond.Ct);
    const tempChanged = c.T !== undefined && c.T !== cond.T;
    if (c.T !== undefined && Number.isFinite(c.T)) cond.T = c.T;
    if (c.Na !== undefined && Number.isFinite(c.Na) && c.Na > 0) cond.Na = c.Na;
    if (c.Ct !== undefined && Number.isFinite(c.Ct) && c.Ct > 0) cond.Ct = c.Ct;
    if (saltChanged) recomputeSalt();
    if (saltChanged || tempChanged) { recomputeTemperature(); setRates(); }
    refreshState();
    geometry();
  }

  refreshState();
  geometry();

  return {
    assembly, state, blobs: [], sequence: seq,
    setConditions, update,
    dispose() { disposed = true; },
  };
}
