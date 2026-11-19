# Stage ST2 design: ribosome and tRNA assets (Claude, part C1)

Owner: Claude (stage design and integration). Base: tag `r3-w0` (`39777e1`). Branch: `claude/bold-mayer-j248mg`.
Tasks: R3-A2 (tRNA assets) and R3-A1 (ribosome asset), `PLAN.md` §7 and §10. This file records the stage design, the facts measured on the source files before implementation, and the interpretations taken where the plan is ambiguous. Each interpretation is repeated in the asset docs.

## 1. Execution order inside the stage

All steps run in series on one checkout. Haiku helpers run in parallel only in step 5.

| Step | Executor | Scope |
| --- | --- | --- |
| 1 | Sonnet | A2: `tools/assets/trna.mjs` (exports `trnaFrame`), `trna-init`, `trna-aa`, tests, `docs/assets/trna.md` |
| 2 | Sonnet | A1 part 1: `ribo` frame, chain table, parts, L0/L1/L2, superpositions, `mrna` track, site anchors, `frameAtoms` |
| 3 | Sonnet | A1 part 2: `tunnel` path, `ptc` and `tunnelExit` anchors, budgets, tests, `docs/assets/ribosome-70s.md` |
| 4 | Claude | Review, fixes, full gates |
| 5 | Haiku (parallel) | Evidence screenshots; budget and chain-table cross-checks |
| 6 | Claude | Handoffs `docs/handoffs/R3-A1.md`, `R3-A2.md`; push |

A2 runs before A1 because `siteA`, `siteP` and `siteE` are defined as `trna` frames, so A1 must call the same `trnaFrame` function that A2 uses to store the tRNA assets. Placing a tRNA asset at a site anchor then reproduces the source coordinates exactly.

## 2. Measured facts (2026-11-19, files pinned in `tools/sources.lock.json`)

7K00 (149,338 heavy atoms including waters, parse ≈ 1 s):
- 16S `A` (label 2–1534 = author 2–1534); 23S `a`; 5S `b`; 30S proteins `B`–`U` (S2–S21); 50S proteins `c`–`z`, `0`–`4` (L2–L36; `4` is L31, `h` is L9 with 41 residues).
- mRNA `X`: author 13–24 = `AAAAUGGUAUAA`. P-site codon `AUG` = author 16–18; A-site codon `GUA` = 19–21; E-site codon `AAA` = 13–15.
- tRNA `Z` (P site, tRNA-fMet): anticodon 34–36 = `CAU`. Author numbering is standard tRNA numbering with one insertion residue (two residues have author number 17). Use label_seq_id as the residue key and author number (with `A` suffix for the second of a duplicate) as the standard number.
- tRNA `Y` (A site, tRNA-Val): anticodon 34–36 = `UAC`; nucleotides 16–17 are not modelled.
- E-site fragment `5`: author 75–76 (`C`, `A`) only.
- **The 16S chain ends at 1534. The anti-SD nucleotides 1535–1540 are not modelled in 7K00.**
- Non-polymers: paromomycin (dropped), Mg²⁺, Zn²⁺, spermidine, spermine (dropped), water (dropped).

7ST2 (post-translocation, non-rotated):
- 16S `3` with **label 1–1539 = author 2–1540 (label is author − 1)**; 23S `1`; 5S `2`.
- tRNA `6` = tRNA-fMet, anticodon `CAU` (expected E site); tRNA `5` = tRNA-Pro, anticodon `UGG` (expected P site, codon `CCA`).
- mRNA `4`: author 5–23 = `AGGAGGUAAAAAUGCCAAG`. With the P-site codon `CCA` at author 19–21, register 0 = author 19, so the chain covers registers −14…+4. Its SD `GGAGG` sits at registers −13…−9.
- 16S author 1535–1540 = `CCUCCU` (the anti-SD) is modelled here.

5WE4: 16S `a`, 23S `A`, 5S `B`, mRNA `x` (author 13–24), A/T Phe-tRNA `y`, tRNA-fMet `v` and `w`, EF-Tu `z`.
7PJV: 16S `a`, 23S `A`, 5S `B`, mRNA `z`, tRNA `v` (tRNA-fMet, expected P/E), tRNA `w` (fMet-Phe-tRNA-Phe, expected A/P), EF-G `x`.

tRNA bodies contain modified nucleotides (for example `H2U`, `4SU`). `residueBase` returns null for them. Use base-frame fitting only for 34–36 and the mRNA, where all residues are standard; use P atoms for L1 everywhere.

