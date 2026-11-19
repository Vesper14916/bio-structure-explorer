/**
 * @module scene/crowd
 * Round 3 cytoplasmic crowding generator stub (PLAN.md §4.3, §8.1, §10 R3-R4).
 * Generates deterministic, non-overlapping crowder transforms outside scene exclusion volumes.
 */

/**
 * Generate seeded cytoplasmic crowder instance batches (`[{ assetId, transforms: Float32Array }]`)
 * inside a 1600 x 1000 x 1000 angstrom box centred on the gene midpoint, excluding the gene-axis
 * capsule (radius 180 angstroms) and ribosome exclusion sphere (radius 320 angstroms).
 *
 * Contract (PLAN.md §4.3, §4.5, §10 R3-R4):
 * - Deterministic for a given `seed`.
 * - Respects quality tier counts (`high`: 100%, `medium`: 50%, `low`: 0%).
 * - Minimum centre separation equals `0.8 * (r_i + r_j)`.
 *
 * @param {object} scenario - Gene construct / scenario definition.
 * @param {object} assets - Decoded machine asset map providing bounds radii.
 * @param {{ seed?: number, tier?: 'low' | 'medium' | 'high', ribosomePose?: object }} [opts] - Crowding options.
 * @returns {Array<{ assetId: string, transforms: Float32Array }>} Instanced crowder batches for `viewer.setCrowd`.
 */
export function generateCrowd(scenario, assets, opts = {}) {
  throw new Error('not implemented: generateCrowd');
}
