# tRNA assets (`trna-init`, `trna-aa`)

Task R3-A2 (stage ST2). Recipe: `tools/assets/trna.mjs`. Tests: `tests/assets-trna.test.mjs`. Output: `assets/trna-init.asset.json`, `assets/trna-aa.asset.json` (asset format v2). Design basis: `docs/tasks/R3-ST2-design.md` section 4, `PLAN.md` sections 7.3 to 7.5.

## 1. Provenance

| Asset | Source | Chain | Entity description | Role in 7K00 | Anticodon (34-36) | Paired codon |
| --- | --- | --- | --- | --- | --- | --- |
| `trna-init` | PDB 7K00 (`tools/sources.lock.json`) | `Z` | P-site tRNA-fMet | P site | `CAU` | `AUG` (mRNA chain `X`, author 16-18) |
| `trna-aa` | PDB 7K00 | `Y` | A-site tRNA-Val | A site | `UAC` | `GUA` (mRNA chain `X`, author 19-21) |

7K00: "Structure of the Bacterial Ribosome at 2 Angstrom Resolution", electron microscopy, 1.98 Å, revision 2026-09-23, *Escherichia coli*, CC0 (wwPDB). Both files are loaded with `ctx.loadSource('7K00')`; model 1, altloc `.` or `A`, no hydrogens, waters excluded. The recipe checks the entity description, then checks that the reverse complement of the codon read from chain `X` equals the anticodon read from the tRNA (complementarity check, as required by `PLAN.md` R3-A2). Both checks throw on failure.

## 2. Numbering map

Standard tRNA number = author number (`auth_seq_id`). When an author number occurs twice, the second residue (higher `label_seq_id`) gets the suffix `A`. The internal key is `label_seq_id`; `standardNumbering(chain)` returns the Map from standard number to residue.

| Chain | `label_seq_id` -> standard number | Not modelled |
| --- | --- | --- |
| `Z` (76 nt) | label 1-16 = 2-17; label 17 = `17A`; label 18-76 = 18-76 | number 1 |
| `Y` (74 nt) | label 1-15 = 1-15; label 18-76 = 18-76 | numbers 16 and 17 |

Interpretations and observations:
- Insertion residue: chain `Z` has two residues with author number 17 (label 16 = `C`, label 17 = `U`). The second is keyed `17A`. This matches "second of a duplicate author number suffixed `A`" and is only a key convention; nothing downstream depends on the letter. Chain `Y` has no duplicate.
- Modified nucleotides: **none**. In this 7K00 entry every residue of `Z` and `Y` is `A`, `C`, `G` or `U` (group `ATOM`; no `HETATM` residues except water). The design file (section 2) expected modified nucleotides such as `H2U` or `4SU`; they are not present in these two chains. Every nucleotide is therefore fittable by `residueBase`. The recipe still reports a `modified` list (empty) and the code path keeps such residues in L1 and L2 without fitting.
- Nucleotide 1 of `Y` and nothing else lacks a P atom (5′ terminus), so `trna-aa` has 73 L1 beads for 74 nucleotides; `trna-init` has 76 beads for 76 nucleotides (nucleotide 2, its first modelled residue, carries a P atom). No bead is invented for a missing P atom.
- Anticodon identity by complementarity: `Z` 34-36 `CAU` is the reverse complement of `AUG`; `Y` 34-36 `UAC` is the reverse complement of `GUA`.

## 3. Frame definition (`trna` frame, `PLAN.md` 7.3)

Implemented once, by `trnaFrame(residues, opts)` in `tools/assets/trna.mjs`. Each asset stores coordinates in its own `trna` frame, so the asset origin is the anticodon.

- Origin `o`: centroid of the C1′ atoms of nucleotides 34, 35, 36.
- +z: unit vector from `o` to the P atom of nucleotide 76. If 76 is absent or has no P atom, the highest-numbered nucleotide up to 76 that has a P atom is used, never below 72 (otherwise an error). The number used is returned as `last3`. Both assets use 76.
- +x: component of (centroid of all P atoms - `o`) perpendicular to z (points toward the elbow).
- +y = z × x.
- Return value `{ o, R, last3 }`; `R` is row-major with the axes as columns (`[x0, y0, z0, x1, y1, z1, x2, y2, z2]`, the repository convention for anchors).

