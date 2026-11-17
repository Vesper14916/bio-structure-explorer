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

---

## 6. Round 2 Wave 1 contracts (frozen 2026-11-17)

Owner: Integration Owner. These additions do not change sections 1–5. Request changes through the Integration Owner; do not adapt one component silently.

### 6.1 Scale and frames
- Display scale is 1 for every actor. All coordinates are angstroms.
- A machine asset is stored in its own local frame. A scene places it with one rigid transform `{ o, R }` (same convention as section 1).

### 6.2 Asset format v1 (`assets/<id>.asset.json`)
The executable definition is `js/assets/format.js` (`validateAsset`, `decodeAsset`, `encodePositions`, `trackFrame`). The reference example is `assets/fixture-machine.asset.json`, generated by `tools/make-fixture-asset.mjs`.

| Field | Meaning |
| :--- | :--- |
| `format`, `version`, `units`, `quantStep` | `"helix-asset"`, `1`, `"angstrom"`, `0.05` |
| `id`, `name`, `kind` | kebab-case id, display name, `"machine"` |
| `source` | `type: "pdb"` requires `pdbId`, `title`, `method`, `resolutionA`, `organism`, `downloaded`, `sha256`, `license`, `chainsUsed`; `type: "synthetic"` requires `notes` |
| `bounds` | `{ center, radius, size }` in the asset frame |
| `parts[]` | Separable groups that can be shown, hidden, or released independently (for example `core`, `sigma`) |
| `chains[]` | `{ id, part, class: "protein" \| "rna" \| "dna", name, residues }` |
| `lod0.parts[]` | Envelope mesh per part: base64 int16 `positions`, base64 `indices` (`indexType` `u16` or `u32`), `vertexCount`, `triangleCount` |
| `lod1` | One bead per residue: `count`, base64 int16 `positions`, base64 uint8 `chain` (index into `chains`), base64 uint8 `kind` (`0` = Cα, `1` = P) |
| `lod2` (optional) | Active-site heavy atoms: `count`, `positions`, uint8 `element` (atomic number), uint8 `chain`, uint16 `bonds` pairs, `bondCount`, `anchor`, `radius` |
| `anchors` | Named frames `{ o, R }`; `center` is mandatory |
| `tracks` | Slot tracks: `{ kind: "dna" \| "rna", registers: consecutive ascending integers, frames: [{ o, R }], synthetic: [0 \| 1], bases: string }`. A frame maps standard base coordinates (section 1) into the asset frame, exactly like `nucleotide.frame`. `synthetic[i] = 1` marks a frame that was interpolated or invented rather than fitted to observed atoms. |

`assets/manifest.json` lists `{ id, file, synthetic }` for every committed asset.

### 6.3 RNA polymerase asset conventions (`rnap-ec`)
- Origin: centre of the base pair formed by the RNA 3′-terminal nucleotide and its template partner.
- `+z`: downstream DNA duplex axis, pointing in the direction RNAP travels. `+x`: the component of (protein centroid − origin) perpendicular to `z`. `+y = z × x`.
- Track registers: `rna` register `−1` is the 3′-terminal nucleotide, decreasing toward the 5′ end. `template` register `r ≤ −1` pairs with `rna` register `r`; `template` register `0` is the next templating base (i+1 site); positive registers are downstream. `nontemplate` uses the register of its template partner.
- Required anchors: `center`, `activeSite`, `dnaEntry`, `dnaExit`, `rnaExit`.
- Parts: `core` (α₂ββ′ω). A holoenzyme asset adds `sigma`.

### 6.4 Visual tokens for machine actors
Renderers must use these values so every machine reads as one family with the existing scene.

