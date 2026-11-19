# Ribosome asset (`ribosome-70s`)

Task R3-A1 (stage ST2, steps 2 and 3). Recipe: `tools/assets/ribosome.mjs`. Tests: `tests/assets-ribosome.test.mjs`. Output: `assets/ribosome-70s.asset.json` (asset format v2). Design basis: `docs/tasks/R3-ST2-design.md` section 5 (5.1 to 5.5 and 5.7), `PLAN.md` sections 7.2 to 7.5. The tunnel path, the `ptc` and `tunnelExit` anchors and the `ptc` L2 site are described in the last section.

## 1. Provenance

All files are loaded with `ctx.loadSource(pdbId)` (SHA-256 and size checked against `tools/sources.lock.json`; model 1, altloc `.` or `A`, no hydrogens). Licence of all entries: CC0 (wwPDB).

| PDB | Title | Method, resolution | Revision | Used for |
| --- | --- | --- | --- | --- |
| 7K00 (primary) | Structure of the Bacterial Ribosome at 2 Angstrom Resolution | cryo-EM, 1.98 Å | 2026-09-23 | frame, parts, L0/L1/L2, `siteA`, `siteP`, `decoding`, `mrna` registers -3 to +8 |
| 7ST2 | Post translocation, non-rotated 70S ribosome with EF-G dissociated (Structure VII) | cryo-EM, 2.9 Å | 2024-10-09 | `siteE`, `mrna` registers -14 to -4, `antiSD` |
| 5WE4 | 70S ribosome-EF-Tu wt complex with GppNHp | cryo-EM, 3.1 Å | 2026-09-23 | `siteAT` |
| 7PJV | Structure of the 70S-EF-G-GDP-Pi ribosome complex with tRNAs in hybrid state 1 | cryo-EM, 3.1 Å | 2026-06-24 | test of `siteAP` and `sitePE` (both omitted) |

Chain identities confirmed against the downloaded files (they agree with `PLAN.md` 7.2 and the design file section 2):
- 7K00: 16S `A`, 23S `a`, 5S `b`, 30S proteins `B` to `U` (S2 to S21), 50S proteins `c` to `z` and `0` to `4` (L2 to L36, `4` is L31, `h` is L9 with 41 residues), mRNA `X` (author 13 to 24, `AAAAUGGUAUAA`), A-site tRNA-Val `Y`, P-site tRNA-fMet `Z`, E-site fragment `5` (author 75 and 76).
- 7ST2: 16S `3` (label 1 to 1539 = author 2 to 1540), 23S `1`, 5S `2`, tRNA fMet `6`, tRNA Pro `5`, mRNA `4` (author 5 to 23).
- 5WE4: 16S `a`, 23S `A`, 5S `B`, mRNA `x`, Phe-tRNA `y`, tRNA-fMet `v` and `w`, EF-Tu `z`.
- 7PJV: 16S `a`, 23S `A`, 5S `B`, mRNA `z`, tRNA(fMet) `v`, fMet-Phe-tRNA(Phe) `w`, EF-G `x`.
The recipe throws if a 16S or 23S chain id differs from these. Non-polymer content of 7K00 (paromomycin, spermidine, spermine, Zn2+, waters) is dropped; Mg2+ is kept only as described in section 8 (none lies within 8 Å of the current L2 site).

## 2. Chain table

52 chains: 21 in part `small` and 31 in part `large`. Subunit tags: `rRNA16S` 1, `rprotein30S` 20, `rRNA23S` 1, `rRNA5S` 1, `rprotein50S` 29. Chain names are the entity descriptions. `Modelled residues` counts the polymer residues of the chain in the entry (16S ends at author 1534; the anti-SD 1535 to 1540 is not modelled in 7K00); `L1 beads` counts P atoms (RNA) or Cα atoms (protein); the two columns agree for every chain, so no residue lacks its bead atom. The `chains[]` entries carry the extra field `modelled`. Chains `X`, `Y`, `Z`, `5` (mRNA, A-site tRNA, P-site tRNA, E-site fragment) are not in any part.

