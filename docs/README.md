# Project records: index

This folder holds the project's working records. Each fact has one owner file. Other documents link here instead of copying the content.

| Path | Purpose | Update when |
| :--- | :--- | :--- |
| `../PLAN.md` | Scope, milestones, and the original collaboration plan | Scope or milestone definitions change |
| `../AGENTS.md` | Repository working rules (English-only, ownership, model allocation) | Repository-wide rules change |
| `TASKS.md` | Task board: ID, status, owner, owned files, acceptance evidence | After assignment or handoff |
| `CONTRACTS.md` | Frozen shared contracts: coordinates, indexing, anchors, sim/UI APIs | Before any incompatible interface change |
| `SCIENCE.md` | Biological scenario, sources, assumptions, simplifications | A mechanism or scientific claim changes |
| `ASSETS.md` | Structure provenance, preprocessing, reuse terms | An asset is added or replaced |
| `VALIDATION.md` | Test, browser, device, and packaging evidence; open limitations | At each milestone or acceptance review |
| `DECISIONS.md` | Dated architecture, scope, and workflow decisions | A significant choice is made or superseded |
| `handoffs/<task-id>.md` | One short record per completed or blocked work package | A work package ends |
| `evidence/<date>/` | Visual evidence (downscaled screenshots) referenced from `VALIDATION.md` | An acceptance pass is recorded |

## Conventions

- Files in this repository are written in English (see `AGENTS.md`).
- Task IDs: `T01`–`T13` are the original M0–M5 backlog; `T14` and later are follow-up work packages.
- Task statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`. A task is `DONE` only after its acceptance evidence is checked.
- Handoff file names use the task IDs they cover, for example `handoffs/T14-T15-acceptance.md`.
- Model names in the task board are historical records. Do not write model identifiers into code, commits, or pull requests.
