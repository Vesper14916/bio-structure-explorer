# Handoff Report: T07–T12b UI, Sentinel & Verification (`js/ui/*`, `css/style.css`, `tests/sim.test.mjs`)

- **Agent:** Agent 4 — UI, Sentinel & Verification Agent (Gemini 4 Hydrogen Medium-Reasoning)
- **Date:** 2026-11-16
- **Status:** Complete & Verified (`37 / 37` unit tests passing)

---

## 1. Summary of Changes

1. **Icons (`js/ui/icons.js`)**:
   - Added `'express'` (RNA wave + ribosomal subunit + emerging nascent polypeptide chain on a 24×24 stroke grid), `'camera'`, and `'cutaway'` SVG icons.

2. **B-DNA / A-RNA Nucleic Acid Toggle (`js/ui/view-structure.js`, `js/ui/view-pair.js`, `js/ui/view-melt.js`)**:
   - **`js/ui/view-structure.js`**:
     - Added the `Nucleic acid` segmented control (`B-DNA (deoxyribose)` vs `A-RNA (ribose 2′-OH)`) firing `H.onNucleicAcid(v)`.
     - Added `'Shine–Dalgarno RNA'` (`AGGAGGUAUGGCU`) preset chip and automatic `T ↔ U` sequence conversion (`A, C, G, U` in RNA mode, `A, C, G, T` in DNA mode).
     - Updated the antiparallel duplex preview to pair `A·U` in RNA mode and `A·T` in DNA mode, and exposed `setNucleicAcid(na)`.
   - **`js/ui/view-pair.js`**:
     - Added full support for `U` and `AU`, `UA`, `GU`, `UG` pairs in both the sequence strip and the base-pair inspector.
     - Added `NOTE_BONDS.AU` (uracil lacks the C5 methyl group of thymine, 2 H-bonds) and `NOTE_BONDS.GU` (non-canonical wobble pair, 2 H-bonds).
     - Exposed `setNucleicAcid(na)` to update strip complements (`U` vs `T`) and header copy.
   - **`js/ui/view-melt.js`**:
     - Exposed `setNucleicAcid(na)` and updated the header and explanation note to cite the RNA nearest-neighbor parameters of Xia et al. (1998) / Turner & Mathews (2010) and explain $2'\text{-OH}$ / A-form stacking stabilization when in RNA mode.

3. **Gene Expression Mode View (`js/ui/view-express.js`)**:
   - Implemented `createExpressView(ctx)` matching the visual system and DOM efficiency (`h()`, `setText()`, `rafThrottle`) of `view-replicate.js` and `view-pair.js`:
     - **Peek transport**: Play/Pause button, Restart button, rAF-throttled timeline scrubber (`0..1000`), percentage readout, and `aria-live="polite"` educational caption.
     - **Controls**: Speed segmented control (`0.5×`, `1×`, `2×`) + live phase pill (`Promoter open`, `Transcription`, `70S Initiation`, `Translation`, `RF1 Termination`, `Complete`); `Camera follow` segmented control (`Overview`, `RNAP`, `Ribosome`, `Peptide`); and `Cutaway active sites (RNAP & 50S)` toggle tile.
     - **Interactive 12-Codon & Polypeptide Inspector Strip**: Preceded by a `5′ UTR (AGGAGG SD)` badge, renders all 12 codons (`#1 AUG → fMet` through `#11 GCU → Ala` and `#12 UAA → Stop`), plus an interactive 11-residue nascent polypeptide pill chain (`fMet-A-E-F-K-G-S-D-Y-Q-A`). Clicking a codon or residue pill fires `H.onExpression({ action: 'selectCodon', value: c })` (or `null` to clear) and updates the live codon/anticodon readout.
     - **Live stats (`stats-2`)**: `mRNA transcribed` (`/ 44 nt`), `RNA·DNA hybrid` (`bp`), `Active codon` (`AUG · fMet`, `UAA · RF1`, etc.), and `Nascent peptide` (`/ 11 aa`).
     - **Legend & Scientific Explanation**: 8-item strand/envelope legend and concise explanation of bacterial transcription, Shine–Dalgarno recruitment, $\text{fMet-tRNA}^{\text{fMet}}$ P-site initiation, A→P→E translocation, and RF1 termination at `UAA`, with an explicit pedagogical simplification note.

4. **UI Shell & Styling (`js/ui/ui.js`, `css/style.css`)**:
   - Added `{ id: 'express', label: 'Express', title: 'Gene expression', icon: 'express' }` to `MODES` (6 tabs total, keys `1..6`).
   - Added `'onNucleicAcid'` and `'onExpression'` to `HANDLER_NAMES`.
   - Exposed `ui.setNucleicAcid(na)`, `ui.setExpressState(s)`, and `ui.setExpressLegend(items)`.
   - Added keyboard shortcuts: keys `1..6` switch modes, `Space` toggles play/pause in both `'replicate'` and `'express'`, and `ArrowLeft`/`ArrowRight` steps through codons in `'express'`.
   - Updated `.tabs` and `.tabbar` in `css/style.css` to `repeat(6, 1fr)` and added styles for `.na-switch`, `.codon-strip`, `.utr-badge`, `.ccell`, `.codon-readout`, `.peptide-chain`, and `.pep-pill`.

5. **Unit Tests (`tests/sim.test.mjs`)**:
   - Appended 3 comprehensive unit test suites for `createExpressionSim`:
     1. Verifies API shape, 48-bp DNA + 44-nt ribose mRNA (`O2'` and `U` present) + 33-nt tRNA + 11 residues (`fMet-A-E-F-K-G-S-D-Y-Q-A`).
     2. Verifies `seek(p)` is a pure deterministic function of time across forward and backward scrubbing (`0.75 -> 0.25 -> 0.95 -> 0.25`) and 120 timeline samples.
     3. Verifies biological invariants: parental DNA re-closes behind RNAP, initiator `fMet` is residue 0 at `AUG`, and stop codon `UAA` (`c = 11`) recruits `rf1` without adding a 12th amino acid residue.

---

## 2. Validation Evidence

- `node --test tests/science.test.mjs tests/sim.test.mjs`: **37 / 37 tests pass** (0 failures).
- `node --check` on all modified and new UI modules (`js/ui/icons.js`, `js/ui/view-structure.js`, `js/ui/view-pair.js`, `js/ui/view-melt.js`, `js/ui/view-express.js`, `js/ui/ui.js`): **0 syntax errors**.

## 3. Known Limitations & Integration Notes for Agent 0

- `js/main.js` was intentionally left untouched per ownership boundaries; Agent 0 can now wire `onNucleicAcid`, `onExpression`, `ui.setNucleicAcid`, and `ui.setExpressState` directly in `js/main.js`.
