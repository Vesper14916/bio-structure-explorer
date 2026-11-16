# Shared Implementation Contracts

Status: Frozen for M0–M4 implementation
Updated: 2026-11-16
Owner: Integration Owner (Agent 0 — Gemini 4 Argon)

This document defines the shared data structures, coordinate conventions, sequence indexing rules, macromolecular anchors, and component APIs across `js/science/`, `js/sim/`, `js/render/`, and `js/ui/`. Do not introduce incompatible interface changes without updating this contract first.

---

## 1. Coordinate System and Units

- **Units:** Right-handed Cartesian coordinates in **angstroms ($\text{Å}$)**, temperatures in **degrees Celsius ($^\circ\text{C}$)**, monovalent salt concentration in **$\text{mol/L}$ ($\text{M}$)**, energies in **$\text{kcal/mol}$**, and entropies in **$\text{cal/(mol}\cdot\text{K)}$**.
- **Base reference frame (Olson et al., 2001):**
  - Every nucleotide carries its local atom positions in its standard base plane (`z = 0`).
  - `+x` points into the major groove; `+y` runs along the $C1'\cdots C1'$ vector toward strand I; `+z` follows the $5'\to 3'$ direction of strand I.
  - A rigid-body frame is `{ o: [x, y, z], R: [r00, r01, r02, r10, r11, r12, r20, r21, r22] }` (row-major $3\times 3$ rotation matrix whose columns are the local $x, y, z$ axes in world coordinates).
  - The Watson–Crick antiparallel partner frame is rotated $180^\circ$ about local $x$: `partnerFrame(f)`.
- **Helix parameters:**
  - `HELIX_B` (canonical B-DNA): `{ rise: 3.38, twistDeg: 34.285714285714285, bpPerTurn: 10.5 }`.
  - `HELIX_A` (canonical A-RNA / RNA·DNA hybrid): `{ rise: 2.81, twistDeg: 32.72727272727273, bpPerTurn: 11.0, xDisp: -4.4, inclinationDeg: 16.0 }`.

---

## 2. Nucleic Acid Chemistry & Assembly Topology (`js/science/`)

### 2.1 Bases and Sugars
- Supported bases: `'A' | 'T' | 'G' | 'C' | 'U'`.
- Uracil (`'U'`) uses the Olson et al. (2001) standard pyrimidine ring geometry (identical ring heavy atoms to `'T'`, omitting the extra-annular `'C7'` methyl carbon).
- Supported sugars:
  - `'deoxyribose'` (B-DNA default): 10 backbone heavy atoms `['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'"]` (`BACKBONE`).
  - `'ribose'` (A-RNA default): 11 backbone heavy atoms `['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "O2'"]` (`BACKBONE_RNA`), adding the $2'\text{-OH}$ oxygen `"O2'"` bonded to `"C2'"` (`1.413 Å`) in a $C3'\text{-endo}$ pucker regularised to close $O3'(i)\text{–}P(i+1)$ at $1.607\,\text{Å}$ under `HELIX_A`.
- Base palette (`BASE_INFO`):
  - `A`: `0x3fd67a` (Adenine, purine)
  - `T`: `0xff5964` (Thymine, pyrimidine)
  - `U`: `0xff8a3d` (Uracil, pyrimidine — warm amber-coral distinct from `T` and `G`)
  - `G`: `0xffc233` (Guanine, purine)
  - `C`: `0x38a8ff` (Cytosine, pyrimidine)

### 2.2 Pairing & Groove Chemistry
- `WC_HBONDS` supports canonical `AT`, `TA`, `AU`, `UA` (2 H-bonds), `GC`, `CG` (3 H-bonds), and wobble `GU`, `UG` (2 H-bonds: `G-O6···U-N3` and `G-N1···U-O2`).
- `GROOVE_PATTERN`:
  - `major`: `{ AT: 'ADAM', TA: 'MADA', AU: 'ADAH', UA: 'HADA', GC: 'AADH', CG: 'HDAA', GU: 'AADA', UG: 'ADAA' }`
  - `minor`: `{ AT: 'AHA', TA: 'AHA', AU: 'AHA', UA: 'AHA', GC: 'ADA', CG: 'ADA', GU: 'ADA', UG: 'ADA' }`

### 2.3 `Assembly` Extensions
- `nucleotideTemplate(base, sugar = (base === 'U' ? 'ribose' : 'deoxyribose'))` returns `{ base, sugar, names, el, part, local, bonds, index }`.
- `asm.addNucleotide(spec)` accepts `sugar?: 'deoxyribose' | 'ribose'`, `codon?: number` (`-1` if not part of a coding triplet), and `role?: 'coding' | 'template' | 'mrna' | 'trna' | 'primer' | ''`.
- `asm.residues` (optional array on `Assembly` for gene-expression scenes):
  - Each peptide residue entry: `{ id, index, code1, code3, name, kind, codonIndex, pos: [x, y, z], radius, visible, opacity, peptideBondActive }`.
  - Rendered seamlessly by the viewer alongside nucleotides.

---

## 3. Bacterial Gene Construct & Sequence Indexing (`js/science/genetic-code.js`)

