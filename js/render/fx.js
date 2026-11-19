/**
 * @module render/fx
 * Round 3 molecular event effects layer stub (PLAN.md §4.4, §8.1–§8.2, task R3-R2).
 * Renders bond-formation pulses and GTP hydrolysis cues driven by `WorldState.fx`.
 */

/**
 * Event-effects layer driven by `WorldState.fx` entries (`type: 'pulse' | 'gtp'`).
 *
 * Contract (PLAN.md §4.4, §8.2, §8.4, §10 R3-R2):
 * - Bond pulse (`type: 'pulse'`): scales the two bonded atoms `1 -> 1.35 -> 1` and lerps
 *   40% toward white and back over 400 ms (`easeInOutCubic` each half).
 * - GTP hydrolysis cue (`type: 'gtp'`): displays label `GTP → GDP` (`hx-sm`) at the factor's
 *   `gDomain` anchor for 1.4 s with 250 ms fades.
 */
export class FxLayer {
  /**
   * Construct an FxLayer.
   *
   * @param {object} [opts] - Layer configuration options.
   */
  constructor(opts = {}) {
    throw new Error('not implemented: FxLayer');
  }
}