| Part | Subunit tag | Chain | Entity description | Class | Modelled residues | L1 beads |
| --- | --- | --- | --- | --- | ---: | ---: |
| small | rRNA16S | `A` | 16S rRNA | rna | 1519 | 1519 |
| small | rprotein30S | `B` | 30S ribosomal protein S2 | protein | 224 | 224 |
| small | rprotein30S | `C` | 30S ribosomal protein S3 | protein | 206 | 206 |
| small | rprotein30S | `D` | 30S ribosomal protein S4 | protein | 205 | 205 |
| small | rprotein30S | `E` | 30S ribosomal protein S5 | protein | 156 | 156 |
| small | rprotein30S | `F` | 30S ribosomal protein S6 | protein | 103 | 103 |
| small | rprotein30S | `G` | 30S ribosomal protein S7 | protein | 153 | 153 |
| small | rprotein30S | `H` | 30S ribosomal protein S8 | protein | 129 | 129 |
| small | rprotein30S | `I` | 30S ribosomal protein S9 | protein | 127 | 127 |
| small | rprotein30S | `J` | 30S ribosomal protein S10 | protein | 98 | 98 |
| small | rprotein30S | `K` | 30S ribosomal protein S11 | protein | 117 | 117 |
| small | rprotein30S | `L` | 30S ribosomal protein S12 | protein | 123 | 123 |
| small | rprotein30S | `M` | 30S ribosomal protein S13 | protein | 115 | 115 |
| small | rprotein30S | `N` | 30S ribosomal protein S14 | protein | 100 | 100 |
| small | rprotein30S | `O` | 30S ribosomal protein S15 | protein | 88 | 88 |
| small | rprotein30S | `P` | 30S ribosomal protein S16 | protein | 81 | 81 |
| small | rprotein30S | `Q` | 30S ribosomal protein S17 | protein | 79 | 79 |
| small | rprotein30S | `R` | 30S ribosomal protein S18 | protein | 66 | 66 |
| small | rprotein30S | `S` | 30S ribosomal protein S19 | protein | 84 | 84 |
| small | rprotein30S | `T` | 30S ribosomal protein S20 | protein | 86 | 86 |
| small | rprotein30S | `U` | 30S ribosomal protein S21 | protein | 70 | 70 |
| large | rRNA23S | `a` | 23S rRNA | rna | 2753 | 2753 |
| large | rRNA5S | `b` | 5S rRNA | rna | 119 | 119 |
| large | rprotein50S | `c` | 50S ribosomal protein L2 | protein | 271 | 271 |
| large | rprotein50S | `d` | 50S ribosomal protein L3 | protein | 209 | 209 |
| large | rprotein50S | `e` | 50S ribosomal protein L4 | protein | 201 | 201 |
| large | rprotein50S | `f` | 50S ribosomal protein L5 | protein | 177 | 177 |
| large | rprotein50S | `g` | 50S ribosomal protein L6 | protein | 176 | 176 |
| large | rprotein50S | `h` | 50S ribosomal protein L9 | protein | 41 | 41 |
| large | rprotein50S | `i` | 50S ribosomal protein L13 | protein | 142 | 142 |
| large | rprotein50S | `j` | 50S ribosomal protein L14 | protein | 123 | 123 |
| large | rprotein50S | `k` | 50S ribosomal protein L15 | protein | 144 | 144 |
| large | rprotein50S | `l` | 50S ribosomal protein L16 | protein | 136 | 136 |
| large | rprotein50S | `m` | 50S ribosomal protein L17 | protein | 118 | 118 |
| large | rprotein50S | `n` | 50S ribosomal protein L18 | protein | 116 | 116 |
| large | rprotein50S | `o` | 50S ribosomal protein L19 | protein | 114 | 114 |
| large | rprotein50S | `p` | 50S ribosomal protein L20 | protein | 117 | 117 |
| large | rprotein50S | `q` | 50S ribosomal protein L21 | protein | 103 | 103 |
| large | rprotein50S | `r` | 50S ribosomal protein L22 | protein | 110 | 110 |
| large | rprotein50S | `s` | 50S ribosomal protein L23 | protein | 93 | 93 |
| large | rprotein50S | `t` | 50S ribosomal protein L24 | protein | 102 | 102 |
| large | rprotein50S | `u` | 50S ribosomal protein L25 | protein | 94 | 94 |
| large | rprotein50S | `v` | 50S ribosomal protein L27 | protein | 78 | 78 |
| large | rprotein50S | `w` | 50S ribosomal protein L28 | protein | 77 | 77 |
| large | rprotein50S | `x` | 50S ribosomal protein L29 | protein | 62 | 62 |
| large | rprotein50S | `y` | 50S ribosomal protein L30 | protein | 58 | 58 |
| large | rprotein50S | `z` | 50S ribosomal protein L32 | protein | 56 | 56 |
| large | rprotein50S | `0` | 50S ribosomal protein L33 | protein | 51 | 51 |
| large | rprotein50S | `1` | 50S ribosomal protein L34 | protein | 46 | 46 |
| large | rprotein50S | `2` | 50S ribosomal protein L35 | protein | 64 | 64 |
| large | rprotein50S | `3` | 50S ribosomal protein L36 | protein | 38 | 38 |
| large | rprotein50S | `4` | 50S ribosomal protein L31 | protein | 60 | 60 |

