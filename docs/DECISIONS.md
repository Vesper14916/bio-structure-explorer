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

## DEC-019: Gate G1 colour-sampling protocol for ACES + PBR high-chroma tokens & ST5 factor colour watch item

- **Date:** 2026-11-19
- **Source:** ST4 Argon independent review (`docs/reviews/R3-ST4-argon.md`, findings L1, L2, L3)
- **Context:** `js/render/actors.js` assigns exact `PLAN.md` §4.3 sRGB hex tokens to `ribosome-70s`, `trna-init` (`#ffd43b`), and `trna-aa` (`#ff922b`) (albedo CIE76 `ΔE = 0.00`). While low-chroma ribosome neutrals measure `ΔE = 0.51–1.62` even on lit ACES + PBR screenshots, near-gamut high-chroma tRNA tokens measure `ΔE ≈ 18` when lit ACES pixels are compared directly against unlit sRGB hexes due to ACES Filmic highlight desaturation and cool specular/rim irradiance. In addition, `js/render/actors.js` `chainColor()` currently checks `'alpha'`/`'beta'`/`'omega'`/`'sigma'` substrings in `chain.name` before falling back to `partColor(partId, assetId)`.
- **Decision:**
  1. **Colour sampling (L1):** Gate G1 (and subsequent asset colour gates) evaluates `ΔE ≤ 6` against `PLAN.md` §4.3 raw sRGB tokens on **resolved material albedo / `instanceColor` / unlit flat renders** (`ΔE = 0.00` for all ST2 assets), or compares lit captures against **ACES + PBR-lit reference swatches** rendered under the same stage rig. Visually inspect lit captures to verify preserved hue and clear inter-actor separation.
  2. **ST5 factor watch item (L3):** In ST5 (`R3-A3` / Chief integration), ensure all factor assets (`rf1`, `ef-tu`, `ef-g`, `nusg`) either carry explicit `subunit` tags or guard RNAP substring matching in `js/render/actors.js:chainColor()` to RNAP assets so mmCIF descriptions containing `"alpha"` or `"beta"` cannot mis-tint factor chains.
  3. **Test hardening (L2):** Note Argon's non-blocking unit-test hardening items (`tests/assets-trna.test.mjs`, `tests/assets-ribosome.test.mjs`, `tests/asset-budgets.test.mjs`) for optional follow-up without blocking Gate G1.
- **Impact:** Prevents false-fail colour rejections on high-chroma tokens (`trna-init`, `trna-aa`, and ST5 factors `rf1`, `ef-tu`, `ef-g`, `nusg`) while keeping strict albedo fidelity.

## DEC-020: R3-R1 detail-sphere & AtomGroupLayer design gaps, browser-only stub check, and picking deferral

- **Date:** 2026-11-19
- **Source:** `docs/handoffs/R3-R1.md` (Design gaps, Requests, Open questions)
- **Context:** `PLAN.md` §4.4 leaves peptide cartoon Cα bead radius, peptide cartoon colour under `element` scheme, and `< 2`-residue peptide fallback unspecified. Implementing `js/render/atom-groups.js` with `import * as THREE from 'three';` prevents Node from dynamically importing that file without the browser importmap. R1 also asked whether `viewer.pick(...)` should pick inside `AtomGroupLayer`.
- **Decision:**
  1. **Accepted** `CA_BEAD_RADIUS = 0.85` Å (≈ 2× `PEPTIDE_BOND_RADIUS` `0.42` Å), `ELEMENT_INFO.C.color` (`0x9eb2cc`) for peptide cartoon trace under `element` scheme, and bead-only rendering when `residues.length < 2`.
  2. **Extended `DEC-005`** in `tests/stubs.test.mjs`: implemented browser/Three.js modules are marked `implemented: true, browserOnly: true` and verified statically for their contracted exports in Node (with full runtime verification in `tests/render-detail.browser.mjs` and `npm run smoke`).
  3. **Deferred** `AtomGroupLayer` picking to ST6 (`R3-U2` / `R3-R2`); `Viewer` keeps only `setDetailFocus` and `setAtomGroups` in ST4.
- **Impact:** Clean `npm test` execution across Node and browser-only Three.js modules; unambiguous picking ownership for ST6.

## DEC-021: R3-U1 Express v2 toggle payload, §4.9 legend boot guard, and closed-CSS design-gap rulings

