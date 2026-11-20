/**
 * @module sim/gene/translation
 * Round 3 translation choreography (PLAN.md §5.2–§5.3, §6.1 chapters 8–16, §8.2, task R3-S4).
 *
 * `contributeTl(story, t, out)` turns the translation events of the timeline (`mrna.layout`, `ribosome.bind`,
 * `ribosome.join`, `factor.enter/leave`, `gtp.hydrolyse`, `trna.enter/move/leave`, `codon.pair`,
 * `bond.peptide`, `translocate`, `peptide.release`) into WorldState: the ribosome machine and its subunit
 * parts, the six translation factors, four tRNA slots, the P-site codon (fractional during translocation),
 * the peptide length / attachment / release, and FX (GTP cues, bond pulses).
 *
 * Geometry kept here is limited to rigid machine placements, so `stateAt` stays independent of decoded assets
 * (as in `transcription.js`): the ribosome layout pose and the factor approach directions are embedded
 * constants measured from the assets and checked against them in `tests/story-tl.test.mjs`. tRNA, anticodon,
 * mRNA and peptide atoms are posed by `js/kin/pose.js` from the fields written here.
 *
 * Pure and deterministic: no clock, no DOM, no three.js; with `out` reused, no allocation per call (pool on
 * `out._tlPool`).
 */
import { lastStarted, completedCount, progressOf } from './story.js';

/**
 * Ribosome (`ribo` frame) pose in the world for the Step by step translation layout (PLAN.md §10 R3-S4):
 * origin 250 Å along world −z from the mRNA midpoint at the end of chapter 7 (t = 66.25 s, midpoint
 * [167.904, 24.278, 105.080]); +z along the mRNA 5′→3′ tangent at the SD region (nt 12 → nt 17 at that
 * time); +x (toward the 50S) is the component of world −z perpendicular to +z, keeping the 50S away from
 * the DNA. Measured with `createPoser` on the W2 assets; `tests/story-tl.test.mjs` re-derives it.
 */
export const RIBO_LAYOUT = Object.freeze({
  o: Object.freeze([167.904, 24.278, -144.92]),
  R: Object.freeze([0.246555, -0.534668, 0.808295, 0.155995, 0.845062, 0.511406, -0.956492, 0, 0.291759]),
});

/**
 * Unit vectors in the `ribo` frame from the ribosome `center` anchor to each factor asset's `center` anchor
 * (factor approach and release directions, PLAN.md §10 R3-S4 and §4.4), and to the 50S `largeCenter`.
 */
export const FACTOR_DIRS = Object.freeze({
  if1: Object.freeze([-0.77231, 0.22661, 0.59345]),
  if2: Object.freeze([-0.19044, 0.10145, 0.97644]),
  if3: Object.freeze([-0.90543, 0.39088, -0.16558]),
  'ef-tu': Object.freeze([-0.08326, 0.06537, 0.99438]),
  'ef-g': Object.freeze([-0.11183, 0.18796, 0.97579]),
  rf1: Object.freeze([-0.53809, 0.47279, 0.6978]),
});
export const LARGE_DIR = Object.freeze([0.89506, 0.30412, -0.32616]);

/** Factor approach distance (PLAN.md §10 R3-S4) and release distance (§4.4). */
export const ENTER_DISTANCE = 220;
export const RELEASE_DISTANCE = 60;
/** 30S·IF1·IF3 approach distance in chapter 8, along `LARGE_DIR` (the subunit interface side). */
export const SMALL_APPROACH_DISTANCE = 260;
/** Fade-in time of the 30S at the start of the translation layout (s). */
const SMALL_FADE_IN = 1.0;
/** Bond pulse duration (PLAN.md §4.4) and the minimum GTP event length that shows a 1.4 s cue. */
const PULSE_SECONDS = 0.4;
const GTP_CUE_MIN_EVENT = 1.0;