Total L1 beads: 9978 (budget 15,000).

## 3. The `ribo` frame

Defined as in `PLAN.md` 7.3 and found by pairing, not assumed. The recipe fits Olson base frames (`fitBaseFrame`) to the residues 34 to 36 of the two 7K00 tRNAs (`Y`, `Z`, standard numbering from `standardNumbering`) and to every consecutive mRNA triplet of chain `X`, and keeps the (tRNA, triplet) pairs that are Watson-Crick (section 4). Exactly one adjacent pair of codons (start `s` and `s + 3`) pairs with two tRNAs: tRNA `Z` with author 16 to 18 (`AUG`, P site) and tRNA `Y` with author 19 to 21 (`GUA`, A site); otherwise the recipe stops.

- origin: centroid of the C1′ atoms of `X` author 16 to 18;
- +z: unit vector to the centroid of the C1′ atoms of `X` author 19 to 21 (the two centroids are 17.253 Å apart);
- +x: component, perpendicular to z, of (centroid of all 2753 23S P atoms - origin);
- +y = z × x.

In 7K00 coordinates the origin is (200.473, 222.137, 186.010) Å and the rotation (row-major, axes as columns) is [-0.409463, 0.905658, 0.110108, -0.911846, -0.402338, -0.081610, -0.029610, -0.133818, 0.990564]. All asset coordinates are in this frame; the frame is orthonormal and right-handed.

`frameAtoms(sourcesDir)` (exported for tasks A3 and A4) parses `<sourcesDir>/7K00.cif` itself, runs the same analysis and returns `{ frame: { o, R }, atoms }` with all 141,563 polymer heavy atoms (rRNA, proteins, mRNA, tRNAs, E fragment; 56 chains; no ions, ligands or waters) in the `ribo` frame, in file order, each as `{ chain, labelSeq, authSeq, comp, name, element, x, y, z }` (`chain` = auth_asym_id). Two calls give identical output (checked by hash). Check: the C1′ centroid of `X` 16 to 18 is the origin and that of 19 to 21 is (0, 0, 17.253).

## 4. Superpositions

Rule (`PLAN.md` 7.3, design 3): P atoms of 16S and 23S residues that have the same **author** number (`auth_seq_id`) and the same residue name in both entries (the 7ST2 16S label is the author number minus one, so `label_seq_id` cannot be used); `superposeIterative(mobile, target, { cutoff: 2.0, passes: 2 })`; mobile entry onto 7K00. "n before" is the number of matched pairs, "n after" the pairs within 2.0 Å of the first fit that the final fit uses; RMSD before is the first fit over all pairs, after is the final trimmed fit. Name mismatches are matched numbers whose residue names differ between the two entries (for example a modified nucleotide in one of them; the cause was not analysed further); they are excluded.

