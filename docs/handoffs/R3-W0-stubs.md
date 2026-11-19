# Handoff: R3-W0 Step 7 — Round 3 Module Stubs

- **Branch:** `r3/w0-stubs` (based on `2bcb1fc`)
- **Worktree:** `/home/antigravity/worktrees/r3-w0-stubs`
- **Scope:** PLAN.md §8.1–§8.4, §10 R3-W0 step 7

## Changed files

All 25 files below are newly created; no existing files were modified.

### Story stubs (`js/sim/gene/`)
- `js/sim/gene/story.js` — exports `buildStory`, `stateAt`, `chapterAt`
- `js/sim/gene/timeline.js` — exports `buildTimeline`
- `js/sim/gene/transcription.js` — exports `contributeTx`
- `js/sim/gene/translation.js` — exports `contributeTl`
- `js/sim/gene/coupled.js` — exports `buildCoupledTimeline`, `contributeCoupled`
- `js/sim/gene/shots.js` — exports `getShot`, `resolveChapterShot`

### Kinematics stubs (`js/kin/`)
- `js/kin/frames.js` — exports `matToQuat`, `quatToMat`, `slerpFrame`, `composeFrame`, `invertFrame`, `screwStep`, `rotationMinimizingFrames`, `arcLengthTable`, `sampleCubicBezier`, `sampleCatmullRom`
- `js/kin/duplex.js` — exports `poseDuplex`
- `js/kin/track.js` — exports `sampleTrack`, `blendTrackFrame`
- `js/kin/chain.js` — exports `buildFreeChain`, `poseFreeChain`
- `js/kin/hairpin.js` — exports `poseHairpin`
- `js/kin/peptide-path.js` — exports `posePeptideOnPath`
- `js/kin/trna.js` — exports `poseTrnaAnticodon`, `poseAminoacylEnd`
- `js/kin/ntp.js` — exports `poseNtp`, `posePpi`
- `js/kin/pose.js` — exports `createPoser`

### Scene stubs (`js/scene/`)
- `js/scene/story-scene.js` — exports `createStoryScene`
- `js/scene/camera-rails.js` — exports `resolveShot`, `transitionDuration`, `createCameraRails`
- `js/scene/crowd.js` — exports `generateCrowd`
- `js/scene/labels.js` — exports `selectLabels`

### Render stubs (`js/render/`)
- `js/render/atom-groups.js` — exports class `AtomGroupLayer`
- `js/render/fx.js` — exports class `FxLayer`

### UI stubs (`js/ui/`)
- `js/ui/view-story.js` — exports `createStoryView`
- `js/ui/inspect.js` — exports `buildInspectInfo`

### Tests and handoff
- `tests/stubs.test.mjs` — Node test dynamically importing all 23 stub modules and asserting every contracted function/class exists and throws `Error('not implemented: <name>')`
- `docs/handoffs/R3-W0-stubs.md` — this handoff record

## Acceptance

1. **Every stub file passes `node tools/check-syntax.mjs`**
   - How checked: ran `node tools/check-syntax.mjs` inside `/home/antigravity/worktrees/r3-w0-stubs`.
   - Observed result: `checked 62 files, 0 failed` (39 pre-existing `js/` modules + 23 new stubs).

2. **`tests/stubs.test.mjs` imports all 23 stub files cleanly in Node and verifies every exported function/class throws `Error('not implemented: <name>')`**
   - How checked: ran `npm test` (executes `node tools/check-syntax.mjs && node --test tests/*.test.mjs`). No stub imports `'three'` or DOM globals at module top level.
   - Observed result: all 24 new stub tests (manifest count + 23 per-module import/throw checks covering all 42 exported functions and classes) and all 80 pre-existing tests passed.

3. **`npm test` and `npm run smoke` pass**
   - How checked: ran `npm test && npm run smoke` inside `/home/antigravity/worktrees/r3-w0-stubs`.
   - Verbatim final summary lines:

```text
ℹ tests 104
ℹ suites 0
ℹ pass 104
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8286.270161

> smoke
> node tests/smoke.browser.mjs

SMOKE PASS
```

4. **Clean commit on branch `r3/w0-stubs`, handoff written**
   - Committed all 25 new files on `r3/w0-stubs` without touching any files outside the Owns list or switching branches.

## Not verified

- Browser import of the stub modules directly in an HTML page (none are wired into `js/main.js` yet; browser wiring is handled by later W0/Wave tasks).
- Standalone bundle build (`npm run build:standalone`), which is unaffected until stubs are imported by entry points.

## Design gaps

- None. All module paths, export names, and JSDoc contracts follow PLAN.md §4, §6, §8, and §10 directly.

## Requests

- None.

## Open questions

1. **Lifecycle of `tests/stubs.test.mjs` across stages:** As Wave 1–4 tasks (starting with ST3: `K1`, `S2`) implement individual stub modules, those implemented functions will stop throwing `Error('not implemented: <name>')`. The Chief should clarify whether each implementing task removes its module from `tests/stubs.test.mjs` or whether the Chief trims `tests/stubs.test.mjs` at merge (since `tests/stubs.test.mjs` is not listed in individual downstream Owns lists).
2. **`partnerFrame` in `js/kin/frames.js`:** PLAN.md §10 R3-K1 mentions `partnerFrame` alongside the frame utilities in `js/kin/frames.js`, while the W0 step 7 stub specification lists 10 exports omitting `partnerFrame` (which already exists in the science layer). Kept strictly to the 10 specified exports here; R3-K1 can re-export or add `partnerFrame` if desired.
