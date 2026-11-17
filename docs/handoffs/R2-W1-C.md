# Handoff: Round 2 Wave 1, Task C (residues, peptide, NTP and PPi)

Branch: `r2w1-c` (from `c9b0744`). Not pushed.

## Files changed

- New: `js/science/residues.js`, `js/science/peptide.js`, `js/science/ntp.js`
- New: `tests/residues.test.mjs` (14 tests), `tests/ntp.test.mjs` (5 tests)
- Edited: `js/science/index.js` (three `export *` lines added)
- New: this handoff

No other file was touched. All three modules import only from `js/science/`.

## Test result

`node --test tests/*.mjs`: tests 59, pass 59, fail 0 (40 existing, unchanged, plus 19 new).

## What was built

- `placeAtom(a, b, c, bond, angleDeg, torsionDeg)` (NeRF). Round-trip tested against `angle` and `dihedral` from `math.js` (bond, angle and torsion reproduced to 1e-6 for 6 torsions x 3 angles).
- `RESIDUE_CODES`, `residueTemplate(code3)` (cached), `RESIDUE_BONDS(code3)`, `ONE_TO_THREE`, plus extras: `buildResidueRaw`, `SIDE_CHAIN_TABLE` (the internal-coordinate table, rows `[name, element, refA, refB, refC, bond, angle, torsion]`), `BACKBONE_GEOM`, `chiralVolume`. Templates also carry `bondLengths` (design length per bond) beyond the CONTRACTS 6.6 shape.
- `buildPeptide(codes3, opts)` and `peptideFromConstruct(construct)` (returns an array of template codes; first is `FME`). Output has the CONTRACTS 6.6 shape. Backbone N, CA, C come from the chain recursion; all other atoms come from the residue build superposed (Kabsch) on N, CA, C.
- `ntpTemplate(base)` (cached, shape of `nucleotideTemplate` plus `leavingGroup`) and `PPI_TEMPLATE` (names, el, part, local, bonds, index; origin at O3B; same orientation as the NTP template).

## Measured values

Atom counts: GLY 4, ALA 5, SER 6, ASP 8, GLU 9, GLN 9, LYS 9, PHE 11, TYR 12, MET 8, FME 10. Peptide `FME ALA GLU PHE LYS GLY SER ASP TYR GLN ALA`: 89 atoms (88 plus OXT). NTP: A 31, U 29, G 32, C 29 (ribonucleotide plus 9).

Peptide (default phi -139, psi 135, omega 180): C-alpha to C-alpha 3.804 A for all ten steps; omega 180.0000 deg for all ten; peptide C-N 1.3290 A; end-to-end C-alpha(1) to C-alpha(11) 34.645 A.

Chiral volume (N-CA).((C-CA)x(CB-CA)): ALA 2.494, SER 2.501, ASP 2.486, GLU 2.502, GLN 2.501, LYS 2.509, PHE 2.509, TYR 2.509, MET 2.509, FME 2.509 A^3. Also checked for each non-Gly residue inside the built peptide (all within 2.0 to 3.0).

NTP (identical for A, U, G, C because the P environment is the same): bridging P-O3A, O3A-PB, PB-O3B, O3B-PG all 1.610 A; terminal P-O 1.490 A; P-O3A-PB 130.000 deg; PB-O3B-PG 130.000 deg; O5'-P-O3A 109.5 deg. Smallest non-bonded contact between new atoms and the rest of the nucleotide: 2.405 A (O3A...OP1; the existing template has OP1-P-O3A = 101.9 deg and OP2-P-O3A = 107.4 deg because its own phosphate is not an ideal tetrahedron).

## Chirality (L) confirmation

1. Chiral volume (N-CA).((C-CA)x(CB-CA)) is +2.49 to +2.51 A^3 for every residue with CB (test asserts 2.0 to 3.0).
2. CORN rule, computed independently in the test: the implicit H is placed opposite the sum of the unit vectors to CO, R and N; looking from H toward CA, the sequence CO -> R -> N must be clockwise, which is `(CO x R + R x N + N x CO) . h < 0`. It holds for every residue (test asserts it). The two methods agree, so no stop condition was triggered.

The sign of the CB torsion (C-N-CA-CB = -122.5 deg, giving N-C-CA-CB = +122.7 deg) was found by scanning; +122.5 gives the D enantiomer. Not compared with an external structure file (none available offline in this task).

