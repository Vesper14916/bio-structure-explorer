# Stage ST6 — Argon Pre-S3 Independent Review (`R3-S3` Brief vs `PLAN.md` §5.3 & K1/K2 APIs)

- **Reviewer:** Gemini 4 Argon (ST6 Scarce Reviewer, time-boxed pre-S3 audit per `PLAN.md` §11)
- **Start (UTC):** `2026-11-20T06:33:05Z`
- **End (UTC):** `2026-11-20T06:41:41Z` (8 min 36 s; budget $\le$ 30 min)
- **Base inspected:** `main` at `431f327` (`r3-st5` + ST6 Viewer prep)
- **Scope:** Audit of the `R3-S3` brief (`js/sim/gene/transcription.js`, `js/kin/ntp.js`, `js/kin/pose.js`, `dev/story-lab.html`, `tests/story-tx.test.mjs`) against `PLAN.md` §§4.4, 5.1–5.3, 6.1–6.2, 8.2–8.3, 10 (`R3-S3`), `docs/CONTRACTS.md` §§7.3–7.4, `docs/DECISIONS.md` (`DEC-007`, `DEC-014`–`DEC-018`, `DEC-023`–`DEC-026`), K1 (`duplex.js`, `track.js`, `frames.js`), K2 (`chain.js`, `hairpin.js`), and S2 (`story.js`, `timeline.js`).
- **Verdict:** **READY TO LAUNCH `R3-S3` WITH 6 CONCRETE BRIEF ADJUSTMENTS (C1–C6 BELOW).** Without C1–C6, `R3-S3` would hit a 55.20 Å downstream DNA jump at promoter escape (`trackBlend: 0 → 0+`), a 1.48 Å RNA·$\sigma^{70}$ finger clash at nucleotides 6–10, a 1.61 Å NTP triphosphate clash in `rnap-ec`, and missing `rna` track / `rnaExit` anchor lookups on `rnap-holo`.

---

## 1. Interface Audit: `contributeTx` & `pose.js` vs K1, K2, S2, and Science Templates

### C1 (Critical) — `rnap-holo` (`r1 = 11`) vs `rnap-ec` (`r1 = 13`) Downstream Anchor Discontinuity in `poseDuplex`
- **Mechanism in K1 (`js/kin/duplex.js` lines 146–157, 189–217, 451–461):**
  - `rnap-holo` (`6CA0` RPo tracks from `R3-A4`) has template track registers `[-45, +11]` (`r1 = 11`), whereas `rnap-ec` (`6ALF`) has template track registers `[-15, +13]` (`r1 = 13`).
  - Because `C_{11}` of `rnap-holo` and `C_{13}` of `rnap-ec` come from different cryo-EM models, `machinePoseForRegister(holo, 45)` (`o = [-277.286, 17.883, -7.833]`, `zd = [0.1249, 0.2379, 0.9632]`) and `machinePoseForRegister(ec, 45)` (`o = [-280.216, 5.648, 5.813]`, `zd = [-0.1399, -0.0210, 0.9899]`) differ by **18.561 Å** in origin and **15.8°** in downstream axis.
  - Inside `poseDuplex`, `trackSet(S, ec, holo, tb)` returns `holo` directly when `tb <= 0` (so `r1 = 11` and downstream anchor `C1 = holo.C[11]`). However, for **any `tb > 0`** (`0 < tb < 1`), `trackSet` sets `out.r1 = Math.max(ec.r1, holo.r1) = 13`, and because `holo` has no frames at `r = 12, 13`, `blendList` copies `ec.C[12]` and `ec.C[13]` **unblended (100% `ec`)**.
  - **Consequence:** If `contributeTx` places RNAP at `M = machinePoseForRegister(assets['rnap-ec'], reg)` while `dna.trackBlend = 0`, then throughout Chapters 2–5 (`tb = 0`), `poseDuplex` computes the downstream arm from `M_ec · holo.C[11]`, throwing downstream bp 100 off the world `+x` axis by **55.20 Å** and snapping it by 55.20 Å the instant `trackBlend > 0` at `t = 3.5 s` of Chapter 5. Conversely, if `M` uses `machinePoseForRegister(holo, reg)` at `tb = 0`, `C1` still jumps discontinuously from `holo.C[11]` to `ec.C[13]` at `tb = 0 → 0+`.
