# Handoff — R3-INT3 (Full Step by step build)

Stage: ST8 · Branch: `claude/project-thread-weimhy` (ST8 owner: Claude, assigned by the user in place of Gemini) · Base: `r3-w2` + ST7 (`origin/claude/project-thread-hhdgkv`, head `b2748a7`)

## What changed

| Area | Files | Change |
| --- | --- | --- |
| Assets | `js/main.js` | `STORY_V2_ASSETS` lists all twelve assets (`rnap-holo`, `rnap-ec`, `nusg`, `ribosome-70s`, `trna-init`, `trna-aa`, `if1`, `if2`, `if3`, `ef-tu`, `ef-g`, `rf1`), so chapters 8–16 render in the real app. |
| End of story | `js/scene/story-scene.js` | `maxTime` is `duration − 1 ms` (`END_EPSILON`), so the finale never shows the empty translation world that `stateAt(duration)` returns (S2 boundary rule). The scrubber still reaches 100 %. |
| Crowd | `js/scene/story-scene.js`, `js/scene/crowd.js` | The scene generates the crowd once per tier and calls `viewer.setCrowd`; the Crowding toggle and the auto quality tier switch it (`low` none, `medium` 50 %, `high` 100 %). |
| Cutaway | `js/scene/story-scene.js` | `actorMatchesCutaway` reads `cut.machineId` (it read `cut.kind`, which is always `'anchor'`, so the ribosome was never clipped). `ribo-decode`, `ribo-ptc`, `ribo-tunnel` now open the ribosome. |
| Chapter 8 clearance | `js/kin/pose.js`, `tests/story-tl.test.mjs` | The L1 bead clearance guard runs whenever the ribosome is in the scene, not only when `bound`. The §5.3 item 8 test no longer skips unbound samples and asserts that every chapter 8–16 was sampled. |
| Chapter 1 | `js/sim/gene/transcription.js` | The holoenzyme is present at full opacity 400 Å from its bound pose (§6.1 row 1); chapter 2 moves it in. |
| Labels | `js/scene/labels.js`, `js/scene/story-scene.js` | No `σ⁷⁰` tag in chapter 1, no `mRNA 5′`/`3′` tags in chapters 11–15, `SD`/`AUG`/`UAA` on mRNA codons once the ribosome is present (PLAN §4.6 amendment, DEC-030). |
| Wording | `js/ui/inspect.js`, `js/ui/about.js`, `tests/ui-inspect.browser.mjs`, `PLAN.md` | RNAP DNA provenance (6CA0 for the promoter DNA, 6ALF for elongation), DNA rotation no longer "twin-domain", IF1/IF2/IF3 role sentences, anticodon nt 34–36, About sheet describes construct v3, PLAN §2 D13 and §6.4 state D = 38 and about 121 s. |
| Phone and focus | `css/style.css`, `js/ui/sheet.js`, `js/ui/view-story.js` | See `docs/handoffs/R3-U3.md` and DEC-031. |
| Tests | `tests/story-speed.test.mjs` (new, 4 tests) | Speed independence (0.5×, 1×, 4× and a direct seek agree at four story times), end of story, Crowding toggle, peptide emergence. |
| Evidence | `tools/evidence/sweep.mjs`, `docs/evidence/r3/sweep/`, `docs/evidence/r3/INT3/` | See `docs/handoffs/R3-V2.md`. INT3 has five desktop frames from the real app (chapters 8, 11, 12, 14, 15) and the cutaway on/off pair. |

The stage-wide audit is `docs/reviews/R3-ST8-audit.md` (raw reports beside it). Rulings: DEC-030, DEC-031.

## Gate G3 criteria

| Criterion (PLAN §12) | Evidence | Result |
| --- | --- | --- |
| The full Step by step story passes §5.3 | `tests/story-tl.test.mjs` (items 2–8 over chapters 8–16, item-8 test now covers every sample) and the audit's own Node runs: items 3–6 for k = 1..40 over 1,956 poses | PASS |
| The peptide visibly emerges from `tunnelExit` before chapter 15 ends | `tests/story-speed.test.mjs` (last test): the peptide is inside the tunnel at the start of chapter 14, 45 Å beyond the exit plane at its end, and still outside at the end of chapter 15 (140 Å after release). Frames: `docs/evidence/r3/INT3/desktop-ch14.jpg`, `desktop-ch15.jpg` | PASS |
| 4× and 0.5× are identical in content at the same story time | `tests/story-speed.test.mjs` (first test): world state, atom positions, actor transforms and FX agree bit-for-bit after 0.5×, 1×, 4× and a direct seek at 20.5, 80, 118.4 and 160 s | PASS |
| Frame-time table for software GL | `docs/PERF.md` §3.2 (all 16 chapters, `low` tier) | PASS (software GL only; hardware numbers belong to G4/G5) |

## Acceptance (browser suites, software GL)

| Suite | Result |
| --- | --- |
| `npm test` | `tests 312 · pass 312 · fail 0` |
| `npm run smoke` | `SMOKE PASS` |
| `tests/ui-story.browser.mjs` | `UI-STORY PASS (50 checks)` |
| `tests/ui-inspect.browser.mjs` | `UI-INSPECT PASS (141 checks)` |
| `tests/ui-phone.browser.mjs` | `UI-PHONE PASS (269 checks, 2 known defects)` |

## Not verified

- `node tools/build-assets.mjs --check` and `fetch-sources`: the sandbox cannot reach RCSB (403). ST7 and ST8 changed no asset or build recipe.
- Hardware-GPU frame time, real phone hardware (G4, G5).
- RCSB titles, resolutions and citations (audit I-06).
- Coupled mode beyond chapter 5 (stub until `R3-S5`).

## Design gaps and open items

- Sampled label coverage (every 0.2 s): `EF-Tu` shows in chapters 11 and 14, `EF-G` in 13 and 14, `RF1` and `UAA` in 15. `AUG` is still absent in chapter 9, where the six-tag cap is full of factors and tRNAs.
- Remaining focus-ring defects (`tests/ui-phone.browser.mjs`, `KNOWN-DEFECT`): three `button.chapter-row` stops on desktop and one `button.grip` stop on phone are clipped by their scroll containers.
- Deferred audit items F07–F13, S-04 to S-18 are in `docs/reviews/R3-ST8-audit.md`; the caption wording proposals (S-06 to S-09, S-13) need a product decision because §6.2 captions are locked copy.
- The dense L1 beads make the cutaway frames busy; shot and translucency tuning is a V1 candidate.

## Requests

- Tags: the session git proxy refuses tag pushes (403). The Chief should tag `r3-st7` on `b2748a7` and `r3-w3` on the final ST8 head.
- ST9: `DEFAULT_D = 48` and coupled caption 10 are stale against D = 38 (S-05); clash-test the coupled terminator hairpin against uS3 (S-04); `remainingCodons = 0` at D = 38 is left as the ST9 input.

## Open questions

- Should the §6.2 caption wording fixes in the science report be applied (product decision)?