- **Date:** 2026-11-19
- **Source:** `docs/handoffs/R3-U1.md` (Design gaps, Requests, Open questions)
- **Context:** U1 emitted partial-object toggle payloads `{ action: 'toggle', value: { cutaway } | { labels } | { crowding } }`, flagged `js/main.js` line 560 overwriting the §4.9 Express v2 legend on `?mode=express&scene=v2` boot, and noted three minor visual/CSS gaps under the closed `PLAN.md` §4.8 stylesheet.
- **Decision:**
  1. **Confirmed toggle payload shape:** `onAction` emits `{ action: 'toggle', value: { cutaway: bool } | { labels: bool } | { crowding: bool } }`; `StoryScene.setToggles(patch)` (`R3-R2`, ST5) shall accept partial toggle objects and merge them into current toggle state.
  2. **Boot legend guard:** Applied immediately in `js/main.js` (`if (app.sceneVersion !== 'v2') ui.setExpressLegend?.(EXPRESS_LEGEND);`) so `?mode=express&scene=v2` displays the §4.9 legend immediately on boot.
  3. **Closed-CSS design gaps:** Accepted all three as non-blocking for Gate G1 without mutating §4.8 CSS: (a) `"Step by step"` pill overflowing its 50% `.seg-thumb` by ~6–10 px beside `Speed` inside `div.group.row-between` (deferred to ST6 `R3-U2` / ST10 `R3-Q3` polish if a layout adjustment is approved); (b) inline `ol` list reset and `.chapter-row` `width: 100%` in `js/ui/view-story.js`; (c) mobile `PEEK_H = 112` showing line 1 of caption until expanded.
- **Impact:** Freezes the `view-story.js` ↔ `StoryScene` toggle interface ahead of ST5 `R3-R2`, fixes `?mode=express&scene=v2` legend rendering immediately, and preserves strict §4.8 CSS compliance for Gate G1.

## DEC-022: `8FZH` (`rf1`) `23S`-only superposition scope (extending `DEC-010`) and `ef-g` anchor definitions

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-A3.md`, `docs/assets/factors.md`, ST5 Argon independent review (`docs/reviews/R3-ST5-argon.md` §§1.2–1.4)
- **Context:** In `8FZH` (`rf1`), a +2.68% isotropic cryo-EM magnification offset relative to `7K00` pushes outer P atoms past the 2.0 Å iterative cutoff under `16S+23S`, leaving `2,069 / 4,272 = 48.4%` kept (failing `DEC-010` `≥ 50%`). Rigid `23S`-only superposition retains `2,195 / 2,753 = 79.7%` at `1.408 Å` RMSD, agrees with `16S+23S` within `0.738 Å` Cα RMSD, places `ggq` `5.961 Å` from `ptc`, and improves `codonReader (PAT)` → `siteA` codon alignment to `7.610 Å` (≤ 10 Å). Separately, *E. coli* EF-G (`7PJV` chain `x`, Met1 cleaved) carries a canonical Ala16 substitution in its Walker A P-loop (`AHIDAGKT`, author 16–23) and standard Domain IV core span `481–603` (UniProt P0A6M8 `482–604`).
- **Decision:**
  1. **Ratified `8FZH` (`rf1`) `23S`-only rigid superposition** (extending `DEC-010`; no isotropic rescaling). `9ZN2` (`if1`/`if2`) keeps literal `16S+23S` (`50.7%` kept, `1.291 Å` RMSD), preserving exact experimental `if1`–`if2` relative geometry (`0` clashes on `if2`, `if1` `12.290 Å` from `decoding`).
  2. **Ratified `ef-g` anchors:** `gDomain` = `AHIDAGKT` (author 16–23, `[GA]xxxxGK[ST]`, `15.313 Å` from 23S SRL, `6.576 Å` from GDP) and `domainIV` = author `481–603` (123 Cα atoms).
- **Impact:** All six ST5 factor assets (`rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`) pass both `DEC-010` gates and biological placement gates cleanly.

## DEC-023: `6CA0` as RPo open-promoter DNA track source for `rnap-holo`

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-A4.md`, `docs/assets/rnap.md`, ST5 Argon independent review (`docs/reviews/R3-ST5-argon.md` §2.3)
- **Context:** `PLAN.md` §§7.2 and 10 mention "6C9Y RPo DNA tracks", but `6C9Y.cif` is the DNA-free σ⁷⁰ holoenzyme (protein chains `A–F` only). The companion open-promoter complex from the same study (Narayanan et al., 2018) is PDB `6CA0` (already pinned in `tools/sources.lock.json`).
- **Decision:** **Ratified.** `rnap-holo` keeps `6C9Y` as its primary protein structure (preserving pre-ST5 L0, L1, and L2 byte-for-byte) and derives its RPo `template`/`nontemplate` tracks (`−45..+11`, open bubble `−11..+2`, max L1 penetration `0.95 Å ≤ 1.0 Å`) from `6CA0` superposed onto `6C9Y` on `β+β′` Cα (`83.9%` kept, `1.014 Å` RMSD ≤ 2.5 Å).
- **Impact:** Supplies real open-promoter DNA tracks for chapters 2–5 without modifying `rnap-holo`'s existing protein geometry.

