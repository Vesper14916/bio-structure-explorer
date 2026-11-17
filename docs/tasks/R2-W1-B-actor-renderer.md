# Task B: machine actor renderer and actor card

Model: Sonnet, high effort. Branch: `r2w1-b`. Read first: `docs/tasks/R2-W1-README.md`, `docs/CONTRACTS.md` sections 6.2 and 6.4, `js/assets/format.js`, `js/render/viewer.js`, `js/render/molecule.js`, `js/render/overlay.js`, `js/render/util.js`, `dev/viewer-demo.html`.

## Outcome

The viewer can display machine assets (format v1) as rigid actors with three levels of detail and a cutaway, in the existing visual style. A standalone page shows any asset for review. Existing modes look and behave exactly as before.

## Files you own

`js/render/actors.js` (new), `js/render/viewer.js` (additions only), other `js/render/*` only if strictly needed, `dev/actor-card.html` (new), `docs/evidence/r2-w1/*.png`, `docs/handoffs/R2-W1-B.md`. Develop against `assets/fixture-machine.asset.json`. Do not edit `js/main.js`, `js/ui/**`, `js/sim/**`, or `js/assets/format.js`.

## Steps

### Step 1: `ActorLayer` in `js/render/actors.js`
- `export class ActorLayer { constructor(parent, tier) … }`, where `parent` is the viewer's `root` group (science space, angstroms), following the pattern of `MoleculeLayer`.
- `setActors(list)`: `list` is an array of `{ id, asset, transform: { o, R }, visible = true, opacity = 1, parts = null, cutaway = false, lod = 'auto', label = '' }`. `asset` is the result of `decodeAsset`. `parts` is an optional map `{ partId: { visible, opacity } }`. Calls are idempotent: build GPU objects once per `(id, asset.id)`, update transforms and uniforms afterwards, dispose actors that disappear from the list.
- Transform: build a `THREE.Matrix4` from `R` (row-major 3×3 whose columns are the local axes) and `o`. Verify with the fixture that an anchor's local position transformed by the matrix equals `applyFrame(transform, anchor.o)` from `js/science/math.js`.
- **L0:** one `THREE.Mesh` per part from `asset.lod0`; call `computeVertexNormals()`; material and opacities exactly as in `docs/CONTRACTS.md` 6.4; `renderOrder` after opaque geometry.
- **L1:** one `THREE.InstancedMesh` per actor using `sphereGeometry(tier)` from `js/render/util.js`, radius by bead kind, per-instance colour by chain. Material: copy the parameters of `residueMat` in `js/render/molecule.js`. Chain colour: use the tints in 6.4 when the chain name contains `alpha`, `beta'` (or `beta prime`), `beta`, `omega`, or `sigma` (case-insensitive; test `beta'` before `beta`); otherwise use the part colour. Part colours: `core` `0x4fb6ff`, `sigma` and `accessory` `0xb58cff`, unknown `0x9fb2dc`.
- **L2:** instanced spheres and bond cylinders for `asset.lod2`, using `writeSphere` and `writeCylinder` from `js/render/util.js` and the radii and colours in 6.4. Element radii by atomic number: C 1.70, N 1.55, O 1.52, P 1.80, S 1.80, Mg 1.73, Zn 1.39, other 1.60 (angstroms, multiplied by `BALL_SCALE`).
- **Level selection:** implement the `ratio` rule and the 250 ms cross-fade in 6.4 in `update(camera, dt, tier)`. `lod: 'l0' | 'l1' | 'l2'` forces a level. Camera distance is measured from the camera to the actor's `bounds.center` in world space.
- **Cutaway:** when `cutaway` is true, apply one `THREE.Plane` through the world position of the `activeSite` anchor with its normal pointing toward the camera, as `material.clippingPlanes` on L0 and L1 materials of that actor only; update it every frame. Enable `renderer.localClippingEnabled` in the viewer. L2 is never clipped.
- `pick(raycaster)`: return `{ actor: id, part, chain }` for the nearest L1 bead or L0 triangle hit, or `null`.
- `setTier(tier)`, `clear()`, `dispose()`: release every geometry, material, and instanced buffer.

### Step 2: viewer integration (`js/render/viewer.js`, additions only)
- Create the layer next to `this.molecule`, call its `update` from the frame loop, forward `setTier`, and dispose it in `dispose()`.
- Add to `makeApi()`: `setActors: list => …` and `getActorState: () => [{ id, level, ratio }]`.
- In `pick()`, when no atom or residue is hit, return the actor hit as `{ actor, part, chain, nucleotide: -1, atom: -1, pair: -1, residue: -1, clientX, clientY }`.
- Make framing work when actors are present: `focus({ center, radius })` already exists; confirm it works with an assembly that has zero nucleotides, and if the viewer throws on an empty assembly, add the smallest guard that fixes it. Do not change behaviour for non-empty assemblies.
- Do not change any existing default, colour, light, or post-processing setting.

### Step 3: `dev/actor-card.html`
- Copy the shell of `dev/viewer-demo.html` (import map, full-window stage, HUD).
- URL parameters: `asset` (file name in `assets/`, default `fixture-machine.asset.json`), `lod` (`auto`, `l0`, `l1`, `l2`), `cutaway` (`0` or `1`), `tracks` (`0` or `1`), `anchors` (`0` or `1`), `quality`.
- Fetch the asset JSON with a relative URL, `decodeAsset` it, show it with an identity transform, and frame it with `focus({ center: bounds.center, radius: bounds.radius })`.
- `tracks=1`: build an `Assembly` (`js/science/assembly.js`) with one nucleotide per track slot using `addNucleotide({ base, strand, frame, sugar })` (`sugar: 'ribose'` and `U` for RNA tracks; `T` for DNA tracks), so the procedural atoms appear inside the machine. Read how `buildDuplex` finalises an assembly and do the same.
- `anchors=1`: one label annotation per anchor through the existing `setAnnotations` API.
- HUD text: asset name, source line (`PDB <id>, <method>, <resolution> Å, <organism>` or `Synthetic`), current level, bead, triangle, and atom counts, frames per second.
- Expose `window.viewer` and `window.asset` for scripted checks.

### Step 4: evidence
Serve the repository root with `python3 -m http.server` and capture, with headless Chromium at 1440×900 (launch arguments `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), into `docs/evidence/r2-w1/`:
`fixture-l0.png`, `fixture-l1.png`, `fixture-l2.png`, `fixture-l1-cutaway.png`, `fixture-auto-tracks-anchors.png`, and `regression-explore.png`, `regression-express-70.png` (main page, Express mode with the "Gene expression progress" slider set to 700). Look at every image yourself and describe what is visible in the handoff. If an image is blank or wrong, fix the cause; do not hand off unexplained images.

## Acceptance checklist
- [ ] Fixture renders at each forced level; `auto` switches levels when zooming, and `getActorState()` reports the level expected from the `ratio` thresholds at three camera distances (report the numbers).
- [ ] Cutaway reveals the track nucleotides inside the fixture core.
- [ ] Zero console errors on the actor card and on the main page across all six modes (keys `1`–`6`).
- [ ] After `setActors([])` and after `dispose()`, `renderer.info.memory.geometries` returns to its value before the actor was added (report both numbers).
- [ ] `node --test tests/*.mjs` passes; counts reported.
- [ ] The two regression screenshots show the same content as before your change.
