/**
 * @module scene/camera-rails
 * Round 3 guided camera rails and shot resolution stub (PLAN.md §4.7, §6.3, §8.1, task R3-R3).
 * Resolves shot definitions in actor/world frames, computes transition timing, and manages Free interrupt.
 */

/**
 * Resolve a shot specification `{ target, dir, distance, detailRadius, cut, follow }` into
 * world-space camera position, look-at target, cutaway plane, and detail-sphere focus
 * for the given `worldState` and decoded `assets`.
 *
 * @param {object} shot - Shot specification from `shots.js` (PLAN.md §6.3, §6.4).
 * @param {object} worldState - Current WorldState from `stateAt`.
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @returns {{ pos: number[], target: number[], detailRadius: number, cut: object | null, follow: boolean }} Resolved camera pose.
 */
export function resolveShot(shot, worldState, assets) {
  throw new Error('not implemented: resolveShot');
}

/**
 * Compute camera transition duration in seconds between two world positions per PLAN.md §4.7:
 * `clamp(0.8 + travel / 600, 1.2, 3.0)` seconds, where `travel` is Euclidean distance in angstroms.
 *
 * @param {number[]} fromPos - Starting camera position `[x, y, z]` in angstroms.
 * @param {number[]} toPos - Destination camera position `[x, y, z]` in angstroms.
 * @returns {number} Transition duration in seconds.
 */
export function transitionDuration(fromPos, toPos) {
  throw new Error('not implemented: transitionDuration');
}

/**
 * Create a camera-rails controller bound to `viewer` that applies shots, drives `follow`
 * smoothing, switches to `'Free'` on user orbit/pan/zoom interrupt, and respects reduced motion.
 *
 * @param {object} viewer - Helix 3D Viewer instance.
 * @returns {object} CameraRails controller.
 */
export function createCameraRails(viewer) {
  throw new Error('not implemented: createCameraRails');
}
