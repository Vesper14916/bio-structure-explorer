# Project Task Board

Updated: 2026-11-16
Branch: `feat/rna-gene-expression`
Integration Owner: Agent 0 (**Gemini 4 Argon** — High effort)

| Task ID | Milestone | Status | Owner Agent (Model & Effort) | Owned Files | Deliverable & Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T01** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | Git branch `feat/rna-gene-expression` | Reconciled `origin/claude/dna-structure-visualization-85q6rc` (`246fa52`) with `main` planning documents (`PLAN.md`, `AGENTS.md`). |
| **T02** | M0 | `DONE` | Agent 4 (`Gemini 3.5 Flash-Lite`, Low) | `tests/science.test.mjs`, `tests/sim.test.mjs` | Rerunnable baseline verified: 29/29 baseline tests passing (`6.88 s`). |
| **T03** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | `docs/SCIENCE.md`, `docs/ASSETS.md` | Bacterial 48-bp construct, Turner RNA thermo, and simplifications documented. |
| **T04** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | `docs/CONTRACTS.md`, `docs/TASKS.md` | Frozen contracts for RNA (`U`, `O2'`, `HELIX_A`), codon/peptide schemas, sim APIs, and UI handlers/setters. |
| **T05 & T08** | M1–M2 | `DONE` | Agent 1 (`Gemini 4 Hydrogen`, High) | `js/science/bases.js`, `js/science/templates.js`, `js/science/assembly.js`, `js/science/thermo.js`, `js/science/genetic-code.js`, `js/science/index.js`, `tests/science.test.mjs` | Atomic Uracil (`U`), Ribose `O2'` (`1.413 Å`), regularised A-RNA template (`HELIX_A`), `A·U` & `G·U` wobble pairing, Turner RNA thermodynamics, and bacterial genetic code engine (`docs/handoffs/T05-T08-science.md`). |
| **T06, T09, T11** | M1–M3 | `DONE` | Agent 2 (`Gemini 4 Hydrogen`, High) | `js/sim/expression.js`, `tests/sim.test.mjs` | Pure-time deterministic bacterial gene-expression simulation (`createExpressionSim`): RNAP transcription bubble, rNTP addition, 9-bp RNA·DNA hybrid, mRNA exit trajectory, 30S/50S ribosome docking at Shine–Dalgarno, initiator `fMet-tRNA` at P-site, A→P→E codon translocation, nascent 11-aa peptide growth, and `RF1` stop-codon release (`docs/handoffs/T06-T09-T11-sim.md`). |
| **T10 & T12a** | M2–M4 | `DONE` | Agent 3 (`Gemini 4 Hydrogen`, Medium–High) | `js/render/colors.js`, `js/render/molecule.js`, `js/render/cartoon.js`, `js/render/overlay.js`, `js/render/viewer.js` | Uracil (`U`) palette, RNA/peptide strand colors, nascent peptide chain 3D sphere-and-tube rendering in `MoleculeLayer`, macromolecular cutaway shader (`uCutaway`), and guided camera focus (`docs/handoffs/T10-T12a-render.md`). |
| **T07 & T12b** | M1–M4 | `DONE` | Agent 4 (`Gemini 4 Hydrogen`, Medium) + Agent 0 (`Gemini 4 Argon`, High) | `js/ui/ui.js`, `js/ui/view-structure.js`, `js/ui/view-pair.js`, `js/ui/view-melt.js`, `js/ui/view-express.js`, `js/sim/melt.js`, `js/main.js`, `css/style.css` | DNA/RNA mode toggle in Explore/Pairs/Melt, new `Express` tab (`view-express.js`) with multi-track DNA/mRNA/Codon/Peptide strip, camera & cutaway controls, and full application wiring in `js/main.js` (`docs/handoffs/T07-T12b-ui.md`). |
| **T13** | M5 | `DONE` | Agent 4 (`Gemini 3.8 Flash`, Low) + Agent 0 (`Gemini 4 Argon`, High) | `docs/VALIDATION.md`, `README.md` | Full test suite execution (`37/37 PASS`), static packaging & zero-external-network audit (`docs/VALIDATION.md`). |

---

## Round 2, Wave 1 (opened 2026-11-17)

Base branch: `claude/admiring-cray-fdre6q`. Team plan: `docs/tasks/R2-W1-README.md`. Round 1 statuses above are superseded by the audit in `PLAN.md` section 13.

