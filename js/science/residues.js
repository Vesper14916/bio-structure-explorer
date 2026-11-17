// Heavy-atom amino-acid residue templates built from ideal internal coordinates.
// Pure science module: no DOM, no rendering. Units: angstroms and degrees.
//
// Sources of numeric parameters:
//  - Backbone: Engh & Huber (1991) Acta Cryst. A47, 392-400: N-CA 1.458, CA-C 1.525, C=O 1.231,
//    peptide C-N 1.329 A; N-CA-C 111.0, CA-C-N 116.2, C-N-CA 121.7, CA-C-O 120.8 deg;
//    N-CA-CB 110.5 deg.
//  - Side chains: Engh & Huber (1991) mean bond lengths and angles, rounded to 0.001 A / 0.1 deg.
//    The values were entered from the published table as recalled by the author; they have not been
//    machine-checked against the paper. Aromatic rings are regularised to a planar hexagon
//    (bond 1.385 A, all angles 120 deg) so that the ring closes exactly; this simplifies the
//    Engh & Huber ring values (bonds 1.382-1.389 A, angles 118-121 deg).
//  - Torsions: all side-chain chi = 180 deg (extended), except PHE/TYR chi2 = 90 deg;
//    carboxylate, amide and ring groups are planar (torsions 0 or 180 deg).
//  - ASP chi2 (CA-CB-CG-OD1) = +90 deg, OD2 at -90 deg (carboxylate stays planar). The brief's all-180
//    rule left the carboxylate torsion open; the 180/0 choice put OD2 at 2.495 A from the next
//    residue's N in the fixture peptide, so chi2 = 90 was used.
//  - FME formyl group: C-N 1.33, C=O 1.23 A (brief), CA-N-CN 121.7 deg (same as C-N-CA of a peptide),
//    N-CN-O1 125.0 deg (formamide-like, approximate). O1 is cis to CA about N-CN, which puts the
//    formyl H trans to CA, as for a trans peptide bond.
// Simplifications: heavy atoms only, no hydrogens, no OXT in the template, no rotamer statistics.
import { DEG, sub, cross, dot, norm } from './math.js';

/** Position of atom d bonded to c: |cd| = bond, angle b-c-d = angleDeg, dihedral a-b-c-d = torsionDeg
 *  (same sign convention as `dihedral` in math.js, angle in `angle`). */
export function placeAtom(a, b, c, bond, angleDeg, torsionDeg) {
  const bc = norm(sub(c, b));
  const n = norm(cross(sub(b, a), bc));
  const m = cross(n, bc);
  const th = angleDeg * DEG, ta = torsionDeg * DEG;
  const dx = -bond * Math.cos(th), dy = bond * Math.sin(th) * Math.cos(ta), dz = bond * Math.sin(th) * Math.sin(ta);
  return [
    c[0] + dx * bc[0] + dy * m[0] + dz * n[0],
    c[1] + dx * bc[1] + dy * m[1] + dz * n[1],
    c[2] + dx * bc[2] + dy * m[2] + dz * n[2]];
}

export const BACKBONE_GEOM = Object.freeze({
  N_CA: 1.458, CA_C: 1.525, C_O: 1.231, C_N: 1.329, C_OXT: 1.25,
  N_CA_C: 111.0, CA_C_N: 116.2, C_N_CA: 121.7, CA_C_O: 120.8, CA_C_OXT: 117.0,
});

// CB placement: angle N-CA-CB 110.5 deg (Engh & Huber). The torsion C-N-CA-CB = -122.5 deg is the
// value that gives C-CA-CB = 110.1 deg (Engh & Huber) for N-CA-C = 111.0 deg and the L
// configuration (found by scan; +122.5 would give the D enantiomer).
const CB_TORSION = -122.5;

