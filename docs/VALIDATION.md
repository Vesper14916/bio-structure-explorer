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

## 3. Visual & Mobile Acceptance Pass (2026-11-17)

Scope: visual inspection of all six modes at desktop and phone size, load-time and console checks, mobile bottom-sheet behavior, and a check of the single-file build. This pass covers the static site as committed on `claude/ecstatic-sagan-7fl6hp`.

### 3.1 Defects found and fixed

| ID | Severity | Finding | Fix |
| :--- | :--- | :--- | :--- |
| V-01 | **Blocking** | `js/ui/about.js` had one extra closing parenthesis. The module failed to parse, so the whole application (`js/main.js`) never started: an empty page with a `Unexpected token ')'` page error. The earlier 37/37 automated pass did not cover the UI modules, so this went unnoticed. | Removed the extra `)`. All project modules now pass `node --check`. |
| V-02 | Medium | On phones in the peek snap state, the Explore view showed an empty sheet. The quick-access row (`.peek`) sat after the "Nucleic acid" group, which is hidden in peek, so it was pushed below the visible 112 px. | `css/style.css`: in `.snap-peek`, the view is a flex column and `.peek` takes `order: -1`. Verified in half and peek states. |

Note on V-02: while investigating, the probe script clicked the already-active Explore tab, which toggles the sheet between peek and half (`js/ui/ui.js`, mode-tab handler). This is intended behavior, not a defect, but it means automated screenshots must not click the active tab.

### 3.2 Automated checks run in this pass

| Check | Result |
| :--- | :--- |
| `node --test tests/science.test.mjs tests/sim.test.mjs` | 37 / 37 pass |
| `node --check` on every `js/**/*.js` module | all pass (after V-01) |
| Headless Chromium, 12 views (6 modes × desktop 1440×900 @2x, phone iPhone 13 390×664) | No page errors. No horizontal overflow in any view (`scrollWidth == clientWidth`). |
| External network requests during load and mode switching | none (only `127.0.0.1`, data URIs) |
| Desktop console | only WebGL "GPU stall due to ReadPixels" performance messages from software GL |
| `dist/helix-standalone.html` opened via `file://` | renders, 12 tabs present (desktop + mobile tab lists), no errors, no external requests |

### 3.3 Visual review (screenshots, see `docs/evidence/2026-11-17/`)

Screenshots are JPEG downscales of the captured PNGs. The evidence set is: `desktop-{Explore,Pairs,Melt,Copy,Express,Xray}.jpg`, `phone-{Explore,Pairs,Melt,Copy,Express,Xray}.jpg`, and `phone-explore-{half,peek}.jpg`.

| Mode | Desktop | Phone | Observations |
| :--- | :--- | :--- | :--- |
| Explore | Pass | Pass after V-02 | Controls, sequence strip, and colour legend readable. |
| Pairs | Pass | Pass | Hydrogen-bond distances labelled; base cards scroll horizontally inside the sheet; the highlighted pair is clear. |
| Melt | Pass | Pass | Temperature readout, slider, and `Tm` marker visible; state badge correct at 25 °C. |
| Copy | Pass | Pass | Helicase, legend, and counters visible. The "Helicase" label was semi-transparent in one phone frame (see limitations). |
| Express | Pass | Pass | Pause/restart/speed, camera follow, codon table, and counters visible. On the phone the caption is clamped in peek state, as designed. |
| X-ray | Pass | Pass | 1BNA resolution, water toggle, provenance, and the ideal-vs-crystal table visible. |

### 3.4 Known limitations (not resolved by this pass)

- **Software rendering only.** Headless Chromium used SwiftShader, so frame rate was not measured. The 60 fps desktop and 30 fps phone targets in `PLAN.md` §12 remain unverified.
- **Motion not observed.** Evidence is static frames. Playback smoothness, label fade-in timing, and camera transitions still need a real-device or live-browser review.
- **Label legibility in Express (phone).** The "RNA Polymerase (RNAP)" label sits over the strand and is semi-transparent in the captured frame. Possibly a fade transition captured mid-animation under software GL; not confirmed. Candidate fix: stronger label background in Express.
- **Devices.** One emulated phone profile (iPhone 13 in Chromium). No physical iOS Safari or Android test; keyboard-open and orientation changes were not exercised.
- **Accessibility not re-checked.** Keyboard navigation of the sheet, reduced-motion behavior, and contrast were not re-audited in this pass.
- **Structure assets.** RNAP, 30S/50S subunits, tRNA, and RF1 remain translucent envelopes, not structure-derived models (see `docs/ASSETS.md`).