| Task ID | Status | Owner (model, effort) | Deliverable | Brief |
| :--- | :--- | :--- | :--- | :--- |
| **R2-W0** | `DONE` | Integration Owner (top tier, high) | Hotfix for the blank page; Wave 1 contracts (`docs/CONTRACTS.md` section 6); `js/assets/format.js`; synthetic fixture asset; 40/40 tests | — |
| **R2-W1-A** | `DONE` | Opus, medium | Asset pipeline; RNA polymerase asset (N1) | `docs/tasks/R2-W1-A-asset-pipeline-rnap.md` |
| **R2-W1-B** | `DONE` | Sonnet, high | Machine actor renderer; actor card | `docs/tasks/R2-W1-B-actor-renderer.md` |
| **R2-W1-C** | `DONE` | Sonnet, medium | Residue library and peptide (N5); NTP and PPi (N7) | `docs/tasks/R2-W1-C-residues-ntp.md` |
| **R2-W1-D** | `DONE` | Haiku, high | `package.json`, syntax check, smoke gate, record reconciliation, 150-bp construct | `docs/tasks/R2-W1-D-hygiene-construct.md` |
| **R2-W1-INT** | `DONE` | Integration Owner | Merge D → C → A → B; gate review; evidence in `docs/VALIDATION.md` | `docs/tasks/R2-W1-README.md` |

Wave 1 closed 2026-11-17. Evidence: `docs/VALIDATION.md` section 4.

---

## Round 3 — Ten Serial Stages (opened 2026-11-19)

Schedule and executor allocation: `PLAN.md` §9.1 and §11 (revised 2026-11-19, base commit `2bcb1fc`).
Integration Owner / Chief: **Gemini (Antigravity, main session)**.
Model note (`PLAN.md` §9.1): Antigravity `invoke_subagent` inherits the parent session model (`Model: 'inherit'`); all ST1 implementation subagents and the ST1 read-only review subagent therefore inherited the Chief session model.

### Stage ST1 — Setup, Contracts, and Construct v3 (Gemini; tag `r3-w0`)

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-W0 (Chief)** | `DONE` | Gemini Chief | `main` | Recipe driver `tools/build-assets.mjs` + `tools/assets/rnap.mjs`, `fetch-sources` script, Asset Format v2 (`js/assets/format.js`) + v2 `fixture-machine`, `js/assets/registry.js`, Round 3 §4.3 `ACTOR_TOKENS` + `crowdColor`, camera far `12000`, `?scene=v2` route, frozen `docs/CONTRACTS.md` §7, `docs/DECISIONS.md`. |
| **R3-W0-sources** | `DONE` | Gemini subagent (inherited model) | `r3/w0-sources` (merged `--no-ff`) | `tools/lib/superpose.mjs`, `tools/lib/match.mjs`, `tools/fetch-sources.mjs`, `tools/sources.lock.json` (all 13 entries with SHA-256), `tests/tools-superpose.test.mjs`, `docs/handoffs/R3-W0-sources.md`. |
| **R3-W0-stubs** | `DONE` | Gemini subagent (inherited model) | `r3/w0-stubs` (merged `--no-ff`) | 23 Node-safe module stubs (`PLAN.md` §8.1), `tests/stubs.test.mjs`, `docs/handoffs/R3-W0-stubs.md`. |
| **R3-W0-fixtures** | `DONE` | Gemini subagent (inherited model) | `r3/w0-fixtures` (merged `--no-ff`) | `tests/fixtures/world-state.json`, `tests/fixtures/story-mini.json`, `tests/fixtures.test.mjs`, `docs/handoffs/R3-W0-fixtures.md`. |
| **R3-S1** | `DONE` | Gemini subagent (inherited model) | `r3/s1` (merged `--no-ff` after W0) | Construct v3 (248 bp, 179-nt mRNA, 40-codon ORF), `codonTable`, `AMINO_ACIDS`, 9 remaining non-proline residue templates (20 total), `tests/scenario.test.mjs`, `tests/residues.test.mjs`, `docs/SCIENCE.md` §3–§4, `docs/handoffs/R3-S1.md`. |

#### ST1 Argon Job Log (`PLAN.md` §9.1 & §11)

