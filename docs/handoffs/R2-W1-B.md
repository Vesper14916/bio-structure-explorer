# Handoff R2-W1-B: machine actor renderer and actor card

Branch: `r2w1-b` (base `c9b0744`). Not pushed.

## Files changed

- `js/render/actors.js` (new): `ActorLayer`, plus exported helpers `chainColor`, `levelForRatio`, `frameToMatrix4`, `ACTOR_TOKENS`.
- `js/render/viewer.js` (additions, plus two small guards listed below).
- `dev/actor-card.html` (new).
- `docs/evidence/r2-w1/*.png` (8 images).
- `docs/handoffs/R2-W1-B.md` (this file).

No edits to `js/main.js`, `js/ui/**`, `js/sim/**`, `js/assets/format.js`, `dist/**`, or other `js/render/*` files.

## What was built

### `ActorLayer` (`js/render/actors.js`)
- `new ActorLayer(parent, tier)`, `setActors(list)`, `update(camera, dt, tier)`, `pick(raycaster, minRadius = 0)`, `getState()`, `setTier`, `clear`, `dispose`, getter `maxRadius`.
- GPU objects are built once per `(id, asset.id)`. Later calls only update the transform, opacities, part factors and cutaway. Actors missing from the list are disposed.
- Transform: `Matrix4.set(R0..R8 row-major, o)`; the actor group has `matrixAutoUpdate = false`.
- L0: one `Mesh` per part, `computeVertexNormals()`, `MeshStandardMaterial` roughness 0.55, metalness 0, transparent, `depthWrite: false`, `renderOrder = 1`. Opacity 0.30 when L0 is the only level, 0.10 when L1 is shown, 0 at L2.
- L1: one `InstancedMesh` per actor, `sphereGeometry(tier)`, radius Ca 1.9 / P 2.4, material parameters copied from `residueMat` (roughness 0.24, metalness 0.12, envMapIntensity 1.15). Chain tint rule from the brief (`beta'` tested before `beta`); otherwise the part colour.
- L2: instanced spheres (`BALL_SCALE` x element radius from the brief) and half-bond cylinders (`BOND_RADIUS`, each half coloured by its atom). Materials copy `atomMat` and `bondMat`.
- Level selection: `ratio = distance(camera, world bounds.center) / bounds.radius`; `ratio > 6` is L0, `2.5 < ratio <= 6` is L1 + faint L0, `ratio <= 2.5` is L1 + L2. Cross-fade 250 ms (linear, driven by the viewer's clamped `dt`). Quality tier `low` never shows L2 in `auto` mode.
- Cutaway: one `THREE.Plane` through the world position of the `activeSite` anchor (falls back to `center`), updated every frame, set as `clippingPlanes` on the L0 and L1 materials of that actor only. L2 is never clipped.
- Picking: nearest L1 bead (optionally enlarged by `minRadius`), otherwise the nearest L0 triangle. Clipped-away hits are ignored.
- Parts: `parts[partId] = { visible, opacity }` scales a part's L1/L2 instances (zero hides them) and multiplies the L0 material opacity. This keeps one `InstancedMesh` per actor.

### Viewer additions (`js/render/viewer.js`)
- `ActorLayer` created next to the molecule layer; `update()` is called in the frame loop after the root matrices are refreshed; `setTier` and `dispose()` forward to it.
- `renderer.localClippingEnabled = true`.
- API: `setActors(list)`, `getActorState()` returning `[{ id, level, ratio, fade }]`.
- `pick()`: when no atom or residue is hit, an actor hit is returned as `{ actor, part, chain, nucleotide: -1, atom: -1, pair: -1, residue: -1, clientX, clientY }`.
- Empty-assembly guards. An assembly with zero nucleotides did not throw but produced `NaN` in `computeOrientation` (centroid divided by zero), so the root matrix and the camera went `NaN` and the page showed only the background. Fix: the principal-axis branch is skipped when `A.count === 0`, and the axis-guide extent falls back to 0 when no atom exists. Non-empty assemblies take exactly the same code path as before.
- Machine-sized scenes: `ensureActorRange()` raises `controls.maxDistance` to `10 x actor radius` when actors are present (never lowers it, no-op without actors). Without it, `focus({ center, radius })` on the fixture was clamped to 280 A by the `maxDistance` that `frameAll` had set for the empty assembly (ratio 3.6 instead of 5.5, so L0 could not be reached). The fog/particle extent `R` also includes `actors.maxRadius` (unchanged when there are no actors).
- Additive diagnostic field `getState().memory = { geometries, textures }` (from `renderer.info.memory`); used for the geometry-count checks below.

### Actor card (`dev/actor-card.html`)
URL parameters: `asset`, `lod`, `cutaway`, `tracks`, `anchors`, `quality` as specified, plus extras `zoom` (framing radius multiple), `focus` (anchor name) with `focusRadius` (Angstrom), `rotate`. It fetches the asset, decodes it, shows it with an identity transform, frames it with `focus({ center: bounds.center, radius })`, and exposes `window.viewer`, `window.asset` (and `window.asm`). `tracks=1` builds one nucleotide per track slot (`ribose`/`U` for RNA tracks, `deoxyribose`/`T` for DNA tracks), links neighbours in the direction whose O3'-to-P distance is below 3 A, and sets `meta.axis` along z so the camera orientation equals the empty-scene case. `anchors=1` adds one `label` annotation per anchor. The HUD shows name, source line, level, ratio, bead, triangle, L2 atom and track atom counts, and fps.

## Acceptance checks (all run against the committed code, headless Chromium with software WebGL, 1440x900)

1. **Forced levels render.** `lod=l0`, `l1`, `l2` pages render the expected content (see screenshots). No console errors.
2. **Auto switching and `getActorState()` levels** (card page, `lod=auto`, camera moved by `viewer.focus` with different radii, waited 1.5 s each):

   | ratio | reported level | expected |
   | --- | --- | --- |
   | 7.176 | l0 | l0 (> 6) |
   | 6.199 | l0 | l0 |
   | 5.800 | l1 | l1 (2.5 < r <= 6) |
   | 5.520 | l1 | l1 |
   | 3.312 | l1 | l1 |
   | 2.600 | l1 | l1 |
   | 2.400 | l2 | l2 (<= 2.5) |
   | 1.656 | l2 | l2 |

   The three headline distances are ratio 7.18 (l0), 5.52 (l1) and 1.66 (l2). The rule function itself returns `l0` at 6.001, `l1` at 6 and 5.999 and 2.501, `l2` at 2.5 and 2.499. `quality=low` with auto at ratio 2: `l1`; forced `l2` at tier low: `l2` (a forced level overrides the low-tier rule; see deviations).
3. **Cross-fade, 250 ms.** The fade values advance with the viewer's clamped `dt` (at most 0.05 s per frame). In the live viewer on software WebGL the frame rate is very low, so wall-clock timing could not be measured there. With simulated `dt = 1/60` in a stand-alone `ActorLayer` (far to near jump): after 5 steps (0.083 s) L1 and L2 = 0.333, L0 = 0.20; after 14 steps (0.233 s) 0.933 / 0.02; after 15 steps (0.25 s) L1 = L2 = 1, L0 = 0.
4. **Transform.** For a non-trivial `{ o, R }` (rotZ 0.7 composed with rotX -1.1, `o = [13, -27, 41]`) the actor matrix applied to every fixture anchor, one L1 bead and one L2 atom matches `applyFrame(transform, p)` with a maximum error of 0 Angstrom (float32 matrix, error printed as 0).
5. **Cutaway reveals the tracks.** `fixture-l1-cutaway.png`: the camera-side half of the core is removed and the 31-slot track nucleotides (`tracks=1`) are visible inside the core.
6. **Zero console errors.**
   - Actor card: no `pageerror` and no console errors in five URL combinations (l0, l1, l2, auto with tracks/anchors/cutaway, `quality=low`). The only console messages are Chromium software-GL driver notices ("GPU stall due to ReadPixels"), which are not errors and were filtered.
   - Main page: keys `1` to `6` and back to `1`, 2.5 s each; the active tab changed as expected each time (Explore, Pairs, Melt, Copy, Express, X-ray, Explore); 0 page errors, 0 console errors, 0 other warnings.
7. **Geometry counts (`renderer.info.memory.geometries`).**
   - In the real viewer on the actor card (tracks assembly present): before the actor 6; with the actor (L0 x2 + sphere, drawn at ratio 5.5) 9; close up (L2 cylinder also uploaded) 10; after `setActors([])` 6.
   - Stand-alone `ActorLayer` on a bare renderer: baseline 0; ratio 5.5 gives 3; ratio 2 gives 4; with one actor drawn from inside the machine (only sphere and cylinder drawn) 2, with two such actors 4; after `setActors([])` 0; after re-adding and `layer.dispose()` 0, and the layer's group is removed from the parent. A tier change keeps the count (2 to 2) and `dispose()` afterwards returns to 0. `idempotent`: calling `setActors` again with the same id and asset keeps the same `InstancedMesh` and the same geometry count.
   - Textures stay at 15 throughout. `viewer.dispose()` removes the canvas; the viewer-level "before the actor" number is checked with `setActors([])`, because `viewer.dispose()` disposes the whole renderer.
8. **Unit tests.** `node --test tests/*.test.mjs`: `# tests 40`, `# pass 40`, `# fail 0`.
9. **Regression screenshots.** `regression-explore.png` and `regression-express-70.png` (main page; Express mode with "Gene expression progress" set to 700) were captured before any render change and after. Both pairs show the same content (see below). A pixel diff cannot be exact because the scene is not deterministic (random bokeh particles, running animation): the before-versus-after difference (reduced-motion run, mean absolute difference 1.9 and 0.6 per channel) is the same size as the difference between two runs of the final code (1.6 and 0.7).

## Screenshots (`docs/evidence/r2-w1/`)

- `fixture-l0.png`: forced L0, ratio 5.52. A large translucent blue ellipsoid (core) and a smaller translucent violet ellipsoid (accessory) overlapping at the lower left, soft shading, dark blue background with bokeh particles; HUD at lower left reads "level l0 (forced) ratio 5.52, beads 630, triangles 1120, L2 atoms 60".
- `fixture-l1.png`: forced L1, same framing. 630 glossy beads, light blue for the core chain and violet for the accessory chain, inside very faint (0.10) envelopes of the same two colours.
- `fixture-l2.png`: forced L2, `focus=activeSite`, ratio 1.67. Very close view full of large blue beads (and violet ones at lower left); between and behind them a zig-zag chain of small ball-and-stick atoms (grey C, blue N, red O, yellow S, green Mg) is partly visible near the centre. The envelopes are hidden.
- `fixture-l2-cutaway.png` (extra): same view with the cutaway on. About half of the near beads are gone and the full 60-atom L2 chain is clearly visible; cut beads show their inside as glassy hemispheres.
- `fixture-l1-cutaway.png`: forced L1 with `cutaway=1&tracks=1`, ratio 4.42. The near half of the blue core is removed, so the beads are sparser; a vertical B-DNA-like double helix (grey/red/orange/blue atoms, base pairs as horizontal rungs, 1268 atoms in the HUD) is visible in front of the violet cluster and through the remaining core beads.
- `fixture-auto-tracks-anchors.png`: `lod=auto&tracks=1&anchors=1`, ratio 5.52, level l1 (auto). Same bead cloud as the L1 image with the double helix running vertically through it and five dark label tags (`dnaEntry`, `activeSite`, `center`, `rnaExit`, `dnaExit`) placed at the anchors.
- `regression-explore.png`: main page, Explore mode: the 20-bp ball-and-stick B-DNA helix on the left, the right-hand panel with "Explore the double helix", and the hint pill at the bottom; same content as before the change (bokeh particle positions differ).
- `regression-express-70.png`: main page, Express mode at 70 %: transcribed mRNA/DNA strands on the right and the ribosome with the green cutaway ellipsoids, tags "Elongator aa-tRNA", "30S Ribosomal Subunit", "50S Ribosomal Subunit" and a short nascent peptide on the left, panel text "Ribosome elongation - codon 7 (5'-UCU-3' -> Ser)"; same content as before the change.

## Deviations from the brief

1. Cutaway plane orientation. three.js clips the negative side of a plane, so the normal that points toward the camera would remove the far half. The plane normal is `normalize(activeSite - camera)` (pointing away from the camera) so the camera-side half is removed. The plane still passes through the `activeSite` anchor.
2. L1 material gets `side = DoubleSide` only while the cutaway is on, so cut beads do not appear as hollow rings.
3. `lod: 'l2'` forces L2 even at quality tier `low` (the "never L2 at low" rule applies to `auto`). An asset without `lod2` is shown as L1.
4. Pick precedence: an L1 bead is preferred over the L0 envelope that encloses it (the envelope is returned only when no bead is hit or L1 is not shown); the brief said nearest of the two, which always returned the front envelope surface.
5. `getActorState()` entries carry an extra `fade` field; `getState()` carries an extra `memory` field.
6. Beyond "additions only" in `viewer.js`: the zero-atom guards in `computeOrientation`, `ensureActorRange()` and the fog extent change, as described above. All are no-ops for non-empty assemblies without actors.
7. Part opacity is applied by scaling bead and atom radii (one `InstancedMesh` per actor), as the app already does for peptide beads.
8. Commit trailers: the first three commits carry `Co-Authored-By: Claude Fable 5.2`, as the original task prompt instructed; later commits carry `Co-Authored-By: Claude Opus 5.5`, as the coordinator's resume message instructed.
9. Extra card parameters (`zoom`, `focus`, `focusRadius`, `rotate`) and the extra screenshot `fixture-l2-cutaway.png`.

## Not verified / limitations

- Real-time fade duration in a live browser: software WebGL runs at a very low frame rate here, so the 250 ms was verified only with simulated `dt`.
- Real RNAP asset (task A) and a PDB-derived asset were not available; everything was checked on the synthetic fixture. Actual `lod0` meshes with 16-bit versus 32-bit indices were not tested (only `u16` in the fixture); `u32` is passed straight to `BufferAttribute`.
- Touch and mouse interaction was tested by dispatching pointer events on the canvas, not with real devices. Picks seen: `{ actor, part: core, chain: A }`, `{ part: accessory, chain: B }` for beads, `{ part: core, chain: null }` for the envelope, `null` on empty space.
- Cut beads drawn with `DoubleSide` look like glassy hemispheres; this is a style choice that the Integration Owner may want to review.
- `viewer.dispose()` itself was only checked for removing the canvas and raising no errors; the geometry count after it is not meaningful because the renderer is disposed.

## Open questions

- Should `ensureActorRange()` (zoom-out limit of 10 x actor radius) move into the Wave 2 framing logic?
- Should the track nucleotides in `tracks=1` also get Watson-Crick pairs and hydrogen-bond beads once the real RNAP asset has complementary template/nontemplate registers?
