# Task C: residue library, atomic peptide (N5), NTP and pyrophosphate templates (N7)

Model: Sonnet, medium effort. Branch: `r2w1-c`. Read first: `docs/tasks/R2-W1-README.md`, `docs/CONTRACTS.md` sections 1, 2, and 6.6, `js/science/assembly.js` (`nucleotideTemplate`), `js/science/bases.js`, `js/science/math.js`, `js/science/genetic-code.js` (`AMINO_ACID_INFO`).

## Outcome

Pure, tested science modules (no DOM, no three.js) that build heavy-atom amino-acid residues, an extended nascent peptide, and nucleoside triphosphate substrates from ideal geometry. Nothing is rendered or wired into the simulation in this task.

## Files you own

`js/science/residues.js`, `js/science/peptide.js`, `js/science/ntp.js` (all new), `js/science/index.js` (add re-exports only), `tests/residues.test.mjs`, `tests/ntp.test.mjs`, `docs/handoffs/R2-W1-C.md`. Do not edit `assembly.js`, `bases.js`, `templates.js`, `genetic-code.js`, or any file under `docs/` other than your handoff; put science notes for `docs/SCIENCE.md` in the handoff.

## Part 1: `js/science/residues.js`

1. Implement `placeAtom(a, b, c, bond, angleDeg, torsionDeg)`: the position of atom `d` bonded to `c` with `|cd| = bond`, angle `b–c–d = angleDeg`, dihedral `a–b–c–d = torsionDeg`. Test it against `angle` and `dihedral` in `js/science/math.js` (read their sign convention first).
2. Residue set, PDB atom names, heavy atoms only (no hydrogens, no `OXT`):

| Code | Atoms | Count |
| --- | --- | --- |
| `GLY` | N CA C O | 4 |
| `ALA` | N CA C O CB | 5 |
| `SER` | N CA C O CB OG | 6 |
| `ASP` | N CA C O CB CG OD1 OD2 | 8 |
| `GLU` | N CA C O CB CG CD OE1 OE2 | 9 |
| `GLN` | N CA C O CB CG CD OE1 NE2 | 9 |
| `LYS` | N CA C O CB CG CD CE NZ | 9 |
| `PHE` | N CA C O CB CG CD1 CD2 CE1 CE2 CZ | 11 |
| `TYR` | N CA C O CB CG CD1 CD2 CE1 CE2 CZ OH | 12 |
| `MET` | N CA C O CB CG SD CE | 8 |
| `FME` (N-formylmethionine) | N CN O1 CA C O CB CG SD CE | 10 |

3. Geometry. Backbone (Engh & Huber 1991 ideal values): N–CA 1.458, CA–C 1.525, C=O 1.231, peptide C–N 1.329 Å; N–CA–C 111.0°, CA–C–N 116.2°, C–N–CA 121.7°, CA–C–O 120.8°. Side chains: use published ideal bond lengths and angles for each residue (Engh & Huber 1991; cite the source in a comment above the table) and store them as an internal-coordinate table, one row per atom: `[name, element, refA, refB, refC, bond, angle, torsion]`. Side-chain torsions χ are all 180° except: aromatic rings and carboxylate/amide groups are planar; `PHE`/`TYR` χ2 = 90°. `FME`: formyl carbon `CN` bonded to `N` at 1.33 Å, `CN=O1` 1.23 Å, trans to `CA`.
4. Chirality must be L. Check: the chiral volume `(N − CA) · ((C − CA) × (CB − CA))` is positive (about +2.5 Å³) for every residue with a `CB`. Independently confirm the sign with the CORN rule and state in the handoff how you confirmed it. If the two disagree, stop and report.
5. Exports: `RESIDUE_CODES`, `residueTemplate(code3)` (shape in `docs/CONTRACTS.md` 6.6; local frame with `CA` at the origin, `N` on the −x side in the xy plane; cache results), `RESIDUE_BONDS(code3)` or bonds inside the template as index pairs, and `ONE_TO_THREE` for the letters used in the fixture plus `fMet → FME`.

