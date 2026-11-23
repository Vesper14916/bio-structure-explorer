# Scientific Basis, Sources, and Simplifications

Updated: 2026-11-16
Owner: Science & Simulation Agent (Agent 1) / Integration Owner (Agent 0)

---

## 1. Nucleic Acid Geometry (`B-DNA` vs `A-RNA`)

Ideal B-DNA and A-RNA duplexes (`js/science/templates.js`, `js/science/assembly.js`, `docs/ASSETS.md` rows A01–A02) and the experimental B-DNA dodecamer reference in `X-ray` mode (`PLAN.md` §7.2) are built from heavy-atom coordinates (no hydrogens; hydrogen bonds are drawn between heavy donor and acceptor atoms):

| Feature | B-DNA (`HELIX_B`) | A-RNA (`HELIX_A`) | Literature / Project Source |
| :--- | :--- | :--- | :--- |
| **Base reference frame** | Planar heavy atoms in `z = 0` | Planar heavy atoms in `z = 0`; Uracil (`U`) lacks `C7` methyl of Thymine (`T`) | Olson et al. (2001), *J. Mol. Biol.* **313**, 229–237 (`doi:10.1006/jmbi.2001.4987`); `docs/ASSETS.md` A01–A02 |
| **Sugar pucker & 2′ group** | $C2'\text{-endo}$ deoxyribose (no $O2'$); backbone coordinates derived from X-ray PDB `1BNA` (1.9 Å) via `tools/build-templates.mjs` | $C3'\text{-endo}$ ribose with explicit **$2'\text{-OH}$ (`O2'`)** bonded to $C2'$ ($1.413\,\text{Å}$) | Drew et al. (1981), *PNAS* **78**, 2179–2183 (`doi:10.1073/pnas.78.4.2179`, PDB `1BNA`); Gelbin et al. (1996), *J. Am. Chem. Soc.* **118**, 519–529; Parkinson et al. (1996), *Acta Cryst.* **D52**, 57–64 |
| **Helical parameters** | Rise $3.38\,\text{Å}$, twist $34.29^\circ$ ($10.5\,\text{bp/turn}$, pitch $35.5\,\text{Å}$) | Rise $2.81\,\text{Å}$, twist $32.73^\circ$ ($11.0\,\text{bp/turn}$, pitch $30.9\,\text{Å}$), base-pair inclination $\sim 16^\circ$, $x\text{-displacement} \approx -4.4\,\text{Å}$ | Arnott et al. (1972), *J. Mol. Biol.* **90**, 269; Schneider et al. (1997), *Biopolymers* **42**, 113; `docs/ASSETS.md` A01–A02 |
| **Base pairing & groove readout** | Canonical `A·T` (2 H-bonds), `G·C` (3 H-bonds); major/minor groove H-bond donor/acceptor pattern | Canonical `A·U` (2 H-bonds), `G·C` (3 H-bonds), plus **`G·U` wobble** (`G-O6···U-N3`, `G-N1···U-O2`) | Seeman, Rosenberg & Rich (1976), *PNAS* **73**, 804–808 (`doi:10.1073/pnas.73.3.804`); Varani & McClain (2000), *EMBO Rep.* **1**, 18–23 (`doi:10.1093/embo-reports/kvd001`) |

---

## 2. Nearest-Neighbor Thermodynamics (`js/science/thermo.js`)

Melting curves and per-pair opening probabilities in `Melt` mode are solved by an exact nearest-neighbor transfer-matrix helix–coil model (`js/science/thermo.js`, `js/sim/melt.js`) at $1\,\mu\text{M}$ total strand concentration:

- **DNA Duplexes (`nucleicAcid: 'dna'`):**
  - Unified nearest-neighbor $\Delta H^\circ$ and $\Delta S^\circ$ parameters of **SantaLucia (1998)**, *PNAS* **95**, 1460–1465 (`doi:10.1073/pnas.95.4.1460`), with $\text{Na}^+$ salt correction $\Delta S^\circ([\text{Na}^+]) = \Delta S^\circ(1\,\text{M}) + 0.368 \cdot N_{\text{bp}} \cdot \ln[\text{Na}^+]$.
- **RNA Duplexes (`nucleicAcid: 'rna'`):**
  - Nearest-neighbor $\Delta H^\circ$ and $\Delta S^\circ$ parameters of **Xia et al. (1998)** (*Biochemistry* **37**, 14719–14735, `doi:10.1021/bi9809425`) and **Turner & Mathews (2010)** (*Nucleic Acids Res.* **38**, D280–D282, `doi:10.1093/nar/gkp892`). Because A-form RNA base stacking and $2'\text{-OH}$ hydration stabilize the duplex, an RNA duplex of identical sequence ($T\to U$) exhibits a significantly higher $T_m$ than its B-DNA counterpart.

---

## 3. Bacterial Gene Expression Scenario (`js/science/scenario.js` & `js/science/genetic-code.js`)

### 3.1 Construct v3 (248 bp True-Scale Teaching Gene)

Construct v3 (`TRUE_SCALE_GENE_CONSTRUCT`, `version: 3`, `PLAN.md` §5.1) is a synthetic *Escherichia coli* gene carrying canonical bacterial transcription and translation signals. Coding strand coordinates are 0-based, half-open `[start, end)` in the $5'\to 3'$ direction, with the transcription start site (`+1`) at DNA index `45`:

| Region id | DNA Range | Length | Sequence (coding strand, $5'\to 3'$) |
| :--- | :--- | :--- | :--- |
| `upstream` | `[0, 10)` | 10 | `CGACTGCATC` |
| `minus35` | `[10, 16)` | 6 | `TTGACA` |
| `spacer` | `[16, 33)` | 17 | `GCTAGCTCAGTCCTAGG` |
| `minus10` | `[33, 39)` | 6 | `TATAAT` |
| `discriminator` | `[39, 45)` | 6 | `GCTAGC` |
| `utrLeader` | `[45, 56)` | 11 | `ACTCTAACTAT` |
| `sd` | `[56, 62)` | 6 | `AGGAGG` |
| `sdSpacer` | `[62, 69)` | 7 | `TAACATA` |
| `orf` | `[69, 189)` | 120 | `ATGGCTGAATTTAAAGGTTCTGACTACCAAGCTACCCTGGTTCGTAACATCCACTGGGAACTGACTAAAGTTATGGACCGCTGCACCAACCTGGCGGAAAAGATCCACGGCTCTTACCTG` |
| `stop` | `[189, 192)` | 3 | `TAA` |
| `linker` | `[192, 196)` | 4 | `ACTC` |
| `termStem5` | `[196, 204)` | 8 | `GGCGCCTG` |
| `termLoop` | `[204, 208)` | 4 | `GAAA` |
| `termStem3` | `[208, 216)` | 8 | `CAGGCGCC` |
| `uTract` | `[216, 224)` | 8 | `TTTTTTTT` |
| `downstream` | `[224, 248)` | 24 | `GACTCAGTCAGCAGTCGATGCAGC` |

