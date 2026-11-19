/**
 * @module kin/track
 * Slot-track sampling and blending (PLAN.md §8.1, §8.3, docs/tasks/R3-ST3-design.md §3.4, task R3-K1).
 * Interpolates decoded asset track frames at fractional registers and extrapolates beyond the ends by the
 * B-DNA screw step.
 */
import { slerpFrame, screwStep, composeFrame } from './frames.js';

/**
 * First and last register of a decoded track.
 *
 * @param {{ registers: number[] }} track - Decoded track.
 * @returns {{ r0: number, r1: number }} Register range.
 */
export function trackRange(track) {
  return { r0: track.registers[0], r1: track.registers[track.registers.length - 1] };
}

/**
 * Orientation of a track: `+1` if a step of one register (3'-ward along the coding strand) is `S(+1)` in the
 * track's own frames, `-1` if it is `S(-1)`. Estimated from the two frames at the chosen end as the sign of the
 * dot product of the origin difference (towards increasing register) with the local z of the end frame.
 * Template tracks of `rnap-ec` have +z pointing upstream and give `-1`; nontemplate, coding and RNA give `+1`.
 * Defaults to `+1` for a single-frame track.
 *
 * @param {{ registers: number[], frames: Array<{o: number[], R: number[]}> }} track - Decoded track.
 * @param {'start' | 'end'} [end='end'] - Which end pair to inspect.
 * @returns {1 | -1} Step sign.
 */
export function trackStepSign(track, end = 'end') {
  const n = track.frames.length;
  if (n < 2) return 1;
  const a = end === 'end' ? track.frames[n - 2] : track.frames[0];
  const b = end === 'end' ? track.frames[n - 1] : track.frames[1];
  const z = end === 'end' ? b : a;
  const d = (b.o[0] - a.o[0]) * z.R[2] + (b.o[1] - a.o[1]) * z.R[5] + (b.o[2] - a.o[2]) * z.R[8];
  return d < 0 ? -1 : 1;
}

/**
 * Sample a decoded asset track at an integer or fractional `register`; the frame is returned in the track's
 * own orientation (template tracks stay template frames; see {@link codingFrameAt} for the coding view).
 *
 * - Inside `[r0, r1]`: integer registers return the asset frame unchanged; fractional registers interpolate the
 *   origin linearly and the rotation by shortest-arc quaternion slerp between `floor` and `ceil`.
 * - Outside: extrapolates by the screw step from the nearest end frame, `F(r1) . S(sign * (r - r1))` downstream
 *   and `F(r0) . S(sign * (r - r0))` upstream, where `sign` comes from {@link trackStepSign} for that end. This is
 *   `partnerFrame(C . S(x))` for a template track (`C` its coding-oriented frame), so a template track continues
 *   in the correct (downstream) direction. Registers are assumed contiguous (`registers[k] = r0 + k`).
 *
 * @param {object} track - Decoded asset track `{ kind, registers, frames, synthetic, bases }`.
 * @param {number} register - Target register (may be fractional).
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Sampled rigid frame in the asset frame.
 */
export function sampleTrack(track, register, out) {
  const { r0, r1 } = trackRange(track);
  const fr = track.frames;
  const dst = out || { o: [0, 0, 0], R: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  if (register < r0 || register > r1) {
    const atEnd = register > r1;
    const base = atEnd ? fr[fr.length - 1] : fr[0];
    const x = register - (atEnd ? r1 : r0);
    return composeFrame(base, screwStep(trackStepSign(track, atEnd ? 'end' : 'start') * x), dst);
  }
  const k = Math.floor(register), t = register - k;
  const a = fr[k - r0];
  if (t === 0) {
    dst.o[0] = a.o[0]; dst.o[1] = a.o[1]; dst.o[2] = a.o[2];
    for (let i = 0; i < 9; i++) dst.R[i] = a.R[i];
    return dst;
  }
  return slerpFrame(a, fr[k + 1 - r0], t, dst);
}

/**
 * Coding-oriented frame at a register: `partnerFrame(sampleTrack(track, r))`. Intended for template tracks, whose
 * frames point 3'-ward along the template strand; the partner is the coding-strand base-pair frame `C_r`.
 *
 * @param {object} track - Decoded template track.
 * @param {number} r - Register (may be fractional).
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Coding-oriented frame.
 */
export function codingFrameAt(track, r, out) {
  const f = sampleTrack(track, r, out);
  const R = f.R; // partnerFrame = R . diag(1, -1, -1): negate columns y and z
  R[1] = -R[1]; R[2] = -R[2]; R[4] = -R[4]; R[5] = -R[5]; R[7] = -R[7]; R[8] = -R[8];
  return f;
}

/**
 * Blend between an ideal straight-helix frame and a track frame by `beta` in `[0, 1]`:
 * `slerpFrame(idealFrame, trackFrame, beta)`; `beta = 0` gives the ideal frame, `beta = 1` the track frame.
 *
 * @param {{ o: number[], R: number[] }} idealFrame - Ideal straight-helix frame.
 * @param {{ o: number[], R: number[] }} trackFrame - Track frame.
 * @param {number} beta - Bending blend factor.
 * @param {{ o: number[], R: number[] }} [out] - Optional result frame.
 * @returns {{ o: number[], R: number[] }} Blended frame.
 */
export function blendTrackFrame(idealFrame, trackFrame, beta, out) {
  return slerpFrame(idealFrame, trackFrame, beta, out);
}
