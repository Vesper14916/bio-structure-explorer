/**
 * @module kin/hairpin
 * Intrinsic terminator hairpin kinematics (PLAN.md §5.1, §8.1, §10 R3-K2).
 * Poses the Construct v3 8-bp A-form stem (`GGCGCCUG` paired with `CAGGCGCC`) plus 4-nt `GAAA`
 * tetraloop relative to the closing base-pair anchor frame, with progressive apical-to-closing folding.
 *
 * Pure math module: zero DOM and zero three.js dependencies.
 */
import { composeFrame, matToQuat, quatToMat, slerpQuat, writeFrame16, readFrame16 } from './frames.js';
import { HELIX_A } from '../science/templates.js';

const DEG = Math.PI / 180;
const RISE = HELIX_A.rise;            // 2.81 A
const TWIST_RAD = HELIX_A.twistDeg * DEG; // 32.72727272727273 deg

export const HAIRPIN_STEM_LEN = 8;
export const HAIRPIN_LOOP_LEN = 4;
export const HAIRPIN_LENGTH = HAIRPIN_STEM_LEN * 2 + HAIRPIN_LOOP_LEN; // 20 nt
export const HAIRPIN_EXIT_CLEARANCE_NT = 9; // 3' partner must be >= 9 nt from transcript 3' end

/**
 * Precomputed 4-nt GAAA tetraloop frames in the apical 5' stem nucleotide frame `F_5p(stemLen - 1)`.
 * Bridges `O3'(7)` to `P(12)` across a +z semicircular arch with every loop phosphodiester bond
 * in 1.61-1.68 A and zero heavy-atom steric clashes (< 2.57 A) on Construct v3 `GGCGCCUGGAAACAGGCGCC`.
 */
const GAAA_LOOP_LOCAL_RAW = [
  {
    o: [-7.26077, -1.15044, 1.94442],
    R: [-0.0411178, 0.3087836, 0.9502431, -0.0502409, 0.9492054, -0.3106204, -0.9978904, -0.0605131, -0.0235156],
  },
  {
    o: [4.60453, 3.62505, 3.10746],
    R: [0.0160218, -0.8444098, 0.5354581, 0.9304895, 0.2086026, 0.3011216, -0.365968, 0.4934136, 0.7890567],
  },
  {
    o: [6.79131, 0.92189, 5.655],
    R: [0.0185525, -0.8951277, 0.4454236, 0.8640433, -0.2098049, -0.4576146, 0.5030756, 0.3933552, 0.7695367],
  },
  {
    o: [8.35234, -3.22348, 2.2017],
    R: [0.1357445, -0.8110669, 0.5689849, 0.6055481, -0.3866218, -0.6955825, 0.784146, 0.4389692, 0.4386583],
  },
];

// Re-orthonormalise once at load time to machine precision.
const GAAA_LOOP_LOCAL = GAAA_LOOP_LOCAL_RAW.map(f => ({
  o: f.o.slice(),
  R: quatToMat(matToQuat(f.R)),
}));

function clamp01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function smoothstep01(x) {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
}

/** Write canonical A-form screw step `S_A(k)` into `out`. */
function helixFrameA(k, out) {
  const th = k * TWIST_RAD;
  const c = Math.cos(th), s = Math.sin(th);
  const R = out.R;
  R[0] = c; R[1] = -s; R[2] = 0;
  R[3] = s; R[4] = c;  R[5] = 0;
  R[6] = 0; R[7] = 0;  R[8] = 1;
  out.o[0] = 0; out.o[1] = 0; out.o[2] = k * RISE;
  return out;
}

/** Write Watson-Crick antiparallel partner frame (180 deg about local x) into `out`. */
function partnerInto(f, out) {
  const R = f.R, P = out.R;
  P[0] = R[0];  P[3] = R[3];  P[6] = R[6];
  P[1] = -R[1]; P[4] = -R[4]; P[7] = -R[7];
  P[2] = -R[2]; P[5] = -R[5]; P[8] = -R[8];
  out.o[0] = f.o[0]; out.o[1] = f.o[1]; out.o[2] = f.o[2];
  return out;
}

function copyFrame(src, dst) {
  for (let i = 0; i < 9; i++) dst.R[i] = src.R[i];
  dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
  return dst;
}

// Reusable scratch frames/quaternions for allocation-free posing
const _anchorClean = { o: [0, 0, 0], R: new Array(9) };
const _stepF = { o: [0, 0, 0], R: new Array(9) };
const _apicalF = { o: [0, 0, 0], R: new Array(9) };
const _foldedF = { o: [0, 0, 0], R: new Array(9) };
const _unfoldedF = { o: [0, 0, 0], R: new Array(9) };
const _blendedF = { o: [0, 0, 0], R: new Array(9) };
const _qa = [0, 0, 0, 1];
const _qb = [0, 0, 0, 1];
const _qo = [0, 0, 0, 1];

