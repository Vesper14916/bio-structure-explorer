# Round 3 Decisions Log

Owner: Chief / Integration Owner (Gemini 4 Neon, high)
Created: 2026-11-18 (Stage ST1 / R3-W0)

This log records accepted contract changes, pre-approved fallbacks from `PLAN.md` §13, design-gap resolutions, and operational decisions made during Round 3 (ST1–ST10). Locked baseline decisions D1–D14 live in `PLAN.md` §2.

---

## DEC-001 — Asset Format v2 compatibility and RNAP v1 preservation (2026-11-18, ST1)

- **Context:** `PLAN.md` §7.1 introduces Asset Format v2 (`paths`, `lod2.sites`, `parts[].role`) while W0 step 3 requires `node tools/build-assets.mjs --check` to print byte-identical output for `assets/rnap-ec.asset.json` and `assets/rnap-holo.asset.json`.
- **Decision:** `js/assets/format.js` exports `ASSET_VERSION = 2`, `ASSET_VERSION_V1 = 1`, and `SUPPORTED_VERSIONS = [1, 2]`. `validateAsset` and `decodeAsset` accept both v1 and v2. On decode, v1 `lod2.anchor`/`radius` is normalized into a 1-element `lod2.sites` array, and v2 `lod2.sites[0]` is mirrored into `lod2.anchor`/`radius` for backwards compatibility. `tools/assets/rnap.mjs` continues emitting `version: 1` until task A4 (ST5) upgrades the RNAP assets to v2.
- **Impact:** Zero breakage for existing v1 assets or tests; v2 assets (`fixture-machine`, and ST2/ST5 assets) use `version: 2`.

## DEC-002 — Asset Format v2 `paths[].synthetic` representation (2026-11-18, ST1)

- **Context:** `PLAN.md` §7.1 specifies `paths: { name: { points, count, synthetic: 0|1 } }`, while §7.4 notes that `coupledMrna` is synthetic where unmodelled.
- **Decision:** `validateAsset` accepts `synthetic` as either a scalar `0 | 1` (the default v2 schema) or an array of `0 | 1` of length `count` (per-point synthetic flags).
- **Impact:** Satisfies §7.1 strictly while permitting A4 to flag only unmodelled segments of `coupledMrna` without a later contract revision.

## DEC-003 — `actorColor` fallback for single-body assets in `js/render/actors.js` (2026-11-18, ST1)

- **Context:** `PLAN.md` §7.4 assigns part id `body` to `trna-init`, `trna-aa`, `rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`, and `nusg`, while §4.3 assigns each of those actors a distinct L0/L1 colour.
- **Decision:** `ACTOR_TOKENS` adds an `actorColor` map keyed by `asset.id` alongside `partColor` (which holds `core`, `sigma`, `accessory`, `small`, `large`). `partColor(partId, assetId)` checks `ACTOR_TOKENS.partColor[partId]` first, then `ACTOR_TOKENS.actorColor[assetId]`, then `unknown`.
- **Impact:** Every single-body asset automatically resolves its locked §4.3 colour without per-asset special-casing in callers.

## DEC-004 — Node-safe stubs for render and UI modules (2026-11-18, ST1)

- **Context:** W0 acceptance requires every module stub in `PLAN.md` §8.1 to import cleanly in Node, whereas Node lacks the browser importmap for `'three'`.
- **Decision:** Stubs in `js/render/atom-groups.js`, `js/render/fx.js`, `js/scene/*`, and `js/ui/*` have no top-level `'three'` or DOM imports until their implementing tasks (R1, R2, U1, etc.) replace them.
- **Impact:** All 23 stubs import cleanly under `node --test` and pass `tools/check-syntax.mjs`.

## DEC-005 — Lifecycle of `tests/stubs.test.mjs` across downstream stages (2026-11-19, ST1)

- **Context:** `tests/stubs.test.mjs` (added in W0 step 7) verifies that all 23 Round 3 stub modules import cleanly in Node and throw `Error('not implemented: <name>')` for every contracted export. Starting in ST3 (`K1`, `S2`), downstream tasks replace individual stubs with real implementations that no longer throw.
- **Decision:** When a downstream task implements a stub module, that task (or the Chief at merge) updates `tests/stubs.test.mjs` to remove the implemented module from the "unimplemented throw" list while preserving import/export checks in the task's own unit test suite (`tests/kin-duplex.test.mjs`, `tests/story.test.mjs`, etc.). `tests/stubs.test.mjs` is explicitly allowed as a shared-test trim during each stub-implementing task's merge.
- **Impact:** Downstream tasks in ST3–ST9 keep `npm test` green without weakening stub enforcement for remaining unimplemented modules.

## DEC-006 — Plain-text species names in chapter captions (2026-11-19, ST1)

- **Context:** `PLAN.md` §6.2 renders caption 1 in markdown as `*E. coli*`, whereas Helix assigns captions via `textContent` (`js/ui/view-express.js`) so markdown asterisks would appear literally in the UI.
- **Decision:** All chapter captions in `tests/fixtures/story-mini.json`, `js/sim/gene/timeline.js` (S2), and `js/ui/view-story.js` (U1) store and render plain text (`"E. coli"`, no markdown asterisks).
- **Impact:** Fixture captions and runtime captions match identically and avoid raw markdown artifacts in the DOM.

