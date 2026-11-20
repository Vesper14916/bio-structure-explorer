# Stage ST5 Independent Review (Argon) — A3 Superpositions & A4 Coupling Distance `D`

- **Date:** 2026-11-20
- **Window (UTC):** `2026-11-20T02:03:57Z` – `2026-11-20T02:09:04Z` (5 min 7 s / 30 min budget)
- **Reviewer:** ST5 Independent Reviewer (read-only `research` subagent, inherited session model)
- **Scope (`PLAN.md` §11):** Review R3-A3 factor superposition RMSDs / kept fractions and R3-A4 value of `D` with its exact counting method (plus A3/A4 biological anchors, clash reports, provenance, and `DEC-010`/`DEC-011`/`DEC-019` compliance).
- **Verdict:** **PASS WITH MINOR NOTES** (0 High, 0 Medium, 5 Low non-blocking notes). Both R3-A3 and R3-A4 are scientifically sound, quantitatively verified against the underlying mmCIF structures and committed `.asset.json` files, and pass all 39 tests in `tests/assets-factors.test.mjs` and `tests/assets-rnap-v2.test.mjs`.

---

## 1. Audit of R3-A3: Factor Superpositions, Anchors, and Clashes

### 1.1 Superposition RMSDs and Kept Fractions (`DEC-010`, `DEC-011`)

All six factor assets match rRNA P atoms by `(auth_seq_id, comp)` (`DEC-011`), apply rigid two-pass iterative Kabsch (`cutoff = 2.0 Å`, `passes = 2`), store coordinates directly in the `7K00` `ribo` frame, and pass both `DEC-010` gates (`rmsdAfterA <= 1.5 Å` and `keptFraction >= 0.50`). Independent recomputation from `tools/sources/*.cif` reproduces every committed `source.superposition` value to the third decimal place:

| Asset | PDB / Chain | Scope | `nBefore` | `nAfter` | Kept (`≥ 50%`) | `rmsdBeforeA` (Å) | `rmsdAfterA` (`≤ 1.5 Å`) | Mismatches | Gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `rf1` | `8FZH` / `w` | `23S` | 2,753 | 2,195 | **79.7%** | 1.728 | **1.408** | 0 | Pass |
| `ef-tu` | `5WE4` / `z` | `16S+23S` | 4,248 | 4,116 | **96.9%** | 1.000 | **0.606** | 21 | Pass |
| `ef-g` | `7PJV` / `x` | `23S` | 2,749 | 2,600 | **94.6%** | 1.223 | **0.777** | 4 | Pass |
| `if1` | `9ZN2` / `y` | `16S+23S` | 4,270 | 2,166 | **50.7%** | 2.556 | **1.291** | 0 | Pass |
| `if2` | `9ZN2` / `x` | `16S+23S` | 4,270 | 2,166 | **50.7%** | 2.556 | **1.291** | 0 | Pass |
| `if3` | `9FDA` / `J` | `16S` | 1,047 | 978 | **93.4%** | 1.277 | **0.985** | 1 | Pass |

### 1.2 Focused Evaluation: `8FZH` (`rf1`) `23S`-Only Scope

- **Root cause verified:** Independent radius-of-gyration comparison on matched P atoms confirms a **+2.68% isotropic cryo-EM pixel-size / magnification offset** in `8FZH` relative to `7K00` (`+2.55%` on 23S, `+2.86%` on 16S). Because the two subunits span ~160 Å, a rigid `16S+23S` fit pushes outer P atoms past the 2.0 Å cutoff, dropping retention to `2,069 / 4,272 = 48.4%` (failing `DEC-010` `≥ 50%`), with only 25.0% of 16S P atoms surviving within 2.0 Å vs 67.5% of 23S.
- **Geometric stability across scopes:** Independently comparing `rf1` Cα positions across all three rigid scopes gives:
  - `23S` vs `16S+23S`: **0.738 Å Cα RMSD** (nearly indistinguishable pose), `ggq → ptc` = `5.961 Å` (vs `5.296 Å`), `codonReader (PAT) → siteA` = **`7.610 Å`** (improved vs `7.957 Å` for `16S+23S` and `9.111 Å` for `16S`), and only 1 marginal contact `< 3.0 Å` (`ARG303`–16S `C519` at `2.710 Å`).
  - `16S`-only degrades `codonReader → siteA` to `9.111 Å` and shifts RF1 by `3.134 Å` Cα RMSD relative to `23S`.
