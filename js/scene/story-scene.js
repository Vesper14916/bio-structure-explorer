/**
 * @module scene/story-scene
 * Round 3 top-level story scene controller stub (PLAN.md §8.1, §8.4, tasks R3-INT2/INT3).
 * Connects Story, Poser, camera rails, crowders, labels, and Viewer API.
 */

/**
 * Create a StoryScene controller bound to a `viewer` instance.
 *
 * Contract (PLAN.md §8.4):
 * - Returns `StoryScene = { story, seek(t), play(), pause(), setSpeed(v), setMode(mode),
 *   setCameraOption(opt), setToggles({ cutaway, labels, crowding }),
 *   pick(hit) -> InspectInfo | null, state() -> UiState, dispose() }`.
 * - `UiState` merges into `ui.setExpressState` with keys: `progress`, `playing`, `speed`,
 *   `mode`, `chapterIndex`, `chapters`, `caption`, `phaseLevel`, `cameraOption`, `counters`,
 *   `codons`, `activeCodon`, `peptideSeq`, `inspect`.
 *
 * @param {object} viewer - Helix 3D Viewer instance.
 * @param {{ scenario?: object, assets?: object, mode?: 'sequential' | 'coupled', tier?: string }} [opts] - Scene options.
 * @returns {object} StoryScene controller.
 */
export function createStoryScene(viewer, opts = {}) {
  throw new Error('not implemented: createStoryScene');
}
