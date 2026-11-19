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

## DEC-007 — Optional `WorldState.dna.trackBlend` for promoter escape (2026-11-19, ST1 Argon review)

- **Context:** `PLAN.md` §8.3 requires promoter escape (chapter 5) to slerp track frames from `rnap-holo` to `rnap-ec` over 1.5 s while switching `assetId` at blend 0.5, yet `WorldState.dna` lacked a blend parameter and `Poser.pose(world, target)` receives only `WorldState`.
- **Decision:** Add optional `trackBlend?: number` (`[0, 1]`; `0` = `rnap-holo` tracks, `1` = `rnap-ec` tracks; default `1` when RNAP `assetId === 'rnap-ec'` and `0` when `'rnap-holo'`) to `WorldState.dna` in `docs/CONTRACTS.md` §7.3.
- **Impact:** Gives K1 (`poseDuplex` / `blendTrackFrame`) and S2/S3 a clean, stateless, backwards-compatible channel for promoter escape without breaking `tests/fixtures/world-state.json`.

## DEC-008 — Binary `tracks.*.synthetic` with optional `tracks.*.sources` (2026-11-19, ST1 Argon review)

- **Context:** `PLAN.md` §7.4 describes recording per-register source provenance on `ribosome-70s` `tracks.mrna` (7K00 vs 7ST2 vs synthetic), while `CONTRACTS.md` §6.2 defines `tracks.*.synthetic` as `[0 | 1]`. Putting strings like `"7K00"` into `synthetic` would break boolean truthiness checks in kinematics.
- **Decision:** `js/assets/format.js` strictly enforces `tracks.*.synthetic` elements to be `0 | 1` (`0` = fitted from any PDB, `1` = interpolated/synthetic). Multi-source tracks may attach an optional parallel `tracks.*.sources: string[]` array (e.g. `"7K00"`, `"7ST2"`, `"synthetic"`) for per-register provenance.
- **Impact:** Prevents ST2/ST3 truthiness bugs while preserving full multi-PDB provenance for A1 (`ribosome-70s`).

## DEC-009 — Ribosome exit tunnel truncation at first solvent-side voxel after 60 Å (2026-11-19, ST2 intake, R3-A1 Request 1)

- **Context:** In `ribosome-70s` (7K00), the `PLAN.md` §7.4 step 2 target (voxel nearest the uL23/uL29 Cα centroid) lies ~45 Å past the tunnel mouth on the 50S surface, yielding a 145.9 Å path that fails the 75–110 Å length gate. The §13 straight-line fallback passes 0.16 Å from 23S rRNA, which would cause the nascent peptide to pierce the 50S subunit.
- **Decision:** **Accepted.** Truncate the exact §7.4 Dijkstra clearance-weighted path at its first solvent-side point after 60 Å (measured using the §7.4 solvent-side ray test with exact heavy-atom clearances), then smooth and resample at 1.0 Å. Observed path: 86.71 Å (88 points), minimum clearance 3.66 Å beyond 6 Å, `synthetic: 0`, `{N} = 26` residues.
- **Impact:** Satisfies both tunnel length (75–110 Å) and clearance (≥ 3.0 Å) gates without steric clashes; supersedes the §13 straight-line fallback for `ribosome-70s`.

## DEC-010 — 7PJV superposition rule for EF-G (23S-only), 50% kept-fraction gate, and omission of `siteAP`/`sitePE` (2026-11-19, ST2 intake, R3-A1 Request 2)

- **Context:** PDB `7PJV` is a rotated, hybrid-state ribosome. Under the combined 16S+23S two-pass rule (`PLAN.md` §7.3), only 551 of 4,268 matched P atoms (12.9 %) survive the 2.0 Å cutoff (RMSD 1.23 Å), whereas separate fits keep 94.6 % on 23S (2,600/2,749, RMSD 0.78 Å) and 76.2 % on 16S (1,158/1,519, RMSD 1.08 Å). Under the combined fit, 7PJV tRNA anticodon origins lie 5.1 Å (`siteAP`) and 6.1 Å (`sitePE`) from 7K00 `siteA`/`siteP`, failing the 4.0 Å condition.
- **Decision:** **Accepted.**
  1. Keep `siteAP` and `sitePE` omitted from `ribosome-70s` (pre-approved `PLAN.md` §7.4 / §13 fallback: direct interpolation between classic sites on the rigid ribosome).
  2. For task **R3-A3** (`ef-g`, ST5), superpose `7PJV` onto `7K00` using **23S rRNA P atoms only** (where EF-G engages the 50S GTPase-associated centre and sarcin–ricin loop).
  3. Add a **minimum kept fraction ≥ 50 %** (`n_after / n_before >= 0.50`) alongside final RMSD ≤ 1.5 Å to the §7.3 two-pass superposition gate for all ST5+ factor and composite superpositions.
