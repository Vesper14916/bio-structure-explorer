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

---

## 7. Round 3 Stage ST5 exit check (`r3-st5`, 2026-11-20)

Branch: `main` (tag `r3-st5`). Scope: Chief `DEC-011` pre-ST5 helper update (`50716d1`, `tools/lib/match.mjs` `{ key: 'authSeq', matchComp: true }`), ST5 tasks merged in exact `PLAN.md` §11 order (`--no-ff`) `R3-A4 → R3-A3 → R3-K2 → R3-R2`, ST5 Argon independent review (`docs/reviews/R3-ST5-argon.md`), Chief rulings `DEC-022`–`DEC-026`, `docs/ASSETS.md` rows `A07`–`A08` (v2) & `A12`–`A18`, updated `tests/stubs.test.mjs` and v2 asset test adaptations, and rebuilt `dist/helix-standalone.html`.

**Stage ST5 Exit Verdict: `PASS`**

### 7.1 Automated Gates

- **Asset pipeline reproducibility (`node tools/build-assets.mjs --check --quiet`):** Exit `0` — **`identical`** across all **13 committed files**: `rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`, `nusg`, `ribosome-70s`, `rnap-ec`, `rnap-holo`, `trna-init`, `trna-aa`, and `assets/manifest.json`.
- **Syntax check & unit tests (`npm test`):**
  ```text
  checked 63 files, 0 failed
  ℹ tests 272
  ℹ suites 0
  ℹ pass 272
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 15100.7623
  ```
  Covers `tests/assets-rnap-v2.test.mjs` (7 tests), `tests/assets-factors.test.mjs` (32 tests), `tests/kin-chain.test.mjs` (11 tests), `tests/asset-budgets.test.mjs` (all 13 manifest assets + standalone bundle), `tests/tools-superpose.test.mjs` (`DEC-011` `authSeq`/`matchComp`), `tests/stubs.test.mjs` (15 of 23 Round 3 modules now implemented), plus all pre-existing science, sim, asset, story, and kinematics tests.
- **Browser smoke gate (`npm run smoke`):**
  ```text
  SMOKE PASS
  ```
  Verified `index.html` and offline `dist/helix-standalone.html` (**4,513,409 B / 4.51 MB ≤ 7.5 MB**; all **13 assets** inlined in `window.__HELIX_ASSETS__`; `?mode=express&scene=v2` decodes all 12 real assets with zero network requests).
- **Actor extensions, FX timing & 200-crowder browser suite (`node tests/render-actors.browser.mjs`):**
  ```text
  RENDER ACTORS PASSED
  ```
  - Test 1: all Wave 1 assets load with 0 errors; `fixture-machine` `path:channel` diff 0.63%; `ribosome-70s` `path:tunnel` (88 pts) rendered.
  - Test 2: `DEC-019` L3 `chainColor` guard verified for `rf1`/`ef-tu`/`ef-g`/`if2`/`nusg` & RNAP; per-part sigma transform diff 2.89% & hide diff 0.98%; `pickable: false -> null`; `setFar` `12000 → 20000 → 12000`; multi-site L2 (`decoding` & `ptc`) verified.
  - Test 3: real-time `FxLayer` timing verified within ±1 frame (pulse peak `253.5 ms` `scale=1.323`, end `520.2 ms` @ 266.7 ms/frame; GTP fade-in `252.7 ms`, steady hold @ `1.0`, fade-out `1369.3 ms`, end `1619.4 ms` @ 250.1 ms/frame); `fx-pulse-gtp.jpg` pulse diff `0.23%` & `GTP → GDP` visible.
  - Test 4: **200 crowders** verified via `renderer.info.render.calls` delta (`200 rnap-ec = +1`, `200 ribosome-70s = +2`, `200 trna-aa = +2` — strictly 1 draw call per asset part); crowder `pick = null`; GPU geometries restored cleanly (`8 → 8`, standalone `0`).

### 7.2 ST5 Assets & §7.5 Budgets (All 12 Real Assets Validated)