- **Job:** Review frozen `docs/CONTRACTS.md` §7 and Asset Format v2 against `PLAN.md` §7–§8 before tagging `r3-w0`.
- **Start (UTC):** `2026-11-19T06:33:15Z`
- **End (UTC):** `2026-11-19T06:37:47Z` (4 min 32 s / 30 min budget)
- **Executor note:** Read-only `research` subagent (inherited session model).
- **Report:** `docs/reviews/R3-ST1-argon.md`
- **Outcome:** `PASS WITH MINOR FIXES` — 1 High (`format.js` v2 `lod2.sites` bypass & v1 `lod2` validation), 4 Medium (`tracks.*.synthetic` validation + `tracks.*.sources`, `WorldState.dna.trackBlend` + restored §7.3–§7.4 semantics, ribosome `(partId, chain.class)` L1 fallback, `build-assets.mjs --only` manifest merge), 3 Low (`decodeAsset` part role default, `registry.js` inlined guard, cycle guard & docs). All 8 findings accepted and applied prior to tagging `r3-w0` (`DEC-007`, `DEC-008`).

### Stage ST2 — Ribosome and tRNA Assets (Claude C1; tag `r3-st2` at `2d9512c`)

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-A1** | `DONE` | Claude (C1) | `claude/bold-mayer-j248mg` (merged `--no-ff`) | `tools/assets/ribosome.mjs`, `assets/ribosome-70s.asset.json` (v2, 724.8 kB, 48,064 tri, 9,978 beads, 756 L2 atoms, 86.71 Å tunnel), `tests/assets-ribosome.test.mjs`, `docs/assets/ribosome-70s.md`, `docs/evidence/r3/A1/` (6 captures), `docs/handoffs/R3-A1.md`. Rulings: `DEC-009`–`DEC-012`. |
| **R3-A2** | `DONE` | Claude (C1) | `claude/bold-mayer-j248mg` (merged `--no-ff`) | `tools/assets/trna.mjs`, `assets/trna-init.asset.json` (50.9 kB, span 76.15 Å), `assets/trna-aa.asset.json` (50.9 kB, span 81.71 Å), `tests/assets-trna.test.mjs`, `docs/assets/trna.md`, `docs/evidence/r3/A2/` (6 captures), `docs/handoffs/R3-A2.md`. Ruling: `DEC-013`. |

### Stage ST3 — Kinematics Core and Story Engine (Claude C2; tag `r3-st3`)

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-K1** | `DONE` | Claude (C2) | `claude/bold-mayer-j248mg` (merged `--no-ff`) | `js/kin/frames.js`, `js/kin/track.js`, `js/kin/duplex.js`, `dev/kin-lab.html`, `tests/kin-frames.test.mjs`, `tests/kin-duplex.test.mjs`, `docs/evidence/r3/K1/` (6 captures), `docs/handoffs/R3-K1.md`. Rulings: `DEC-014`–`DEC-016`. |
| **R3-S2** | `DONE` | Claude (C2) | `claude/bold-mayer-j248mg` (merged `--no-ff`) | `js/sim/gene/timeline.js`, `js/sim/gene/shots.js`, `js/sim/gene/story.js`, pass-through plug points (`transcription.js`, `translation.js`, `coupled.js`), `tests/timeline.test.mjs`, `tests/story.test.mjs`, `docs/handoffs/R3-S2.md`. Rulings: `DEC-017`–`DEC-018`. |

### Stage ST4 — Standalone Gates, Detail Sphere, Express v2 Panel & Gate G1 (Gemini; tag `r3-w1`)

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-Q1** | `DONE` | Gemini subagent (inherited model) | `r3/q1` (merged `--no-ff`) | Standalone inlined assets (`window.__HELIX_ASSETS__` in `dist/helix-standalone.html`), `?scene=v2` smoke + broken-import diagnostics (`tests/smoke.browser.mjs`), `tests/asset-budgets.test.mjs`, `docs/handoffs/R3-Q1.md`. |
| **R3-R1** | `DONE` | Gemini subagent (inherited model) | `r3/r1` (merged `--no-ff`) | Detail-sphere cross-fade (`js/render/molecule.js`, `js/render/cartoon.js`), `AtomGroupLayer` (`js/render/atom-groups.js`), `viewer.setDetailFocus`/`setAtomGroups` (`js/render/viewer.js`), `tests/render-detail.browser.mjs`, `docs/evidence/r3/R1/` (5 captures), `docs/handoffs/R3-R1.md`. Ruling: `DEC-020`. |
| **R3-U1** | `DONE` | Gemini subagent (inherited model) | `r3/u1` (merged `--no-ff`) | Express v2 panel (`js/ui/view-story.js`, `js/ui/ui.js` `?scene=v2` wiring, `css/style.css` §4.8 block), `dev/ui-story.html`, `tests/ui-story.browser.mjs` (50 checks), `docs/evidence/r3/U1/` (13 captures), `docs/handoffs/R3-U1.md`. Ruling: `DEC-021`. |