- **Internal indexing:** 0-based indices and half-open intervals `[start, end)`.
- **UI display:** 1-based positions (`+1` for transcription start site; codons `1..12`).
- **Strand storage:** Every strand in `asm.strands[s]` is stored in its own $5'\to 3'$ chemical order.
- **Standard Bacterial Teaching Construct (`DEFAULT_GENE_CONSTRUCT`):**
  - Total duplex length: **48 bp** (compact enough for 60 fps atom-level rendering while containing every functional bacterial signal):
    - `0..4` (`5 bp`): Upstream promoter / $-10$ Pribnow box (`5'-TATAAT-3'` consensus shortened to `5'-TATAA-3'`)
    - `5..12` (`8 bp`): $5'\text{ UTR}$ containing the **Shine–Dalgarno** ribosome-binding site (`5'-AGGAGGU-3'` / `AGGAGG`)
    - `13..45` (`33 bp`, 11 sense codons): Coding region (`ORF`):
      - Coding DNA ($5'\to 3'$): `ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT`
      - mRNA ($5'\to 3'$): `AUG GCU GAA UUU AAA GGU UCU GAC UAC CAA GCU`
      - Amino acids ($N\to C$): `fMet (M) - Ala (A) - Glu (E) - Phe (F) - Lys (K) - Gly (G) - Ser (S) - Asp (D) - Tyr (Y) - Gln (Q) - Ala (A)`
    - `46..48` (`3 bp`, stop codon `c = 11`): `TAA` (`mRNA: UAA`) — recognized by Release Factor **RF1** (adds **no** amino acid).

---

## 4. Deterministic Simulation Contract (`js/sim/`)

Every simulation module (`createMeltSim`, `createReplicationSim`, `createExpressionSim`) has **zero DOM or Three.js dependencies** and obeys:

- **Pure function of time:** `sim.seek(progressOrTime)` computes all nucleotide frames, pair strengths, link states, residue coordinates, and macromolecular actor transforms deterministically from `progress` $\in [0, 1]$. Scrubbing forward or backward to the same progress produces identical `Float32Array` coordinates.
- **Common Sim API:**
  - `sim.assembly`: `Assembly` instance (mutated in place on `seek`/`update`, followed by `asm.updatePositions()`).
  - `sim.blobs`: array of macromolecular actor descriptors `{ id, label, kind, pos: [x,y,z], scale?: [sx,sy,sz], rot?: [9], radius, color, opacity, visible, cutaway?: boolean, anchors?: {} }`.
  - `sim.state`: plain object for UI consumption (`progress`, `playing`, `finished`, `speed`, `phase`, `caption`, counters, and active sequence highlights).
  - `sim.play()`, `sim.pause()`, `sim.seek(progress01)`, `sim.update(dt)`, `sim.setSpeed(v)`, `sim.dispose()`.

### Named Macromolecular Actors & Anchors (`createExpressionSim`)
1. `rnap` (`RNA Polymerase`, color `0x4fb6ff`):
   - Anchors: `dnaEntry`, `activeSite`, `dnaExit`, `rnaExit`.
2. `ribosome-30s` (`30S Small Subunit`, color `0x38d9a9`) & `ribosome-50s` (`50S Large Subunit`, color `0x63e6be`):
   - Anchors: `mrnaEntry`, `siteA`, `siteP`, `siteE`, `mrnaExit`, `peptideTunnelExit`.
3. `trna-init` (`fMet-tRNAfMet`, color `0xffd43b`) & `trna-elong-*` (`aa-tRNA`, color `0xff922b`):
   - Anchors: `anticodon`, `acceptorStem`.
4. `rf1` (`Release Factor RF1`, color `0xff6b6b`):
   - Binds `siteA` specifically on `UAA` termination codon.

---

## 5. Viewer & UI Contract (`js/render/` & `js/ui/`)

### 5.1 Modes
- `MODES` in `js/ui/ui.js`:
  1. `'structure'` (`Explore` — supports both **B-DNA** and **A-RNA** duplex/strand inspection via `nucleicAcid: 'dna' | 'rna'`)
  2. `'pair'` (`Pairs` — supports `A·T`, `G·C`, `A·U`, and `G·U` wobble pairs)
  3. `'melt'` (`Melt` — supports DNA SantaLucia 1998 and RNA Turner/Xia 1998 thermal denaturation)
  4. `'replicate'` (`Copy` — semi-conservative DNA replication fork)
  5. `'express'` (`Express` — bacterial transcription + translation from DNA → mRNA → peptide)
  6. `'crystal'` (`X-ray` — experimental PDB `1BNA` B-DNA dodecamer)

### 5.2 Unidirectional UI Handlers & Setters
- **Handlers (`UI -> app`):**
  - `onMode(mode)`
  - `onNucleicAcid('dna' | 'rna')`
  - `onStyle(partial)`
  - `onSequence(seq)`
  - `onSelectPair(index | null)`
  - `onMeasureToggle(bool)`
  - `onMelt({ T, Na })`
  - `onReplication({ action, value })`
  - `onExpression({ action, value })` — `action`: `'play' | 'pause' | 'restart' | 'seek' | 'speed' | 'camera' | 'cutaway' | 'selectCodon'`
  - `onCrystal({ waters, bfactor })`
  - `onLayout(insets)`
- **Setters (`app -> UI`):**
  - `setNucleicAcid('dna' | 'rna')`
  - `setExpressState(state)` — merges `{ progress, playing, speed, phase, caption, cameraMode, cutaway, rnaLength, codonIndex, peptideLength, peptideSeq, activeCodon, activeResidue, construct }`
