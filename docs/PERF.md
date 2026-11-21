# Performance harness (R3-Q2)

This page describes the two performance scripts in `tools/perf/`, the budgets they check, the numbers measured in this repository, and a table that a human fills in for real hardware.

Scope: the scripts measure the Step by step and Coupled stories in Node, and the translation lab page in headless Chromium with software GL. They do not measure a hardware GPU, a phone, or a real browser window. Hardware results are recorded by hand (section 5).

## 1. Scripts

| Script | What it measures | Output | Exit code |
| --- | --- | --- | --- |
| `tools/perf/story-bench.mjs` | `stateAt(story, t, world)` and `poser.pose(world, target)` over 2,000 evenly spaced story times, for the Step by step story and the Coupled story. Median, p95 and max in ms. | Table on stdout; `docs/evidence/r3/Q2/story-bench.json` | 1 if a measured story has a median above budget; 0 otherwise |
| `tools/perf/browser-bench.mjs` | For each chapter of Step by step (1 to 16), seeks to the chapter midpoint in the real `StoryScene` (`docs/evidence/r3/S4/tl-lab.html`, all twelve assets) and records frame time, draw calls, triangles, points, lines, instanced draws, instances, geometries and textures. | Table on stdout; `docs/evidence/r3/Q2/browser-bench.json` | 1 on a page error; 2 if Playwright is missing; never 1 for a slow frame |

Run both with:

```sh
npm run perf
```

`npm run perf` runs `story-bench.mjs` first. The `&&` means that a budget failure there stops the browser run. Options for the browser run:

```sh
node tools/perf/browser-bench.mjs --quality=low --frames=20 --chapters=8,9
```

- `--quality` is `low` (default), `medium` or `high`. See section 3.2 for why `low` is the default.
- `--frames` is the requested number of measured frames per chapter (default 20).
- `--chapters` restricts the run to a comma-separated list of chapter numbers.

### Method notes