| Mobile | Scope | Matched 16S + 23S | n before | n after | Kept | RMSD before (Å) | RMSD after (Å) | Name mismatches excluded | Gate 1.5 Å |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 7ST2 (`3`, `1`) | 16S + 23S | 1507 + 2728 | 4235 | 3881 | 0.916 | 1.238 | 0.734 | 35 | pass |
| 5WE4 (`a`, `A`) | 16S + 23S | 1518 + 2730 | 4248 | 4116 | 0.969 | 1.000 | 0.606 | 21 | pass |
| 7PJV (`a`, `A`) | 16S + 23S (plan rule) | 1519 + 2749 | 4268 | 551 | 0.129 | 5.541 | 1.233 | 4 | numerically pass; see below |
| 7PJV | 23S only (alternative, recorded) | 2749 | 2749 | 2600 | 0.946 | 1.223 | 0.777 | 4 | pass |
| 7PJV | 16S only (alternative, recorded) | 1519 | 1519 | 1158 | 0.762 | 1.828 | 1.085 | 0 | pass |

These numbers reproduce the stage lead's pre-check in the design file (4,235 to 3,881 and 1.24 to 0.73 Å; 4,248 to 4,116 and 1.00 to 0.61 Å; 4,268 to 551 and 5.54 to 1.23 Å). All five records are stored in `source.superpositions`.

7PJV is a rotated (hybrid-state) ribosome: one rigid fit cannot match both subunits. The plan fit "passes" the 1.5 Å gate only because 87 % of the matched atoms are trimmed in the second pass. This is recorded as `keptFraction` 0.129. **Request for the Chief (task A3, EF-G from 7PJV):** decide which subunit to fit; the data suggest 23S only plus a minimum kept fraction (for example 50 %) in the superposition gate.

### E site (7ST2 tRNA `6`)

After the 7ST2 superposition, heavy atoms of nucleotides 75 and 76 of each 7ST2 tRNA are compared with the two nucleotides of 7K00 chain `5` (matched by author number and atom name):

| 7ST2 chain | Description | Atoms | RMSD (Å) | Gate 3.0 Å |
| --- | --- | ---: | ---: | --- |
| `6` | tRNA fMet | 42 | 1.161 | pass (E site) |
| `5` | tRNA Pro | 42 | 46.707 | fail (P site) |

`siteE` therefore comes from chain `6`. (`source.siteChecks.eSite`.)

### 7ST2 register confirmation

The recipe fits base frames for 34 to 36 of every 7ST2 tRNA and for every triplet of the 7ST2 mRNA `4`, keeps the Watson-Crick pairs, and takes the tRNA closest to the `siteP` anticodon origin after superposition as the P-site tRNA: tRNA `5` (tRNA-Pro, anticodon `UGG`) pairs with author 19 to 21 (`CCA`) and its anticodon origin is 0.936 Å from `siteP`. tRNA `6` pairs with author 16 to 18 (`AUG`) and is 16.685 Å from `siteP` (E site). Hence register = author - 19 for chain `4`. The register derivation is by pairing in code; the number 19 is read from the result.

## 5. Anchors

Frames `{ o, R }` in the `ribo` frame; rotations rounded to 6 decimals, origins to 3. Origins (Å):

| Anchor | Origin |
| --- | --- |
| `center` | 48.602, -0.808, -5.464 |
| `siteA` | -5.276, 5.314, 23.242 |
| `siteP` | -6.196, 6.881, 1.787 |
| `siteE` | -7.178, 6.088, -14.850 |
| `siteAT` | -5.144, 5.335, 22.921 |
| `decoding` | 2.194, 0.826, 22.324 |
| `mrnaEntry` | -16.246, 17.907, 21.452 |
| `mrnaExit` | -29.202, -37.296, -32.409 |
| `antiSD` | -24.405, -24.648, -32.248 |
| `smallCenter` | -9.600, -20.584, 15.745 |
| `largeCenter` | 86.406, 12.037, -19.240 |

