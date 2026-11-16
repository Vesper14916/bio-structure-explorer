# Handoff: T05–T08 Science & Sequence Engine (`js/science/`)

- **Agent:** Agent 1 — Science & Sequence Engine (Gemini 4 Hydrogen High-Reasoning)
- **Date:** 2026-11-16
- **Status:** Complete & Verified (`13/13` unit tests passing in `tests/science.test.mjs`)

---

## 1. Summary of Changes

### 1.1 `js/science/bases.js` (T05)
- Added Uracil (`U`) heavy-atom coordinates (`BASE_ATOMS.U`, 9 atoms in the Olson et al. 2001 standard base plane `z = 0`, omitting the C5 methyl `C7` of Thymine) and covalent connectivity (`BASE_BONDS.U`).
- Added `BACKBONE_BONDS_RNA` extending `BACKBONE_BONDS` with the ribose $2'\text{-OH}$ covalent bond `["C2'", "O2'"]`.
- Exported `COMPLEMENT` (`{ A: 'T', T: 'A', G: 'C', C: 'G', U: 'A' }`) and `COMPLEMENT_RNA` (`{ A: 'U', U: 'A', G: 'C', C: 'G', T: 'A' }`).
- Extended `WC_HBONDS` with canonical `AU` / `UA` (2 H-bonds) and `GU` / `UG` wobble pairs (2 H-bonds: `G-O6···U-N3` and `G-N1···U-O2`).
- Extended `GROOVE_PATTERN` (`major` and `minor`) for `AU`, `UA`, `GU`, and `UG`.
- Added `BASE_INFO.U` (`Uracil`, pyrimidine, `C4H4N2O2`, warm coral-amber `0xff8a3d`).

### 1.2 `js/science/templates.js` & `tools/build-templates.mjs` (T06)
- Added `HELIX_A = { rise: 2.81, twistDeg: 32.72727272727273, bpPerTurn: 11.0, xDisp: -4.4, inclinationDeg: 16.0 }`.
- Added `BACKBONE_RNA` and `BACKBONE_RNA_TORSIONS` regularised under the `HELIX_A` screw operation (`2.81 Å` rise, `32.73°` twist) with explicit $2'\text{-OH}$ oxygen `"O2'"` at `1.4130 Å` from `"C2'"`, closing the inter-nucleotide $O3'(i)\text{–}P(i+1)$ phosphodiester link at `1.6018 Å` (`1.607 ± 0.006 Å`) with zero intra- or inter-strand steric clashes (`minAdj = 2.459 Å > 2.3 Å`, `minNonAdj = 2.866 Å > 2.6 Å`).

### 1.3 `js/science/assembly.js` (T06)
- Exported `BB_ORDER` and `BB_ORDER_RNA`.
- Updated `nucleotideTemplate(base, sugar = (base === 'U' ? 'ribose' : 'deoxyribose'))` to cache by `${base}:${sugar}` and build 10-atom deoxyribose or 11-atom ribose backbone templates.
- Extended `Assembly.addNucleotide(spec)` with `sugar`, `codon` (`-1` default), and `role` (`''` default).
- Added `this.residues = []` and `Assembly.addResidue(spec)` for nascent polypeptide bead representation in gene-expression scenes.
- Added RNA sequence utilities (`cleanRnaSequence`, `dnaToRna`, `rnaToDna`, `complementRna`, `reverseComplementRna`), `wobblePartnerFrame(f, pairType)`, `buildRnaDuplex(sequence, helix = HELIX_A)`, `buildSingleStrandedRna(sequence, helix = HELIX_A)`, and `{ nucleicAcid: 'rna' }` support in `buildDuplex`.

### 1.4 `js/science/thermo.js` (T07)
- Added Turner / Xia et al. (1998) RNA nearest-neighbour enthalpy and entropy parameters (`RNA_NN`, `RNA_INIT_GC`, `RNA_INIT_AU` terminal AU penalty) alongside SantaLucia (1998) `DNA_NN`.
- Updated `stackThermo`, `duplexThermo`, `helixCoil`, and `meltingCurve` to support `{ nucleicAcid: 'rna' }` (as well as automatic RNA detection when sequences contain `U`).

### 1.5 `js/science/genetic-code.js` & `js/science/index.js` (T08)
- Created `js/science/genetic-code.js` exporting:
  - `AMINO_ACID_INFO` (including bacterial initiator `fMet` and standard `Met`)
  - `CODON_TABLE` (all 64 RNA triplets with `RF1`/`RF2` stop annotations)
  - `DEFAULT_GENE_CONSTRUCT` (exact 48-bp bacterial construct: `0..4` `-10` Pribnow `TATA`, `4..12` `5' UTR` `AGGAGGUA` with `AGGAGG` Shine–Dalgarno at `4..10`, `12..45` 11-codon sense ORF `ATG...GCT`, `45..48` `TAA`/`UAA` stop codon; 44-nt mRNA; 11-aa peptide `fMet-Ala-Glu-Phe-Lys-Gly-Ser-Asp-Tyr-Gln-Ala`)
  - Pure helpers: `anticodonOf`, `dnaToMrnaIndex`, `mrnaToDnaIndex`, `mrnaToCodonIndex`, `dnaToCodonIndex`, `codonToMrnaRange`, `codonToDnaRange`, `transcribeConstruct`, and `translateMrna`.
- Re-exported all new symbols from `js/science/index.js`.

---

## 2. Validation Evidence

Ran `node --test tests/science.test.mjs`:
- All 8 original B-DNA/1BNA/SantaLucia tests pass unchanged.
- All 5 new test suites covering Uracil/ribose geometry, A-RNA duplex dimensions/links/steric checks, `A·U` & `G·U` wobble pairing, Xia et al. (1998) RNA thermodynamics, and bacterial gene construct transcription/translation pass (`13/13` pass, `0` fail).

---

## 3. Known Limitations & Notes for Downstream Agents

- `DEFAULT_GENE_CONSTRUCT` uses 0-based half-open intervals `[start, end)` everywhere (`promoter: 0..4`, `utr5: 4..12`, `orf: 12..45`, `stop: 45..48`, `tss: 4`, `mrnaLength: 44`).
- `codonToMrnaRange(c)` and `codonToDnaRange(c)` return a 2-element array `[start, end]` that also carries `.start` and `.end` properties so both array and object destructuring work seamlessly.
