# RNA polymerase (`rnap-ec`, `rnap-holo`) and NusG (`nusg`) assets

Task R3-A4 (Round 3, stage ST5). Recipes: `tools/assets/rnap.mjs`, `tools/assets/nusg.mjs`. Tests: `tests/assets-rnap-v2.test.mjs`, `tests/asset-budgets.test.mjs`. Outputs: `assets/rnap-ec.asset.json`, `assets/rnap-holo.asset.json`, `assets/nusg.asset.json` (Asset Format v2). Design basis: `PLAN.md` §§6.4, 7.2–7.5, 10 (R3-A4), `docs/CONTRACTS.md` §§6.3, 7.1, `docs/DECISIONS.md` (DEC-002, DEC-008, DEC-010, DEC-011, DEC-019).

`rnap-ec` and `rnap-holo` preserve their Round 2 Wave 1 L0 meshes, L1 bead arrays, L2 heavy-atom/bond buffers, `bounds`, and `chains` **byte-for-byte**, upgrading only to Format v2 metadata (`version: 2`, `parts[].role`, `lod2.sites: [{ anchor: 'activeSite', radius: 12 }]`) plus the Round 3 anchors, tracks, and paths.

---

## 1. Provenance and confirmed PDB chains

All structures are loaded through `ctx.loadSource(pdbId)` (SHA-256 and byte length verified against `tools/sources.lock.json`; model 1, altloc `.` or `A`, no hydrogens). Licence of all wwPDB entries: CC0 1.0 Universal.

| PDB | Title | Method, resolution | Revision | Role in A4 |
| --- | --- | --- | --- | --- |
| **6ALF** (primary `rnap-ec`) | CryoEM structure of crosslinked *E. coli* RNA polymerase elongation complex | cryo-EM, 4.1 Å | 2023-11-08 | `rnap` frame, core L0/L1/L2, `rnap-ec` tracks (`template`, `nontemplate`, `rna`), base anchors (`center`, `activeSite`, `dnaEntry`, `dnaExit`, `rnaExit`) |
| **6C9Y** (primary `rnap-holo`) | Cryo-EM structure of *E. coli* RNAP σ⁷⁰ holoenzyme | cryo-EM, 4.25 Å | 2024-03-06 | `rnap-holo` core + σ⁷⁰ L0/L1/L2, `center`, `activeSite` |
| **6CA0** (`rnap-holo` RPo DNA) | Cryo-EM structure of *E. coli* RNAP σ⁷⁰ open complex | cryo-EM, 5.75 Å | 2024-03-06 | `rnap-holo` open-promoter (RPo) DNA tracks (`template`, `nontemplate`) — see note below |
| **7YPA** (`rnap-ec` hairpin) | Cryo-EM structure of *E. coli* transcription termination complex with hairpin | cryo-EM, 3.05 Å | 2023-07-12 | `rnap-ec` `hairpin` anchor (closing base pair and 10-bp stem axis) |
| **6ZTJ** (`rnap-ec` coupling & `nusg`) | Cryo-EM structure of the NusG-coupled expressome with 38 nt intervening mRNA | cryo-EM, 3.4 Å | 2024-03-06 | `rnap-ec` `expressome` anchor, `coupledMrna` path, coupling distance `D`, and `nusg` asset |
| **7K00** (ribosome reference) | Structure of the Bacterial Ribosome at 2 Angstrom Resolution | cryo-EM, 1.98 Å | 2026-09-23 | `ribo` frame reference via `tools/assets/ribosome.mjs#frameAtoms` for 6ZTJ ribosome alignment |

### Confirmed chain IDs (verified directly against downloaded mmCIF files)