Derivations:
- `siteP`, `siteA`: `trnaFrame` (the one implementation in `tools/assets/trna.mjs`, `last3` = 76) of 7K00 chains `Z` and `Y`, with the transform into the `ribo` frame. `siteE`: of 7ST2 chain `6` after superposition. `siteAT`: of 5WE4 chain `y` (Phe-tRNA, anticodon `GAA`) after superposition. Placing a `trna-init` or `trna-aa` asset with the anchor reproduces the source coordinates; `siteP` to `siteA` origin distance is 21.5 Å.
- `center`: centroid of all L1 beads, identity rotation. `smallCenter`, `largeCenter`: centroid of the L1 beads of each part, identity rotation.
- `decoding`: centroid of all heavy atoms of 16S A1492, A1493 and G530 (author numbering; the recipe checks the residue names), identity rotation (z = `ribo` z).
- `antiSD`: centroid of all heavy atoms of 7ST2 16S author 1535 to 1540 after superposition (sequence `CCUCCU`, checked); z = unit vector from C1′ of 1535 to C1′ of 1540 (23.2 Å apart, an extended strand); x = component of `ribo` +x perpendicular to z (z makes an angle of 95.6° with +x, above the 10° limit, so the +y alternative of the rule is not used); y = z × x. `synthetic: 0`, source 7ST2 (7K00 16S ends at 1534).
- `mrnaEntry`, `mrnaExit`: the frames of `mrna` registers +15 and -16. Both are synthetic registers, so both anchors carry the metadata `synthetic: 1`.

### siteAP and sitePE: omitted

Rule (`PLAN.md` 7.4): keep `siteAP` (7PJV tRNA `w`) only if its anticodon origin lies within 4.0 Å of the `siteA` origin, and `sitePE` (tRNA `v`) only if within 4.0 Å of the `siteP` origin. Measured anticodon-origin distances (Å) for the three 7PJV fits:

| 7PJV fit | `w` to `siteA` | `v` to `siteP` |
| --- | ---: | ---: |
| 16S + 23S (plan rule, used for the decision) | 5.110 | 6.085 |
| 23S only | 8.723 | 9.170 |
| 16S only | 1.069 | 0.773 |

With the rule as written both distances exceed 4.0 Å, so **`siteAP` and `sitePE` are omitted** and the story interpolates directly between the classic sites (`PLAN.md` 7.4 and 13, pre-approved). The 16S-only fit would satisfy both conditions (the tRNAs ride with the small subunit), but using it would change the plan rule; this is left to the Chief together with the A3 request above. Recorded in `source.siteChecks.hybrid`. The recipe contains the code path that adds the anchors if the condition holds.

## 6. Codon-anticodon pairing (acceptance)

Rule: complementary identities (A-U, G-C), Olson base-frame origins within 2.5 Å, antiparallel base normals (z axes). Position `i` pairs codon nucleotide `i` with tRNA nucleotide `37 - i`. Values from the 7K00 fits (`source.codonPairing`):

| Site | tRNA | Codon (author) | Anticodon 34 to 36 | Position | mRNA | tRNA | Origin distance (Å) | Angle between normals (°, 0 = antiparallel) |
| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: |
| P | `Z` | `AUG` (16 to 18) | `CAU` | 1 | A16 | U36 | 0.200 | 8.2 |
| P | `Z` | | | 2 | U17 | A35 | 0.194 | 10.8 |
| P | `Z` | | | 3 | G18 | C34 | 0.191 | 5.0 |
| A | `Y` | `GUA` (19 to 21) | `UAC` | 1 | G19 | C36 | 0.291 | 14.2 |
| A | `Y` | | | 2 | U20 | A35 | 0.182 | 10.5 |
| A | `Y` | | | 3 | A21 | U34 | 0.613 | 8.5 |

All six pairs pass. The test file repeats the check on the committed files: the `anticodon` track frames of `trna-init` and `trna-aa`, placed with `siteP` and `siteA`, against `mrna` registers 0 to 2 and 3 to 5.

## 7. The `mrna` track

Registers -16 to +15 (32); register 0 = first nucleotide of the P-site codon. Frames map standard base coordinates into the `ribo` frame (base frames fitted by `fitBaseFrame`, all fits usable under the `fitBaseFrame` rule rmsd ≤ 0.5 Å; the 7K00 mRNA fits have rmsd 0.01 to 0.03 Å). `sources` (per register) and `synthetic` have 32 entries; `synthetic` is 0 for fitted registers (any PDB) and 1 for synthetic ones (DEC-008).