Signature (JSDoc in the source):

```js
trnaFrame(residues, { transform?, keys? })
// residues: Map<number|string, { atoms: { name: [x, y, z] } }>, or a plain object, or a function key -> residue | undefined
// keys are standard numbers (numbers, or strings for insertions such as '17A'); a function is probed with 1..76 and '17A'
// transform: optional point transform (for example a superposition into the 7K00 ribo frame) applied to every coordinate first
```

For a later ribosome recipe: parse 7ST2, 5WE4 or 7PJV, build the Map with `standardNumbering(chain)` (or an equivalent author-number Map), call `trnaFrame(map, { transform: p => applyFrame(superposition, p) })`. The result is the `trna` frame in the 7K00 `ribo` coordinates of that entry's tRNA. `tests/assets-trna.test.mjs` checks the function on synthetic residues: origin, axes, `last3` fallback, the three input forms, and that `transform` equals transforming the coordinates beforehand.

## 4. Levels of detail

### L0 (envelope per part)
Parameters actually used (both assets, both parts): Gaussian density `sigma = 3.5 Å`, grid `spacing = 2.5 Å` (no coarsening was needed; the triangle cap did not force a larger spacing). Points: P atom, C4′ and N9 (A, G) or N1 (C, U) of every nucleotide of the part. Iso-level and containment: `envelope()` from `tools/lib/surface.mjs` with its all-points containment target; because the P beads are only about one third of the points, the target is raised from 0.95 in steps of 0.005 until at least 95 % of the L1 beads of the part are inside the mesh (ray-parity test). Per-part triangle caps 3,600 (body) and 400 (anticodon).

| Asset | Part | Triangles | Vertices | All-points target used | L1 beads inside |
| --- | --- | --- | --- | --- | --- |
| `trna-init` | `body` | 3,520 | 1,760 | 0.955 | 0.959 |
| `trna-init` | `anticodon` | 196 | 100 | 0.950 | 1.000 |
| `trna-aa` | `body` | 3,508 | 1,752 | 0.950 | 0.971 |
| `trna-aa` | `anticodon` | 204 | 104 | 0.950 | 1.000 |

Meshes are closed with outward winding (`meshStats`); the recipe and the tests check both.

Interpretation: the design asks for "at least 95 % containment of the L1 beads"; the first pass at target 0.95 left 94.5 % of the `trna-init` body beads inside, so the all-points target is raised as described. Containment is therefore measured on the L1 beads, as required, not on the envelope input points.

### L1
One P bead per nucleotide (kind 1), two chains per asset: `Z` / `Y` (part `body`, nucleotides other than 34-36) and `Z-ac` / `Y-ac` (part `anticodon`, nucleotides 34-36). Beads are grouped by chain and then follow the numbering order; the last body bead is nucleotide 76. Counts: `trna-init` 73 body + 3 anticodon = 76; `trna-aa` 70 + 3 = 73.

### L2
Site `acceptor`, radius 8 Å: all heavy atoms of whole nucleotides with any atom within 8 Å of the acceptor anchor origin (O3′ of nucleotide 76). Both assets select nucleotides 75 and 76 only (the 3′ end projects away from the body, so nucleotide 74 is more than 8 Å from the O3′ in both entries): 42 atoms and 46 bonds each. Bonds: covalent-radius rule (sum of radii + 0.45 Å, C 0.76, N 0.71, O 0.66, P 1.07 Å) inside a nucleotide, and P to O3′ between consecutive nucleotides. Elements C, N, O, P only (no ions). L2 chain index = body or anticodon chain of the nucleotide.

## 5. Anchors

All frames are in the asset (`trna`) frame; rotations are rounded to 6 decimals, origins to 3.

