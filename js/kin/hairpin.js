/**
 * @module kin/hairpin
 * Round 3 intrinsic terminator hairpin kinematics stub (PLAN.md §8.1, §10 R3-K2).
 * Poses the 8-bp A-form stem and 4-nt GAAA loop relative to the RNAP `hairpin` anchor.
 */

/**
 * Pose the terminator hairpin nucleotides (8-bp A-form stem + 4-nt GAAA tetraloop)
 * anchored at `anchor` with progressive folding progress `foldProgress` in `[0, 1]`.
 *
 * Contract (PLAN.md §10 R3-K2):
 * - Stem pair `i` forms when both partners exist and the 3' partner is at least 9 nt from the 3' end.
 * - At full fold (`foldProgress = 1`), Watson-Crick H-bond distances lie within 2.7–3.1 angstroms.
 *
 * @param {{ o: number[], R: number[] }} anchor - World-space frame of the hairpin closing base pair.
 * @param {number} foldProgress - Folding progress in `[0, 1]`.
 * @param {Float32Array} outFrames - Preallocated output frame buffer (16 floats per nucleotide).
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseHairpin(anchor, foldProgress, outFrames) {
  throw new Error('not implemented: poseHairpin');
}
