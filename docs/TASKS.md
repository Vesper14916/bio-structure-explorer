# Project Task Board

Updated: 2026-11-17
Branch history: `feat/rna-gene-expression` was merged into `main` (PR #3, `72d888b`). Active branch for follow-up work: `claude/ecstatic-sagan-7fl6hp` (see `docs/DECISIONS.md`, D-004).
Integration Owner: Agent 0 (**Gemini 4 Argon** — High effort) for T01–T13; single-session integration owner for T14–T15 (2026-11-17).

Owner names in rows T01–T13 record the model that was assigned at the time; they are historical and are not a current allocation. Use the allocation policy in `AGENTS.md` for new work.

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
| **T14** | M4–M5 | `DONE` | Integration owner, single session (2026-11-17) | `js/ui/about.js` (V-01), `css/style.css` (V-02 phone peek), `docs/VALIDATION.md` §3, `docs/evidence/2026-11-17/` | Blocking parse error in `about.js` fixed (application would not start). Phone peek state shows the quick-access row in Explore. Six modes checked at desktop and phone size: no page errors, no horizontal overflow, no external requests. Limitations recorded in `VALIDATION.md` §3.4 (software GL, motion not observed, one emulated device). `docs/handoffs/T14-T15-acceptance.md`. |
| **T15** | M5 | `DONE` | Integration owner, single session (2026-11-17) | `docs/README.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `PLAN.md` (status), `README.md` (layout), `dist/helix-standalone.html` (rebuilt) | Repository records restructured for the next phase: documentation index with one owner per fact, decision log with branch policy (D-004), acceptance rules (D-005), standalone build rebuilt and checked over `file://`. Test suite still 37/37. `docs/handoffs/T14-T15-acceptance.md`. |

### Open follow-up tasks (not started)

| Task | Milestone | Scope | Depends on |
| :--- | :--- | :--- | :--- |
| **T16** | M4 | Live-browser motion review of playback, camera transitions, and label fade; measure frame time on a reference desktop and a physical phone | T14 |
| **T17** | M4 | Express label legibility on phone: stronger label background over the strand | T14 (confirm V-02 evidence first) |
| **T18** | M5 | Structure-derived RNAP and ribosome assets from a documented source (candidate PDB 8FIZ, not yet selected), with provenance in `docs/ASSETS.md` and a licence check | Asset decision recorded in `DECISIONS.md` |
| **T19** | M5 | Keyboard, reduced-motion, and contrast audit of the sheet and the Express controls | T14 |