// Row: [name, element, refA, refB, refC, bond, angle, torsion]; the atom bonds to refC.
// A row may only reference atoms defined earlier (backbone atoms are N, CA, C, O).
const R = (name, el, a, b, c, bond, angle, tors) => [name, el, a, b, c, bond, angle, tors];
const CB = len => R('CB', 'C', 'C', 'N', 'CA', len, 110.5, CB_TORSION);
export const SIDE_CHAIN_TABLE = {
  GLY: [],
  ALA: [CB(1.521)],
  SER: [CB(1.525), R('OG', 'O', 'N', 'CA', 'CB', 1.417, 111.1, 180)],
  ASP: [CB(1.516), R('CG', 'C', 'N', 'CA', 'CB', 1.513, 112.6, 180),
    R('OD1', 'O', 'CA', 'CB', 'CG', 1.249, 118.4, 90), R('OD2', 'O', 'CA', 'CB', 'CG', 1.249, 118.4, -90)],
  GLU: [CB(1.526), R('CG', 'C', 'N', 'CA', 'CB', 1.520, 114.1, 180), R('CD', 'C', 'CA', 'CB', 'CG', 1.516, 113.4, 180),
    R('OE1', 'O', 'CB', 'CG', 'CD', 1.249, 118.4, 180), R('OE2', 'O', 'CB', 'CG', 'CD', 1.249, 118.4, 0)],
  GLN: [CB(1.525), R('CG', 'C', 'N', 'CA', 'CB', 1.521, 114.1, 180), R('CD', 'C', 'CA', 'CB', 'CG', 1.516, 112.6, 180),
    R('OE1', 'O', 'CB', 'CG', 'CD', 1.234, 120.8, 180), R('NE2', 'N', 'CB', 'CG', 'CD', 1.324, 116.4, 0)],
  LYS: [CB(1.530), R('CG', 'C', 'N', 'CA', 'CB', 1.520, 114.1, 180), R('CD', 'C', 'CA', 'CB', 'CG', 1.520, 111.3, 180),
    R('CE', 'C', 'CB', 'CG', 'CD', 1.508, 111.3, 180), R('NZ', 'N', 'CG', 'CD', 'CE', 1.486, 111.9, 180)],
  MET: [CB(1.530), R('CG', 'C', 'N', 'CA', 'CB', 1.520, 113.3, 180), R('SD', 'S', 'CA', 'CB', 'CG', 1.807, 112.7, 180),
    R('CE', 'C', 'CB', 'CG', 'SD', 1.774, 100.9, 180)],
};
SIDE_CHAIN_TABLE.FME = SIDE_CHAIN_TABLE.MET;
// Aromatic side chains share the ring rows (regular hexagon).
const RING = 1.385;
const ring = extra => [CB(1.530), R('CG', 'C', 'N', 'CA', 'CB', 1.502, 113.8, 180),
  R('CD1', 'C', 'CA', 'CB', 'CG', RING, 120, 90), R('CD2', 'C', 'CA', 'CB', 'CG', RING, 120, -90),
  R('CE1', 'C', 'CB', 'CG', 'CD1', RING, 120, 180), R('CE2', 'C', 'CB', 'CG', 'CD2', RING, 120, 180),
  R('CZ', 'C', 'CG', 'CD1', 'CE1', RING, 120, 0), ...extra];
SIDE_CHAIN_TABLE.PHE = ring([]);
SIDE_CHAIN_TABLE.TYR = ring([R('OH', 'O', 'CD1', 'CE1', 'CZ', 1.376, 120, 180)]);
// Bonds not implied by the placement rows (ring closure): [atom, atom, length].
const EXTRA_BONDS = { PHE: [['CE2', 'CZ', RING]], TYR: [['CE2', 'CZ', RING]] };