## 3. Rules that apply to every step

- Load sources only with `ctx.loadSource(pdbId)` (`docs/CONTRACTS.md` §7.1).
- **rRNA matching for superposition uses author numbering, not label_seq_id**, because 7ST2's 16S is offset by one. Match P atoms of 16S and 23S residues that have the same author number in both entries and the same residue name. Report the count of name mismatches excluded. Then call `superposeIterative(mobile, target, { cutoff: 2.0, passes: 2 })` and record `n`, `rmsdBefore`, `rmsd`. Gate: `rmsd ≤ 1.5 Å`.
- Write all assets as `version: 2`. Round coordinates as in `tools/assets/rnap.mjs` (`r3` for positions, `r6` for rotations).
- Every anchor frame `{ o, R }` must be orthonormal (validator tolerance 1e-4).
- The asset frames:
  - `ribo` (`PLAN.md` §7.3): origin = centroid of C1′ of `X` 16–18; +z = unit vector to the centroid of C1′ of `X` 19–21; +x = component of (centroid of all 23S P atoms − origin) perpendicular to z; +y = z × x.
  - `trna` (§7.3): origin = centroid of C1′ of nucleotides 34–36; +z = unit vector to the P atom of nucleotide 76 (or the last modelled 3′ nucleotide, recorded); +x = component of (centroid of all P atoms − origin) perpendicular to z; +y = z × x.
- `trnaFrame(residuesByStandardNumber)` is exported from `tools/assets/trna.mjs` and is the only implementation of the `trna` frame.

## 4. A2 design (step 1)

- `trna-init` from 7K00 `Z`; `trna-aa` from 7K00 `Y`. Coordinates in the tRNA's own `trna` frame.
- Parts: `body` (role `body`) and `anticodon` (role `replaceable`). Chains: two entries per asset, `{ id: 'Z', part: 'body' }` and `{ id: 'Z-ac', part: 'anticodon' }` (likewise `Y`, `Y-ac`), class `rna`. L1: one P bead per nucleotide (kind 1), chain index by part.
- L0: one envelope per part from P beads plus C4′ and N1/N9 atoms of every nucleotide (so the envelope covers the bases). Start at `sigma 3.5`, `spacing 2.5`; require ≥ 95 % containment of the L1 beads, a closed outward mesh, and ≤ 4,000 triangles in total. Record the parameters used.
- L2 site `acceptor`, radius 8 Å: heavy atoms of whole nucleotides with any atom within 8 Å of the anchor origin.
- Anchors: `center` (centroid of P atoms, identity rotation), `acceptor` (o = O3′ of A76; z = unit(O3′ − C3′); x = perpendicular component of the `trna` +x; y = z × x), `elbow` (o = centroid of all heavy atoms of 18, 19, 55, 56; R = identity).
- Track `anticodon`: kind `rna`, registers 34, 35, 36, frames fitted with `fitBaseFrame`, `synthetic` all 0, bases `CAU` (init) and `UAC` (aa).
- Source block: 7K00 primary; `chainsUsed`; `notes` include the numbering map, the insertion residue, and the modified nucleotides kept in L1/L2 but not fitted.
- Tests (`tests/assets-trna.test.mjs`): both assets validate; anticodon bases `CAU` and `UAC`; anticodon origin to the A76 P atom distance 65–80 Å; budgets (L0 ≤ 4,000 triangles, L1 ≤ 80 beads, L2 ≤ 400 atoms, file ≤ 60 kB); the anticodon track frames reproduce the source C1′ positions after applying the inverse frame (≤ 0.05 Å plus quantisation); `npm test` stays green.

## 5. A1 design (steps 2 and 3)

### 5.1 Chains, parts, levels of detail
- Parts `small` (16S and S proteins) and `large` (23S, 5S and L proteins), role `body`. Chain `subunit` tags `rRNA16S`, `rprotein30S`, `rRNA23S`, `rRNA5S`, `rprotein50S`. Chain names from the entity description. mRNA, tRNA and E fragment chains are excluded from parts.
- L1: P beads for RNA (kind 1), Cα beads for protein (kind 0).
- L0: one envelope per part from all L1 beads. Start `sigma 5`, `spacing 4`, `maxTriangles 30000` per part; ≥ 95 % containment; closed outward mesh. If the file budget fails, step spacing to 5 Å (`PLAN.md` §13).
- L2 sites `decoding` and `ptc`, 12 Å each: heavy atoms of whole residues (rRNA and protein, both parts) with any atom within 12 Å of the anchor origin, deduplicated across the two sites, plus Mg²⁺ ions within 8 Å of either site origin. Bonds by covalent radii within a chain and across consecutive residues (reuse the rule in `rnap.mjs`, extended with RNA: P–O3′ across residues).