- **Transcript (`[45, 224)`, 179 nt):** `ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUACCCUGGUUCGUAACAUCCACUGGGAACUGACUAAAGUUAUGGACCGCUGCACCAACCUGGCGGAAAAGAUCCACGGCUCUUACCUGUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU` (mRNA index $j$ maps to DNA index $j + 45$).
- **mRNA landmarks:** Shine–Dalgarno `[11, 17)` (`AGGAGG`), start codon `[24, 27)` (`AUG`), stop codon `[144, 147)` (`UAA`), intrinsic terminator stem $5'$ `[151, 159)` / `GAAA` tetraloop `[159, 163)` / stem $3'$ `[163, 171)`, U-tract `[171, 179)`.
- **Peptide (40 residues, $N\to C$):** `fMet-A-E-F-K-G-S-D-Y-Q-A-T-L-V-R-N-I-H-W-E-L-T-K-V-M-D-R-C-T-N-L-A-E-K-I-H-G-S-Y-L`. The first 11 sense codons preserve the Round 1 fixture sequence; all 19 non-proline amino acids appear at least once, and proline is omitted because its cyclic side chain cannot close under the fixed extended backbone ($\varphi = -139^\circ$). GC content is 49% in the ORF (49.2%) and 48% overall (48.4%).
- **Design invariants:** no in-frame stop before codon 41; exactly one `AGGAGG` motif in the 248-bp duplex; no run of $\ge 4$ `T` or $\ge 6$ `A` in the ORF; internal `AUG` at codon 25 is translated as `Met` rather than `fMet`.

#### Codon Table (`codonTable(TRUE_SCALE_GENE_CONSTRUCT)`)

Anticodons below are written $5'\to 3'$ as exact Watson–Crick complements (wobble pairing and modified nucleosides are disclosed, not modelled; `codonTable()` supplies the antiparallel $3'\to 5'$ alignment in `anticodon3to5`, and `'RF1'` for stop):

| # | Codon | aa | Anticodon ($5'\to 3'$) | # | Codon | aa | Anticodon ($5'\to 3'$) | # | Codon | aa | Anticodon ($5'\to 3'$) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `AUG` | `fMet` | `CAU` | 15 | `CGU` | `Arg` | `ACG` | 29 | `ACC` | `Thr` | `GGU` |
| 2 | `GCU` | `Ala` | `AGC` | 16 | `AAC` | `Asn` | `GUU` | 30 | `AAC` | `Asn` | `GUU` |
| 3 | `GAA` | `Glu` | `UUC` | 17 | `AUC` | `Ile` | `GAU` | 31 | `CUG` | `Leu` | `CAG` |
| 4 | `UUU` | `Phe` | `AAA` | 18 | `CAC` | `His` | `GUG` | 32 | `GCG` | `Ala` | `CGC` |
| 5 | `AAA` | `Lys` | `UUU` | 19 | `UGG` | `Trp` | `CCA` | 33 | `GAA` | `Glu` | `UUC` |
| 6 | `GGU` | `Gly` | `ACC` | 20 | `GAA` | `Glu` | `UUC` | 34 | `AAG` | `Lys` | `CUU` |
| 7 | `UCU` | `Ser` | `AGA` | 21 | `CUG` | `Leu` | `CAG` | 35 | `AUC` | `Ile` | `GAU` |
| 8 | `GAC` | `Asp` | `GUC` | 22 | `ACU` | `Thr` | `AGU` | 36 | `CAC` | `His` | `GUG` |
| 9 | `UAC` | `Tyr` | `GUA` | 23 | `AAA` | `Lys` | `UUU` | 37 | `GGC` | `Gly` | `GCC` |
| 10 | `CAA` | `Gln` | `UUG` | 24 | `GUU` | `Val` | `AAC` | 38 | `UCU` | `Ser` | `AGA` |
| 11 | `GCU` | `Ala` | `AGC` | 25 | `AUG` | `Met` | `CAU` | 39 | `UAC` | `Tyr` | `GUA` |
| 12 | `ACC` | `Thr` | `GGU` | 26 | `GAC` | `Asp` | `GUC` | 40 | `CUG` | `Leu` | `CAG` |
| 13 | `CUG` | `Leu` | `CAG` | 27 | `CGC` | `Arg` | `GCG` | 41 | `UAA` | `Stop` | — (`RF1`) |
| 14 | `GUU` | `Val` | `AAC` | 28 | `UGC` | `Cys` | `GCA` | | | | |

### 3.2 Biological Invariants and Round 1 Compatibility
1. **Transcription ($5' \to 3'$):** The transcript equals the coding strand over DNA `[45, 224)` with `T -> U` and is the reverse complement of the template strand over that range. Transcription initiates at `+1` (index `45`, downstream of canonical `-35` `TTGACA`, 17-bp spacer, `-10` `TATAAT`, and 6-bp discriminator) and ends at the last `U` of the intrinsic terminator U-tract (ending strictly at the final `U` is a simplification).
2. **Translation Initiation (`fMet` vs `Met`):** The 30S subunit recognizes Shine–Dalgarno `AGGAGG` (`mRNA [11, 17)`), spaced 7 nt upstream of `AUG` (`mRNA [24, 27)`). Codon 1 recruits initiator $\text{fMet-tRNA}^{\text{fMet}}$ directly to the P-site; internal `AUG` at codon 25 recruits elongator $\text{Met-tRNA}^{\text{Met}}$ via the A-site.
3. **Elongation and Termination:** Sense codons 2–40 translocate by 3 nt per cycle ($5'\to 3'$ along mRNA); ochre stop `UAA` (codon 41, `mRNA [144, 147)`) is recognized by release factor `RF1` in the A-site and adds no amino acid.
4. **Round 1 48-bp Fixture (`DEFAULT_GENE_CONSTRUCT`):** The compact 48-bp construct (`js/science/genetic-code.js`, 44-nt mRNA, 11 sense codons + `UAA`, abbreviated `TATA` promoter, 2-nt SD spacer, no terminator) is kept in `js/science/genetic-code.js` for the science tests only. Since gate G4 (R3-INT4) no mode uses it: Express runs on Construct v3.

