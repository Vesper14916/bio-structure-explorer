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
    - `[0, 4)` (4 bp) abbreviated −10 element `TATA`
    - `[4, 12)` (8 bp) 5′ UTR `AGGAGGTA` with Shine–Dalgarno `AGGAGG` at `[4, 10)`
    - `[12, 45)` (33 bp, 11 sense codons) coding region (`ORF`):
      - Coding DNA ($5'\to 3'$): `ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT`
      - mRNA ($5'\to 3'$): `AUG GCU GAA UUU AAA GGU UCU GAC UAC CAA GCU`
      - Amino acids ($N\to C$): `fMet (M) - Ala (A) - Glu (E) - Phe (F) - Lys (K) - Gly (G) - Ser (S) - Asp (D) - Tyr (Y) - Gln (Q) - Ala (A)`
    - `[45, 48)` (3 bp, codon index 11) stop `TAA` / `UAA`, recognised by RF1, adds no amino acid.
    - mRNA: DNA `[4, 48)`, 44 nt.

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
Renderers must use these values so every machine reads as one family with the existing scene. Updated in W0 (2026-11-18) with the Round 3 locked palette (`PLAN.md` §4.3, D12).

| Token | Value |
| :--- | :--- |
| RNAP core part | `0x4fb6ff` (existing RNAP colour) |
| RNAP chain tints (L1) | α `0x8fd0ff`, β `0x4fb6ff`, β′ `0x2f8fe0`, ω `0xb9e2ff` |
| σ⁷⁰ part | `0xb58cff` |
| 30S subunit (`small`) | L0 `0xe4dcc4`; L1: `rRNA16S` `0xf0eadb`, `rprotein30S` `0xc9bd9c` (replaces Round 1 `0x38d9a9`) |
| 50S subunit (`large`) | L0 `0xd2b183`; L1: `rRNA23S` & `rRNA5S` `0xe0c59f`, `rprotein50S` `0xb38f5e` (replaces Round 1 `0x63e6be`) |
| tRNA initiator (`trna-init`) | `0xffd43b` |
| tRNA elongator (`trna-aa`) | `0xff922b` |
| RF1 (`rf1`) | `0xff6b6b` |
| EF-Tu (`ef-tu`) | `0xf783ac` |
| EF-G (`ef-g`) | `0xa9e34b` |
| IF1 / IF2 / IF3 (`if1`, `if2`, `if3`) | `0xd0bfff` / `0xb197fc` / `0x9775fa` |
| NusG (`nusg`) | `0x15aabf` |
| Fixture parts | core `0x4fb6ff`, accessory `0xb58cff` |
| Crowders (`crowdColor(hex)`) | Machine L0 part colour mixed 65 % toward `FOG_COLOR` (`0x0a1628`) in linear space; opacity `0.22`, `depthWrite: false`, L0 only, no labels, not pickable |
| L0 envelope material | `MeshStandardMaterial`, roughness `0.55`, metalness `0`, transparent, `depthWrite: false`, opacity `0.30` when it is the only level shown and `0.10` when L1 is shown |
| L1 bead radius | Cα `1.9 Å`, P `2.4 Å`; same sphere geometry and material parameters as the peptide residue beads in `js/render/molecule.js` |
| L2 atoms | Ball radius = `BALL_SCALE` × element radius as in `MoleculeLayer`; bond radius `BOND_RADIUS`; colours from `ELEMENT_INFO` for C, N, O, P; S `0xe6c84a`, Mg `0x7dff7a`, Zn `0x8f9cc9`, other `0xb0b8c8` |
| Level selection | `ratio = cameraDistance / bounds.radius`. `ratio > 6`: L0 only. `2.5 < ratio ≤ 6`: L1 plus faint L0. `ratio ≤ 2.5`: L1 plus L2, L0 hidden. Cross-fade 250 ms. Quality tier `low`: never show L2. |
| Cutaway | One clipping plane through the shot's cut anchor (default `activeSite`), normal toward the camera, applied to L0 and L1 only |
| Labels | Existing blob tag style from `js/render/overlay.js` |

