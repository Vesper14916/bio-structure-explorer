/**
 * @module kin/track
 * Round 3 slot-track sampling and blending stub (PLAN.md §8.1, §8.3, task R3-K1).
 * Interpolates asset track frames at fractional registers and blends toward ideal helix geometry.
 */

/**
 * Sample a decoded asset slot track at an integer or fractional `register`.
 *
 * Contract (PLAN.md §8.3, §10 R3-K1):
 * - Inside `[r0, r1]`, linearly interpolates origin and slerps rotation between `floor(register)` and `ceil(register)`.
 * - Outside `[r0, r1]`, extrapolates using canonical screw steps `S`.
 *
 * @param {object} track - Decoded asset track `{ kind, registers, frames, synthetic, bases }`.
 * @param {number} register - Target register (may be fractional).
 * @returns {{ o: number[], R: number[] }} Sampled rigid frame in the asset frame.
 */
export function sampleTrack(track, register) {
  throw new Error('not implemented: sampleTrack');
}

/**
 * Blend between an ideal straight helix frame and an observed/fitted track frame by `beta` in `[0, 1]`.
 * At `beta = 0` returns `idealFrame`; at `beta = 1` returns `trackFrame`.
 *
 * @param {{ o: number[], R: number[] }} idealFrame - Ideal straight-helix rigid frame.
 * @param {{ o: number[], R: number[] }} trackFrame - Track rigid frame.
 * @param {number} beta - Bending blend factor in `[0, 1]`.
 * @returns {{ o: number[], R: number[] }} Blended rigid frame.
 */
export function blendTrackFrame(idealFrame, trackFrame, beta) {
  throw new Error('not implemented: blendTrackFrame');
}
