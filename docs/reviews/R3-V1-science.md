# R3-V1 — Independent science review (ST9)

- **Reviewed:** `r3/st9` at `8ef4b76` (R3-D1 and R3-S5 merged; R3-P1 on `r3/R3-P1` at `08752e1`). Read-only.
- **Reviewer:** Claude (ST9 continuation after the Gemini session stopped), with two read-only Haiku subagents for the D1 documents and for Coupled chapters 6–12. Every finding below that is marked fixed was re-checked by the reviewer against the code.
- **Time:** 2026-11-21, 11:30–11:50 UTC (about 20 minutes of review; fixes were applied afterwards in R3-INT4).
- **Scope (PLAN.md §10 R3-V1, ST9 brief):** Coupled chapters 6–12 (captions, timeline, poses, labels, NusG card); R3-D1 documents (`README.md`, `docs/SCIENCE.md` §1–2 and §6+, `docs/RELEASE-NOTES.md`); ST8 leftovers S-06 to S-18 (`docs/reviews/R3-ST8-audit-science.md`) and F07 to F11 (`docs/reviews/R3-ST8-audit-conformance.md`); I-06 PDB metadata.
- **Method:** reading code and documents against PLAN.md §5–§6, DEC-023, DEC-024, DEC-030, DEC-032 and `docs/assets/*.md`; running `buildTimeline` at D = 38 and D = 48; running `tests/story-coupled.test.mjs` alone (11/11 pass before INT4).
- **Not checked:** the running app frame by frame (the S5 evidence images in `docs/evidence/r3/S5/` were relied on), journal citations and DOIs.

## Counts

| Severity | Count | Fixed in R3-INT4 | Open (user decision or scheduled) |
| --- | --- | --- | --- |
| High | 0 | — | — |
| Medium | 8 | 5 (M-02, M-03, M-05, M-06, M-08) and half of M-04 | M-01 (caption 10, locked copy), M-04 in-app caveat, M-07 |
| Low | 11 new + 12 carried from ST8 | 0 | all; proposals below |
| Not verified | I-06 | — | RCSB unreachable from this session |

No finding is High: nothing makes a §5.3 invariant fail, and no visible text states a false fact as fact outside the locked captions listed as M-01 and the carried ST8 items.

## Findings