### 6.5 True-scale construct (`TRUE_SCALE_GENE_CONSTRUCT`)
Superseded in Round 3 (ST1, task S1) by **Construct v3** (`version: 3`, 248 bp coding strand, 179-nt transcript over DNA `[45, 224)`, 40 sense codons `[69, 189)` + `TAA` stop `[189, 192)`, `PLAN.md` §5.1). `DEFAULT_GENE_CONSTRUCT` (48 bp) stays unchanged until cutover at Gate G4.
- `codonTable(construct = TRUE_SCALE_GENE_CONSTRUCT)` (`js/science/scenario.js`, re-exported from `js/science/index.js`) returns the 41 rows in the Round 1 `DEFAULT_CODONS` shape (`{ index, number, triplet, anticodon3to5, aa3, aa1, aaName, color, isInitiator, isStop }`).
- `AMINO_ACIDS` (`js/science/genetic-code.js`, re-exported from `js/science/index.js`) aliases `AMINO_ACID_INFO` for codon/peptide colouring.

### 6.6 Residue and substrate templates
- `residueTemplate(code3)` returns `{ code3, names, el, local: Float32Array, bonds, bondLengths, index }` with PDB atom names and element symbols as strings (`'C' | 'N' | 'O' | 'S'`). Local frame: Cα at the origin. Round 3 (S1) covers all 19 non-proline amino acids plus `FME` (20 templates total).
- `buildPeptide(codes3, opts)` returns `{ atoms: { count, pos: Float32Array, el: string[], name: string[], residue: Uint16Array }, bonds: Uint16Array, residues: [{ index, code3, atomStart, atomCount, ca: [x, y, z] }] }`. It does not touch `Assembly`.
- `ntpTemplate(base)` returns the same shape as `nucleotideTemplate(base, 'ribose')` with the β- and γ-phosphate atoms appended.

---

## 7. Round 3 contracts (frozen 2026-11-19, Stage ST1 / W0)

Owner: Chief / Integration Owner. These contracts govern all Round 3 stages (ST1–ST10). A task that needs a contract change stops the affected part, files a proposal under `Requests` in its handoff, and awaits the Chief's decision in `docs/DECISIONS.md`. Per-asset frames, required anchors, superposition gates, and size budgets are defined in `PLAN.md` §7.2–§7.5.

### 7.1 Asset format v2 (`js/assets/format.js`) and registry (`js/assets/registry.js`)

Asset format v2 extends v1 (`docs/CONTRACTS.md` §6.2). Both `version: 1` and `version: 2` validate and decode through `validateAsset` and `decodeAsset`.

