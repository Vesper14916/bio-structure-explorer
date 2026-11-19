/**
 * @module kin/pose
 * Round 3 top-level kinematics poser stub (PLAN.md §8.1, §8.3, tasks R3-S3 and R3-S4).
 * Translates WorldState into Assembly nucleotide frames, AtomGroup buffers, and ActorSpec transforms.
 */

/**
 * Create a reusable `Poser` with precomputed molecular templates and typed working buffers.
 *
 * Contract (PLAN.md §8.3):
 * - Returns `Poser` with method `pose(world, target)` where
 *   `target = { asm, groups, actors }`.
 * - `pose` writes nucleotide frames into `asm` (and calls `asm.updatePositions()`),
 *   writes atom-group coordinates (NTP, PPi, peptide), and updates actor transforms.
 * - Performance budget: median <= 6 ms per `pose` call for the full scene in Node 22.
 *
 * @param {object} scenario - Gene construct / scenario definition (Construct v3).
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @returns {{ pose: (world: object, target: { asm: object, groups: object, actors: object[] }) => void }} Poser instance.
 */
export function createPoser(scenario, assets) {
  throw new Error('not implemented: createPoser');
}