## Part 2: `js/science/peptide.js`

- `buildPeptide(codes3, { phi = -139, psi = 135, omega = 180, cTerminalOxt = true } = {})` chains residues N→C with the backbone geometry above and returns the structure in `docs/CONTRACTS.md` 6.6. Bonds include peptide bonds. When `cTerminalOxt` is true, add `OXT` to the last residue (C–OXT 1.25 Å, planar).
- `peptideFromConstruct(construct)` maps `construct.peptide[].code3` to template codes, with the first residue `FME`.

## Part 3: `js/science/ntp.js`

- `ntpTemplate(base)` for `A`, `U`, `G`, `C`: start from `nucleotideTemplate(base, 'ribose')` and append nine atoms using `placeAtom`: `O3A` (bridge on the α-phosphorus `P`), `PB`, `O1B`, `O2B`, `O3B` (bridge), `PG`, `O1G`, `O2G`, `O3G`. Geometry: bridging P–O 1.61 Å, terminal P–O 1.49 Å, O–P–O 109.5°, P–O–P 130°, extended (torsions 180° along the chain, terminal oxygens staggered at ±60° and 180°). The existing `P`, `OP1`, `OP2` atoms keep their names; note in a comment that they correspond to `PA`, `O1A`, `O2A`. Before choosing which tetrahedral position `O3A` takes, inspect the existing template: `P` already has `OP1`, `OP2`, `O5'`; place `O3A` at the fourth tetrahedral position.
- Return the same shape as `nucleotideTemplate` (`names`, `el`, `part`, `local`, `bonds`, `index`), with `part = 'phosphate'` for the new atoms and an extra field `leavingGroup`: the indices of the atoms that leave as pyrophosphate (`O3A`, `PB`, `O1B`, `O2B`, `O3B`, `PG`, `O1G`, `O2G`, `O3G`).
- `PPI_TEMPLATE`: the nine leaving atoms as a standalone template in a local frame centred on `O3B`.

## Tests (`tests/residues.test.mjs`, `tests/ntp.test.mjs`)

Residues and peptide:
- Each template has exactly the atoms and count in the table, in that order.
- Every bond is within 0.02 Å of its table value; all bonded pairs are 1.20–1.85 Å.
- No two non-bonded atoms closer than 2.2 Å within a residue.
- Chiral volume between +2.0 and +3.0 Å³ for all residues with `CB`.
- Aromatic ring atoms of `PHE` and `TYR` are coplanar within 0.02 Å; ring bonds 1.37–1.41 Å.
- `buildPeptide` for `FME ALA GLU PHE LYS GLY SER ASP TYR GLN ALA`: 89 atoms (88 plus `OXT`); consecutive Cα–Cα distances 3.80 ± 0.03 Å; every ω dihedral within 1° of 180°; peptide C–N 1.329 ± 0.005 Å; no two atoms in different residues closer than 2.6 Å unless bonded; end-to-end Cα distance between 30 and 38 Å.
- `peptideFromConstruct(DEFAULT_GENE_CONSTRUCT)` gives those eleven codes.

NTP:
- 9 more atoms than the ribonucleotide template for each base; names as listed.
- Bridging and terminal P–O lengths within 0.02 Å of the values above; P–O–P angles 130 ± 1°.
- No non-bonded contact below 2.2 Å between the new atoms and the rest of the nucleotide.
- `leavingGroup` has nine indices and `PPI_TEMPLATE` has nine atoms.

## Acceptance checklist
- [ ] `node --test tests/*.mjs` passes; counts reported. Existing tests unchanged.
- [ ] No import of `three`, DOM, or anything outside `js/science/`.
- [ ] Handoff lists every numeric parameter source and a short paragraph for `docs/SCIENCE.md` describing the models and their simplifications (extended conformation only, no hydrogens, no rotamer statistics, no folding).