| Registers | Source | `synthetic` | Bases |
| --- | --- | --- | --- |
| -16, -15 | synthetic | 1 | `NN` |
| -14 to -4 (11) | 7ST2 chain `4` (register = author - 19) | 0 | `AGGAGGUAAAA` |
| -3 to +8 (12) | 7K00 chain `X` (register = author - 16) | 0 | `AAAAUGGUAUAA` |
| +9 to +15 (7) | synthetic | 1 | `NNNNNNN` |

Synthetic registers extend from the nearest fitted register (-14 for -16 and -15; +8 for +9 to +15) by single-strand A-form steps: per step the origin moves by 2.81 Å along the local z axis and the frame rotates by 32.73° about local z. The sign is chosen so that a step toward increasing register follows the local origin difference of the last two fitted registers (dot product with the local z axis); it is +1 at both ends, and steps toward decreasing register use the opposite sense. The straight continuation is a placeholder: the real mRNA path is not modelled there.

The 7ST2 chain fills registers -14 to -4, where 7K00 has no mRNA. Where both entries model the same register (-3 to +4) the 7K00 frame is used. Deviation of the 7ST2 frame (after superposition) from the 7K00 frame:

| Register | Origin deviation (Å) | Rotation deviation (°) |
| ---: | ---: | ---: |
| -3 | 2.027 | 31.1 |
| -2 | 5.083 | 44.2 |
| -1 | 5.295 | 69.7 |
| +0 | 1.241 | 11.0 |
| +1 | 0.858 | 6.0 |
| +2 | 0.769 | 4.6 |
| +3 | 5.195 | 70.4 |
| +4 | 3.143 | 41.8 |

Interpretation: the two entries hold different mRNA sequences at the E-site codon (7K00 `AAA`, 7ST2 `AUG`) and the mRNA is kinked between codons, so the deviation is large at the codon boundaries (registers -2, -1, +3, +4) and small inside the P-site codon (registers 0 to 2: 1.2, 0.9, 0.8 Å). The track mixes two physical mRNAs; its bases at registers -14 to -4 are those of 7ST2, at -3 to +8 those of 7K00. Consumers that need a gene-specific sequence must replace the bases (the frames are base-independent only approximately). Because the origin of the standard base frame lies about 5 Å from C1′ on the base side, frame origins of consecutive nucleotides are 13 to 16 Å apart at the codon boundaries (C1′ to C1′ 7.8 and 8.8 Å at the 7K00 boundaries -1/0 and 2/3); consecutive-register origin spacing (`source.mrna.originSpacingA`) is 3.2 to 5.9 Å inside the 7K00 codons, 2.81 Å in the synthetic stretches, up to 11.7 and 9.8 Å at the end of the Shine-Dalgarno stretch of 7ST2 (registers -9/-8 and -8/-7), and 16.5 Å across the 7ST2/7K00 junction (-4/-3, the E/P boundary kink).

## 8. Levels of detail

### L0 (envelope per part)

One envelope per part from all its L1 beads (P and Cα). Requested: Gaussian density `sigma = 5 Å`, grid `spacing = 4 Å`, at most 30,000 triangles per part, at least 95 % of the L1 beads inside by ray parity (`envelope`, `tools/lib/surface.mjs`). The 30,000-triangle cap made the builder coarsen the grid for `large` from 4 to 4.5 Å (0.5 Å steps); `small` stayed at 4 Å. The 5 Å fallback of the design was not needed.

| Part | Triangles | Vertices | sigma (Å) | Spacing used (Å) | L1 beads inside |
| --- | ---: | ---: | ---: | ---: | ---: |
| `small` | 21,972 | 10,988 | 5 | 4.0 | 0.9504 |
| `large` | 26,092 | 13,076 | 5 | 4.5 | 0.9519 |

Total 48,064 triangles (budget 70,000). Both meshes are closed with outward winding (`meshStats`, checked by the recipe and the tests).

### L1
P beads for RNA (kind 1) and Cα beads for protein (kind 0), one per residue, grouped by chain in the order of the chain table: 9,978 beads (1,519 + 2,753 + 119 = 4,391 P beads; 5,587 Cα beads).

