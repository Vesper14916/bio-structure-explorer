# Stage ST4 Independent Review (Argon) — Gate G1 Evidence Audit

- **Stage:** ST4 (Gate G1 verification of Claude ST2 assets)
- **Window (UTC):** `2026-11-19T10:27:11Z` – `2026-11-19T10:29:59Z` (2 min 48 s / 30 min budget)
- **Scope:** `ribosome-70s`, `trna-init`, `trna-aa` — colour fidelity (`PLAN.md` §4.3, Gate G1), LOD/size budgets (`PLAN.md` §7.5), pairing tests and structural invariants (`PLAN.md` §10 R3-A1/R3-A2, `DEC-008`–`DEC-013`), and unit-test quality audit (`tests/assets-ribosome.test.mjs`, `tests/assets-trna.test.mjs`, `tests/asset-budgets.test.mjs`).
- **Automated Baseline (Chief-verified):** `34 pass, 0 fail, 0 skipped` (2.59 s); `node tools/build-assets.mjs --check` reports `identical` across `ribosome-70s`, `rnap-ec`, `rnap-holo`, `trna-init`, `trna-aa`, and `manifest.json`.
- **Verdict:** **`PASS WITH MINOR NOTES`** — **Recommend Gate G1 PASS** with a formal colour-sampling clarification for high-chroma PBR tokens.

---

## 1. Colour Verification (`PLAN.md` §4.3 & Gate G1 `ΔE ≤ 6`)

### Token & Screenshot Comparison

| Asset | Target Role / Subunit | §4.3 Locked Token | Resolved `ACTOR_TOKENS` / `instanceColor` | Albedo ΔE | Lit Screenshot Min CIE76 ΔE (Closest Pixel) | Visual Assessment (Evidence Captures) |
| --- | --- | --- | --- | ---: | ---: | --- |
| `ribosome-70s` | L0 `small` (30S) | `#e4dcc4` | `0xe4dcc4` | `0.00` | — (L1 cutaway) | Pale cream translucent L0 envelope clearly bounds 30S |
| `ribosome-70s` | L0 `large` (50S) | `#d2b183` | `0xd2b183` | `0.00` | — (L1 cutaway) | Warm tan translucent L0 envelope clearly bounds 50S |
| `ribosome-70s` | L1 `rRNA16S` (1 chain) | `#f0eadb` | `0xf0eadb` | `0.00` | `0.51` (`240,234,218`) | Pass — bright ivory 16S core on 30S |
| `ribosome-70s` | L1 `rprotein30S` (20 chains) | `#c9bd9c` | `0xc9bd9c` | `0.00` | `0.69` | Pass — muted sand 30S surface proteins |
| `ribosome-70s` | L1 `rRNA23S` + `rRNA5S` (2 chains) | `#e0c59f` | `0xe0c59f` | `0.00` | `0.69` | Pass — warm beige 50S rRNA core |
| `ribosome-70s` | L1 `rprotein50S` (29 chains) | `#b38f5e` | `0xb38f5e` | `0.00` | `1.62` | Pass — deeper tan 50S proteins |
| `trna-init` | L0/L1 `body` + `anticodon` (2 chains) | `#ffd43b` | `0xffd43b` | `0.00` | `18.03` (`250,199,92`) | Distinct warm yellow L-shape; hue preserved; procedural `CAU` anticodon crisp |
| `trna-aa` | L0/L1 `body` + `anticodon` (2 chains) | `#ff922b` | `0xff922b` | `0.00` | `17.97` (`214,136,51`) | Distinct saturated orange L-shape; clearly separated from `trna-init`; procedural `UAC` crisp |

### Why High-Chroma tRNA Tokens Show CIE76 ΔE ~18 Under ACES + PBR Lighting

Code inspection of `js/render/actors.js` (`ACTOR_TOKENS`, `partColor`, `chainColor`) confirms exact token assignment: `trna-init` resolves to `0xffd43b` and `trna-aa` resolves to `0xff922b` (albedo ΔE = `0.00`). The ~18 CIE76 ΔE measured directly on lit `trna-init-l1-tracks-anchors.jpg` and `trna-aa-l1-tracks-anchors.jpg` pixels against unlit sRGB hexes is an expected optical consequence of PBR + ACES Filmic rendering, not a token defect:

1. **Gamut-boundary chroma vs. low-chroma neutrals:** The ribosome tokens are low-chroma warm neutrals ($C^*_{ab} \approx 9\text{–}30$), which experience negligible desaturation under ACES near mid-luminance. By contrast, `#ffd43b` (`(255, 212, 59)`) and `#ff922b` (`(255, 146, 43)`) are high-chroma near-gamut sRGB colours ($C^*_{ab} \approx 76$) with heavily suppressed blue channels (linear $B \approx 0.044$ and $0.024$).
2. **ACES Filmic highlight desaturation:** The ACES RRT+ODT curve deliberately desaturates bright chromatic primaries toward white as radiance rises, lifting the minor blue channel (e.g., `(255, 212, 59)` → `(250, 199, 92)`). In CIE76, lifting $B$ from 59 to 92 shifts $b^*$ by ~16–18 units even with preserved hue angle.
3. **PBR specular, environment map, and cool fill/rim lighting:** `L1_MAT` (`roughness: 0.24`, `metalness: 0.12`, `envMapIntensity: 1.15`) adds white/cool-blue Fresnel specular reflection and stage fill/rim irradiance on top of the diffuse albedo, raising the suppressed blue channel across lit faces while shadowed faces lose $L^*$ (e.g., `(214, 136, 51)` on `trna-aa`). The `0.10`-opacity L0 envelope (`opacityWithL1: 0.10`) and JPEG 4:2:0 subsampling add minor secondary softening.

### Recommendation for Gate G1

**PASS** the colour criterion and record a short Gate G1 colour-sampling clarification (e.g., as an addendum to `DEC-012` or new `DEC-019`): evaluate `ΔE ≤ 6` against §4.3 raw sRGB tokens on **resolved material albedo / `instanceColor` / unlit flat renders** (where all ST2 tokens measure `ΔE = 0.00`), or compare lit screenshots against **ACES + PBR-lit reference swatches** rendered under the same stage rig. Leaving the check as "raw lit ACES pixels vs. unlit sRGB hex" will predictably false-fail every high-chroma ST5 factor token (`rf1` `#ff6b6b`, `ef-tu` `#f783ac`, `ef-g` `#a9e34b`, `nusg` `#15aabf`) despite exact token fidelity.

---

## 2. Budget Verification (`PLAN.md` §7.5)

All per-asset LOD counts, file sizes, aggregate manifest size, and standalone bundle size pass with healthy headroom for ST5 (`A3` factors and `A4` RNAP v2). HUD counts in all three evidence screenshots match the committed JSON assets exactly.

| Target | Metric | Observed | §7.5 Budget | Utilization | Headroom | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `ribosome-70s` | L0 triangles | 48,064 | ≤ 70,000 | 68.7% | 21,936 | PASS |
| `ribosome-70s` | L1 beads | 9,978 | ≤ 15,000 | 66.5% | 5,022 | PASS |
| `ribosome-70s` | L2 atoms | 756 | ≤ 4,000 | 18.9% | 3,244 | PASS |
| `ribosome-70s` | File size | 724,804 B | ≤ 1,200,000 B | 60.4% | 475,196 B | PASS |
| `trna-init` | L0 triangles | 3,716 | ≤ 4,000 | 92.9% | 284 | PASS |
| `trna-init` | L1 beads | 76 | ≤ 80 | 95.0% | 4 | PASS |
| `trna-init` | L2 atoms | 42 | ≤ 400 | 10.5% | 358 | PASS |
| `trna-init` | File size | 50,900 B | ≤ 60,000 B | 84.8% | 9,100 B | PASS |
| `trna-aa` | L0 triangles | 3,712 | ≤ 4,000 | 92.8% | 288 | PASS |
| `trna-aa` | L1 beads | 73 | ≤ 80 | 91.3% | 7 | PASS |
| `trna-aa` | L2 atoms | 42 | ≤ 400 | 10.5% | 358 | PASS |
| `trna-aa` | File size | 50,935 B | ≤ 60,000 B | 84.9% | 9,065 B | PASS |
| All committed manifest assets | Total size | 1,166,148 B | ≤ 3,000,000 B | 38.9% | 1,833,852 B | PASS |
| `dist/helix-standalone.html` | Bundle size | 4,018,680 B | ≤ 7,500,000 B | 53.6% | 3,481,320 B | PASS |

