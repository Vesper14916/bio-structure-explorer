# Translation factor assets (`rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`)

Task R3-A3 (stage ST5). Recipe: `tools/assets/factors.mjs`. Tests: `tests/assets-factors.test.mjs`. Outputs: `assets/rf1.asset.json`, `assets/ef-tu.asset.json`, `assets/ef-g.asset.json`, `assets/if1.asset.json`, `assets/if2.asset.json`, `assets/if3.asset.json` (asset format v2). Design basis: `PLAN.md` §7.2–§7.5 and §10 (R3-A3), `docs/CONTRACTS.md` §7.1, `docs/DECISIONS.md` DEC-010, DEC-011, DEC-012, and DEC-019.

## 1. Provenance

Every source mmCIF is pinned in `tools/sources.lock.json` and loaded via `ctx.loadSource(pdbId)` (model 1, altloc `.` or `A`, hydrogens and waters excluded). All six factor chain IDs were confirmed directly against the downloaded mmCIF files and match `PLAN.md` §7.2 with no chain-ID differences.

| Asset | PDB ID | Method & resolution | Revision date | Organism | Factor chain | Modelled author range (aa) | Raw PDB entity description | rRNA chain(s) used for superposition | Excluded ligands / molecules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rf1` | `8FZH` | Cryo-EM, 2.9 Å | 2026-09-23 | *Escherichia coli* | `w` | 2–357 (349 aa; gaps 1, 290–296 unmodelled) | Peptide chain release factor 1 | `A` (23S) | P/E tRNAs, mRNA, ribosomal subunits, waters, ions outside `ggq` 8 Å (1 Mg²⁺ kept in L2) |
| `ef-tu` | `5WE4` | Cryo-EM, 3.1 Å | 2026-09-23 | *Escherichia coli* | `z` | 1–393 (393 aa) | Elongation factor Tu 2 | `a` (16S), `A` (23S) | GDPNP (`GNP`), A/T tRNA, mRNA, ribosomal subunits, ions, waters |
| `ef-g` | `7PJV` | Cryo-EM, 3.1 Å | 2026-06-24 | *Escherichia coli* (strain K12) | `x` | 1–703 (703 aa; Met1 cleaved) | Elongation factor G | `A` (23S) | GDP, Pi, hybrid tRNAs, mRNA, ribosomal subunits, ions, waters |
| `if1` | `9ZN2` | Cryo-EM, 3.0 Å | 2026-09-30 | *Escherichia coli* | `y` | 1–72 (72 aa) | Translation initiation factor IF-1 | `a` (16S), `A` (23S) | IF2, GDPCP, fMet-tRNA, mRNA, ribosomal subunits, ions, waters |
| `if2` | `9ZN2` | Cryo-EM, 3.0 Å | 2026-09-30 | *Escherichia coli* | `x` | 296–890 (595 aa; NTD 1–295 unmodelled) | Translation initiation factor IF-2 | `a` (16S), `A` (23S) | IF1, GDPCP, fMet-tRNA, mRNA, ribosomal subunits, ions, waters |
| `if3` | `9FDA` | Cryo-EM, 2.0 Å | 2025-03-19 | *Escherichia coli* | `J` | 76–177 (102 aa; NTD 1–75 unmodelled) | Translation initiation factor IF-3 | `B` (16S; 30S-only structure) | **Edeine B** (antibiotic, entity 18), IF1, mRNA, 30S subunit, ions, waters |

Reference frame target: **PDB `7K00`** ("Structure of the Bacterial Ribosome at 2 Angstrom Resolution", cryo-EM 1.98 Å, revision 2026-09-23, *E. coli*, CC0 1.0 Universal), using `frameAtoms(ctx.sourcesDir)` from `tools/assets/ribosome.mjs` (`16S` chain `A`, `23S` chain `a`) already transformed into the `ribo` frame.

Source titles (all wwPDB CC0 1.0 Universal):
- `8FZH`: *Cryo-EM structure of an E. coli non-rotated ribosome termination complex bound with RF1, P- and E-site tRNAPhe (State II-D)*
- `5WE4`: *70S ribosome-EF-Tu wt complex with GppNHp*
- `7PJV`: *Structure of the 70S-EF-G-GDP-Pi ribosome complex with tRNAs in hybrid state 1 (H1-EF-G-GDP-Pi)*
- `9ZN2`: *Escherichia coli 70S ribosome initiation complex bound to IF1 and extended IF2-GDPCP (70S IC\*)*
- `9FDA`: *Structure of E. coli 30S-IF1-IF3-mRNA-Edeine complex*

## 2. Coordinate frame and superposition into `ribo`

Every factor asset is stored directly in the `7K00` `ribo` frame (`PLAN.md` §7.3), so its bound pose on `ribosome-70s` is the identity transform.

Superposition procedure (`PLAN.md` §7.3, `DEC-010`, `DEC-011`):
1. Extract rRNA backbone P atoms from the mobile source chains and from `7K00` `frameAtoms(ctx.sourcesDir)` (already in `ribo` coordinates).
2. Match mobile and reference residues by `(auth_seq_id, comp)` using `tools/lib/match.mjs` (`{ key: 'authSeq', matchComp: true }`, per `DEC-011`). Composition mismatches are excluded and counted as `mismatches`.
3. Fit a rigid Kabsch transform with `superposeIterative(mobilePts, targetPts, { cutoff: 2.0, passes: 2 })` from `tools/lib/superpose.mjs`.
4. Enforce both `DEC-010` gates: final `rmsdAfterA <= 1.5` Å **and** `keptFraction = nAfter / nBefore >= 0.50`.

### Selected superposition fits

| Asset | Source | Scope | Mobile -> 7K00 chains | `nBefore` | `nAfter` | `keptFraction` | `rmsdBeforeA` (Å) | `rmsdAfterA` (Å) | `mismatches` | Gates (`≤ 1.5 Å`, `≥ 50%`) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `rf1` | `8FZH` | **`23S`** | `A -> a` | 2,753 | 2,195 | **0.797** (79.7%) | 1.728 | **1.408** | 0 | Pass |
| `ef-tu` | `5WE4` | `16S+23S` | `a -> A`, `A -> a` | 4,248 | 4,116 | **0.969** (96.9%) | 1.000 | **0.606** | 21 | Pass |
| `ef-g` | `7PJV` | **`23S`** | `A -> a` | 2,749 | 2,600 | **0.946** (94.6%) | 1.223 | **0.777** | 4 | Pass |
| `if1` | `9ZN2` | `16S+23S` | `a -> A`, `A -> a` | 4,270 | 2,166 | **0.507** (50.7%) | 2.556 | **1.291** | 0 | Pass |
| `if2` | `9ZN2` | `16S+23S` | `a -> A`, `A -> a` | 4,270 | 2,166 | **0.507** (50.7%) | 2.556 | **1.291** | 0 | Pass |
| `if3` | `9FDA` | `16S` | `B -> A` | 1,047 | 978 | **0.934** (93.4%) | 1.277 | **0.985** | 1 | Pass |

### Diagnostic alternative scopes and rationale

Every multi-subunit entry was also evaluated on its alternative rRNA scopes and stored in `source.superpositionAlternatives`:

| Entry | Scope tested | `nBefore` | `nAfter` | `keptFraction` | `rmsdBeforeA` (Å) | `rmsdAfterA` (Å) | Passes `DEC-010`? |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `8FZH` (`rf1`) | `16S+23S` | 4,272 | 2,069 | **0.484** | 2.361 | 1.407 | **No** (`keptFraction < 0.50`) |
| `8FZH` (`rf1`) | `16S` | 1,519 | 841 | 0.554 | 2.170 | 1.350 | Yes |
| `5WE4` (`ef-tu`) | `23S` | 2,730 | 2,652 | 0.971 | 0.778 | 0.497 | Yes |
| `5WE4` (`ef-tu`) | `16S` | 1,518 | 1,466 | 0.966 | 1.189 | 0.579 | Yes |
| `7PJV` (`ef-g`) | `16S+23S` | 4,268 | 551 | **0.129** | 5.541 | 1.233 | **No** (`keptFraction < 0.50`) |
| `7PJV` (`ef-g`) | `16S` | 1,519 | 1,158 | 0.762 | 1.828 | 1.085 | Yes |
| `9ZN2` (`if1`/`if2`) | `23S` | 2,753 | 2,599 | 0.944 | 1.408 | 1.121 | Yes |
| `9ZN2` (`if1`/`if2`) | `16S` | 1,517 | 976 | 0.643 | 2.155 | 1.247 | Yes |

Key observations for ST5 review:
- **`8FZH` (`rf1`) uses `23S` instead of `16S+23S`:** Although `8FZH` is a non-rotated 70S termination complex, its deposited map exhibits a **+2.68% isotropic cryo-EM pixel-size / magnification offset** relative to `7K00` (radius of gyration of matched 16S+23S P atoms: 82.394 Å in `8FZH` vs 80.245 Å in `7K00`; 16S +2.86%, 23S +2.55%). Under a rigid `16S+23S` fit, outer P atoms drift past the 2.0 Å cutoff, dropping kept atoms to `2,069 / 4,272 = 48.4%`, which fails the `DEC-010` ≥ 50% gate. Fitting on `23S` retains **79.7%** (`2,195 / 2,753`) at **1.408 Å** RMSD, anchors the catalytic `ggq` motif accurately in the 50S PTC (`5.961 Å` from the `ribosome-70s` `ptc` anchor), and improves `codonReader` alignment to the `siteA` codon (`7.610 Å` vs `7.956 Å` under `16S+23S`, well inside the 10 Å gate). No isotropic rescaling is applied, keeping the transform strictly rigid per `PLAN.md` §7.3.
- **`7PJV` (`ef-g`) uses `23S` per `DEC-010`:** `7PJV` is a rotated hybrid-state ribosome; `16S+23S` retains only `12.9%` (`551 / 4,268`, initial RMSD 5.541 Å). Fitting on `23S` retains **94.6%** (`2,600 / 2,749`) at **0.777 Å** RMSD, anchoring EF-G's G-domain against the 50S factor-binding site / sarcin–ricin loop (`15.313 Å`).
- **`9ZN2` (`if1`, `if2`) uses `16S+23S`:** `9ZN2` also has a +2.28% isotropic magnification offset relative to `7K00` (`Rg` 82.060 vs 80.228 Å), yet `16S+23S` still clears both `DEC-010` gates (`50.7%` kept, `1.291 Å` RMSD), placing both the 30S-bound `if1` and the inter-subunit `if2` in a single consistent rigid frame.
- **`9FDA` (`if3`) uses `16S`:** `9FDA` is a 30S-only initiation complex (1,051 modelled nucleotides in 16S chain `B`, 1,047 matched to `7K00` chain `A` with 1 composition mismatch); fitting retains **93.4%** (`978 / 1,047`) at **0.985 Å** RMSD.

## 3. Anchors and geometry acceptance checks

All anchor rotations are identity (`[1, 0, 0, 0, 1, 0, 0, 0, 1]`), and all origins are in the `ribo` frame (rounded to 3 decimals).

| Asset | Anchor | Definition | Motif / residue range (author) | Origin in `ribo` frame (Å) |
| --- | --- | --- | --- | --- |
| `rf1` | `center` | Centroid of all L1 Cα beads | 2–357 (349 aa) | `20.922, 23.513, 30.432` |
| `rf1` | `ggq` | Centroid of Gly-Gly-Gln catalytic motif Cα atoms | `GGQ` (233–235, 3 aa) | `70.412, 9.293, -5.695` |
| `rf1` | `codonReader` | Centroid of PxT stop-codon recognition motif Cα atoms | `PAT` (188–190, 3 aa) | `-6.812, 9.192, 14.481` |
| `ef-tu` | `center` | Centroid of all L1 Cα beads | 1–393 (393 aa) | `41.904, 4.451, 74.531` |
| `ef-tu` | `gDomain` | Centroid of Walker A P-loop (`GxxxxGK[ST]`) Cα atoms | `GHVDHGKT` (18–25, 8 aa) | `56.307, 9.606, 70.237` |
| `ef-g` | `center` | Centroid of all L1 Cα beads | 1–703 (703 aa) | `40.161, 13.380, 68.191` |
| `ef-g` | `gDomain` | Centroid of Walker A P-loop (`[GA]xxxxGK[ST]`) Cα atoms | `AHIDAGKT` (16–23, 8 aa) | `57.775, 10.868, 70.750` |
| `ef-g` | `domainIV` | Centroid of Domain IV core Cα atoms | `ASN481..GLY603` (481–603, 123 aa) | `4.958, 27.712, 40.267` |
| `if1` | `center` | Centroid of all L1 Cα beads | 1–72 (72 aa) | `7.695, 11.195, 25.969` |
| `if2` | `center` | Centroid of all L1 Cα beads | 296–890 (595 aa) | `35.925, 5.945, 59.534` |
| `if2` | `gDomain` | Centroid of Walker A P-loop (`GxxxxGK[ST]`) Cα atoms | `GHVDHGKT` (398–405, 8 aa) | `55.298, 9.821, 72.309` |
| `if3` | `center` | Centroid of all L1 Cα beads | 76–177 (102 aa) | `17.143, 12.773, -11.217` |

### Motif notes
- **EF-G Walker A P-loop (`AHIDAGKT`, author 16–23):** *E. coli* EF-G (UniProt P0A6M8) canonically substitutes Ala at position 1 of the Walker A motif (`AHIDAGKT` rather than `GxxxxGK[ST]`; Met1 is cleaved in `7PJV`, giving author 16–23). In `7PJV`, the centroid of `AHIDAGKT` Cα atoms lies 6.576 Å from the bound GDP ligand and 15.313 Å from the `7K00` 23S sarcin–ricin loop, confirming its GTPase active-site identity.
- **EF-G Domain IV (`481–603`, 123 Cα atoms):** Author numbering 481–603 (`NVGKPQ...AFKEG`) corresponds to UniProt P0A6M8 residues 482–604 (standard structural boundaries of *E. coli* EF-G Domain IV, excluding the C-terminal Domain V helix α18 after residue 603).

### Geometry acceptance checks (`PLAN.md` §10 R3-A3)

| Check | Measured distance | Acceptance gate | Result |
| --- | ---: | --- | --- |
| `rf1` `codonReader` to `siteA` codon centroid (`ribosome-70s` `tracks.mrna` registers +3, +4, +5 = `[-4.126, 3.258, 18.417]`) | **7.610 Å** | ≤ 10 Å | Pass |
| `rf1` `ggq` to `ribosome-70s` `ptc` anchor (informational) | 5.961 Å | — | Verified |
| `ef-tu` `gDomain` to 7K00 23S SRL (author 2653–2667 `UAGUACGAGAGGACC`) heavy-atom centroid `[65.422, 15.522, 58.326]` | **16.123 Å** (15.284 Å to SRL P centroid) | ≤ 25 Å | Pass |
| `ef-g` `gDomain` to 7K00 23S SRL heavy-atom centroid (informational) | 15.313 Å (14.413 Å to SRL P) | — | Verified |
| `ef-g` `domainIV` to `ribosome-70s` `decoding` / `siteA` codon (informational) | 32.442 Å / 34.028 Å | — | Verified |
| `if2` `gDomain` to 7K00 23S SRL heavy-atom centroid (informational) | 18.180 Å (17.336 Å to SRL P) | — | Verified |

## 4. Levels of detail and budgets (`PLAN.md` §7.5)

### L0 (Gaussian envelope)
Each factor has a single part `body` (`role: 'body'`). Envelopes are generated from all heavy atoms of the factor chain via `envelope()` (`tools/lib/surface.mjs`), using `sigma = 5.0 Å, spacing = 3.5 Å` for the four larger factors (`rf1`, `ef-tu`, `ef-g`, `if2`) and `sigma = 4.0 Å, spacing = 2.5 Å` for the two compact initiation factors (`if1`, `if3`). Starting from an initial containment target of 0.95, the target is raised in steps of 0.005 until at least 95% of quantised L1 Cα beads pass the ray-parity inside test (`DEC-010`/§7.5). All six meshes are closed with outward winding (`meshStats`).

### L1 (Cα beads and `DEC-019` L3 colour safety)
One Cα bead (`kind = 0`) per modelled amino acid residue. Per `DEC-019` L3, every chain carries an explicit `subunit: assetId` tag and a `chains[0].name` free of RNAP subunit keywords (`alpha`, `beta`, `omega`, `sigma`) so `js/render/actors.js#chainColor()` resolves directly to the locked §4.3 `ACTOR_TOKENS.actorColor` palette (`rf1 #ff6b6b`, `ef-tu #f783ac`, `ef-g #a9e34b`, `if1 #d0bfff`, `if2 #b197fc`, `if3 #9775fa`). The verbatim PDB entity description is preserved in `source.entityDescription` and `source.chainsUsed`.

