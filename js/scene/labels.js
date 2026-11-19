/**
 * @module scene/labels
 * Round 3 3D label priority selection stub (PLAN.md §4.6, §8.1, task R3-R3).
 * Selects up to 6 scene overlay tags in strict priority order with 250 ms fade rules.
 */

/**
 * Select and position the active 3D scene labels from `worldState` and `assets`
 * according to the exact text strings and priority table in PLAN.md §4.6.
 *
 * Contract (PLAN.md §4.6, §8.4, §10 R3-R3):
 * - Enforces a hard cap of at most 6 visible tags at any time.
 * - Uses existing `hx-tag` (`hx-blob` / `hx-label` / `hx-sm`) overlay styles.
 *
 * @param {object} worldState - Current WorldState from `stateAt`.
 * @param {object} assets - Decoded machine asset map for anchor positions.
 * @param {{ enabled?: boolean, shotId?: string }} [opts] - Label selection options.
 * @returns {object[]} Ordered list of at most 6 label descriptors for `viewer.setLabels`.
 */
export function selectLabels(worldState, assets, opts = {}) {
  throw new Error('not implemented: selectLabels');
}
