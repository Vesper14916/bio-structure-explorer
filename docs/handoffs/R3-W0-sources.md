# Handoff R3-W0-sources: PDB source fetcher, sources lockfile, and superposition/matching helpers

Date: 2026-11-19. Branch: `r3/w0-sources` (base `2bcb1fc`).

## Changed files

| File | Change |
| :--- | :--- |
| `tools/lib/superpose.mjs` | New. Exports `superpose(mobilePts, targetPts)` using `kabsch` from `js/science/math.js` (returns `{ R, t, o: t, rmsd, n }`) and `superposeIterative(mobilePts, targetPts, { cutoff = 2.0, passes = 2 })` implementing the two-pass outlier-trimming rule from `PLAN.md` §7.3 (returns `{ R, t, o: t, rmsd, rmsdBefore, n, nBefore, trimmed, keptIndices }`). |
| `tools/lib/match.mjs` | New. Exports `matchResidueAtoms(mobileChain, targetChain, atomName = 'CA')` (matches residues by `seq`/`label_seq_id` where both have `atoms[atomName]`, accepting either `polymerChains` chain objects or residue arrays) and `matchChains(mobileChains, targetChains, chainPairs, atomName = 'P')` (concatenates matched pairs deterministically across `[mobileChainId, targetChainId]` tuples). |
| `tools/fetch-sources.mjs` | New. CLI `node tools/fetch-sources.mjs [--only <pdbId1,pdbId2,...>] [--check] [--quiet]`. Downloads missing sources from RCSB using Node `fetch` (up to 3 retries) with `curl -fsSL --retry 3` fallback, verifies `gzSha256`/`gzBytes` when present, decompresses `.cif.gz` via `zlib.gunzipSync`, verifies `sha256`/`bytes` against `tools/sources.lock.json`, and writes atomically via temp file and rename. |
| `tools/sources.lock.json` | Updated. Preserves the 4 existing entries (`6ALF`, `6ALH`, `6C9Y`, `6CA0`) verbatim and adds all 9 new Round 3 entries from `PLAN.md` §7.2 (`7K00`, `7ST2`, `8FZH`, `5WE4`, `7PJV`, `9ZN2`, `9FDA`, `6ZTJ`, `7YPA`) with `.cif.gz` URLs, decompressed `sha256`/`bytes`, compressed `gzSha256`/`gzBytes`, `target`, and `role`. Note: `7YPA` uses `"target": "rnap-hairpin"` rather than `"rnap-ec"` so `tools/build-assets.mjs` candidate selection for `rnap-ec` remains unchanged. |
| `tests/tools-superpose.test.mjs` | New. 7 unit tests covering `superpose` (exact rigid recovery, noisy recovery, input validation), `superposeIterative` (outlier trimming > 2.0 Å, `passes = 1`, over-trimmed error), `matchResidueAtoms` (chain objects and residue arrays, skipping missing atoms/residues, deterministic `seq` order), and `matchChains` (multi-chain concatenation, missing-chain error, end-to-end with `superposeIterative`). |
| `docs/handoffs/R3-W0-sources.md` | New. This handoff record. |

## Acceptance

| Item | How checked | Observed result |
| :--- | :--- | :--- |
| Fetch and verify all 13 PDB sources | Downloaded all 13 entries into `tools/sources/`, removed `7YPA.cif` and re-fetched with `node tools/fetch-sources.mjs --only 7YPA`, then ran `node tools/fetch-sources.mjs --check` | `7YPA` downloaded `.cif.gz`, verified compressed and decompressed hashes, and wrote atomically. `--check` reported: `sources: 13 ok, 0 failed (13 total)` (exit 0). |
| CLI `--quiet` and invalid `--only` handling | Ran `node tools/fetch-sources.mjs --only 7YPA --quiet` and `node tools/fetch-sources.mjs --only XXXX --check` | `--quiet` produced empty stdout with exit 0; unknown PDB ID exited non-zero. |
| Existing RNAP asset build unchanged | `node tools/build-assets.mjs --check --quiet` | Printed `identical` for `assets/rnap-ec.asset.json`, `assets/rnap-holo.asset.json`, and `assets/manifest.json` (exit 0). |
| `npm test` | Run inside `/home/antigravity/worktrees/r3-w0-sources` | Passed (87/87 tests, including 7 new tests in `tests/tools-superpose.test.mjs`). Verbatim summary below. |
| `npm run smoke` | Run inside `/home/antigravity/worktrees/r3-w0-sources` | Passed (`SMOKE PASS`). Verbatim summary below. |
| Clean git status on `r3/w0-sources` | `git status` after committing | Only owned files added/modified; `tools/sources/` remains gitignored. |

Verbatim `npm test` final summary lines:

```text
checked 39 files, 0 failed
ℹ tests 87
ℹ suites 0
ℹ pass 87
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10675.629961
```

Verbatim `npm run smoke` final summary lines:

```text
> smoke
> node tests/smoke.browser.mjs

SMOKE PASS
```

## Not verified

- `curl` fallback path in `tools/fetch-sources.mjs`: Node 24 built-in `fetch` succeeded directly through the environment proxy for all downloads, so the `curl` fallback branch was syntax-checked but not forced to execute under a simulated `fetch` failure.
- Chain IDs inside the 9 newly downloaded mmCIF files were not inspected beyond verifying valid `data_<ID>` headers and SHA-256/byte integrity; chain confirmation belongs to asset tasks A1–A4 per `PLAN.md` §7.2.

## Design gaps

None. This task has no visual or UI surface.

## Requests

1. Add `"fetch-sources": "node tools/fetch-sources.mjs"` to `package.json` `scripts` (deferred to the Chief because `package.json` is outside this task's Owns list).

## Open questions

None.