---

## 4. Amino-Acid Residues, Nascent Peptide, and NTP Substrates (`js/science/residues.js`, `peptide.js`, `ntp.js`)

All 20 required heavy-atom residue templates are implemented in `js/science/residues.js` (`RESIDUE_CODES`): the 19 non-proline standard amino acids (`ALA`, `ARG`, `ASN`, `ASP`, `CYS`, `GLN`, `GLU`, `GLY`, `HIS`, `ILE`, `LEU`, `LYS`, `MET`, `PHE`, `SER`, `THR`, `TRP`, `TYR`, `VAL`) plus N-formylmethionine (`FME`). Proline is intentionally excluded because its pyrrolidine ring cannot close in the fixed extended backbone ($\varphi = -139^\circ$).

- **Backbone and chirality:** Built from ideal Engh & Huber (1991) bond lengths (`N-CA` $1.458\,\text{Å}$, `CA-C` $1.525\,\text{Å}$, `C=O` $1.231\,\text{Å}$, peptide `C-N` $1.329\,\text{Å}$) and angles (`N-CA-C` $111.0^\circ$, `CA-C-N` $116.2^\circ$, `C-N-CA` $121.7^\circ$, `CA-C-O` $120.8^\circ$, `N-CA-CB` $110.5^\circ$). All 19 residues carrying `CB` use `C-N-CA-CB = -122.5°` (giving L-configuration chiral volumes of $+2.48\text{ to }+2.54\,\text{Å}^3$, verified by both signed volume and the CORN rule). Branched side chains enforce exact IUPAC stereochemistry: `THR` `CB` is $(3R)$, `ILE` `CB` is $(3S)$, `VAL` `CG1` is *pro-R*, and `LEU` `CD1` is *pro-R*.
- **Side-chain geometry and ring closures:** Side chains use rounded Engh & Huber (1991) mean bond lengths and angles (entered from published tables, not machine-extracted). `PHE` and `TYR` use regular planar hexagons ($1.385\,\text{Å}$, $120^\circ$). `HIS` models the neutral $N^{\delta 1}\text{-H}$ tautomer (heavy atoms only, no hydrogens) as a strictly planar 5-membered imidazole ring whose closure bond `CD2-NE2` measures $1.368\,\text{Å}$ against the $1.374\,\text{Å}$ target ($\Delta = 0.006\,\text{Å}$). `TRP` models the fused 5+6 indole ring as strictly planar with closures `CD2-CE2` ($1.409\,\text{Å}$ vs $1.409\,\text{Å}$) and `CZ3-CH2` ($1.403\,\text{Å}$ vs $1.400\,\text{Å}$). Both `MET`/`FME` (`SD`) and `CYS` (`SG`) map to element `'S'`.
- **Rotamers and steric clearance:**
  - The 11 original Round 2 templates (`GLY`, `ALA`, `SER`, `ASP`, `GLU`, `GLN`, `LYS`, `MET`, `FME`, `PHE`, `TYR`) preserve their Round 2 extended torsions ($\chi_1 = 180^\circ$; `PHE`/`TYR` $\chi_2 = 90^\circ$; `ASP` $\chi_2 = \pm 90^\circ$).
  - The 9 Round 3 additions use standard extended Lovell et al. (2000) rotamers: $\chi_1 = 180^\circ$ for $\beta$-branched residues (`VAL`, `THR`, `ILE` $\chi_2 = 180^\circ$) and $\chi_1 = -60^\circ$ for non-$\beta$-branched residues (`CYS` $-60^\circ$; `LEU` $-60^\circ/180^\circ$; `ASN` $-60^\circ/-80^\circ$; `ARG` $-60^\circ/180^\circ/-60^\circ/180^\circ$, avoiding a $1.98\,\text{Å}$ `MET24.CE···ARG26.NE` contact that occurs at $\chi_3 = 180^\circ$; `TRP` $-60^\circ/95^\circ$).
  - Exception: `HIS` uses the extended `t-80` rotamer ($\chi_1 = 180^\circ, \chi_2 = -80^\circ$, matching `PHE`/`TYR` $\chi_1 = 180^\circ$) because $\chi_1 = -60^\circ$ clashes ($\le 2.48\,\text{Å}$ for all $\chi_2$) with `LYS33.CE` (existing $\chi_1 = 180^\circ$ template) in the extended 40-residue Construct v3 peptide.
  - Across all 20 templates, every bond (including ring closures) is within $0.006\,\text{Å}$ of its target, all intra-residue heavy-atom pairs separated by $\ge 3$ bonds are $\ge 2.69\,\text{Å}$, and the full 40-residue Construct v3 peptide (`buildPeptide`, $\varphi = -139^\circ, \psi = 135^\circ, \omega = 180^\circ$, optional C-terminal `OXT`) has zero inter-residue contacts below $2.6\,\text{Å}$ outside bonded and 1–3 pairs (minimum $\ge 2.66\,\text{Å}$).
- **Simplifications and NTP substrates:** There are no hydrogens, no rotamer sampling, no side-chain packing, and no folding. Nucleoside triphosphates (`js/science/ntp.js`) extend the A-RNA ribonucleotide template with an idealised extended triphosphate (bridging `P-O` $1.61\,\text{Å}$, terminal $1.49\,\text{Å}$, `O-P-O` $109.5^\circ$, `P-O-P` $130^\circ$), without $\text{Mg}^{2+}$ ions or hydrogens; the $\beta$- and $\gamma$-phosphates form the pyrophosphate (`PPi`) leaving group. The triphosphate conformation is an idealisation, not the conformation bound in RNA polymerase.

Integration check (2026-11-17): the original 11 template geometries were compared with the protein chains of PDB 6ALF. All 2,930 residues with a $\text{C}\beta$ have positive chiral volume (mean $2.494\,\text{Å}^3$), matching the templates' L configuration, and every template bond is within $0.020\,\text{Å}$ of the observed mean for that bond. Side-chain values were entered from Engh & Huber (1991) tables as recalled and have not been machine-checked against the paper itself.

---

## 5. Crowding (`js/scene/crowd.js`, task R3-R4)

The scene sits in a patch of cytoplasm so that the gene, RNA polymerase and ribosome are seen among neighbouring molecules (PLAN.md §1, §4.3).

