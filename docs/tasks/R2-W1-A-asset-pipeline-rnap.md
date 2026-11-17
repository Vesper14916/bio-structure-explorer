# Task A: asset pipeline and RNA polymerase asset (N1)

Model: Opus, medium effort. Branch: `r2w1-a`. Read first: `docs/tasks/R2-W1-README.md`, `docs/CONTRACTS.md` sections 1 and 6, `js/assets/format.js`, `tools/make-fixture-asset.mjs`, `tools/build-templates.mjs` (existing mmCIF handling for `tools/1bna.cif`).

## Outcome

A deterministic offline tool that turns a PDB mmCIF file into a Helix asset (format v1), and one committed asset, `assets/rnap-ec.asset.json`, for the *E. coli* RNA polymerase elongation complex at true scale.

## Files you own

`tools/build-assets.mjs`, `tools/lib/mmcif.mjs`, `tools/lib/frames.mjs`, `tools/lib/surface.mjs`, `tools/sources.lock.json`, `assets/rnap-*.asset.json`, `assets/manifest.json`, `tests/assets.test.mjs`, `docs/ASSETS.md`, `.gitignore`, `docs/handoffs/R2-W1-A.md`. Do not edit `js/assets/format.js`; if the format is insufficient, describe the gap in the handoff.

## Steps

### Step 1: mmCIF reader (`tools/lib/mmcif.mjs`), no network needed
- Export `parseMmcif(text)` returning `{ title, method, resolutionA, entities, atoms }`.
- Read the `_atom_site` loop by column name: `group_PDB`, `type_symbol`, `label_atom_id`, `label_alt_id`, `label_comp_id`, `label_asym_id`, `auth_asym_id`, `label_entity_id`, `label_seq_id`, `auth_seq_id`, `Cartn_x`, `Cartn_y`, `Cartn_z`, `pdbx_PDB_model_num`. Handle quoted values such as `"O5'"`.
- Keep model 1 only, alternate location `.` or `A` only, and drop hydrogen and deuterium.
- Read `_entity.pdbx_description`, `_entity_poly.type`, `_struct.title`, `_exptl.method`, the resolution (`_em_3d_reconstruction.resolution` or `_refine.ls_d_res_high`), and the source organism (`_entity_src_gen.pdbx_gene_src_scientific_name`, `_entity_src_nat.pdbx_organism_scientific`, or `_pdbx_entity_src_syn.organism_scientific`). Both loop and single-row category layouts must work.
- Chain class from `_entity_poly.type`: `polypeptide(L)` → `protein`; `polyribonucleotide` → `rna`; `polydeoxyribonucleotide` → `dna`. Hybrid or other types: stop and report.
- Test on `tools/1bna.cif`: after waters are excluded there are two DNA chains of 12 residues each, and every residue name is one of `DA`, `DC`, `DG`, `DT`.

### Step 2: base frames and tracks (`tools/lib/frames.mjs`), no network needed
- `fitBaseFrame(residueAtoms, base)`: least-squares superposition (use `kabsch` from `js/science/math.js`; read its argument order and return shape before use) of the standard base ring atoms in `BASE_ATOMS[base]` (`js/science/bases.js`, local `z = 0`) onto the observed atoms with the same names. Require at least 6 matched atoms. Return `{ o, R, rmsd, matched }`, where the frame maps standard coordinates into structure coordinates. A fit with `rmsd > 0.5 Å` or fewer than 6 atoms is not usable and must be treated as missing.
- Map residue names to bases: `DA/DC/DG/DT` and `A/C/G/U`.
- `interpolateFrames(frames)`: fill missing entries between two fitted neighbours by linear interpolation of the origin and spherical interpolation of the rotation (see `slerpMat` in `js/sim/util.js`); mark them `synthetic = 1`. Missing entries at a track end are dropped, not extrapolated.
- Test on `tools/1bna.cif`: all 24 bases fit with `rmsd < 0.3 Å`; consecutive fitted origins along one strand are 3.0–4.6 Å apart; the round trip "fit, then apply the frame to standard atoms" reproduces observed ring atoms within 0.5 Å.

### Step 3: levels of detail (`tools/lib/surface.mjs` and `tools/build-assets.mjs`), no network needed
- **L1:** one bead per residue: `CA` for protein, `P` for nucleic acid (skip a residue that lacks the atom). Only protein chains are exported to L1 for a machine asset; nucleic acids in the structure become tracks, not beads.
- **L0:** per part, a Gaussian density of the part's L1 beads on a regular grid (start with 5 Å spacing, σ = 5 Å), extracted with marching cubes, vertices welded. Choose the iso-level so that at least 95 % of the part's beads are inside the surface. If a part exceeds 12,000 triangles, increase grid spacing in 0.5 Å steps until it fits. Triangle winding must give outward normals.
- **L2:** all heavy atoms of protein residues that have any atom within 12 Å of the `activeSite` anchor, plus `MG` and `ZN` ions within 20 Å. Bonds: two atoms in the same residue or in sequence-adjacent residues are bonded when their distance is below the sum of covalent radii plus 0.45 Å (C 0.76, N 0.71, O 0.66, S 1.05, P 1.07). Cap at 3,000 atoms by shrinking the radius in 1 Å steps and record the final radius.
- Implement marching cubes yourself in plain JavaScript; do not add a dependency.
- Add a dry-run target that builds an asset from `tools/1bna.cif` into a temporary directory (not committed) and validate it with `validateAsset`. For this dry run only, export DNA `P` beads to L1 so the mesh code is exercised.

