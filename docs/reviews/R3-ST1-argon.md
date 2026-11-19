# Stage ST1 Argon Review — Frozen `docs/CONTRACTS.md` §7 & Asset Format v2

- **Date:** 2026-11-19
- **Window:** `2026-11-19T06:33:15Z` – `2026-11-19T06:37:47Z` (4 min 32 s, within the 30-min ST1 Argon budget)
- **Reviewer:** Read-only review subagent (Antigravity `research`, inherited session model; recorded in `docs/TASKS.md` per `PLAN.md` §9.1)
- **Verdict:** **PASS WITH MINOR FIXES**
- **Scope reviewed:** `PLAN.md` (§4.3, §7–§8, §10 W0), `docs/CONTRACTS.md` (§6.2–§7), `docs/DECISIONS.md`, `js/assets/format.js`, `js/assets/registry.js`, `tests/asset-format.test.mjs`, `assets/fixture-machine.asset.json`, `tools/build-assets.mjs`, `tools/assets/rnap.mjs`, `tools/sources.lock.json`, `js/render/actors.js`, `tests/fixtures/world-state.json`, `tests/fixtures/story-mini.json`.

The frozen contracts, palette tokens, source lock, fixtures, and decisions `DEC-001`–`DEC-006` are well aligned overall. Address the **1 High** and **4 Medium** items below (plus **3 Low** hardening items) before tagging `r3-w0` so ST2 (Claude A1/A2) and ST3 (Claude K1/S2) do not hit validator blind spots or contract ambiguities.

---

## Findings

### High

1. **v2 `lod2.sites` validation can be bypassed with legacy `lod2.anchor`, and `lod2.anchor`/`lod2.radius` are never validated**
   - **Location:** `js/assets/format.js:103-115`
   - **Details:** When `a.lod2.sites` is omitted, line 113 checks `else if (a.version >= 2 && a.lod2.anchor === undefined)`. Consequently:
     1. A `version: 2` asset that supplies v1 `lod2.anchor` instead of `lod2.sites` passes validation (contradicting `PLAN.md` §7.1 and `CONTRACTS.md` §7.1).
     2. Neither `lod2.anchor` (presence in `a.anchors`) nor `lod2.radius` (finite and `> 0`) is validated for v1 assets or via that v2 bypass; `{ version: 2, ..., lod2: { ..., anchor: 'nonexistent', radius: -5 } }` returns `[]`.
   - **Impact (ST2):** If A1 (`ribosome-70s`) or A2 (`trna-init`/`trna-aa`) copies the v1 `lod2` block from `tools/assets/rnap.mjs`, `validateAsset` will silently accept it even with an invalid anchor or radius.
   - **Proposed patch (`js/assets/format.js:113-115`):** Require `lod2.sites` unconditionally for `a.version >= 2`, and validate `lod2.anchor` (string present in `a.anchors`) and `lod2.radius` (finite `> 0`) on v1 assets. Add negative tests in `tests/asset-format.test.mjs`.

### Medium

2. **`tracks.*.synthetic` element values are unvalidated, leaving an ambiguity with `PLAN.md` §7.4 (`mrna` track in A1)**
   - **Location:** `js/assets/format.js:118-124`, `docs/CONTRACTS.md:149,204-210`, `PLAN.md:536`
   - **Details:** `CONTRACTS.md` §6.2 defines `tracks.*.synthetic` as `[0 | 1]`, while `PLAN.md` §7.4 states for the `ribosome-70s` `mrna` track: *"The `synthetic` flags record which source each register used"* (7K00 vs 7ST2 vs synthetic). `validateAsset` only checks `(t.synthetic || []).length !== n` and does not validate that entries are `0 | 1` (nor that `t.registers[0]` is an integer).
   - **Impact (ST2/ST3):** If A1 writes `'7K00'`/`'7ST2'`/`'synthetic'` or `0 | 1 | 2` into `tracks.mrna.synthetic`, `validateAsset` accepts it, but JS truthiness checks (`if (t.synthetic[i])`) in K1 or tooling will misclassify `'7K00'` as synthetic.
   - **Proposed patch:** Clarify in `docs/CONTRACTS.md` §7.1 that `tracks.*.synthetic` MUST be `Array<0 | 1>` (`0` = fitted from any PDB, `1` = interpolated/synthetic) and allow optional `tracks.*.sources?: string[]` for multi-PDB per-register provenance. Enforce `Number.isInteger(t.registers[0])` and `t.synthetic.every(v => v === 0 || v === 1)` in `js/assets/format.js`.

