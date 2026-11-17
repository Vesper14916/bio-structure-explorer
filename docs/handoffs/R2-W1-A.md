# Handoff R2-W1-A: asset pipeline and RNA polymerase assets (N1)

Date: 2026-11-17. Branch: `r2w1-a` (base `c9b0744`), not pushed.

## Files changed

| File | Change |
| :--- | :--- |
| `tools/lib/mmcif.mjs` | New. mmCIF tokenizer and category parser (quoted values, `;` text fields, loop and single-row categories), `parseMmcif`, `polymerChains`. |
| `tools/lib/frames.mjs` | New. `fitBaseFrame`, `residueBase`, `interpolateFrames`, `fitLine`. |
| `tools/lib/surface.mjs` | New. Gaussian density grid, marching cubes (case table generated from face rules), mesh checks, ray-parity containment, `envelope`. |
| `tools/build-assets.mjs` | New. Builds `rnap-ec` and `rnap-holo`; `--check` (byte comparison with committed files), `--dry-run` (1BNA into a temporary directory), `--quiet`. |
| `tools/sources.lock.json` | New. 6ALF, 6ALH, 6C9Y, 6CA0: URL, file, download date, SHA-256, bytes, target, role. |
| `assets/rnap-ec.asset.json` | New, 142,365 bytes. |
| `assets/rnap-holo.asset.json` | New, 166,612 bytes (step 7, stretch). |
| `assets/manifest.json` | Adds `rnap-ec` and `rnap-holo`; fixture entry kept. |
| `tests/assets.test.mjs` | New, 12 tests. |
| `docs/ASSETS.md` | Rows A07 and A08 plus a details section. |
| `.gitignore` | Not changed: `tools/sources/` was already ignored at the base commit. |

## Results

- Chosen entry for `rnap-ec`: **PDB 6ALF** (cryo-EM, 4.1 Å). 6ALF and 6ALH tie on hybrid (9 bp) and downstream duplex (13 bp); 6ALF has the better resolution (and 12 versus 10 RNA nucleotides).
- Chain inventory (6ALF): α G (222), α H (220), β I (1316), β′ J (1337), ω K (79), template DNA **B** (29/29), non-template DNA A (22/29, `label_seq_id` 7–13 missing), RNA R (12/20). No other chains. The template was identified by pairing with the RNA; entity descriptions do not name it.
- Counts `rnap-ec`: L1 3,174 Cα beads; L0 `core` 7,596 triangles, 3,792 vertices, closed, outward, 95.1 % of beads inside; L2 314 atoms (313 protein + 1 Mg²⁺), 299 bonds, radius 12 Å; bounds radius 83.1 Å, size 108.0 × 144.3 × 136.7 Å.
- Tracks: `rna` −12 … −1, `template` −15 … +13, `nontemplate` −15 … +13. Only synthetic segment: `nontemplate` −9 … −3 (residues A7–A13, absent from the model, interpolated between A6 and A14).
- Angle between upstream (registers −15 … −10, 6 bp) and downstream (+2 … +13, 12 bp) duplex axes: **63.8°**.
- `activeSite` = catalytic Mg²⁺ (auth J 1501), 2.05 Å from O3′ of `rna(−1)`.
- `rnap-holo` (step 7): PDB 6C9Y (4.25 Å) chosen over 6CA0 (5.75 Å). β′ superposition onto 6ALF: 1,334 Cα, RMSD 2.37 Å. L1 3,685; L0 `core` 8,068 and `sigma` 1,896 triangles; L2 291 atoms; anchors `center`, `activeSite` only; no tracks.

## Acceptance checks