## Deviations from the brief and threshold questions (for the Integration Owner)

1. **1-3 contacts and the "no non-bonded atoms closer than 2.2 A" test.** With Engh & Huber geometry, ASP OD1...OD2 and GLU OE1...OE2 are 2.197 A, which is 0.003 A under 2.2; GLN OE1...NE2 is 2.246 A. Geometry was kept. The test applies the 2.2 A rule to atom pairs three or more bonds apart (minimum 2.706 A, ASP CA...OD2 after the chi2 change below) and a floor of 2.15 A for 1-3 pairs. Please decide whether to accept this or change the rule.
2. **"No atoms in different residues closer than 2.6 A unless bonded" cannot hold literally.** Across every peptide bond, 1-3 pairs (O(i)...N(i+1), CA(i)...N(i+1), C(i)...CA(i+1), O(i)...CA(i+1)) are 2.25 to 2.45 A by covalent geometry. Observed literal minimum for non-bonded inter-residue atoms: 2.250 A (O1...N2, i.e. formyl O to the next amide N). The test applies 2.6 A to pairs three or more bonds apart (observed minimum 2.773 A, O of residue 5 to CA of residue 6) and 2.2 A to 1-3 pairs (observed 2.250 A).
3. **ASP chi2.** The brief says all chi are 180 except planar groups; it does not fix the carboxylate torsion. With CA-CB-CG-OD1 = 180 / OD2 = 0, OD2 of ASP8 sat 2.495 A from N of TYR9 in the fixture peptide, so the strict 2.6 A test failed. Chosen instead: OD1 = +90 deg, OD2 = -90 deg (carboxylate still planar). GLU and GLN keep 180/0 and do not clash. This is a design choice, not tuned from a published rotamer.
4. **FME formyl orientation.** The brief says "trans to CA". I read it as the peptide-like arrangement: the formyl H is trans to CA about N-CN, so O1 is cis to CA (CA-N-CN-O1 = 0 deg), N-CN-O1 = 125 deg. If the brief meant O1 trans to CA (CA-N-CN-O1 = 180 deg), change the `0` in the `O1` placement in `buildResidueRaw`. Not checked against a structure.
5. **Aromatic rings** are a regular planar hexagon (bond 1.385 A, all 120 deg) instead of the exact Engh & Huber ring bond lengths and angles, so the ring closes exactly (all ring bonds 1.385 A, planarity within 0.02 A tested). CB-CG-CD is therefore 120 deg, not 120.7 deg.
6. `peptideFromConstruct` returns an array of template codes (the brief says "maps ... to template codes"); `fMet` in the construct becomes `FME` only for the first residue, other codes are upper-cased.

## Not verified

- Side-chain bond lengths and angles were entered from memory of the Engh & Huber (1991) table, rounded; I had no network or paper access in this task and did not check them against the published values. Backbone values are the ones given in the brief.
- Chirality was not compared with a deposited structure.
- The NTP P-O and P-O-P values are the idealised design values from the brief (130 deg P-O-P is typical of ATP, crystal range roughly 125 to 135 deg), not fitted to a structure.
- Nothing was rendered or inspected in a browser (out of scope for this task).

## Note for `docs/SCIENCE.md`

Amino-acid residues are built as heavy-atom models from ideal internal coordinates: the backbone uses Engh and Huber (1991) bond lengths and angles and a planar trans peptide bond; side chains use rounded Engh and Huber means with all chi torsions fixed at 180 degrees (PHE and TYR chi2 = 90 degrees, ASP chi2 = 90 degrees), planar carboxylate, amide and ring groups, and regular-hexagon aromatic rings. All residues are L. The nascent peptide is a single extended strand (phi -139, psi 135, omega 180) with an optional C-terminal OXT; the first residue is N-formylmethionine. There are no hydrogens, no rotamer statistics, no side-chain packing, no folding and no ribosome-exit-tunnel confinement. Nucleoside triphosphates extend the A-RNA ribonucleotide template with an idealised extended triphosphate (P-O bridging 1.61 A, terminal 1.49 A, O-P-O 109.5 degrees, P-O-P 130 degrees), without Mg2+ ions or hydrogens; the beta and gamma phosphates form the pyrophosphate leaving group. The triphosphate conformation is an idealisation, not the conformation bound in RNA polymerase.