### L2 (`rf1` `ggq` site only)
`rf1` defines one L2 site: `{ anchor: 'ggq', radius: 8 }`. It includes all heavy atoms of every whole residue in chain `w` with at least one atom within 8.0 Å of `ggq.o`, plus any Mg²⁺ ion in `8FZH` within 8.0 Å of `ggq.o`:
- **Protein residues (10 residues, 69 heavy atoms):** `231GLY`, `232ALA`, `233GLY`, `234GLY`, `235GLN`, `236HIS`, `237VAL`, `238ASN`, `239THR`, `261ARG`.
- **Mg²⁺ ions (1 ion):** `8FZH` chain `x` author `102` (`MG`, 7.966 Å from `ggq.o`).
- **Total:** 70 atoms (`C`, `N`, `O`, `MG`), 68 covalent + peptide C–N bonds (covalent-radius rule within residues + peptide C–N ≤ 1.65 Å between consecutive residues).

### Measured budgets vs `PLAN.md` §7.5 limits

| Asset | L0 tris (≤ 8,000) | L0 verts | L0 σ / h (Å) | L1 inside (≥ 95%) | L1 beads (≤ 900) | L2 atoms (≤ 400) | File bytes (≤ 120,000) | Bounds center (Å) | Bounds radius (Å) |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: |
| `rf1` | 2,876 | 1,440 | 5.0 / 3.5 | 95.1% | 349 | 70 (68 bonds) | 44,681 | `29.405, 27.554, 29.460` | 59.064 |
| `ef-tu` | 2,060 | 1,032 | 5.0 / 3.5 | 95.2% | 393 | — | 32,964 | `43.078, 4.456, 75.247` | 39.468 |
| `ef-g` | 3,624 | 1,814 | 5.0 / 3.5 | 95.0% | 703 | — | 55,814 | `33.538, 12.739, 67.074` | 64.975 |
| `if1` | 1,140 | 572 | 4.0 / 2.5 | 95.8% | 72 | — | 18,547 | `6.273, 11.085, 29.094` | 19.657 |
| `if2` | 3,932 | 1,966 | 5.0 / 3.5 | 95.1% | 595 | — | 57,818 | `19.267, 7.050, 44.617` | 71.035 |
| `if3` | 1,540 | 772 | 4.0 / 2.5 | 95.1% | 102 | — | 23,373 | `16.274, 13.075, -21.208` | 34.009 |
| **Total** | **15,172** | **7,596** | — | — | **2,214** | **70** | **233,197** | — | — |

