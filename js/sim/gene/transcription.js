/**
 * @module sim/gene/transcription
 * Round 3 transcription choreography stub (PLAN.md §6.1, §8.1–§8.2, task R3-S3).
 * Evaluates transcription chapters (1–7) into WorldState.
 */

/**
 * Populate transcription-specific fields (RNAP motion, DNA bend/bubble/relax, mRNA growth,
 * NTP entry, PPi departure, sigma release, hairpin folding, and bond FX) into `out` at time `t`.
 *
 * Contract (PLAN.md §8.2, §10 R3-S2/R3-S3):
 * - Plug point invoked by `stateAt(story, t, out)`.
 * - Pure deterministic function of `(story, t)`; mutates `out` in place.
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeTx(story, t, out) {
  throw new Error('not implemented: contributeTx');
}
