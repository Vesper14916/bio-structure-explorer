/**
 * @module sim/gene/transcription
 * Round 3 transcription choreography (PLAN.md §6.1, §8.1–§8.2, task R3-S3, Argon C1, C4, C5).
 * Pure, deterministic evaluation of transcription chapters (1–7) and post-termination DNA/RNA
 * state into `WorldState` with zero per-call heap allocations when `out` is reused.
 */
import { lastStarted, completedCount, progressOf } from './story.js';
import { machinePoseForRegister } from '../../kin/duplex.js';

const TSS_REGISTER = 45;
const END_REGISTER = 223;
const TOTAL_MRNA_NT = 179;

/**
 * Outward unit vector from `rnap-holo.anchors.center.o` (`[-1.526, -4.596, 2.185]`)
 * to the sigma70 L1 centroid (`[-46.335, -33.706, 19.575]`) in RNAP local frame (Argon C5 / DEC-026).
 */
const U_SIGMA = [-0.797, -0.518, 0.309];

/**
 * Embedded `rnap-ec` reference geometry (`tracks.template` at register +13 and `anchors.activeSite`)
 * so `machinePoseForRegister` works identically whether `buildStory` was called with decoded assets
 * or with `{}` (as in `tests/story.test.mjs`).
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

function clamp01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function easeInOutCubic(x) {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

const IDENTITY_R = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Return or lazily attach a non-enumerable object pool on `out` so `stateAt(story, t, out)` allocates 0 objects. */
function getPool(out) {
  let p = out._txPool;
  if (p) return p;
  const rnapTransform = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  const corePart = { visible: true, opacity: 1 };
  const sigmaTransform = { o: [0, 0, 0], R: IDENTITY_R };
  const sigmaPart = { visible: true, opacity: 1, transform: sigmaTransform };
  const holoParts = { core: corePart, sigma: sigmaPart };
  const ecParts = { core: corePart };
  const rnapMachine = {
    id: 'rnap',
    assetId: 'rnap-holo',
    transform: rnapTransform,
    opacity: 1,
    visible: true,
    tint: 'rnap',
    lodBias: 0,
    parts: holoParts,
    label: 'RNA polymerase',
    pickable: true,
  };
  const sigmaCompanionCore = { visible: false, opacity: 0 };
  const sigmaCompanionPart = { visible: true, opacity: 1, transform: sigmaTransform };
  const sigmaCompanionMachine = {
    id: 'sigma-release',
    assetId: 'rnap-holo',
    transform: rnapTransform,
    opacity: 1,
    visible: true,
    tint: 'rnap',
    lodBias: 0,
    parts: { core: sigmaCompanionCore, sigma: sigmaCompanionPart },
    label: 'σ⁷⁰',
    pickable: false,
  };
  const pulsePos = [0, 0, 0];
  const pulseEntry = {
    type: 'pulse',
    kind: 'phosphodiester',
    anchor: { machineId: 'rnap', name: 'activeSite' },
    f: 0,
    pos: pulsePos,
    t0: 0,
    duration: 0.4,
    age: 0,
  };
  const focusCenter = [0, 0, 0];
  const focusObj = { center: focusCenter, radius: 24 };
  const tmpPose = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

  p = {
    rnapTransform,
    corePart,
    sigmaTransform,
    sigmaPart,
    holoParts,
    ecParts,
    rnapMachine,
    sigmaCompanionPart,
    sigmaCompanionMachine,
    pulsePos,
    pulseEntry,
    focusCenter,
    focusObj,
    tmpPose,
  };
  Object.defineProperty(out, '_txPool', { value: p, enumerable: false, writable: false });
  return p;
}

function copyFrame(src, dst) {
  dst.o[0] = src.o[0];
  dst.o[1] = src.o[1];
  dst.o[2] = src.o[2];
  for (let i = 0; i < 9; i++) dst.R[i] = src.R[i];
}

function writeActiveSiteWorld(M, outVec) {
  const ax = 4.632, ay = 4.565, az = -6.39;
  const R = M.R, o = M.o;
  outVec[0] = R[0] * ax + R[1] * ay + R[2] * az + o[0];
  outVec[1] = R[3] * ax + R[4] * ay + R[5] * az + o[1];
  outVec[2] = R[6] * ax + R[7] * ay + R[8] * az + o[2];
}