#### ST4 Argon Job Log (`PLAN.md` §9.1 & §11)

- **Job:** Independent review of Gate G1 evidence for Claude ST2 assets (`ribosome-70s`, `trna-init`, `trna-aa`): colour sampling against `PLAN.md` §4.3, LOD/size budgets (§7.5), pairing tests and structural invariants, and unit-test quality audit.
- **Start (UTC):** `2026-11-19T10:27:11Z`
- **End (UTC):** `2026-11-19T10:29:59Z` (2 min 48 s / 30 min budget)
- **Executor note:** Read-only `research` subagent (inherited session model).
- **Report:** `docs/reviews/R3-ST4-argon.md`
- **Outcome:** `PASS WITH MINOR NOTES` (0 High, 0 Medium, 3 Low) — recommended Gate G1 PASS. Recorded `DEC-019` clarifying Gate G1 colour sampling on resolved albedo / unlit renders or ACES-matched reference swatches (L1), flagging the `js/render/actors.js:chainColor()` RNAP substring watch item for ST5 factors (L3), and noting optional test-hardening items (L2).

### Stage ST5 — RNAP v2 & NusG, Factors, Free Chains/Hairpin/Peptide Path, and Actor/FX Extensions (Gemini; tag `r3-st5`)

Base: `r3-w1` + Chief `DEC-011` `tools/lib/match.mjs` update (`50716d1`). Merged in exact `PLAN.md` §11 order (`--no-ff`): `R3-A4 → R3-A3 → R3-K2 → R3-R2`.

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-A4** | `DONE` | Gemini subagent (inherited model) | `r3/a4` (merged `--no-ff`) | `tools/assets/rnap.mjs`, `tools/assets/nusg.mjs`, Format v2 `rnap-ec` (`ntpEntry`, `hairpin`, `expressome`, `coupledMrna`, `D = 38`), `rnap-holo` (`ntpEntry`, `6CA0` RPo tracks `−45..+11`, pre-ST5 L0/L1/L2 preserved byte-for-byte), `nusg` (`center`/`ntd`/`ctd`, 35.8 kB), `tests/assets-rnap-v2.test.mjs`, `docs/assets/rnap.md`, `docs/evidence/r3/A4/` (3 captures), `docs/handoffs/R3-A4.md`. Rulings: `DEC-023`, `DEC-024`. |
| **R3-A3** | `DONE` | Gemini subagent (inherited model) | `r3/a3` (merged `--no-ff`) | `tools/assets/factors.mjs`, 6 Format v2 factor assets (`rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`, total 233.2 kB), `tests/assets-factors.test.mjs` (32 tests), `docs/assets/factors.md` (RMSDs, kept fractions, `< 3.0 Å` clash report), `docs/evidence/r3/A3/` (6 captures), `docs/handoffs/R3-A3.md`. Ruling: `DEC-022`. |
| **R3-K2** | `DONE` | Gemini subagent (inherited model) | `r3/k2` (merged `--no-ff`) | `js/kin/chain.js`, `js/kin/hairpin.js`, `js/kin/peptide-path.js`, `tests/kin-chain.test.mjs` (11 tests), `docs/evidence/r3/K2/` (4 captures), `docs/handoffs/R3-K2.md`. Ruling: `DEC-025`. |
| **R3-R2** | `DONE` | Gemini subagent (inherited model) | `r3/r2` (merged `--no-ff`) | `js/render/actors.js` (per-part transforms/opacity, `pickable: false`, multi-site L2, 1-draw-call-per-part instanced crowders, `DEC-019` L3 `chainColor` guard), `js/render/fx.js`, `js/render/viewer.js` (`setFx`, `setFar`, `setCrowd`, `setActors` updates), `dev/actor-card.html` (v2 paths), `tests/render-actors.browser.mjs`, `docs/evidence/r3/R2/` (4 captures), `docs/handoffs/R3-R2.md`. Ruling: `DEC-026`. |