- **Story times.** `t_i = duration * i / 1999`, for `i = 0 .. 1999`, so both ends are included. Warm-up runs `stateAt` and `pose` once over every tenth time, untimed. The timed pass then times each call separately.
- **Reuse.** One `WorldState` (`createWorldState`) and one target `{asm, groups, actors, fx, focus}` are reused for every call, as in `js/scene/story-scene.js`.
- **Assets.** All twelve assets are loaded (`rnap-holo`, `rnap-ec`, `nusg`, `ribosome-70s`, `trna-init`, `trna-aa`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`, `rf1`), so chapters 8 to 16 are covered.
- **Quantiles.** Linear interpolation between order statistics.
- **Draw counts (browser).** `renderer.info` belongs to the three.js renderer, and the viewer API does not expose the renderer. The script therefore wraps the WebGL2 draw methods (`drawArrays`, `drawElements`, `drawRangeElements`, and the instanced variants) from an init script, and sums the counts over each animation frame. Multi-pass rendering is included. Geometries and textures come from `viewer.getState().memory`, which reports `renderer.info.memory`.
- **Frame time (browser).** The interval between consecutive viewer `frame` events. The first two frames after each seek are discarded. The run is time-bounded: each chapter may use an equal share of the remaining 300 s budget, and always gets at least three measured frames.

## 2. Budgets

| Check | Budget | Source | Where it is enforced |
| --- | --- | --- | --- |
| `stateAt` median | at most 2 ms, any `t` | PLAN.md §8.2 | `story-bench.mjs` exit code |
| `pose` median | at most 6 ms | PLAN.md §8.3 | `story-bench.mjs` exit code |
| Desktop frame time, median at `high` | at most 16.7 ms (hardware GPU) | PLAN.md §11, gate G4 | Human, section 5 |
| Phone frame time, median at `low` or `auto` | at most 33 ms (hardware GPU) | PLAN.md §11, gate G5 | Human, section 5 |

The browser run has no frame-time budget. Software GL is far slower than a hardware GPU, so its frame times are informational only and never fail the run. The script fails only on page errors.

The Coupled story is checked against the same budgets. Its mode is a pass-through stub until task R3-S5, so its numbers describe the stub timeline only.

## 3. Measured results

Environment for every number below: Node v22.23.5 on Intel Xeon 2.10 GHz (the sandbox container, 4 vCPUs). Chromium 157.0.8103.78 headless with SwiftShader software WebGL2. Viewport 1280x720, deviceScaleFactor 1. Run date 2026-11-20 (the `generatedAt` field in each JSON file).

### 3.1 Node: `stateAt` and `pose` (`docs/evidence/r3/Q2/story-bench.json`)

| Story | Function | Samples | Median ms | p95 ms | Max ms | Budget (median) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Step by step (16 chapters, 164.05 s, 1,109 events) | `stateAt` | 2,000 | 0.0341 | 0.0812 | 0.2532 | at most 2 ms | PASS |
| Step by step | `pose` | 2,000 | 2.0886 | 3.9108 | 10.4804 | at most 6 ms | PASS |
| Coupled (stub, 12 chapters, 121.30 s, 1,114 events) | `stateAt` | 2,000 | 0.0209 | 0.0466 | 1.0764 | at most 2 ms | PASS |
| Coupled (stub) | `pose` | 2,000 | 0.6289 | 1.3760 | 11.9777 | at most 6 ms | PASS |

Printed summary: `STORY-BENCH PASS`.

### 3.2 Browser: per chapter, Step by step, quality `low` (`docs/evidence/r3/Q2/browser-bench.json`)

Each row is the chapter midpoint. Frame time is the median and p95 over the measured frames. Draw calls, triangles and instances are per-frame medians. Geometries and textures are the counts at the end of the chapter.

| Ch | Title | Measured frames | Frame ms median | Frame ms p95 | Draw calls | Triangles | Instances | Geometries | Textures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A gene in the cytoplasm | 20 | 217.75 | 304.79 | 10 | 98,484 | 1,590 | 9 | 4 |
| 2 | Finding the promoter | 6 | 2,489.95 | 2,626.77 | 16 | 3,582,652 | 65,119 | 15 | 4 |
| 3 | Opening the DNA | 7 | 2,465.40 | 2,526.97 | 16 | 3,574,112 | 65,119 | 15 | 4 |
| 4 | First bonds | 3 | 4,815.60 | 5,328.96 | 18 | 3,583,744 | 65,144 | 17 | 4 |
| 5 | Promoter escape | 6 | 2,513.00 | 2,709.08 | 18 | 3,583,224 | 65,216 | 17 | 4 |
| 6 | Elongation | 3 | 3,327.90 | 3,816.51 | 17 | 3,564,404 | 64,708 | 16 | 4 |
| 7 | Termination | 3 | 3,930.30 | 4,213.08 | 17 | 3,569,600 | 64,633 | 16 | 4 |
| 8 | Ribosome meets mRNA | 5 | 2,516.50 | 2,604.52 | 16 | 3,973,708 | 71,412 | 17 | 4 |
| 9 | Start codon | 3 | 4,394.20 | 4,442.80 | 23 | 4,022,828 | 72,186 | 23 | 4 |
| 10 | 70S assembly | 4 | 3,149.00 | 3,453.47 | 23 | 4,027,856 | 71,776.5 | 22 | 4 |
| 11 | Decoding | 3 | 4,741.20 | 4,915.53 | 24 | 4,035,080 | 71,956 | 23 | 4 |
| 12 | Peptide bond | 3 | 4,203.20 | 4,235.42 | 22 | 4,016,988 | 71,604 | 21 | 4 |
| 13 | Translocation | 3 | 2,886.60 | 3,002.34 | 24 | 4,020,892 | 71,606 | 22 | 4 |
| 14 | Elongation | 3 | 5,422.50 | 5,473.98 | 24 | 4,046,740 | 72,121 | 22 | 4 |
| 15 | Stop codon | 3 | 3,173.30 | 3,294.98 | 24 | 4,089,652 | 72,870 | 22 | 4 |
| 16 | Finished | 3 | 727.10 | 765.17 | 15 | 739,956 | 11,608 | 18 | 4 |

Run totals: page load 3.7 s, total 349.6 s, 16 chapters measured, 0 page errors (`result: PASS`).

Reading the table:

- The frame times are software-GL numbers on a 4-vCPU container. They are not comparable with the hardware targets in section 2.
- The number of measured frames varies from 3 to 20 because of the time budget. Chapters with 3 measured frames have a wide spread (see the p95 column), so treat them as indicative only.
- The triangle count is about 3.6 million at chapters 2 to 7 and about 4.0 million at chapters 8 to 15. The instance counts (about 65,000 to 73,000 per frame) suggest that most triangles sit in instanced geometry, but this was not checked. Chapter 16 is much smaller.

**Interrupted medium-tier probe (not a committed result).** A first run at `--quality=medium` (the viewer's `medium` tier) was stopped by a 590 s shell timeout after chapter 6. Its JSON was not written, so these numbers come from the console output of that run only:

| Ch | Frames | Frame ms median | p95 | Draw calls | Triangles | Instances | Geometries | Textures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20 | 543.0 | 663.9 | 23 | 103,267 | 1,590 | 9 | 15 |
| 2 | 19 | 6,129.5 | 6,474.4 | 29 | 7,502,191 | 65,119 | 15 | 15 |
| 3 | 10 | 4,217.2 | 5,362.8 | 29 | 7,493,651 | 65,119 | 15 | 15 |
| 4 | 10 | 9,701.1 | 10,144.4 | 31 | 7,607,691 | 65,987 | 19 | 15 |
| 5 | 10 | 5,525.1 | 6,355.0 | 31 | 7,509,731 | 65,216 | 19 | 15 |
| 6 | 10 | 6,541.2 | 7,929.8 | 31 | 7,578,259 | 65,620 | 17 | 15 |

At the medium tier, a software-GL frame from chapter 2 on takes 4 to 10 s, and the triangle count is about twice the `low` count. Twenty frames per chapter at that rate does not fit the run budget, so the default is `low`. Use `node tools/perf/browser-bench.mjs --quality=medium --chapters=2` to repeat one chapter.

## 4. Limitations

1. **Software GL only.** SwiftShader runs on the CPU. No hardware GPU was available, so the browser frame times say nothing about a real device.
2. **Draw counts are wrapper counts.** They come from wrapping the WebGL2 draw methods, not from `renderer.info.render`, which the viewer API does not expose. The totals should match `renderer.info.render` for each frame, but this was not cross-checked.
3. **Frame time is the rAF interval.** It is the spacing between viewer ticks, which includes the CPU work of the tick and whatever GL work finishes in that interval. There is no GPU timer.
4. **Coupled numbers describe a stub.** `contributeCoupled` is a pass-through until task R3-S5. The Coupled rows will change when S5 lands and must be measured again.
5. **Variable frame counts.** Chapter frame counts vary between 3 and 20 (section 3.2). Rerun the chapter with `--chapters` for a tighter number.
6. **Node numbers from one machine.** One run on a shared container, with 200 untimed warm-up calls and no control of GC. The max column may include GC pauses.

## 5. Hardware results (filled in by a human)

Record one row per device, browser and quality tier. Use the browser-bench draw-call and triangle counts for the same tier (they should depend mainly on the story and the tier, not on the device). The frame-time targets are in section 2. Do not fill in numbers from software GL here.

| Device | Browser | Quality tier | Median frame ms | p95 frame ms | Draw calls | Triangles | Date | Tester |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
