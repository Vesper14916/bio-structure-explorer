/**
 * @module sim/gene/shots
 * Round 3 camera shot catalog stub (PLAN.md §6.3, §6.4, §8.1, task R3-S2).
 * Provides named shot definitions and chapter-time shot resolution.
 */

/**
 * Look up a named shot specification from the shot table (PLAN.md §6.3, §6.4).
 *
 * Contract (PLAN.md §4.7, §6.3):
 * - Returns `{ id, target, dir, distance, detailRadius, cut, follow }`.
 * - Includes sequential shots (`wide`, `rnap-side`, `rnap-active`, `rnap-follow`, `rnap-exit`,
 *   `ribo-30s`, `ribo-decode`, `ribo-side`, `ribo-ptc`, `ribo-tunnel`, `ribo-exit`)
 *   and coupled shots (`coupled-wide`, `coupled-follow`).
 *
 * @param {string} id - Shot identifier.
 * @returns {object} Shot definition.
 */
export function getShot(id) {
  throw new Error('not implemented: getShot');
}

/**
 * Resolve the active shot state for a chapter at story time `t`, handling mid-chapter
 * shot switches (e.g. chapter 14 `ribo-tunnel` -> `ribo-exit`, chapter 15 `ribo-decode` -> `ribo-exit`).
 *
 * @param {object} chapter - Active Chapter descriptor.
 * @param {number} t - Story time in seconds at 1x.
 * @returns {{ id: string, from: string | null, blend: number }} Active shot transition state.
 */
export function resolveChapterShot(chapter, t) {
  throw new Error('not implemented: resolveChapterShot');
}