3. **Promoter-escape track blend missing from `WorldState`, plus dropped `WorldState` & Kinematics semantics in `CONTRACTS.md` §7.3–§7.4**
   - **Location:** `docs/CONTRACTS.md:263-273,283-299` vs `PLAN.md:592-605,617,622-634`
   - **Details:**
     1. `PLAN.md` §8.3 and `CONTRACTS.md` §7.4 require promoter escape (chapter 5) to slerp track frames from `rnap-holo` to `rnap-ec` over 1.5 s, switching `machines[rnap].assetId` at blend `0.5`. However, `WorldState.dna` carries no blend field, and `Poser.pose(world, target)` receives only `WorldState` (not `story`).
     2. `CONTRACTS.md` §7.3 omits `PLAN.md` §8.2's inline field semantics (`dna.register` gene index of template register 0, fractional while stepping; `dna.bubble` registers; `rna.length` integer; `rna.addProgress` `[0, 1]`; `ribosome.codon` P-site codon index, fractional during translocation; `[0, 1]` ranges on blend/progress fields).
     3. `CONTRACTS.md` §7.4 omits three kinematics requirements from `PLAN.md` §8.3: `Poser.pose` mutates `asm` and calls `asm.updatePositions()`; upstream arm continues straight along `tE` beyond `P3`; peptide residue `k = 0` is the tRNA-attached (C-terminal) residue with per-residue local frames measured once on ideal `buildPeptide` (`x = Cα(i+1) − Cα(i−1)`, `y = perp(Cβ/Hα)`, alternating 180°).
   - **Impact (ST3):** Direct risk of S2/K1 contract mismatch during promoter escape, `dna.register`/`bubble` indexing, long upstream DNA arms, and peptide N↔C direction.
   - **Proposed patch:** Restore those exact details into `docs/CONTRACTS.md` §7.3–§7.4, and add optional `trackBlend?: number` (`0` = `rnap-holo` tracks, `1` = `rnap-ec` tracks; default `1` when `assetId === 'rnap-ec'` and `0` when `'rnap-holo'`) on `WorldState.dna` (recorded as `DEC-007`).

4. **Ribosome L1 chain tinting depends on undocumented `chains[].subunit` keys and can mis-tint via RNAP regexes**
   - **Location:** `js/render/actors.js:87-99`, `docs/CONTRACTS.md:144,168-169`
   - **Details:** `ACTOR_TOKENS.chainTint` defines `rRNA16S`, `rprotein30S`, `rRNA23S`, `rRNA5S`, `rprotein50S`, matching `PLAN.md` §4.3. However, `chains[].subunit` is not documented in `CONTRACTS.md` §6.2 or §7.1. If A1 omits `chain.subunit` on `ribosome-70s`, `chainColor` drops the rRNA vs r-protein L1 contrast and any protein name matching `/alpha|beta|omega|sigma/i` would be mis-tinted as RNAP blue/violet.
   - **Impact (ST2):** `ribosome-70s` L1 beads could render with wrong tints in browser verification.
   - **Proposed patch:** Add a `(partId, chain.class)` fallback for `small`/`large` in `js/render/actors.js` before RNAP regexes, and document `chains[].subunit` in `docs/CONTRACTS.md` §7.1.