## 5. Clash report against `ribosome-70s` L1 beads (< 3.0 Å)

Per `PLAN.md` §10 R3-A3, every factor L1 Cα bead in the `ribo` frame was tested against all 10,126 L1 beads of `ribosome-70s` (`assets/ribosome-70s.asset.json` / `7K00`). There is no hard numeric gate; all beads within 3.0 Å are reported below and embedded in each asset's `source.clashes`.

### Summary

| Asset | Clashing L1 beads (< 3.0 Å) | Closest contact (Å) | Notes |
| --- | ---: | ---: | --- |
| `rf1` | 1 | 2.710 | Minor loop contact against 16S rRNA C519 |
| `ef-tu` | 0 | — | Clash-free |
| `ef-g` | 1 | 1.609 | Domain IV tip contact against 16S rRNA U1211 (expected from superposing rotated `7PJV` onto non-rotated `7K00` via 23S) |
| `if1` | 2 | 1.700 | Decoding-center loop contact against 16S rRNA A1493–G1494 (IF1 flips out A1492/A1493 on 30S) |
| `if2` | 0 | — | Clash-free |
| `if3` | 6 | 1.898 | **All 6 against 23S rRNA (50S H69)** — reflects IF3's physiological anti-association role blocking 50S joining until IF3 dissociates |

