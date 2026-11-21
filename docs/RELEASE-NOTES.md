# Helix v1.0.0 — Release Notes (Draft)

> **Status:** Draft prepared during Round 3 Stage ST9 (`R3-D1`) ahead of Gate G4 cutover (`R3-INT4`) and Stage ST10 release verification (`R3-Q3` / `R3-INT5`, Gate G5). Final release metrics and human visual/hardware sign-offs will be recorded in `docs/VALIDATION.md` and `docs/PERF.md` before tagging `v1.0.0` (`PLAN.md` §12).

---

## Highlights

### True-scale bacterial gene expression (`Express` mode)

Helix `v1.0.0` replaces the Round 1 placeholder-ellipsoid `Express` scene with a true-scale (`1 Å = 1 scene unit`, `PLAN.md` §2 D2) *Escherichia coli* transcription and translation scene built directly from experimental structural data:

- **Construct v3 (`PLAN.md` §5.1, `docs/SCIENCE.md` §3):** A 248-bp synthetic bacterial gene containing canonical `-35` (`TTGACA`) and `-10` (`TATAAT`) promoter elements, a 179-nt mRNA with Shine–Dalgarno (`AGGAGG`), a 40-codon open reading frame encoding all 19 non-proline amino acids (`fMet-A-E-F-K-G-S-D-Y-Q-...-S-Y-L`), an ochre stop codon (`UAA`), and an intrinsic terminator hairpin with an 8-U tract.
- **Step by step mode (`sequential`, `PLAN.md` §6.1):** 16 deterministic chapters (~164 s, exact **`164.05 s`** at `1×`) walking sequentially through promoter binding, open-complex formation, initiation, σ⁷⁰ release, elongation, intrinsic termination, 30S Shine–Dalgarno binding, `fMet-tRNA` P-site placement, 70S assembly, EF-Tu decoding, peptidyl transfer, EF-G translocation, 50S exit-tunnel emergence, and RF1-mediated release.
- **Coupled mode (`coupled`, `PLAN.md` §6.4, `DEC-024`):** 12 deterministic chapters (~121 s, exact **`121.30 s`** at `1×`) modelling bacterial transcription–translation coupling using the experimental **PDB `6ZTJ`** NusG-bridged expressome geometry at coupling distance **`D = 38` nt** (chain `AV` residues `16..53`). Once the nascent transcript reaches `24 + D = 62` nt, the ribosome assembles during a brief disclosed teaching pause, locks via NusG for 39 coupled elongation cycles (`remainingCodons = 0`), decouples at terminator hairpin release, and finishes with RF1 release (`11.0 s` release-only chapter 11).
- **Round 1 retirement & test parity (`PLAN.md` §2 D9, §10 `R3-P1`, `DEC-032`):** The Round 1 placeholder Express modules (`js/sim/expression.js`, `js/ui/view-express.js`) are retired at Gate G4 with their biological invariants ported to Construct v3, while all five existing Helix modes (**Explore**, **Pairs**, **Melt**, **Copy**, **X-ray**) remain intact.

### Twelve experimental cryo-EM machine assets + atomic procedural chemistry

- **Experimental macromolecular assets (`docs/ASSETS.md`, `docs/assets/*.md`):** 12 *E. coli* cryo-EM structures compiled into Asset Format v2 (`assets/*.asset.json`, ~1.45 MB combined vs 3.0 MB budget in `PLAN.md` §7.5; all wwPDB CC0 1.0 Universal): `6ALF` (RNAP elongation complex), `6C9Y` (RNAP σ⁷⁰ holoenzyme protein), `6CA0` (RPo open-promoter DNA tracks, `DEC-023`), `7YPA` (termination hairpin), `6ZTJ` (NusG & coupled expressome), `7K00` (70S ribosome, initiator/elongator tRNAs, exit tunnel), `7ST2` (E-site tRNA & mRNA extension), `5WE4` (EF-Tu & A/T tRNA), `7PJV` (EF-G), `8FZH` (RF1 on `UAA`), `9ZN2` (IF1 & IF2), and `9FDA` (IF3), alongside X-ray crystal structure `1BNA` for B-DNA template geometry and `X-ray` mode (`DEC-030`).
- **Multi-level rendering & atomic detail (`PLAN.md` §4.4):** Machines automatically cross-fade across L0 smoothed envelopes, L1 residue beads (Cα/P), and L2 active-site heavy atoms; DNA, mRNA, tRNA anticodons (nt 34–36), NTP/PPi substrates, and all 20 heavy-atom amino-acid residue templates (`docs/SCIENCE.md` §4) transition between ball-and-stick inside the active detail sphere and cartoon outside.