5. **`build-assets.mjs --only <id>` does not register new assets in `manifest.json`, and recipe contract details need clarification**
   - **Location:** `tools/build-assets.mjs:119-138,177-196`, `docs/CONTRACTS.md:211-218`
   - **Details:**
     1. Skipping `assets/manifest.json` under `if (!only)` prevents wiping existing entries, but means `loadAsset('ribosome-70s')` via `js/assets/registry.js` fails after `node tools/build-assets.mjs --only ribosome-70s` until a full build runs.
     2. `rnap.mjs` filters `sources.lock.json` by `s.target`, whereas shared PDBs (`7K00`, `5WE4`, `7PJV`, `6ZTJ`, `7YPA`) have a single `target` string in `sources.lock.json`. New recipes must use `ctx.loadSource(pdbId)` / `ctx.lockEntry(pdbId)`.
     3. `CONTRACTS.md` §7.1 does not document `build(ctx)` returning `{ asset, report, ...extras }` (stored in `ctx.built`) or `ctx.loadSource` caching.
   - **Impact (ST2/ST5):** Friction when running `--only` and testing via `registry.js`, or sharing PDBs/frames across recipes.
   - **Proposed patch:** In `tools/build-assets.mjs`, merge `targetRecipes` into existing `assets/manifest.json` on `--only` (non-check), preserving all other entries; document `build(ctx)` return shape and `ctx.loadSource(pdbId)` in `docs/CONTRACTS.md` §7.1.

### Low

6. **`decodeAsset` does not default `parts[].role` to `"body"` as stated in `CONTRACTS.md` §7.1** (`js/assets/format.js:167`).
7. **`registry.js` `loadAsset` ignores `opts.fetch`/`opts.assetsDir` when `globalThis.__HELIX_ASSETS__` is set** (`js/assets/registry.js:109-114`).
8. **Minor documentation & hardening:** document multi-source PDB convention (`source.additionalSources`/`notes`), `anchors[name].synthetic`, `paths[name].synthetic` scalar/array handling, and `PLAN.md` §7.2–§7.5 cross-reference in `docs/CONTRACTS.md` §7.1; add cycle detection (`visiting` set) in `tools/build-assets.mjs`; update header comment in `js/render/actors.js:1`.

---

## Confirmed Clean Checks

- **EventTypes (26/26):** `docs/CONTRACTS.md` §7.3 matches `PLAN.md` §8.2 verbatim.
- **Module layout, Story API, Scene API, `UiState` (15 keys), Viewer additions (6 methods), UI actions, camera far plane (`12000`):** All match `PLAN.md` §8.1–§8.4 cleanly.
- **Asset Format v2 core encoding/decoding:** `QUANT_STEP = 0.05` (±1638 Å), `paths` encoding/decoding, `parts[].role` enum validation, optional `lod2`, `lod2.sites` normalization, `anchors.center` + orthonormality, and v1 `rnap-ec`/`rnap-holo` backwards compatibility verified.
- **v2 fixture (`assets/fixture-machine.asset.json`):** Valid v2 asset with `parts[].role`, 2 `lod2.sites`, and `paths.channel`.
- **`tools/sources.lock.json`:** All 11 Round 3 PDBs from `PLAN.md` §7.2 (plus legacy `6ALH`/`6CA0`) with verified SHA-256 hashes and byte sizes.
- **Visual tokens (`PLAN.md` §4.3 vs `docs/CONTRACTS.md` §6.4 vs `js/render/actors.js`):** Every hex token and `crowdColor` linear-space lerp verified exact.
- **Fixtures (`tests/fixtures/world-state.json`, `tests/fixtures/story-mini.json`):** Schema-compliant and biologically consistent with Construct v3.
- **Decisions `DEC-001`–`DEC-006` (`docs/DECISIONS.md`):** Sound, well-scoped, and consistent with `PLAN.md` and `AGENTS.md`.

---

## Chief Disposition (2026-11-19)

All 8 findings (#1 High, #2–#5 Medium, #6–#8 Low) were **accepted and applied** before tagging `r3-w0`. `WorldState.dna.trackBlend` and `tracks.*.sources` were logged as `DEC-007` and `DEC-008` in `docs/DECISIONS.md`.