| Anchor | Origin | Rotation | `trna-init` origin (Å) | `trna-aa` origin (Å) |
| --- | --- | --- | --- | --- |
| `center` | centroid of all P atoms | identity | 20.882, 0, 33.407 | 18.078, 0, 35.207 |
| `acceptor` | O3′ of nucleotide 76 | z = unit(O3′ - C3′); x = component of the `trna` +x perpendicular to z; y = z × x | 0.217, 3.087, 81.233 | -4.730, -1.119, 84.983 |
| `elbow` | centroid of all heavy atoms of nucleotides 18, 19, 55, 56 | identity | 42.155, -3.524, 39.992 | 38.665, -6.105, 43.178 |

`center` has `y = 0` because the centroid of all P atoms lies in the xz plane by the definition of +x.

## 6. Track `anticodon`

Kind `rna`, registers 34, 35, 36, `synthetic` `[0, 0, 0]`, bases `CAU` (`trna-init`) and `UAC` (`trna-aa`), 5′ to 3′. Frames are Kabsch fits of the standard base (`fitBaseFrame`, `tools/lib/frames.mjs`) onto the observed base atoms, transformed into the asset frame. Fit RMSD (Å): `trna-init` 0.026, 0.015, 0.023; `trna-aa` 0.018, 0.007, 0.019. For test purposes the source block stores the observed C1′ positions of 34-36 (`source.anticodonC1prime`, asset frame, 3 decimals). Largest distance between the standard-base C1′ placed by the track frame and the observed C1′: `trna-init` 0.062 Å, `trna-aa` 0.036 Å. The test tolerance is 0.05 Å plus half the quantisation step (0.025 Å), because the standard base is a fit, not the observed geometry.

## 7. Span check (anticodon origin to P of A76)

| Asset | Measured | Acceptance 65-80 Å |
| --- | --- | --- |
| `trna-init` | 76.147 Å | met |
| `trna-aa` | **81.707 Å** | **not met** (1.7 Å above) |

Both values use the frame of section 3 exactly as written (origin = C1′ centroid of 34-36, P of nucleotide 76, `last3 = 76`). Other distances from the same origin: O3′ of nucleotide 76 is 81.29 Å (`trna-init`) and 85.12 Å (`trna-aa`); P75 is 72.22 and 77.01 Å. The A-site tRNA in 7K00 has its CCA end extended further than the P-site tRNA. No parameter was adjusted to force the range. The recipe records the value and a `withinDesignRange` flag in `source.trnaFrame`, and `tests/assets-trna.test.mjs` asserts 65-80 Å for `trna-init` and 65-82 Å for `trna-aa`, with a comment naming this deviation. Request to the Chief: widen the acceptance to about 65-85 Å or accept `trna-aa` as measured.

## 8. Budgets (`PLAN.md` 7.5), measured

| Asset | L0 triangles (limit 4,000) | L1 beads (80) | L2 atoms (400) | File bytes (60,000) |
| --- | --- | --- | --- | --- |
| `trna-init` | 3,716 | 76 | 42 | 50,900 |
| `trna-aa` | 3,712 | 73 | 42 | 50,935 |

`bounds` cover the L1 beads and the L0 vertices: `trna-init` centre (23.414, 0.846, 35.511), radius 49.344 Å; `trna-aa` centre (21.236, 0.923, 38.072), radius 51.555 Å.

## 9. Determinism

`node tools/build-assets.mjs --check --quiet` regenerates every asset in memory and compares bytes with the committed files. The recipe uses only sorted or insertion-ordered structures from the parsed entry and no randomness. `--only trna-init,trna-aa` merges the two ids into `assets/manifest.json` and leaves the other entries untouched.

## 10. Simplifications

- The model is rigid: no flexibility between the acceptor stem and the anticodon arm.
- `bounds.radius` is the maximum distance from the bounds centre to any L1 bead or L0 vertex, not from the anchor `center`.
- L0 covers the backbone P atoms and one base atom per nucleotide plus C4′; it is a smooth envelope, not a molecular surface.
- Aminoacyl and peptidyl groups are not part of the structure (7K00 has none on these chains); the story engine adds them.