| Field / Addition | Schema & semantics |
| :--- | :--- |
| `version` | `2` (`SUPPORTED_VERSIONS = [1, 2]`). Existing v1 files (`rnap-ec`, `rnap-holo`) remain valid. |
| `source` | Primary PDB fields (`type: "pdb"`, `pdbId`, `title`, `method`, `organism`, `downloaded`, `sha256`, `license`) are required for PDB assets. Multi-source assets (e.g. `ribosome-70s` combining 7K00 + 7ST2 + 5WE4 + 7PJV) store the primary PDB in `source` and may record secondary PDB entries in `source.additionalSources` / `source.notes`. |
| `parts[].role` | Optional string enum: `"body" \| "replaceable" \| "release"`. `decodeAsset` normalizes absent roles to `"body"`. |
| `chains[].subunit` | Optional L1 tint tag recognized by `js/render/actors.js`: `alpha`, `beta`, `betaPrime`, `omega`, `sigma70`, `rRNA16S`, `rprotein30S`, `rRNA23S`, `rRNA5S`, `rprotein50S`. For `small`/`large` ribosome parts without `subunit`, `chainColor` falls back by `(partId, chain.class)`. |
| `anchors[name]` | Rigid frame `{ o, R }` (orthonormal, error ≤ 1e-4); `anchors.center` is required. Optional metadata such as `synthetic: 1` (e.g. RNAP `ntpEntry`) is permitted. |
| `lod2` / `lod2.sites` | Optional block (omitted for factors without L2 sites). In `version: 2`, `lod2.sites` MUST be a non-empty array `[{ anchor: string, radius: number }]` (legacy `lod2.anchor` alone is rejected on v2); every `anchor` must exist in `anchors` and `radius > 0`. In `version: 1`, `lod2.anchor` (present in `anchors`) and `lod2.radius > 0` are validated. On decode, `lod2.sites` is always normalized to an array and `lod2.anchor`/`lod2.radius` mirror `sites[0]`. |
| `tracks[name]` | `{ kind: "dna" \| "rna", registers: int[], frames: Frame[], synthetic: (0 \| 1)[], bases: string, sources?: string[] }`. `registers` must be consecutive ascending integers; `synthetic` entries MUST be strictly `0` (fitted from any PDB) or `1` (interpolated/synthetic). Optional `sources` (length `n`, e.g. `"7K00"`, `"7ST2"`, `"synthetic"`) may record per-register provenance (`DEC-008`). |
| `paths` | Optional map `{ [name]: { points: base64 int16 xyz, count: int >= 2, synthetic: 0 \| 1 \| (0 \| 1)[] } }`. Decoded as `{ points: Float32Array (length count*3), count, synthetic }`. Consumers must accept both scalar `0 \| 1` and per-point `Array<0 \| 1>` (`DEC-002`). Used for `tunnel` (ribosome) and `coupledMrna` (RNAP expressome). |

**Pipeline layout (`tools/build-assets.mjs` and `tools/assets/<recipe>.mjs`):**
- CLI: `node tools/build-assets.mjs [--only <id1,id2,...>] [--check] [--dry-run] [--quiet]`.
- Each recipe module exports either `{ id, sources: [pdbId...], dependsOn?: [id...], build(ctx) }` or `recipes: [...]`.
- `build(ctx)` may return either `asset` directly or `{ asset, report, ...extras }`; the wrapped object is stored in `ctx.built.get(id)` for downstream `dependsOn` recipes.
- `ctx` provides `{ root, sourcesDir, lock, lockEntry(pdbId), loadSource(pdbIdOrEntry), built, log, LICENSE }`. `ctx.loadSource` caches parsed mmCIF structures per PDB ID across recipes. Recipes MUST load PDBs via `ctx.loadSource(pdbId)` / `ctx.lockEntry(pdbId)` rather than filtering `sources.lock.json` by `target` (since shared PDBs like `7K00`, `5WE4`, `7PJV`, `6ZTJ`, `7YPA` serve multiple assets).
- Running `--only <id>` (without `--check`) merges the targeted asset IDs into the existing `assets/manifest.json` while preserving all other entries.
- `tools/fetch-sources.mjs` (`npm run fetch-sources`) downloads all entries from `tools/sources.lock.json` into `tools/sources/` (gitignored), decompresses `.cif.gz`, and verifies SHA-256 and byte length.
- `tools/lib/superpose.mjs` exports `superpose(mobilePts, targetPts)` (`{ R, t, o, rmsd, n }`) and `superposeIterative(mobilePts, targetPts, { cutoff = 2.0, passes = 2 })`.
- `tools/lib/match.mjs` exports `matchResidueAtoms(mobileChain, targetChain, atomName)` and `matchChains(mobileChains, targetChains, chainPairs, atomName)`.

**Asset registry (`js/assets/registry.js`):**
- `loadManifest(opts)` -> `Promise<{ version, assets: [{ id, file, synthetic }] }>`
- `loadAsset(id, opts)` -> `Promise<DecodedAsset>`
- `loadAssets(ids, opts)` -> `Promise<{ [id]: DecodedAsset }>`
- `clearAssetCache()`
- Resolution order: in-memory cache -> inlined standalone store (`globalThis.__HELIX_ASSETS__` / `window.__HELIX_ASSETS__`, bypassed when explicit `opts.fetch` or `opts.assetsDir` is passed without `opts.inlined`) -> Node disk (`assets/manifest.json`) or browser same-origin `fetch`.