- **6ALF:** α `G` (222 res), α `H` (220), β `I` (1316), β′ `J` (1337), ω `K` (79); non-template DNA `A` (22 nt), template DNA `B` (29 nt), RNA `R` (12 nt). Catalytic Mg²⁺: `label_asym I`, `auth J 1501`.
- **6C9Y:** α `A` (230 res), α `B` (221), β `C` (1340), β′ `D` (1350), ω `E` (76), σ⁷⁰ `F` (468). **Zero nucleic-acid chains** (protein only). Catalytic Mg²⁺: `label_asym G`, `auth D 2001`.
- **6CA0:** α `A` (230), α `B` (228), β `C` (1340), β′ `D` (1352), ω `E` (76), σ⁷⁰ `F` (472); promoter DNA split into four chains: `G` (45 nt, `auth 3..47`, non-template upstream + bubble `−45..−1`), `H` (35 nt, `auth 26..60`, template upstream `−45..−11`), `I` (11 nt, `auth 15..25`, non-template downstream `+1..+11`), `J` (11 nt, `auth 3..13`, template downstream `+1..+11`).
- **7YPA:** α `A` (230), α `B` (219), β `C` (1319), β′ `D` (1338), ω `E` (80); non-template DNA `F`, template DNA `G`; RNA `H` (`auth −19..0`: hybrid `H:−9..0` + 3′ hairpin stem arm `H:−10..−19`), RNA `I` (`auth 10..19`: 5′ hairpin stem arm paired 10 bp with `H:−10..−19`).
- **6ZTJ:** RNAP α `CA`, `CB`, β `CC` (1338), β′ `CD` (1334), ω `CE`; **NusG `CF`** (161 modelled residues, `auth 6..180` of 181, unmodelled loop `49..62`); ribosome 16S rRNA `AA` (1533 nt), 23S rRNA `BA` (2900 nt), 5S rRNA `BB`, 30S uS10 `AJ`; **mRNA `AV`** (40 modelled residues, `auth 14..53` of 53-nt entity, continuous with zero internal gaps); P-site tRNA `AW` (paired with `AV:16..18` `AUG`), A-site tRNA `AX` (paired with `AV:19..21` `UUC`); template DNA `CT` (paired 9 bp with `AV:45..53`), non-template DNA `CN`.
- **7K00** (via `frameAtoms`): 16S rRNA `A` (1519 P atoms), 23S rRNA `a` (2753 P atoms).

> **Important provenance note (`6C9Y` vs `6CA0`):** `PLAN.md` §§7.2 and 10 mention "6C9Y RPo DNA tracks", but inspection of `6C9Y.cif` confirms that `6C9Y` is the DNA-free σ⁷⁰ holoenzyme (protein chains `A–F` only). The RPo open-promoter complex from the same study (Narayanan et al., 2018) is **PDB `6CA0`**, which was already pinned in `tools/sources.lock.json` and listed in `tools/assets/rnap.mjs` (`sources: ['6C9Y', '6CA0']`). `rnap-holo` keeps `6C9Y` as its primary protein structure (preserving L0/L1/L2 byte-for-byte) and derives its RPo tracks from `6CA0` superposed onto `6C9Y`.

---

## 2. Superpositions

All Round 3 superpositions use `superposeIterative` (`tools/lib/superpose.mjs`, 2 passes, 2.0 Å outlier cutoff) and enforce both the RMSD gate (`≤ 2.5 Å` for RNAP β+β′ Cα; `≤ 1.5 Å` for ribosome 16S+23S P) and the minimum kept-fraction gate (`≥ 50 %`, `DEC-010`). Ribosome P matching uses `{ key: 'authSeq', matchComp: true }` (`DEC-011`).