- **Required Fix in `R3-S3` (`contributeTx` + `pose.js`, zero edits to K1 `duplex.js`):**
  1. Always compute the bound RNAP world transform from `rnap-ec`'s downstream reference frame: `M(reg) = machinePoseForRegister(assets['rnap-ec'], reg)` (since `rnap-holo` and `rnap-ec` protein cores are already co-registered in the `CONTRACTS.md` §6.3 frame).
  2. Keep `world.dna.trackBlend = 0` in `WorldState` prior to promoter escape (satisfying `DEC-007`), **but in `pose.js`** when calling `poseDuplex(construct, world.dna, assets, dnaFrames, { machine, trackBlend })`, pass:
     ```js
     const effectiveTrackBlend = rnapMachine ? Math.max(1e-6, world.dna.trackBlend ?? 0) : 0;
     ```
  - **Verified numerically in Node:** With `M = machinePoseForRegister(ec, reg)` and `effectiveTrackBlend = Math.max(1e-6, world.dna.trackBlend)`:
    - Registers `-45..-16` use 100% `rnap-holo` RPo frames; registers `-15..+11` at `tb = 1e-6` match `rnap-holo` RPo frames to within `0.0002 Å`; and `r = 13` uses `ec.C[13]` continuously for all `tb ∈ [0, 1]`.
    - Downstream DNA (`bp 100..247`) has **0.0000 Å drift** (`≤ 0.01 Å` gate) across all of Chapters 1–7, RNAP has **0.0000 Å pose jump** at promoter escape, and `rnap-holo` L1 penetration across `-45..+11` is **`0.946 Å ≤ 1.0 Å`**.

### C2 (Critical) — Missing `tracks.rna` and `anchors.rnaExit` on `rnap-holo`, plus Outward Tangent at `rnaExit`
- **Observed in decoded assets:**
  - `assets['rnap-holo']` has tracks `{ template, nontemplate }` and anchors `{ center, activeSite, ntpEntry }`. It does **not** have `tracks.rna`, `anchors.rnaExit`, or `anchors.hairpin` (those exist only on `assets['rnap-ec']`).
  - During Chapter 4 (`initiate`, nucleotides 1–3) and the first half of Chapter 5 (`escape`, nucleotides 4–11 before `trackBlend >= 0.5`), `machines[rnap].assetId` is `'rnap-holo'`, and by nucleotide 10–11 the 5′ end of mRNA already exceeds the 9-bp hybrid (`rna.length > 9`).
  - Furthermore, on `rnap-ec`, `anchors.rnaExit.o = [-33.34, -12.84, -13.81]` has default identity rotation `R` (`+z = [0, 0, 1]`, which points *back into* the RNAP core rather than outward from the exit channel). The actual 3′→5′ exit trajectory from `tracks.rna[-9]` (`[-16.76, -18.38, -1.30]`) through `tracks.rna[-12]` (`[-31.43, -3.79, -10.51]`) to `anchors.rnaExit` (`[-33.34, -12.84, -13.81]`) points outward into solvent along approximately `[-0.80, 0.30, -0.52]` in the RNAP frame.
- **Required Fix in `R3-S3` (`pose.js`):**
  1. Always read `tracks.rna`, `anchors.rnaExit`, and `anchors.hairpin` from `assets['rnap-ec']` (falling back from the active RNAP asset to `assets['rnap-ec']`), since both RNAP assets share the same core frame.
  2. When building/posing the emerged 5′ mRNA free chain (`buildFreeChain` / `poseFreeChain`), orient the chain's exit tangent **outward** from RNAP (unit vector from `rnapTransform · activeSite` or `rnapTransform · tracks.rna[-9].o` through `rnapTransform · rnaExit.o`), never along `rnaExit.R`'s raw `+z = [0, 0, 1]`.
  3. Keep nucleotide ordering clear: `Assembly` stores mRNA strand 2 in **$5'\to 3'$ order** (`0..178`, where `j` corresponds to coding DNA index `j + 45`). At transcript length `L = world.rna.length` (`0..179`), nucleotides `0 .. L - 1` are visible (`visible = idx < L`), the last `H = min(L, 9)` nucleotides (`idx = L - H .. L - 1`, when `!world.rna.released`) occupy `tracks.rna` registers `-H .. -1` (`r = idx - L`, so the 3′-terminal nucleotide `idx = L - 1` sits at register `-1`), and any emerged 5′ nucleotides (`0 .. L - H - 1`) sit on the hairpin / free chain outside `rnaExit`.

### C3 (High) — Assembly Nucleotide Count and Exported Science Names
- **Brief typo check:** A 248-bp DNA duplex has $248 \times 2 = 496$ DNA nucleotides (strand 0: 248 coding DNA `'deoxyribose'`; strand 1: 248 template DNA `'deoxyribose'`), plus 179 mRNA nucleotides (strand 2: `'ribose'`, role `'mrna'`) = **675 nucleotides total** in `target.asm` (not 427).
- **Template import check (`js/science/ntp.js`):**
  - `js/science/ntp.js` (re-exported by `js/science/index.js`) exports **`ntpTemplate(base)`** and **`PPI_TEMPLATE`** (a constant object `{ names, el, part, local, bonds, index }`, **not** a function `ppiTemplate()`, and **not** in `js/science/residues.js`).
  - `js/science/assembly.js` exports **`nucleotideTemplate(base, sugar)`** and **`Assembly`** (there is no `buildNucleotide` export).