- **Box and counts.** Crowders are placed in a 1600 × 1000 × 1000 Å box (1.6 × 10⁻³ µm³) centred on the gene midpoint, which is the world origin. The gene axis is the world x axis. Counts are `round(density × volume)`:

  | Crowder | Asset | Density (µm⁻³, illustrative) | Instances at `high` | `medium` | `low` |
  | --- | --- | --- | --- | --- | --- |
  | Ribosome | `ribosome-70s` | 25,000 | 40 | 20 | 0 |
  | EF-Tu | `ef-tu` | 60,000 | 96 | 48 | 0 |
  | RNA polymerase (holoenzyme) | `rnap-holo` | 3,000 | 5 | 3 | 0 |

- **Provenance of the densities.** The densities are **illustrative**. They are chosen to be of the order reported for a fast-growing *E. coli* cell (tens of thousands of ribosomes and a few thousand RNA polymerase molecules per cell of about 1 µm³), but no BioNumbers identifier was verified for them in this round, so none is cited.
- **Simplifications.** EF-Tu is drawn alone: the ternary complex EF-Tu·GTP·aa-tRNA is not modelled as a crowder. Every instance uses the machine's L0 envelope in its structure frame, with a random orientation, and the crowd is static: crowders do not move, rotate or exchange with the actors in the story.
- **Exclusions.** Each instance's bounding sphere (the asset's `bounds.radius`) stays outside a capsule of radius 180 Å around the gene axis (length: 248 bp × 3.38 Å) and outside a sphere of radius 320 Å around the ribosome's centre in its Step by step layout pose (`RIBO_LAYOUT`). The centre of each crowder lies inside the box, so large crowders near the box faces may protrude from it. The minimum distance between two centres is 0.8 × the sum of the two bounds radii, so neighbouring envelopes may overlap by up to 20 % of their radii (the bounding spheres are looser than the shapes).
- **Determinism.** Placement is random sequential addition with a seeded PRNG (`mulberry32`, default seed 19). `medium` is the first half of each class of `high`, so changing quality tier never reshuffles the remaining crowders. Tests: `tests/crowd.test.mjs`.

---

## 6. Gene-Expression Mechanism and Simplifications (`PLAN.md` §5.2, §5.4, `DEC-030`)

Helix `Express` mode animates local bacterial gene expression on Construct v3 (§3) at true scale (`1 Å = 1 scene unit`, `PLAN.md` §2 D2) using rigid experimental *E. coli* cryo-EM macromolecular structures and procedural all-heavy-atom nucleic acids, NTP/PPi substrates, and nascent peptide (§4). Every mechanistic step and its disclosed simplification follow `PLAN.md` §§5.2, 5.4 and `DEC-030`:

| Step | Modelled as (`PLAN.md` §5.2, §5.4) | Simplification disclosed | Source / Asset Doc |
| :--- | :--- | :--- | :--- |
| **Promoter search** | σ⁷⁰ holoenzyme approaches along a straight path from 400 Å (`DEC-030`) and binds `-35` (`TTGACA`) / `-10` (`TATAAT`) | Real promoter search combines 3D diffusion and 1D sliding along DNA | `PLAN.md` §5.2; `docs/assets/rnap.md` |
| **Open complex (RPo)** | DNA melts registers `-11…+2` (13 bp) and upstream DNA bends to the `6CA0` open-promoter track geometry superposed onto the `6C9Y` holoenzyme (`DEC-023`) | Intermediates between closed (RPc) and open (RPo) complexes are omitted; disordered template bubble `-10…0` and `+1` non-template are interpolated (`synthetic = 1`) | `PLAN.md` §5.2; `DEC-023`; `docs/assets/rnap.md` §3; Narayanan et al. (2018), *J. Biol. Chem.* **293**, 7367–7375 (`doi:10.1074/jbc.RA118.002161`) |
| **Transcription initiation** | NTPs 1–3 enter through the secondary channel (`ntpEntry`, ray-cast `synthetic = 1`); each addition releases pyrophosphate (`PPi`) | Abortive initiation is omitted; idealised extended NTP geometry without catalytic $\text{Mg}^{2+}$ dynamics (§4) | `PLAN.md` §5.2; `docs/assets/rnap.md` §4 |
| **Promoter escape** | σ⁷⁰ is released in a two-stage local-frame motion (`DEC-027`) overlapping nucleotides 11–12 while tracks blend from RPo (`6CA0`) to elongation (`6ALF`) | In cells, σ⁷⁰ is frequently retained on elongating RNAP well beyond nucleotide 12 | `PLAN.md` §5.2, §5.4; `DEC-027` |
| **Transcription elongation** | 1 bp per step on `6ALF` tracks with a ~9-bp RNA·DNA hybrid (`registers -9…-1`); transcription bubble re-closes behind RNAP | Pausing and backtracking are omitted; elongation runs at a teaching speed (`0.15 s/nt`, ~6.7 nt/s in `elongate-tx`) rather than ~40–80 nt/s *in vivo* | `PLAN.md` §5.2, §6.1; `docs/assets/rnap.md` §1; Kang et al. (2017), *eLife* **6**, e25478 (`doi:10.7554/eLife.25478`); Bremer & Dennis (2008), *EcoSal Plus* **3** (`doi:10.1128/ecosal.5.2.3`) |
| **DNA rotation** | DNA rotates about its helical axis as it threads through RNAP while RNAP stays upright | Kinematically equivalent to RNAP tracking the helical groove; DNA supercoiling (e.g. twin-domain supercoiling) is not modelled | `PLAN.md` §5.2; `DEC-030` |
| **Intrinsic termination** | GC-rich 8-bp hairpin stem + `GAAA` tetraloop folds progressively at the `7YPA` exit-channel pose (`hairpin` anchor) as the 8-U tract is transcribed; RNA and DNA release and DNA relaxes | Hairpin orientation follows the `7YPA` nucleation complex; release is shown as a single step; termination strictly at the final `U` is a simplification (§3.2) | `PLAN.md` §5.2; `docs/assets/rnap.md` §5; You et al. (2023), *Nature* **613**, 783–789 (`doi:10.1038/s41586-022-05604-1`) |
| **Translation initiation** | Canonical order: `30S·IF1·IF3` binds Shine–Dalgarno `AGGAGG` (`antiSD` from `7ST2`); `IF2` delivers `fMet-tRNA` directly to the P site (`AUG`); `50S` joins; `IF3` departs, then `IF1` and `IF2` depart with GTP cue. Split roles (`DEC-030`): `IF1` blocks the 30S A site and supports IF2/IF3; `IF2` delivers `fMet-tRNA` and promotes 50S joining as a GTPase; `IF3` favours initiator tRNA on `AUG` and prevents premature 50S association | Textbook canonical order only; kinetic branching is omitted; `trna-init` is pre-charged (formylation not shown); `IF3` (`9FDA`) includes CTD residues 76–177 only (edeine excluded) | `PLAN.md` §5.2, §5.4; `DEC-030`; `docs/assets/factors.md`; `docs/assets/ribosome-70s.md`; Safdari et al. (2025), *Nat. Commun.* **16**, 2470 (`doi:10.1038/s41467-025-57731-8`) |
| **Decoding** | `EF-Tu·GTP·aa-tRNA` binds the `A/T` state (`5WE4`); anticodon nucleotides 34–36 (`DEC-030`) pair with the A-site codon; GTP hydrolysis cue and EF-Tu departure; tRNA accommodates into `siteA` (`7K00`) | Proofreading and near-cognate rejection are omitted; one elongator tRNA body (`7K00` chain `Y`) is reused for all 19 elongators with anticodon nt 34–36 rebuilt as exact Watson–Crick complements (wobble and modified nucleosides are disclosed, not modelled) | `PLAN.md` §2 D7, §5.2, §5.4; `DEC-030`; `docs/assets/trna.md`; `docs/assets/factors.md`; Fislage et al. (2018), *Nucleic Acids Res.* **46** (`doi:10.1093/nar/gky346`) |
| **Peptidyl transfer** | Growing peptide transfers from the P-site tRNA to the A-site tRNA in the 23S rRNA peptidyl-transferase centre (`ptc`) | Catalytic chemistry is represented as a 400 ms visual bond pulse; transition states and proton transfer are omitted | `PLAN.md` §4.4, §5.2; `docs/assets/ribosome-70s.md` |
| **Translocation** | `EF-G` (`7PJV`) binds with GTP cue; tRNAs move `A→P` and `P→E` (`siteE` from `7ST2`) and mRNA advances by 3 nt (`5′→3′`) | `70S` ribosome is rigid (no intersubunit ratchet rotation, 30S head swivel, or L1-stalk motion); hybrid states `siteAP`/`sitePE` from `7PJV` failed the `4.0 Å` anticodon proximity gate and are omitted (`DEC-010`), so motion interpolates directly between classic sites; elongation runs at a teaching speed (`1.1 s/codon`, ~0.91 codon/s) rather than ~15–20 codons/s *in vivo* | `PLAN.md` §5.2, §6.1, §7.4; `DEC-010`; `docs/assets/ribosome-70s.md`; `docs/assets/factors.md`; Carbone et al. (2021), *Nat. Commun.* **12**, 7236 (`doi:10.1038/s41467-021-27415-0`); Petrychenko et al. (2021), *Nat. Commun.* **12** (`doi:10.1038/s41467-021-26133-x`); Bremer & Dennis (2008), *EcoSal Plus* **3** (`doi:10.1128/ecosal.5.2.3`) |
| **E-site exit** | Deacylated tRNA leaves the E site as the next A-site ternary complex arrives | — | `PLAN.md` §5.2, §6.1 |
| **Translation termination** | `RF1` (`8FZH`) reads `UAA` (codon 41) in the A site; GGQ motif (`ggq` anchor) mediates ester hydrolysis pulse; the 40-residue peptide slides out through the 50S exit tunnel; RF1 departs | `RF3` and ribosome recycling (`RRF`/`EF-G`) are omitted | `PLAN.md` §5.2, §5.4; `docs/assets/factors.md`; Li et al. (2024), *Nat. Struct. Mol. Biol.* **31**, 1909–1920 (`doi:10.1038/s41594-024-01360-0`) |
| **Nascent peptide** | Extended heavy-atom backbone ($\varphi = -139^\circ, \psi = 135^\circ, \omega = 180^\circ$; no proline, `PLAN.md` §2 D6) following the 86.71 Å `7K00` exit tunnel centreline, then a smooth free path | Drawn fully extended (emerging after ~26 residues across the 86.71 Å tunnel); real nascent chains inside the tunnel are often partly $\alpha$-helical, and co-translational folding is not modelled | `PLAN.md` §2 D6, §5.2, §6.2; `docs/SCIENCE.md` §4; `docs/assets/ribosome-70s.md` |
| **Transcription–translation coupling** | Expressome locks at the `6ZTJ` RNAP–70S geometry (`D = 38` nt, `DEC-024`) bridged by `NusG` (`6ZTJ` chain `CF`) | Fixed rigid expressome transform (`D = 38` nt); brief teaching pause at 62 nt during 30S/50S initiation | `PLAN.md` §5.2, §6.4; `DEC-024`; `docs/assets/rnap.md` §§6–7; Webster et al. (2020), *Science* **369**, 1355–1359 (`doi:10.1126/science.abb5036`) |

### Summary of core teaching simplifications

Five cross-cutting simplifications apply throughout `Express` mode (`PLAN.md` §2 D7–D8, §4.10, §5.2; `docs/SCIENCE.md` §§4–5):

1. **Teaching speeds:** Transcription elongation (~7 nt/s vs 40–80 nt/s *in vivo*) and translation elongation (~0.9 codon/s vs 15–20 codons/s *in vivo*; Bremer & Dennis, 2008, `doi:10.1128/ecosal.5.2.3`) are slowed by roughly an order of magnitude so each catalytic and binding event can be followed visually.
2. **Deterministic interpolation, not molecular dynamics:** Machine and nucleic-acid trajectories are deterministic pure functions of story time interpolated between rigid experimental poses (`PLAN.md` §2 D8), with no force field, thermal fluctuation, or solvent dynamics.
3. **Extended non-folding nascent peptide:** The 40-residue chain uses a single extended backbone conformation ($\varphi = -139^\circ, \psi = 135^\circ$; §4); real nascent chains in the 50S exit tunnel are frequently partly helical, and post-exit folding is not shown.
4. **Exact Watson–Crick anticodons:** Rebuilt tRNA anticodon triplets (nt 34–36) use exact Watson–Crick complements for every sense codon; *E. coli* wobble pairing and modified nucleosides are disclosed rather than modelled (`PLAN.md` §2 D7).
5. **Illustrative static cytoplasmic crowding:** Neighbouring ribosomes, standalone EF-Tu monomers, and RNAP holoenzymes are static L0 envelopes at illustrative densities without Brownian motion or exchange (§5).

