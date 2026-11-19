# Scientific Basis, Sources, and Simplifications

Updated: 2026-11-16
Owner: Science & Simulation Agent (Agent 1) / Integration Owner (Agent 0)

---

## 1. Nucleic Acid Geometry (`B-DNA` vs `A-RNA`)

| Feature | B-DNA (`HELIX_B`) | A-RNA (`HELIX_A`) | Literature Source |
| :--- | :--- | :--- | :--- |
| **Base reference frame** | Planar heavy atoms in `z = 0` | Planar heavy atoms in `z = 0`; Uracil (`U`) lacks `C7` methyl of Thymine (`T`) | Olson et al. (2001), *J. Mol. Biol.* **313**, 229–237 |
| **Sugar pucker & 2′ group** | $C2'\text{-endo}$ deoxyribose (no $O2'$) | $C3'\text{-endo}$ ribose with explicit **$2'\text{-OH}$ (`O2'`)** bonded to $C2'$ ($1.413\,\text{Å}$) | Gelbin et al. (1996), *JACS* **118**, 519; Parkinson et al. (1996), *Acta Cryst.* **D52**, 57 |
| **Helical parameters** | Rise $3.38\,\text{Å}$, twist $34.29^\circ$ ($10.5\,\text{bp/turn}$) | Rise $2.81\,\text{Å}$, twist $32.73^\circ$ ($11.0\,\text{bp/turn}$), base-pair inclination $\sim 16^\circ$, $x\text{-displacement} \approx -4.4\,\text{Å}$ | Arnott et al. (1972), *J. Mol. Biol.* **90**, 269; Schneider et al. (1997), *Biopolymers* **42**, 113 |
| **Base pairing** | Canonical `A·T` (2 H-bonds), `G·C` (3 H-bonds) | Canonical `A·U` (2 H-bonds), `G·C` (3 H-bonds), plus **`G·U` wobble** (`G-O6···U-N3`, `G-N1···U-O2`) | Varani & McClain (2000), *EMBO Rep.* **1**, 18 |

---

## 2. Nearest-Neighbor Thermodynamics (`js/science/thermo.js`)

- **DNA Duplexes (`nucleicAcid: 'dna'`):**
  - Unified nearest-neighbor $\Delta H^\circ$ and $\Delta S^\circ$ parameters of **SantaLucia (1998)**, *PNAS* **95**, 1460–1465, with $\text{Na}^+$ salt correction $\Delta S^\circ([\text{Na}^+]) = \Delta S^\circ(1\,\text{M}) + 0.368 \cdot N_{\text{bp}} \cdot \ln[\text{Na}^+]$.
- **RNA Duplexes (`nucleicAcid: 'rna'`):**
  - Nearest-neighbor $\Delta H^\circ$ and $\Delta S^\circ$ parameters of **Xia et al. (1998)** / **Turner & Mathews (2010)** (*Biochemistry* **37**, 14719; *Nucleic Acids Res.* **38**, D280). Because A-form RNA base stacking and $2'\text{-OH}$ hydration stabilize the duplex, an RNA duplex of identical sequence ($T\to U$) exhibits a significantly higher $T_m$ than its B-DNA counterpart.

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
4. **Round 1 48-bp Fixture (`DEFAULT_GENE_CONSTRUCT`):** The compact 48-bp construct (`js/science/genetic-code.js`, 44-nt mRNA, 11 sense codons + `UAA`, abbreviated `TATA` promoter, 2-nt SD spacer, no terminator) remains unchanged for the default Round 1 Express mode until cutover at gate G4.

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