| Asset | Mobile → Reference | Scope (chains) | Matching | `n` before | `n` after | Kept | RMSD before (Å) | RMSD after (Å) | Gate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `rnap-holo` (existing) | `6C9Y` → `6ALF` | β′ Cα (`D` → `J`) | `label_seq_id` (1-pass Kabsch, preserved) | 1334 | 1334 | 100.0 % | 2.374 | 2.374 | pass |
| `rnap-holo` (RPo tracks) | `6CA0` → `6C9Y` | β+β′ Cα (`C,D` → `C,D`) | `label_seq_id` | 2684 | 2252 | 83.9 % | 1.689 | **1.014** | ≤ 2.5 Å, ≥ 50 % — pass |
| `rnap-ec` (`hairpin`) | `7YPA` → `6ALF` | β+β′ Cα (`C,D` → `I,J`) | `label_seq_id` | 2615 | 1906 | 72.9 % | 2.221 | **1.161** | ≤ 2.5 Å, ≥ 50 % — pass |
| `rnap-ec`, `nusg` (RNAP) | `6ZTJ` → `6ALF` | β+β′ Cα (`CC,CD` → `I,J`) | `label_seq_id` | 2648 | 2176 | 82.2 % | 2.087 | **1.021** | ≤ 2.5 Å, ≥ 50 % — pass |
| `rnap-ec` (ribosome) | `6ZTJ` → `7K00` (`ribo`) | 16S+23S P (`AA,BA` → `A,a`) | `auth_seq_id` + `comp` (13 mismatches excluded) | 4255 | 4181 | 98.3 % | 0.779 | **0.625** | ≤ 1.5 Å, ≥ 50 % — pass |

For `6ZTJ → 7K00`, per-chain matches before trimming are `16S = 1516` (2 comp mismatches excluded) and `23S = 2739` (11 comp mismatches excluded).

---

## 3. `rnap-holo` RPo tracks (`6CA0`)

- **Register mapping (register `0` = `+1` transcription start site):**
  - `G` (`auth 3..47`, non-template upstream + bubble): `reg = authSeq − 48` (`−45..−1`). Confirmed `-10` consensus `TATAAT` at `G:36..41` → registers `−12..−7`, followed by the 6-nt discriminator `GTGTGC` at `−6..−1`.
  - `H` (`auth 26..60`, template upstream): `reg = 15 − authSeq` (`−45..−11`). `H:60..27` pairs Watson–Crick with `G:3..36` (`−45..−12`, base-frame origin distance `≤ 2.06 Å`); `H:26` (`T`, reg `−11`) is melted out of the duplex (`d(G:37, H:26) = 24.24 Å`).
  - `I` (`auth 15..25`, non-template downstream) and `J` (`auth 3..13`, template downstream): `I` `reg = authSeq − 14` (`+1..+11`), `J` `reg = 14 − authSeq` (`+1..+11`). Verified against `rnap-ec` downstream registers `+1..+11`: mean origin distance `1.96 Å` (`I` vs `rnap-ec` non-template) and `2.53 Å` (`J` vs `rnap-ec` template), whereas shifting by 1 register (`+0..+10`) degrades alignment to `5.53 Å / 5.10 Å`.
- **Combined range:** registers `−45..+11` (57 registers on both `template` and `nontemplate`).
- **Observed vs synthetic (`DEC-008`):**
  - `nontemplate`: 56 observed (`synthetic = 0`, `sources = "6CA0"`), 1 interpolated at register `0` (`synthetic = 1`, `sources = "synthetic"`, base `'A'`).
  - `template`: 46 observed (`synthetic = 0`, `sources = "6CA0"`), 11 interpolated across the disordered single-stranded template bubble `−10..0` (`synthetic = 1`, `sources = "synthetic"`, bases = Watson–Crick complement of `G:38..47` plus `'T'` at `0`).
- **Bubble visibility and clash audit:**
  - Across bubble registers `−11..+2`, template–nontemplate base-frame origin separation spans **2.986–28.011 Å** (all strictly `> 2.5 Å`, visibly unpaired).
  - Across all 57 registers posed via `poseDuplex` (`register = 45, bend = 1, bubble = [-11, 2], trackBlend = 0`), maximum DNA heavy-atom penetration into `rnap-holo` L1 beads (`1.9 Å` + atomic vdW radius) is **0.95 Å ≤ 1.0 Å**.

---

## 4. `ntpEntry` anchors (`rnap-ec` and `rnap-holo`)