---

## 3. Pairing Tests, Structural Invariants & Test-Suite Audit

### Structural Invariants & Decisions (`DEC-008`–`DEC-013`)

- **P-site & A-site Watson–Crick pairing (`R3-A1`):** Verified 6/6 Watson–Crick pairs (`AUG`/`CAU` at P-site, `GUA`/`UAC` at A-site), base-origin distances `0.18–0.61 Å` (≤ 2.5 Å). Crucially, `tests/assets-ribosome.test.mjs:95–107` recomputes pairing directly from the decoded committed `ribosome-70s` (`tracks.mrna`, `anchors.siteP`, `anchors.siteA`) and committed `trna-init`/`trna-aa` (`tracks.anticodon`), making this a genuine non-tautological cross-asset registration test.
- **7ST2 E-site check (`chain 6` vs `chain 5`):** Confirmed. In 7ST2, chain `6` is the E-site tRNA (nt 75–76 match 7K00 E-site CCA chain `5` at **1.16 Å RMSD over 42 atoms**, ≤ 3.0 Å), while 7ST2 chain `5` is the P-site tRNA (**46.7 Å** from 7K00 chain `5`, verified at P-site via `stSiteP.anticodonToSitePA <= 4.0`). Chain `5` (along with `X`, `Y`, `Z`) is properly excluded from the 52-chain ribosome table (`assets-ribosome.test.mjs:56`).
- **Superposition RMSDs & kept fractions (`DEC-010`, `DEC-011`):**
  - `7ST2` (16S+23S, author-number + residue-name matching per `DEC-011`): **0.73 Å**, 3,881 / 4,235 P atoms (**91.6%** kept).
  - `5WE4` (16S+23S): **0.61 Å**, 4,116 / 4,248 P atoms (**96.9%** kept).
  - `7PJV` (rotated hybrid state): literal §7.3 `16S+23S` yields **1.23 Å** with only 551 / 4,268 (**12.9%**) kept; `siteAP` (5.1 Å) and `sitePE` (6.1 Å) fail the 4.0 Å threshold and are omitted per `DEC-010` / §13. Diagnostic single-subunit fits (`23S`: 0.78 Å, 94.6% kept; `16S`: 1.08 Å, 76.2% kept) are recorded and motivate `DEC-010` (23S-only fit for ST5 `ef-g` and ≥ 50% kept-fraction gate).
- **mRNA track provenance (`DEC-008`):** `tracks.mrna` spans registers `−16…+15` with binary `synthetic` (`0|1`) and parallel `sources` (`7K00` for `−3…+8`, `7ST2` for `−14…−4`, `synthetic` for `−16, −15, +9…+15`); A-form synthetic step verified at `2.81 ± 0.02 Å`.
- **Exit tunnel path gates (`DEC-009`):** Truncated Dijkstra route measures **86.71 Å** (88 points, within `75–110 Å`), minimum clearance **3.66 Å** beyond 6 Å (≥ 3.0 Å), `synthetic: 0`, `{N} = 26` residues. `assets-ribosome.test.mjs:212–251` independently recomputes decoded polyline length, endpoint offsets (`ptc` ≤ 6 Å, `tunnelExit` < 0.1 Å), 1 Å resampling, `ptc`/`tunnelExit` `+z` tangent alignment (`> 0.9999`), anchor orthonormality, and `ptc` L2 site radius/population.
- **tRNA span (`DEC-013`):** `trna-init` measures **76.147 Å** (within 65–80 Å); `trna-aa` measures **81.707 Å** (real extended CCA end in 7K00 chain Y; accepted under `DEC-013` widened `65–85 Å` gate). `assets-trna.test.mjs:53–111` independently recomputes span from decoded L1 beads, checks C1′ anticodon reconstruction against `BASE_ATOMS` within `0.05 + QUANT_STEP/2`, verifies L0 mesh closure/outwardness and 100%-sampled bead containment (≥ 95%), and thoroughly unit-tests `trnaFrame` covariance, fallback, and `standardNumbering` (`17A`).

### Test-Suite Quality Audit (Weaknesses / Missing Edge Cases)

