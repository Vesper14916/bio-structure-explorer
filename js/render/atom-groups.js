/**
 * @module render/atom-groups
 * Round 3 procedural atom-group renderer stub (PLAN.md §4.3–§4.4, §8.1, task R3-R1).
 * Renders instanced balls, bonds, and cartoon peptide tubes for NTP, PPi, and nascent peptide groups.
 */

/**
 * Instanced ball-and-stick and cartoon layer for dynamic procedural atom groups
 * (`{ id, count, pos, el, bonds, color?, opacity, detail? }`).
 *
 * Contract (PLAN.md §4.3–§4.4, §8.4, §10 R3-R1):
 * - Uses `MoleculeLayer` materials (`atomMat`, `bondMat`, `BALL_SCALE 0.3`, `BOND_RADIUS 0.17`).
 * - Supports detail-sphere cross-fade (12 angstrom band) and peptide cartoon mode
 *   (C-alpha tube radius `PEPTIDE_BOND_RADIUS 0.42` with beads).
 * - Respects `strand`, `codon`, and `element` colour schemes.
 */
export class AtomGroupLayer {
  /**
   * Construct an AtomGroupLayer.
   *
   * @param {object} [opts] - Layer configuration options.
   */
  constructor(opts = {}) {
    throw new Error('not implemented: AtomGroupLayer');
  }
}
