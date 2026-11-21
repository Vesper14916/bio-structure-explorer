/**
 * @module sim/gene/coupled
 * Round 3 coupled transcription-translation choreography (PLAN.md §6.4, §8.1–§8.2, task R3-S5).
 *
 * `contributeCoupled(story, t, out)` runs after `contributeTx` and `contributeTl` in Coupled mode:
 * - Locks the ribosome and all active translation factors onto the moving `6ZTJ` expressome pose
 *   (`M_rnap(reg) · rnap-ec.anchors.expressome`) from chapter 7 (`couple-scan`) through chapter 10
 *   (`couple-terminate`), freezing at `END_REGISTER = 223` once RNAP releases the RNA so the
 *   ribosome remains continuous through chapter 11 (`release`) and chapter 12 (`finale`).
 * - Animates the bridging factor NusG (`assets/nusg.asset.json`, stored in the `rnap` frame):
 *   220 Å outward approach in chapter 8 (`[6.0, 7.5] s`), bound through `couple-run` (chapter 9)
 *   and chapter 10 (`[0, 1.0] s`), and 60 Å outward release with fade in chapter 10 (`[1.0, 2.0] s`).
 *
 * Pure and deterministic: no clock, no DOM, no three.js; zero per-call heap allocations when `out`
 * is reused (pool stored on non-enumerable `out._cplPool`).
 */
import { buildTimeline } from './timeline.js';
import { lastStarted, progressOf } from './story.js';
import { machinePoseForRegister } from '../../kin/duplex.js';
import { invertFrame } from '../../kin/frames.js';
import { RIBO_LAYOUT, ENTER_DISTANCE, RELEASE_DISTANCE } from './translation.js';

const END_REGISTER = 223;

/**
 * Rigid transform placing `ribosome-70s` (`ribo` frame) into the `rnap` frame, measured from
 * `6ZTJ` in task R3-A4 (`assets/rnap-ec.asset.json` `anchors.expressome`, `DEC-024`).
 * Verified against `assets/rnap-ec.asset.json` in `tests/story-coupled.test.mjs`.
 */
export const EXPRESSOME_ANCHOR = Object.freeze({
  o: Object.freeze([-118.594, -22.347, -56.686]),
  R: Object.freeze([
    -0.954598, -0.253134, 0.157054,
    0.249282, -0.390131, 0.886373,
    -0.163099, 0.88528, 0.435519,
  ]),
});

/**
 * Outward unit vector in the `rnap` frame for NusG approach (220 Å) and release (60 Å).
 * Points out of the RNAP–ribosome cleft into open solvent with positive L1 clearance (>= 1.1 Å)
 * against both `rnap-ec` and `ribosome-70s` across `[5, 220] Å`.
 */
export const NUSG_DIR = Object.freeze([-0.502519, -0.502519, 0.703526]);

/**
 * Embedded `rnap-ec` reference geometry matching `transcription.js` so bound RNAP world poses
 * match bit-for-bit without requiring decoded assets inside `stateAt`.
 */