| Asset | Format | L0 tris (budget) | L1 beads (budget) | L2 atoms (budget) | File size (budget) | Superposition RMSD / Kept (`DEC-010`) |
| --- | :---: | ---: | ---: | ---: | ---: | --- |
| `rnap-ec` | v2 | 7,596 (preserved) | 3,174 (preserved) | 314 (preserved) | 147.4 kB (≤ 220 kB) | `7YPA` 1.161 Å / 72.9%; `6ZTJ` RNAP 1.021 Å / 82.2%, ribo 0.625 Å / 98.3% |
| `rnap-holo` | v2 | 9,964 (preserved) | 3,685 (preserved) | 291 (preserved) | 184.1 kB (≤ 220 kB) | `6CA0 → 6C9Y` 1.014 Å / 83.9% (`DEC-023`) |
| `nusg` | v2 | 2,600 (≤ 8k) | 161 (≤ 900) | — | 35.8 kB (≤ 120 kB) | `6ZTJ` RNAP 1.021 Å / 82.2% |
| `rf1` | v2 | 2,876 (≤ 8k) | 349 (≤ 900) | 70 (≤ 400) | 44.7 kB (≤ 120 kB) | `8FZH` 23S 1.408 Å / 79.7% (`DEC-022`) |
| `ef-tu` | v2 | 2,060 (≤ 8k) | 393 (≤ 900) | — | 33.0 kB (≤ 120 kB) | `5WE4` 16S+23S 0.606 Å / 96.9% |
| `ef-g` | v2 | 3,624 (≤ 8k) | 703 (≤ 900) | — | 55.8 kB (≤ 120 kB) | `7PJV` 23S 0.777 Å / 94.6% (`DEC-010`) |
| `if1` | v2 | 1,140 (≤ 8k) | 72 (≤ 900) | — | 18.5 kB (≤ 120 kB) | `9ZN2` 16S+23S 1.291 Å / 50.7% |
| `if2` | v2 | 3,932 (≤ 8k) | 595 (≤ 900) | — | 57.8 kB (≤ 120 kB) | `9ZN2` 16S+23S 1.291 Å / 50.7% |
| `if3` | v2 | 1,540 (≤ 8k) | 102 (≤ 900) | — | 23.4 kB (≤ 120 kB) | `9FDA` 16S 0.985 Å / 93.4% |
| **All 12 real assets** | v2 | — | — | — | **1.46 MB** (≤ 3.0 MB) | All pass |
| `dist/helix-standalone.html` | — | — | — | — | **4.51 MB** (≤ 7.5 MB) | 13 assets inlined |

### 7.3 ST5 Argon Independent Review (`docs/reviews/R3-ST5-argon.md`)

- **Window (UTC):** `2026-11-20T02:03:57Z` – `2026-11-20T02:09:04Z` (5 min 7 s / 30 min budget).
- **Verdict:** `PASS WITH MINOR NOTES` (0 High, 0 Medium, 5 Low).
- Independently reproduced all 6 A3 superpositions and `6ZTJ` chain `AV` coupling distance `D = 53 - 16 + 1 = 38` nt (0 unmodelled in `[16, 53]`, zero off-by-one discrepancy with `24 + D` in `js/sim/gene/timeline.js`, 0 clashes at `expressome`). Chief ratified `DEC-022`–`DEC-024`, fixed Argon doc notes L1 and L2 on `main`, and flagged L3 (`remainingCodons = 0` at `D = 38`, coupled duration `121.30 s`) for ST9.

### 7.4 Visual Evidence Audited by Chief (17 2× JPEG q90 Captures)

- `docs/evidence/r3/A4/` (3 captures): `rnap-ec-tracks-anchors.jpg`, `rnap-holo-rpo-tracks.jpg` (visible open promoter bubble), `nusg-l1-anchors.jpg` (`#15aabf`, `ntd`/`ctd` lobes).
- `docs/evidence/r3/A3/` (6 captures): `rf1-l1-l2.jpg` (`#ff6b6b` + `ggq` L2), `ef-tu-l1.jpg` (`#f783ac`), `ef-g-l1.jpg` (`#a9e34b`), `if1-l1.jpg` (`#d0bfff`), `if2-l1.jpg` (`#b197fc`), `if3-l1.jpg` (`#9775fa`).
- `docs/evidence/r3/K2/` (4 captures): `free-chain-mrna.jpg`, `terminator-hairpin.jpg` (8-bp A-form stem + WC H-bonds + GAAA loop), `peptide-tunnel-ribosome.jpg`, `peptide-released-closeup.jpg`.
- `docs/evidence/r3/R2/` (4 captures): `actor-card-ribosome-tunnel.jpg` (`paths.tunnel` + multi-site L2 cutaway), `part-release-sigma.jpg`, `fx-pulse-gtp.jpg` (`GTP → GDP` + bond pulse), `crowd-200-instances.jpg` (200 fog-blended translucent crowders around central 70S ribosome).

### 7.5 Not Verified in ST5

- Hardware-GPU desktop/phone frame times (all ST5 browser tests ran on headless Chromium SwiftShader).
- Live `StoryScene` chapter playback (ST6 `R3-R3` → `R3-U2` → `R3-S3` → `R3-INT2`, Gate G2).

---

## 8. Round 3 Stage ST6 & Gate G2 Verification (`r3-w2`)