#### ST5 Argon Job Log (`PLAN.md` §9.1 & §11)

- **Job:** Independent audit of R3-A3 factor superposition RMSDs / kept fractions and R3-A4 coupling distance `D` with its exact counting method (`6ZTJ` chain `AV` vs `PLAN.md` §6.4 `24 + D` and §13).
- **Start (UTC):** `2026-11-20T02:03:57Z`
- **End (UTC):** `2026-11-20T02:09:04Z` (5 min 7 s / 30 min budget)
- **Executor note:** Read-only `research` subagent (inherited session model).
- **Report:** `docs/reviews/R3-ST5-argon.md`
- **Outcome:** `PASS WITH MINOR NOTES` (0 High, 0 Medium, 5 Low). Independently reproduced all 6 A3 superpositions and `D = 53 - 16 + 1 = 38` nt with zero off-by-one discrepancy in `timeline.js`. Ratified `DEC-022`–`DEC-024`; fixed L1 (`docs/assets/rnap.md` revision dates) and L2 (`docs/assets/factors.md` L0 input prose) on `main`; flagged L3 (`remainingCodons = 0` at `D = 38`, coupled duration `121.30 s`) for ST9 `R3-S5`/`R3-V1`.

### Stage ST6 — Camera Rails & Labels, Inspection & Sources, Transcription Choreography, and Gate G2 (Gemini; tag `r3-w2`)

Base: `r3-st5` + Chief `js/render/viewer.js` `setLabels` / `controlstart` / `AtomGroupLayer` picking prep (`431f327`). Merged in exact `PLAN.md` §11 order (`--no-ff`): `R3-R3 → R3-U2 → R3-S3`, followed by Chief `R3-INT2` and **Gate G2 PASS**.

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-R3** | `DONE` | Gemini subagent (inherited model) | `r3/r3` (merged `--no-ff`) | `js/scene/camera-rails.js`, `js/scene/labels.js`, `js/render/overlay.js` (priority cap 6 and 250 ms fading), `tests/camera-rails.test.mjs` (6/6 pass), `docs/evidence/r3/R3/` (2 captures), `docs/handoffs/R3-R3.md`. |
| **R3-U2** | `DONE` | Gemini subagent (inherited model) | `r3/u2` (merged `--no-ff`) | `js/ui/inspect.js` (14 machine targets + 6 procedural kinds), `js/ui/about.js` (Sources section §4.10, 13 PDBs), `js/ui/view-story.js` (inspect card body), `tests/ui-inspect.browser.mjs` (141 checks), `docs/evidence/r3/U2/` (5 captures), `docs/handoffs/R3-U2.md`. |
| **R3-S3** | `DONE` | Gemini subagent (inherited model) | `r3/s3` (merged `--no-ff`) | `js/sim/gene/transcription.js` (Ch 1–7, Argon C1/C4/C5), `js/kin/ntp.js` (Argon C6), `js/kin/pose.js` (675-nt Assembly, Argon C1–C3), `dev/story-lab.html`, `tests/story-tx.test.mjs` (6/6 pass, §5.3 items 1, 2, 7, 8), `docs/evidence/r3/S3/` (21 captures), `docs/handoffs/R3-S3.md`. Ruling: `DEC-027`. |
| **R3-INT2** | `DONE` | Gemini Chief | `main` | `js/scene/story-scene.js` + `js/main.js` wiring for chapters 1–7 behind `?mode=express&scene=v2` (clamped at Ch 7 end `66.25 s` until ST8/W3), `js/render/colors.js`/`viewer.js` alignment (`DEC-028`), standalone double-boot guard & smoke speedup (`DEC-029`), 14 desktop/phone chapter captures in `docs/evidence/r3/INT2/`, Gate **G2 PASS** (`docs/VALIDATION.md` §8), tag `r3-w2`. |

#### ST6 Argon Job Log (`PLAN.md` §9.1 & §11)