ID | Severity | Location | Finding | Evidence | Proposed correction | Status
--- | --- | --- | --- | --- | --- | ---
M-01 | Medium | `js/sim/gene/timeline.js:56` (Coupled caption 10, PLAN §6.4, locked) | "The ribosome continues on its own" implies further translation. At D = 38 `remainingCodons = 0`: chapter 10 (`couple-terminate`, 100.30–104.30 s) has no codon or NTP events, and the ribosome already sits on UAA; RF1 enters at 104.30 s. | `buildTimeline` at D = 38: cycles 39, remainingNt 0, remainingCodons 0; event list of chapter 10. Same as ST8 S-05(b). | Two options for the user. (a) ST8 text, true at D = 38 only: "The terminator hairpin has folded and the polymerase releases the RNA. The ribosome, already at the stop codon, no longer depends on it." (b) Text true for any D: "The terminator hairpin has folded and the polymerase releases the RNA. The ribosome no longer depends on the polymerase." `tests/timeline.test.mjs` copies the caption and changes with it. | **Open: user decision** (locked caption)
M-02 | Medium | `js/sim/gene/timeline.js:25-26` | Fallback `DEFAULT_D = 48` is live, not only stale: with an `rnap-ec` asset that lacks `source.coupling`, the story runs at D = 48 (122.80 s, caption 8 "48 nucleotides"). | `buildTimeline(C, undefined, { mode: 'coupled' })` gave D 48. | `DEFAULT_D = 38`, source `'6ZTJ, DEC-024'` (DEC-032 plan A). | **Fixed** (R3-INT4; `tests/timeline.test.mjs`)
M-03 | Medium | `js/scene/labels.js:491-493` | DEC-030 drops the mRNA 5′/3′ tags while the ribosome decodes, but only when `rna.layout === 'ribosome'`. In Coupled mode the layout is `'coupled'` from chapter 7 on, so the tags stay in `couple-run` and `release` and crowd out NusG and factor tags (also R3-S5 design gap 4). | Code reading; new test failed on the old code. | Treat `layout === 'coupled'` in group E chapters as decoding. | **Fixed** (R3-INT4; new test in `tests/story-coupled.test.mjs`)
M-04 | Medium | `docs/SCIENCE.md` §6 (expressome); app (no caveat) | SCIENCE.md claimed "zero steric clash" for the expressome, but the check covered only RNAP–ribosome and ribosome–DNA. The ST8 S-04 caveat (a real ribosome would unwind a hairpin this close to its entry channel) appears nowhere in the app. The S5 test and handoff call the contact "uS3"; the worst contacts are 30S S4 (folding) and S3 (full fold). The measured penetrations pass the 1.0 Å rule (max 0.091 Å vs ribosome, 0.526 Å vs RNAP). | `tests/story-coupled.test.mjs` test 6; `docs/handoffs/R3-S5.md`. | SCIENCE.md: state the scope of the clash check and the hairpin numbers (done). App: add to the NusG card or the coupled chapter 10 card: "In real expressomes the ribosome would unwind a hairpin this close to its mRNA entry channel; the terminator is shown folding anyway." | **Docs fixed; in-app caveat open** (product wording)
M-05 | Medium | `docs/SCIENCE.md` §3.2 item 4 | Said the Round 1 48-bp construct "remains unchanged for the default Round 1 Express mode until cutover at gate G4". False after INT4. | INT4 cutover. | Say the fixture is kept for science tests only. | **Fixed**
M-06 | Medium | `docs/RELEASE-NOTES.md` (9ZN2), `docs/SCIENCE.md` source table | 9ZN2 is cited as recorded in `docs/assets/factors.md`, which carries no citation; SCIENCE.md gives a DOI that was never verified. The citation in `about.js` is a placeholder (ST8 I-06c). | `docs/assets/factors.md` 9ZN2 rows; `js/ui/about.js`. | Call it a placeholder and say author and DOI are unverified. | **Fixed**
M-07 | Medium | `docs/SCIENCE.md` §6 (initiation), `js/sim/gene/timeline.js:116-126` | The first NTP is animated and documented with a phosphodiester bond and PPi release. The initiating NTP keeps its triphosphate; n NTPs make n − 1 bonds. | Same as ST8 S-10. | Code: emit only `ntp.enter` for n = 1. Minimum: add "(the very first NTP just binds)" to caption 4 (locked) and SCIENCE.md. | **Open** (changes locked caption 4 or the event table; schedule for ST10 or a follow-up)
M-08 | Medium | `README.md`, `docs/RELEASE-NOTES.md` (keys ←/→, Home) | Described the v2 key bindings, which only existed with `?scene=v2` before INT4. | `js/ui/ui.js` before INT4. | Resolved by the cutover; no doc change needed. | **Fixed by INT4**
L-01 | Low | `timeline.js:54` (Coupled caption 8, locked) | "{D} nucleotides behind its active site": the antecedent is ambiguous. D runs from the P-site codon's first nucleotide to the RNA 3′ end. | `docs/assets/rnap.md` §6.2; test 5 of `story-coupled.test.mjs` (`rna.length − p0 = 38`). | "NusG links the ribosome to the polymerase. The ribosome's P site sits {D} nucleotides behind the polymerase's active site." | Open (locked caption)
L-02 | Low | `timeline.js:53` (Coupled caption 7, locked) | "pauses briefly": the RNA holds at 62 nt from 39.75 s to 57.40 s, 17.6 s of a 121 s story. | Event table. | "Here transcription pauses so the steps can be seen." | Open (locked caption)
L-03 | Low | `assets/nusg.asset.json`, `js/ui/inspect.js` (NusG card) | In the 6ZTJ pose, the NusG NTD is 11.8 Å from the nearest RNAP L1 bead and the CTD 11.2 Å from the nearest ribosome bead, so neither contact is visible as a touch. The card text ("Bridges RNA polymerase and the ribosome") is still right. | Bead distances (subagent script). | Optional card bullet: "Linker and contacts drawn as in 6ZTJ; contact side chains not shown." | Open
L-04 | Low | `docs/RELEASE-NOTES.md` (teaching speed) | "roughly 10×–20× slower"; from the doc's own rates it is about 6–11× (transcription) and 17–22× (translation). | Arithmetic. | Use the two ranges. | Open
L-05 | Low | `docs/SCIENCE.md` §6+ (sources) | Says raw mmCIF files are pinned in `tools/sources.lock.json`; 1BNA is not there (read from `tools/1bna.cif`). | `tools/build-assets.mjs`. | Say 13 entries are pinned and 1BNA is read directly. | Open
L-06 | Low | `README.md`, `docs/RELEASE-NOTES.md` | "12 assets inlined"; the manifest has 13 including the synthetic `fixture-machine`. | `assets/manifest.json`. | "12 experimental assets plus a synthetic fixture". | Open
L-07 | Low | `docs/SCIENCE.md` §1 (Na⁺ correction) | Formula written with N_bp; the code uses n − 1. Which convention SantaLucia meant was not checked. | `js/science/thermo.js:63`. | State the code's convention. | Open, unverified
L-08 | Low | `docs/ASSETS.md` rows A03/A04 | Round 1 envelope rows still cite 8FIZ and envelope geometry. They are historical, but the table does not say so. | ST8 S-03. | Mark rows A01–A06 "Round 1, retired at G4". | Open
L-09 | Low | `js/ui/ui.js:77` | Comment says "Keys: 1-5 modes"; there are six. | Code. | Fix the comment. | Open
L-10 | Low | `PLAN.md` §6.4 vs `docs/DECISIONS.md` DEC-024 | Expected D range "45–55 nt" in PLAN, "40–60 nt" in DEC-024. | Text. | Amend PLAN §6.4 to cite DEC-024. | Open
L-11 | Low | F11 (ST8): peptide in the exit tunnel | ST8 left the tunnel clearance rule to V1. Ruling proposed: the peptide is exempt from §5.3 item 8 (which is about slot tracks); the 1.2–1.9 Å bead penetration in the tunnel is a known limitation of the rigid L1 bead model of the 50S, to be stated in PLAN §5.3 and SCIENCE.md. | `docs/reviews/R3-ST8-audit-conformance.md` F11. | Add "the nascent peptide is exempt from item 8" to §5.3. | Open (Chief records in DEC-033)