### L2
Sites: `decoding` and `ptc`, 12 Å each (the figures in this paragraph are for the decoding site alone; section 11 gives the totals with `ptc`). The L2 builder takes the site list `[{ anchor, radius }]`: heavy atoms of whole rRNA and protein residues (both parts; mRNA and tRNAs are excluded) with any atom within the radius of the anchor origin, deduplicated across sites, plus Mg2+ ions within 8 Å of any site origin. Result: 307 atoms (334 bonds) in 20 residues: ten 16S nucleotides (chain `A`: 517, 518, 519, 528, 529, 530, 1491, 1492, 1493, 1494; 219 atoms), nine residues of protein S12 (chain `L`; 66 atoms) and one 23S nucleotide (chain `a`; 22 atoms). No Mg2+ lies within 8 Å of the decoding origin. The count is small because the decoding origin lies in the cleft where the mRNA and the A- and P-site tRNAs sit (150 of the 325 polymer atoms in the sphere belong to chains `X` and `Y`). Bonds: covalent radii (C 0.76, N 0.71, O 0.66, S 1.05, P 1.07 Å, tolerance 0.45 Å) inside a residue, plus the peptide C-N and the phosphodiester O3′-P bond between consecutive residues. Ion atoms (if any) take the chain index of the nearest polymer heavy atom; the `auth_asym_id` of the 7K00 ions (mostly the rRNA chains `A` and `a`, a few `b`, `c`, `d`, `z`) is not used, so that every L2 chain index refers to the chain table in the same way.

## 9. Budgets measured

| Item | Budget (`PLAN.md` 7.5) | Measured |
| --- | --- | --- |
| L0 triangles, total | 70,000 | 48,064 |
| L1 beads | 15,000 | 9,978 |
| L2 atoms | 4,000 | 756 (307 with the decoding site only) |
| File size | 1,200,000 bytes | 725,027 bytes (with step 3) |

Largest blocks of the JSON (bytes): `lod0` 577,330; `lod1` 106,482; `source` 11,484; `chains` 6,788; `lod2` 5,187; `tracks` 4,392; `anchors` 1,189.

## 10. Interpretations and deviations

1. The P- and A-site codons are found by geometric pairing in code, not hard-coded; the result equals the plan's expectation (`AUG` 16 to 18, `GUA` 19 to 21).
2. rRNA matching uses author numbers and equal residue names; residues with different names (mostly modified nucleotides) are excluded and counted.
3. The 7PJV decision uses the 16S + 23S fit as written; the two single-subunit fits are recorded for the Chief (section 4 and 5).
4. `large` L0 spacing is 4.5 Å, produced by the 30,000-triangle cap of the design (section 8).
5. Bounds (`center`, `radius`, `size`) cover the L1 beads and the L0 vertices; `bounds.center` equals the `center` anchor.
6. `mrnaEntry` and `mrnaExit` are marked `synthetic: 1` and `antiSD` `synthetic: 0` (contract allows optional anchor metadata).
7. Extra, optional fields not in the contract: `chains[].modelled`, `lod0.parts[].sigma/spacing/beadsInside` (as for RNAP), and in `source`: `additionalSources`, `frame`, `superpositions`, `siteChecks`, `codonPairing`, `mrna`, `antiSD`.
8. `assets/manifest.json`: a full `node tools/build-assets.mjs` orders entries by recipe file name, so `ribosome-70s` is listed before `rnap-ec`; this is the order `--check` expects.
9. The 7ST2 mRNA registers -14 to -4 and the 7K00 registers -3 to +8 come from two different mRNAs and structures (section 7).
10. Scientific limits: positions at registers -16, -15 and +9 to +15 are an A-form placeholder, not data; `antiSD` and `siteE`/`siteAT` come from other structures placed by a rigid fit of 0.6 to 0.7 Å RMSD over the rRNA, so local differences between entries (for example subunit rotation) are not corrected.

## 11. Tunnel (step 3)

Algorithm (design 5.6, `PLAN.md` 7.4), implemented in `computeTunnel` and `tunnelProfile` of `tools/assets/ribosome.mjs`; deterministic (ties broken by voxel index).