Stage ST6 (`PLAN.md` §11) merged `R3-R3 → R3-U2 → R3-S3` (`--no-ff`) in exact order onto `main` after the Argon pre-S3 review (`docs/reviews/R3-ST6-argon.md`), followed by Chief integration **`R3-INT2`** (`js/scene/story-scene.js` + `js/main.js` wiring behind `?mode=express&scene=v2`, clamping playback at Chapter 7 end `66.25 s` until ST8/W3) and **Gate G2** (`PLAN.md` §12).

### 8.1 Gate G2 Checklist (`PLAN.md` §12)

| Gate G2 Criterion | Status | Evidence |
| :--- | :---: | :--- |
| 1. Chapters 1–7 play, pause, and seek on `index.html?mode=express&scene=v2` with zero console/page/network errors | **PASS** | Live Playwright verification (`clampedT = 66.25`, `playingAfterPlay = true`, `tAfterTick = 10.5`, `pausedHeld = true`, actor `sigma -> "σ⁷⁰"` & procedural `DNA -> "DNA duplex"` picking + clear, 0 console/page/HTTP errors) + `SMOKE PASS` on both `index.html?mode=express&scene=v2` and offline `dist/helix-standalone.html?mode=express&scene=v2` (`0` network requests). |
| 2. `PLAN.md` §5.3 invariants 1, 2, 7, and 8 pass | **PASS** | `tests/story-tx.test.mjs` (`6/6 pass`): 675-nt sequence identity & WC complement; monotonic integer `rna.length` (`0..179`) & bit-for-bit determinism across random seeks; bubble `<= 14 bp <= 15 bp` and 9-bp Ch 6 RNA·DNA hybrid; 448-sample slot-track L1 clearance `maxDnaPen = 0.956 Å`, `maxRnaPen = 0.459 Å`, `maxNtpPen = 0.063 Å` (all `<= 1.0 Å`); downstream DNA drift `6.93e-4 Å <= 0.01 Å`; warmed-up `stateAt + poser.pose` average `0.568 ms/frame < 1.0 ms`. |
| 3. Every chapter (1–7) screenshot reviewed on desktop (`1440×900` @ 2×) and phone (`iPhone 13` @ 2×) | **PASS** | All 14 captures (`docs/evidence/r3/INT2/desktop-ch{1..7}.jpg` and `phone-ch{1..7}.jpg`) visually inspected via `view_file`; framing, §4.3 palette, cutaway, labels (`<= 6`), and responsive bottom sheet verified clean across all 7 chapters without needing shot-distance overrides. |

### 8.2 Automated Verification Results

- **Syntax check (`node tools/check-syntax.mjs`):** `0 failed` across all JS/MJS files.
- **Asset build determinism (`node tools/build-assets.mjs --check --quiet`):** `identical` for all 13 asset files (`1.46 MB` total across 12 real assets).
- **Standalone bundle (`npm run build:standalone`):** `dist/helix-standalone.html` (**4.69 MB ≤ 7.5 MB**, 13 assets inlined in `window.__HELIX_ASSETS__`).
- **Node test suite (`npm test`):**
  ```text
  tests 284 · pass 284 · fail 0
  ```
  Includes `tests/camera-rails.test.mjs` (6/6 pass, browser Free interrupt, `reducedMotion`, 250 ms label fades & cap `<= 6`), `tests/story-tx.test.mjs` (6/6 pass), `tests/stubs.test.mjs` (24/24 pass, marking `ntp`, `pose`, `story-scene`, `camera-rails`, `labels`, `inspect` implemented per `DEC-005`), and all pre-existing Round 1–3 tests.
- **Browser smoke gate (`npm run smoke`):** `SMOKE PASS` (verified `/index.html`, `/dist/helix-standalone.html`, `/index.html?mode=express&scene=v2`, and offline `/dist/helix-standalone.html?mode=express&scene=v2` with zero errors and zero external network requests).
- **UI & Inspection browser suites:**
  - `node tests/ui-inspect.browser.mjs`: `UI-INSPECT PASS (141 checks)` (all 14 machine actor/part targets verbatim §5.4, all 6 procedural kinds `<= 120` chars, click-only `RCSB ↗`, all 13 PDB entries in About `"Sources"` §4.10, 0 external network requests).
  - `node tests/ui-story.browser.mjs`: `UI-STORY PASS (50 checks)` (desktop & `iPhone 13`, 0 overflow, 0 unnamed buttons).

### 8.3 ST6 Argon Independent Review (`docs/reviews/R3-ST6-argon.md`)