| Item | How checked | Observed |
| :--- | :--- | :--- |
| `node --test tests/*.test.mjs` | Run on the final tree | `# tests 52`, `# pass 52`, `# fail 0` (40 existing + 12 new) |
| Regeneration is byte-identical | `node tools/build-assets.mjs` twice, `sha256sum` after each, then `--check` | Same hashes both runs (`rnap-ec` c2be13f6…, `rnap-holo` 05eb29fa…, manifest fac65a2e…); `--check` prints `identical` for all three |
| No raw mmCIF committed; lock complete | `git status`, lock file review | `tools/sources/` ignored; four entries with url, downloaded, sha256, bytes; the tool verifies hash and size before use |
| Step 1 on 1BNA | Test | Two DNA chains of 12, only DA/DC/DG/DT |
| Step 2 on 1BNA | Test | 24/24 fits, max RMSD 0.062 Å; round trip < 0.5 Å; spacing see deviation 1 |
| Step 3 dry run | `node tools/build-assets.mjs --dry-run` | 22 P beads, 404 triangles, closed, 100 % beads inside, `validateAsset: OK` |
| Step 6 asset tests | Test | Organism, bounds 80–200 Å, hybrid −8 … −1 within 3 Å, z-axis angle < 1°, L1 in 2,500–3,700, L0 ≤ 12,000 per part, size ≤ 400 KB: all pass |
| Mesh correctness | Tests plus build-time checks | Closed with consistent winding on a sphere, a noise field, and all built parts; positive signed volume |

## Deviations from the brief

1. **Step 2 spacing range.** The brief asks for consecutive fitted origins 3.0–4.6 Å apart on 1BNA. Observed: strand A step 3–4 is 2.95 Å (2.93–2.98 Å whichever atoms are fitted: all `BASE_ATOMS`, without C1′, or ring atoms only). All other 21 steps lie in 3.11–4.09 Å. The test uses 2.9–4.6 Å and says why in a comment.
2. **Fitted atoms.** `fitBaseFrame` fits all atoms listed in `BASE_ATOMS[base]` (ring, exocyclic, and C1′), not ring atoms only; the brief's wording was ambiguous. The 6-atom minimum and the 0.5 Å limit are applied as written.
3. **Pairing rule.** Origins within 2.5 Å and antiparallel normals (dot product < 0), assigned one-to-one by increasing origin distance. A 40° normal limit was not used: it would reject 6ALF pair A17·B13 (42.6°). A first version with mutual-nearest-neighbour matching rejected that same pair and selected 6ALH; the entry choice therefore depends on this marginal pair. Recorded in `docs/ASSETS.md`.
4. **L0 iso-level.** Selected so that at least 95 % of beads are inside the mesh by a ray-parity test, not by sampled density alone: at the plain 5th density percentile only 94.7 % were geometrically inside.
5. **Marching-cubes table** is generated in code from face rules (ambiguous faces separate inside corners) rather than typed from the classic table. Verified closed and consistently wound.
6. **Pre-check counts.** Non-template chain A has 22 modelled residues, not 21 as stated in the README pre-check.
7. **Extra asset fields** (allowed by the validator): `chains[].subunit`, `lod0.parts[].sigma/spacing/beadsInside`, and `source.url`, `revisionDate`, `nucleicAcidSource`, `notes`, `superposition`, `frameSource`.
8. **L2 ions** are assigned to the chain of their `auth_asym_id` (β′ in both entries) because the format has no "no chain" value.
9. Commit trailers: the first five commits use the trailer from the original instructions (`Claude Fable 5.2`); the documentation commit uses the coordinator's later trailer (`Claude Opus 5.5`).

## Not verified

- No visual check in a browser: this task has no renderer. Envelope appearance, bead colouring by `subunit`, and the cutaway must be reviewed on the actor card (task B or the Integration Owner).
- The literature value of the upstream/downstream DNA angle for this complex was not compared; 63.8° is a measurement from a 6-bp upstream segment.
- The `--dry-run` writes into the system temporary directory (`os.tmpdir()`); it was not cleaned up automatically.

## Open questions

- Should `rnap-holo` carry `dnaEntry`/`dnaExit`/`rnaExit` anchors copied from `rnap-ec`? They are omitted because 6C9Y has no nucleic acids.
- The contract has no per-chain colour key; the renderer can use `chains[].subunit` (`alpha`, `beta`, `betaPrime`, `omega`, `sigma70`) for the 6.4 tints if the Integration Owner adopts that field.
- `tools/build-standalone.mjs` does not inline assets yet (Integration Owner, Wave 2).
