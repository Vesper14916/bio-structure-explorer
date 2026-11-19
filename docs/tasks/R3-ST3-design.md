# Stage ST3 design: kinematics core and story engine (Claude, part C2)

Owner: Claude (stage design and integration). Branch: `claude/bold-mayer-j248mg`, continuing from the ST2 result (`2d9512c`; the Chief has not yet tagged `r3-st2`). Tasks: R3-K1 (duplex and track kinematics) and R3-S2 (story engine), `PLAN.md` §8.2–§8.3 and §10; contracts `docs/CONTRACTS.md` §7.3–§7.4.

This file is binding for every ST3 subagent. It records measured facts, the readings taken where the plan is ambiguous or inconsistent with the data, and the exact interfaces other stages will consume (S3 in ST6 is Gemini's; S4 in ST7 is Claude's).

## 1. Execution order (strictly serial; Haiku helpers in parallel only in step 6)

| Step | Executor | Scope |
| --- | --- | --- |
| 1 | Sonnet | K1-a: `js/kin/frames.js`, `js/kin/track.js`, `tests/kin-frames.test.mjs` |
| 2 | Sonnet | K1-b: `js/kin/duplex.js`, `tests/kin-duplex.test.mjs`, `dev/kin-lab.html` |
| 3 | Sonnet | S2-a: `js/sim/gene/timeline.js`, `js/sim/gene/shots.js`, `tests/timeline.test.mjs` |
| 4 | Sonnet | S2-b: `js/sim/gene/story.js`, plug-point no-ops, `tests/story.test.mjs`, `tests/stubs.test.mjs` trim (DEC-005) |
| 5 | Claude | Review, fixes, gates |
| 6 | Haiku (parallel) | kin-lab screenshots; timeline-versus-plan cross-check |
| 7 | Claude | Handoffs `docs/handoffs/R3-K1.md`, `R3-S2.md`; push |

## 2. Measured facts

From `assets/rnap-ec.asset.json` (6ALF), measured by the stage lead:
- Tracks: `template` registers −15…13 (all fitted), `nontemplate` −15…13 (registers −9…−3 synthetic: the melted non-template strand is not modelled), `rna` −12…−1.
- **Template track frames point upstream:** the template z axis has dot product −0.73…−1.00 with the RNAP +z (downstream) axis. Step r → r+1 is about −3.3 Å along the local z with a twist of about −34°. So `T_{r+1} ≈ T_r · S(−1)`.
- The template track has real kinks at the bubble edges (r −10 → −9: 15.5 Å lateral; r 0 → 1: 18 Å lateral). These are the strand entering and leaving the hybrid, not fitting errors.
- `rnap-holo` has no tracks yet (task A4 in ST5 adds RPo tracks).
- **Backbone gaps on the asset's own frames.** With the repository's rigid nucleotide templates (`nucleotideTemplate`, ideal backbone) placed on the fitted base frames, O3′(i)–P(i+1) is 1.6–5.2 Å along the template track, 1.3–6.6 Å along the non-template track (largest in its synthetic bubble), and 2.1–5.5 Å along the RNA track. An ideal B step gives 1.60 Å. **Therefore the plan's gate "O3′–P ≤ 1.9 Å everywhere except bubble edges (≤ 2.6 Å)" cannot hold inside a track with the plan's own method** (frames taken from the track). §3.6 redefines the gate; the handoff raises it as a request.

## 3. K1 design