- **Window (UTC):** `2026-11-20T06:33:05Z` – `2026-11-20T06:41:41Z` (8 min 36 s / 30 min budget).
- **Verdict:** `READY TO LAUNCH R3-S3 WITH 6 CONCRETE BRIEF ADJUSTMENTS (C1–C6)`. All six adjustments were folded into the `R3-S3` brief and ratified in `DEC-027`.

### 8.4 Visual Evidence Audited by Chief (42 2× JPEG q90 Captures)

- `docs/evidence/r3/R3/` (2 captures): `shot-rnap-side-labels.jpg`, `shot-wide-overview-labels.jpg`.
- `docs/evidence/r3/U2/` (5 captures): `desktop-inspect-ribosome-30s.jpg`, `desktop-inspect-procedural-mrna.jpg`, `desktop-about-sources.jpg`, `phone-inspect-sigma70.jpg`, `phone-about-sources.jpg`.
- `docs/evidence/r3/S3/` (21 captures): `ch{1..7}-{start,mid,end}.jpg` in `dev/story-lab.html`.
- `docs/evidence/r3/INT2/` (14 captures): `desktop-ch{1..7}.jpg` (`1440×900` @ 2×) and `phone-ch{1..7}.jpg` (`iPhone 13` `390×844` @ 2×) on `index.html?mode=express&scene=v2`.

### 8.5 Not Verified in ST6

- Translation chapters (8–16) and Coupled mode (owned by Claude ST7 `R3-K3` → `R3-S4` starting from tag `r3-w2`, and ST8/ST9).
- Hardware-GPU desktop/phone FPS benchmarks (owned by ST9 `R3-P1`).





## 9. Round 3 Stage ST8 / Gate G3 (`r3-w3`, 2026-11-20)

ST8 (owner: Claude, reassigned by the user) covered `R3-R4`, `R3-Q2`, `R3-U3`, `R3-V2`, `R3-INT3` and a stage-wide audit. Details: `docs/handoffs/R3-R4.md`, `R3-Q2.md`, `R3-U3.md`, `R3-V2.md`, `R3-INT3.md`, `docs/reviews/R3-ST8-audit.md`, DEC-030, DEC-031.

### 9.1 Automated checks

| Check | Result |
| --- | --- |
| `npm test` | `tests 312 · pass 312 · fail 0` |
| `npm run smoke` | `SMOKE PASS` |
| `node tests/ui-story.browser.mjs` | `UI-STORY PASS (50 checks)` |
| `node tests/ui-inspect.browser.mjs` | `UI-INSPECT PASS (141 checks)` |
| `node tests/ui-phone.browser.mjs` | `UI-PHONE PASS (269 checks, 2 known defects)` |
| `node tools/evidence/sweep.mjs` (16 chapters, desktop, mid) | 16 / 16 shots, 0 console errors, 0 page errors |
| `node tools/build-assets.mjs --check` | **Not run**: the sandbox cannot reach RCSB (403). No asset or recipe changed in ST7 or ST8. |

### 9.2 Gate G3 criteria (PLAN §12)

| Criterion | Evidence | Result |
| --- | --- | --- |
| Full Step by step story passes §5.3 | `tests/story-tl.test.mjs` (item 8 now covers every chapter 8–16 sample; fixed chapter-8 penetration of 2.1 Å) plus audit runs over 1,956 poses | PASS |
| Peptide emerges from `tunnelExit` before chapter 15 ends | `tests/story-speed.test.mjs`: inside at the start of chapter 14, 45 Å beyond the exit at its end, outside at the end of chapter 15; frames in `docs/evidence/r3/INT3/` | PASS |
| 4× and 0.5× identical at the same story time | `tests/story-speed.test.mjs`: world, atoms, actors and FX equal after 0.5×, 1×, 4× and a direct seek at four times | PASS |
| Frame-time table for software GL | `docs/PERF.md` §3.2 | PASS (software GL only) |

**Gate G3: PASS.**

### 9.3 Stage-wide audit

`docs/reviews/R3-ST8-audit.md`: 42 findings, none High. Fixed: cutaway never opening the ribosome, chapter-8 clearance, chapter-1 holoenzyme, label placement and starvation, RNAP/DNA/IF/About wording, stale D = 38 text in PLAN. Deferred items are listed there for ST9 and for the user (caption wording, `DEFAULT_D`, hairpin–uS3 clash, test coverage gaps).

### 9.4 Not verified in ST8

- Hardware-GPU frame time (G4) and real phones (G5).
- RCSB titles and citations; `build-assets --check`.
- Full 96-shot sweep and 2× captures (see `docs/handoffs/R3-V2.md`).
- Coupled mode beyond chapter 5 (ST9).
- Tags `r3-st7` and `r3-w3`: the session git proxy refuses tag pushes, so the Chief creates them.