- **Impact:** Prevents over-trimmed fits from masking inter-subunit rotation in ST5 (`A3`/`A4`) and places EF-G accurately on 50S.

## DEC-011 — Superposition residue matching by author numbering (`auth_seq_id` + residue name) (2026-11-19, ST2 intake, R3-A1 Request 3)

- **Context:** `7ST2` numbers 16S rRNA with `label_seq_id = auth_seq_id - 1`, causing `label_seq_id`-based matching in `tools/lib/match.mjs` to shift every residue by 1 nt. `tools/assets/ribosome.mjs` matches rRNA by `(auth_seq_id, comp)`.
- **Decision:** **Accepted.** All rRNA superpositions in ST5 (`A3`, `A4`) MUST match residues by `(auth_seq_id, comp)` rather than `label_seq_id` alone. The Chief will add an author-numbering option (`keyField: 'authSeq'`, `matchComp: true`) to `tools/lib/match.mjs` at the start of ST5 (preserving existing `label_seq_id` defaults for existing callers and tests).
- **Impact:** Eliminates off-by-one rRNA alignment defects across heterogeneous PDB numbering schemes.

## DEC-012 — Evidence screenshot encoding (JPEG q90 at 2× allowed) (2026-11-19, ST2 intake, R3-A1/A2 Design Gap)

- **Context:** Full-resolution 2× (`2880×1800`) PNG captures of 3D WebGL scenes are 2.7–3.1 MB each, inflating repository size, while indexed 256-colour PNGs distort small-nucleotide element colours.
- **Decision:** **Accepted.** Evidence captures under `docs/evidence/r3/` MAY be stored as JPEG quality 90 at `deviceScaleFactor: 2` (or PNG when compact, such as UI panels). Gate colour checks (`ΔE ≤ 6`) may sample uncompressed PNG or direct canvas pixels when verifying against §4.3 tokens.
- **Impact:** Keeps visual evidence sharp and repository growth bounded across ST2–ST10.

## DEC-013 — Widen `trna-aa` anticodon-to-A76 P span gate to 65–85 Å (2026-11-19, ST2 intake, R3-A2 Request 1)

- **Context:** `PLAN.md` §10 R3-A2 specifies a 65–80 Å span from anticodon C1′ centroid to A76 P atom. In PDB `7K00`, P-site `trna-init` (chain Z) measures 76.147 Å, whereas accommodated A-site `trna-aa` (chain Y) measures 81.707 Å due to its more extended CCA 3′ end.
- **Decision:** **Accepted.** Widen the tRNA span acceptance range to **65–85 Å** for both `trna-init` and `trna-aa`, keeping exact experimental 7K00 coordinates untouched.
- **Impact:** Preserves structural fidelity to 7K00 without distorting the CCA end.

## DEC-014 — Three-part duplex backbone continuity gate and partial-bend bubble gate (2026-11-19, ST3 intake, R3-K1 Request 1)

- **Context:** `PLAN.md` §10 R3-K1 stated a flat `O3′–P ≤ 1.9 Å` gate everywhere except bubble edges (`≤ 2.6 Å`). With rigid ideal nucleotide templates placed on base frames fitted to the 4.1 Å `6ALF` tracks, the source asset itself exhibits in-track O3′–P gaps of 0.8–6.8 Å (and 29.8/35.3 Å kinks when the bubble is closed), making the flat gate impossible under §8.3.
- **Decision:** **Accepted.** Adopt the three-part gate of `docs/tasks/R3-ST3-design.md` §3.6 plus the partial-bend bubble chain gate:
  1. Arms and all K1-generated steps (downstream, curved upstream, β = 0, no-machine): origin spacing `3.38 ± 0.15 Å`, `O3′–P ≤ 1.9 Å`.
  2. Track-to-arm junctions (`r0−1/r0`, `r1/r1+1`) at β = 1: `O3′–P ≤ 2.6 Å`.
  3. Inside the track at β = 1 and β = 0.5: `O3′–P ≤ max(source_gap, 1.6 Å) + 0.05 Å` (K1 adds no error beyond the source asset).
  4. Partial-bend bubble coding chain (`0 < β < 1`): worst bubble coding gap never exceeds the β = 1 worst gap (6.6 Å), and each step is `≤ max(gap_0, gap_1) + 2.5 Å`.
