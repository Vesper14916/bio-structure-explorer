/**
 * @module kin/chain
 * Round 3 free single-stranded nucleic acid chain kinematics stub (PLAN.md §8.1, §8.3, task R3-K2).
 * Builds centripetal Catmull-Rom splines with 512-sample arc-length tables and poses A-form strands.
 */

/**
 * Build a reusable free-chain spline descriptor from 3D control points.
 *
 * Contract (PLAN.md §8.3, §10 R3-K2):
 * - Uses centripetal Catmull-Rom splines and a 512-sample arc-length table.
 * - Supports deterministic gentle thermal-style undulation damped to 0 within 30 angstroms of anchors.
 *
 * @param {number[][]} controlPoints - Array of `[x, y, z]` control points.
 * @param {{ seed?: number, chainId?: string, anchorEnds?: boolean }} [opts] - Chain build options.
 * @returns {object} Precomputed free-chain descriptor.
 */
export function buildFreeChain(controlPoints, opts = {}) {
  throw new Error('not implemented: buildFreeChain');
}

/**
 * Pose `count` A-form single-strand nucleotides (rise 2.81 angstroms, twist 32.73 deg,
 * rotation-minimising frames) along `chain` at story time `t`.
 *
 * @param {object} chain - Free-chain descriptor built by `buildFreeChain`.
 * @param {number} count - Number of nucleotides to pose.
 * @param {number} t - Story time in seconds (drives deterministic gentle motion).
 * @param {Float32Array} outFrames - Preallocated output frame buffer (16 floats per nucleotide).
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseFreeChain(chain, count, t, outFrames) {
  throw new Error('not implemented: poseFreeChain');
}
