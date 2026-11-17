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

## 3. Bacterial Gene Expression Scenario (`js/science/genetic-code.js` & `js/sim/expression.js`)

### 3.1 Annotated Teaching Construct (48 bp)
To ensure smooth 60 fps atom-level rendering while preserving all essential biological signals in *Escherichia coli*, the construct is structured as:

```text
Region:       [Promoter] [  5' UTR (SD)  ] [                Coding ORF (11 aa)                 ] [Stop]
Indices (0b): [0, 4)     [4, 12)           [12, 45)                                              [45, 48)
Coding DNA:   5'-TATA    AGGAGGTA          ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT           TAA-3'
Template DNA: 3'-ATAT    TCCTCCAT          TAC CGA CTT AAA TTT CCA AGA CTG ATG GTT CGA           ATT-5'
mRNA (44 nt):            5'-AGGAGGUA       AUG GCU GAA UUU AAA GGU UCU GAC UAC CAA GCU           UAA-3'
Peptide:                                   fMet-Ala-Glu-Phe-Lys-Gly-Ser-Asp-Tyr-Gln-Ala          (RF1)
```

### 3.2 Biological Invariants Enforced
1. **Transcription (`5' → 3'`):**
   - Transcription initiates at position `+1` (index `4`, immediately downstream of the abbreviated `-10` element `TATA`).
   - RNA Polymerase (`RNAP`) opens a local transcription bubble of ~12 bp, pairs incoming ribonucleoside triphosphates (`rATP`, `rUTP`, `rGTP`, `rCTP` carrying $2'\text{-OH}$) antiparallel to the **template strand** ($3'\to 5'$), maintains an internal ~8–9 bp RNA·DNA hybrid, and re-anneals the parental DNA duplex behind the enzyme.
2. **Translation Initiation (`fMet` vs `Met`):**
   - The 30S ribosomal subunit recognizes the **Shine–Dalgarno (`AGGAGG`)** sequence in the $5'\text{ UTR}$ (which remains untranslated).
   - Bacterial translation initiates at `AUG` (codon 1, mRNA index `[8, 11)`) using **initiator formylmethionyl-tRNA ($\text{fMet-tRNA}^{\text{fMet}}$)** placed directly into the **P-site**, distinct from elongator tRNAs that enter via the **A-site**.
3. **Elongation (`A → P → E` Translocation):**
   - Sense codons 2..11 (`GCU` → `Ala` through `GCU` → `Ala`) recruit cognate aminoacyl-tRNAs to the **A-site**, form peptide bonds in the 50S peptidyl transferase center, and translocate by exactly 3 nucleotides per step ($5'\to 3'$ along mRNA) as deacylated tRNAs exit from the **E-site**.
4. **Termination (`UAA` + `RF1`):**
   - The `UAA` ochre stop codon (mRNA index `[41, 44)`) is recognized by protein **Release Factor 1 (`RF1`)** in the A-site. No tRNA or amino acid is added for `UAA`. Hydrolysis releases the 11-residue nascent polypeptide.

### 3.3 Explicit Pedagogical Simplifications
- **Sequential vs Co-transcriptional Coupling:** Although transcription and translation frequently couple on the same nascent mRNA in bacteria, the timeline presents transcription advancing into immediate translation with clear phase transitions so students can inspect RNAP and the ribosome without mutual visual occlusion.
- **Macromolecular Envelopes:** RNAP, 30S/50S ribosomal subunits, tRNAs, and RF1 are rendered as smooth translucent volumetric envelopes with active-site cutaways rather than 100,000+ all-atom protein/rRNA coordinates, keeping the download under 200 KB and frame rates at 60 fps.
- **Precharged tRNAs:** Aminoacyl-tRNA synthetases, initiation/elongation factors (`IF1–3`, `EF-Tu`, `EF-G`), and GTP hydrolysis are described in the UI notes rather than animated as separate molecular collisions.
- **Abbreviated signals:** the 48-bp construct has a 4-bp stand-in for the −10 element, no −35 element, a 2-nt Shine–Dalgarno-to-start spacer, and no terminator. It is replaced by the 150-bp true-scale construct (`docs/CONTRACTS.md` 6.5) when the simulation migrates.

---

## 4. Amino-Acid Residues, Nascent Peptide, and NTP Substrates (`js/science/residues.js`, `peptide.js`, `ntp.js`)

Amino-acid residues are built as heavy-atom models from ideal internal coordinates: the backbone uses Engh and Huber (1991) bond lengths and angles and a planar trans peptide bond; side chains use rounded Engh and Huber means with all chi torsions fixed at 180 degrees (PHE and TYR chi2 = 90 degrees, ASP chi2 = 90 degrees), planar carboxylate, amide and ring groups, and regular-hexagon aromatic rings. All residues are L. The nascent peptide is a single extended strand (phi -139, psi 135, omega 180) with an optional C-terminal OXT; the first residue is N-formylmethionine. There are no hydrogens, no rotamer statistics, no side-chain packing, no folding and no ribosome-exit-tunnel confinement. Nucleoside triphosphates extend the A-RNA ribonucleotide template with an idealised extended triphosphate (P-O bridging 1.61 A, terminal 1.49 A, O-P-O 109.5 degrees, P-O-P 130 degrees), without Mg2+ ions or hydrogens; the beta and gamma phosphates form the pyrophosphate leaving group. The triphosphate conformation is an idealisation, not the conformation bound in RNA polymerase.

Integration check (2026-11-17): template geometry was compared with the protein chains of PDB 6ALF. All 2,930 residues with a Cβ have positive chiral volume (mean 2.494 Å³), matching the templates' L configuration, and every template bond is within 0.020 Å of the observed mean for that bond. Side-chain values were entered from recalled Engh and Huber means and have not been compared with the publication itself.