- **Assessment:** **Scientifically and geometrically justified.** Using `23S`-only preserves the locked D5 UAA-bound *E. coli* RF1 structure (`8FZH`) and keeps the transform strictly rigid (no isotropic rescaling, honoring D2 and `PLAN.md` §7.3) while delivering an essentially identical pose to `16S+23S` (0.738 Å shift) that passes both `DEC-010` gates cleanly. **Recommend Chief ratifies `8FZH` `23S`-only scope as an extension to `DEC-010`.**

### 1.3 Focused Evaluation: `9ZN2` (`if1` / `if2`) `16S+23S` Scope (50.7% Kept)

- **Boundary behaviour audited:** `9ZN2` sits just 0.7 percentage points above the 50% kept-fraction floor (`2,166 / 4,270 = 50.7%`, `1.291 Å` RMSD). Independent inspection shows this arises from a **+2.28% magnification offset** (`23S +1.67%`, `16S +2.35%`) combined with mild 70S IC* inter-subunit rotation: after the final `16S+23S` pass, **87.9% of 23S P atoms (`2,421 / 2,753`)** lie within 2.0 Å vs **8.4% of 16S P atoms (`127 / 1,517`)**. Thus, `16S+23S` is effectively a 23S-weighted rigid alignment.
- **Per-factor placement comparison (`16S+23S` vs `23S` vs `16S`):**
  - **`if2` (inter-subunit; G-domain on 50S SRL):** `16S+23S` yields **0 clashes** (min L1 distance `3.520 Å`) and `gDomain → SRL = 18.180 Å` (≤ 25 Å). `23S`-only is close (`1.193 Å` Cα RMSD shift, 0 clashes, `18.275 Å`), whereas `16S`-only shifts `if2` by `2.705 Å` and introduces a `< 3.0 Å` clash (`2.806 Å`).
  - **`if1` (30S decoding center, 72 aa):** `16S+23S` places `if1.center` `12.290 Å` from `ribosome-70s` `decoding` (closer than `16S`-only at `13.790 Å` and `23S`-only at `13.082 Å`, with `1.059 Å` shift vs `23S` and `2.701 Å` vs `16S`). Its only two `< 3.0 Å` contacts (`PRO18`–16S `G1494` `2.717 Å`, `ASN19`–16S `A1493` `1.700 Å`) are **physiological**: IF1 binds helix 44 and flips out A1492/A1493, which adopt a different conformation in the A-tRNA-bound `7K00` reference (pure `16S` produces the same 2 contacts at `1.860 Å`).
  - Crucially, sharing one rigid `16S+23S` transform keeps `if1` and `if2` in their exact experimental `9ZN2` relative geometry during 70S initiation (chapters 9–10).
- **Assessment:** **No placement concern; keep `16S+23S` as committed.** No rebuild or `DEC-010` exception is required for `9ZN2`.

### 1.4 Remaining Factors, Biological Anchors, L2, and Clashes

- **`5WE4` (`ef-tu`, `16S+23S`):** 96.9% kept, `0.606 Å` RMSD, `gDomain` (`GHVDHGKT`, 18–25) `16.123 Å` from 23S SRL heavy-atom centroid (`≤ 25 Å`), 0 clashes. Clean.
- **`7PJV` (`ef-g`, `23S` per `DEC-010`):** 94.6% kept, `0.777 Å` RMSD. Walker A P-loop `AHIDAGKT` (author 16–23, canonical Ala16 substitution in *E. coli* EF-G, Met1 cleaved; `15.313 Å` from SRL, `6.576 Å` from GDP) and `domainIV` (author 481–603 = UniProt P0A6M8 482–604, 123 Cα; `32.442 Å` from `decoding`) are biologically accurate. Single clash (`GLY546` vs 16S `U1211`, `1.609 Å`) is expected from mapping rotated `7PJV` onto non-rotated `7K00` via 23S.
- **`9FDA` (`if3`, `16S`):** 93.4% kept, `0.985 Å` RMSD, edeine B excluded. All 6 `< 3.0 Å` clashes (`1.898–2.944 Å`) occur exclusively against 23S rRNA helix 69 (`C1909`, `G1910`, `G1922–C1925`), accurately reflecting IF3's physiological anti-association clash with the 50S subunit prior to IF3 dissociation.
- **`rf1` L2 (`ggq` 8 Å) and `DEC-019` L3 tint safety:** 70 atoms (10 protein residues + 1 Mg²⁺ ion `8FZH` chain `x:102` at `7.966 Å`), 68 valid covalent/peptide bonds (0.9–2.3 Å), all 6 factors carry `subunit: assetId` and RNAP-keyword-free `chains[0].name`, and all §7.5 budgets are met with wide margin.

