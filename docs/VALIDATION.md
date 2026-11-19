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