function slerpInto(a, b, t, out) {
  if (t <= 0) return copyFrame(a, out);
  if (t >= 1) return copyFrame(b, out);
  matToQuat(a.R, _qa);
  matToQuat(b.R, _qb);
  slerpQuat(_qa, _qb, t, _qo);
  quatToMat(_qo, out.R);
  out.o[0] = a.o[0] + (b.o[0] - a.o[0]) * t;
  out.o[1] = a.o[1] + (b.o[1] - a.o[1]) * t;
  out.o[2] = a.o[2] + (b.o[2] - a.o[2]) * t;
  return out;
}

/**
 * Compute the smooth folding weight in `[0, 1]` of stem pair `pairIndex` (`0` = closing pair,
 * `stemLen - 1` = apical pair next to the loop) for a transcript of length `transcriptLength`.
 *
 * Rule (PLAN.md §10 R3-K2): stem pair `i` forms when both partners have been transcribed and
 * the 3' partner (`hairpinStart + 2 * stemLen + loopLen - 1 - i`) is at least 9 nt from the
 * transcript 3' end (`transcriptLength - idx3 >= 9`), ramping smoothly over 1 nt.
 *
 * For Construct v3 (`hairpinStart = 151`, `stemLen = 8`, `loopLen = 4`):
 * - `transcriptLength = 171`: all pairs 0 (0 folded)
 * - `transcriptLength = 172`: apical pair `7` = 1
 * - `transcriptLength = 179`: all pairs `0..7` = 1 (full 8-bp hairpin at end of 8-U tract)
 *
 * @param {number} pairIndex - Stem pair index (`0` = closing, `stemLen - 1` = apical).
 * @param {number} transcriptLength - Current mRNA transcript length in nucleotides (may be fractional).
 * @param {number} [hairpinStart=151] - 0-based mRNA index of the first 5' stem nucleotide.
 * @param {number} [stemLen=8] - Stem length in base pairs.
 * @param {number} [loopLen=4] - Loop length in nucleotides.
 * @returns {number} Smooth folding weight in `[0, 1]`.
 */
export function hairpinPairFold(
  pairIndex,
  transcriptLength,
  hairpinStart = 151,
  stemLen = HAIRPIN_STEM_LEN,
  loopLen = HAIRPIN_LOOP_LEN
) {
  if (pairIndex < 0 || pairIndex >= stemLen) return 0;
  const idx3 = hairpinStart + 2 * stemLen + loopLen - 1 - pairIndex;
  const clearance = transcriptLength - idx3;
  // Ramps smoothly from 0 at clearance = 8 to 1 at clearance = 9 (so clearance >= 9 -> 1)
  return smoothstep01(clearance - (HAIRPIN_EXIT_CLEARANCE_NT - 1));
}

/** Read unfolded frame `j` from `unfoldedFrames` (Float32Array or frame array) or default A-form extension. */
function getUnfoldedFrame(j, anchor, unfoldedFrames, out) {
  if (unfoldedFrames) {
    if (ArrayBuffer.isView(unfoldedFrames)) {
      return readFrame16(unfoldedFrames, j, out);
    }
    if (Array.isArray(unfoldedFrames) && unfoldedFrames[j]) {
      return copyFrame(unfoldedFrames[j], out);
    }
  }
  helixFrameA(j, _stepF);
  return composeFrame(anchor, _stepF, out);
}