---

## 7. Coupled Transcription–Translation Expressome (`PLAN.md` §6.4, `DEC-024`)

In bacteria, the absence of a nuclear envelope allows a ribosome to initiate on a nascent mRNA while RNA polymerase is still transcribing it (Webster et al., 2020, *Science* **369**, 1355–1359, `doi:10.1126/science.abb5036`). Helix models this in **Coupled** mode directly from the NusG-coupled *E. coli* 70S–RNAP expressome structure **PDB `6ZTJ`** (3.4 Å cryo-EM; `docs/assets/rnap.md` §§6–7):

- **Experimental coupling distance (`D = 38` nt, `DEC-024`):** `PLAN.md` §6.4 defines `D` as the nucleotide count from the first nucleotide of the ribosome's P-site codon to the RNA 3′-terminal nucleotide in RNAP. In `6ZTJ.cif` chain `AV` (continuous residues `14..53`, zero unmodelled residues in `[16, 53]`), the P-site `AUG` codon sits at `AV:16..18` and the RNAP RNA 3′ end sits at `AV:53`, giving an exact inclusive count of $D = 53 - 16 + 1 = 38\text{ nt}$ (matching the `6ZTJ` title verbatim and stored in `rnap-ec.source.coupling.D`; `DEC-024`, `docs/assets/rnap.md` §6.2).
- **Binding threshold (`24 + D = 62` nt):** In Construct v3, the start codon begins at 0-based mRNA index `24` (§3.1). The ribosome binds once the transcript reaches length `24 + D = 62` nt, where the RNAP and ribosome footprints no longer overlap and locking places the two machines directly into the `6ZTJ` expressome geometry with no catch-up phase (`PLAN.md` §6.4).
- **Expressome geometry & clearance (`docs/assets/rnap.md` §§6–7):**
  - `rnap-ec.anchors.expressome` places `ribosome-70s` (`ribo` frame) into the `rnap` frame at a centre-to-centre separation of **184.12 Å**, with no clash between RNAP and ribosome L1 beads (minimum distance **7.389 Å**) or between ribosome L1 and the 248-bp DNA (**18.15 Å**). The folded terminator hairpin comes within 1.4–1.8 Å of RNAP and 30S protein beads (S3/S4) at worst, inside the 1.0 Å penetration limit (`tests/story-coupled.test.mjs`); a real ribosome this close would unwind such a hairpin, which is not shown.
  - `rnap-ec.paths.coupledMrna` (25 points, **138.414 Å**) traces the observed `6ZTJ` intervening mRNA backbone (`AV:41` → `AV:23`, `synthetic = 0`) plus short synthetic end connectors to `rnap-ec` `rnaExit` and `ribosome-70s` `mrnaEntry` (`synthetic = 1`).
  - `assets/nusg.asset.json` (`6ZTJ` chain `CF`, 161 modelled Cα beads, NTD–CTD span **44.554 Å**) bridges RNAP (`ntd`) and 30S uS10 (`ctd`) in the `rnap` frame.
- **Exact `D = 38` cycle arithmetic (`DEC-024`, `js/sim/gene/timeline.js`):**
  - Chapters 1–5 transcribe nt 1–12 (`32.40 s`); Chapter 6 (`elongate-early`) transcribes nt 13–62 (`(12 + 38) × 0.15 = 7.50 s`).
  - Chapters 7–8 (`couple-scan` `10.0 s`, `couple-join` `7.5 s`) hold a disclosed teaching pause at 62 nt while 30S·IF1·IF3 binds SD, IF2 delivers `fMet-tRNA` to P, 50S joins, IFs leave, and NusG binds to lock the expressome.
  - Chapter 9 (`couple-run`) executes $\lfloor (179 - 24 - 38) / 3 \rfloor = \lfloor 117 / 3 \rfloor = 39$ coupled elongation cycles at `1.1 s/cycle` (**42.90 s**), transcribing nt 63–179 (3 nt per cycle) while translating codons 2–40, leaving `remainingNt = 0` and `remainingCodons = 0`.
  - Chapter 10 (`couple-terminate`, `4.0 s`) releases NusG, completes terminator hairpin release and DNA relaxation, and unlocks the expressome.
  - Because `remainingCodons = 0`, Chapter 11 (`release`) performs RF1-mediated peptide release only (**11.00 s**), followed by Chapter 12 (`finale`, `6.0 s`), for an exact total of **121.30 s** (`PLAN.md` §6.4, `DEC-024`).

---

## 8. Story Pacing and Chapter Structure (`PLAN.md` §§6.1, 6.4, `DEC-024`)

Both story modes run at `0.5×`, `1×`, `2×`, and `4×` speed (`PLAN.md` §2 D13). At `1×`, Step by step lasts **~164 s (exact `164.05 s`)** across 16 chapters and Coupled lasts **~121 s (exact `121.30 s`)** across 12 chapters:

### 8.1 Step by step (`sequential`) — 16 chapters, exact total `164.05 s` (`PLAN.md` §6.1)