### Interactive controls, mobile ergonomics & offline bundle

- **Guided exploration (`PLAN.md` §§4.6–4.9):** Play/pause, deterministic forward/backward scrubbing with chapter ticks, playback speeds (`0.5×`, `1×`, `2×`, `4×`), guided camera presets (`Auto`, `Overview`, `RNAP`, `Ribosome`, `Free`), active-site `Cutaway`, priority-capped 3D `Labels` (max 6 visible), cytoplasmic `Crowding` (`high`/`medium`/`low`), 41-cell codon strip, and click-to-inspect provenance cards with click-only `RCSB ↗` links.
- **Responsive & keyboard-accessible UI (`DEC-031`):** Collapsible desktop side panel and draggable mobile bottom sheet (`< 700 px`), full keyboard navigation (`1`–`6`, `Space`, `←/→`, `Home`, `H`, `?`), and `prefers-reduced-motion` instant camera cuts.
- **Zero-dependency offline distribution (`PLAN.md` §2 D14):** Static browser site plus a single-file offline bundle at `dist/helix-standalone.html` (~4.78 MB at ST8 vs 7.5 MB budget in `PLAN.md` §7.5; rebuilt at `R3-INT5`) that makes zero third-party runtime network requests.

---

## Scientific scope & disclosed simplifications

Helix is a teaching visualization of a single local bacterial gene, not a whole-cell or molecular-dynamics simulation (`PLAN.md` §5.2, `docs/SCIENCE.md` §§5–6):

- **Teaching speeds:** Elongation speeds (~7 nt/s transcription, ~0.9 codon/s translation) are roughly 10×–20× slower than *in vivo* *E. coli* rates (~40–80 nt/s and ~15–20 codons/s), and Coupled mode includes a brief pause at 62 nt so ribosome initiation and NusG binding remain visible.
- **Rigid structures & interpolated motion:** Conformational transitions are interpolated deterministically between rigid cryo-EM snapshots; RNAP clamp motion, intersubunit ribosome rotation, 30S head swivel, and DNA supercoiling are not modelled (`DEC-030`).
- **Extended nascent peptide:** Built on a fixed extended backbone (`φ = -139°`, `ψ = 135°`, no proline); real nascent chains inside the 50S exit tunnel are often partly helical, and protein folding is not shown.
- **Exact Watson–Crick anticodons:** Each tRNA anticodon (nt 34–36) is built as the exact complement of its codon; wobble pairing and modified nucleosides are disclosed rather than modelled (`PLAN.md` §2 D7).
- **Static illustrative crowding:** Neighbouring ribosomes, standalone EF-Tu, and RNAP holoenzymes use illustrative densities without Brownian motion or molecular exchange (`docs/SCIENCE.md` §5).
- **Unpublished wwPDB entry:** `9ZN2` (`IF1`/`IF2`) is cited as an unpublished wwPDB deposition (`Guerra GS et al., 2026, wwPDB (To Be Published)`), a placeholder citation recorded in `js/ui/about.js`; author and DOI are not verified against RCSB.

---

## Verification status & documentation pointers

- **Automated & software-GL validation:** See [`docs/VALIDATION.md`](VALIDATION.md) (Gates G1–G3 passed; Gate G4 cutover and Gate G5 release audit recorded in §§10–11) and [`docs/PERF.md`](PERF.md) (Node `stateAt`/`pose` budgets and software-GL chapter telemetry).
- **Pending human release gates (`PLAN.md` §12):** Hardware-GPU desktop frame time (`≤ 16.7 ms` median at `high`, Gate G4), mobile hardware frame time (`≤ 33 ms` median at `low`/`auto`, Gate G5), human visual acceptance sign-off (Gate G5), and final `R3-Q3` release audit (zero external requests, asset/bundle sizes, and 10-cycle mode-switch memory check) on the rebuilt `dist/helix-standalone.html`.
- **Related documentation:** [`README.md`](../README.md), [`docs/SCIENCE.md`](SCIENCE.md), [`docs/ASSETS.md`](ASSETS.md), [`docs/DECISIONS.md`](DECISIONS.md), [`PLAN.md`](../PLAN.md).
