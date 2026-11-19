/**
 * @module kin/peptide-path
 * Round 3 nascent peptide path kinematics stub (PLAN.md §8.1, §8.3, task R3-K2).
 * Poses an atomic peptide chain along the 50S exit tunnel and solvent-side free path.
 */

/**
 * Pose atomic coordinates for a peptide of three-letter residue codes `codes3` along
 * the exit tunnel (`tunnelPath`) and solvent continuation (`freePath`), shifting outward
 * according to `releaseProgress` in `[0, 1]`.
 *
 * Contract (PLAN.md §8.3, §10 R3-K2):
 * - C-alpha of residue `k` (`k = 0` attached to tRNA) sits at arc length `k * 3.40` angstroms
 *   along `tunnelPath`, then along `freePath`.
 * - Residue local frames are applied on rotation-minimising path frames so every
 *   `C(i)–N(i+1)` bond lies within `1.33 +/- 0.25` angstroms.
 * - Writes atom positions/bonds into `outGroup` (`AtomGroup` format).
 *
 * @param {string[]} codes3 - Ordered residue codes (e.g. `['FME', 'ALA', ...]`).
 * @param {object} tunnelPath - Precomputed exit-tunnel path descriptor in world coordinates.
 * @param {object} freePath - Precomputed solvent-side free-peptide path descriptor.
 * @param {number} releaseProgress - Post-termination release slide progress in `[0, 1]`.
 * @param {object} outGroup - Reusable AtomGroup object to populate in place.
 * @returns {object} Populated `outGroup`.
 */
export function posePeptideOnPath(codes3, tunnelPath, freePath, releaseProgress, outGroup) {
  throw new Error('not implemented: posePeptideOnPath');
}
