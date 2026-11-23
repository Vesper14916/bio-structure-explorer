# Helix — Interactive DNA, RNA & Bacterial Gene Expression Explorer

Helix is an atom-level, browser-driven 3D molecular explorer of the DNA double helix, A-form RNA, and true-scale bacterial gene expression (*Escherichia coli* transcription and translation) on desktop and mobile devices (`PLAN.md` §1). It runs as a static site with zero build step for serving, zero third-party runtime requests (`PLAN.md` §2 D14), and no runtime dependencies beyond the vendored Three.js r160 (`js/vendor/`). A self-contained offline build is bundled at `dist/helix-standalone.html`.

## What Helix shows

Helix provides six interactive modes (`js/ui/ui.js`):

| Key | Mode | What it shows |
| :---: | :--- | :--- |
| `1` | **Explore** | Ideal **B-DNA** or **A-RNA** (with explicit $2'\text{-OH}$ ribose and Uracil) for any 4–40 bp sequence: ball-and-stick, space-filling, or cartoon; colour by element, base, strand, or part; grooves, helix axis, labels, and live dimensions (`docs/SCIENCE.md` §1). |
| `2` | **Pairs** | Face-on Watson–Crick (`A·T`, `G·C`, `A·U`) and wobble (`G·U`) base pairs: hydrogen bonds with donor, acceptor, and length, plus major/minor groove recognition patterns (`docs/SCIENCE.md` §1). |
| `3` | **Melt** | Thermal denaturation of B-DNA or A-RNA driven by temperature and monovalent salt ($\text{Na}^+$), with an equilibrium nearest-neighbour melting curve and per-pair opening (`docs/SCIENCE.md` §2). |
| `4` | **Copy** | A DNA replication fork showing helicase unwinding, continuous leading-strand synthesis, discontinuous Okazaki fragments with RNA primers, and ligation (`js/sim/replication.js`). |
| `5` | **Express** | True-scale (`1 Å = 1 scene unit`, `PLAN.md` §2 D2) *E. coli* gene expression on **Construct v3** (`248 bp` synthetic gene → `179 nt` mRNA → `40` amino-acid peptide `fMet-A-E-F-K-G-S-D-Y-Q-...-S-Y-L` + `UAA` stop + intrinsic terminator; `PLAN.md` §5.1, `docs/SCIENCE.md` §3). Uses 12 experimental cryo-EM macromolecular structures (`docs/ASSETS.md`) rendered with automatic L0/L1/L2 levels of detail in a crowded patch of cytoplasm (`docs/SCIENCE.md` §5). |
| `6` | **X-ray** | The experimental B-DNA dodecamer crystal structure **PDB `1BNA`** (1.9 Å X-ray diffraction; Drew et al., 1981) with crystallographic water molecules and B-factors (`docs/ASSETS.md` A01). |

### Two story modes in Express (`PLAN.md` §6, `DEC-024`)

Both story modes express Construct v3 deterministically as a pure function of story time (`PLAN.md` §2 D8, D13) at `0.5×`, `1×`, `2×`, or `4×` speed:

- **Step by step (`sequential`) — 16 chapters, ~164 s (exact `164.05 s` at `1×`):** RNA polymerase σ⁷⁰ holoenzyme finds the `-35`/`-10` promoter, melts the open complex, initiates and escapes the promoter (releasing σ⁷⁰ after nt 12), transcribes the 179-nt mRNA, and terminates at the intrinsic hairpin; the 30S subunit (with IF1, IF2, IF3) then binds the `AGGAGG` Shine–Dalgarno sequence, places `fMet-tRNA` in the P site, joins 50S, translates codons 2–40 with EF-Tu and EF-G, and releases the 40-residue peptide via RF1 at `UAA` (`PLAN.md` §6.1).
- **Coupled (`coupled`) — 12 chapters, ~121 s (exact `121.30 s` at `1×`):** Models bacterial transcription–translation coupling using the experimental `6ZTJ` NusG-bridged expressome coupling distance **`D = 38` nt** (chain `AV` residues `16..53`, `DEC-024`, `docs/assets/rnap.md` §6.2). Once the nascent transcript reaches `24 + D = 62` nt, transcription pauses briefly so 30S/50S initiation and NusG binding can be observed; RNAP and the 70S ribosome then move together for `39` coupled elongation cycles (3 nt transcribed per codon translated, `remainingCodons = 0`), decouple on terminator hairpin release, and conclude with RF1 release (`11.0 s` release-only chapter 11; `PLAN.md` §6.4).

## How to run

### Local static HTTP server

ES modules cannot load over `file://`; serve the repository root over HTTP:

```sh
python3 -m http.server 8000
# or:
npx serve .
```

Then open `http://localhost:8000` (or the URL printed by `npx serve`). Because Helix is purely static, the repository root can also be hosted directly on GitHub Pages.

### Offline single-file build

Open `dist/helix-standalone.html` directly in a browser for fully offline use (all JS modules, CSS, and the 12 experimental JSON assets are inlined; zero external network requests, `PLAN.md` §2 D14). Rebuild it after source changes with:

```sh
npm run build:standalone
```

### Verification and tooling commands (`package.json`)

| Command | Purpose |
| :--- | :--- |
| `npm run check` | Syntax-check all JavaScript modules (`tools/check-syntax.mjs`). |
| `npm test` | Run syntax check and all Node unit/invariant tests (`tests/*.test.mjs`). |
| `npm run smoke` | Headless Chromium smoke suite (`tests/smoke.browser.mjs`; requires Playwright) covering `index.html`, `dist/helix-standalone.html`, all six modes, and offline network isolation. |
| `npm run build:standalone` | Build the single-file offline bundle `dist/helix-standalone.html`. |
| `npm run perf` | Run Node kinematics/story benchmarks (`tools/perf/story-bench.mjs`) and headless browser chapter benchmarks (`tools/perf/browser-bench.mjs`; see `docs/PERF.md`). |
| `npm run fetch-sources` | Download and SHA-256 verify raw wwPDB mmCIF sources pinned in `tools/sources.lock.json` into `tools/sources/` (gitignored). |
| `node tools/build-assets.mjs --check` | Rebuild macromolecular JSON assets from `tools/sources/` and verify byte-for-byte reproducibility (`docs/ASSETS.md`). |

## Controls & keyboard shortcuts

### Pointer and touch (`js/ui/ui.js`, `js/ui/about.js`)

- **Drag:** orbit the 3D camera (in Express mode, manual orbit/pan/zoom switches Camera to `Free` until another camera preset is selected; `PLAN.md` §4.7).
- **Scroll / pinch:** zoom in and out (in Express mode, camera distance smoothly cross-fades macromolecular machines between L0 envelopes, L1 residue beads, and L2 active-site atoms; `PLAN.md` §4.4).
- **Click / tap a molecule:** select a base pair, codon, residue, or machine. In Express mode, clicking opens the **Inspect** card with the molecule's role, PDB source (with an optional click-only `RCSB ↗` link), organism, method, chains shown, active detail level, and disclosed simplifications (`PLAN.md` §§4.8, 5.4).

### Keyboard shortcuts (`js/ui/ui.js`)

| Key | Action |
| :--- | :--- |
| `1` – `6` | Switch between **Explore**, **Pairs**, **Melt**, **Copy**, **Express**, and **X-ray**. |
| `Space` | Play or pause (`Copy` and `Express` modes). |
| `←` / `→` | Step along base pairs (`Pairs`) or chapters (`Express`). |
| `Home` | Restart the story from chapter 1 (`Express`). |
| `H` | Hide or show the desktop side panel. |
| `?` | Open the **About** sheet (controls, references, PDB sources, and simplifications). |

### Express mode panel controls (`PLAN.md` §4.8, `js/ui/view-story.js`)

- **Transport & scrub bar:** Play/Pause, Restart, deterministic progress slider (`0–100%`) with chapter start ticks, phase badge, chapter counter, and live chapter caption.
- **Story & Speed:** Switch between `Step by step` and `Coupled`; playback speeds `0.5×`, `1×`, `2×`, `4×`.
- **Camera:** `Auto` (guided chapter shots), `Overview`, `RNAP`, `Ribosome`, or `Free`.
- **Scene toggles:** `Cutaway` (active-site clip plane on machines), `Labels` (up to 6 priority-filtered 3D tags; `PLAN.md` §4.6), and `Crowding` (neighbouring cytoplasmic ribosomes, EF-Tu, and RNAP holoenzymes; off by default on `low` quality tier).
- **Chapters, Codons & Inspect:** Click any chapter row to seek directly, click codons in the 41-cell strip (`AUG`–`UAA`) or residues in the peptide pill chain, and inspect any clicked actor. On screens narrower than 700 px, the panel docks as a draggable bottom sheet.

## Repository layout

```text
index.html, css/          Application shell and closed stylesheet (PLAN.md §4.8)
js/science/               Nucleic-acid geometry, PDB 1BNA data, thermodynamics, Construct v3,
                          20 amino-acid residue templates, peptide and NTP builders (Node-safe)
js/assets/                Asset format v2 encoder/decoder/validator and browser loader
js/kin/                   Deterministic kinematics: duplex, tracks, free chains, hairpin,
                          tRNA/anticodon, NTP, peptide tunnel path, and scene poser
js/sim/                   Melting, DNA replication, and gene-expression story modules (js/sim/gene/)
js/render/                Three.js WebGL viewer, stage, actors (L0/L1/L2), molecules, FX, overlay
js/scene/                 Express StoryScene coordinator, camera rails, label selector, crowders
js/ui/                    Shell, mode views (including view-story.js), inspect panel, About modal
js/main.js                Application wiring and mode router
js/vendor/                Vendored Three.js r160 and addons (MIT licence)
assets/                   Compiled Format v2 macromolecular JSON assets + manifest.json
dist/                     Offline single-file build (helix-standalone.html)
tools/                    Asset pipeline (tools/assets/, tools/lib/), standalone builder,
                          performance harness (tools/perf/), evidence sweep (tools/evidence/)
tests/                    Node unit/invariant suites and Playwright browser tests
dev/                      Standalone development harnesses (actor-card, story-lab, ui-story)
docs/                     SCIENCE.md, ASSETS.md, assets/*.md, DECISIONS.md, CONTRACTS.md,
                          PERF.md, VALIDATION.md, RELEASE-NOTES.md, TASKS.md, handoffs/
PLAN.md                   Authoritative Round 3 specification
```

## Scientific sources and simplifications

- **Full scientific documentation:** [`docs/SCIENCE.md`](docs/SCIENCE.md) covers nucleic-acid geometry (§1), nearest-neighbour thermodynamics (§2), Construct v3 and the 41-codon table (§3), the 20 heavy-atom residue templates and NTP substrates (§4), cytoplasmic crowding (§5), mechanism and simplifications (§6), the `D = 38` coupled expressome (§7), story pacing (§8), structural provenance (§9), and quantitative invariants (§10).
- **Experimental structural provenance:** [`docs/ASSETS.md`](docs/ASSETS.md) and [`docs/assets/`](docs/assets/) (`rnap.md`, `ribosome-70s.md`, `trna.md`, `factors.md`) document every wwPDB entry, superposition RMSD, anchor, track, and budget check. All 12 macromolecular machine assets derive from *E. coli* **cryo-EM** structures (`6ALF` elongation complex, `6C9Y` holoenzyme protein, `6CA0` open-promoter DNA tracks per `DEC-023`, `7YPA` termination hairpin, `6ZTJ` NusG-coupled expressome, `7K00` 70S ribosome & tRNAs, `7ST2` E-site tRNA & mRNA extension, `5WE4` EF-Tu & A/T tRNA, `7PJV` EF-G, `8FZH` RF1 on `UAA`, `9ZN2` IF1 & IF2, `9FDA` IF3), while ideal B-DNA backbone geometry and `X-ray` mode use **X-ray** crystal structure `1BNA` (`DEC-030`).
- **Key disclosed simplifications (`PLAN.md` §5.2, `docs/SCIENCE.md` §§5–6):**
  - **Teaching speeds:** Transcription elongation (~7 nt/s vs 40–80 nt/s in vivo) and translation elongation (~0.9 codon/s vs 15–20 codons/s in vivo) are slowed for clarity; coupled initiation includes a brief teaching pause at 62 nt.
  - **Interpolated rigid poses:** Motion is interpolated deterministically between rigid experimental snapshots rather than run as molecular dynamics; DNA spins about its axis as it threads through RNAP (equivalent to RNAP tracking the helix; supercoiling is not modelled, `DEC-030`).
  - **Extended nascent peptide:** Built on a fixed extended backbone (`φ = -139°`, `ψ = 135°`, no proline); real chains inside the 50S exit tunnel are often partly helical, and protein folding is not modelled.
  - **Exact Watson–Crick anticodons:** Each tRNA anticodon (nucleotides 34–36, `DEC-030`) is rebuilt as the exact complement of its codon; wobble pairing and modified nucleosides are disclosed, not modelled (`PLAN.md` §2 D7).
  - **Illustrative static crowders:** Cytoplasmic neighbours (ribosomes, standalone EF-Tu, RNAP holoenzymes) use illustrative densities without dynamics (`docs/SCIENCE.md` §5).
  - **Canonical factor roles:** Initiation separates `IF1` (30S A-site blocker supporting IF2/IF3), `IF2` (GTPase delivering `fMet-tRNA` to P and aiding 50S joining), and `IF3` (initiator fidelity and anti-association) in textbook order without kinetic branching (`PLAN.md` §5.4, `DEC-030`).

## Licences

- **Three.js r160:** vendored under `js/vendor/` under the MIT licence (see [`js/vendor/THREE-LICENSE`](js/vendor/THREE-LICENSE)).
- **Experimental structure derivatives (`assets/*.asset.json`, `tools/1bna.cif`):** derived from wwPDB/RCSB entries released into the public domain under **CC0 1.0 Universal** (`docs/ASSETS.md`).