- **Job:** Pre-S3 review of the `R3-S3` brief against `PLAN.md` §5.3 and the K1/K2/S2 APIs (`js/sim/gene/transcription.js`, `js/kin/ntp.js`, `js/kin/pose.js`, `dev/story-lab.html`, `tests/story-tx.test.mjs`).
- **Start (UTC):** `2026-11-20T06:33:05Z`
- **End (UTC):** `2026-11-20T06:41:41Z` (8 min 36 s / 30 min budget)
- **Executor note:** Read-only `research` subagent (inherited session model).
- **Report:** `docs/reviews/R3-ST6-argon.md`
- **Outcome:** `READY TO LAUNCH R3-S3 WITH 6 CONCRETE BRIEF ADJUSTMENTS (C1–C6)`. Identified and solved: (C1) `rnap-holo` (`r1 = 11`) vs `rnap-ec` (`r1 = 13`) downstream anchor jump (`55.20 Å` → `0.000 Å` via `machinePoseForRegister(assets['rnap-ec'], reg)` and `effectiveTrackBlend = Math.max(1e-6, world.dna.trackBlend)` in `pose.js`); (C2) reading `tracks.rna`, `anchors.rnaExit`, and `anchors.hairpin` from `assets['rnap-ec']` with an outward 5′ free-chain exit tangent; (C3) exact 675-nt `Assembly` topology and `PPI_TEMPLATE` constant import; (C4) register stepping (`45 + n - 1` → `min(223, 45 + n)`), frozen register `223` relaxation with departing RNAP in Chapter 7, and §5.3 item 8 active slot-track check; (C5) two-stage local-frame $\sigma^{70}$ displacement along `uSigma = [-0.797, -0.518, 0.309]` (`0 → 12 Å` pre-displacement during early Chapter 5 to prevent the 1.48 Å RNA·$\sigma_{3.2}$ finger clash, then `12 → 60 Å` during `part.release` with seamless `rnap-holo → rnap-ec` transition); and (C6) centroid-guided `poseNtp` along the secondary-channel ray (`maxPen = 0.400 Å ≤ 1.0 Å`).

### Stage ST7 — Translation Choreography (Claude C3; tag `r3-st7`)

Delivered on `origin/claude/project-thread-hhdgkv` (`--no-ff` merges `d037442` R3-K3, `ba78ec3` R3-S4). Tag `r3-st7` now exists on `origin` at `b2748a7`.

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-K3** | `DONE` | Claude (C3) | `r3/K3` | `js/kin/trna.js`, `tests/kin-trna.test.mjs`; `docs/handoffs/R3-K3.md`. |
| **R3-S4** | `DONE` | Claude (C3) | `r3/S4` | `js/sim/gene/translation.js`, `js/kin/pose.js` (translation), `tests/story-tl.test.mjs`, `docs/evidence/r3/S4/`; `docs/handoffs/R3-S4.md`. |

### Stage ST8 — Crowders, Performance, Phone/Keyboard, Evidence Sweep, Full Story and Gate G3 (Claude; tag `r3-w3`)

The user reassigned ST8 from Gemini to Claude (this overrides `AGENTS.md` ownership for ST8 only). Branch `claude/project-thread-weimhy`, based on the ST7 head. Models: Sonnet 5.5 high for the main work and judgement tasks, Haiku (high) for mechanical subtasks. Order deviation: the INT3 wiring (asset list, clamp, crowd) was done before U3 and V2 so that their evidence comes from the real app.

| Task ID | Status | Owner / Executor | Deliverable & Handoff |
| :--- | :--- | :--- | :--- |
| **R3-R4** | `DONE` | Claude (Sonnet) | `js/scene/crowd.js`, `tests/crowd.test.mjs`, `docs/SCIENCE.md` §5; `docs/handoffs/R3-R4.md`. |
| **R3-Q2** | `DONE` | Haiku subtask | `tools/perf/*`, `docs/PERF.md`; `docs/handoffs/R3-Q2.md`. |
| **R3-U3** | `DONE` | Sonnet subtask | `tests/ui-phone.browser.mjs`, `js/ui/view-story.js` keyboard fix, `docs/evidence/r3/U3/`; `docs/handoffs/R3-U3.md`. |
| **R3-V2** | `DONE` | Haiku subtask | `tools/evidence/sweep.mjs`, `docs/evidence/r3/sweep/`; `docs/handoffs/R3-V2.md`. |
| **R3-INT3** | `DONE` | Claude (Chief role for ST8) | Full Step by step story in the app, audit fixes, Gate **G3** (`docs/VALIDATION.md` §9); `docs/handoffs/R3-INT3.md`, `DEC-030`, `DEC-031`. |
| **ST8 audit** | `DONE` | Two read-only Sonnet reviewers + Claude | `docs/reviews/R3-ST8-audit.md` (and two raw reports). Replaces the Argon job for ST8. |