### 5.2 Superpositions (each recorded with n, RMSD before and after)
| Mobile | Reference | Use |
| --- | --- | --- |
| 7ST2 (`3`, `1`) | 7K00 (`A`, `a`) | `siteE` from tRNA `6`; `mrna` registers −14…+4 from chain `4`; `antiSD` from 16S 1535–1540 |
| 5WE4 (`a`, `A`) | 7K00 | `siteAT` from tRNA `y` |
| 7PJV (`a`, `A`) | 7K00 | `siteAP` from tRNA `w`, `sitePE` from tRNA `v`, each only if its condition holds |

Pre-check by the stage lead (scratch script, P atoms matched by author number and residue name, `superposeIterative` 2.0 Å, two passes):

| Mobile | Atoms before → after trim | RMSD before → after | Note |
| --- | --- | --- | --- |
| 7ST2 on 16S + 23S | 4,235 → 3,881 | 1.24 → 0.73 Å | 35 name mismatches excluded |
| 5WE4 on 16S + 23S | 4,248 → 4,116 | 1.00 → 0.61 Å | 21 name mismatches excluded |
| 7PJV on 16S + 23S | 4,268 → **551** | **5.54** → 1.23 Å | 7PJV is a rotated (hybrid-state) ribosome; one rigid fit cannot match both subunits |
| 7PJV on 23S only | 2,749 → 2,600 | 1.22 → 0.78 Å | anticodon of `w` 8.7 Å from `siteA`; of `v` 9.2 Å from `siteP` |
| 7PJV on 16S only | 1,519 → 1,158 | 1.83 → 1.08 Å | anticodon of `w` 1.1 Å from `siteA`; of `v` 0.8 Å from `siteP` |

7ST2 tRNA `6` nucleotides 75–76 vs 7K00 chain `5`: 1.16 Å RMSD over 42 atoms (E site confirmed); tRNA `5`: 46.7 Å.

**Decision for `siteAP` and `sitePE`:** apply the plan rule as written (16S + 23S fit). With it the anticodon distances are 5.1 Å (`w` to `siteA`) and 6.1 Å (`v` to `siteP`), both above 4.0 Å, so both anchors are omitted and the story interpolates directly between classic sites (`PLAN.md` §7.4 and §13, pre-approved). Record all three fits above in `source.superpositions` and in `docs/assets/ribosome-70s.md`. The 7PJV fit passes the 1.5 Å RMSD gate only because 87 % of the atoms were trimmed; flag this to the Chief as a request: task A3 takes EF-G from 7PJV and needs a decision on which subunit to fit (proposal: 23S only, plus a minimum kept fraction of 50 % in the superposition gate).

The E-site identity check (acceptance): after superposition, heavy atoms of nucleotides 75–76 of 7ST2 tRNA `6` (matched by atom name) lie within 3.0 Å RMSD of 7K00 chain `5`. If tRNA `6` fails and tRNA `5` passes, use `5` and record it; if both fail, stop and report (`PLAN.md` §13 fallback: 8FZH).

### 5.3 Site anchors
- `siteP` = `trnaFrame` of 7K00 `Z`; `siteA` = of 7K00 `Y`; `siteE` = of 7ST2 E tRNA (superposed); `siteAT` = of 5WE4 `y` (superposed).
- `siteAP` = of 7PJV `w`, kept only if its anticodon origin is within 4.0 Å of `siteA`'s origin. `sitePE` = of 7PJV `v`, kept only if within 4.0 Å of `siteP`'s origin. Record both distances either way.
- Codon pairing check (acceptance): with the fitted base frames, P-site codon `X` 16–18 pairs with `Z` 36–34 and A-site codon `X` 19–21 pairs with `Y` 36–34 by Watson–Crick rules (base identities complementary; base-frame origins within 2.5 Å; antiparallel normals), all three positions each.

