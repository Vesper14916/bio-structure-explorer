# Structure Assets & Provenance Manifest

Updated: 2026-11-17
Owner: Molecular Assets Agent (Agent 2)

| Asset ID | Molecule / Complex | Representation Type | Reference / Provenance | Coordinate Units & Anchors | Simplifications & License |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A01** | **B-DNA Duplex & Deoxyribonucleotides** (`A, T, G, C`) | All-heavy-atom regularised template (`BACKBONE`) + experimental PDB `1BNA` | Olson et al. (2001) *JMB* **313**, 229; Drew et al. (1981) *PNAS* **78**, 2179 (`1BNA`, 1.9 Å) | Å, standard base frame (`z = 0`), $C2'\text{-endo}$ BI torsions | Hydrogens omitted; H-bonds drawn between heavy donor/acceptor atoms. Public domain (CC0). |
| **A02** | **A-RNA Duplex & Ribonucleotides** (`A, U, G, C` + $2'\text{-OH}$) | All-heavy-atom regularised template (`BACKBONE_RNA`) | Olson et al. (2001) base frame; Gelbin et al. (1996) / Arnott et al. (1972) $C3'\text{-endo}$ A-RNA parameters (`rise = 2.81 Å`, `11.0 bp/turn`) | Å, standard base frame (`z = 0`), explicit `"O2'"` atom bonded to `"C2'"` (`1.413 Å`) | Hydrogens omitted; ideal regular A-form screw symmetry. Public domain parameters. |
| **A03** | **Bacterial RNA Polymerase (`RNAP`)** | Translucent volumetric envelope with active-site cutaway | Scaled to *E. coli* core RNAP dimensions (reference: PDB `6ALH` / `4YG2`, $\sim 150 \times 115 \times 110\,\text{Å}$, scaled to oligo scene) | Anchors: `dnaEntry`, `activeSite`, `dnaExit`, `rnaExit` | Soft procedural envelope so the internal 9-bp RNA·DNA hybrid and incoming rNTPs remain unobstructed. |
| **A04** | **Bacterial 70S Ribosome (`30S` + `50S` Subunits)** | Two-subunit translucent volumetric envelopes with decoding & tunnel cutaway | Scaled to *E. coli* 70S elongation complex architecture (reference: PDB `8FIZ`, 30S small subunit on mRNA track, 50S large subunit with peptide exit tunnel) | Anchors: `mrnaEntry`, `siteA`, `siteP`, `siteE`, `mrnaExit`, `peptideTunnelExit` | Subunits rendered as distinct 30S and 50S envelopes that assemble at initiation and separate at termination. |
| **A05** | **tRNA Carriers (`fMet-tRNAfMet` & `aa-tRNA`) & Release Factor (`RF1`)** | 3-nucleotide atomic anticodon triplet + L-shaped volumetric carrier body | Reference: canonical L-shaped tRNA architecture ($\sim 70\,\text{Å}$ arm span compressed to match scene scale) | Anchors: `anticodon` (base-paired to mRNA codon in A/P sites), `acceptorStem` (carrying nascent residue) | Precharged tRNAs enter A-site; initiator `fMet-tRNA` enters P-site directly; `RF1` binds `UAA` stop codon without adding an amino acid. |
| **A06** | **Nascent Polypeptide Chain** (`fMet-A-E-F-K-G-S-D-Y-Q-A`) | Coarse-grained $C\alpha$ residue spheres (`radius 1.9 Å`) linked by peptide bond cylinders | Standard $\alpha\text{-carbon}$ virtual bond distance ($\sim 3.8\,\text{Å}$ per residue) emerging from the 50S exit tunnel | Residue index `0..10`, colored by physicochemical class (initiator formyl-Met, nonpolar, polar, charged) | Represented at 1-bead-per-residue ($C\alpha$) resolution; no all-atom side-chain folding prediction is claimed. |
| **A07** | ***E. coli* RNA polymerase elongation complex** (`assets/rnap-ec.asset.json`, core α₂ββ′ω) | Helix asset v2, true scale: L0 7,596 tri, L1 3,174 Cα beads, L2 314 atoms (pre-ST5 L0/L1/L2 byte-for-byte preserved), `template` / `nontemplate` / `rna` tracks, `coupledMrna` path (25 pts, 138.4 Å) | Primary PDB `6ALF` (cryo-EM, 4.1 Å, rev 2024-03-13) + `7YPA` (3.05 Å, RMSD 1.161 Å: `hairpin`) + `6ZTJ` (3.4 Å, RNAP RMSD 1.021 Å, ribo RMSD 0.625 Å: `expressome`, `coupledMrna`, `D = 38` nt per `DEC-024`). Details in `docs/assets/rnap.md` | Å; `rnap` frame (`docs/CONTRACTS.md` §6.3); anchors `center`, `activeSite`, `dnaEntry`, `dnaExit`, `rnaExit`, `ntpEntry` (synthetic), `hairpin`, `expressome` | CC0 (wwPDB). Rigid assembly; non-template bubble −9…−3 & `ntpEntry` synthetic; 147.4 kB (≤ 220 kB). |
| **A08** | ***E. coli* RNA polymerase σ⁷⁰ holoenzyme** (`assets/rnap-holo.asset.json`, parts `core` + `sigma` `role: release`) | Helix asset v2, true scale: L0 9,964 tri, L1 3,685 Cα beads, L2 291 atoms (pre-ST5 L0/L1/L2 byte-for-byte preserved), RPo `template` / `nontemplate` tracks (−45…+11, bubble −11…+2) | Primary PDB `6C9Y` (cryo-EM, 4.25 Å, rev 2024-03-13) + `6CA0` RPo DNA tracks (5.75 Å, RMSD 1.014 Å, `DEC-023`). Details in `docs/assets/rnap.md` | Å; `rnap` frame (β′ Cα superposition 2.37 Å); anchors `center`, `activeSite`, `ntpEntry` (synthetic) | CC0 (wwPDB). Rigid assembly; σ⁷⁰ region 1.1 unmodelled; disordered template bubble −10…0 & +1 non-template interpolated; 184.1 kB (≤ 220 kB). |
| **A09** | ***E. coli* 70S ribosome** (`assets/ribosome-70s.asset.json`, parts `small` + `large`, 52 chains) | Helix asset v2, true scale: L0 48,064 tri, L1 9,978 beads (P/Cα), L2 756 atoms (`decoding` + `ptc`, 12 Å), `mrna` track (−16…+15), `tunnel` path (86.71 Å, 88 pts, min clearance 3.66 Å) | Primary PDB `7K00` (cryo-EM, 1.98 Å) + composite superpositions `7ST2` (2.9 Å, RMSD 0.73 Å: `siteE`, `antiSD`, `mrna` −14…−4) and `5WE4` (3.1 Å, RMSD 0.61 Å: `siteAT`); `7PJV` tested, `siteAP`/`sitePE` omitted (`DEC-010`). Full provenance in `docs/assets/ribosome-70s.md` | Å; `ribo` frame (`PLAN.md` §7.3); 13 anchors (`center`, `siteA`, `siteP`, `siteE`, `siteAT`, `decoding`, `ptc`, `tunnelExit`, `mrnaEntry`, `mrnaExit`, `antiSD`, `smallCenter`, `largeCenter`) | CC0 (wwPDB). Rigid ribosome; `mrna` registers −16, −15, +9…+15 synthetic; tunnel truncated at first solvent-side voxel after 60 Å (`DEC-009`). |
| **A10** | ***E. coli* initiator tRNA (`trna-init`)** (`assets/trna-init.asset.json`, parts `body` + `anticodon`) | Helix asset v2, true scale: L0 3,716 tri, L1 76 P beads, L2 42 atoms (`acceptor` 8 Å), `anticodon` track (`CAU`, reg 34–36) | PDB `7K00` chain `Z` (P-site tRNA-fMet, cryo-EM 1.98 Å). Full provenance in `docs/assets/trna.md` | Å; `trna` frame (`PLAN.md` §7.3); span 76.15 Å; anchors `center`, `acceptor`, `elbow` | CC0 (wwPDB). Rigid body; nt 1 unmodelled; aminoacyl/fMet group added procedurally by kinematics. |
| **A11** | ***E. coli* elongator tRNA (`trna-aa`)** (`assets/trna-aa.asset.json`, parts `body` + `anticodon`) | Helix asset v2, true scale: L0 3,712 tri, L1 73 P beads, L2 42 atoms (`acceptor` 8 Å), `anticodon` track (`UAC`, reg 34–36) | PDB `7K00` chain `Y` (A-site tRNA-Val, cryo-EM 1.98 Å). Full provenance in `docs/assets/trna.md` | Å; `trna` frame (`PLAN.md` §7.3); span 81.71 Å (`DEC-013`); anchors `center`, `acceptor`, `elbow` | CC0 (wwPDB). Rigid body reused for all 19 elongators (anticodon rebuilt per codon, D7); nt 16–17 unmodelled. |
| **A12** | ***E. coli* transcription–translation coupling factor NusG (`nusg`)** (`assets/nusg.asset.json`, part `body`) | Helix asset v2, true scale: L0 2,600 tri (96.3% containment), L1 161 Cα beads, no L2 | PDB `6ZTJ` chain `CF` (cryo-EM, 3.4 Å, rev 2026-06-24; RNAP β+β′ superposition RMSD 1.021 Å, 82.2% kept). Details in `docs/assets/rnap.md` §7 | Å; `rnap` frame; anchors `center`, `ntd` (`auth 6..117`), `ctd` (`auth 125..180`); NTD–CTD span 44.55 Å | CC0 (wwPDB). Rigid NTD+CTD bridge; loop 49–62 unmodelled; `subunit: 'nusg'` (`#15aabf`); 35.8 kB (≤ 120 kB). |
| **A13** | ***E. coli* peptide chain release factor 1 (`rf1`)** (`assets/rf1.asset.json`, part `body`) | Helix asset v2, true scale: L0 2,876 tri, L1 349 Cα beads, L2 70 atoms (`ggq` 8 Å, 68 bonds, 1 Mg²⁺) | PDB `8FZH` chain `w` (cryo-EM, 2.9 Å; 23S superposition RMSD 1.408 Å, 79.7% kept per `DEC-022`). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchors `center`, `ggq` (`GGQ` 233–235, 5.96 Å from `ptc`), `codonReader` (`PAT` 188–190, 7.61 Å from `siteA`) | CC0 (wwPDB). Rigid open-state conformer; 1 minor L1 contact (< 3.0 Å); 44.7 kB (≤ 120 kB). |
| **A14** | ***E. coli* elongation factor Tu (`ef-tu`)** (`assets/ef-tu.asset.json`, part `body`) | Helix asset v2, true scale: L0 2,060 tri, L1 393 Cα beads, no L2 | PDB `5WE4` chain `z` (cryo-EM, 3.1 Å; 16S+23S superposition RMSD 0.606 Å, 96.9% kept). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchors `center`, `gDomain` (`GHVDHGKT` 18–25, 16.12 Å from 23S SRL) | CC0 (wwPDB). Rigid ternary-complex conformer; GDPNP excluded; 0 clashes; 33.0 kB (≤ 120 kB). |
| **A15** | ***E. coli* elongation factor G (`ef-g`)** (`assets/ef-g.asset.json`, part `body`) | Helix asset v2, true scale: L0 3,624 tri, L1 703 Cα beads, no L2 | PDB `7PJV` chain `x` (cryo-EM, 3.1 Å; 23S superposition RMSD 0.777 Å, 94.6% kept per `DEC-010`). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchors `center`, `gDomain` (`AHIDAGKT` 16–23, 15.31 Å from SRL), `domainIV` (481–603, `DEC-022`) | CC0 (wwPDB). Rigid translocation conformer; GDP/Pi excluded; 1 clash (1.61 Å vs 16S U1211); 55.8 kB (≤ 120 kB). |
| **A16** | ***E. coli* translation initiation factor IF1 (`if1`)** (`assets/if1.asset.json`, part `body`) | Helix asset v2, true scale: L0 1,140 tri, L1 72 Cα beads, no L2 | PDB `9ZN2` chain `y` (cryo-EM, 3.0 Å; 16S+23S superposition RMSD 1.291 Å, 50.7% kept). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchor `center` (12.29 Å from `decoding`) | CC0 (wwPDB). Rigid conformer; 2 physiological decoding-center contacts (A1493/G1494); 18.5 kB (≤ 120 kB). |
| **A17** | ***E. coli* translation initiation factor IF2 (`if2`)** (`assets/if2.asset.json`, part `body`) | Helix asset v2, true scale: L0 3,932 tri, L1 595 Cα beads, no L2 | PDB `9ZN2` chain `x` (cryo-EM, 3.0 Å; 16S+23S superposition RMSD 1.291 Å, 50.7% kept). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchors `center`, `gDomain` (`GHVDHGKT` 398–405, 18.18 Å from 23S SRL) | CC0 (wwPDB). Rigid conformer; disordered NTD 1–295 & GDPCP excluded; 0 clashes; 57.8 kB (≤ 120 kB). |
| **A18** | ***E. coli* translation initiation factor IF3 (`if3`)** (`assets/if3.asset.json`, part `body`) | Helix asset v2, true scale: L0 1,540 tri, L1 102 Cα beads, no L2 | PDB `9FDA` chain `J` (cryo-EM, 2.0 Å; 16S superposition RMSD 0.985 Å, 93.4% kept; edeine excluded). Details in `docs/assets/factors.md` | Å; `ribo` frame; anchor `center` | CC0 (wwPDB). CTD 76–177 only (NTD 1–75 unmodelled); 6 contacts vs 50S H69 (anti-association); 23.4 kB (≤ 120 kB). |

## A07 and A08: pipeline and provenance details

Both assets are generated by `node tools/build-assets.mjs` from the mmCIF files pinned in `tools/sources.lock.json` (URL, download date, SHA-256, size). Raw mmCIF files are not committed; download them into `tools/sources/` (ignored by Git). The tool refuses a file whose hash or size differs, and its output is byte-identical between runs (`node tools/build-assets.mjs --check`).

### Preprocessing (both assets)

- mmCIF read by `tools/lib/mmcif.mjs`: model 1 only; alternate location `.` or `A`; hydrogens and deuterium dropped. Chains are identified by `auth_asym_id`, residues ordered by `label_seq_id`.
- Base frames (`tools/lib/frames.mjs`): least-squares fit of all `BASE_ATOMS[base]` atoms (including C1′) onto the observed atoms; at least 6 atoms and RMSD ≤ 0.5 Å required. Largest fit RMSD in 6ALF: 0.064 Å.
- L1: one bead per protein residue at Cα (residues without Cα are skipped; none in these entries).
- L0 (`tools/lib/surface.mjs`): Gaussian density of the part's Cα beads (σ = 5 Å, grid 5 Å, truncated at 3σ), marching cubes with a case table generated from consistent face rules, welded vertices, closed mesh, outward (counter-clockwise) winding. The iso-level is the highest bead-density quantile (starting at the 5th percentile, in 0.25-point steps) for which at least 95 % of the part's beads are inside the mesh by a ray-parity test.
- L2: heavy atoms of protein residues with any atom within 12 Å of `activeSite`, plus Mg/Zn ions within 20 Å; bonds within a residue or between sequence-adjacent residues when the distance is below the sum of covalent radii + 0.45 Å. Ions are assigned to the chain of their `auth_asym_id` and have no bonds.
- Coordinates quantised to 0.05 Å (int16); anchor and track frames stored as JSON (origin 0.001 Å, rotation 1e-6).

### A07 `rnap-ec` (PDB 6ALF)

Entry choice: 6ALF and 6ALH were both analysed with the same rule (longer RNA·DNA hybrid, then longer downstream duplex, then better resolution). Both have a 9-bp hybrid, a 13-bp downstream duplex and a 6-bp upstream duplex; 6ALF wins on resolution (4.1 Å versus 4.4 Å) and also has the longer RNA (12 versus 10 modelled nucleotides). Note: the 6ALF entry title describes a crosslinked elongation complex; the cited study concerns transcription arrest by HK022 Nun (Nun itself is not in the entry). The 13th downstream pair (non-template A17 to template B13, origin distance 2.37 Å, normals 42.6° from antiparallel) is marginal in 6ALF.

| Chain | Entity description (mmCIF) | Class | Modelled / entity length | Missing `label_seq_id` | Use |
| :--- | :--- | :--- | :--- | :--- | :--- |
| G | DNA-directed RNA polymerase subunit alpha | protein | 222 / 239 | 1–7, 160–165, 236–239 | core, α I |
| H | DNA-directed RNA polymerase subunit alpha | protein | 220 / 239 | 1–4, 159–169, 236–239 | core, α II |
| I | DNA-directed RNA polymerase subunit beta | protein | 1316 / 1342 | 1, 891–914, 1342 | core, β |
| J | DNA-directed RNA polymerase subunit beta' | protein | 1337 / 1407 | 1–15, 934–947, 1127–1133, 1374–1407 | core, β′ |
| K | DNA-directed RNA polymerase subunit omega | protein | 79 / 80 | 1 | core, ω |
| B | DNA (29-MER) | dna | 29 / 29 | none | `template` track |
| A | DNA (5′-D(…)-3′) | dna | 22 / 29 | 7–13 | `nontemplate` track |
| R | RNA (5′-R(…)-3′) | rna | 12 / 20 | 1–8 | `rna` track |

Protein source organism: *Escherichia coli* (strain K12). Nucleic acids: synthetic scaffold (entity source recorded as Enterobacteria phage T7). No other chains; ligands: one Mg²⁺, two Zn²⁺. The entity descriptions do not name the template strand; chain B was identified as the template because it is the only DNA chain that base-pairs with the RNA.

Pairing rule (used throughout): fitted base-frame origins within 2.5 Å and antiparallel base normals, assigned one-to-one in order of increasing origin distance.

Tracks and synthetic segments:

| Track | Registers | Synthetic registers | Source |
| :--- | :--- | :--- | :--- |
| `rna` | −12 … −1 | none | R9–R20; −1 is the 3′-terminal nucleotide R20 |
| `template` | −15 … +13 | none | B29 … B1 (register = 14 − `label_seq_id`) |
| `nontemplate` | −15 … +13 | −9 … −3 | A1–A6 and A14–A29 fitted; A7–A13 absent from the model, frames interpolated (linear origin, slerp rotation) between A6 and A14, bases from `_entity_poly` |

Checks: the hybrid (−9 … −1) and both duplexes (−15 … −10, +1 … +13) are Watson–Crick complementary in the track bases. The non-template bubble (−9 … 0) and RNA −12 … −10 are non-complementary to the template by scaffold design. The 5′ RNA nucleotides 1–8 and any extrapolation beyond the modelled ends are not included.

Frame, anchors, and measurements:

- Origin: midpoint of the base-frame origins of `rna(−1)` and `template(−1)`. `+z`: least-squares axis through the 12 base-pair centres of registers +2 … +13. `+x`: Cα centroid direction perpendicular to `z`.
- `activeSite`: the Mg²⁺ ion (auth chain J, 1501), 2.05 Å from O3′ of `rna(−1)`.
- `dnaEntry`: base-pair centre of register +13; `dnaExit`: base-pair centre of register −15; `rnaExit`: P of R9.
- Angle between the upstream duplex axis (6 bp centres, registers −15 … −10) and the downstream duplex axis (+2 … +13): **63.8°**.
- Bounds (Cα): radius 83.1 Å; size 108.0 × 144.3 × 136.7 Å.
- Counts: L1 3,174 beads; L0 7,596 triangles (3,792 vertices, 95.1 % of beads inside); L2 314 atoms (313 protein + 1 Mg²⁺), 299 bonds, radius 12 Å; file 142,365 bytes.

Simplifications: the nucleic acids are represented only as slot tracks (no beads, mesh or atoms); the non-template bubble frames are interpolated, not observed; L0 is a smoothed Cα envelope, not a molecular surface.

### A08 `rnap-holo` (PDB 6C9Y)

Entry choice: 6C9Y (holoenzyme, 4.25 Å) and 6CA0 (open complex, 5.75 Å) both contain the full core and σ⁷⁰; 6C9Y is chosen for its better resolution. 6CA0 was inventoried only.

| Chain | Entity description (mmCIF) | Modelled / entity length | Missing `label_seq_id` | Part |
| :--- | :--- | :--- | :--- | :--- |
| A | DNA-directed RNA polymerase subunit alpha | 230 / 329 | 1–6, 237–329 | core |
| B | DNA-directed RNA polymerase subunit alpha | 221 / 329 | 1–5, 161–167, 234–329 | core |
| C | DNA-directed RNA polymerase subunit beta | 1340 / 1342 | 1–2 | core |
| D | DNA-directed RNA polymerase subunit beta' | 1350 / 1407 | 1–7, 932–944, 1129–1134, 1377–1407 | core |
| E | DNA-directed RNA polymerase subunit omega | 76 / 91 | 1, 78–91 | core |
| F | RNA polymerase sigma factor RpoD | 468 / 613 | 1–93, 168–212, 237–242, 613 | sigma |

- Superposition: β′ Cα atoms matched by `label_seq_id` (identical β′ entity sequences in 6ALF and 6C9Y; no residue-name mismatches), 1,334 pairs, RMSD 2.37 Å (limit 6 Å).
- `activeSite`: the holoenzyme Mg²⁺ (auth chain D, 2001), 1.74 Å from the A07 `activeSite` after superposition. `center`: Cα centroid of all six chains. `dnaEntry`, `dnaExit`, `rnaExit` are not defined (no nucleic acids).
- Counts: L1 3,685 beads; L0 core 8,068 triangles, sigma 1,896 triangles; L2 291 atoms (290 protein + 1 Mg²⁺), 276 bonds; bounds radius 103.3 Å, size 133.9 × 149.0 × 138.9 Å; file 166,612 bytes.
- Simplification: one rigid-body placement; σ⁷⁰ region 1.1 (residues 1–93) is not modelled in the entry and is absent from the asset.