### 7.2 Module layout

| Layer | Path | Responsibility | Depends on |
| :--- | :--- | :--- | :--- |
| Science | `js/science/` | Construct v3, genetic code (`AMINO_ACIDS`, `codonTable`), 20 residue templates, NTP/PPi | — |
| Assets | `js/assets/format.js`, `js/assets/registry.js` | Decode and validate v1/v2 assets; load from manifest, disk, or inlined standalone bundle | science |
| Story | `js/sim/gene/`: `story.js`, `timeline.js`, `transcription.js`, `translation.js`, `coupled.js`, `shots.js` | Event list and `stateAt(t)`; zero DOM and zero three.js | science, assets |
| Kinematics | `js/kin/`: `frames.js`, `duplex.js`, `track.js`, `chain.js`, `hairpin.js`, `peptide-path.js`, `trna.js`, `ntp.js`, `pose.js` | WorldState -> atom positions and machine transforms; pure functions on typed arrays | science, assets |
| Scene | `js/scene/`: `story-scene.js`, `camera-rails.js`, `crowd.js`, `labels.js` | Builds Assembly and atom groups, calls viewer API, applies shots, owns crowders and labels | all above, `js/render/` |
| Render | `js/render/` (plus `atom-groups.js`, `fx.js`) | Existing layers plus instanced atom groups and event effects | three.js |
| UI | `js/ui/view-story.js`, `js/ui/inspect.js` | Express v2 panel and inspection card | dom |
| App | `js/main.js` | Application wiring (Chief only); routes `?mode=express&scene=v2` until G4 | all |

### 7.3 Story API (`js/sim/gene/`)

```js
// js/sim/gene/story.js
export function buildStory(scenario, assets, { mode = 'sequential', seed = 19 } = {}) // -> Story
export function stateAt(story, t, out = undefined) // -> WorldState; reuses `out` when given
export function chapterAt(story, t)                // -> Chapter
```

- **`Story`:** `{ mode: 'sequential' | 'coupled', duration: number, chapters: Chapter[], events: Event[], meta: object }`
- **`Chapter`:** `{ index: number, id: string, title: string, group: 'O' | 'T' | 'I' | 'E', t0: number, t1: number, shot: string, caption: string }`
- **`Event`:** `{ id: string, type: EventType, t0: number, t1: number, chapter: number, data: object }` (times in seconds at 1×; sorted by `t0`, then `id`; unique stable id `<type>:<n>`).
- **Allowed `EventType` values (26):** `machine.move`, `machine.bind`, `part.release`, `dna.open`, `dna.close`, `dna.relax`, `ntp.enter`, `bond.phosphodiester`, `ppi.leave`, `rna.hairpin`, `rna.release`, `mrna.layout`, `ribosome.bind`, `ribosome.join`, `factor.enter`, `factor.leave`, `gtp.hydrolyse`, `trna.enter`, `trna.move`, `trna.leave`, `codon.pair`, `bond.peptide`, `translocate`, `peptide.release`, `couple.lock`, `couple.unlock`.
- **Plug points:** `js/sim/gene/transcription.js` exports `contributeTx(story, t, out)`; `js/sim/gene/translation.js` exports `contributeTl(story, t, out)`; `js/sim/gene/coupled.js` exports `buildCoupledTimeline(scenario, assets, opts)` and `contributeCoupled(story, t, out)`.

**`WorldState` schema (all coordinates in world ångströms):**