---

## 2. Audit of R3-A4: Coupling Distance `D`, Counting Method, and RNAP/NusG Extensions

### 2.1 Independent Audit of `D = 38` on `6ZTJ` Chain `AV`

Independent parsing of `tools/sources/6ZTJ.cif` chain `AV` confirms every step of A4's derivation:

1. **Entity and numbering:** Chain `AV` (entity 22) has a 53-nt `_entity_poly` sequence (`ACAAAGGAGGUAUUCAUGUUCACAUACACAUAUAUAGACACAAACGGCGCGCG`). Residues `14..53` (40 nt) are modelled continuously with **`label_seq_id === auth_seq_id`** at every residue (zero numbering offset; 5′ leader `1..13` containing the SD `AGGAGG` is unmodelled).
2. **P-site codon start:** Paired with P-site tRNA `AW` at **`AV:16..18` (`A-U-G`)** (followed by A-site `UUC` at `AV:19..21` paired with `AX`). First P-site nucleotide = **`AV:16` (`A`)**.
3. **RNAP RNA 3′ end:** Paired in a 9-bp RNA·DNA hybrid with template `CT` across `AV:45..53` (`CGGCGCGCG`). 3′-terminal nucleotide = **`AV:53` (`G`)**.
4. **Unmodelled nucleotides in `[16, 53]`:** **0** (every integer `16..53` is present in chain `AV`).
5. **Inclusive count:**
   $$D = 53 - 16 + 1 = 38\text{ nt}$$
   This matches the wwPDB title of `6ZTJ` verbatim (*"E. coli 70S-RNAP expressome complex in NusG-coupled state (38 nt intervening mRNA)"*).

### 2.2 Off-by-One Audit Against `PLAN.md` §6.4 (`24 + D`) and `js/sim/gene/timeline.js`

Verified algebraically and by executing `buildTimeline(..., { mode: 'coupled' })` against committed `rnap-ec`:

- In Construct v3 (`PLAN.md` §5.1), the transcript is 179 nt (0-based `0..178`, 1-based `1..179`) and the start codon `AUG` occupies 0-based `[24, 27)` = 1-based nucleotides `25, 26, 27`.
- At the end of `elongate-early` (ch 6, `timeline.js` line 405), transcription reaches length `24 + D = 24 + 38 = 62` nt (1-based `1..62`). The inclusive count from the first nucleotide of the P-site start codon (1-based `25`) through the 3′-terminal nucleotide (1-based `62`) is **`62 - 25 + 1 = 38 = D`**. **Zero off-by-one discrepancy.**
- Throughout `couple-run` (ch 9, `timeline.js` lines 425–435), `cycles = floor((179 - 24 - 38) / 3) = 39` (`k = 2..40`), `remainingNt = 0`, `remainingCodons = 0`. At the end of each cycle `j = 0..38`, P-site is codon `2 + j` (starting at 1-based `25 + 3(j + 1)`) and 3′-end is `62 + 3(j + 1)`, maintaining exact inclusive span **`38 = D`** on every cycle, ending at codon 40 in P-site / `UAA` in A-site / nt 179 at 3′-end.
- **`PLAN.md` §13 fallback check:** Although `D = 38` lies 2 nt below the illustrative 40–60 nt estimate, `PLAN.md` §13 explicitly pre-approves: *"Use the computed `D` anyway if there is no clash."* At the `expressome` pose, `ribosome-70s` L1 clears `rnap-ec` L1 by **7.389 Å** and the 248-bp DNA by **18.15 Å** (zero clashes). Keeping exact `D = 38` is fully compliant with §13.

### 2.3 Verification of Remaining R3-A4 Deliverables