Computed by the exact `PLAN.md` §7.4 algorithm (`computeNtpEntry` in `tools/assets/rnap.mjs`):
1. Cast 256 deterministic Fibonacci-sphere unit rays from `activeSite`.
2. Discard rays within `35°` of `+z`, `−z`, or `norm(rnaExit − activeSite)` (`rnap-holo` uses `rnap-ec` `rnaExit` since both share the `rnap` frame). `185` of `256` rays remain on both assets.
3. For each kept ray, compute the exact minimum Euclidean distance from any L1 bead to the line segment `[activeSite + 5·ray, activeSite + 35·ray]`.
4. Select the ray with the largest minimum clearance, place `o = activeSite + 30·ray`, set `+z = −ray` (pointing inward toward `activeSite`), `+x` by the perpendicular-component rule against `[1, 0, 0]`, `+y = z × x`, and mark `synthetic: 1`.

| Asset | Kept rays | Selected unit ray | Min L1 clearance over 5–35 Å | `ntpEntry.o` (Å) |
| --- | ---: | --- | ---: | --- |
| `rnap-ec` | 185 / 256 | `[0.655701, 0.441406, 0.612549]` | **6.418 Å** | `[24.303, 17.807, 11.986]` |
| `rnap-holo` | 185 / 256 | `[0.655701, 0.441406, 0.612549]` | **6.442 Å** | `[25.897, 18.503, 11.938]` |

Both RNAP states select the identical secondary-channel direction; their origins differ by `1.74 Å`, matching the `1.74 Å` shift of the `6C9Y` catalytic Mg²⁺ relative to `6ALF`.

---

## 5. `hairpin` anchor on `rnap-ec` (`7YPA`)

After superposing `7YPA` β (`C`) and β′ (`D`) onto `6ALF` (`I`, `J`) (`1906/2615` kept = `72.9 %`, RMSD `2.221 → 1.161 Å`), `pairStrands(I, H)` identifies the 10-bp termination hairpin stem (`I:10..19` paired with `H:−10..−19`).

- **Closing base pair (nearest `rnaExit`):** `I:10 (C) — H:−10 (G)` (base-frame origin distance `0.657 Å`).
- **Anchor origin:** closing base-pair midpoint `o = [-32.384, -9.451, -5.123]` Å (`9.377 Å` from `rnaExit`).
- **Anchor orientation:** `+z = [-0.643951, 0.387257, -0.659817]` is the least-squares stem helix axis (`fitLine` over all 10 stem base-pair centres, oriented from closing pair toward the apical loop into solvent); `+x` is the closing base-pair dyad perpendicular to `+z`; `+y = z × x`.
- **Stem clearance check:** an ideal 8-bp A-form stem (`HELIX_A`) grown along `+z` from `hairpin` has worst-case heavy-atom penetration into `rnap-ec` L1 beads of **0.45 Å ≤ 1.0 Å** and places the apical loop cleanly into solvent (`14.6 Å` from RNAP L1).

---

## 6. Expressome coupling geometry, `coupledMrna` path, and coupling distance `D` (`6ZTJ`)

### 6.1 `expressome` anchor

Combining the two `6ZTJ` superpositions yields the rigid transform placing `ribosome-70s` (`ribo` frame) into the `rnap` frame:

$$T_{\text{expressome}} = T_{\text{6ZTJ} \to \text{rnap}} \circ T_{\text{6ZTJ} \to \text{ribo}}^{-1}$$

- `expressome.o = [-118.594, -22.347, -56.686]` Å (`133.33 Å` from RNAP origin; ribosome `center` sits at `[-165.64, -14.76, -67.71]` Å, **`184.12 Å`** from RNAP `center`).
- **Clash audit:**
  - Minimum distance between `ribosome-70s` L1 beads (at `expressome`) and `rnap-ec` L1 beads: **7.389 Å** (zero contacts `< 5 Å`).
  - Minimum distance between `ribosome-70s` L1 beads (at `expressome`) and the 248-bp Construct v3 DNA duplex (`poseDuplex` audited across registers `107, 130, 160, 190, 223`): **18.15 Å** (zero clashes).

### 6.2 Coupling distance `D` and exact counting method

`PLAN.md` §6.4 defines `D` as the number of nucleotides from the first nucleotide of the ribosome's P-site codon to the RNA 3′-terminal nucleotide in RNAP in the `6ZTJ` expressome, counting any unmodelled nucleotides.