### 3.1 Conventions (read before anything else)
- Frames follow `docs/CONTRACTS.md` §1: a nucleotide frame maps standard base coordinates; its +z runs 5′→3′ along that nucleotide's own strand; `partnerFrame(f)` (rotation 180° about local x) gives the Watson–Crick partner.
- **The duplex is computed on coding-oriented base-pair frames** `C`. For the RNAP tracks, `C_r = partnerFrame(T_r)` where `T_r` is the template track frame. With this reading every formula in `PLAN.md` §8.3 and `CONTRACTS.md` §7.4 holds as written: `C_{r+1} = C_r · S(1)` downstream, `t0 = −z(C_{r0})` points upstream, and the upstream twist is −34.2857° per base pair. The plan's text names these frames `T_r`; applied literally to template frames the arms would grow in the wrong direction. Template frames are always produced as `partnerFrame(C)`.
- `S(x)` = translation `[0, 0, 3.38·x]` composed with `rotZ(34.2857142857·x°)`; `S(x)` is the same as `helixFrame(x, HELIX_B.rise, HELIX_B.twistDeg)`.
- Register: `r = g − dna.register`, where `g` is the gene index (coding-strand DNA index 0…247) and `dna.register` is the gene index of template register 0 (fractional while stepping). Track range for the machine: `[r0, r1]` = the template track's first and last register (`rnap-ec`: −15, 13).
- **Downstream axis** in the machine frame: `z_d := z(C_{r1})` (the axis of the downstream arm). For `rnap-ec` it is within about 8° of the asset +z. Using the arm axis rather than the asset +z is what makes downstream base pairs stationary while the machine translates (§3.5 test). S3 (ST6) must move the machine along this `z_d`; K1 exports it.
- **World frame:** +x along the gene's downstream axis, +y up, gene midpoint bp 124 at the origin (`CONTRACTS.md` §7.4). The straight world duplex is `C^W_g = W · S(g − 124)` with `W = { o: [0,0,0], R: [0,0,1, 0,1,0, -1,0,0] }` (local z → world +x; the same rotation as the RNAP in `tests/fixtures/world-state.json`).

### 3.2 Frame buffer layout
`outFrames` is a `Float32Array` of `2 · N · 16` floats (`N` = construct length, 248). Frame `i` occupies floats `16i … 16i+15` as a **column-major 4×4 affine matrix** (three.js `Matrix4.elements` order): `[R00, R10, R20, 0, R01, R11, R21, 0, R02, R12, R22, 0, ox, oy, oz, 1]`, where `R` is the row-major `{o, R}` rotation of `CONTRACTS.md` §1. Index `i = g` is the coding-strand nucleotide at gene index `g`; index `i = N + g` is the template-strand nucleotide paired with gene index `g`. `frames.js` exports `writeFrame16(buf, i, f)` and `readFrame16(buf, i, out)`.

