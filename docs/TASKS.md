# Project Task Board

Updated: 2026-11-16
Branch: `feat/rna-gene-expression`
Integration Owner: Agent 0 (**Gemini 4 Argon** — High effort)

| Task ID | Milestone | Status | Owner Agent (Model & Effort) | Owned Files | Deliverable & Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T01** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | Git branch `feat/rna-gene-expression` | Reconciled `origin/claude/dna-structure-visualization-85q6rc` (`246fa52`) with `main` planning documents (`PLAN.md`, `AGENTS.md`). |
| **T02** | M0 | `DONE` | Agent 4 (`Gemini 3.5 Flash-Lite`, Low) | `tests/science.test.mjs`, `tests/sim.test.mjs` | Rerunnable baseline verified: 29/29 tests passing (`6.88 s`). |
| **T03** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | `docs/SCIENCE.md`, `docs/ASSETS.md` | Bacterial 48-bp construct, Turner RNA thermo, and simplifications documented. |
| **T04** | M0 | `DONE` | Agent 0 (`Gemini 4 Argon`, High) | `docs/CONTRACTS.md`, `docs/TASKS.md` | Frozen contracts for RNA (`U`, `O2'`, `HELIX_A`), codon/peptide schemas, sim APIs, and UI handlers/setters. |
| **T05 & T08** | M1–M2 | `IN_PROGRESS` | Agent 1 (`Gemini 4 Hydrogen`, High) | `js/science/bases.js`, `js/science/templates.js`, `js/science/assembly.js`, `js/science/thermo.js`, `js/science/genetic-code.js`, `js/science/index.js`, `tests/science.test.mjs` | Atomic Uracil (`U`), Ribose `O2'` (`1.413 Å`), regularised A-RNA template (`HELIX_A`), `A·U` & `G·U` wobble pairing, Turner RNA thermodynamics, and bacterial genetic code engine + unit tests. |
| **T06, T09, T11** | M1–M3 | `IN_PROGRESS` | Agent 2 (`Gemini 4 Hydrogen`, High) | `js/sim/expression.js`, `tests/sim.test.mjs` | Pure-time deterministic bacterial gene-expression simulation (`createExpressionSim`): RNAP transcription bubble, rNTP addition, 9-bp RNA·DNA hybrid, mRNA exit trajectory, 30S/50S ribosome docking at Shine–Dalgarno, initiator `fMet-tRNA` at P-site, A→P→E codon translocation, nascent 11-aa peptide growth, and `RF1` stop-codon release + unit tests. |
| **T10 & T12a** | M2–M4 | `IN_PROGRESS` | Agent 3 (`Gemini 4 Hydrogen`, Medium–High) | `js/render/colors.js`, `js/render/molecule.js`, `js/render/cartoon.js`, `js/render/overlay.js`, `js/render/viewer.js` | Support Uracil (`U`) palette, RNA/peptide strand colors, nascent peptide chain 3D sphere-and-tube rendering in `MoleculeLayer`/`CartoonLayer`, macromolecular cutaway support, and guided camera focus (`overview`, `rnap`, `ribosome`). |
| **T07 & T12b** | M1–M4 | `TODO` | Agent 4 (`Gemini 4 Hydrogen`, Medium) + Agent 0 (`Gemini 4 Argon`, High) | `js/ui/ui.js`, `js/ui/view-structure.js`, `js/ui/view-pair.js`, `js/ui/view-melt.js`, `js/ui/view-express.js`, `js/main.js`, `css/style.css` | DNA/RNA mode toggle in Explore/Pairs/Melt, new `Express` tab (`view-express.js`) with multi-track DNA/mRNA/Codon/Peptide strip, camera & cutaway controls, and full application wiring in `js/main.js`. |
| **T13** | M5 | `TODO` | Agent 4 (`Gemini 3.8 Flash`, Low) + Agent 0 (`Gemini 4 Argon`, High) | `docs/VALIDATION.md`, `README.md` | Full test suite execution, live browser verification across all 6 modes, performance & zero-external-network audit. |