**Exact measurement on `6ZTJ.cif` chain `AV` (mRNA, 53-nt entity, residues `14..53` modelled continuously):**
1. **Ribosome P-site codon:** Base-pairing `AV` against P-site tRNA `AW` identifies the Watson–Crick codon–anticodon triplet at **`AV:16..18` (`A-U-G`)** (also confirmed against `7K00` after superposition: `AV:16` aligns with `ribosome-70s` `mrna` register `0`). The first nucleotide of the P-site codon is **`AV:16` (`A`)**.
2. **RNAP RNA 3′ end:** Base-pairing `AV` against template DNA `CT` identifies a 9-bp RNA–DNA hybrid (`AV:45..53`), terminating at the 3′-end nucleotide **`AV:53` (`G`)** in the RNAP active site (aligning with `rnap-ec` `rna` register `−1`).
3. **Unmodelled nucleotides in span `[16, 53]`:** **0** — every integer `auth_seq_id` from `16` through `53` is present and modelled in chain `AV`.
4. **Inclusive count:**
   $$D = 53 - 16 + 1 = 38\text{ nt}$$
   - This matches the `6ZTJ` wwPDB title verbatim (*"38 nt intervening mRNA"*).
   - It matches the `PLAN.md` §6.4 transcript-length convention `24 + D`: in Construct v3, the start codon begins at 0-based mRNA index `24`, so when the transcript has length `24 + D` (indices `0 .. 24 + D − 1`), the span from the first nucleotide of the start codon (`24`) to the 3′-terminal nucleotide (`24 + D − 1`) contains `(24 + D − 1) − 24 + 1 = D` nucleotides inclusive.
5. **Range check (`PLAN.md` §13 fallback rule):** `PLAN.md` §6.4 expected roughly 45–55 nt, and §13 states: *"If `D` from 6ZTJ is outside 40–60 nt: use the computed `D` anyway if there is no clash; otherwise adjust the RNAP–ribosome offset along the connecting mRNA path."* Because `ribosome-70s` L1 at `expressome` has **zero clash** with `rnap-ec` L1 (`7.389 Å`) and DNA (`18.15 Å`), and `js/sim/gene/timeline.js` accepts integer `D ∈ [38, 139]` (yielding `⌊(179 − 24 − 38) / 3⌋ = 39` coupled cycles = codons `2..40` with 0 leftover nucleotides), we keep the exact experimental value **`D = 38`** with zero synthetic offset, stored in `rnap-ec.source.coupling.D`.

### 6.3 `coupledMrna` path (`rnap-ec.paths.coupledMrna`)

25 points in the `rnap` frame, total arc length **138.414 Å**, encoded with a per-point `synthetic` array (`DEC-002`):

| Segment | Points | Source | `synthetic` | Notes |
| --- | --- | --- | :---: | --- |
| RNAP exit connector | 1 (`[0]`) | `rnap-ec` `anchors.rnaExit.o` | `1` | Connects cleanly to `rnap-ec` RNA exit (`7.8 Å` to `AV:41`, min RNAP L1 `8.67 Å`) |
| Observed intervening mRNA | 19 (`[1..19]`) | `6ZTJ` `AV:41` → `AV:23` (backbone `P` atoms in `rnap` frame) | `0` | Continuous observed cryo-EM backbone from RNAP exit channel (`AV:41`) to 30S mRNA entry channel (`AV:23`, ribo register `+7`); min RNAP L1 `9.1 Å`, min ribosome L1 `4.3 Å` |
| Ribosome entry bridge | 5 (`[20..24]`) | Linear 5-step interpolation (`5.1 Å`/step) from `AV:23` to `expressome(ribosome-70s.anchors.mrnaEntry)` | `1` | Bridges `AV:23` to `ribosome-70s` `mrnaEntry` (`25.5 Å`; min ribosome L1 clearance `3.23 Å`, zero clash). Needed because `ribosome-70s` `mrnaEntry` (`mrna(+15)`) is synthetically extrapolated straight out of `7K00` (`+8`), whereas real `6ZTJ` mRNA bends toward RNAP outside the 30S channel (`AV:25..31`). |

---