| Field | Type & semantics |
| :--- | :--- |
| `t` | `number` (story time in seconds at 1×) |
| `chapter` | `Chapter` |
| `chapterProgress` | `number` in `[0, 1]` |
| `caption` | `string` (exact plain-text caption from `PLAN.md` §6.2 or §6.4; `"E. coli"` without markdown asterisks per `DEC-006`) |
| `machines` | `Array<{ id, assetId, transform: { o, R }, opacity, visible, parts: { [partId]: { visible, opacity, transform? } }, label, pickable }>` |
| `dna` | `{ machineId: 'rnap' \| null, register: number /* gene index of template register 0; fractional while stepping */, bend: number /* β in [0, 1] */, bubble: [lo, hi] /* registers relative to template register 0 */, relax: number /* [0, 1] */, trackBlend?: number /* [0, 1]: 0 = rnap-holo tracks, 1 = rnap-ec tracks; default 1 for rnap-ec, 0 for rnap-holo (DEC-007) */ }` |
| `rna` | `{ length: number /* integer */, addProgress: number /* [0, 1] for the next nucleotide */, hairpin: number /* [0, 1] */, released: boolean, layout: 'rnap' \| 'free' \| 'ribosome' \| 'coupled', layoutBlend: number /* [0, 1] */ }` |
| `ribosome` | `{ codon: number /* P-site codon index, fractional during translocation */, bound: boolean }` |
| `trnas` | `Array<{ slot: 0..3, kind: 'init' \| 'aa', aa: 'fMet' \| code3 \| null, site: 'AT'\|'A'\|'AP'\|'P'\|'PE'\|'E'\|'out', from: site, blend: number /* [0, 1] */, codon: number, opacity: number, peptidyl: boolean }>` |
| `peptide` | `{ length: number, attach: 'P' \| 'A' \| 'free', release: number /* [0, 1] */ }` |
| `ntp` | `{ base: 'A'\|'C'\|'G'\|'U' \| null, path: number /* [0, 1] */, bonded: boolean }` |
| `ppi` | `{ path: number /* [0, 1] */, opacity: number }` |
| `fx` | `Array<{ type: 'pulse' \| 'gtp', anchor: { machineId, name } \| { atomGroup, atoms: [i, j] }, f: number /* [0, 1] */ }>` |
| `counters` | `{ mrna: number, hybrid: number, codon: number, peptide: number }` |
| `highlight` | `{ codon: number \| null }` |
| `shot` | `{ id: string, from: string \| null, blend: number /* [0, 1] */ }` |

**Invariants and budget:**
- `stateAt` is a pure function of `(story, t)`. It MUST NOT read the clock, DOM, or global mutable state.
- With `out` supplied, `stateAt` MUST NOT allocate per call except for strings.
- Median runtime ≤ 2 ms in Node 22 for any `t`.

### 7.4 Kinematics API (`js/kin/`)

```js
// js/kin/pose.js
export function createPoser(scenario, assets) // -> Poser (precomputes templates, typed buffers)
// Poser.pose(world: WorldState, target: { asm: Assembly, groups: AtomGroups, actors: ActorSpec[] })
//   writes nucleotide frames into target.asm (then calls target.asm.updatePositions()),
//   atom-group positions into target.groups, and actor transforms into target.actors.
```

- Median runtime ≤ 6 ms per `pose` call for the full scene in Node 22.
- **World frame:** `+x` runs along the gene's downstream axis, `+y` is up, gene midpoint (bp 124) is at `[0, 0, 0]`.
- **Duplex algorithm (`js/kin/duplex.js`):**
  1. Template frames inside track range `[r0, r1]`: `F_r = M · T_r` (linear origin + quaternion slerp for fractional `r`).
  2. Downstream arm (`r > r1`): `F_r = M · T_{r1} · S(r - r1)` where `S(x)` is B-DNA screw step (`3.38·x` Å, `34.2857·x` deg about local `z`, right-multiplied so `F · S(1)` is 3′-ward on the coding strand).
  3. Upstream arm (`r < r0`): cubic Bézier in machine frame (`P0 = o(T_{r0})`, `t0 = -z(T_{r0})`, `tE = -z_d`, `L = 40 × 3.38 Å`, `P1 = P0 + t0·L/3`, `P3 = P0 + (t0 + tE)·L/2`, `P2 = P3 - tE·L/3`); beyond `P3` the axis continues straight along `tE`. Uses a 512-sample arc-length table and rotation-minimising frames (double-reflection) seeded from `T_{r0}` with twist `-34.2857°/bp` going upstream.
  4. Bending blend `β`: `t0 -> slerp(tE, t0, β)` and track frames `-> slerp(ideal, track, β)`. At `β = 0`, duplex is ideal and straight.
  5. Strands: coding strand is `partnerFrame(template)` outside bubble; `nontemplate` track inside bubble (synthetic where flagged).
  6. Relaxation: freeze last machine pose and drive `β` from 1 to 0 over `dna.relax`.