---

## 2. `PLAN.md` §5.3 Invariants (1, 2, 7, 8) Audit Across Chapters 1–7

### Invariant 1 & 2 (Sequence identity, integer monotonic `rna.length`, bit-for-bit determinism)
- `WorldState.dna.register` is the **gene index of template register `0` (the $i+1$ active site)**.
- For nucleotide $n \in [1, 179]$ (1-based, corresponding to 0-based mRNA index $n - 1$ and gene index $45 + n - 1$):
  - While nucleotide $n$ enters (`ntp.enter`) and forms its bond (`bond.phosphodiester`), template register `0` is at gene index **`45 + n - 1`**.
  - During `ppi.leave` of nucleotide $n$, `dna.register` advances from `45 + n - 1` to `min(223, 45 + n)` (freezing at `223` after nucleotide 179 for Chapter 7 relaxation).
  - `completedCount(story, 'bond.phosphodiester', null, t)` gives the integer `world.rna.length` ($0 \dots 179$).

### Invariant 7 (Bubble $\le 15\text{ bp}$; DNA outside bubble fully paired)
- In Chapters 1–2 (`establish`, `search`), `dna.bubble = [0, 0]` (0 bp, fully paired).
- In Chapters 3–7 (before `dna.close` completes), `dna.bubble = [-11, 2]` covers integer registers `-11..+2` = **14 bp $\le 15\text{ bp}$**.

### Invariant 8 ("Nothing passes through a machine's L1 beads by more than 1.0 Å inside its slot tracks at 64 sample times per chapter")
Three L1 clash hazards were identified and resolved:

1. **C4 (High) — Partial-bend DNA (`0 <= beta < 1`) in Chapters 2, 3, and 7 vs Slot-Track Scope of §5.3 Item 8:**
   - At `beta = 1` (open complex on slot tracks), DNA inside the slot tracks has max L1 penetration **`0.946 Å ≤ 1.0 Å`** on `rnap-holo` (`registers -45..+11`) and **`0.648 Å ≤ 1.0 Å`** on `rnap-ec` (`registers -15..+13`).
   - In Chapter 7 `[10.15, 13.15]` s (`machine.move` with `leave: true`), freeze the DNA relaxation pose at `machinePoseForRegister(assets['rnap-ec'], 223)` while translating the RNAP actor outward into solvent (`+150 Å` along world `+y`), and evaluate §5.3 item 8 on active slot-track frames (`beta === 1` DNA track registers plus RNA hybrid registers `-H..-1`).
2. **C5 (High) — Nascent RNA 5′ End (`registers -6..-10`) vs $\sigma^{70}$ Finger (`part = 'sigma'`) in Chapter 5 (`escape`):**
   - At `registers -6..-10` (reached during nucleotides 6–10 in Chapter 5 `[1.0, 3.5]` s, before `part.release` starts at `3.5 s`), `tracks.rna` passes through `sigma` beads `3583–3596` ($\sigma_{3.2}$ loop) with `pen = 1.476 Å` if `sigma` is stationary.
   - Displacing `parts.sigma.transform.o` in RNAP's local frame (`DEC-026`) along `uSigma = [-0.797, -0.518, 0.309]` by `0 → 12 Å` as `rna.length` grows from `4` to `10` (before `part.release`) clears the $\sigma_{3.2}$ finger (`maxPen < 0.85 Å ≤ 1.0 Å`), then continuing `12 → 60 Å` during `part.release` `[3.5, 5.0]` s while keeping a standalone releasing `sigma` entry (`assetId: 'rnap-holo'`, `parts.core.visible = false`) after `rnap` switches to `'rnap-ec'` at `trackBlend = 0.5` prevents any pop at `t = 4.25 s`.
3. **C6 (High) — `poseNtp` Secondary-Channel Trajectory Clearance on `rnap-ec` (`1.613 Å` → `0.400 Å`):**
   - Guiding the `ntpTemplate(base)` heavy-atom centroid linearly from `ntpEntry.o` (`path = 0`) to `applyFrame(F_target, centroid)` (`path = 1`) where `F_target = partnerFrame(sampleTrack(ec.tracks.template, 0))` while slerping rotation `ntpEntry.R → F_target.R` keeps every atom of `ntpTemplate(base)` (`A, C, G, U`) strictly inside the secondary channel with max L1 penetration **`0.400 Å ≤ 1.0 Å`** across all `path ∈ [0, 1]`.