## 7. NusG asset (`assets/nusg.asset.json`)

Extracted from `6ZTJ` chain `CF` (161 modelled Cα beads, `auth 6..180` of 181; residues `1..5`, `49..62`, and `181` unmodelled in `6ZTJ`) and transformed into the `rnap` frame by `T_{6ZTJ → rnap}` (RMSD `1.021 Å`, `82.2 %` kept).

- **Parts & tint safety (`DEC-019` L3):** single part `{ id: 'body', name: 'NusG (NTD + CTD)', role: 'body' }`, single chain `{ id: 'CF', part: 'body', class: 'protein', name: 'NusG (nusG)', residues: 161, subunit: 'nusg' }`. Neither `subunit` nor `name` contains RNAP tint substrings (`alpha`/`beta`/`omega`/`sigma`), so `js/render/actors.js` renders both L0 and L1 in the locked NusG colour `#15aabf`.
- **Anchors (`rnap` frame):**
  - `center`: `[-35.360, -41.357, 22.757]` Å (all 161 Cα centroid).
  - `ntd`: `[-22.914, -44.654, 33.246]` Å (N-terminal RNAP-binding domain, `auth 6..117`, 98 Cα; `11.76 Å` from nearest `rnap-ec` L1 bead).
  - `ctd`: `[-55.510, -35.026, 4.440]` Å (C-terminal uS10-binding KOW domain, `auth 125..180`, 56 Cα; `11.21 Å` from nearest `ribosome-70s` L1 bead at `expressome`).
  - NTD–CTD separation: **44.554 Å**; `+z` of both `ntd` and `ctd` points along the NTD → CTD bridge axis.
- **L0 envelope:** `sigma = 4.5 Å`, `spacing = 2.5 Å`, **2,600 triangles** (`1,304` vertices), closed, outward winding (`volume = 22,648 Å³`), **96.3 %** of L1 beads inside (`≥ 95 %`). No L2 (`PLAN.md` §7.4).

---

## 8. LOD and file-size budgets (`PLAN.md` §7.5)

| Asset | Format | L0 triangles (budget) | L1 beads (budget) | L2 atoms (budget) | File size (budget) | Pre-ST5 L0/L1/L2 preserved |
| --- | :---: | ---: | ---: | ---: | ---: | :---: |
| `rnap-ec` | v2 | 7,596 (existing) | 3,174 (existing) | 314 / 299 bonds (existing) | **147,398 B** (≤ 220 kB) | byte-for-byte identical |
| `rnap-holo` | v2 | 9,964 (8,068 + 1,896, existing) | 3,685 (existing) | 291 / 276 bonds (existing) | **184,068 B** (≤ 220 kB) | byte-for-byte identical |
| `nusg` | v2 | **2,600** (≤ 8,000) | **161** (≤ 900) | none (≤ 400) | **35,832 B** (≤ 120 kB) | n/a (new) |

---

## 9. Simplifications disclosed

- **Rigid assemblies:** `rnap-ec`, `rnap-holo`, `ribosome-70s`, and `nusg` are rigid models; clamp opening/closing between holoenzyme (`6C9Y`) and elongation complex (`6ALF`) and NusG linker flexibility are not dynamically deformed.
- **RPo bubble interpolation (`6CA0`):** the disordered single-stranded template strand (`−10..0`) and `+1` non-template nucleotide are not resolved in `6CA0` and are interpolated (`synthetic = 1`) between flanking fitted bases; upstream (`−45..−11`), non-template bubble (`−11..−1`), and downstream (`+1..+11`) frames come directly from `6CA0` (`synthetic = 0`).
- **Secondary-channel `ntpEntry`:** computed geometrically by ray casting (`synthetic = 1`) rather than from a nucleotide-bound crystal/cryo-EM structure.
- **Coupling geometry:** fixed at the `6ZTJ` NusG-coupled expressome pose (`D = 38` nt); the last `25.5 Å` of `coupledMrna` bridges observed `6ZTJ` `AV:23` to the synthetic `ribosome-70s` `mrnaEntry` anchor (`synthetic = 1`).