/**
 * Pose the terminator hairpin nucleotides (8-bp A-form stem + 4-nt GAAA tetraloop)
 * anchored at `anchor` with progressive folding progress `foldProgress` in `[0, 1]`.
 *
 * Nucleotide indexing (`20` nucleotides by default):
 * - `0 .. 7`: 5' stem arm (0 = closing pair at `anchor`, 7 = apical pair below loop)
 * - `8 .. 11`: 4-nt `GAAA` tetraloop arching over `+z`
 * - `12 .. 19`: 3' stem arm antiparallel to 5' stem (`19 - i` pairs with `i`)
 *
 * Contract (PLAN.md §10 R3-K2):
 * - Stem pair `i` forms when both partners exist and the 3' partner is at least 9 nt from the 3' end
 *   (when `opts.totalTranscriptLength` is supplied), or progressively from apical pair `7` outward to
 *   closing pair `0` as `foldProgress` advances `0 -> 1`.
 * - At full fold (`foldProgress = 1`), all 8 stem pairs are exact A-form Watson-Crick pairs with
 *   canonical H-bond lengths strictly within 2.7-3.1 A, and all 19 backbone `O3'-P` links are intact.
 *
 * @param {{ o: number[], R: number[] }} anchor - World-space frame of the closing base pair (nuc 0 / 19).
 * @param {number} foldProgress - Folding progress in `[0, 1]`.
 * @param {Float32Array} [outFrames] - Preallocated output frame buffer (16 floats per nucleotide).
 * @param {{
 *   totalTranscriptLength?: number,
 *   hairpinStart?: number,
 *   stemLen?: number,
 *   loopLen?: number,
 *   unfoldedFrames?: Float32Array | Array<{ o: number[], R: number[] }>,
 * }} [opts] - Optional progressive-folding context.
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseHairpin(anchor, foldProgress, outFrames, opts = {}) {
  if (!anchor || !anchor.o || !anchor.R) {
    throw new TypeError('kin/hairpin: anchor frame { o, R } is required');
  }
  const stemLen = Math.max(1, Math.floor(opts.stemLen ?? HAIRPIN_STEM_LEN));
  const loopLen = opts.loopLen !== undefined ? Math.max(0, Math.floor(opts.loopLen)) : HAIRPIN_LOOP_LEN;
  const totalNt = stemLen * 2 + loopLen;
  const out = outFrames ?? new Float32Array(totalNt * 16);
  if (out.length < totalNt * 16) {
    throw new RangeError(`kin/hairpin: outFrames length ${out.length} < required ${totalNt * 16}`);
  }

  // Normalise anchor rotation once for exact orthonormality
  _anchorClean.o[0] = anchor.o[0];
  _anchorClean.o[1] = anchor.o[1];
  _anchorClean.o[2] = anchor.o[2];
  quatToMat(matToQuat(anchor.R, _qa), _anchorClean.R);

  const fp = clamp01(Number.isFinite(foldProgress) ? foldProgress : 0);
  const useTranscriptLen = Number.isFinite(opts.totalTranscriptLength);
  const hairpinStart = opts.hairpinStart ?? 151;
  const unfoldedFrames = opts.unfoldedFrames || null;

  // Compute per-pair folding weight (pair 0 = closing, pair stemLen-1 = apical)
  const pairWeight = new Float64Array(stemLen);
  for (let i = 0; i < stemLen; i++) {
    if (useTranscriptLen) {
      pairWeight[i] = hairpinPairFold(i, opts.totalTranscriptLength, hairpinStart, stemLen, loopLen) * fp;
    } else {
      // Zip progressively from apical pair (stemLen - 1) outward to closing pair (0)
      const orderFromApical = stemLen - 1 - i;
      pairWeight[i] = smoothstep01(fp * stemLen - orderFromApical);
    }
  }
  const loopWeight = pairWeight[stemLen - 1];

  // Apical 5' stem frame F_5p(stemLen - 1) in world space
  helixFrameA(stemLen - 1, _stepF);
  composeFrame(_anchorClean, _stepF, _apicalF);

  // 1. 5' stem arm: indices 0 .. stemLen - 1
  for (let i = 0; i < stemLen; i++) {
    helixFrameA(i, _stepF);
    composeFrame(_anchorClean, _stepF, _foldedF);
    getUnfoldedFrame(i, _anchorClean, unfoldedFrames, _unfoldedF);
    slerpInto(_unfoldedF, _foldedF, pairWeight[i], _blendedF);
    writeFrame16(out, i, _blendedF);
  }

  // 2. Tetraloop: indices stemLen .. stemLen + loopLen - 1
  for (let j = 0; j < loopLen; j++) {
    const idx = stemLen + j;
    if (loopLen === HAIRPIN_LOOP_LEN) {
      composeFrame(_apicalF, GAAA_LOOP_LOCAL[j], _foldedF);
    } else {
      // Fallback smooth arch for non-4-nt custom loop lengths
      const frac = (j + 1) / (loopLen + 1);
      const ang = frac * Math.PI;
      const fallbackLocal = {
        o: [0, 0, Math.sin(ang) * 7.5],
        R: [1, 0, 0, 0, Math.cos(ang), -Math.sin(ang), 0, Math.sin(ang), Math.cos(ang)],
      };
      composeFrame(_apicalF, fallbackLocal, _foldedF);
    }
    getUnfoldedFrame(idx, _anchorClean, unfoldedFrames, _unfoldedF);
    slerpInto(_unfoldedF, _foldedF, loopWeight, _blendedF);
    writeFrame16(out, idx, _blendedF);
  }

  // 3. 3' stem arm: indices stemLen + loopLen .. totalNt - 1 (antiparallel to 5' stem)
  for (let i = 0; i < stemLen; i++) {
    const idx3 = totalNt - 1 - i;
    helixFrameA(i, _stepF);
    composeFrame(_anchorClean, _stepF, _foldedF);
    partnerInto(_foldedF, _foldedF);
    getUnfoldedFrame(idx3, _anchorClean, unfoldedFrames, _unfoldedF);
    slerpInto(_unfoldedF, _foldedF, pairWeight[i], _blendedF);
    writeFrame16(out, idx3, _blendedF);
  }

  return out;
}
