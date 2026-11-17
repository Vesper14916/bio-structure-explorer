// Ribonucleoside triphosphate (NTP) templates and pyrophosphate (PPi), built on the ribonucleotide
// template. Pure science module (no DOM, no rendering). Units: angstroms and degrees.
//
// Geometry (idealised, not fitted to a crystal structure): bridging P-O 1.61 A, terminal P-O 1.49 A,
// O-P-O 109.5 deg, P-O-P 130 deg, extended chain (torsions 180 deg along the P-O-P-O-P backbone),
// terminal oxygens staggered at +60, -60 deg (and 180 deg for the bridge). The 130 deg P-O-P angle
// is a typical ATP value (crystal structures span roughly 125-135 deg); it is a design value here.
// Atom naming: the existing template atoms P, OP1, OP2 correspond to the NTP names PA, O1A, O2A.
// O5' is the alpha-phosphate ester oxygen; O3A is the alpha/beta bridging oxygen.
import { nucleotideTemplate } from './assembly.js';
import { placeAtom } from './residues.js';
import { sub, add, scale, norm, dihedral } from './math.js';

const P_O_BRIDGE = 1.61, P_O_TERM = 1.49, O_P_O = 109.5, P_O_P = 130;
const NEW_NAMES = ['O3A', 'PB', 'O1B', 'O2B', 'O3B', 'PG', 'O1G', 'O2G', 'O3G'];
const NEW_BONDS = [['P', 'O3A'], ['O3A', 'PB'], ['PB', 'O1B'], ['PB', 'O2B'], ['PB', 'O3B'],
  ['O3B', 'PG'], ['PG', 'O1G'], ['PG', 'O2G'], ['PG', 'O3G']];

const cache = {};
export function ntpTemplate(base) {
  if (cache[base]) return cache[base];
  const t = nucleotideTemplate(base, 'ribose');
  const names = [...t.names], el = [...t.el], part = [...t.part], xyz = Array.from(t.local);
  const at = n => { const i = t.index[n]; return [t.local[i * 3], t.local[i * 3 + 1], t.local[i * 3 + 2]]; };
  const P = at('P'), pos = {};
  // O3A takes the fourth tetrahedral position on P, opposite to the sum of the unit vectors
  // towards OP1, OP2 and O5'.
  let v = [0, 0, 0];
  for (const n of ['OP1', 'OP2', "O5'"]) v = add(v, norm(sub(at(n), P)));
  const target = add(P, scale(norm(v), -P_O_BRIDGE));
  // Express it with placeAtom: torsion C5'-O5'-P-O3A taken from the tetrahedral target.
  pos.O3A = placeAtom(at("C5'"), at("O5'"), P, P_O_BRIDGE, O_P_O, dihedral(at("C5'"), at("O5'"), P, target));
  pos.PB = placeAtom(at("O5'"), P, pos.O3A, P_O_BRIDGE, P_O_P, 180);
  pos.O1B = placeAtom(P, pos.O3A, pos.PB, P_O_TERM, O_P_O, 60);
  pos.O2B = placeAtom(P, pos.O3A, pos.PB, P_O_TERM, O_P_O, -60);
  pos.O3B = placeAtom(P, pos.O3A, pos.PB, P_O_BRIDGE, O_P_O, 180);
  pos.PG = placeAtom(pos.O3A, pos.PB, pos.O3B, P_O_BRIDGE, P_O_P, 180);
  pos.O1G = placeAtom(pos.PB, pos.O3B, pos.PG, P_O_TERM, O_P_O, 60);
  pos.O2G = placeAtom(pos.PB, pos.O3B, pos.PG, P_O_TERM, O_P_O, -60);
  pos.O3G = placeAtom(pos.PB, pos.O3B, pos.PG, P_O_TERM, O_P_O, 180);
  for (const n of NEW_NAMES) { names.push(n); el.push(n[0]); part.push(2); xyz.push(...pos[n]); }
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  const bonds = [...t.bonds, ...NEW_BONDS.map(([a, b]) => [index[a], index[b]])];
  const leavingGroup = NEW_NAMES.map(n => index[n]);
  return (cache[base] = { base, sugar: 'ribose', names, el, part, local: Float32Array.from(xyz), bonds, index, leavingGroup });
}

/** Pyrophosphate (leaving group), nine atoms, local frame translated so that O3B is the origin
 *  (orientation as in the NTP template). `parent` is the NTP-template atom name of each atom. */
const ppi = (() => {
  const t = ntpTemplate('A');
  const o = t.index.O3B, org = [t.local[o * 3], t.local[o * 3 + 1], t.local[o * 3 + 2]];
  const names = NEW_NAMES, el = names.map(n => n[0]), index = Object.fromEntries(names.map((n, i) => [n, i]));
  const local = new Float32Array(names.length * 3);
  names.forEach((n, i) => {
    const k = t.index[n];
    for (let c = 0; c < 3; c++) local[i * 3 + c] = t.local[k * 3 + c] - org[c];
  });
  const bonds = NEW_BONDS.filter(([a]) => a !== 'P').map(([a, b]) => [index[a], index[b]]);
  return { names: [...names], el, part: names.map(() => 2), local, bonds, index };
})();
export const PPI_TEMPLATE = ppi;
