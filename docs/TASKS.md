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