const RNAP_EC_REF = {
  id: 'rnap-ec',
  tracks: {
    template: {
      registers: [13],
      frames: [
        {
          o: [-1.686, -6.231, 57.346],
          R: [-0.118574, -0.983041, 0.139892, -0.992224, 0.122674, 0.021031, -0.037835, -0.136311, -0.989943],
        },
      ],
    },
  },
  anchors: {
    activeSite: { o: [4.632, 4.565, -6.39], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  },
};

let invRiboLayout = null;
let endDeltaPose = null;

/** Machine ids emitted by `contributeTl` in `RIBO_LAYOUT` world coordinates. */
const TL_MACHINE_IDS = Object.freeze({
  ribosome: true,
  if1: true,
  if2: true,
  if3: true,
  'ef-tu': true,
  'ef-g': true,
  rf1: true,
});

function clamp01(x) {
  return x > 0 ? (x < 1 ? x : 1) : 0;
}

function ease(x) {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

/** Allocation-free, aliasing-safe rigid-frame composition `out = a · b`. */
function composeFrameInto(a, b, out) {
  const A = a.R, B = b.R, ao = a.o, bo = b.o;
  const o0 = A[0] * bo[0] + A[1] * bo[1] + A[2] * bo[2] + ao[0];
  const o1 = A[3] * bo[0] + A[4] * bo[1] + A[5] * bo[2] + ao[1];
  const o2 = A[6] * bo[0] + A[7] * bo[1] + A[8] * bo[2] + ao[2];

  const r0 = A[0] * B[0] + A[1] * B[3] + A[2] * B[6];
  const r1 = A[0] * B[1] + A[1] * B[4] + A[2] * B[7];
  const r2 = A[0] * B[2] + A[1] * B[5] + A[2] * B[8];
  const r3 = A[3] * B[0] + A[4] * B[3] + A[5] * B[6];
  const r4 = A[3] * B[1] + A[4] * B[4] + A[5] * B[7];
  const r5 = A[3] * B[2] + A[4] * B[5] + A[5] * B[8];
  const r6 = A[6] * B[0] + A[7] * B[3] + A[8] * B[6];
  const r7 = A[6] * B[1] + A[7] * B[4] + A[8] * B[7];
  const r8 = A[6] * B[2] + A[7] * B[5] + A[8] * B[8];

  const R = out.R;
  R[0] = r0; R[1] = r1; R[2] = r2;
  R[3] = r3; R[4] = r4; R[5] = r5;
  R[6] = r6; R[7] = r7; R[8] = r8;
  out.o[0] = o0; out.o[1] = o1; out.o[2] = o2;
  return out;
}

const END_RNAP_POSE = machinePoseForRegister(RNAP_EC_REF, END_REGISTER, newFrame());
const END_EXP_POSE = composeFrameInto(END_RNAP_POSE, EXPRESSOME_ANCHOR, newFrame());

function ensureRiboInverse() {
  if (!invRiboLayout) {
    invRiboLayout = invertFrame(RIBO_LAYOUT, newFrame());
    endDeltaPose = composeFrameInto(END_EXP_POSE, invRiboLayout, newFrame());
  }
}

/** Write `base · translate(local offset)` into `dst` (rotation unchanged). */
function placeAt(base, off, dst) {
  const R = base.R;
  dst.o[0] = base.o[0] + R[0] * off[0] + R[1] * off[1] + R[2] * off[2];
  dst.o[1] = base.o[1] + R[3] * off[0] + R[4] * off[1] + R[5] * off[2];
  dst.o[2] = base.o[2] + R[6] * off[0] + R[7] * off[1] + R[8] * off[2];
  const dR = dst.R;
  for (let i = 0; i < 9; i++) dR[i] = R[i];
  return dst;
}

function lastSince(story, type, target, t, since) {
  const i = lastStarted(story, type, target, t);
  return i >= 0 && story.events[i].t0 >= since ? i : -1;
}

function getPool(out) {
  let p = out._cplPool;
  if (p) return p;
  const nusgTransform = newFrame();
  const nusgBody = { visible: true, opacity: 1 };
  const nusgMachine = {
    id: 'nusg',
    assetId: 'nusg',
    transform: nusgTransform,
    opacity: 1,
    visible: true,
    parts: { body: nusgBody },
    label: 'NusG',
    pickable: true,
  };
  p = {
    rnapM: newFrame(),
    expM: newFrame(),
    deltaM: newFrame(),
    nusgTransform,
    nusgBody,
    nusgMachine,
    off: [0, 0, 0],
  };
  Object.defineProperty(out, '_cplPool', { value: p, enumerable: false, writable: false });
  return p;
}

/**
 * Build the 12-chapter timeline and sorted event list for Coupled (`coupled`) mode.
 *
 * Contract (PLAN.md §6.4, §10 R3-S5):
 * - Delegates to `buildTimeline(..., { mode: 'coupled' })`.
 * - Uses coupling distance `D` from the 6ZTJ expressome asset (`D = 38`, `DEC-024`).
 * - Chapters 1–5 match Step by step mode; chapters 6–12 model early ribosome binding,
 *   NusG expressome locking, coupled elongation (3 nt per codon), termination, and finale.
 *
 * @param {object} scenario - Gene construct / scenario definition (Construct v3).
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @param {{ seed?: number, D?: number }} [opts] - Coupled timeline options.
 * @returns {{ duration: number, chapters: object[], events: object[], meta: object }} Coupled timeline structure.
 */
export function buildCoupledTimeline(scenario, assets, opts = {}) {
  return buildTimeline(scenario, assets, { ...opts, mode: 'coupled' });
}

/**
 * Populate coupled-mode expressome fields (locked RNAP-ribosome transform and NusG bridging)
 * into `out` at time `t`.
 *
 * Contract (PLAN.md §6.4, §8.2, §10 R3-S5):
 * - Pure deterministic function of `(story, t)`; mutates `out` in place with zero per-call allocation.
 * - Preserves S2 boundary defaults at `t === 0`, `t === story.duration`, fixture timelines, and
 *   uninitialized `out.chapter === null` calls (`tests/story.test.mjs`).
 *
 * @param {object} story - Coupled Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeCoupled(story, t, out) {
  if (!story || !out || !out.chapter) return out;
  if (story.meta && story.meta.fixture) return out;
  if (t <= 0 || t >= story.duration) return out;

  const layIdx = lastStarted(story, 'mrna.layout', null, t);
  if (layIdx < 0) return out;

  const pool = getPool(out);
  const ev = story.events;
  const machines = out.machines;

  // 1. Bound RNAP reference pose: uses contributeTx's bound rnap.transform through chapter 9 and
  //    chapter 10 [0, 1.0] s, then freezes at precomputed END_RNAP_POSE (register 223) once RNAP
  //    releases the RNA so the ribosome stays continuous through chapters 10b, 11, and 12 (0 allocs).
  ensureRiboInverse();
  const frozen = Boolean(out.rna && out.rna.released) || ((out.dna && out.dna.relax) > 0);
  let rnapM;
  let expM;
  let deltaM;
  if (frozen) {
    rnapM = END_RNAP_POSE;
    expM = END_EXP_POSE;
    deltaM = endDeltaPose;
  } else {
    let boundRnap = null;
    for (let i = 0; i < machines.length; i++) {
      if (machines[i] && machines[i].id === 'rnap') { boundRnap = machines[i].transform; break; }
    }
    rnapM = boundRnap || machinePoseForRegister(RNAP_EC_REF, out.dna ? out.dna.register : END_REGISTER, pool.rnapM);
    expM = composeFrameInto(rnapM, EXPRESSOME_ANCHOR, pool.expM);
    deltaM = composeFrameInto(expM, invRiboLayout, pool.deltaM);
  }

  // 2. Write expressome layout pose into out.ribosome.layout and re-transform translation machines.
  const ribLayout = out.ribosome && out.ribosome.layout;
  if (ribLayout) {
    ribLayout.o[0] = expM.o[0];
    ribLayout.o[1] = expM.o[1];
    ribLayout.o[2] = expM.o[2];
    for (let i = 0; i < 9; i++) ribLayout.R[i] = expM.R[i];
  }

  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    if (m && TL_MACHINE_IDS[m.id] && m.transform) {
      composeFrameInto(deltaM, m.transform, m.transform);
    }
  }

  // 3. NusG actor (rnap frame): enters 220 Å in chapter 8 [6.0, 7.5] s, stays bound through
  //    chapter 9 and chapter 10 [0, 1.0] s, and leaves 60 Å outward in chapter 10 [1.0, 2.0] s.
  const eI = lastStarted(story, 'factor.enter', 'nusg', t);
  if (eI >= 0) {
    const lI = lastSince(story, 'factor.leave', 'nusg', t, ev[eI].t0);
    let dist = 0;
    let op = 0;
    if (lI >= 0) {
      const p = progressOf(story, lI, t);
      if (p < 1) {
        dist = RELEASE_DISTANCE * ease(p);
        op = 1 - ease((p - 0.4) / 0.6);
      }
    } else {
      const p = progressOf(story, eI, t);
      dist = ENTER_DISTANCE * (1 - ease(p));
      op = ease(p / 0.4);
    }
    if (op > 0.001) {
      const off = pool.off;
      off[0] = NUSG_DIR[0] * dist;
      off[1] = NUSG_DIR[1] * dist;
      off[2] = NUSG_DIR[2] * dist;
      placeAt(rnapM, off, pool.nusgTransform);
      pool.nusgMachine.opacity = op;
      pool.nusgMachine.visible = true;
      pool.nusgBody.visible = true;
      pool.nusgBody.opacity = op;
      machines.push(pool.nusgMachine);
    }
  }

  return out;
}
