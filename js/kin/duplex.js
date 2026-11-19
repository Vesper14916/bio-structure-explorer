/**
 * @module kin/duplex
 * Round 3 DNA duplex kinematics stub (PLAN.md §8.1, §8.3, task R3-K1).
 * Implements the 6-step bent/bubble/relaxed duplex algorithm on typed frame buffers.
 */

/**
 * Compute coding-strand and template-strand nucleotide frames for the DNA duplex
 * following the six-step algorithm in PLAN.md §8.3 (in-machine tracks, stationary downstream
 * arm with twin-domain spin, cubic Bezier upstream arm with rotation-minimising frames,
 * bend blend beta, bubble pairing, and post-release relaxation).
 *
 * Writes 16 floats per nucleotide frame into `outFrames`.
 *
 * @param {object} construct - Gene construct definition (Construct v3).
 * @param {object} dnaState - `WorldState.dna` slice (`{ machineId, register, bend, bubble, relax }`).
 * @param {object} assets - Decoded machine asset map (for RNAP track lookups).
 * @param {Float32Array} outFrames - Preallocated output frame buffer (16 floats per nucleotide).
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseDuplex(construct, dnaState, assets, outFrames) {
  throw new Error('not implemented: poseDuplex');
}