### Complete per-residue clash table (< 3.0 Å)

| Factor | Factor chain | Factor residue (author) | Distance (Å) | Nearest `ribosome-70s` chain | Nearest `ribosome-70s` residue (author) |
| --- | --- | --- | ---: | --- | --- |
| `rf1` | `w` | `ARG 303` | 2.710 | `A` (16S rRNA) | `C 519` |
| `ef-g` | `x` | `GLY 546` | 1.609 | `A` (16S rRNA) | `U 1211` |
| `if1` | `y` | `PRO 18` | 2.717 | `A` (16S rRNA) | `G 1494` |
| `if1` | `y` | `ASN 19` | 1.700 | `A` (16S rRNA) | `A 1493` |
| `if3` | `J` | `ILE 96` | 1.898 | `a` (23S rRNA) | `G 1922` |
| `if3` | `J` | `LYS 123` | 2.246 | `a` (23S rRNA) | `C 1924` |
| `if3` | `J` | `ALA 124` | 2.762 | `a` (23S rRNA) | `U 1923` |
| `if3` | `J` | `ARG 147` | 1.977 | `a` (23S rRNA) | `G 1910` |
| `if3` | `J` | `ASP 151` | 2.944 | `a` (23S rRNA) | `C 1909` |
| `if3` | `J` | `PRO 176` | 2.632 | `a` (23S rRNA) | `C 1925` |