### Carried from ST8 (re-checked, still open)

Re-checked against the code at `8ef4b76`; nothing in ST9 changed them. Text proposals are in `docs/reviews/R3-ST8-audit-science.md` and `docs/reviews/R3-ST8-audit-conformance.md`.

- **Locked caption wording (need the user):** S-06 (caption 12 chemistry), S-07 (caption 15 GGQ role), S-08 (caption 14 extended-chain count), S-09 (caption 1 "true scale"), S-13 (caption 10 factor order). All Low.
- **Product wording or behaviour:** S-10 (first NTP, see M-07), S-11 (wobble disclosure in the codon readout, `view-story.js:541`), S-14 (peptidyl-tRNA label), S-16 (DNA 5′/3′ labels, `labels.js:611`), S-17 (missing speed and order disclosures), S-18 ("cryo-EM and X-ray" in `view-story.js:748`). All Low.
- **Already fixed in ST8:** S-12 (IF roles), S-15 (anticodon loop).
- **Conformance:** F07 (codon counter shows UAA 3 s late), F08 (peptide counter lags the chain), F09 (fMet-tRNA approach passes near the A site), F10 (moving anticodons up to 1.37 Å into beads). All Low and cosmetic; none breaks a §5.3 item as written. F11: see L-11.

### I-06 PDB metadata

**Not verified.** RCSB (`data.rcsb.org`, `files.rcsb.org`) was unreachable from this session (no response). Titles, first authors, the UAA stop codon in 8FZH and the 9ZN2 placeholder remain to be checked in the release audit (R3-Q3) from a machine with internet access.

## Verified OK

- Coupled timeline at D = 38: 12 chapters, 121.30 s (32.40 + 7.50 + 10.00 + 7.50 + 42.90 + 4.00 + 11.00 + 6.00); 39 cycles of 1.1 s; pause at 24 + 38 = 62 nt; NusG enters 55.90–57.40 s, `couple.lock` 57.40 s, hairpin fold 94.43–100.30 s, `rna.release` 101.30 s, NusG leaves 101.30–102.30 s, `couple.unlock` 104.30 s, RF1 104.30 s, peptide release 107.30–113.30 s.
- Coupled captions 6, 9, 11, 12 are correct as worded; caption 8 is correct apart from L-01.
- P-site to RNA 3′ end = D exactly at every cycle boundary; RNAP and ribosome L0 footprints never overlap (gap 21.2 nt); §5.3 items 1–8 hold over all 12 coupled chapters (`tests/story-coupled.test.mjs`, re-run alone: pass).
- D1 documents: PDB resolutions and chains match `docs/assets/*.md`; construct numbers (248 bp, 179 nt, 40 residues, UAA at codon 41, SD [11,17), AUG [24,27)); durations 164.05 s and 121.30 s; tunnel N = 26; npm scripts and key bindings match the code after INT4.
