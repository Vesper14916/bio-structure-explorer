/**
 * @module sim/gene/translation
 * Round 3 translation choreography stub (PLAN.md §6.1, §8.1–§8.2, task R3-S4).
 * Evaluates translation chapters (8–16) into WorldState.
 */

/**
 * Populate translation-specific fields (30S/50S assembly, initiation/elongation/release factors,
 * tRNA slots, mRNA translocation, peptide growth/release, and GTP/peptide FX) into `out` at time `t`.
 *
 * Contract (PLAN.md §8.2, §10 R3-S2/R3-S4):
 * - Plug point invoked by `stateAt(story, t, out)`.
 * - Pure deterministic function of `(story, t)`; mutates `out` in place.
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeTl(story, t, out) {
  throw new Error('not implemented: contributeTl');
}
