// Extended atomic nascent peptide built residue by residue from ideal backbone geometry.
// Pure science module (no DOM, no rendering). Units: angstroms and degrees.
// Backbone values: Engh & Huber (1991). Default phi/psi = -139/135 (extended beta strand,
// Ramachandran region of the antiparallel beta sheet). No folding, no hydrogens.
import { applyFrame, kabsch } from './math.js';
import { placeAtom, buildResidueRaw, BACKBONE_GEOM as G } from './residues.js';

/**
 * Returns { atoms: { count, pos: Float32Array, el: string[], name: string[], residue: Uint16Array },
 *           bonds: Uint16Array (flat pairs), residues: [{ index, code3, atomStart, atomCount, ca }] }.
 * Backbone N, CA, C are placed by the chain recursion; every other atom comes from the residue
 * internal-coordinate build superposed on N, CA, C of that residue.
 */
export function buildPeptide(codes3, { phi = -139, psi = 135, omega = 180, cTerminalOxt = true } = {}) {
  const el = [], name = [], residue = [], pos = [], bonds = [], residues = [];
  let prev = null; // { N, CA, C } of the previous residue
  let prevC = -1;
  codes3.forEach((code3, r) => {
    const raw = buildResidueRaw(code3, phi, psi);
    let N, CA, C;
    if (!prev) {
      ({ N, CA, C } = raw.pos);
    } else {
      N = placeAtom(prev.N, prev.CA, prev.C, G.C_N, G.CA_C_N, psi);
      CA = placeAtom(prev.CA, prev.C, N, G.N_CA, G.C_N_CA, omega);
      C = placeAtom(prev.C, N, CA, G.CA_C, G.N_CA_C, phi);
    }
    const frame = kabsch([raw.pos.N, raw.pos.CA, raw.pos.C], [N, CA, C]);
    const start = el.length, local = {};
    raw.names.forEach((n, i) => {
      local[n] = start + i;
      pos.push(...applyFrame(frame, raw.pos[n]));
      el.push(n === 'SD' ? 'S' : n[0]); name.push(n); residue.push(r);
    });
    for (const [a, b] of raw.bonded) bonds.push(local[a], local[b]);
    if (prevC >= 0) bonds.push(prevC, local.N);
    prevC = local.C;
    let count = raw.names.length;
    if (cTerminalOxt && r === codes3.length - 1) {
      const oxt = placeAtom(N, CA, C, G.C_OXT, G.CA_C_OXT, psi);
      pos.push(...oxt); el.push('O'); name.push('OXT'); residue.push(r);
      bonds.push(local.C, el.length - 1); count++;
    }
    const ca = pos.slice(local.CA * 3, local.CA * 3 + 3);
    residues.push({ index: r, code3, atomStart: start, atomCount: count, ca });
    prev = { N, CA, C };
  });
  return {
    atoms: { count: el.length, pos: Float32Array.from(pos), el, name, residue: Uint16Array.from(residue) },
    bonds: Uint16Array.from(bonds), residues,
  };
}

/** Template codes for a construct's nascent peptide; the first residue is N-formylmethionine. */
export function peptideFromConstruct(construct) {
  return construct.peptide.map((p, i) => (i === 0 ? 'FME' : p.code3.toUpperCase()));
}