### 3.3 `frames.js` (step 1)
Implement the W0 stub exports with the stub signatures, plus `writeFrame16`, `readFrame16`, `slerpQuat`, `catmullRomCentripetal(points, samples)` and `cubicBezier(p0, p1, p2, p3, u)`. Quaternions `[x, y, z, w]`; `matToQuat` must be robust for rotations near 180° (Shepperd's method) and return the hemisphere with `w ≥ 0`; `slerpFrame` interpolates the origin linearly and the rotation by shortest-arc quaternion slerp; `rotationMinimizingFrames` uses the double-reflection method (Wang et al. 2008); `arcLengthTable(sampleFn, 512)` returns `{ length, uAt(s), pointAt(s), tangentAt(s) }` with monotone inversion by binary search plus linear interpolation. Pure functions; no globals. In-place variants with an `out` argument are welcome for the hot path.

### 3.4 `track.js` (step 1)
- `sampleTrack(track, r)`: frame at fractional register by `slerpFrame` between `floor(r)` and `ceil(r)`; outside `[r0, r1]` extrapolate by the screw step from the nearest end, in the **coding orientation** described in §3.1 (document which orientation the function returns: it returns the frame in the track's own orientation, and extrapolation uses `S(±x)` composed on `partnerFrame` and converted back, so template tracks extrapolate downstream correctly).
- `blendTrackFrame(ideal, track, beta)` = `slerpFrame(ideal, track, beta)`.
- Add `codingFrameAt(track, r, out)` returning `partnerFrame(sampleTrack(track, r))` for template tracks.

### 3.5 `duplex.js` (step 2)
`poseDuplex(construct, dnaState, assets, outFrames, opts = {})` — the fifth argument is an additive extension of the W0 stub (recorded as a request): `opts.machine = { assetId, transform: {o, R} } | null` (the RNAP actor transform from `WorldState.machines`; for relaxation after release, the caller passes the frozen pose), `opts.trackBlend` (defaults per DEC-007).

Algorithm, per gene index `g` (all in coding orientation):
1. `r = g − dna.register`. Machine frame `M = opts.machine.transform`. Track frames `C_r` from the template track of the asset given by the blend (DEC-007): per register `slerpFrame(C^holo_r, C^ec_r, trackBlend)` where both exist, otherwise whichever exists; if `rnap-holo` has no tracks, use `rnap-ec` tracks for both.
2. Ideal straight frames in the machine frame: `I_r = C_{r1} · S(r − r1)` for every `r` (the downstream arm continued straight through the machine).
3. Effective bend `β = dna.bend · (1 − dna.relax)`.
4. Inside the track (`r0 ≤ r ≤ r1`): `F_r = M · slerpFrame(I_r, C_r, β)`.
5. Downstream (`r > r1`): `F_r = M · C_{r1} · S(r − r1)` (unchanged by β, because `I_{r1} = C_{r1}`).
6. Upstream (`r < r0`): seed frame `A = slerpFrame(I_{r0}, C_{r0}, β)`; `P0 = o(A)`, `t0' = slerp(tE, t0, β)` with `t0 = −z(C_{r0})`, `tE = −z_d`; `L = 40 · 3.38 Å`; `P1 = P0 + t0'·L/3`, `P3 = P0 + (t0' + tE)·L/2`, `P2 = P3 − tE·L/3`; straight along `tE` beyond `P3`. Base pair at `k = r0 − r` steps upstream sits at arc length `3.38·k`. Its frame: rotation-minimising transport of `A` along the curve to that point (double reflection over the 512-sample table, transporting `A`'s rotation so that −z follows the upstream tangent), then `rotZ(−34.2857°·k)` about its local z. At β = 0 and on any straight section this equals `A · S(−k)` exactly.
7. No machine (`opts.machine` null): `F_g = C^W_g` (straight world duplex).
8. Strands: coding frame `F`; template frame `partnerFrame(F)`, except inside the bubble (`dna.bubble = [lo, hi]`, registers relative to template register 0): template = `M · T_r` (track, blended toward its ideal partner by β) and coding = `M · N_r` (non-template track frame, blended the same way) where the non-template track has register `r`; if it does not, keep `partnerFrame`.

Exports besides `poseDuplex`: `downstreamAxis(asset)` (`z_d` in the machine frame), `machinePoseForRegister(asset, register)` returning `M` such that at β = 0 the duplex coincides with the straight world duplex: `M = W · S(register + r1 − 124) · inverse(C_{r1})` (S3 uses it for the bound pose), and `duplexBackboneGaps(construct, outFrames)` (O3′–P per step, for tests and the lab page).

### 3.6 K1 gates (`tests/kin-duplex.test.mjs`)
Replace the plan's single continuity gate by these, and report the in-track numbers in the handoff:
- Arms and every K1-generated step (downstream arm, upstream arm including the curved section, β = 0 anywhere, no-machine duplex): adjacent base-pair origins 3.38 ± 0.15 Å apart along the local axis; O3′(i)–P(i+1) ≤ 1.9 Å (measured with `nucleotideTemplate` atoms placed by the frames, both strands).
- Track-to-arm junctions (r0−1/r0 and r1/r1+1) at β = 1: O3′–P ≤ 2.6 Å.
- Inside the track at β = 1 and at β = 0.5: O3′–P ≤ (gap of the source asset frames at that step, or the ideal 1.6 Å, whichever is larger) + 0.05 Å — K1 adds no error to the asset. Record the table.
- Stationarity: with `M` advancing as `M_0 · translate(z_d · 3.38 · Δ)` (Δ = 0…10 in steps of 0.25), the world origin of the base pair 30 bp downstream of template register 0 stays fixed within 0.01 Å.
- β = 0 equals ideal B-DNA: all heavy atoms of both strands built with `Assembly` (`buildDuplex(construct coding sequence, HELIX_B)`) and with K1 frames agree within 0.01 Å RMSD after one rigid superposition.
- `machinePoseForRegister`: at β = 0 the K1 frames equal `C^W_g` within 0.01 Å for every g.
- Clash (§5.3 item 8): at β = 1 and registers 45, 105, 165, DNA heavy atoms inside the track range penetrate `rnap-ec` L1 bead spheres (Cα 1.9 Å, P 2.4 Å) by at most 1.0 Å. Report the maximum.
- Determinism and no `NaN`; `poseDuplex` median ≤ 1.5 ms for 248 bp in Node 22 (a share of the 6 ms pose budget); no per-call allocation after the first call for the same construct (scratch cached in a `WeakMap` keyed by construct).

### 3.7 `dev/kin-lab.html` (step 2)
A dev page using `createViewer` and `setActors` (read-only use of the render layer) that shows `rnap-ec` at the pose `machinePoseForRegister(asset, register)`, the 248-bp duplex from `poseDuplex` through an `Assembly`, and sliders `register` (gene index 0…200, step 0.25), `bend` (0…1) and `relax` (0…1), plus URL parameters `register`, `bend`, `relax`, `bubble` (e.g. `-11,2`), `lod`, `cutaway` for screenshots. Required captures (step 6): β = 0, 0.5, 1 × register 45 and 105 (plan wording "register 0 and 60" read as transcript positions +0 and +60, i.e. gene index 45 and 105).

## 4. S2 design

### 4.1 Files
- `js/sim/gene/timeline.js`: chapter tables for both modes (§6.1, §6.4) as data, captions (§6.2, plain text per DEC-006), and `buildTimeline(scenario, assets, { mode, seed, D })` → `{ duration, chapters, events, meta }`.
- `js/sim/gene/shots.js`: the shot table of `PLAN.md` §6.3 plus `coupled-wide` and `coupled-follow` as data (`getShot(id)`), and `resolveChapterShot(chapter, t)` per §4.3 below.
- `js/sim/gene/story.js`: `buildStory`, `stateAt`, `chapterAt`, the event index and query helpers (§4.4), `createWorldState()`.
- Plug points (stage-lead decision, plan §10 R3-S2 step 3): replace the throwing stubs of `contributeTx` (`transcription.js`), `contributeTl` (`translation.js`) and `contributeCoupled` (`coupled.js`) by pass-through functions that return `out` unchanged; `buildCoupledTimeline` delegates to `buildTimeline(..., { mode: 'coupled' })`. S3, S4 and S5 replace them later. Update `tests/stubs.test.mjs` per DEC-005.

### 4.2 Timeline content
- Chapter ids, titles, groups, durations, shots exactly as `PLAN.md` §6.1 (sequential, total 164.05 s) and §6.4 (coupled). Coupled durations use `D` = `opts.D`, else `assets['rnap-ec'].source.coupling.D` when task A4 has recorded it, else **48** with `meta.dSource = 'default 48 (PLAN.md §6.4); pending task A4'`.
- Captions: §6.2 for sequential; coupled chapters 1–5 reuse §6.2 captions 1–5, chapters 6–12 use the §6.4 captions. Substitute `{N}` in caption 14 with `ceil(L / 3.40)` where `L` is the length of `assets['ribosome-70s'].paths.tunnel` (86.71 Å → 26); if the asset is not given, keep `{N}` and set `meta.N = null`. Substitute `{D}` in coupled caption 8. Assert in tests that no `{` remains when assets are given.
- Events (`{ id, type, t0, t1, chapter, data }`, ids `<type>:<n>` numbered per type in time order, sorted by `t0` then `id`) carry semantics, not geometry: S3/S4 derive positions. Every event's `data` names its subject with `data.target` (`'rnap'`, `'sigma'`, `'ribosome'`, `'small'`, `'large'`, a factor id `'if1'|'if2'|'if3'|'ef-tu'|'ef-g'|'rf1'|'nusg'`, or a tRNA slot `'trna:0'…'trna:3'`). Schedule (sequential; times relative to the chapter start; "cycle" sub-timings scale with the per-nucleotide or per-codon time):

| Ch | Events |
| --- | --- |
| 1 establish | none |
| 2 search | `machine.move` rnap [0, 8.0] `{ assetId: 'rnap-holo', ease: 'easeInOutCubic' }`; `machine.bind` rnap [8.0, 8.0] `{ register: 45 }` |
| 3 open | `dna.open` rnap [0, 6.0] `{ bubble: [-11, 2], bend: [0, 1] }` |
| 4 initiate | per nt n = 1…3 at `c = 1.8(n−1)`: `ntp.enter` [c, c+0.8] `{ n, base }`; `bond.phosphodiester` [c+0.8, c+1.2] `{ n }`; `ppi.leave` [c+1.2, c+1.8] `{ n }`; hold 1.0 s |
| 5 escape | nt 4…12 at 0.5 s/nt, each split 0.8 : 0.4 : 0.6 of the nucleotide time like chapter 4 (the PPi of one step may overlap the next NTP); `part.release` sigma [3.5, 5.0] (starts with nt 11); `machine.bind` rnap [3.5, 5.0] `{ trackBlend: [0, 1], assetSwitchAt: 0.5, assetId: 'rnap-ec' }` (DEC-007) |
| 6 elongate-tx | nt 13…150 at 0.15 s/nt, the same three events per nt |
| 7 terminate-tx | nt 151…179 at 0.35 s/nt (10.15 s); `rna.hairpin` [first nt of `termStem3`, 10.15] `{ stem: [151, 159), loop: [159, 163), stem3: [163, 171) }` (mRNA indices of §5.1 landmarks); `rna.release` [10.15, 10.15]; `dna.close` [10.15, 13.15]; `dna.relax` [10.15, 13.15]; `machine.move` rnap [10.15, 13.15] `{ leave: true }` |
| 8 scan | `mrna.layout` [0, 3.0] `{ to: 'ribosome' }`; `factor.enter` if1 and if3 [3.0, 6.0]; `ribosome.bind` small [3.0, 8.0] `{ sd: [11, 17) }` |
| 9 start | `factor.enter` if2 [0, 3.0]; `trna.enter` trna:0 [0, 3.0] `{ kind: 'init', aa: 'fMet', site: 'P', codon: 1 }`; `codon.pair` trna:0 [3.0, 4.5] `{ codon: 1, site: 'P' }` |
| 10 join | `ribosome.join` large [0, 2.5]; `factor.leave` if3 [1.0, 3.0]; `gtp.hydrolyse` if2 [3.0, 4.4]; `factor.leave` if1 [3.0, 5.0]; `factor.leave` if2 [3.0, 5.0] |
| 11 decode (codon 2) | `factor.enter` ef-tu [0, 3.0] `{ carries: 'trna:1' }`; `trna.enter` trna:1 [0, 3.0] `{ kind: 'aa', aa: <codon 2 aa3>, site: 'AT', codon: 2 }`; `codon.pair` trna:1 [3.0, 5.0] `{ codon: 2, site: 'A' }`; `gtp.hydrolyse` ef-tu [5.0, 6.4]; `factor.leave` ef-tu [5.0, 7.0]; `trna.move` trna:1 [7.0, 9.0] `{ from: 'AT', to: 'A' }` |
| 12 bond | `bond.peptide` [1.0, 3.0] `{ codon: 2, from: 'trna:0', to: 'trna:1' }` (pulse at t0, 400 ms, drawn by S4) |
| 13 translocate | `factor.enter` ef-g [0, 1.5]; `gtp.hydrolyse` ef-g [1.5, 2.9]; `translocate` ribosome [1.5, 4.0] `{ codon: 2 }`; `trna.move` trna:0 [1.5, 4.0] `{ from: 'P', to: 'E' }`; `trna.move` trna:1 [1.5, 4.0] `{ from: 'A', to: 'P' }`; `factor.leave` ef-g [4.0, 6.0] |
| 14 elongate-tl | codons k = 3…40, cycle 1.1 s at `c = 1.1(k−3)`: `trna.leave` (the E-site slot) [c, c+0.35]; `factor.enter` ef-tu [c, c+0.15]; `trna.enter` (the free slot) [c, c+0.15] `{ kind: 'aa', aa: <codon k aa3>, site: 'AT', codon: k }`; `codon.pair` [c+0.15, c+0.25]; `gtp.hydrolyse` ef-tu [c+0.25, c+0.35]; `factor.leave` ef-tu [c+0.25, c+0.35]; `trna.move` AT→A [c+0.25, c+0.35]; `bond.peptide` [c+0.35, c+0.5] `{ codon: k }`; `factor.enter` ef-g [c+0.5, c+0.6]; `translocate` [c+0.6, c+1.0] `{ codon: k }`; `trna.move` P→E and A→P [c+0.6, c+1.0]; `gtp.hydrolyse` ef-g [c+0.6, c+0.7]; `factor.leave` ef-g [c+1.0, c+1.1]. Slots rotate 0→1→2→3→0 (four slots: delivery, A, P, E). |
| 15 release | `trna.leave` (E slot) [0, 1.0]; `factor.enter` rf1 [0, 3.0] `{ codon: 41, site: 'A' }`; `peptide.release` [3.0, 9.0] `{ hydrolysis: [3.0, 5.0], slide: [5.0, 9.0] }`; `factor.leave` rf1 [9.0, 11.0] |
| 16 finale | `trna.leave` (P slot, deacylated) [0, 2.0] |

Coupled mode: chapters 1–5 as above; chapter 6 nt 13…24+D at 0.15 s/nt; chapter 7 (`couple-scan`, 10.0 s): `mrna.layout` [0, 2.0] `{ to: 'coupled' }`, then chapter 8 and 9 events of the sequential table compressed into [2.0, 10.0] (`ribosome.bind` small at the `expressome` pose, `trna.enter` init); chapter 8 (`couple-join`, 7.5 s): the sequential chapter 10 events in [0, 6.0], `factor.enter` nusg [6.0, 7.5], `couple.lock` [7.5, 7.5]; chapter 9 (`couple-run`): `⌊(179 − 24 − D)/3⌋` cycles of 1.1 s, each with three nucleotides of transcription (0.1 s NTP, 0.0667 s bond, 0.1 s PPi per nt, three nt per cycle) and one translation cycle with the chapter 14 sub-timing (codon 2 onward); chapter 10 (`couple-terminate`, 4.0 s): remaining nucleotides at 0.35 s/nt, `factor.leave` nusg, `rna.hairpin` completion, `rna.release`, `dna.close`, `dna.relax`, `couple.unlock` [4.0, 4.0]; chapter 11 (`release`): remaining codons at 1.1 s plus the sequential chapter 15 events; chapter 12 (`finale`). Total for D = 48: 122.8 s (D13 says "about 123 s").

All sub-timings not stated in `PLAN.md` are **initial values** (Chief may tune at G2/G3); list them in `meta.initialValues`.

### 4.3 Shots
`resolveChapterShot(chapter, t)` → `{ id, from, blend }`. Shot segments come from the chapter table, with the in-chapter switches of §6.1: chapter 14 `ribo-tunnel` for codons 3–24 and `ribo-exit` from the start of codon 25's cycle; chapter 15 `ribo-decode` until the slide starts (t0 + 5.0) and `ribo-exit` after. `from` = the previous segment's id (null for the first); `blend = clamp((t − segment start) / 1.2 s)` (the minimum of the §4.7 duration rule; task R3 computes the real transition duration from camera travel and may ignore `blend`).

### 4.4 Event index and contributor helpers (`story.js`)
- Build once: events sorted by `(t0, id)`; per channel (`type` + `data.target`, and per `type` alone) the sorted `t0` and `t1` arrays as `Float64Array` with event indices.
- Exported helpers (O(log E), no allocation): `lastStarted(story, type, target, t)` → event index or −1; `completedCount(story, type, target, t)` → number with `t1 ≤ t`; `progressOf(story, eventIndex, t)` → clamp((t − t0)/(t1 − t0)) (1 for zero-length events once started). `target` may be `null` for all targets.
- `buildStory(scenario, assets, { mode, seed, D, timeline })`: when `opts.timeline` is given (e.g. `tests/fixtures/story-mini.json`), use its chapters and events instead of generating them and build the same index.

### 4.5 What `stateAt` fills (S2) and what it leaves (S3, S4, S5)
- S2 fills: `t`, `chapter` (the same object reference from `story.chapters`), `chapterProgress`, `caption`, `counters`, `highlight`, `shot`. Then it calls `contributeTx`, `contributeTl` and, in coupled mode, `contributeCoupled`, in that order.
- Counters: `mrna` = completed `bond.phosphodiester` events; `hybrid` = `min(mrna, 9)` until `rna.release` starts, then 0; `codon` = codon number of the last completed `codon.pair` (41 once `factor.enter` rf1 completes), 0 before translation; `peptide` = 0 until `codon.pair` codon 1 completes, then 1 + completed `bond.peptide` events. `highlight.codon` = `counters.codon` (null when 0).
- All other fields keep the defaults of `createWorldState()`: `machines: []`, `dna: { machineId: null, register: 45, bend: 0, bubble: [0, 0], relax: 0, trackBlend: 0 }`, `rna: { length: 0, addProgress: 0, hairpin: 0, released: false, layout: 'rnap', layoutBlend: 0 }`, `ribosome: { codon: 0, bound: false }`, `trnas: []`, `peptide: { length: 0, attach: 'free', release: 0 }`, `ntp: { base: null, path: 0, bonded: false }`, `ppi: { path: 0, opacity: 0 }`, `fx: []`. Contributors must reuse entries of `out` arrays rather than replace them, so the allocation rule holds once they exist.

### 4.6 S2 gates (`tests/story.test.mjs`, `tests/timeline.test.mjs`)
Chapter totals equal §6.1 and §6.4 to ±1 ms (sequential 164.05 s; coupled 122.8 s for D = 48); chapter ids, titles and captions exact; ids unique `<type>:<n>`; events sorted; every event type in the allowed list; counters monotonic over a forward sweep (mrna 0→179, codon 0→41, peptide 0→40); `counters.mrna` = 179 and `counters.peptide` = 40 at the end; determinism (1,000 seeks in random order with a seeded generator versus a forward sweep give identical `JSON.stringify` of the state); allocation (`heapUsed` growth ≤ 1 MB over 10,000 calls with `out`, after warm-up, `--expose-gc` not required: measure the median of several runs); median `stateAt` ≤ 2 ms; `tests/fixtures/story-mini.json` loads through `buildStory(..., { timeline })` and `stateAt` works on it; caption substitution (`{N}` = 26 with the committed ribosome asset).

## 5. Out of scope for ST3
Machine choreography, NTP and PPi motion, σ release motion, hairpin and free chains (S3, K2: Gemini, ST5–ST6); translation geometry (S4, K3: Claude, ST7); rendering and UI; `js/main.js` (Chief). Contract changes go to the handoff under `Requests`.
