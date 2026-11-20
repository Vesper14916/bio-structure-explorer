# ST8 stage-wide audit (before ST9)

- **Date:** 2026-11-20
- **Scope:** the full Step by step build (chapters 1–16) against `PLAN.md` §5.3, §6.1, §6.2, §6.3, §4.6 and science accuracy, after `R3-R4 → R3-Q2 → R3-U3` and the INT3 wiring.
- **Method:** two read-only reviewers (Sonnet, high effort) wrote the raw reports below. They ran the real story code in Node and did not change any file. The Chief (Claude, ST8 owner) triaged each finding and fixed what is clearly in scope.
  - `docs/reviews/R3-ST8-audit-conformance.md`: 17 findings (0 High, 5 Medium, 8 Low, 4 Info).
  - `docs/reviews/R3-ST8-audit-science.md`: 25 findings (0 High, 5 Medium, 13 Low, 7 Info). Offline, so PDB titles and citations were checked for internal consistency only.
- **Verdict:** no High finding. Step by step chapters 1–16 match §6.1 (ids, titles, groups, durations, sub-timings, total 164.05 s) and §6.2 (all 16 captions byte-identical, `{N} = 26`). §5.3 items 3–6 hold for k = 1..40 over 1,956 poses, items 2 and 7 hold over chapters 8–16, and the sequence facts of §5.1 verify independently. Real defects were found in item 8 (chapter 8), the ribosome cutaway, chapter 1, labels and some wording. They are fixed below.

## Disposition

| ID | Sev. | Finding (short) | Disposition |
| --- | --- | --- | --- |
| F01 | Medium | Chapter 8: mRNA penetrates L1 beads by up to 2.1 Å (§5.3 item 8) | **Fixed.** `js/kin/pose.js` clearance guard runs whenever the ribosome is in the scene. Worst chapter-8 value now ≤ 1.0 Å (DEC-030). |
| F02 | Medium | Item-8 test skipped all chapter-8 samples | **Fixed.** No `bound` gate; each chapter 8–16 must have sampled ribosome states. Verified to fail without the fix (2.112 Å at t = 73.06 s). |
| F03 | Medium | Chapter 1 had no holoenzyme (§6.1 row 1) | **Fixed.** Holoenzyme waits 400 Å away at full opacity; chapter 2 approaches from there. |
| F04 | Medium | `SD`/`AUG`/`UAA` tags drawn on DNA, ~400 Å from the ribosome | **Fixed.** Placed on mRNA codons once the ribosome is present. |
| F05 | Medium | Six-tag cap starved `EF-Tu`, `EF-G`, `UAA`, peptide tags | **Fixed by policy** (DEC-030, PLAN §4.6): no end tags in chapters 11–15, no `σ⁷⁰` in chapter 1. Sampled every 0.2 s: `EF-Tu` shows in chapters 11 and 14, `EF-G` in 13 and 14, `RF1` and `UAA` in 15. `AUG` is still absent in chapter 9 (cap full of factors and tRNAs). |
| F06 | Low | `stateAt(duration)` returns an empty translation world | **Documented.** The S2 boundary rule is tested; `StoryScene` stops at `duration − 1 ms` (`END_EPSILON`). |
| F07 | Low | Codon counter shows 41 (`UAA`) only 3.0 s into chapter 15 | **Documented, deliberate** (`tests/story.test.mjs`). Open for a product call. |
| F08 | Low | Peptide counter lags the drawn chain (up to 4.5 s in chapter 9) | **Deferred** (counter counts completed bonds). |
| F09 | Low | fMet-tRNA approach passes 6 Å from the A site before pairing | **Deferred** (cosmetic, no site violation). |
| F10 | Low | Moving anticodons reach 1.37 Å into beads | **Deferred** (already listed in `R3-S4.md`; outside the item-8 slot-track scope). |
| F11 | Low | Peptide in the tunnel penetrates beads by 1.2–1.9 Å | **Deferred** (unchecked by §5.3; ST9 V1 to decide on a tunnel clearance rule). |
| F12 | Low | Coverage gaps: item 7 after chapter 7, item 2 positions, item 6 in A | **Partly fixed** (item 8). Item 7, item 2 and item 6 tests are a backlog for ST9. |
| F13 | Low | Label tests use synthetic states | **Deferred.** Sampled real-state labels are in `docs/handoffs/R3-INT3.md`. |
| F14–F17 | Info | Plain `E. coli` (DEC-006); "about 13 bp" vs 14; duplicate chapter table in `view-story.js`; guard margin | **No action.** |
| S-01 | Medium | RNAP card names 6ALF for the promoter DNA bend; it comes from 6CA0 | **Fixed** (card, PLAN §5.2/§5.4, test). |
| S-02 | Medium | DNA card calls DNA spinning the "twin-domain view" | **Fixed** (card, PLAN §5.2). |
| S-03 | Medium | About sheet still describes the 48-bp construct, "TATA box", PDB 8FIZ | **Fixed** (`js/ui/about.js`). |
| S-04 | Medium | Coupled: terminator hairpin points into uS3 (4–7 Å) | **Forward risk for ST9** `R3-S5`/`R3-V1`: clash-test the posed hairpin. |
| S-05 | Medium | D = 38 ruled in DEC-024 but PLAN §6.4/D13 and `DEFAULT_D = 48` stale | **PLAN fixed** (§2 D13, §6.4). `DEFAULT_D` and coupled caption 10 are left for `R3-S5` (ST9). |
| S-12 | Low | IF1, IF2, IF3 share one wrong role sentence | **Fixed** (PLAN §5.4 rows split, cards, test). |
| S-15 | Low | "Anticodon loop" is 7 nt; the anticodon is nt 34–36 | **Fixed.** |
| S-06 to S-09, S-13 | Low | Caption wording: chemistry detail, GGQ role, extended-chain tunnel count, "true scale" overstatement, chapter-10 order | **Not applied.** §6.2 captions are locked copy with byte-for-byte tests. Exact replacement text is in the science report; ask the user if they want it. |
| S-10, S-11, S-14, S-16, S-17, S-18 | Low | First NTP bond/PPi, wobble disclosure, peptidyl-tRNA label, DNA end labels, missing speed disclosures, "X-ray" in fixed copy | **Not applied.** Wording or product calls; proposals are in the science report. |
| I-01 to I-07 | Info | GC content, D plausibility, rigid-factor conformers, event overlaps, label anchors, offline-unverifiable provenance, transcript end | **No action.** I-06 lists PDB titles and first authors for the Q3 release audit to confirm against RCSB. |

## What this audit could not check

- RCSB titles, resolutions and citations (the sandbox has no access). `node tools/build-assets.mjs --check` could not run for the same reason (sources cannot be downloaded); ST7 and ST8 changed no asset or build recipe.
- Hardware-GPU frame time and real phone hardware.
- The Coupled mode choreography beyond chapter 5 (stub until `R3-S5`).