### Step 4: obtain the source entry (network or manual file)
- Candidates: PDB `6ALF` (4.1 Å) and `6ALH` (4.4 Å), *E. coli* RNA polymerase elongation complexes. Look for `tools/sources/6ALF.cif` and `tools/sources/6ALH.cif` first. If absent, download `https://files.rcsb.org/download/<ID>.cif`. Add `tools/sources/` to `.gitignore`; never commit raw mmCIF.
- If neither file can be obtained, stop here, mark step 4 onward `BLOCKED` in the handoff with the exact error, and hand off steps 1–3. Do not substitute another structure and do not generate coordinates.
- Record in `tools/sources.lock.json` for each file used: `pdbId`, `url`, `downloaded` (ISO date), `sha256`, `bytes`.
- Print and record a chain inventory: chain id, entity description, class, residue count. Identify α (two chains), β, β′, ω, template DNA, non-template DNA, and RNA from the entity descriptions. List any other chain and exclude it from the asset.
- Choose the entry with the more complete nucleic acids (longer RNA·DNA hybrid, then longer downstream duplex, then better resolution). State the choice and the reason. If the chosen entry has no RNA or a hybrid shorter than 8 bp, stop and report.

### Step 5: frame, tracks, and anchors for `rnap-ec` (conventions in `docs/CONTRACTS.md` 6.3)
- Fit base frames for every nucleotide in the three nucleic-acid chains.
- Pairing: two bases are paired when their fitted frames' origins are within 2.5 Å of each other after accounting for the Watson–Crick partner relation, or equivalently when their C1′ atoms are 9.5–11.5 Å apart and their base normals are antiparallel within 40°. Use one rule consistently and state which.
- Registers: RNA 3′-terminal nucleotide = `−1`. Template registers follow pairing with RNA for `r ≤ −1`; continue the numbering by sequence order to assign `0, 1, 2, …` downstream and more negative values upstream. Non-template registers copy their template partner where paired; inside the bubble assign by sequence order between the paired flanks; residues absent from the model are filled by `interpolateFrames` and flagged synthetic. If the non-template bubble segment is missing entirely and cannot be bridged between two fitted flanks, leave the track with the gap closed by interpolation and say so.
- Asset frame: origin = midpoint of the origins of `rna(−1)` and `template(−1)` frames. `z` = unit direction of a least-squares line through the base-pair centres of template registers `≥ +2`, oriented from the origin toward downstream. `x` = normalised component of (centroid of all protein Cα − origin) perpendicular to `z`. `y = z × x`. Transform every coordinate and frame into this frame.
- Anchors (rotation = identity unless stated): `center` (protein Cα centroid), `activeSite` (catalytic `MG` nearest to the RNA 3′ end if present within 10 Å, otherwise the `O3'` atom of `rna(−1)`; record which), `dnaEntry` (base-pair centre of the most downstream paired register), `dnaExit` (base-pair centre of the most upstream paired register), `rnaExit` (phosphorus of the most 5′ modelled RNA nucleotide).
- Parts: one part `core` containing α, α, β, β′, ω.
- `bounds`: centre = `center` anchor; `radius` = largest Cα distance from it; `size` = extent along the asset axes.

### Step 6: write, validate, test, document
- Write `assets/rnap-ec.asset.json` and update `assets/manifest.json` (keep the fixture entry). Target size ≤ 400 KB.
- `tests/assets.test.mjs`: every file in `assets/manifest.json` passes `validateAsset`; for `rnap-ec`: `source.organism` contains `Escherichia coli`; `bounds.size` components are each between 80 and 200 Å; `rna` and `template` tracks both contain registers `−8 … −1`; for those registers the paired frame origins are within 3 Å after applying the partner relation or the C1′ rule you chose; the angle between `+z` and the fitted downstream axis is below 1°; L1 count is between 2,500 and 3,700 (the five core chains total about 3,500 residues); each L0 part has ≤ 12,000 triangles.
- `docs/ASSETS.md`: add row `A07` with every provenance field from PLAN.md section 6, the chain inventory, missing regions, synthetic track segments, and the measured angle between upstream and downstream duplex axes.
- The tool must be deterministic: running it twice gives byte-identical output. Verify and report.

### Step 7 (stretch, only if steps 1–6 pass): holoenzyme with σ⁷⁰
- Candidates: PDB `6C9Y` (holoenzyme, 4.25 Å) and `6CA0` (open complex, 5.75 Å), same acquisition rules as step 4.
- Superpose the holoenzyme onto the `rnap-ec` frame using Cα atoms of β′ residues present in both (match by `label_seq_id`), report the RMSD, and write `assets/rnap-holo.asset.json` with parts `core` and `sigma` in the same frame. No tracks are required. If the β′ RMSD exceeds 6 Å, stop and report rather than committing the asset.

## Acceptance checklist
- [ ] `node --test tests/*.mjs` passes; counts reported.
- [ ] `node tools/build-assets.mjs` regenerates the committed asset byte-identically.
- [ ] No raw mmCIF committed; lock file complete.
- [ ] `docs/ASSETS.md` row `A07` complete, including what is synthetic.
- [ ] Handoff states the chosen entry, chain inventory, counts (beads, triangles, atoms, bytes), bend angle, and every deviation from this brief.