const FACTORS = Object.freeze(['if1', 'if3', 'if2', 'ef-tu', 'ef-g', 'rf1']);
const FACTOR_LABEL = Object.freeze({ if1: 'IF1', if2: 'IF2', if3: 'IF3', 'ef-tu': 'EF-Tu', 'ef-g': 'EF-G', rf1: 'RF1' });
const RIDES_WITH_30S = Object.freeze({ if1: true, if3: true });
const GTP_FACTORS = Object.freeze(['if2', 'ef-tu', 'ef-g']);
const SLOT_TARGETS = Object.freeze(['trna:0', 'trna:1', 'trna:2', 'trna:3']);
const slotTarget = codon => SLOT_TARGETS[(codon - 1) % 4];

function clamp01(x) {
  return x > 0 ? (x < 1 ? x : 1) : 0;
}

function ease(x) {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

function getPool(out) {
  let p = out._tlPool;
  if (p) return p;
  const part = () => ({ visible: true, opacity: 1 });
  const largePart = { visible: false, opacity: 0, transform: newFrame() };
  const smallPart = part();
  const ribosome = {
    id: 'ribosome', assetId: 'ribosome-70s', transform: newFrame(), opacity: 1, visible: true,
    parts: { small: smallPart, large: largePart }, label: 'Ribosome', pickable: true,
  };
  const factors = {};
  for (const id of FACTORS) {
    const body = part();
    factors[id] = {
      id, assetId: id, transform: newFrame(), opacity: 1, visible: true, parts: { body },
      label: FACTOR_LABEL[id], pickable: true,
    };
  }
  const trnas = SLOT_TARGETS.map((_, slot) => ({
    slot, kind: 'aa', aa: null, site: 'out', from: 'out', blend: 1, codon: 0, opacity: 1, peptidyl: false,
    pair: 0, approach: 0, carrier: 'ef-tu', depart: 0,
  }));
  const gtp = {};
  for (const id of GTP_FACTORS) gtp[id] = { type: 'gtp', anchor: { machineId: id, name: 'gDomain' }, f: 0, label: 'GTP → GDP' };
  const bondPulse = {
    type: 'pulse', kind: 'peptide', anchor: { atomGroup: 'peptide', atoms: [-1, -1] }, f: 0, t0: 0,
    duration: PULSE_SECONDS, age: 0, codon: 0,
  };
  const releasePulse = {
    type: 'pulse', kind: 'hydrolysis', anchor: { machineId: 'rf1', name: 'ggq', color: 0xff7a45 }, f: 0, t0: 0,
    duration: PULSE_SECONDS, age: 0,
  };
  const layout = newFrame();
  p = { ribosome, smallPart, largePart, factors, trnas, gtp, bondPulse, releasePulse, layout, off: [0, 0, 0] };
  Object.defineProperty(out, '_tlPool', { value: p, enumerable: false, writable: false });
  return p;
}

/** Write `layout · translate(local offset)` into `dst` (rotation unchanged). */
function placeAt(layout, off, dst) {
  const R = layout.R;
  dst.o[0] = layout.o[0] + R[0] * off[0] + R[1] * off[1] + R[2] * off[2];
  dst.o[1] = layout.o[1] + R[3] * off[0] + R[4] * off[1] + R[5] * off[2];
  dst.o[2] = layout.o[2] + R[6] * off[0] + R[7] * off[1] + R[8] * off[2];
  for (let i = 0; i < 9; i++) dst.R[i] = R[i];
  return dst;
}

/** Event index of the last `type` event for `target` started at `t`, only if it started at or after `since`. */
function lastSince(story, type, target, t, since) {
  const i = lastStarted(story, type, target, t);
  return i >= 0 && story.events[i].t0 >= since ? i : -1;
}

/** Progress (0..1) of the bond.peptide event of `codon` at `t`, or 0 if not started; 1 once complete. */
function bondProgress(story, codon, t) {
  if (codon < 2 || codon > 40) return 0;
  const i = lastStarted(story, 'bond.peptide', slotTarget(codon), t);
  if (i < 0) return 0;
  const e = story.events[i];
  if (e.data.codon === codon) return progressOf(story, i, t);
  return e.data.codon > codon ? 1 : 0;
}

/** Hydrolysis and slide progress of the peptide.release event at `t` (0 before it starts). */
function releaseProgress(story, t, outPair) {
  outPair[0] = 0; outPair[1] = 0;
  const i = lastStarted(story, 'peptide.release', 'ribosome', t);
  if (i < 0) return -1;
  const e = story.events[i];
  const h = e.data.hydrolysis || [0, 0];
  const s = e.data.slide || [0, 0];
  const base = e.t0 - h[0];
  outPair[0] = h[1] > h[0] ? clamp01((t - base - h[0]) / (h[1] - h[0])) : 1;
  outPair[1] = s[1] > s[0] ? ease((t - base - s[0]) / (s[1] - s[0])) : (t >= base + s[0] ? 1 : 0);
  return i;
}

/**
 * Populate translation fields of `out` at time `t` (chapters 8–16 in Step by step mode; the same events in
 * Coupled mode, whose ribosome layout S5 replaces).
 *
 * Extra (non-contract) fields written for the poser: `trnas[i].pair` (anticodon pairing 0..1),
 * `trnas[i].approach` (remaining fraction of the 220 Å approach), `trnas[i].carrier` (factor whose approach
 * direction the tRNA follows), `trnas[i].depart` (release progress along the 60 Å exit), and the
 * non-enumerable `out.ribosome.layout` (bound ribosome pose used for the mRNA track and tRNA sites).
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeTl(story, t, out) {
  if (!story || !out || !out.chapter) return out;
  if (story.meta && story.meta.fixture) return out;
  // Same boundary rule as contributeTx: t = 0 and t = duration keep the S2 defaults (tests/story.test.mjs).
  if (t <= 0 || t >= story.duration) return out;
  const layIdx = lastStarted(story, 'mrna.layout', null, t);
  if (layIdx < 0) return out; // no translation before the mRNA reaches its translation layout
  const ev = story.events;
  const pool = getPool(out);
  const layout = pool.layout;
  for (let i = 0; i < 3; i++) layout.o[i] = RIBO_LAYOUT.o[i];
  for (let i = 0; i < 9; i++) layout.R[i] = RIBO_LAYOUT.R[i];
  const ribState = out.ribosome;
  if (!Object.prototype.hasOwnProperty.call(ribState, 'layout')) {
    Object.defineProperty(ribState, 'layout', { value: layout, enumerable: false, writable: false });
  }

  // 1. Ribosome: 30S·IF1·IF3 fades in at the layout start, approaches over ribosome.bind; 50S joins.
  const bindIdx = lastStarted(story, 'ribosome.bind', null, t);
  const uBind = bindIdx >= 0 ? ease(progressOf(story, bindIdx, t)) : 0;
  const approach = SMALL_APPROACH_DISTANCE * (1 - uBind);
  const fade = ease((t - ev[layIdx].t0) / SMALL_FADE_IN);
  const rib = pool.ribosome;
  const off = pool.off;
  off[0] = LARGE_DIR[0] * approach; off[1] = LARGE_DIR[1] * approach; off[2] = LARGE_DIR[2] * approach;
  placeAt(layout, off, rib.transform);
  rib.opacity = fade;
  rib.visible = fade > 0.001;
  pool.smallPart.visible = true;
  pool.smallPart.opacity = fade;
  const joinIdx = lastStarted(story, 'ribosome.join', 'large', t);
  const lp = pool.largePart;
  if (joinIdx >= 0) {
    const pj = progressOf(story, joinIdx, t);
    const u = ease(pj);
    const d = ENTER_DISTANCE * (1 - u);
    lp.visible = true;
    lp.opacity = ease(pj / 0.4);
    lp.transform.o[0] = LARGE_DIR[0] * d; lp.transform.o[1] = LARGE_DIR[1] * d; lp.transform.o[2] = LARGE_DIR[2] * d;
  } else {
    lp.visible = false;
    lp.opacity = 0;
    lp.transform.o[0] = LARGE_DIR[0] * ENTER_DISTANCE;
    lp.transform.o[1] = LARGE_DIR[1] * ENTER_DISTANCE;
    lp.transform.o[2] = LARGE_DIR[2] * ENTER_DISTANCE;
  }
  if (rib.visible) out.machines.push(rib);
  ribState.bound = bindIdx >= 0 && progressOf(story, bindIdx, t) >= 1;

  // 2. P-site codon: 1, then k-1 -> k across each translocation of codon k.
  const trIdx = lastStarted(story, 'translocate', 'ribosome', t);
  ribState.codon = trIdx >= 0 ? ev[trIdx].data.codon - 1 + ease(progressOf(story, trIdx, t)) : 1;

  // 3. Factors: enter from 220 Å along their centre direction; leave 60 Å outward with a fade (§4.4).
  for (let f = 0; f < FACTORS.length; f++) {
    const id = FACTORS[f];
    const eI = lastStarted(story, 'factor.enter', id, t);
    if (eI < 0) continue;
    const lI = lastSince(story, 'factor.leave', id, t, ev[eI].t0);
    const dir = FACTOR_DIRS[id];
    let dist;
    let op;
    if (lI >= 0) {
      const p = progressOf(story, lI, t);
      if (p >= 1) continue;
      dist = RELEASE_DISTANCE * ease(p);
      op = 1 - ease((p - 0.4) / 0.6);
    } else {
      const p = progressOf(story, eI, t);
      dist = ENTER_DISTANCE * (1 - ease(p));
      op = ease(p / 0.4);
    }
    off[0] = dir[0] * dist; off[1] = dir[1] * dist; off[2] = dir[2] * dist;
    if (RIDES_WITH_30S[id]) {
      off[0] += LARGE_DIR[0] * approach; off[1] += LARGE_DIR[1] * approach; off[2] += LARGE_DIR[2] * approach;
    }
    const m = pool.factors[id];
    placeAt(layout, off, m.transform);
    m.opacity = op;
    m.visible = op > 0.001;
    m.parts.body.opacity = op;
    if (m.visible) out.machines.push(m);
  }

  // 4. GTP cues (1.4 s, §4.4) for GTP events long enough to show one (chapters 10, 11, 13).
  for (let g = 0; g < GTP_FACTORS.length; g++) {
    const id = GTP_FACTORS[g];
    const i = lastStarted(story, 'gtp.hydrolyse', id, t);
    if (i < 0) continue;
    const e = ev[i];
    if (e.t1 - e.t0 < GTP_CUE_MIN_EVENT || t > e.t1) continue;
    const fx = pool.gtp[id];
    fx.f = progressOf(story, i, t);
    out.fx.push(fx);
  }

  // 5. Release: hydrolysis and slide progress.
  const rel = pool.relPair || (pool.relPair = [0, 0]);
  const relIdx = releaseProgress(story, t, rel);
  const hydrolysed = relIdx >= 0 && rel[0] >= 0.5;

  // 6. tRNA slots.
  for (let s = 0; s < 4; s++) {
    const tgt = SLOT_TARGETS[s];
    const eI = lastStarted(story, 'trna.enter', tgt, t);
    if (eI < 0) continue;
    const enter = ev[eI];
    const lI = lastSince(story, 'trna.leave', tgt, t, enter.t0);
    const pLeave = lI >= 0 ? progressOf(story, lI, t) : 0;
    if (lI >= 0 && pLeave >= 1) continue;
    const tr = pool.trnas[s];
    const k = enter.data.codon;
    tr.kind = enter.data.kind;
    tr.codon = k;
    tr.carrier = enter.data.site === 'AT' ? 'ef-tu' : 'if2';
    const pEnter = progressOf(story, eI, t);
    tr.approach = 1 - ease(pEnter);
    const mI = lastSince(story, 'trna.move', tgt, t, enter.t0);
    if (mI >= 0) {
      tr.from = ev[mI].data.from;
      tr.site = ev[mI].data.to;
      tr.blend = ease(progressOf(story, mI, t));
    } else {
      tr.from = enter.data.site;
      tr.site = enter.data.site;
      tr.blend = 1;
    }
    if (lI >= 0) { // leaving from its current site
      tr.from = ev[lI].data.from || tr.site;
      tr.site = tr.from;
      tr.blend = 1;
    }
    tr.depart = ease(pLeave);
    tr.opacity = lI >= 0 ? 1 - ease((pLeave - 0.4) / 0.6) : ease(pEnter / 0.4);

    // Pairing: recognition (codon.pair) in A/T or P; unpairing as the tRNA moves P -> E.
    const pI = lastSince(story, 'codon.pair', tgt, t, enter.t0);
    let pair = pI >= 0 ? ease(progressOf(story, pI, t)) : 0;
    if (tr.site === 'E') pair *= tr.from === 'E' ? 0 : 1 - tr.blend;
    if (lI >= 0) pair *= 1 - Math.min(1, 4 * pLeave); // a leaving tRNA lets go of its codon first
    tr.pair = pair;

    // Aminoacyl / peptidyl state: codon 1 holds fMet; codon k receives the chain at its bond midpoint and
    // donates it at the bond midpoint of codon k + 1 (or at RF1 hydrolysis for codon 40).
    const received = k === 1 || bondProgress(story, k, t) >= 0.5;
    const donated = k < 40 ? bondProgress(story, k + 1, t) >= 0.5 : hydrolysed;
    tr.peptidyl = received && !donated;
    tr.aa = donated ? null : enter.data.aa;
    out.trnas.push(tr);
  }

  // 7. Peptide chain: 1 residue (fMet) from the initiator's arrival; +1 at each bond midpoint.
  const pep = out.peptide;
  const initIdx = lastStarted(story, 'trna.enter', 'trna:0', t);
  if (initIdx >= 0) {
    let n = 1 + completedCount(story, 'bond.peptide', null, t);
    const bI = lastStarted(story, 'bond.peptide', null, t);
    if (bI >= 0 && t < ev[bI].t1 && progressOf(story, bI, t) >= 0.5) n += 1;
    pep.length = n;
    let attach = 'P';
    for (let i = 0; i < out.trnas.length; i++) {
      const tr = out.trnas[i];
      if (!tr.peptidyl) continue;
      attach = tr.site === 'A' || (tr.from === 'A' && tr.blend < 0.5) || tr.site === 'AT' ? 'A' : 'P';
    }
    pep.attach = hydrolysed ? 'free' : attach;
    pep.release = relIdx >= 0 ? rel[1] : 0;
  }

  // 8. Bond pulses: peptide bond at each bond midpoint; ester hydrolysis at RF1's GGQ.
  const bI = lastStarted(story, 'bond.peptide', null, t);
  if (bI >= 0) {
    const e = ev[bI];
    const ts = 0.5 * (e.t0 + e.t1);
    const f = (t - ts) / PULSE_SECONDS;
    if (f >= 0 && f < 1) {
      const p = pool.bondPulse;
      p.f = f; p.t0 = ts; p.age = t - ts; p.codon = e.data.codon;
      out.fx.push(p);
    }
  }
  if (relIdx >= 0) {
    const e = ev[relIdx];
    const h = e.data.hydrolysis || [0, 0];
    const ts = e.t0 + 0.5 * (h[1] - h[0]);
    const f = (t - ts) / PULSE_SECONDS;
    if (f >= 0 && f < 1) {
      const p = pool.releasePulse;
      p.f = f; p.t0 = ts; p.age = t - ts;
      out.fx.push(p);
    }
  }
  return out;
}
