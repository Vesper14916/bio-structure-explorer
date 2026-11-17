# Decisions

Dated record of significant choices. Append new entries at the end. To change a decision, add a new entry that supersedes the old one; do not rewrite history.

## D-001 — Keep the static, browser-only architecture (2026-11-13, PLAN.md)

Use a static site with vendored three.js and bundled molecular data. No required third-party API, account, or remote structure request during playback. A build step is allowed only to produce the offline single-file bundle.

## D-002 — Reuse the DNA foundation; keep RNA and expression as separate models (2026-11-13, PLAN.md)

B-DNA geometry and the replication model are reused. RNA support is implemented as its own chemistry (uracil, ribose `O2'`, `HELIX_A`), not by relabelling DNA templates. DNA polymerase remains the replication enzyme; RNA polymerase is used only in the Express mode.

## D-003 — Express mode is a compact teaching construct, sequential in one scene (2026-11-13, PLAN.md; implemented 2026-11-16)

The scene uses a synthetic 48-bp bacterial construct with transcription, then translation, in one scene. Macromolecular complexes are envelopes with active-site cutaways, not structure-derived models. Limitations are listed in `docs/SCIENCE.md` and `docs/VALIDATION.md` §3.4.

## D-004 — Branch policy after the merge (2026-11-17)

- `main` holds the integrated, reviewed state. `feat/rna-gene-expression` was merged into `main` by PR #3 (`72d888b`) and is now historical.
- Follow-up work is committed to `claude/ecstatic-sagan-7fl6hp` unless a task owner is told otherwise, and is merged to `main` only after the acceptance evidence in `docs/VALIDATION.md` is recorded.
- Naming for new feature branches: `feat/<topic>` for scope work, `fix/<topic>` for defects, `docs/<topic>` for documentation-only changes. Each branch starts from current `main`.
- Do not commit work to a branch that another active agent is using. Use a separate worktree for parallel work.

## D-005 — Acceptance rules for UI changes (2026-11-17)

- Passing automated tests does not establish visual acceptance. Each UI change needs a browser check at desktop and phone size, recorded in `VALIDATION.md`.
- Import-level checks are required in addition to tests: run `node --check` on every changed module. The V-01 defect (`docs/VALIDATION.md` §3.1) was a parse error that the unit tests did not reach.
- Screenshot automation must not click an already-active mode tab, because that toggles the mobile sheet state.

## D-006 — Single-file build is a supported deliverable (2026-11-17)

`dist/helix-standalone.html` is regenerated with `node tools/build-standalone.mjs` after every change to `css/`, `js/`, or `tools/1bna.cif`. It must be rebuilt in the same commit as the source change that it reflects.
