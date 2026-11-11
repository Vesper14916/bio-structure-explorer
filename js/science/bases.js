// Standard nucleic-acid base geometry in the standard base reference frame.
// Source: Olson et al. (2001) "A standard reference frame for the description of
// nucleic acid base-pair geometry", J. Mol. Biol. 313, 229-237 (Table 1).
// Units: Å. All base atoms lie in the z = 0 plane. The x-axis points to the major
// groove, the y-axis runs along the C1'...C1' direction toward strand I, and the
// z-axis follows the 5'->3' direction of strand I. The Watson-Crick partner is the
// same frame rotated 180° about x: (x, y, z) -> (x, -y, -z).

export const BASE_ATOMS = {
  A: [
    ["C1'", 'C', -2.479, 5.346], ['N9', 'N', -1.291, 4.498], ['C8', 'C', 0.024, 4.897],
    ['N7', 'N', 0.877, 3.902], ['C5', 'C', 0.071, 2.771], ['C6', 'C', 0.369, 1.398],
    ['N6', 'N', 1.611, 0.909], ['N1', 'N', -0.668, 0.532], ['C2', 'C', -1.912, 1.023],
    ['N3', 'N', -2.320, 2.290], ['C4', 'C', -1.267, 3.124],
  ],
  G: [
    ["C1'", 'C', -2.477, 5.399], ['N9', 'N', -1.289, 4.551], ['C8', 'C', 0.023, 4.962],
    ['N7', 'N', 0.870, 3.969], ['C5', 'C', 0.071, 2.833], ['C6', 'C', 0.424, 1.460],
    ['O6', 'O', 1.554, 0.955], ['N1', 'N', -0.700, 0.641], ['C2', 'C', -1.999, 1.087],
    ['N2', 'N', -2.949, 0.139], ['N3', 'N', -2.342, 2.364], ['C4', 'C', -1.265, 3.177],
  ],
  C: [
    ["C1'", 'C', -2.477, 5.402], ['N1', 'N', -1.285, 4.542], ['C2', 'C', -1.472, 3.158],
    ['O2', 'O', -2.628, 2.709], ['N3', 'N', -0.391, 2.344], ['C4', 'C', 0.837, 2.868],
    ['N4', 'N', 1.875, 2.027], ['C5', 'C', 1.056, 4.275], ['C6', 'C', -0.023, 5.068],
  ],
  T: [
    ["C1'", 'C', -2.481, 5.354], ['N1', 'N', -1.284, 4.500], ['C2', 'C', -1.462, 3.135],
    ['O2', 'O', -2.562, 2.608], ['N3', 'N', -0.298, 2.407], ['C4', 'C', 0.994, 2.897],
    ['O4', 'O', 1.944, 2.119], ['C5', 'C', 1.106, 4.338], ['C7', 'C', 2.466, 4.961],
    ['C6', 'C', -0.024, 5.057],
  ],
};

// Covalent bonds inside each base (plus the glycosidic bond to C1').
export const BASE_BONDS = {
  A: [["C1'", 'N9'], ['N9', 'C8'], ['C8', 'N7'], ['N7', 'C5'], ['C5', 'C6'], ['C6', 'N6'],
      ['C6', 'N1'], ['N1', 'C2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'C5'], ['C4', 'N9']],
  G: [["C1'", 'N9'], ['N9', 'C8'], ['C8', 'N7'], ['N7', 'C5'], ['C5', 'C6'], ['C6', 'O6'],
      ['C6', 'N1'], ['N1', 'C2'], ['C2', 'N2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'C5'], ['C4', 'N9']],
  C: [["C1'", 'N1'], ['N1', 'C2'], ['C2', 'O2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'N4'],
      ['C4', 'C5'], ['C5', 'C6'], ['C6', 'N1']],
  T: [["C1'", 'N1'], ['N1', 'C2'], ['C2', 'O2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'O4'],
      ['C4', 'C5'], ['C5', 'C7'], ['C5', 'C6'], ['C6', 'N1']],
};

// Sugar-phosphate backbone connectivity within one nucleotide.
export const BACKBONE_BONDS = [
  ['P', 'OP1'], ['P', 'OP2'], ['P', "O5'"], ["O5'", "C5'"], ["C5'", "C4'"], ["C4'", "O4'"],
  ["C4'", "C3'"], ["C3'", "O3'"], ["C3'", "C2'"], ["C2'", "C1'"], ["O4'", "C1'"],
];

export const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };

// Watson-Crick hydrogen bonds, written [atom on first base, atom on partner, donor side].
// donor: 0 = the first base donates the H, 1 = the partner donates.
export const WC_HBONDS = {
  AT: [['N6', 'O4', 0], ['N1', 'N3', 1]],
  TA: [['O4', 'N6', 1], ['N3', 'N1', 0]],
  GC: [['O6', 'N4', 1], ['N1', 'N3', 0], ['N2', 'O2', 0]],
  CG: [['N4', 'O6', 0], ['N3', 'N1', 1], ['O2', 'N2', 1]],
};

// Groove-edge chemistry used for sequence read-out by proteins (Seeman, Rosenberg &
// Rich 1976). Each entry: [atom, role] with role A = H-bond acceptor, D = donor,
// M = methyl (hydrophobic), listed across the groove from the first base to its partner.
export const GROOVE_PATTERN = {
  major: { AT: 'ADAM', TA: 'MADA', GC: 'AADA', CG: 'ADAA' },
  minor: { AT: 'AHA', TA: 'AHA', GC: 'ADA', CG: 'ADA' },
};

export const ELEMENT_INFO = {
  C: { name: 'Carbon', vdw: 1.70, covalent: 0.76, color: 0x8a94a6 },
  N: { name: 'Nitrogen', vdw: 1.55, covalent: 0.71, color: 0x3d6bff },
  O: { name: 'Oxygen', vdw: 1.52, covalent: 0.66, color: 0xff3b47 },
  P: { name: 'Phosphorus', vdw: 1.80, covalent: 1.07, color: 0xffa01c },
};

export const BASE_INFO = {
  A: { name: 'Adenine', kind: 'purine', formula: 'C5H5N5', color: 0x3fd67a },
  T: { name: 'Thymine', kind: 'pyrimidine', formula: 'C5H6N2O2', color: 0xff5964 },
  G: { name: 'Guanine', kind: 'purine', formula: 'C5H5N5O', color: 0xffc233 },
  C: { name: 'Cytosine', kind: 'pyrimidine', formula: 'C4H5N3O', color: 0x38a8ff },
};