## DEC-024: Exact coupling distance `D = 38` nt (`PLAN.md` §13 pre-approved fallback)

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-A4.md`, `docs/assets/rnap.md` §6.2, ST5 Argon independent review (`docs/reviews/R3-ST5-argon.md` §§2.1–2.2, L3)
- **Context:** Independent verification of `6ZTJ.cif` chain `AV` (continuous residues `14..53`, `label_seq_id === auth_seq_id`, 0 unmodelled in `[16, 53]`) confirms P-site `AUG` at `AV:16..18` and RNAP RNA 3′ end at `AV:53`, giving inclusive count `D = 53 - 16 + 1 = 38` nt (matching the `6ZTJ` PDB title verbatim). Although 2 nt below the illustrative 40–60 nt estimate in `PLAN.md` §6.4, `ribosome-70s` at `expressome` has zero steric clash with `rnap-ec` L1 (`7.389 Å`) or 248-bp DNA (`18.15 Å`), and `js/sim/gene/timeline.js` agrees algebraically with `24 + D = 62` nt with zero off-by-one discrepancy (`cycles = 39`, `remainingNt = 0`, `remainingCodons = 0`, total coupled duration `121.30 s`).
- **Decision:** **Ratified `D = 38` nt** per `PLAN.md` §13 (*"Use the computed `D` anyway if there is no clash"*), with zero synthetic offset, stored in `rnap-ec.source.coupling.D`. Flag Argon note L3 (`remainingCodons = 0` in ch 10–11, total duration `121.30 s`) for ST9 (`R3-S5` / `R3-V1`) caption verification.
- **Impact:** Freezes experimental `D = 38` and `expressome` / `coupledMrna` geometry for ST9 coupled mode.

## DEC-025: Backwards-compatible helper exports in R3-K2 kinematics (`chain.js`, `hairpin.js`)

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-K2.md`
- **Context:** `R3-K2` preserved all contracted W0 exports (`buildFreeChain`, `poseFreeChain`, `poseHairpin`, `posePeptideOnPath`) and added optional 4th argument `opts` on `poseHairpin(anchor, foldProgress, outFrames, opts = {})` plus named helper exports `generateTailControlPoints` (`js/kin/chain.js`) and `hairpinPairFold` (`js/kin/hairpin.js`) to support ST6 `R3-S3` progressive hairpin folding and deterministic mRNA tails.
- **Decision:** **Accepted.** Recorded as backwards-compatible additions available to ST6 `R3-S3` and ST7 `R3-K3`/`R3-S4`.
- **Impact:** Zero breaking contract change; simplifies ST6 transcription choreography.