### 5.4 Other anchors
- `center`: centroid of all L1 beads; R = identity.
- `decoding`: o = centroid of heavy atoms of 16S A1492, A1493 and G530; R = identity (z = `ribo` z).
- `antiSD`: o = centroid of heavy atoms of 7ST2 16S author 1535–1540 after superposition; z = unit vector from the 1535 C1′ to the 1540 C1′ (local strand direction); x by the perpendicular-component rule against `ribo` +x. Mark `synthetic: 0` and note the source entry.
- `smallCenter`, `largeCenter`: centroid of each part's L1 beads; R = identity.
- `mrnaEntry`, `mrnaExit`: the frames of `mrna` registers +15 and −16.
- `ptc`, `tunnelExit`: step 3 (§5.6).
- For anchors where the plan names only o and z, x = perpendicular component of `ribo` +x (or `ribo` +y when z is within 10° of ±x); y = z × x.

### 5.5 `mrna` track
- Registers −16…+15; register 0 = first nucleotide of the P-site codon.
- Registers −3…+8 from 7K00 `X` (register = author − 16), `sources` = `7K00`.
- Remaining registers inside −14…+4 from 7ST2 `4` (register = author − 19, confirmed by pairing its P-site codon with the 7ST2 P-site tRNA anticodon), transformed by the 7ST2 superposition, `sources` = `7ST2`. Record the origin deviation at registers present in both entries (−3…+4), but always prefer 7K00.
- Anything left (−16, −15, +9…+15) is synthetic: extend from the nearest fitted register by A-form single-strand steps (rise 2.81 Å, twist 32.73° about the local z axis). Determine the sign so the step continues 5′→3′ along increasing register (dot product with the last fitted origin difference). `synthetic` = 1, `sources` = `synthetic`, base letter `N`.
- `bases` for fitted registers: the observed residue names.

### 5.6 `tunnel` path (step 3; `PLAN.md` §7.4 algorithm)
1. Voxelise a 140 Å cube centred on `ptc` at 1.0 Å. Blocked = within 3.0 Å of any 50S heavy atom (23S, 5S, L proteins of 7K00; ions and waters excluded). Clearance = distance to the nearest 50S heavy atom (exact, via a spatial hash, for the voxels the search touches).
2. Target: the unblocked voxel nearest the centroid of the Cα atoms of uL23 (`s`) and uL29 (`x`) that is on the solvent side. Solvent side means: at least one of 162 Fibonacci ray directions from the voxel reaches the cube boundary with every 1 Å sample unblocked, and every sample farther than 8 Å from the voxel has clearance > 8 Å. If no voxel within 30 Å of the centroid qualifies, relax 8 Å to 6 Å, then 4 Å, and record the value used.
3. Start: the unblocked voxel nearest `ptc` + 5 Å along `ribo` −x. Dijkstra over 26-neighbours with edge cost = length / clearance².
4. Smooth with three Chaikin iterations; resample at 1.0 Å.
5. Gates: length 75–110 Å; minimum clearance ≥ 3.0 Å beyond the first 6 Å. Record length and the clearance profile. Fallback (`PLAN.md` §13): straight line from `ptc` to the target, resampled, `synthetic: 1`.
- `ptc`: o = O3′ of A76 of 7K00 `Z`; z = direction of the first path segment; x by the rule in §5.4.
- `tunnelExit`: o = last path point; z = last segment direction.

### 5.7 `frameAtoms(sourcesDir)`
Exported from `tools/assets/ribosome.mjs` for A3 and A4: returns `{ frame: { o, R }, atoms: [{ chain, labelSeq, authSeq, comp, name, element, x, y, z }] }` with every 7K00 polymer heavy atom in the `ribo` frame. It parses 7K00 itself (no dependency on a build context) and must be deterministic.

### 5.8 Tests (`tests/assets-ribosome.test.mjs`)
The asset validates; parts, subunit tags and required anchors exist; the codon-pairing check; the E-site check value recorded in the asset source notes is ≤ 3.0 Å; superposition RMSDs ≤ 1.5 Å (read from `source.superpositions`); tunnel: the test recomputes the path length from the decoded points (75–110 Å) and checks the minimum clearance recorded in `source.tunnel` (≥ 3.0 Å beyond the first 6 Å), because exact clearance needs all 50S atoms, which the asset does not carry; budgets (§7.5): L0 ≤ 70,000 triangles total, L1 ≤ 15,000, L2 ≤ 4,000, file ≤ 1.2 MB; `mrna` track has registers −16…+15 with `sources` of the same length. Tests read committed files only; they do not need `tools/sources/`.

## 6. Out of scope for ST2
Rendering changes, `dev/actor-card.html` edits (read-only use for screenshots), `docs/ASSETS.md` (Chief), `assets/manifest.json` beyond what `build-assets --only` merges, and any contract change. Contract questions go to the handoff under `Requests`.
