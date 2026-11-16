# Validation & Milestone Evidence (`M0–M5`)

Updated: 2026-11-16
Branch: `feat/rna-gene-expression`
Owner: Review & Verification Role (Agent 4 — Gemini 3.8 Flash / 3.5 Flash-Lite + Agent 0 — Gemini 4 Argon)

---

## 1. Automated Test Suite Summary (`37 / 37 PASS`)

Command: `node --test tests/science.test.mjs tests/sim.test.mjs`
Duration: `6.87 s` (`0` failures)

| Test Suite | Tests | Key Invariants Verified |
| :--- | :---: | :--- |
| **B-DNA & 1BNA Crystal Science** (`tests/science.test.mjs` #1–#8) | 8 | Canonical B-DNA rise ($3.38\,\text{Å}$), pitch ($35.5\,\text{Å}$), covalent bonds ($1.20\text{–}1.65\,\text{Å}$), $O3'\text{–}P$ link ($1.607\pm 0.03\,\text{Å}$), zero steric clashes, `1BNA` crystal waters & H-bonds, SantaLucia (1998) $\Delta G^\circ_{37}$ & $T_m$, helix–coil fraying. |
| **A-RNA, Uracil & $2'\text{-OH}$ Science** (`tests/science.test.mjs` #9–#12) | 4 | Uracil (`U`) planar ring geometry in Olson (2001) reference frame; ribose $C2'\text{–}O2'$ bond length ($1.4130\,\text{Å}$); regularised C3'-endo A-RNA duplex (`HELIX_A`, rise $2.81\,\text{Å}$, $11.0\,\text{bp/turn}$, $O3'\text{–}P = 1.6018\,\text{Å}$, zero non-bonded clashes); canonical `A·U` and wobble `G·U` H-bond pairs; Turner / Xia et al. (1998) RNA nearest-neighbour thermodynamics ($T_m(\text{RNA}) > T_m(\text{DNA})$). |
| **Bacterial Gene Construct & Genetic Code** (`tests/science.test.mjs` #13) | 1 | 48-bp construct (`-10 TATA` promoter, `AGGAGGUA` $5'\text{ UTR}$ with Shine–Dalgarno, 11 sense codons, `TAA`/`UAA` stop); initiator `AUG` mapped to `fMet` (`N-Formylmethionine`); `UAA` stop codon adds 0 residues. |
| **Melting & Replication Sims** (`tests/sim.test.mjs` #1–#21) | 21 | Glauber heat-bath dynamics, DNA & RNA duplex melting, replication fork unwinding, leading/lagging synthesis, Okazaki fragments, pure-time `seek()` reproducibility. |
| **Bacterial Gene Expression Sim** (`tests/sim.test.mjs` #22–#24) | 3 | 48-bp DNA + 44-nt ribose mRNA (`O2'` and `U` verified) + 33-nt tRNA anticodons + 11 nascent polypeptide residues (`fMet-A-E-F-K-G-S-D-Y-Q-A`); bit-exact forward/backward `seek(p)` across 201 samples; parental DNA re-annealing behind RNAP; `fMet` at residue 0; `RF1` recruitment at `UAA` stop codon without adding a 12th residue. |

---

## 2. Packaging & Static Runtime Audit

- **Zero External Runtime Requests:** All modules use local ES module imports (`./js/vendor/three.module.min.js`, `./js/vendor/addons/...`, local `CRYSTAL_1BNA`, and procedural macromolecular envelopes). No CDN, font, analytics, or remote PDB API calls are made at startup or during playback.
- **Resource & Memory Hygiene:** `MoleculeLayer`, `CartoonLayer`, `OverlayLayer`, and `Viewer` release all GPU geometries, materials, instanced buffers (`atoms`, `bonds`, `beads`, `residuesMesh`, `peptideBonds`), and DOM overlays on `clear()` and `dispose()`.