- **Machine motion along DNA:** `M(t) = M_0 · translate(z_d · 3.38 · (register(t) - register_0))` (no rotation). Promoter binding uses `rnap-holo` with its RPo tracks (`dna.trackBlend = 0`). At promoter escape (chapter 5), `dna.trackBlend` ramps from `0` to `1` over 1.5 s to slerp track frames from `rnap-holo` to `rnap-ec` per register, and `machines[rnap].assetId` switches to `rnap-ec` at `trackBlend = 0.5` (`σ` is released first).
- **Free chains (`js/kin/chain.js`):** centripetal Catmull–Rom splines, 512-sample arc-length table, A-form single strand (`rise 2.81 Å`, `twist 32.73°`, RMF), deterministic tail control points from `mulberry32(seed ^ hash(chainId))` every 20 nt (turn ≤ 35°), gentle sinusoidal normal sway `6 Å · sin(2π(t/7 + φ_k))` ramped to 0 within 30 Å of any anchor.
- **Peptide on path (`js/kin/peptide-path.js`):** Cα of residue `k` (`k = 0` is the C-terminal residue attached to the tRNA; higher `k` advances toward the N-terminus) sits at arc length `k · 3.40 Å` along `tunnel` then along the free-peptide spline. Residue atoms come from per-residue local frames measured once on the ideal `buildPeptide` chain (`x = Cα(i+1) − Cα(i−1)`, `y = perpendicular component of Cβ or Hα direction`, alternating 180° per residue) and re-applied on the path's rotation-minimising frames. Gate: every `C(i)–N(i+1)` distance within `1.33 ± 0.25 Å` at every tested time.

### 7.5 Scene, Viewer, and UI APIs (`js/scene/`, `js/render/`, `js/ui/`)

```js
// js/scene/story-scene.js
export function createStoryScene(viewer, { scenario, assets, mode, tier }) // -> StoryScene
// StoryScene: { story, seek(t), play(), pause(), setSpeed(v), setMode(mode), setCameraOption(opt),
//               setToggles({ cutaway, labels, crowding }), pick(hit) -> InspectInfo | null,
//               state() -> UiState, dispose() }
```

- **`UiState`** merged into `ui.setExpressState`: `{ progress, playing, speed, mode, chapterIndex, chapters, caption, phaseLevel, cameraOption, counters, codons, activeCodon, peptideSeq, inspect }`.
- **Viewer additions (owned by R1 and R2, wired by Chief):**
  - `viewer.setDetailFocus({ center, radius })` (ball-and-stick inside `radius`, 12 Å cross-fade band, cartoon outside)
  - `viewer.setAtomGroups(groups)` (instanced balls/bonds/Cα tube for `{ id, count, pos, el, bonds, color?, opacity, detail? }`)
  - `viewer.setFx(list)` (bond pulse and `GTP → GDP` cue)
  - `viewer.setCrowd(instances)` (`[{ assetId, transforms: Float32Array }]`, L0 only with `crowdColor`)
  - `viewer.setLabels(list)` (priority-ordered, max 6 visible, 250 ms fades)
  - `viewer.setFar(far)` (camera far plane; W0 sets default far to `12000`)
- **UI actions (`onExpression({ action, value })`):** `play`, `pause`, `restart`, `seek`, `speed`, `mode`, `camera`, `toggle`, `chapter`, `selectCodon`, `clearInspect`.
- **Camera far plane:** `12000` (raised from `5000` in W0).