## DEC-026: R3-R2 per-part transform frame and crowder `transforms` buffer layout

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-R2.md` (Design gaps & Requests)
- **Context:** `PLAN.md` §8.2–§8.4 leaves the frame convention of `spec.parts[partId].transform` and the 16-float matrix ordering of `viewer.setCrowd([{ assetId, transforms: Float32Array }])` implicit.
- **Decision:**
  1. **Per-part transform frame:** `spec.parts[partId].transform` (`{ o, R }`) is applied in the **actor's local frame** (prior to the actor's world transform) across that part's L0 mesh, L1 beads, and L2 atoms/bonds, keeping release offsets (e.g. σ⁷⁰ release in ST6 `R3-S3`) independent of actor world orientation.
  2. **Crowder buffer layout:** `transforms: Float32Array` holds 16 **column-major Three.js `Matrix4`** floats per instance (`THREE.Matrix4.toArray(buf, i * 16)`), matching `THREE.InstancedMesh.instanceMatrix` directly with zero per-frame transpose.
- **Impact:** Freezes exact conventions for ST6 `R3-S3` (`part.release`) and ST8 `R3-R4` (`js/scene/crowd.js`).

## DEC-027: ST6 Argon Pre-S3 rulings (C1–C6) for transcription choreography

- **Date:** 2026-11-20
- **Source:** `docs/reviews/R3-ST6-argon.md`, `docs/handoffs/R3-S3.md`
- **Context:** Before `R3-S3` started, Argon audited the brief against `PLAN.md` §5.3 and the K1/K2/S2 APIs, discovering six concrete hazards: (C1) a 55.20 Å downstream DNA jump when `poseDuplex` switches its downstream anchor `C1` from `rnap-holo` (`r1 = 11`) to `rnap-ec` (`r1 = 13`) at `trackBlend: 0 → 0+`; (C2) missing `tracks.rna` / `anchors.rnaExit` / `anchors.hairpin` on `rnap-holo` and inward-pointing default `rnaExit.R`; (C3) 675-nt `Assembly` topology and `PPI_TEMPLATE` constant import; (C4) register stepping (`45 + n - 1 → min(223, 45 + n)`), frozen register-223 relaxation in Chapter 7, and active slot-track scope for §5.3 item 8; (C5) a 1.48 Å clash between nascent RNA (`registers -6..-10`) and the $\sigma_{3.2}$ finger prior to `part.release`; and (C6) a 1.61 Å NTP triphosphate swing clash in `rnap-ec`'s secondary channel.
- **Decision:** **Ratified C1–C6** as implemented in `R3-S3` (`js/sim/gene/transcription.js`, `js/kin/ntp.js`, `js/kin/pose.js`): bound RNAP transforms always derive from `machinePoseForRegister(rnapEcRef, reg)` with `effectiveTrackBlend = Math.max(1e-6, world.dna.trackBlend ?? 0)` in `pose.js` (keeping `world.dna.trackBlend = 0` in `WorldState` per `DEC-007`), `tracks.rna`/`rnaExit`/`hairpin` fall back to `assets['rnap-ec']` with outward 5′ free-chain exit tangent, two-stage local-frame $\sigma^{70}$ displacement along `U_SIGMA = [-0.797, -0.518, 0.309]` (`0 → 12 Å` then `12 → 60 Å` with visual-only `sigma-release` companion across `trackBlend = 0.5`), and heavy-atom centroid-guided `poseNtp` along the secondary-channel ray.
- **Impact:** Guarantees `<= 6.93e-4 Å` downstream DNA drift, `maxDnaPen = 0.956 Å`, `maxRnaPen = 0.459 Å`, `maxNtpPen = 0.063 Å` (all `<= 1.0 Å`), and `0.57 ms/frame` pose time across all 448 sample times of Chapters 1–7.

## DEC-028: Identity `Viewer.root` axis (`asm.meta.axis`) and `'gene-expression'` strand palette

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-S3.md` (Design gaps), `R3-INT2` integration
- **Context:** `Viewer.computeOrientation(asm)` rotates `Viewer.root` so the principal axis of `asm` aligns with screen `+Y` (vertical single-helix convention for Round 1 Explore/Pairs/Melt modes). Round 3 `StoryScene`, `CameraRails`, `selectLabels`, and `poseDuplex` all operate in the `PLAN.md` §6.2–§6.3 world frame (`+x` horizontal gene, `+y` up, `+z` toward viewer). In addition, `initStoryAssembly` tagged `asm.meta.kind = 'gene-expression'` while `ColorModel.compute` checked only `'expression'`.
- **Decision:**
  1. `initStoryAssembly` (`js/kin/pose.js`) sets `asm.meta.axis = [[0, -0.5, 0], [0, 0.5, 0]]`, keeping `Viewer.root` at identity so procedural nucleotides, machine actors, atom groups, FX, labels, and `CameraRails` share one 1:1 world coordinate frame with zero impact on Round 1 modes.
  2. `ColorModel.compute` (`js/render/colors.js`) treats both `'expression'` and `'gene-expression'` as using `EXPRESSION_HEX` (`#7c93c3` coding DNA, `#9fb2dc` template DNA, `#2fd9b9` mRNA, `#ffd43b` tRNA anticodon), and `Viewer.tick` (`js/render/viewer.js`) includes `dist * 0.35` in the fog radius `R` so wide overview shots (`dist > 1000 Å`) do not haze out the 840-Å gene.
- **Impact:** Clean 1:1 world alignment and exact `PLAN.md` §4.3 palette across `StoryScene` and `dev/story-lab.html`.

## DEC-029: Standalone idempotent `boot()` guard and concurrent `smoke.browser.mjs` module check