- **`6C9Y` vs `6CA0` RPo provenance:** Confirmed that `6C9Y` contains protein chains `A–F` only (zero DNA). Deriving `rnap-holo` RPo `template`/`nontemplate` tracks (`−45..+11`, `-10 TATAAT` at `−12..−7`, bubble `−11..+2` origins separated `2.986–28.011 Å`, max DNA heavy-atom penetration into L1 `0.95 Å ≤ 1.0 Å`) from companion open-complex `6CA0` superposed onto `6C9Y` (`β+β′` Cα `2,252 / 2,684 = 83.9%`, `1.014 Å` RMSD ≤ 2.5 Å) preserves `rnap-holo` L0/L1/L2 byte-for-byte.
- **L0/L1/L2 byte-for-byte preservation:** Confirmed via SHA-256 checks in `tests/assets-rnap-v2.test.mjs` against pre-ST5 (`50716d1`) buffers for both `rnap-ec` (`147,398 B ≤ 220 kB`) and `rnap-holo` (`184,068 B ≤ 220 kB`).
- **`7YPA` `hairpin` & `ntpEntry`:** `7YPA → 6ALF` passes (`1,906 / 2,615 = 72.9%`, `1.161 Å` RMSD ≤ 2.5 Å); closing pair `I:10 (C) — H:−10 (G)` lies `9.377 Å` from `rnaExit`, and an 8-bp A-form stem has `0.45 Å ≤ 1.0 Å` max L1 penetration. `ntpEntry` on both RNAP assets implements the exact 256-ray §7.4 algorithm (`185` kept rays, min clearance `6.418 Å` / `6.442 Å`, `synthetic: 1`).
- **`6ZTJ` superpositions & `coupledMrna`:** RNAP (`CC, CD → I, J`, `82.2%`, `1.021 Å ≤ 2.5 Å`) and ribosome (`AA, BA → A, a`, `(auth_seq_id, comp)` per `DEC-011`, `98.3%`, `0.625 Å ≤ 1.5 Å`, 13 comp mismatches excluded) both pass with large margins. `coupledMrna` (25 points, `138.414 Å`, 19 observed `AV:41..23` + 6 synthetic bridge points, `DEC-002` per-point flags) starts at `rnaExit`, ends at `expressome(mrnaEntry)`, and clears all RNAP and ribosome L1 beads by `≥ 3.23 Å`.
- **`nusg` asset:** `6ZTJ` chain `CF` (161 Cα, `auth 6..180`), `rnap` frame, `center`/`ntd`/`ctd` anchors (`44.554 Å` NTD–CTD span; `ntd` `11.76 Å` from RNAP L1, `ctd` `11.21 Å` from ribosome L1), `2,600` L0 tris (closed, outward; independently verified **155 / 161 = 96.3%** containment on decoded quantised L0/L1), `35,832 B ≤ 120 kB`, `subunit: 'nusg'` (`DEC-019` L3 safe → `#15aabf`).

---

## 3. Findings by Severity

### High
- *None.*

### Medium
- *None.*