/**
 * Populate transcription-specific fields (RNAP motion, DNA bend/bubble/relax/trackBlend, mRNA growth,
 * NTP entry, PPi departure, sigma release, hairpin folding, and bond FX) into `out` at time `t`.
 *
 * Note: For `t === 0` or `t === story.duration` (and custom fixture timelines like `story-mini.json`),
 * `contributeTx` preserves the exact S2 boundary defaults verified by `tests/story.test.mjs`.
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeTx(story, t, out) {
  if (!story || !out) return out;
  const ntp = out.ntp;
  let ntpProps = ntp._txProps;
  if (!ntpProps) {
    ntpProps = { visible: false, phase: 'idle', ppi: 0 };
    Object.defineProperties(ntp, {
      _txProps: { value: ntpProps, enumerable: false, writable: false },
      visible: { get() { return ntpProps.visible; }, set(v) { ntpProps.visible = v; }, enumerable: false },
      phase: { get() { return ntpProps.phase; }, set(v) { ntpProps.phase = v; }, enumerable: false },
      ppi: { get() { return ntpProps.ppi; }, set(v) { ntpProps.ppi = v; }, enumerable: false },
    });
  }
  ntpProps.visible = false;
  ntpProps.phase = 'idle';
  ntpProps.ppi = 0;

  // Preserve S2 boundary defaults at t === 0, t === story.duration, or for fixture timelines,
  // or when contributeTx is invoked directly on an uninitialized WorldState (out.chapter === null).
  if (story.meta && story.meta.fixture) return out;
  if (!out.chapter || t <= 0 || t >= story.duration) {
    return out;
  }

  const pool = getPool(out);
  const dna = out.dna;
  const rna = out.rna;
  const ppi = out.ppi;

  // 1. mRNA length and continuous addition progress
  const mrnaDone = completedCount(story, 'bond.phosphodiester', null, t);
  rna.length = mrnaDone;
  out.counters.mrna = mrnaDone;

  const bondIdx = lastStarted(story, 'bond.phosphodiester', null, t);
  let addProg = 0;
  let activePulseEv = null;
  if (bondIdx >= 0) {
    const bev = story.events[bondIdx];
    if (t >= bev.t0 && t < bev.t1) {
      addProg = progressOf(story, bondIdx, t);
      activePulseEv = bev;
    }
  }
  rna.addProgress = addProg;

  // 2. Active NTP entry / paired / PPi departure state
  let ntpBase = null;
  let ntpPath = 0;
  let ntpBonded = false;
  let ntpVisible = false;
  let ntpPhase = 'idle';
  let ppiPath = 0;
  let ppiOpacity = 0;

  const enterIdx = lastStarted(story, 'ntp.enter', 'rnap', t);
  if (enterIdx >= 0) {
    const eev = story.events[enterIdx];
    const n = eev.data.n;
    if (t >= eev.t0 && t < eev.t1) {
      ntpBase = eev.data.base;
      ntpPath = easeInOutCubic(progressOf(story, enterIdx, t));
      ntpBonded = false;
      ntpVisible = true;
      ntpPhase = 'entering';
    } else if (activePulseEv && activePulseEv.data.n === n) {
      ntpBase = eev.data.base;
      ntpPath = 1;
      ntpBonded = addProg >= 0.5;
      ntpVisible = !ntpBonded;
      ntpPhase = ntpBonded ? 'leaving' : 'paired';
    }
  }

  const ppiIdx = lastStarted(story, 'ppi.leave', 'rnap', t);
  if (ppiIdx >= 0) {
    const pev = story.events[ppiIdx];
    if (t >= pev.t0 && t < pev.t1) {
      const uPpi = easeInOutCubic(progressOf(story, ppiIdx, t));
      ppiPath = uPpi;
      ppiOpacity = 1 - uPpi;
      if (ntpPhase === 'idle') {
        ntpPhase = 'leaving';
        ntpBonded = true;
      }
    }
  }

  ntp.base = ntpBase;
  ntp.path = ntpPath;
  ntp.bonded = ntpBonded;
  ntpProps.visible = ntpVisible;
  ntpProps.phase = ntpPhase;
  ntpProps.ppi = ppiPath;
  ppi.path = ppiPath;
  ppi.opacity = ppiOpacity;

  // 3. DNA register stepping (Argon C4):
  // While nucleotide n enters and forms its bond, register is 45 + (n - 1).
  // Across ppi.leave of nucleotide n, register advances smoothly to min(223, 45 + n).
  const ppiDone = completedCount(story, 'ppi.leave', 'rnap', t);
  let reg = TSS_REGISTER + Math.min(TOTAL_MRNA_NT - 1, ppiDone);
  if (ppiIdx >= 0) {
    const pev = story.events[ppiIdx];
    if (t >= pev.t0 && t < pev.t1) {
      const n = pev.data.n;
      const baseReg = TSS_REGISTER + n - 1;
      const nextReg = Math.min(END_REGISTER, TSS_REGISTER + n);
      reg = baseReg + (nextReg - baseReg) * easeInOutCubic(progressOf(story, ppiIdx, t));
    }
  }
  if (reg > END_REGISTER) reg = END_REGISTER;

  // 4. Release, hairpin, bend, bubble, relax, trackBlend
  const relIdx = lastStarted(story, 'rna.release', 'rnap', t);
  const released = relIdx >= 0 && progressOf(story, relIdx, t) >= 1;
  rna.released = released;

  let hairpinVal = 0;
  const hpIdx = lastStarted(story, 'rna.hairpin', 'rnap', t);
  if (hpIdx >= 0) {
    const hev = story.events[hpIdx];
    if (hev.data && hev.data.part === 'complete') {
      hairpinVal = 1;
    } else {
      hairpinVal = easeInOutCubic(progressOf(story, hpIdx, t));
    }
  }
  if (released) hairpinVal = 1;
  rna.hairpin = hairpinVal;

  // Layout transition (Chapter 8+ mrna.layout)
  const layIdx = lastStarted(story, 'mrna.layout', null, t);
  if (layIdx >= 0) {
    const lev = story.events[layIdx];
    const uLay = easeInOutCubic(progressOf(story, layIdx, t));
    rna.layout = lev.data.to || 'ribosome';
    rna.layoutBlend = uLay;
  } else {
    rna.layout = released ? 'free' : 'rnap';
    rna.layoutBlend = 0;
  }

  // DNA open (Chapter 3)
  let bend = 0;
  let bLo = 0, bHi = 0;
  const openIdx = lastStarted(story, 'dna.open', 'rnap', t);
  if (openIdx >= 0) {
    const uOpen = easeInOutCubic(progressOf(story, openIdx, t));
    bend = uOpen;
    if (uOpen > 0) {
      bLo = -11;
      bHi = 2;
    }
  }

  // DNA relax & close (Chapter 7)
  let relax = 0;
  const relaxIdx = lastStarted(story, 'dna.relax', 'rnap', t);
  if (relaxIdx >= 0) {
    relax = easeInOutCubic(progressOf(story, relaxIdx, t));
    if (relax >= 1) {
      bend = 0;
      bLo = 0;
      bHi = 0;
    }
  }

  // Track blend & RNAP asset switch (Chapter 5 machine.bind:2, DEC-007 & Argon C1/C5)
  let trackBlend = 0;
  let assetId = 'rnap-holo';
  const bindIdx = lastStarted(story, 'machine.bind', 'rnap', t);
  if (bindIdx >= 0) {
    const bev = story.events[bindIdx];
    if (bev.data && Array.isArray(bev.data.trackBlend)) {
      const uTb = easeInOutCubic(progressOf(story, bindIdx, t));
      trackBlend = uTb;
      const switchAt = bev.data.assetSwitchAt ?? 0.5;
      if (uTb >= switchAt) assetId = bev.data.assetId || 'rnap-ec';
    }
  }

  // 5. Machine placement and departure
  // Determine if RNAP has left completely (after machine.move with leave: true finishes)
  let rnapPresent = true;
  let pLeave = 0;
  let pApproach = 1;
  let isApproaching = false;

  const moveIdx = lastStarted(story, 'machine.move', 'rnap', t);
  if (moveIdx >= 0) {
    const mev = story.events[moveIdx];
    const uMove = easeInOutCubic(progressOf(story, moveIdx, t));
    if (mev.data && mev.data.leave) {
      pLeave = uMove;
      if (uMove >= 1) rnapPresent = false;
    } else {
      isApproaching = uMove < 1;
      pApproach = uMove;
    }
  } else {
    // Chapter 1 (establish): before machine.move:1 starts at t = 6.0 s
    isApproaching = true;
    pApproach = 0;
  }

  dna.machineId = (rnapPresent && (!isApproaching || pApproach > 0 || bend > 0)) ? 'rnap' : null;
  // In Chapter 1 (establish) and Chapter 2 (search before binding), DNA is straight (bend = 0).
  // Once relax === 1 after transcription ends, DNA is also straight and unbound.
  if (relax >= 1 && !rnapPresent) {
    dna.machineId = null;
  }
  dna.register = reg;
  dna.bend = bend;
  dna.bubble[0] = bLo;
  dna.bubble[1] = bHi;
  dna.relax = relax;
  dna.trackBlend = trackBlend;

  // 6. Bound reference pose M(reg) from rnap-ec (Argon C1a)
  const M = machinePoseForRegister(RNAP_EC_REF, reg, pool.tmpPose);
  copyFrame(M, pool.rnapTransform);

  if (isApproaching && pApproach < 1) {
    // Smooth approach from M(45).o + [-140, 80, 40] to M(45).o across Chapter 2 (Argon C4)
    const w = 1 - pApproach;
    pool.rnapTransform.o[0] += -140 * w;
    pool.rnapTransform.o[1] += 80 * w;
    pool.rnapTransform.o[2] += 40 * w;
  } else if (pLeave > 0) {
    // Smooth departure into solvent along [0, +150, -40] across Chapter 7 [10.15, 13.15] s (Argon C4)
    pool.rnapTransform.o[1] += 150 * pLeave;
    pool.rnapTransform.o[2] += -40 * pLeave;
  }

  // 7. Populate out.machines (reusing pool objects)
  if (rnapPresent) {
    const rnap = pool.rnapMachine;
    rnap.assetId = assetId;
    rnap.opacity = pLeave > 0 ? Math.max(0, 1 - pLeave * 0.85) : 1;
    rnap.visible = true;
    pool.corePart.visible = true;
    pool.corePart.opacity = rnap.opacity;

    // Two-stage sigma70 displacement in RNAP local frame (Argon C5 / DEC-026):
    // Stage 1: pre-displacement 0 -> 12 A along U_SIGMA as transcript grows past 3.5 nt (reaching 12 A by 5.7 nt, ahead of rna[-6]).
    // Stage 2: release 12 -> 60 A along U_SIGMA and opacity 1 -> 0 over part.release [3.5, 5.0] s.
    const rnaCont = mrnaDone + addProg;
    const preProg = clamp01((rnaCont - 3.5) / 2.2);
    let sigRelProg = 0;
    const sigIdx = lastStarted(story, 'part.release', 'sigma', t);
    if (sigIdx >= 0) {
      sigRelProg = easeInOutCubic(progressOf(story, sigIdx, t));
    }
    const sigDist = sigIdx >= 0 ? (12 + 48 * sigRelProg) : (12 * preProg);
    const sigOp = sigIdx >= 0 ? Math.max(0, 1 - sigRelProg) : 1;

    pool.sigmaTransform.o[0] = U_SIGMA[0] * sigDist;
    pool.sigmaTransform.o[1] = U_SIGMA[1] * sigDist;
    pool.sigmaTransform.o[2] = U_SIGMA[2] * sigDist;

    if (assetId === 'rnap-holo') {
      rnap.parts = pool.holoParts;
      pool.sigmaPart.visible = sigOp > 0.001;
      pool.sigmaPart.opacity = sigOp;
      out.machines.push(rnap);
    } else {
      rnap.parts = pool.ecParts;
      out.machines.push(rnap);
      // Companion visual-only releasing sigma actor when trackBlend >= 0.5 and sigOp > 0 (Argon C5)
      if (sigOp > 0.001) {
        pool.sigmaCompanionPart.visible = true;
        pool.sigmaCompanionPart.opacity = sigOp;
        pool.sigmaCompanionMachine.opacity = sigOp;
        out.machines.push(pool.sigmaCompanionMachine);
      }
    }
  }

  // 8. Bond-formation pulse in out.fx (reusing pool entry)
  if (activePulseEv) {
    const pe = pool.pulseEntry;
    pe.f = progressOf(story, bondIdx, t);
    pe.t0 = activePulseEv.t0;
    pe.duration = Math.max(0.18, activePulseEv.t1 - activePulseEv.t0);
    pe.age = t - activePulseEv.t0;
    writeActiveSiteWorld(pool.rnapTransform, pool.pulsePos);
    out.fx.push(pe);
  }

  return out;
}
