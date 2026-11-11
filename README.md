# Helix — interactive DNA structure explorer

An atom-level, interactive 3D model of the DNA double helix that runs in the browser on
desktop and on a phone. No build step, no runtime dependencies beyond the vendored three.js.

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
| Explore | Ideal B-DNA for any 4–40 bp sequence: ball-and-stick, space-filling or cartoon; colour by element, base, strand or part; grooves, axis, labels, live dimensions |
| Pairs | One Watson–Crick pair face-on: hydrogen bonds with donor, acceptor and length, and the groove recognition pattern |
| Melt | Thermal denaturation driven by temperature and salt, with the melting curve and per-pair opening |
| Copy | A replication fork: helicase, leading strand, Okazaki fragments with primers, ligation |
| X-ray | The experimental crystal structure PDB 1BNA with its water molecules and B-factors |

## What the model is based on

- **Base geometry**: the standard reference frame of Olson et al. (2001), *J. Mol. Biol.* 313, 229.
- **Backbone**: sugar-phosphate coordinates derived from the crystal structure PDB 1BNA
  (Drew et al. 1981, *PNAS* 78, 2179), regularised to ideal bond lengths and angles
  (Gelbin et al. 1996; Parkinson et al. 1996) and mean BI torsions (Schneider et al. 1997).
  `tools/build-templates.mjs` regenerates `js/science/templates.js` from `tools/1bna.cif`.
- **Helix**: rise 3.38 Å, 10.5 bp per turn (pitch 35.5 Å). The generated duplex has a minor
  groove of about 6.5 Å, a major groove of about 12 Å and hydrogen bonds of 2.87–3.05 Å.
- **Thermodynamics**: unified nearest-neighbour parameters of SantaLucia (1998), *PNAS* 95, 1460,
  and an exact nearest-neighbour helix-coil model for per-pair opening probabilities.
- **Groove read-out**: Seeman, Rosenberg & Rich (1976), *PNAS* 73, 804.

## What is simplified

- Only B-form DNA; no A- or Z-form.
- No hydrogen atoms (the crystal structure has none); hydrogen bonds are drawn between heavy atoms.
- Nucleotides move as rigid bodies in the animations; the ideal helix is perfectly regular,
  with no sequence-dependent bending or propeller twist.
- Replication is compressed to the scale of a short oligo: real primers are RNA of about
  10 nt and real Okazaki fragments are 100–2000 nt. Enzymes are shown as soft blobs, not structures.
- Melting animates one molecule stochastically; long-run averages follow the equilibrium model,
  less closely within a few degrees of Tm.

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
