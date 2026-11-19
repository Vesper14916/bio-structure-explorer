/**
 * @module sim/gene/coupled
 * Round 3 coupled transcription-translation mode stub (PLAN.md §6.4, §8.1, task R3-S5).
 * Builds and evaluates the 12-chapter bacterial expressome timeline.
 */
import { buildTimeline } from './timeline.js';

/**
 * Build the 12-chapter timeline and sorted event list for Coupled (`coupled`) mode.
 *
 * Contract (PLAN.md §6.4, §10 R3-S5):
 * - Currently delegates to `buildTimeline(..., { mode: 'coupled' })` (S2); S5 may replace it.
 * - Uses coupling distance `D` from the 6ZTJ expressome asset.
 * - Chapters 1–5 match Step by step mode; chapters 6–12 model early ribosome binding,
 *   NusG expressome locking, coupled elongation (3 nt per codon), termination, and finale.
 *
 * @param {object} scenario - Gene construct / scenario definition (Construct v3).
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @param {{ seed?: number }} [opts] - Coupled timeline options.
 * @returns {{ duration: number, chapters: object[], events: object[], meta: object }} Coupled timeline structure.
 */
export function buildCoupledTimeline(scenario, assets, opts = {}) {
  return buildTimeline(scenario, assets, { ...opts, mode: 'coupled' });
}

/**
 * Populate coupled-mode expressome fields (locked RNAP-ribosome transform, NusG bridging,
 * coupled mRNA path, simultaneous transcription and translation) into `out` at time `t`.
 *
 * Contract (PLAN.md §6.4, §8.2, §10 R3-S5):
 * - Pure deterministic function of `(story, t)`; mutates `out` in place.
 *
 * @param {object} story - Coupled Story built by `buildStory`.
 * @param {number} t - Story time in seconds at 1x.
 * @param {object} out - Reusable WorldState object to update in place.
 * @returns {object} Updated `out` WorldState.
 */
export function contributeCoupled(story, t, out) {
  return out; // pass-through until S5 (task R3-S5) replaces this plug point
}
