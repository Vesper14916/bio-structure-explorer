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