| # | Chapter id | Title | Group | Duration (1×) | Biological events |
| :---: | :--- | :--- | :---: | ---: | :--- |
| 1 | `establish` | A gene in the cytoplasm | O | 6.00 s | Straight 248-bp DNA, crowders, holoenzyme 400 Å away (`DEC-030`) |
| 2 | `search` | Finding the promoter | T | 8.00 s | Holoenzyme moves to promoter and binds (`-35`/`-10`) |
| 3 | `open` | Opening the DNA | T | 6.00 s | Bubble `-11…+2` melts; upstream DNA bends to `6CA0` RPo geometry |
| 4 | `initiate` | First bonds | T | 6.40 s | Nucleotides 1–3 (`1.8 s` each: NTP entry, bond, PPi exit) + `1.0 s` hold |
| 5 | `escape` | Promoter escape | T | 6.00 s | Nucleotides 4–12 (`0.5 s/nt`); σ⁷⁰ releases across nt 11–12 |
| 6 | `elongate-tx` | Elongation | T | 20.70 s | Nucleotides 13–150 (`0.15 s/nt`), ~9-bp hybrid |
| 7 | `terminate-tx` | Termination | T | 13.15 s | Nucleotides 151–179 (`0.35 s/nt`), hairpin folds, RNA/DNA release & relax (`3.0 s`) |
| 8 | `scan` | Ribosome meets mRNA | I | 8.00 s | mRNA enters ribosome layout; `30S·IF1·IF3` binds Shine–Dalgarno `AGGAGG` |
| 9 | `start` | Start codon | I | 6.00 s | `IF2` delivers `fMet-tRNA` directly to P site (`AUG`) |
| 10 | `join` | 70S assembly | I | 6.00 s | `50S` joins; `IF3` leaves, then `IF1` and `IF2` leave with GTP cue |
| 11 | `decode` | Decoding | E | 9.00 s | `EF-Tu·GTP·Ala-tRNA` to `A/T`, pairing, GTP cue & EF-Tu exit, accommodation to `A` |
| 12 | `bond` | Peptide bond | E | 4.00 s | Peptidyl transfer (`P→A`) in 23S PTC with bond pulse |
| 13 | `translocate` | Translocation | E | 6.00 s | `EF-G` binds; tRNAs `A→P`, `P→E` and mRNA `+3 nt`; `EF-G` departs |
| 14 | `elongate-tl` | Elongation | E | 41.80 s | Codons 3–40 (`38 × 1.1 s/cycle`); nascent chain emerges from 50S exit tunnel |
| 15 | `release` | Stop codon | E | 11.00 s | `UAA` in A; `RF1` binds, hydrolysis pulse, 40-aa peptide exits tunnel, `RF1` leaves |
| 16 | `finale` | Finished | O | 6.00 s | Free mRNA, 70S ribosome, and 40-residue peptide; straight DNA |
| | | **Total** | | **164.05 s** | Matches `PLAN.md` §2 D13, §6.1, and `DEC-024` |

### 8.2 Coupled (`coupled`) — 12 chapters, exact total `121.30 s` at `D = 38` (`PLAN.md` §6.4, `DEC-024`)

Chapters 1–5 are identical to Step by step (`32.40 s`), followed by:

| # | Chapter id | Title | Group | Formula (`D = 38`) | Duration (1×) | Biological events |
| :---: | :--- | :--- | :---: | :--- | ---: | :--- |
| 1–5 | *(as §8.1)* | *(as §8.1)* | O / T | `6.0 + 8.0 + 6.0 + 6.4 + 6.0` | 32.40 s | Promoter binding through escape (nt 1–12) |
| 6 | `elongate-early` | RNA emerges | T | `(12 + D) × 0.15 s` | 7.50 s | Nucleotides 13–62 (`24 + D`) at `0.15 s/nt` |
| 7 | `couple-scan` | Ribosome joins early | I | `10.0 s` | 10.00 s | Disclosed transcription pause at 62 nt; `30S·IF1·IF3` binds SD at `expressome` pose; `IF2·fMet-tRNA` to P |
| 8 | `couple-join` | 70S assembly | I | `7.5 s` | 7.50 s | `50S` joins & IFs leave (`6.0 s`); `NusG` binds (`1.5 s`) and expressome locks |
| 9 | `couple-run` | Coupled elongation | E | `⌊(179 − 24 − D) / 3⌋ × 1.1 s` | 42.90 s | 39 coupled cycles (codons 2–40, nt 63–179); hairpin folds from nt 164 |
| 10 | `couple-terminate` | Transcription ends | T | `4.0 s` | 4.00 s | `remainingNt = 0`; `NusG` leaves; hairpin/RNA/DNA release; expressome unlocks |
| 11 | `release` | Stop codon | E | `(remainingCodons) × 1.1 + 11.0 s` | 11.00 s | `remainingCodons = 0` → `RF1` release only (`UAA`, 40-aa peptide exits) |
| 12 | `finale` | Finished | O | `6.0 s` | 6.00 s | Free mRNA, ribosome, and 40-residue peptide; straight DNA |
| | | **Total** | | | **121.30 s** | Matches `PLAN.md` §2 D13, §6.4, and `DEC-024` |

---

## 9. Structural Provenance Index (`docs/ASSETS.md`, `docs/assets/*.md`)

All **12 experimental macromolecular machine structures** used in `Express` mode are **cryo-EM** structures of *Escherichia coli* complexes (wwPDB CC0 1.0 Universal), whereas ideal B-DNA backbone geometry and `X-ray` mode derive from the **X-ray diffraction** crystal structure **`1BNA`** (`DEC-030`). Raw mmCIF files are pinned by SHA-256 and byte length in `tools/sources.lock.json` and compiled reproducibly by `tools/build-assets.mjs` (`docs/ASSETS.md`).