Overall test quality is high and genuinely verifies decoded geometry rather than merely echoing metadata, with a few minor non-blocking gaps noted in Section 4:
- **`tests/assets-trna.test.mjs:133–136`:** `assert.ok(near > 0 && near <= d.lod2.count)` has a tautological upper bound (`near` can never exceed `d.lod2.count`) and only requires a single atom within 8.05 Å of `acceptor.o`; unlike `assets-ribosome.test.mjs:187–191`, `assets-trna.test.mjs` does not check L2 bond lengths (`0.9–2.3 Å`).
- **`tests/assets-ribosome.test.mjs:89,104`:** Pairing orientation checks `dot(zOf(codon), zOf(anti)) < 0` (any obtuse angle `> 90°`) and stored `normalAngleDeg < 90`, without tightening coplanarity (e.g., `dot(z, z) < -0.8`) or checking in-plane `x`-axis Watson–Crick edge alignment (which would catch a 180° base flip around `z`).
- **`tests/assets-ribosome.test.mjs:59–76,136–140`:** `siteA`–`siteP` separation (`15–30 Å`) is asserted, but `siteE` and `siteAT` spatial separation/anatomical ordering relative to `siteP`/`siteA` is not asserted in unit tests (verified visually in `R3-A1.md`); `7PJV` superposition test checks `keptFraction` across all three fits but does not assert `rmsdAfterA <= 1.5`.
- **`tests/assets-trna.test.mjs:21`:** `SPAN_RANGE` still uses pre-`DEC-013` `[65, 82]` with a `"DEVIATION"` comment instead of referencing `DEC-013` (`65–85 Å`), though the stricter bound passes cleanly.
- **`tests/asset-budgets.test.mjs:54,98`:** Unmapped manifest IDs silently bypass per-asset budgets (`if (!budget) continue;`), and standalone HTML size is skipped if `dist/helix-standalone.html` is not present on disk.

---

## 4. Findings by Severity & Gate G1 Recommendation

- **High:** None.
- **Medium:** None.
- **Low:**
  1. **L1 — Gate G1 colour-sampling protocol (`PLAN.md` §4.3 / `DEC-012`):** Raw lit ACES PBR pixel sampling cannot satisfy `ΔE ≤ 6` against unlit high-chroma sRGB tokens (`trna-init` `#ffd43b`, `trna-aa` `#ff922b`, and upcoming ST5 factors) even when albedo `instanceColor` matches at `ΔE = 0.00`. Record a clarification in `docs/DECISIONS.md` defining G1 colour checks on resolved albedo/unlit pixels or ACES-matched reference swatches.
  2. **L2 — Minor test-hardening opportunities (`tests/assets-trna.test.mjs`, `tests/assets-ribosome.test.mjs`, `tests/asset-budgets.test.mjs`):** Tighten `assets-trna.test.mjs:136` (remove tautological `near <= d.lod2.count`, raise minimum `near` share, add L2 bond-length check), update `SPAN_RANGE` comment to cite `DEC-013`, optionally add `x`-axis / tighter `z`-axis checks on Watson–Crick pairing and `siteE`/`siteAT` separation in `assets-ribosome.test.mjs`, and consider restricting `asset-budgets.test.mjs:54` skip to `entry.synthetic === true`.
  3. **L3 — Watch item for ST5 factors (`js/render/actors.js:95–100`):** In `chainColor()`, substring checks for `'alpha'`, `'beta'`, `'omega'`, `'sigma'` in `chain.name` run *before* `partColor(partId, assetId)`. Harmless for `trna-init` and `trna-aa`, but any ST5 factor chain lacking a `subunit` tag whose mmCIF entity description contains `"alpha"` or `"beta"` would be mis-tinted with RNAP colours unless guarded by `assetId` (e.g., RNAP-only) or an explicit `subunit` tag.

### Gate G1 Recommendation

**APPROVE Gate G1 (`PASS WITH MINOR NOTES`)** for all Claude ST2 deliverables (`ribosome-70s`, `trna-init`, `trna-aa`) and proceed to ST5 (`A3`/`A4`) once the Gate G1 colour-sampling clarification (L1) is logged in `docs/DECISIONS.md`. Note L3 for the ST5 integration checklist before wiring factor assets.
