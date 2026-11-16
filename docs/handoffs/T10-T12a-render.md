# Handoff Summary: T10–T12a (3D Rendering & Visual Polish)

- **Agent:** Agent 3 — 3D Rendering & Visual Polish Agent (Gemini 4 Hydrogen Medium-High Reasoning)
- **Date:** 2026-11-16
- **Status:** Completed & Validated

## Owned Files Modified / Created
- `js/render/colors.js`
- `js/render/molecule.js`
- `js/render/cartoon.js`
- `js/render/overlay.js`
- `js/render/viewer.js`
- `docs/handoffs/T10-T12a-render.md`

## Summary of Changes

1. **`js/render/colors.js`**:
   - Exported `EXPRESSION_HEX` (`coding: 0x7c93c3`, `template: 0x9fb2dc`, `mrna: 0x2fd9b9`, `trna: 0xffd43b`, `peptide: 0xff7a45`) and `O2_PRIME_HEX` (`0x00f5d4`), plus `dimOrBoost`.
   - Updated `ColorModel.compute(scheme, highlight)` to map nucleotide `role` (`'coding' | 'template' | 'mrna' | 'trna'`) to `EXPRESSION_HEX` when `asm.meta && asm.meta.kind === 'expression'`, with fallback to `STRAND_HEX`.
   - Added `'codon'` colour scheme and enhanced `'part'` colour scheme to highlight the RNA ribose `"O2'"` hydroxyl oxygen in bright cyan-teal (`0x00f5d4`).
   - Added safe `(BASE_INFO[nu.base] || BASE_INFO.T || { color: 0xff8a3d }).color` fallback and added `this.resEmph` for `highlight.residues`.

2. **`js/render/molecule.js` & `js/render/cartoon.js`**:
   - Added instanced sphere mesh `this.residuesMesh` ($C\alpha$ spheres, radius `res.radius || 1.85`) and instanced cylinder mesh `this.peptideBonds` (peptide links when `res[i].peptideBondActive && res[i].visible && res[i-1].visible`) when `asm.residues && asm.residues.length > 0`.
   - Rendered `this.residuesMesh` and `this.peptideBonds` across all representations (`ballstick`, `spacefill`, and `cartoon`) with lustrous material `this.residueMat`, colored by `res.color ?? 0xff7a45` and dimmed/boosted by `highlight.residues`.
   - Updated `setTier()`, `clear()`, and `dispose()` to manage `this.residuesMesh`, `this.peptideBonds`, and `this.residueMat`.
   - Guarded `CartoonLayer.update()` against sparse strands in `asm.strands`.

3. **`js/render/overlay.js`**:
   - Used `(BASE_INFO[nu.base] || { color: 0xff8a3d }).color` safely in `ensureBaseEls()`.
   - Added `uCutaway` uniform to `blobFragment` so `b.cutaway` slices open the camera-facing cap of macromolecular envelopes (`RNAP`, `30S`, `50S`) with a crisp cross-section ring at `f ~ 0.55`, exposing internal RNA·DNA hybrids and A/P/E site tRNAs.
   - Added `b.rot` support (both 3-element Euler `[rx, ry, rz]` and 9-element row-major rotation matrix `R` in science space) in `setBlobs(list)`.
   - Added `ensureResEls()` and residue label projection in `updateBaseLabels()` when `asm.residues` is present.

4. **`js/render/viewer.js`**:
   - Extended `setHighlight(h)` to accept `h.residues`.
   - Extended `pick(clientX, clientY)` to ray-test `asm.residues` (returning `{ residue: res.id, codon: res.codonIndex, nucleotide: -1, atom: -1, pair: -1, clientX, clientY }` when hit closer than any atom) and to include `codon: nu.codon ?? -1, role: nu.role || ''` on nucleotide hits.
   - Added `setFollowTarget(targetSpec | null)` and per-frame smooth damped tracking (`stepFollow`) supporting both explicit science-space `{ center, radius, dir }` and macromolecular actor modes (`'rnap'`, `'ribosome'`, `'peptide'`), pausing automatically while the user drags `OrbitControls`.
   - Extended `focus()`, `measureFit()`, and `frameOriented()` to account for `asm.residues` and nucleotide arrays.

## Validation Evidence & Known Limitations
- All five render modules pass `node --check` syntax validation with zero errors.
- 100% backward compatibility preserved for all existing viewer calls (`Explore`, `Pairs`, `Melt`, `Copy`, `X-ray`).
- Full browser visual inspection will be completed once integrated with `js/main.js` and `js/ui/ui.js` by the Integration Owner.