1. Grid: 140 Å cube, 1.0 Å voxels (141 per side), centred on `ptc` (O3′ of A76 of 7K00 chain `Z`, ribo frame [74.135, 9.871, -10.315]). Atoms: the 86,447 50S heavy atoms returned by `largeSubunitAtoms` (23S, 5S, L proteins; no ions, waters or ligands). A voxel is blocked when its centre is within 3.0 Å of any of them. The grid stores the exact distance to the nearest atom centre, capped at 10 Å (cap above the 8 Å solvent threshold).
2. Target: centroid of the Cα atoms of uL23 (chain `s`) and uL29 (chain `x`) = [123.583, -48.627, -55.828]. The nearest unblocked voxel with a solvent-side ray (162 Fibonacci directions, 1 Å samples read from the nearest voxel, all unblocked, every sample beyond 8 Å from the voxel with clearance above the threshold) was searched among the 25,738 unblocked voxels within 30 Å of the centroid. Threshold used: **8 Å (no relaxation needed)**. Target voxel [130.135, -54.129, -55.315] (clearance 3.096 Å, 96.213 Å from `ptc`, 8.597 Å from the centroid).
3. Start: nearest unblocked voxel to `ptc` + 5 Å along ribo −x: [69.135, 9.871, -10.315] (clearance 5.352 Å, 5 Å from `ptc`). Dijkstra over 26 neighbours, cost = step length / clearance(destination)². The route has 117 voxels.
4. Three Chaikin passes (end points kept), resampled at 1.0 Å arc length, then rounded to the 0.05 Å storage step so that the anchors and the recorded numbers refer to the stored points.
5. Gates: length 75 to 110 Å; clearance of every point beyond the first 6 Å of arc ≥ 3.0 Å, using exact distances to atom centres.

### Result: route truncated at the tunnel mouth (recorded deviation from `PLAN.md` 7.4 step 2)

The target defined in `PLAN.md` 7.4 lies beside uL23/uL29, about 45 Å along the subunit surface past the tunnel mouth. The full route is 145.898 Å long (gate 75 to 110 Å). The route is therefore truncated at the first solvent-side point after 60 Å of arc, tested with the target rule (162 Fibonacci rays reaching the cube boundary, every 1 Å sample unblocked, every sample beyond 8 Å with clearance above 8 Å) using exact clearances from a cell list. The mouth is at arc 86.712 Å, point [134.7, -24.7, -32.3]; it becomes `tunnelExit`. The straight-line §13 fallback was rejected because it crosses rRNA (minimum clearance 0.156 Å).

Final path: 88 points, length **86.712 Å** (gate 75 to 110 Å), `synthetic: 0`. Exact minimum clearance beyond the first 6 Å: **3.659 Å** at arc 6.991 Å (gate 3.0 Å); maximum 8.862 Å. The clearance at every path point (1 Å steps, rounded to 0.01 Å) is stored in `source.tunnel.clearanceProfile`; the full untruncated route's length and minimum are in `source.tunnel.fullRoute`. Clearance is the distance to atom centres, not a pore radius.

### Sanity check (not a gate)

On the final path, uL4 (chain `e`): closest Cα residue 65, 7.961 Å from the path at arc 36.852 Å, path clearance there 5.607 Å. uL22 (chain `r`): closest Cα residue 91, 7.029 Å, arc 37.878 Å, clearance 5.849 Å. The tunnel length to the mouth (86.712 Å) lies in the expected 80 to 100 Å range. Not compared with a reference tunnel model. An earlier draft of this section quoted about 1.9 Å near uL22; that value came from the rejected straight line, not the route.

### Anchors and L2

`ptc`: o = O3′ of A76 of chain `Z`; z = first path segment; x = perpendicular component of ribo +x (design 5.4); y = z × x. `tunnelExit`: o = the mouth (last path point); z = last segment of the truncated path. Both orthonormal.

L2 now has two sites, `decoding` and `ptc` (12 Å each; deduplicated; Mg²⁺ within 8 Å of a site origin: none for either site). Totals: 756 atoms (827 bonds, 41 residues; 175 atoms within 12 Å of the decoding origin, 222 within 12 Å of the `ptc` origin, none in both; the rest are the remaining atoms of whole residues).

### Measured

Build time of the whole ribosome recipe about 30 s (tunnel search about 3 s). File size: see section 9.
