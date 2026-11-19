/**
 * @module sim/gene/timeline
 * Round 3 timeline builder stub (PLAN.md §6.1, §8.1–§8.2, task R3-S2).
 * Builds chapter tables and per-nucleotide / per-codon event lists for Step by step mode.
 */

/**
 * Build the chapter list and sorted event list for the gene-expression timeline.
 *
 * Contract (PLAN.md §6.1, §8.2, §10 R3-S2):
 * - Produces chapters with exact titles, groups (`'O'|'T'|'I'|'E'`), durations, shots, and captions.
 * - Generates events with unique, stable ids `<type>:<n>` sorted by `t0`, then `id`.
 *
 * @param {object} scenario - Gene construct / scenario definition (Construct v3).
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @param {{ mode?: 'sequential' | 'coupled', seed?: number }} [opts] - Timeline options.
 * @returns {{ duration: number, chapters: object[], events: object[], meta: object }} Timeline structure.
 */
export function buildTimeline(scenario, assets, opts = {}) {
  throw new Error('not implemented: buildTimeline');
}
