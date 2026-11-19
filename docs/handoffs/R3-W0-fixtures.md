# Handoff: R3-W0 Step 8 — Fixture World State and Fixture Mini Story

- **Branch:** `r3/w0-fixtures`
- **Base commit:** `2bcb1fc`
- **Worktree:** `/home/antigravity/worktrees/r3-w0-fixtures`

## Changed files

- `tests/fixtures/world-state.json` (new): Chapter 6 midpoint (`elongate-tx`, `t = 42.75`, `chapterProgress = 0.5`) fixture conforming to `PLAN.md` §8.2 `WorldState`, §5.1 Construct v3, §6.1–§6.3, and `docs/CONTRACTS.md` §1 & §6.
  - RNAP (`rnap-ec`) placed at `o = [6.76, 0, 0]` (`(126 - 124) * 3.38 Å` along world `+x`) with right-handed orthonormal rotation `R = [0, 0, 1, 0, 1, 0, -1, 0, 0]` (`det = +1`, local `+z` aligned to world `+x`).
  - `dna.register = 126`, `rna.length = 81`, `counters = { mrna: 81, hybrid: 9, codon: 0, peptide: 0 }`, `dna.bubble = [-10, 2]`.
  - Verified in Node against `PLAN.md` §5.1 Construct v3 transcript (179 nt): 0-based index `81` (82nd transcript nucleotide, DNA coding index `126`, first base of codon 20 `GAA`) is `'G'`, so `ntp.base` is `"G"`.
- `tests/fixtures/story-mini.json` (new): 3-chapter (`establish`, `search`, `open`; `duration = 20.0`), 12-event `sequential` fixture conforming to `PLAN.md` §8.2 `Story`, §6.1, §6.2, and §6.3, with `meta = { seed: 19, constructVersion: 3, fixture: true }`.
  - Events span all 3 chapters, use only allowlisted §8.2 event types (`dna.relax`, `machine.move`, `machine.bind`, `dna.open`, `ntp.enter`), have unique `<type>:<n>` IDs, are sorted by `(t0, id)`, include simultaneous-start (`t0 = 0.0`) and overlapping intervals to exercise timeline evaluation, and use Construct v3 coordinates (TSS `+1` at register `45`, initiating NTP `'A'`).
- `tests/fixtures.test.mjs` (new): 4 Node tests validating all §8.2 fields, rotation matrix orthonormality (`< 1e-4` error, `det = +1`), Construct v3 biological invariants, exact §6.2 captions, chapter contiguity, event allowlist, stable `<type>:<n>` IDs, and `(t0, id)` ordering.
- `docs/handoffs/R3-W0-fixtures.md` (new): This handoff.

## Acceptance

1. **Both JSON fixtures exist and pass all checks in `tests/fixtures.test.mjs`:**
   - Checked via `npm test` (`node tools/check-syntax.mjs && node --test tests/*.test.mjs`).
   - Observed: all 4 tests in `tests/fixtures.test.mjs` passed (`checked 39 files, 0 failed`, 84/84 total tests passed).
2. **`npm test` passes:**
   - Final summary lines (verbatim):
     ```text
     ℹ tests 84
     ℹ suites 0
     ℹ pass 84
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 0
     ℹ todo 0
     ℹ duration_ms 6284.468042
     ```
3. **`npm run smoke` passes:**
   - Final summary lines (verbatim):
     ```text
     > smoke
     > node tests/smoke.browser.mjs

     SMOKE PASS
     ```
4. **Clean commit on branch `r3/w0-fixtures`:**
   - Verified with `git status` and `git log` after committing all 4 owned files.

## Not verified

- Loading `tests/fixtures/world-state.json` and `tests/fixtures/story-mini.json` through `js/ui/view-story.js` (R3-U1), `js/sim/gene/story.js` (R3-S2), or the `?scene=v2` placeholder route (R3-W0 step 11), as those modules are implemented in separate tasks and not present at base commit `2bcb1fc`.

## Design gaps

- None. Note on caption #1 in `PLAN.md` §6.2: the plan markdown writes `*E. coli*` with italic asterisks; `story-mini.json` stores plain text `"E. coli"` because Helix captions are assigned via `textContent` (`js/ui/view-express.js:320`).

## Requests

- None.

## Open questions

- Please confirm whether `js/sim/gene/timeline.js` (R3-S2) and `js/ui/view-story.js` (R3-U1) should continue treating chapter captions as plain text (`"E. coli"`, no markdown asterisks) so fixture and runtime captions match identically.