| Token | Value |
| :--- | :--- |
| RNAP core part | `0x4fb6ff` (existing RNAP colour) |
| RNAP chain tints (L1) | α `0x8fd0ff`, β `0x4fb6ff`, β′ `0x2f8fe0`, ω `0xb9e2ff` |
| σ⁷⁰ part | `0xb58cff` |
| 30S / 50S parts (reserved for Wave 2) | `0x38d9a9` / `0x63e6be` |
| Fixture parts | core `0x4fb6ff`, accessory `0xb58cff` |
| L0 envelope material | `MeshStandardMaterial`, roughness `0.55`, metalness `0`, transparent, `depthWrite: false`, opacity `0.30` when it is the only level shown and `0.10` when L1 is shown |
| L1 bead radius | Cα `1.9 Å`, P `2.4 Å`; same sphere geometry and material parameters as the peptide residue beads in `js/render/molecule.js` |
| L2 atoms | Ball radius = `BALL_SCALE` × element radius as in `MoleculeLayer`; bond radius `BOND_RADIUS`; colours from `ELEMENT_INFO` for C, N, O, P; S `0xe6c84a`, Mg `0x7dff7a`, Zn `0x8f9cc9`, other `0xb0b8c8` |
| Level selection | `ratio = cameraDistance / bounds.radius`. `ratio > 6`: L0 only. `2.5 < ratio ≤ 6`: L1 plus faint L0. `ratio ≤ 2.5`: L1 plus L2, L0 hidden. Cross-fade 250 ms. Quality tier `low`: never show L2. |
| Cutaway | One clipping plane through the `activeSite` anchor, normal toward the camera, applied to L0 and L1 only |
| Labels | Existing blob tag style from `js/render/overlay.js` |

### 6.5 True-scale construct (`TRUE_SCALE_GENE_CONSTRUCT`, 150 bp)
Coding strand, 5′→3′, 0-based half-open DNA indices. `DEFAULT_GENE_CONSTRUCT` (48 bp) stays unchanged until the simulation migrates in Wave 2.

| Region | Range | Sequence |
| :--- | :--- | :--- |
| Upstream | `[0, 10)` | `CGACTGCATC` |
| −35 element | `[10, 16)` | `TTGACA` |
| Spacer (17 bp) | `[16, 33)` | `GCTAGCTCAGTCCTAGG` |
| −10 element | `[33, 39)` | `TATAAT` |
| Discriminator | `[39, 45)` | `GCTAGC` |
| 5′ UTR leader (+1 at index 45) | `[45, 56)` | `ACTCTAACTAT` |
| Shine–Dalgarno | `[56, 62)` | `AGGAGG` |
| SD–start spacer (7 nt) | `[62, 69)` | `TAACATA` |
| ORF (11 sense codons) | `[69, 102)` | `ATGGCTGAATTTAAAGGTTCTGACTACCAAGCT` |
| Stop | `[102, 105)` | `TAA` |
| Linker | `[105, 109)` | `ACTC` |
| Terminator stem 5′ | `[109, 117)` | `GGCGCCTG` |
| Terminator loop | `[117, 121)` | `GAAA` |
| Terminator stem 3′ | `[121, 129)` | `CAGGCGCC` |
| U-tract | `[129, 137)` | `TTTTTTTT` |
| Downstream | `[137, 150)` | `GACTCAGTCAGCA` |

Transcript: DNA `[45, 137)`, 92 nt, `ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU`; start codon at mRNA `[24, 27)`; stop codon at mRNA `[57, 60)`. The construct is synthetic. Ending the transcript at the last U of the U-tract is a simplification.

### 6.6 Residue and substrate templates
- `residueTemplate(code3)` returns `{ code3, names, el, local: Float32Array, bonds, index }` with PDB atom names and element symbols as strings (`'C' | 'N' | 'O' | 'S'`). Local frame: Cα at the origin.
- `buildPeptide(codes3, opts)` returns `{ atoms: { count, pos: Float32Array, el: string[], name: string[], residue: Uint16Array }, bonds: Uint16Array, residues: [{ index, code3, atomStart, atomCount, ca: [x, y, z] }] }`. It does not touch `Assembly`.
- `ntpTemplate(base)` returns the same shape as `nucleotideTemplate(base, 'ribose')` with the β- and γ-phosphate atoms appended.