| PDB ID | Method & Res. | Role in Helix | Asset / Provenance Doc | Primary Reference |
| :---: | :--- | :--- | :--- | :--- |
| **`6ALF`** | Cryo-EM, 4.1 Å | `rnap-ec` core (α₂ββ′ω), `rnap` frame, elongation tracks (`template`, `nontemplate`, `rna`), catalytic $\text{Mg}^{2+}$ | `docs/ASSETS.md` A07; `docs/assets/rnap.md` | Kang et al. (2017), *eLife* **6**, e25478 (`doi:10.7554/eLife.25478`) |
| **`6C9Y`** | Cryo-EM, 4.25 Å | `rnap-holo` core + σ⁷⁰ protein (L0/L1/L2) superposed on `6ALF` β′ (`2.37 Å` RMSD) | `docs/ASSETS.md` A08; `docs/assets/rnap.md` | Narayanan et al. (2018), *J. Biol. Chem.* **293**, 7367–7375 (`doi:10.1074/jbc.RA118.002161`) |
| **`6CA0`** | Cryo-EM, 5.75 Å | `rnap-holo` open-promoter (RPo) DNA tracks (`-45…+11`, bubble `-11…+2`) superposed on `6C9Y` (`1.014 Å` RMSD, `DEC-023`) | `docs/ASSETS.md` A08; `docs/assets/rnap.md` §3; `DEC-023` | Narayanan et al. (2018), *J. Biol. Chem.* **293**, 7367–7375 (`doi:10.1074/jbc.RA118.002161`) |
| **`7YPA`** | Cryo-EM, 3.05 Å | `rnap-ec` terminator `hairpin` anchor superposed on `6ALF` (`1.161 Å` RMSD) | `docs/ASSETS.md` A07; `docs/assets/rnap.md` §5 | You et al. (2023), *Nature* **613**, 783–789 (`doi:10.1038/s41586-022-05604-1`) |
| **`6ZTJ`** | Cryo-EM, 3.4 Å | `nusg` (chain `CF`), `rnap-ec` `expressome` anchor, `coupledMrna` path, and `D = 38` nt (`AV:16..53`, `DEC-024`; RNAP `1.021 Å`, ribo `0.625 Å`) | `docs/ASSETS.md` A07, A12; `docs/assets/rnap.md` §§6–7; `DEC-024` | Webster et al. (2020), *Science* **369**, 1355–1359 (`doi:10.1126/science.abb5036`) |
| **`7K00`** | Cryo-EM, 1.98 Å | `ribosome-70s` (52 chains), `ribo` frame, `siteA`/`siteP`/`decoding`/`ptc`/`tunnel` (86.71 Å), `mrna` core (`-3…+8`), `trna-init` (`Z`), `trna-aa` (`Y`) | `docs/ASSETS.md` A09–A11; `docs/assets/ribosome-70s.md`; `docs/assets/trna.md` | Watson et al. (2020), *eLife* **9**, e60482 (`doi:10.7554/eLife.60482`) |
| **`7ST2`** | Cryo-EM, 2.9 Å | `ribosome-70s` `siteE`, `antiSD`, and `mrna` extension (`-14…-4`) superposed on `7K00` (`0.73 Å` RMSD) | `docs/ASSETS.md` A09; `docs/assets/ribosome-70s.md` | Carbone et al. (2021), *Nat. Commun.* **12**, 7236 (`doi:10.1038/s41467-021-27415-0`) |
| **`5WE4`** | Cryo-EM, 3.1 Å | `ef-tu` (chain `z`) and `ribosome-70s` `siteAT` frame superposed on `7K00` (`0.606 Å` RMSD) | `docs/ASSETS.md` A09, A14; `docs/assets/factors.md` | Fislage et al. (2018), *Nucleic Acids Res.* **46** (`doi:10.1093/nar/gky346`) |
| **`7PJV`** | Cryo-EM, 3.1 Å | `ef-g` (chain `x`, `23S`-only superposition `0.777 Å` RMSD per `DEC-010`, `DEC-022`); hybrid tRNA frames `siteAP`/`sitePE` tested and omitted (`DEC-010`) | `docs/ASSETS.md` A09, A15; `docs/assets/factors.md`; `DEC-010`, `DEC-022` | Petrychenko et al. (2021), *Nat. Commun.* **12** (`doi:10.1038/s41467-021-26133-x`) |
| **`8FZH`** | Cryo-EM, 2.9 Å | `rf1` (chain `w`, `ggq` L2 site, `23S`-only superposition `1.408 Å` RMSD per `DEC-022`) | `docs/ASSETS.md` A13; `docs/assets/factors.md`; `DEC-022` | Li et al. (2024), *Nat. Struct. Mol. Biol.* **31**, 1909–1920 (`doi:10.1038/s41594-024-01360-0`) |
| **`9ZN2`** | Cryo-EM, 3.0 Å | `if1` (chain `y`) and `if2` (chain `x`, residues 296–890) superposed on `7K00` (`1.291 Å` RMSD) | `docs/ASSETS.md` A16–A17; `docs/assets/factors.md` | Guerra et al. (2026), wwPDB deposition *(To Be Published; placeholder citation in `js/ui/about.js`; author and DOI not verified against RCSB)* |
| **`9FDA`** | Cryo-EM, 2.0 Å | `if3` (chain `J`, CTD 76–177; edeine excluded) superposed on `7K00` 16S (`0.985 Å` RMSD) | `docs/ASSETS.md` A18; `docs/assets/factors.md` | Safdari et al. (2025), *Nat. Commun.* **16**, 2470 (`doi:10.1038/s41467-025-57731-8`) |
| **`1BNA`** | X-ray, 1.9 Å | Ideal B-DNA deoxyribose-phosphate template reference (`tools/build-templates.mjs`) and `X-ray` mode crystal structure | `docs/ASSETS.md` A01; `PLAN.md` §7.2 | Drew et al. (1981), *PNAS* **78**, 2179–2183 (`doi:10.1073/pnas.78.4.2179`) |

---

## 10. Quantitative Invariants (`PLAN.md` §5.3, §10)

Every story mode and asset build is verified against the eight core scientific invariants of `PLAN.md` §5.3 (enforced across `tests/science.test.mjs`, `tests/scenario.test.mjs`, `tests/timeline.test.mjs`, `tests/story-tx.test.mjs`, `tests/story-tl.test.mjs`, and `tests/story-speed.test.mjs`):

1. **Transcript fidelity:** The 179-nt transcript equals the Construct v3 coding strand over DNA `[45, 224)` with `T → U`, and is the exact reverse complement of the template strand over that range.
2. **Monotonicity & bit-exact determinism:** At every story time `t`, mRNA length is an integer that never decreases during transcription, and `stateAt(t)` produces bit-identical `Float32Array` atomic positions across repeated calls and arbitrary seek orders (and across `0.5×`, `1×`, `4×` playback speeds).
3. **Reading-frame indexing:** During elongation cycle $k$ ($k = 1\ldots 40$), the P-site codon is mRNA `[24 + 3(k - 1), 27 + 3(k - 1))`.
4. **Peptide sequence & stop termination:** After cycle $k$, the peptide equals the first $k$ residues of §3.1 (`fMet-A-E-F-K-G-S-D-Y-Q-...-S-Y-L`); no amino acid is added at codon 41 (`UAA`).
5. **Direct P-site initiation:** Translation initiation places `fMet-tRNA` directly in the P site; it never occupies the `A/T` or `A` site.
6. **Watson–Crick decoding:** Each rebuilt anticodon (nt 34–36) pairs with its codon by Watson–Crick rules in the A site and P site.
7. **Bubble integrity:** The transcription bubble never exceeds 15 bp, and all DNA outside the bubble remains fully paired.
8. **Slot-track steric clearance:** No nucleic-acid heavy atom penetrates a machine's L1 beads by more than `1.0 Å` inside its active slot tracks (checked at 64 sample times per chapter, with no `ribosome.bound` skip guard per `DEC-030`).

In **Coupled** mode (`PLAN.md` §10 `R3-S5`), three additional coupling invariants apply: (a) P-site codon start to RNA 3′ end distance remains `D ± 1 nt` (`38 ± 1 nt`) throughout `couple-run`; (b) RNAP and ribosome L0 footprints never overlap along the mRNA; and (c) RNAP and ribosome L1 beads exhibit no steric clashes beyond the experimental `6ZTJ` contact interface (`7.389 Å` minimum separation at `expressome`, `docs/assets/rnap.md` §6.1).