### Low (Non-Blocking)
1. **L1 — `docs/assets/rnap.md` §1 table revision dates (and two titles) disagree with committed `.asset.json` metadata:** `docs/assets/rnap.md` lines 15–19 list revision dates `6ALF: 2023-11-08`, `6C9Y: 2024-03-06`, `6CA0: 2024-03-06`, `7YPA: 2023-07-12`, and `6ZTJ: 2024-03-06`, whereas the committed `.asset.json` files (parsed directly from the pinned mmCIFs) record `6ALF: 2024-03-13`, `6C9Y: 2024-03-13`, `6CA0: 2024-03-13`, `7YPA: 2024-07-03`, and `6ZTJ: 2026-06-24` (and slightly different exact PDB titles for `7YPA`/`6ZTJ`). Sync the §1 table in `docs/assets/rnap.md` with the committed JSON metadata (no asset rebuild needed).
2. **L2 — `docs/assets/factors.md` §§4 & 7 misstate L0 envelope input atoms:** Lines 106 and 168 state that factor L0 envelopes are generated from *"all heavy atoms of the factor chain"*, whereas `tools/assets/factors.mjs` (`buildEnvelope(l1Pts, spec)`, line 319) generates L0 from **L1 Cα beads** (matching `rnap.mjs` and `nusg.mjs` and the `source.notes` string). Update those two prose phrases in `docs/assets/factors.md` to say "L1 Cα beads".
3. **L3 — Coupled-mode boundary behavior at `D = 38` (`remainingCodons = 0`, duration `121.30 s`):** Because `D = 38` sits at the exact lower bound of `timeline.js`'s `[38, 139]` range, `couple-run` executes all 39 elongation cycles (`codons 2..40`), leaving `remainingNt = 0` in ch 10 (`couple-terminate`) and `remainingCodons = 0` in ch 11 (`release`, which proceeds directly to RF1 stop-codon termination). Total coupled duration is `121.30 s` (vs `~123 s` noted in `PLAN.md` §2 D13 / §6.4 for illustrative `D = 48`). Everything executes cleanly with zero off-by-one defects; flag for ST9 (`R3-S5` / `R3-V1`) so chapter 10's caption (*"The ribosome continues on its own"*) and duration note are verified in context.
4. **L4 — `9ZN2` (`if1`/`if2`) `16S+23S` fit is 23S-dominated (50.7% total kept = 87.9% of 23S vs 8.4% of 16S within 2.0 Å):** Recorded here for transparency; as shown in §1.3, this causes no placement defect on either `if1` or `if2` and keeps both factors in exact experimental relative geometry.
5. **L5 — `rf1` `codonReader` distance metric & `nusg` quantised-containment test:**
   - `rf1` passes `codonReader → siteA <= 10 Å` on the base-frame origin centroid (`7.610 Å`, the Watson–Crick reading face of `tracks.mrna` registers `+3..+5`), while the C1′ sugar-backbone centroid is `11.772 Å` (both transparently recorded in `source.geometryChecks`).
   - `tests/assets-rnap-v2.test.mjs` checks `rawNusg.lod0.parts[0].beadsInside >= 0.95` rather than calling `insideMesh` on decoded quantised `nusg` L0/L1 (unlike `assets-factors.test.mjs`); independent verification confirmed decoded `nusg` containment is `155 / 161 = 96.3%` (`≥ 95%`).

---

## 4. Recommendations for Chief Rulings in `docs/DECISIONS.md` (Before Tagging `r3-st5`)

1. **Ratify `8FZH` (`rf1`) `23S`-only superposition scope (extending `DEC-010`):** Record that `8FZH`'s +2.68% isotropic magnification offset drops `16S+23S` retention to 48.4% (`< 50%`), while rigid `23S`-only achieves 79.7% kept / `1.408 Å` RMSD, agrees within `0.738 Å` Cα RMSD with `16S+23S`, and improves `codonReader → siteA` to `7.610 Å`.
2. **Ratify `ef-g` (`7PJV`) anchor motif definitions:** Record *E. coli* EF-G's canonical Ala16 Walker A P-loop (`AHIDAGKT`, author 16–23, matching `[GA]xxxxGK[ST]`) and `domainIV` residue span (author 481–603 = UniProt P0A6M8 482–604, Met1 cleaved).
3. **Ratify `6CA0` as the RPo open-promoter DNA track source for `rnap-holo`:** Record that `6C9Y` is DNA-free holoenzyme (protein `A–F` only), and `6CA0` (Narayanan et al., 2018; already in `tools/sources.lock.json`) supplies the RPo tracks (`1.014 Å` RMSD, 83.9% kept) while preserving `6C9Y` L0/L1/L2 byte-for-byte.
4. **Ratify exact coupling distance `D = 38` nt (`PLAN.md` §13 pre-approved fallback):** Record the verified inclusive count on `6ZTJ` chain `AV` (`53 - 16 + 1 = 38` nt, 0 unmodelled in `[16, 53]`, matching `24 + D` with zero off-by-one error), zero steric clash (`7.389 Å` vs RNAP L1, `18.15 Å` vs DNA), and resulting coupled duration `121.30 s` (`cycles = 39`, `remainingCodons = 0`).
5. *(Optional, non-blocking)* Fix L1 (`docs/assets/rnap.md` §1 dates) and L2 (`docs/assets/factors.md` §§4 & 7 "all heavy atoms" → "L1 Cα beads") before or at `r3-st5` tag.
