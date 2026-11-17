# Round 2, Wave 1: team plan

Updated: 2026-11-17
Integration Owner: this session (top tier, high effort)
Base branch: `claude/admiring-cray-fdre6q`

## Goal of the wave

Deliver three models and the shared machinery that every later model reuses:

- **N1** RNA polymerase as a structure-derived, true-scale asset (elongation complex; holoenzyme with σ⁷⁰ as a stretch step).
- **N5** amino-acid residue library and atomic nascent peptide.
- **N7** NTP substrates and pyrophosphate.
- Shared: asset pipeline, machine actor renderer with three levels of detail, the 150-bp true-scale construct, and a browser smoke gate.

Not in this wave: changing `js/sim/expression.js`, `js/main.js`, or the Express mode. The scene keeps running on the 48-bp construct until Wave 2.

## Already done by the Integration Owner (Wave 0)

- `docs/CONTRACTS.md` section 6: asset format v1, RNAP conventions, visual tokens, construct, template APIs.
- `js/assets/format.js`: encoder, decoder, validator.
- `tools/make-fixture-asset.mjs` and `assets/fixture-machine.asset.json`: synthetic machine for development.
- `tests/asset-format.test.mjs`.

## Tasks

| Task | Model and effort | Deliverable | Brief |
| --- | --- | --- | --- |
| A | Opus, medium | Asset pipeline and the RNAP asset (N1) | `docs/tasks/R2-W1-A-asset-pipeline-rnap.md` |
| B | Sonnet, high | Machine actor renderer and actor card page | `docs/tasks/R2-W1-B-actor-renderer.md` |
| C | Sonnet, medium | Residue library, peptide builder (N5), NTP and PPi templates (N7) | `docs/tasks/R2-W1-C-residues-ntp.md` |
| D | Haiku, high | Module hygiene, browser smoke gate, record reconciliation, true-scale construct | `docs/tasks/R2-W1-D-hygiene-construct.md` |

All four start at the same time. None depends on another task's output: B develops against the fixture asset; A, C, and D are self-contained.

## File ownership (no overlaps)

| Path | Owner |
| --- | --- |
| `tools/build-assets.mjs`, `tools/lib/**`, `tools/sources.lock.json`, `assets/rnap-*.asset.json`, `assets/manifest.json`, `tests/assets.test.mjs`, `docs/ASSETS.md`, `.gitignore` | A |
| `js/render/**`, `dev/actor-card.html`, `docs/evidence/r2-w1/**` | B |
| `js/science/residues.js`, `js/science/peptide.js`, `js/science/ntp.js`, `js/science/index.js`, `tests/residues.test.mjs`, `tests/ntp.test.mjs` | C |
| `package.json`, `tools/check-syntax.mjs`, `tests/smoke.browser.mjs`, `js/science/scenario.js`, `tests/scenario.test.mjs`, `docs/SCIENCE.md`, `docs/CONTRACTS.md` section 3 only | D |
| `js/main.js`, `js/sim/**`, `js/ui/**`, `js/assets/format.js`, `docs/CONTRACTS.md` (all other sections), `docs/TASKS.md`, `docs/VALIDATION.md`, `PLAN.md`, `AGENTS.md`, `dist/**` | Integration Owner only |

Each agent also writes its own `docs/handoffs/R2-W1-<letter>.md`. Nobody edits a file outside their row. If a task seems to need such an edit, stop and describe it in the handoff instead.

## Rules for every agent

1. Work in your own worktree on a local branch named `r2w1-<letter>` created from `claude/admiring-cray-fdre6q`. Do not push, and do not switch branches in a shared checkout. Commit in small steps.
2. English only in every file.
3. Do not add runtime dependencies or external requests. Three.js is vendored under `js/vendor/`.
4. Do not invent data. If an input is missing or a step cannot be done as written, stop that step, mark it `BLOCKED` in the handoff with the exact error, and finish the rest.
5. Before handing off, run `node --test tests/*.mjs` and report the pass and fail counts exactly as printed. Do not skip, delete, or weaken an existing test.
6. The handoff file lists: files changed, how each acceptance item was checked with the observed result, anything not verified, and open questions.
7. Stay inside the brief. Do not refactor neighbouring code or restyle existing visuals.

## Integration (Integration Owner, after handoffs)

Merge order: D, then C, then A, then B. After each merge run all tests and the smoke gate. Then:

1. Re-export `scenario.js` from `js/science/index.js`.
2. Point the actor card at `assets/rnap-ec.asset.json` and review screenshots against the visual tokens.
3. Extend `tools/build-standalone.mjs` to inline assets when the first asset is used by `js/main.js` (Wave 2).
4. Update `docs/TASKS.md` and `docs/VALIDATION.md` with evidence.

## Wave exit gate

- `npm test` and `npm run smoke` pass on the merged branch.
- `assets/rnap-ec.asset.json` validates, comes from one *E. coli* entry, is at true scale, and has `template`, `nontemplate`, and `rna` tracks with documented synthetic segments.
- The actor card shows the RNAP at L0, L1, and L2 with the cutaway, and screenshots are recorded.
- A peptide built for `fMet-A-E-F-K-G-S-D-Y-Q-A` passes geometry tests; NTP templates pass geometry tests.
- The 150-bp construct passes its tests and the 48-bp construct is unchanged.

## Known external prerequisite

Task A needs the mmCIF files for the chosen PDB entries. `files.rcsb.org` is blocked in the current cloud environment. Either allow that host, or place the files in `tools/sources/` (ignored by Git) before task A reaches step 4. Steps 1–3 of task A do not need the network.

## Outlook

- Wave 2: N2, N3, N4 through the same pipeline (PDB 7K00 candidate), simulation split and slot-track kinematics, RNAP placed in the Express scene on the 150-bp construct.
- Wave 3: N6, and N8–N10 if approved; scene integration and release.
