# Validation & Milestone Evidence (`M0–M5`)

Updated: 2026-11-16
Branch: `feat/rna-gene-expression`
Owner: Review & Verification Role (Agent 4 — Gemini 3.8 Flash / 3.5 Flash-Lite + Agent 0 — Gemini 4 Argon)

---

## 1. Automated Test Suite Summary (`37 / 37 PASS`)

Command: `node --test tests/science.test.mjs tests/sim.test.mjs`
Duration: `6.87 s` (`0` failures)

| Test Suite | Tests | Key Invariants Verified |
| :--- | :---: | :--- |
| **B-DNA & 1BNA Crystal Science** (`tests/science.test.mjs` #1–#8) | 8 | Canonical B-DNA rise ($3.38\,\text{Å}$), pitch ($35.5\,\text{Å}$), covalent bonds ($1.20\text{–}1.65\,\text{Å}$), $O3'\text{–}P$ link ($1.607\pm 0.03\,\text{Å}$), zero steric clashes, `1BNA` crystal waters & H-bonds, SantaLucia (1998) $\Delta G^\circ_{37}$ & $T_m$, helix–coil fraying. |
| **A-RNA, Uracil & $2'\text{-OH}$ Science** (`tests/science.test.mjs` #9–#12) | 4 | Uracil (`U`) planar ring geometry in Olson (2001) reference frame; ribose $C2'\text{–}O2'$ bond length ($1.4130\,\text{Å}$); regularised C3'-endo A-RNA duplex (`HELIX_A`, rise $2.81\,\text{Å}$, $11.0\,\text{bp/turn}$, $O3'\text{–}P = 1.6018\,\text{Å}$, zero non-bonded clashes); canonical `A·U` and wobble `G·U` H-bond pairs; Turner / Xia et al. (1998) RNA nearest-neighbour thermodynamics ($T_m(\text{RNA}) > T_m(\text{DNA})$). |
| **Bacterial Gene Construct & Genetic Code** (`tests/science.test.mjs` #13) | 1 | 48-bp construct (`-10 TATA` promoter, `AGGAGGUA` $5'\text{ UTR}$ with Shine–Dalgarno, 11 sense codons, `TAA`/`UAA` stop); initiator `AUG` mapped to `fMet` (`N-Formylmethionine`); `UAA` stop codon adds 0 residues. |
| **Melting & Replication Sims** (`tests/sim.test.mjs` #1–#21) | 21 | Glauber heat-bath dynamics, DNA & RNA duplex melting, replication fork unwinding, leading/lagging synthesis, Okazaki fragments, pure-time `seek()` reproducibility. |
| **Bacterial Gene Expression Sim** (`tests/sim.test.mjs` #22–#24) | 3 | 48-bp DNA + 44-nt ribose mRNA (`O2'` and `U` verified) + 33-nt tRNA anticodons + 11 nascent polypeptide residues (`fMet-A-E-F-K-G-S-D-Y-Q-A`); bit-exact forward/backward `seek(p)` across 201 samples; parental DNA re-annealing behind RNAP; `fMet` at residue 0; `RF1` recruitment at `UAA` stop codon without adding a 12th residue. |

---

## 2. Packaging & Static Runtime Audit

- **Zero External Runtime Requests:** All modules use local ES module imports (`./js/vendor/three.module.min.js`, `./js/vendor/addons/...`, local `CRYSTAL_1BNA`, and procedural macromolecular envelopes). No CDN, font, analytics, or remote PDB API calls are made at startup or during playback.
- **Resource & Memory Hygiene:** `MoleculeLayer`, `CartoonLayer`, `OverlayLayer`, and `Viewer` release all GPU geometries, materials, instanced buffers (`atoms`, `bonds`, `beads`, `residuesMesh`, `peptideBonds`), and DOM overlays on `clear()` and `dispose()`.

---

## 3. Post-merge browser check (2026-11-17)

Scope: load-and-inspect pass at `72d888b` with Node 22 and headless Chromium (software WebGL, 1440×900). This is not a visual acceptance review.

- **Blocking defect found:** `js/ui/about.js` had one unbalanced `)`. `index.html` and `dist/helix-standalone.html` rendered a blank page (`SyntaxError: Unexpected token ')'` at `about.js:36`). The `node --check` runs cited in the handoffs did not catch it: `node --check js/ui/about.js` exits 0 on the broken file, while the same content checked as `.mjs` fails.
- **Fix:** removed the stray parenthesis and rebuilt `dist/helix-standalone.html` with `tools/build-standalone.mjs`.
- **After the fix:** page and standalone bundle load; all six modes switch with zero console errors and zero external requests; `node --test tests/science.test.mjs tests/sim.test.mjs` passes 37/37.
- **Observed in Express mode:** atomic DNA and mRNA render correctly; RNAP, 30S/50S, tRNA bodies, and RF1 are translucent ellipsoids about 4–6× smaller (linear) than life; the free mRNA is a rigid helical strand; the peptide is a row of Cα beads.
- **Still unverified:** camera-follow presets, cutaway readability, mobile layout, hardware-GPU frame rate, reduced motion, repeated mode switching.

Sections 1–2 above predate this check; their "zero syntax errors" and release-readiness statements should be read with this correction. See `PLAN.md` §13 for the full audit and the Round 2 plan.

---

## 4. Round 2 Wave 1 exit gate (2026-11-17)

Integration branch `claude/admiring-cray-fdre6q` after merging tasks D, C, A, B (in that order).

- `npm test`: syntax check 39 files, 0 failed; `# tests 80`, `# pass 80`, `# fail 0`.
- `npm run smoke`: `SMOKE PASS` (index and standalone bundle, all six modes, Express scrub). The gate was proven to fail (`SMOKE FAIL`, exit 1) when the original `about.js` defect was reintroduced.
- `node tools/build-assets.mjs --check`: `rnap-ec`, `rnap-holo`, and the manifest rebuild byte-identically from the pinned sources in `tools/sources.lock.json`.
- Residue templates: chirality and bond lengths cross-checked against the protein chains of PDB 6ALF (2,930/2,930 positive chiral volumes; bonds within 0.020 Å of observed means).
- Actor card with real assets (headless Chromium, software WebGL, 1440×900; zero console errors), images in `docs/evidence/r2-w1/`:
  - `rnap-ec-l0.png`: closed translucent envelope of the core enzyme.
  - `rnap-ec-l1-cutaway-tracks.png`: per-residue beads tinted by subunit; the procedurally built template, non-template, and RNA nucleotides placed on the slot tracks run through the enzyme's DNA channel; anchors labelled.
  - `rnap-ec-l2.png`: active-site atoms around the catalytic Mg²⁺.
  - `rnap-holo-l1.png`: holoenzyme with σ⁷⁰ in violet on the core.
- Integration change: `chainColor` in `js/render/actors.js` now prefers the asset's explicit `chains[].subunit` tag before falling back to name matching.

Not verified in Wave 1: hardware-GPU frame rate, phone layout, real-time cross-fade timing, comparison of the measured 63.8° DNA bend with published values. The Express scene still uses the 48-bp construct and placeholder envelopes; migrating it is Wave 2.

---

## 5. Round 3 Stage ST1 exit check (`r3-w0`, 2026-11-19)

Branch: `main` (tag `r3-w0`). Scope: R3-W0 (Chief + `r3/w0-sources`, `r3/w0-stubs`, `r3/w0-fixtures`), R3-S1 (`r3/s1`, merged after W0), and the ST1 Argon review (`docs/reviews/R3-ST1-argon.md`, all 8 findings applied).

- **Pinned PDB sources (`node tools/fetch-sources.mjs --check`):**
  - `sources: 13 ok, 0 failed (13 total)` (existing 4 RNAP entries plus all 9 Round 3 entries from `PLAN.md` §7.2 verified by SHA-256 and byte count).
- **Asset pipeline reproducibility (`node tools/build-assets.mjs --check --quiet` & `--only rnap-ec --check --quiet`):**
  - `identical  assets/rnap-ec.asset.json`
  - `identical  assets/rnap-holo.asset.json`
  - `identical  assets/manifest.json`
  - `assets/fixture-machine.asset.json` upgraded to Asset Format v2 (`version: 2`, `parts[].role`, 2 `lod2.sites`, `paths.channel`).
- **Syntax check & automated tests (`npm test`):**
  ```text
  checked 63 files, 0 failed
  ℹ tests 120
  ℹ suites 0
  ℹ pass 120
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 6427.428148
  ```
  Covers Asset Format v1/v2 (`tests/asset-format.test.mjs`), Asset Registry (`tests/asset-registry.test.mjs`), superposition & matching helpers (`tests/tools-superpose.test.mjs`), all 23 Round 3 module stubs importing cleanly in Node (`tests/stubs.test.mjs`), WorldState & mini-story fixtures (`tests/fixtures.test.mjs`), Construct v3 (`version: 3`, 248 bp, 179-nt transcript, 40-codon ORF, 41-row `codonTable`, `tests/scenario.test.mjs`), and all 20 residue templates + 40-residue Construct v3 `buildPeptide` with zero contacts `< 2.6 Å` (`tests/residues.test.mjs`), alongside all pre-existing science, simulation, and asset tests.
- **Browser smoke gate (`npm run smoke`):**
  ```text
  SMOKE PASS
  ```
  Verified `index.html` and `dist/helix-standalone.html` across all 6 modes (keys `1`–`6`) and Express progress scrub in headless Chromium (software WebGL) with zero console errors, zero page errors, zero HTTP >= 400 responses, and zero external requests.
- **`?mode=express&scene=v2` browser route check (Playwright headless Chromium, 1280×800):**
  - Loaded `/index.html?mode=express&scene=v2` with zero console errors, zero page errors, zero HTTP >= 400 responses, and zero external requests.
  - Observed `window.helix.app`: `mode = "express"`, `sceneVersion = "v2"`, `v2WorldState` loaded from `tests/fixtures/world-state.json` (`t = 42.75`, `chapter.id = "elongate-tx"`, `counters.mrna = 81`, `ntp.base = "G"`, `machines.length = 1`), and `viewer.camera.far = 12000`.
- **ST1 Argon review (`docs/reviews/R3-ST1-argon.md`):**
  - Window: `2026-11-19T06:33:15Z` – `2026-11-19T06:37:47Z` (4 min 32 s).
  - Verdict: `PASS WITH MINOR FIXES` (1 High, 4 Medium, 3 Low). All 8 findings accepted and fixed before tagging `r3-w0` (`DEC-007`, `DEC-008`).
- **Not verified in ST1:** ST2–ST10 assets, kinematics, story playback, and visual acceptance (all out of ST1 scope); standalone bundle `dist/helix-standalone.html` was not rebuilt because no standalone-exposed Round 1 behavior changed (rebuild scheduled when new scenes wire in).

---

## 6. Round 3 Stage ST4 / Gate G1 (`r3-w1`, 2026-11-19)

Branch: `main` (tag `r3-w1`). Scope: ST2 intake (`r3-st2` at `2d9512c`, `R3-A1`, `R3-A2`), ST3 intake (`r3-st3` at `bc3c0bf`, `R3-K1`, `R3-S2`), ST4 tasks merged in order `R3-Q1 → R3-R1 → R3-U1` (`--no-ff`), Chief integration updates (`tests/stubs.test.mjs`, `js/main.js` `?scene=v2` legend guard, rebuilt `dist/helix-standalone.html`), rulings `DEC-009`–`DEC-021`, and ST4 Argon independent review (`docs/reviews/R3-ST4-argon.md`).

**Gate G1 Verdict: `PASS`**

### 6.1 Required Automated Gates

- **Pinned PDB sources (`npm run fetch-sources`):** `sources: 13 ok, 0 failed (13 total)`.
- **Asset pipeline reproducibility (`node tools/build-assets.mjs --check --quiet`):** Exit `0` — `identical` for all 6 committed files (`assets/ribosome-70s.asset.json`, `assets/rnap-ec.asset.json`, `assets/rnap-holo.asset.json`, `assets/trna-init.asset.json`, `assets/trna-aa.asset.json`, `assets/manifest.json`).
- **Syntax check & unit tests (`npm test`):**
  ```text
  checked 63 files, 0 failed
  ℹ tests 221
  ℹ suites 0
  ℹ pass 221
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 13370.022256
  ```
  - **Runtime note (informational):** Under Node 24 LTS (this VM's runtime, larger V8 young-gen nursery than Claude's Node 22), `tests/kin-duplex.test.mjs:445` (`poseDuplex` heap growth `<= 1 MB` over 4,000 calls without forcing GC inside the test) can intermittently report ~2.4–3.7 MB pre-GC transient allocation when minor GC does not fire mid-loop. Direct `--expose-gc` diagnosis confirmed only **29,088 B (28.4 KiB)** retained post-GC across 4,000 calls (zero leak). On the integrated `main` Gate G1 run above, all 221/221 tests passed cleanly. Per `PLAN.md` §9.3, Chief did not modify Claude-owned `tests/kin-duplex.test.mjs`.
- **Browser smoke gate (`npm run smoke`):**
  ```text
  SMOKE PASS
  ```
  Covers `index.html` (all 6 modes + Express scrub + `?mode=express&scene=v2`) and offline `dist/helix-standalone.html` (4,108,332 B / 4.11 MB ≤ 7.5 MB; 6 assets inlined in `window.__HELIX_ASSETS__`; `?mode=express&scene=v2` decodes all 5 real assets via `loadAssets` with zero network requests). Broken-import failure proof (`js/render/colors.js` reported on `SMOKE FAIL`) documented in `docs/handoffs/R3-Q1.md`.
- **Express v2 UI suite (`node tests/ui-story.browser.mjs`):**
  ```text
  UI-STORY PASS (50 checks)
  ```
- **Detail-sphere, `AtomGroupLayer`, performance & visual-regression suite (`node tests/render-detail.browser.mjs`):**
  ```text
  TEST1 PASS: 248-bp duplex (10168 atoms) + 40-aa peptide (329 atoms) + NTP (31 atoms) | diffs: r30-vs-r0=3.01%, shifted=4.69%, codon=0.94%, element=4.38% | geometries: 13->13 (cleared=12)
  TEST2 PASS (perf, software WebGL, quality=high): 675 nt (13965 atoms) | 10 frames: median=4701.7 ms, mean=5202.6 ms, max=6272.1 ms
  TEST3 PASS (visual regression vs r3-st3, <= 0.5%): Explore=0.000%, Pairs=0.000%, Melt=0.000%, Copy=0.000%, X-ray=0.000%
  RENDER DETAIL PASS
  ```

### 6.2 Assets (`ribosome-70s`, `trna-init`, `trna-aa`) — Tests & §7.5 Budgets

- `node --test tests/assets-ribosome.test.mjs tests/assets-trna.test.mjs tests/asset-budgets.test.mjs`: `34/34 pass` (`0 fail`).
- Structural highlights: 6/6 Watson–Crick pairs verified across decoded `ribosome-70s` + `trna-init`/`trna-aa` (`0.18–0.61 Å` ≤ 2.5 Å); 7ST2 E-site chain `6` matches 7K00 E-site CCA chain `5` at `1.16 Å` RMSD; exit tunnel path `86.71 Å` (88 pts, min clearance `3.66 Å`, `{N} = 26`, `DEC-009`); `trna-init` span `76.15 Å`, `trna-aa` span `81.71 Å` (`DEC-013`).

| Target | Metric | Observed | §7.5 Budget | Status |
| --- | --- | ---: | ---: | :---: |
| `ribosome-70s` | L0 tri / L1 beads / L2 atoms / size | 48,064 / 9,978 / 756 / 724.8 kB | ≤ 70k / ≤ 15k / ≤ 4k / ≤ 1.2 MB | PASS |
| `trna-init` | L0 tri / L1 beads / L2 atoms / size | 3,716 / 76 / 42 / 50.9 kB | ≤ 4k / ≤ 80 / ≤ 400 / ≤ 60 kB | PASS |
| `trna-aa` | L0 tri / L1 beads / L2 atoms / size | 3,712 / 73 / 42 / 50.9 kB | ≤ 4k / ≤ 80 / ≤ 400 / ≤ 60 kB | PASS |
| All manifest assets | Aggregate size (5 real assets) | 1,166.1 kB | ≤ 3.0 MB | PASS |
| `dist/helix-standalone.html` | Single-file bundle (Q1 + R1 + U1 + 6 inlined assets) | 4.11 MB (4,108,332 B) | ≤ 7.5 MB | PASS |

### 6.3 Actor-Card Colour Verification (`PLAN.md` §4.3 & `DEC-019`)

- Audited by Chief and independently verified by ST4 Argon (`docs/reviews/R3-ST4-argon.md`, window `2026-11-19T10:27:11Z`–`2026-11-19T10:29:59Z`, 2 min 48 s / 30 min budget, verdict `PASS WITH MINOR NOTES`).
- Resolved `ACTOR_TOKENS` / `instanceColor` albedo matches every `PLAN.md` §4.3 token at **`ΔE = 0.00`**:
  - `ribosome-70s`: L0 `small` `#e4dcc4`, `large` `#d2b183`; L1 `rRNA16S` `#f0eadb` (lit screenshot min CIE76 `ΔE = 0.51`), `rprotein30S` `#c9bd9c` (`ΔE = 0.69`), `rRNA23S`/`rRNA5S` `#e0c59f` (`ΔE = 0.69`), `rprotein50S` `#b38f5e` (`ΔE = 1.62`).
  - `trna-init` (`#ffd43b`) and `trna-aa` (`#ff922b`): albedo `ΔE = 0.00`; visually verified distinct warm yellow vs. saturated orange L-shapes with crisp procedural anticodons (`docs/evidence/r3/A2/`). Under ACES Filmic + `L1_MAT` PBR specular/rim lighting, raw lit pixels show CIE76 `ΔE ≈ 18` against unlit sRGB hexes due to highlight desaturation; `DEC-019` formalizes Gate G1 colour evaluation on resolved albedo / unlit renders (or ACES-matched swatches) and records the ST5 `chainColor()` RNAP-substring watch item.

### 6.4 Kin-Lab Visual Check (`R3-K1`, `docs/evidence/r3/K1/`)

- Chief visually inspected `kin-lab-r45-b0.jpg`, `kin-lab-r45-b05.jpg`, `kin-lab-r45-b1.jpg`, and `kin-lab-r105-b1.jpg`.
- Confirmed continuous, unbroken DNA duplex across `β = 0`, `0.5`, and `1.0` with smooth bend into the RNAP channel (`63.8°`) and open transcription bubble inside the enzyme, zero tears or teleport discontinuities (`DEC-014`–`DEC-016`).

### 6.5 Detail-Sphere & `AtomGroupLayer` Visual Check (`R3-R1`, `docs/evidence/r3/R1/`)

- Chief visually inspected all 5 2× JPEG q90 captures (`detail-center-r30.jpg`, `detail-shifted-r30.jpg`, `detail-radius0-cartoon.jpg`, `detail-codon-scheme.jpg`, `detail-element-scheme.jpg`).
- Confirmed smoothstep cross-fade across the 12 Å band between atomic ball-and-stick DNA/peptide/ATP inside `radius = 30` Å and cartoon ribbons + Cα peptide tube outside, clean focus shift (`+55 Å`), 100% cartoon rendering at `radius = 0`, and distinct `strand`, `codon`, and `element` schemes (`DEC-020`).

### 6.6 Express v2 Panel Checklist (`R3-U1`, `PLAN.md` §4.8–§4.10)

- Verified via `node tests/ui-story.browser.mjs` (50/50 checks) and Chief visual inspection of desktop (`1440×900`) and mobile (`iPhone 13`) 2× captures in `docs/evidence/r3/U1/` (`desktop-ch1.jpg`, `desktop-inspect-filled.jpg`, `phone-ch1.jpg`, `phone-ch1-expanded.jpg`):
  - All 11 §4.8 items present in exact order; exact §4.10 header and "What you are seeing" copy; plain text `"E. coli"` (`DEC-006`).
  - 16 chapters with live `{N} = 26` substitution in chapter 14; 41 codon cells + 40 peptide pills; 4 stats (`mRNA`, `RNA·DNA hybrid`, `Codon`, `Peptide`); Inspect card with 6 `<dl>` rows + safe `RCSB ↗` link (`target="_blank" rel="noopener"`).
  - Exact §4.9 Legend (`15` entries in Step by step, `+ NusG` `#15aabf` in Coupled), preserved on `?mode=express&scene=v2` boot via Chief's `js/main.js` guard (`DEC-021`).
  - All 11 `onExpression` actions and Express-only keyboard shortcuts (`Space`, `ArrowLeft`/`ArrowRight`, `Home`) verified; `171/171` buttons have accessible names; `6/6` Tab focus-visible; `0 px` horizontal overflow on desktop and iPhone 13.
  - Closed-CSS design gaps adjudicated as non-blocking for Gate G1 (`DEC-021`: `"Step by step"` pill width inside `div.group.row-between`, inline `ol`/`.chapter-row` reset, mobile `PEEK_H = 112` first-line caption fold).

### 6.7 Not Verified in ST4

- Hardware GPU frame rate (all ST4 browser timings ran on headless Chromium SwiftShader software WebGL).
- Physical iOS/Android touch gestures (tested under Playwright `iPhone 13` emulation).
- Live 3D `StoryScene` playback, ST5 factor assets (`A3`), RNAP v2 (`A4`), transcription choreography (`S3`), and translation choreography (`S4`) — scheduled for ST5–ST10.