## 6. Determinism

`node tools/build-assets.mjs --only rf1,ef-tu,ef-g,if1,if2,if3 --check --quiet` regenerates all six factor assets in memory and verifies byte-for-byte identity against the committed files. All residue maps, bond sets, and Mg²⁺ selections are deterministically ordered with no randomness.

## 7. Simplifications

- **Rigid single-state conformers:** Each factor is represented as a single rigid bound conformer in the `7K00` `ribo` frame. Conformational transitions (e.g., compact-to-open RF1 activation, GTP-hydrolysis-coupled domain rotations of EF-Tu / EF-G / IF2) are not modelled inside the asset geometry.
- **Unmodelled N-terminal domains:** `if2` starts at author residue 296 (the intrinsically disordered N-terminal domain 1–295 is absent in `9ZN2`), and `if3` covers its C-terminal domain 76–177 (the flexible N-terminal domain 1–75 is absent in `9FDA`).
- **Bound nucleotides and cofactors omitted:** GTP analogues (GDPNP in `5WE4`, GDPCP in `9ZN2`), GDP/Pi (`7PJV`), and the antibiotic edeine B (`9FDA`) are excluded per `PLAN.md` §7.2; only the single Mg²⁺ ion (`8FZH` chain `x` 102) within 8 Å of `rf1`'s `ggq` anchor is included in `rf1` L2.
- **L0 envelope:** Smooth Gaussian isosurface covering all heavy atoms of the factor chain, not a solvent-excluded molecular surface.
- **Anchor rotations:** All factor anchors use the identity rotation in the `ribo` frame; translation choreography positions factors directly by `ribo`-frame poses.