const ATOM_ORDER = {
  GLY: 'N CA C O', ALA: 'N CA C O CB', SER: 'N CA C O CB OG', ASP: 'N CA C O CB CG OD1 OD2',
  GLU: 'N CA C O CB CG CD OE1 OE2', GLN: 'N CA C O CB CG CD OE1 NE2', LYS: 'N CA C O CB CG CD CE NZ',
  PHE: 'N CA C O CB CG CD1 CD2 CE1 CE2 CZ', TYR: 'N CA C O CB CG CD1 CD2 CE1 CE2 CZ OH',
  MET: 'N CA C O CB CG SD CE', FME: 'N CN O1 CA C O CB CG SD CE',
};
export const RESIDUE_CODES = Object.freeze(Object.keys(ATOM_ORDER));
export const ONE_TO_THREE = Object.freeze({
  A: 'ALA', E: 'GLU', F: 'PHE', K: 'LYS', G: 'GLY', S: 'SER', D: 'ASP', Y: 'TYR', Q: 'GLN', M: 'MET', fMet: 'FME',
});
const ELEMENT = n => (n === 'SD' ? 'S' : n[0]);

/** Uncached internal-coordinate build. phi (FME formyl placement) and psi (carbonyl O) are in degrees. */
export function buildResidueRaw(code3, phi = -139, psi = 135) {
  const rows = SIDE_CHAIN_TABLE[code3];
  if (!rows) throw new Error(`unknown residue ${code3}`);
  const G = BACKBONE_GEOM;
  const pos = {};
  pos.CA = [0, 0, 0];
  pos.N = [-G.N_CA, 0, 0];
  pos.C = [-Math.cos(G.N_CA_C * DEG) * G.CA_C, Math.sin(G.N_CA_C * DEG) * G.CA_C, 0];
  pos.O = placeAtom(pos.N, pos.CA, pos.C, G.C_O, G.CA_C_O, psi + 180);
  const bonded = [['N', 'CA'], ['CA', 'C'], ['C', 'O']];
  const target = { 'N-CA': G.N_CA, 'CA-C': G.CA_C, 'C-O': G.C_O };
  if (code3 === 'FME') {
    pos.CN = placeAtom(pos.C, pos.CA, pos.N, 1.33, G.C_N_CA, phi);
    pos.O1 = placeAtom(pos.CA, pos.N, pos.CN, 1.23, 125.0, 0);
    bonded.push(['N', 'CN'], ['CN', 'O1']); target['N-CN'] = 1.33; target['CN-O1'] = 1.23;
  }
  for (const [name, , a, b, c, bond, ang, tors] of rows) {
    pos[name] = placeAtom(pos[a], pos[b], pos[c], bond, ang, tors);
    bonded.push([c, name]); target[`${c}-${name}`] = bond;
  }
  for (const [x, y, t] of EXTRA_BONDS[code3] || []) { bonded.push([x, y]); target[`${x}-${y}`] = t; }
  return { names: ATOM_ORDER[code3].split(' '), pos, bonded, target };
}

const cache = {};
/** { code3, names, el, local: Float32Array (CA at origin, N on -x, C in the xy plane), bonds: [i, j][], bondLengths, index }.
 *  `bondLengths[k]` is the design length (A) of `bonds[k]`. */
export function residueTemplate(code3) {
  if (cache[code3]) return cache[code3];
  const raw = buildResidueRaw(code3);
  const names = raw.names, index = Object.fromEntries(names.map((n, i) => [n, i]));
  const local = new Float32Array(names.length * 3);
  names.forEach((n, i) => local.set(raw.pos[n], i * 3));
  const bonds = raw.bonded.map(([a, b]) => [index[a], index[b]]);
  const bondLengths = raw.bonded.map(([a, b]) => raw.target[`${a}-${b}`]);
  return (cache[code3] = { code3, names, el: names.map(ELEMENT), local, bonds, bondLengths, index });
}
export const RESIDUE_BONDS = code3 => residueTemplate(code3).bonds;

/** Chiral volume (N-CA).((C-CA)x(CB-CA)); about +2.5 A^3 for L-amino acids. */
export const chiralVolume = (N, CA, C, CB) => dot(sub(N, CA), cross(sub(C, CA), sub(CB, CA)));
