/**
 * @module ui/inspect
 * Round 3 molecule/actor inspection card builder stub (PLAN.md §4.8, §5.4, §8.1, task R3-U2).
 * Maps a viewer pick hit into structured InspectInfo with provenance and simplifications.
 */

/**
 * Build an `InspectInfo` descriptor for the Express v2 inspection card from a viewer `pick`
 * hit (machine actor, nucleotide, or peptide residue), decoded `assets`, and `worldState`.
 *
 * Contract (PLAN.md §4.8, §5.4, §8.4, §10 R3-U2):
 * - Populates actor name, one-sentence role description, and six rows:
 *   `Source` (with click-only RCSB URL when PDB-backed), `Organism`, `Method`,
 *   `Chains shown`, `Detail level` (`Surface` / `Residues` / `Atoms` / `Procedural`),
 *   and `Simplifications` (1–3 bullets).
 * - Returns `null` when nothing pickable was selected.
 *
 * @param {object | null} pick - Viewer raycast/pick result.
 * @param {object} assets - Decoded machine asset map keyed by asset id.
 * @param {object} worldState - Current WorldState from `stateAt`.
 * @returns {object | null} InspectInfo object for the inspection card, or `null`.
 */
export function buildInspectInfo(pick, assets, worldState) {
  throw new Error('not implemented: buildInspectInfo');
}