### Stage ST9 (2026-11-21)

Base: `2675b1b` (`main`, post-PR #5; not `r3-w3` at `9182358`). Stage branch: `r3/st9` (PR to `main`; target tag `r3-w4` to be created by the user after merge). Pre-ST9 rulings: `DEC-032`.
Model note (`PLAN.md` §9.1): Antigravity `invoke_subagent` inherits the parent session model (`Model: 'inherit'`); all ST9 implementation subagents and the ST9 read-only science review subagent therefore inherit the Chief session model.

| Task ID | Status | Owner / Executor | Branch | Deliverable & Handoff |
| :--- | :--- | :--- | :--- | :--- |
| **R3-P1** | `IN PROGRESS` | Gemini subagent (inherited model) | `r3/R3-P1` (held for atomic merge in `R3-INT4` per `DEC-032`) | Port Round 1 Express invariants to `tests/story-legacy-port.test.mjs`, update `tests/sim.test.mjs`, delete `js/sim/expression.js` and `js/ui/view-express.js`; `docs/handoffs/R3-P1.md`. |
| **R3-D1** | `IN PROGRESS` | Gemini subagent (inherited model) | `r3/R3-D1` | User-facing `README.md`, `docs/SCIENCE.md` (§1–2 & §6+ only; §3–4 S1 and §5 R4 untouched), `docs/RELEASE-NOTES.md` (`D = 38`, `164.05 s`, `121.30 s` per `DEC-024`); `docs/handoffs/R3-D1.md`. |
| **R3-S5** | `IN PROGRESS` | Gemini subagent (inherited model) | `r3/R3-S5` | Coupled mode Ch 6–12 (`js/sim/gene/coupled.js`, `js/kin/pose.js` coupled path per `DEC-032`), `tests/story-coupled.test.mjs` (`D = 38`, S-04 hairpin vs uS3 clash test), `docs/evidence/r3/S5/`; `docs/handoffs/R3-S5.md`. |
| **R3-V1** | `PENDING` | Gemini subagent (inherited model, read-only, ≤ 30 min) | `docs/reviews/R3-V1-science.md` | Independent science review (Coupled Ch 6–12, ST8 deferred `S-06`–`S-18` & `F07`–`F11`, `I-06` PDB provenance); report at `docs/reviews/R3-V1-science.md`. |
| **R3-INT4** | `PENDING` | Gemini Chief | `r3/st9` | V1 high-severity fixes, Express v2 cutover in `js/main.js` & `js/ui/ui.js`, atomic merge of `r3/R3-P1`, remove `?scene=v1`, S-05 `DEFAULT_D = 38` (`js/sim/gene/timeline.js:25-26` + `tests/timeline.test.mjs:350-352` per `DEC-032`), update `docs/CONTRACTS.md` §4–§5 / `docs/VALIDATION.md` §10 / `docs/PERF.md` §5, Gate **G4** (`PENDING (human)` hardware GPU frame time), PR `r3/st9` → `main`. |

### Upcoming Stages (ST7–ST10)

| Stage | Executor | Tasks (merge order) | Base Tag | Target Tag | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ST7** | **Claude (C3)** | `R3-K3` → `R3-S4` (translation choreography) | `r3-w2` | `r3-st7` | `DONE` |
| **ST8** | Claude (reassigned) | Intake ST7; `R3-R4` → `R3-Q2` → `R3-U3` → `R3-V2` → `R3-INT3`; Gate **G3** | `r3-st7` | `r3-w3` | `DONE` (tag `r3-w3` exists on `origin` at `9182358` [PR #4]; `origin/main` is at `2675b1b` [PR #5]) |
| **ST9** | Gemini | `R3-P1` → `R3-D1` → `R3-S5` → `R3-V1` → `R3-INT4`; Gate **G4** (merge order per `DEC-032`: `D1` → `S5` → `V1` → `P1`+`INT4`) | `2675b1b` (`main`, post-PR #5; not `r3-w3`) | `r3-w4` | `IN PROGRESS` |
| **ST10** | Gemini + Human | `R3-Q3` → `R3-INT5` + Human visual acceptance; Gate **G5** | `r3-w4` | `v1.0.0` | `PENDING` |