- **Impact:** Gives a realistic, exact regression contract for `js/kin/duplex.js`. Applying step-chained interpolation to the single template hybrid kink (`r −10/−9`, 8.3 Å at β = 0.5) is deferred as an optional ST7 polish item.

## DEC-015 — Duplex kinematics operate on coding-oriented frames `C = partnerFrame(T)` and machine axis `z_d = downstreamAxis(asset)` (2026-11-19, ST3 intake, R3-K1 Requests 2 & 4)

- **Context:** In `rnap-ec`, template track frames point upstream (`T(r+1) ≈ T(r)·S(-1)`), so right-multiplying by the downstream screw step `S(x)` requires coding-oriented frames `C = partnerFrame(T)`. Furthermore, `z(C_{r1})` deviates by 8.13° from asset `+z`, so keeping downstream DNA stationary during elongation requires translating RNAP along `z_d = downstreamAxis(asset)`.
- **Decision:** **Accepted.** Amend `docs/CONTRACTS.md` §7.4 to specify that duplex screw and Bézier formulas apply to coding-oriented frames `C = partnerFrame(T)` (with template frames `partnerFrame(C)`), and that `z_d` in `M(t) = M_0 · translate(z_d · 3.38 · Δ)` is `downstreamAxis(asset)`.
- **Impact:** Aligns written contracts with `js/kin/duplex.js` and guarantees 0.00 Å downstream DNA drift for S3 (ST6).

## DEC-016 — `poseDuplex` optional fifth argument `opts` and helper exports (2026-11-19, ST3 intake, R3-K1 Request 3)

- **Context:** `poseDuplex` needs the active RNAP transform `{ assetId, transform }` (including frozen pose during post-release relaxation) and optional `trackBlend` (`DEC-007`), which were not present in the 4-argument W0 stub.
- **Decision:** **Accepted.** Extend `docs/CONTRACTS.md` §7.4 to record `poseDuplex(construct, dnaState, assets, outFrames, opts = {})` with `opts = { machine: { assetId, transform } | null, trackBlend }`, alongside exports `downstreamAxis(asset)`, `machinePoseForRegister(asset, register)`, and `duplexBackboneGaps(construct, outFrames)`.
- **Impact:** Additive and backwards-compatible; provides S3 (ST6) with the exact bound RNAP pose helper.

## DEC-017 — Story engine sub-timing initial values (2026-11-19, ST3 intake, R3-S2 Request 1)

- **Context:** `PLAN.md` §6.1 and §6.4 fix chapter totals and main phase durations, leaving finer sub-event splits (chapters 8–13 sub-intervals, chapter 14 1.1 s cycle split, coupled chapter 7 compression, and chapter 10 spacing) to be chosen as initial values.
- **Decision:** **Accepted.** Record the sub-timings exposed in `story.meta.initialValues` and `docs/tasks/R3-ST3-design.md` §4.2 as approved Chief-tunable initial values for gates G2 and G3.
- **Impact:** Unblocks S3, S4, and S5 choreography with a single source of truth for event timings.

## DEC-018 — Pass-through plug-point stubs in `transcription.js`, `translation.js`, and `coupled.js` (2026-11-19, ST3 intake, R3-S2 Request 2)

- **Context:** `PLAN.md` §10 R3-S2 step 3 requires `stateAt` to call `contributeTx`, `contributeTl`, and `contributeCoupled` as pass-through stubs that return without changing `out` until S3, S4, and S5 implement them. S2 replaced the throwing W0 stubs in those three files and marked them in `tests/stubs.test.mjs` (`DEC-005`).
- **Decision:** **Accepted.** Retroactively approved as required by R3-S2 step 3. File ownership of `js/sim/gene/transcription.js`, `js/sim/gene/translation.js`, and `js/sim/gene/coupled.js` remains with S3 (ST6), S4 (ST7), and S5 (ST9) respectively.
- **Impact:** Keeps `stateAt` and `npm test` runnable end-to-end across ST3–ST5 while preserving downstream ownership boundaries.



