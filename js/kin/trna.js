/**
 * @module kin/trna
 * Round 3 tRNA anticodon and aminoacyl-end kinematics stub (PLAN.md §7.4, §8.1, task R3-K3).
 * Poses procedural anticodon nucleotides (nt 34–36) and the aminoacyl ester attachment point.
 */

/**
 * Pose the three procedural anticodon nucleotides (registers 34, 35, 36) for a placed tRNA
 * using its decoded asset `anticodon` track and world transform.
 *
 * Contract (PLAN.md §2 D7, §10 R3-K3):
 * - Writes nucleotide frames into `outFrames` (16 floats per nucleotide).
 * - Paired with the mRNA codon in A and P sites within 10.5 +/- 0.3 angstroms C1'–C1' distance.
 *
 * @param {object} trnaSpec - Active tRNA slot state (from `WorldState.trnas` plus world transform).
 * @param {object} asset - Decoded `trna-init` or `trna-aa` asset containing track `anticodon`.
 * @param {Float32Array} outFrames - Preallocated output frame buffer (16 floats per nucleotide).
 * @returns {Float32Array} Populated `outFrames` buffer.
 */
export function poseTrnaAnticodon(trnaSpec, asset, outFrames) {
  throw new Error('not implemented: poseTrnaAnticodon');
}

/**
 * Compute the world-space aminoacyl attachment frame/position at the tRNA `acceptor` anchor
 * (ester carbon 1.33 angstroms along `acceptor` +z) for single aminoacyl residues or
 * nascent peptidyl attachment.
 *
 * @param {object} trnaSpec - Active tRNA slot state with world transform.
 * @param {object} asset - Decoded `trna-init` or `trna-aa` asset containing anchor `acceptor`.
 * @returns {{ o: number[], R: number[] }} World-space aminoacyl attachment frame.
 */
export function poseAminoacylEnd(trnaSpec, asset) {
  throw new Error('not implemented: poseAminoacylEnd');
}