- **Date:** 2026-11-20
- **Source:** `R3-INT2` Gate G2 smoke validation
- **Context:** In `dist/helix-standalone.html`, the inline entry `<script type="module">` runs `boot()`, while `tests/smoke.browser.mjs` later dynamically imports every module in `js/` (including `https://helix.local/js/main.js`) through the importmap's `data:text/javascript;base64,...` URLs. Re-importing `js/main.js` ran `boot()` a second time (spawning a duplicate WebGLRenderer), and importing 45 `data:` modules sequentially yielded to SwiftShader's software rAF loop between every module (`~70–90 s` overhead).
- **Decision:**
  1. Guard `boot()` in `js/main.js` with `if (!window.helix) boot();` so dynamic re-import of `js/main.js` is idempotent.
  2. Use `Promise.all` inside `checkModuleImports` in `tests/smoke.browser.mjs` while preserving per-module failure reporting and root-cause dependency filtering.
  3. Stabilize `tests/kin-duplex.test.mjs:445` against V8 young-gen nursery sawtooth by combining median and net 20,000-call average growth (retaining `<= 1 MiB` bound; verified `18.4 KiB` retained under `--expose-gc`).
- **Impact:** Reliable, fast `SMOKE PASS` and `284/284` unit test pass across both HTTP and offline standalone builds.

## DEC-030: ST8 audit rulings: label policy, chapter-1 holoenzyme, ribosome cutaway, chapter-8 clearance

- **Date:** 2026-11-20
- **Source:** `docs/reviews/R3-ST8-audit.md` (findings F01–F05, S-01–S-03), `docs/handoffs/R3-INT3.md`
- **Context:** The stage-wide audit before ST9 found that (a) the cutaway never opened the ribosome because `actorMatchesCutaway` read `cut.kind` (always `'anchor'`) instead of `cut.machineId`; (b) the mRNA in the 30S track penetrated L1 beads by up to 2.1 Å in chapter 8 (§5.3 item 8) because the clearance guard ran only when `ribosome.bound`, and the item-8 test skipped every unbound sample; (c) chapter 1 showed no holoenzyme although §6.1 row 1 says "holoenzyme 400 Å away"; (d) the six-tag cap starved `EF-Tu`, `EF-G`, `UAA` for whole chapters, and the `SD`/`AUG`/`UAA` tags were drawn on the DNA, about 400 Å from the ribosome.
- **Decision:**
  1. `actorMatchesCutaway` selects the machine from `cut.machineId`. The `ribo-decode`, `ribo-ptc` and `ribo-tunnel` cutaways now open the ribosome.
  2. The mRNA clearance guard in `js/kin/pose.js` runs whenever the ribosome machine is in the scene. `tests/story-tl.test.mjs` item 8 has no `bound` gate and asserts that every chapter 8–16 is sampled.
  3. Chapter 1 shows the holoenzyme at full opacity 400 Å from its bound pose along the old approach direction; chapter 2 moves it in (`js/sim/gene/transcription.js`).
  4. Label policy (PLAN §4.6 amendment): no `σ⁷⁰` tag in chapter 1; no `mRNA 5′`/`3′` tags in chapters 11–15; `SD`, `AUG` and `UAA` sit on mRNA codons once the ribosome is present.
  5. Wording corrections (PLAN §5.2, §5.4 and the matching `js/ui/inspect.js`, `tests/ui-inspect.browser.mjs`, `js/ui/about.js`): RNAP DNA provenance (6CA0 for the promoter DNA, 6ALF for elongation), DNA rotation is not "twin-domain", IF1/IF2/IF3 get their own role sentences, "anticodon loop" becomes "anticodon (nt 34–36)", and the About sheet describes construct v3.
  6. `PLAN.md` §2 D13 and §6.4 now state D = 38 nt (DEC-024) and about 121 s for Coupled mode.
- **Impact:** All §5.3 items pass for chapters 8–16 with real sampling. Caption wording changes (S-06 to S-09, S-13) are proposed in the science review but not applied, because §6.2 captions are locked product copy.

## DEC-031: INT3 phone peek height and focus rings

- **Date:** 2026-11-20
- **Source:** `docs/handoffs/R3-U3.md` Requests 1–4
- **Decision:** `PEEK_H` in `js/ui/sheet.js` rises from 112 to 144 so the two-line caption is no longer cut off by the tab bar (the unused `--peek-h: 108px` token is unchanged, as §4.8 requires). Controls hidden in the collapsed sheet get `visibility: hidden` as well as `opacity: 0`, so keyboard focus no longer lands on invisible controls. The grip is 28 px high and `.pep-pill` 24 px high. `.chapter-list` and `.views` get 4 px of padding so focus rings are not clipped.
- **Impact:** `tests/ui-phone.browser.mjs` known defects drop from 43 to 2 (three chapter-row focus rings on desktop and one grip ring on phone are still clipped by their scroll containers; both are listed in `docs/handoffs/R3-INT3.md`).

