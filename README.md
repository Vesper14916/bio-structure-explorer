# Helix — interactive DNA, RNA & gene expression explorer

An atom-level, interactive 3D model of the DNA double helix, A-form RNA, and bacterial gene
expression (transcription & translation) that runs in the browser on desktop and on a phone.
No build step, no runtime dependencies beyond the vendored three.js.

## Run it

```sh
python3 -m http.server 8000     # from the repository root
# open http://localhost:8000
```

It is a static site, so it can also be served from GitHub Pages as-is. It needs to be
served over HTTP (ES modules do not load from `file://`).

## Modes

| Mode | What it shows |
|---|---|
| Explore | Ideal **B-DNA** or **A-RNA** (with explicit $2'\text{-OH}$ ribose and Uracil) for any 4–40 bp sequence: ball-and-stick, space-filling or cartoon; colour by element, base, strand or part; grooves, axis, labels, live dimensions |
| Pairs | One Watson–Crick (`A·T`, `G·C`, `A·U`) or wobble (`G·U`) pair face-on: hydrogen bonds with donor, acceptor and length, and the groove recognition pattern |
| Melt | Thermal denaturation of B-DNA or A-RNA driven by temperature and salt, with the melting curve and per-pair opening |
| Copy | A DNA replication fork: helicase, leading strand, Okazaki fragments with RNA primers, ligation |
| Express | Bacterial gene expression: RNA polymerase opens a transcription bubble on a 48-bp gene to synthesize a 44-nt mRNA (`AGGAGG` Shine–Dalgarno + 11 sense codons + `UAA` stop), and a 70S ribosome (`30S + 50S`) translates it via `fMet-tRNAfMet`, A→P→E translocation, and `RF1` termination into an 11-residue polypeptide (`fMet-A-E-F-K-G-S-D-Y-Q-A`) |
| X-ray | The experimental crystal structure PDB 1BNA with its water molecules and B-factors |

## What the model is based on

- **Base geometry**: the standard reference frame of Olson et al. (2001), *J. Mol. Biol.* 313, 229 (including Uracil `U`).
- **Backbone**: B-DNA deoxyribose-phosphate coordinates derived from PDB 1BNA (Drew et al. 1981, *PNAS* 78, 2179) and A-RNA $C3'\text{-endo}$ ribose-phosphate coordinates (with explicit `"O2'"` $2'\text{-OH}$ at $1.413\,\text{Å}$), regularised to ideal covalent bond lengths and angles (Gelbin et al. 1996; Parkinson et al. 1996).
  `tools/build-templates.mjs` regenerates `js/science/templates.js` from `tools/1bna.cif`.
- **Helices**: B-DNA (`HELIX_B`: rise 3.38 Å, 10.5 bp/turn, pitch 35.5 Å) and A-RNA (`HELIX_A`: rise 2.81 Å, 11.0 bp/turn, pitch 30.9 Å).
- **Thermodynamics**: SantaLucia (1998), *PNAS* 95, 1460 (DNA) and Xia et al. (1998), *Biochemistry* 37, 14719 / Turner & Mathews (2010) (RNA), solved by an exact nearest-neighbour transfer-matrix helix-coil model.
- **Groove read-out & wobble pairing**: Seeman, Rosenberg & Rich (1976), *PNAS* 73, 804; Varani & McClain (2000), *EMBO Rep.* 1, 18.

## What is simplified

- Ideal B-DNA and A-RNA use perfectly regular screw symmetry; no Z-form or sequence-dependent bending.
- No hydrogen atoms (the crystal structure has none); hydrogen bonds are drawn between heavy atoms.
- Replication and gene expression are compressed to the scale of a short construct (48 bp DNA → 44 nt mRNA → 11 aa polypeptide), with macromolecular complexes (`RNAP`, `30S/50S` ribosome, `tRNAs`, `RF1`) shown as translucent envelopes with active-site cutaways.
- Melting animates one molecule stochastically; long-run averages follow the equilibrium model.

## Layout

```
index.html, css/          page shell and styles
js/science/               geometry, crystal data, thermodynamics (no DOM, runs in Node)
js/sim/                   melting and replication simulations (no DOM, runs in Node)
js/render/                three.js viewer
js/ui/                    controls
js/main.js                glue
tests/                    node --test tests/science.test.mjs tests/sim.test.mjs
dev/                      standalone demo pages for the viewer and the UI
```

three.js r160 is vendored under `js/vendor/` (MIT, see `js/vendor/THREE-LICENSE`).
PDB coordinate data are in the public domain (CC0).
