# Helix Gene Expression: Completion Plan (Round 3)

Status: Approved scope, not started. Written 2026-11-18 by the Round 2 integration owner. Team and schedule revised 2026-11-19 (D10, §9.1, §9.3, §11): ten serial stages; Claude owns ST2, ST3 and ST7; Gemini owns the rest with a Neon Chief, Hydrogen subagents and a 30-minute Argon job per stage.
Base commit: `main` after it is fast-forwarded to `claude/admiring-cray-fdre6q` (`481d681`, Round 2 Wave 1 closed).
History: the Round 1 and Round 2 plans are archived in `docs/history/PLAN-round1-2.md`. That file is a record only; this plan replaces it for all forward work.

---

## 0. How to use this plan

Every agent reads, in this order: `AGENTS.md`, §0–§4 of this plan, its own task in §10, then `docs/CONTRACTS.md`.

Precedence when documents disagree: this plan, then `docs/CONTRACTS.md`, then handoffs. If you find a disagreement, stop the affected step and report it to the Chief in your handoff. Do not resolve it yourself.

Wording: **MUST** and **MUST NOT** are requirements; a task is not done until each one is met. "Initial value" marks a number the Chief may tune at an integration gate within the stated tolerance. No other agent may change it.

The design system (§4) is closed. An implementation agent MUST NOT introduce a colour, font, font size, spacing value, radius, shadow, easing curve, duration, icon, effect, label string, caption, or UI copy that is not written in this plan or already present in the code. If something you need is missing, use the closest existing token, list it under "Design gaps" in your handoff, and continue. The Chief decides.

---

## 1. The finished product

Helix is a static website, with a single-file offline build, that shows one bacterial gene being expressed at true scale:

1. An *E. coli* RNA polymerase holoenzyme finds a promoter, opens the DNA, and transcribes a 179-nt mRNA. It loses σ⁷⁰ on the way, and an intrinsic terminator hairpin ends transcription.
2. A ribosome assembles on that mRNA with initiation factors, reads 40 codons with EF-Tu and EF-G, and releases a 40-residue peptide through its exit tunnel when RF1 reads the stop codon.
3. Two story modes play the same gene: **Step by step** (transcription, then translation) and **Coupled** (the ribosome follows RNA polymerase, as in bacteria).
4. Every machine comes from an experimental *E. coli* structure and carries its provenance. DNA, mRNA, tRNA anticodons, NTPs and the peptide are built procedurally at atomic detail, and they pass through slots taken from the same structures.
5. The scene sits in a patch of cytoplasm crowded at realistic density. It can be orbited, paused, scrubbed backwards and forwards deterministically, inspected by clicking, and followed by guided camera shots.

"Done" means every gate in §12 passes, including human visual acceptance on a desktop with a hardware GPU and on a phone.

---

## 2. Locked decisions

| # | Decision |
| --- | --- |
| D1 | **Scope is complete:** RNAP holoenzyme and core, 30S and 50S, initiator and elongator tRNA, atomic peptide (19 residue types plus fMet), NTP and PPi, RF1, EF-Tu, EF-G, IF1, IF2, IF3, NusG, terminator hairpin, cytoplasm crowders, and a Coupled story mode. |
| D2 | **True scale.** All coordinates are in ångströms in one world frame, and the display scale is 1 for every actor. No shrink factors. |
| D3 | **Construct v3:** 248 bp, a 179-nt transcript, and a 40-codon ORF whose first 11 codons are the Round 1 fixture (§5.1). It replaces the 150-bp construct in place: same export, new content. |
| D4 | **One species:** all structures are *E. coli* (§7.2). Factors and extra tRNAs come from other *E. coli* entries and are superposed onto the 7K00 ribosome by rRNA. Each such placement is recorded as a composite. |
| D5 | **E-site tRNA** comes from 7ST2, because 7K00 models only two E-site nucleotides. **RF1** comes from 8FZH, which reads a UAA stop on an *E. coli* ribosome. |
| D6 | **No proline** in the ORF. Its ring cannot close in the fixed extended backbone (φ −139°) used by the peptide builder. |
| D7 | **tRNA bodies:** one initiator body (tRNA^fMet) and one elongator body reused for all 19 elongator amino acids. Only the anticodon nucleotides 34–36 are rebuilt for each codon, as the exact Watson–Crick complement. Wobble pairing and modified nucleosides are disclosed, not modelled. |
| D8 | **Motion model:** deterministic, a pure function of story time. No physics, no random numbers at run time except those seeded from the scenario. Conformational changes are discrete labelled poses with interpolation. |
| D9 | **The new scene is developed at `index.html?mode=express&scene=v2`.** The Round 1 Express scene stays the default until gate G4. At G4 the new scene becomes Express and the Round 1 Express code is removed, with its tests ported. Other modes (Explore, Pairs, Melt, Copy, X-ray) are not changed except where a task says so. |
| D10 | **Team (revised 2026-11-19):** two executors. **Gemini** (Antigravity): Gemini 4 Neon (high) is the Chief and integration owner; subagents run on Gemini 4 Hydrogen; Gemini 4 Argon is a scarce reviewer with at most 30 minutes per stage. **Claude** (Claude Code) owns the three hardest parts as whole stages: ST2, ST3 and ST7. §9.1 and §11 are binding; tier labels inside §10 tasks are superseded by them. |
| D11 | **Branches:** `main` is the integration branch. Each task works on its own branch `r3/<task-id>`, in its own clone or worktree, and pushes only that branch. Only the Chief merges into `main` (§9.3). |
| D12 | **Ribosome colours change** from the Round 1 teal and mint (`0x38d9a9`, `0x63e6be`) to warm neutrals (§4.3). The old 30S teal is almost identical to the mRNA colour `0x2fd9b9`, and at true scale the mRNA runs through the 30S. |
| D13 | **Story length** at 1× is about 164 s in Step by step mode and about 121 s in Coupled mode (D = 38, DEC-024). Speeds: 0.5×, 1×, 2×, 4×. |
| D14 | **Runtime makes no third-party requests.** Optional links to RCSB in the inspection card open only when the user clicks them. |

---

## 3. Starting state (verified 2026-11-18)

Present on `claude/admiring-cray-fdre6q`, which becomes `main` (W0):

| Area | What exists | Where |
| --- | --- | --- |
| Hygiene | `package.json` (ESM), syntax check, 80 Node tests, headless smoke gate for `index.html` and `dist/helix-standalone.html` | `tools/check-syntax.mjs`, `tests/`, `tests/smoke.browser.mjs` |
| Asset format v1 | Encoder, decoder, validator; synthetic fixture | `js/assets/format.js`, `assets/fixture-machine.asset.json` |
| Asset pipeline | mmCIF reader, Kabsch base frames, density envelope with marching cubes, LOD builder | `tools/build-assets.mjs`, `tools/lib/*.mjs`, `tools/sources.lock.json` |
| RNAP | `rnap-ec` (6ALF elongation complex; tracks `template`, `nontemplate`, `rna`) and `rnap-holo` (6C9Y, σ⁷⁰ as part `sigma`, in the `rnap-ec` frame, no tracks) | `assets/rnap-*.asset.json`, `docs/ASSETS.md` A07–A08 |
| Actor renderer | L0/L1/L2 cross-fade, cutaway, subunit tints, picking; actor card page | `js/render/actors.js`, `dev/actor-card.html` |
| Residues, peptide | 11 residue templates (G, A, S, D, E, Q, K, M, fMet, F, Y), extended-chain builder | `js/science/residues.js`, `js/science/peptide.js` |
| NTP, PPi | Atomic templates | `js/science/ntp.js` |
| Construct | 150-bp `TRUE_SCALE_GENE_CONSTRUCT` (superseded by v3) and 48-bp `DEFAULT_GENE_CONSTRUCT` (Round 1 Express) | `js/science/scenario.js`, `js/science/genetic-code.js` |
| Express (Round 1) | Placeholder ellipsoids at about 1/5 scale; 48-bp scene; deterministic seek | `js/sim/expression.js`, `js/ui/view-express.js` |

Not verified so far: hardware-GPU frame rate, phone layout of Express, real-time cross-fade timing, and the literature value of the 63.8° DNA bend in 6ALF. Gates G3–G5 cover them.

---

## 4. Design system (locked)

The Helix visual language is "dark, quiet, precise" (header of `css/style.css`). Round 3 adds no new style. It extends the existing tokens to new actors by fixed rules.

### 4.1 Rules

1. Small actors carry saturated colour: nucleic acids, tRNAs, peptide and factors. Large machines are translucent and lower in saturation, so the events inside them stay readable.
2. The UI accent `#a99bff` (`--accent`) is used only for UI controls and selection. It is never used for a molecule.
3. One colour per molecular identity across the whole app. A molecule keeps its colour in every chapter, level of detail and story mode.
4. Labels are short nouns. Captions are full sentences of at most 230 characters, in plain present tense.
5. Motion is slow-in and slow-out (`easeInOutCubic`, `js/render/util.js`). Nothing bounces, overshoots, or flashes faster than 150 ms.

### 4.2 Stage (unchanged; MUST NOT be edited)

| Item | Value | Source |
| --- | --- | --- |
| Background | Radial gradient `BG_CENTER 0x14284a` → `0x0b1830` → `BG_EDGE 0x03060d` with three nebular blots `0x3a2a7a`, `0x0e5a6a`, `0x2a3f8a` | `js/render/stage.js` `buildBackground` |
| Environment | Procedural dome plus four emissive panels; PMREM | `buildEnvironment` |
| Lights | Key `0xfff1e0` 2.3, fill `0x9cc4ff` 0.7, rim `0x66e0ff` 1.9, rim2 `0xc58cff` 1.0, camera-relative | `buildLightRig` |
| Tone mapping | ACES Filmic, exposure 1.05 | `js/render/viewer.js` |
| Bloom | UnrealBloom strength 0.6, radius 0.5, threshold 1.05; off on `low` | `Post` |
| Fog | `FOG_COLOR 0x0a1628`; near = max(1, dist − 0.6 R); far = dist + 4.5 R + 25 | `viewer.js` |
| Particles | 140 / 380 / 800 for low / medium / high | `TIERS` |
| Camera | Perspective, FOV 32°, near 0.5, far 5000. W0 raises far to 12000 for true-scale scenes | `viewer.js` |

### 4.3 Molecular palette

All values are sRGB hex. Existing values are kept, and new values are marked **new**. The Chief adds the new values in W0 to the files listed. No other file may define molecular colours.

**Nucleic acids and peptide** (`EXPRESSION_HEX` in `js/render/colors.js`, unchanged)

| Identity | Hex |
| --- | --- |
| Coding DNA strand | `0x7c93c3` |
| Template DNA strand | `0x9fb2dc` |
| mRNA | `0x2fd9b9` |
| tRNA anticodon nucleotides | `0xffd43b` |
| Peptide (strand scheme) | `0xff7a45` |
| Bases A, T, U, G, C (base scheme) | `BASE_INFO`: `0x3fd67a`, `0xff5964`, `0xff8a3d`, `0xffc233`, `0x38a8ff` |
| Amino acids (codon scheme) | `AMINO_ACIDS[*].color` in `js/science/genetic-code.js` |

**Machines** (`ACTOR_TOKENS` in `js/render/actors.js`)

| Actor and part | L0 part colour | L1 tints |
| --- | --- | --- |
| RNAP core (unchanged) | `0x4fb6ff` | α `0x8fd0ff`, β `0x4fb6ff`, β′ `0x2f8fe0`, ω `0xb9e2ff` |
| σ⁷⁰ (unchanged) | `0xb58cff` | `0xb58cff` |
| 30S subunit (**new**, replaces `0x38d9a9`) | `0xe4dcc4` | 16S rRNA `0xf0eadb`, r-proteins `0xc9bd9c` |
| 50S subunit (**new**, replaces `0x63e6be`) | `0xd2b183` | 23S and 5S rRNA `0xe0c59f`, r-proteins `0xb38f5e` |
| tRNA, initiator body (from `trna-init`) | `0xffd43b` | `0xffd43b` |
| tRNA, elongator body (from `trna-aa`) | `0xff922b` | `0xff922b` |
| RF1 (from `rf1`) | `0xff6b6b` | `0xff6b6b` |
| EF-Tu (**new**) | `0xf783ac` | `0xf783ac` |
| EF-G (**new**) | `0xa9e34b` | `0xa9e34b` |
| IF1 (**new**) | `0xd0bfff` | `0xd0bfff` |
| IF2 (**new**) | `0xb197fc` | `0xb197fc` |
| IF3 (**new**) | `0x9775fa` | `0x9775fa` |
| NusG (**new**) | `0x15aabf` | `0x15aabf` |

Colour logic, to quote in reviews: the blues are RNA polymerase, violet marks initiation factors (σ⁷⁰ for transcription; IF1–IF3 for translation), warm neutrals are the ribosome (RNA-rich), yellow and orange are tRNAs, and each translation GTPase or release factor has its own hue.

**L2 elements** (unchanged, `docs/CONTRACTS.md` §6.4): C, N, O, P from `ELEMENT_INFO`; S `0xe6c84a`; Mg `0x7dff7a`; Zn `0x8f9cc9`; any other element `0xb0b8c8`.

**Crowders:** the machine's L0 part colour mixed 65 % toward `FOG_COLOR 0x0a1628` (linear-space lerp), opacity 0.22, `depthWrite: false`, no L1 or L2, no labels, not pickable.

### 4.4 Materials and levels of detail

| Element | Specification |
| --- | --- |
| Machine L0, L1, L2 | `docs/CONTRACTS.md` §6.4, unchanged: L0 `MeshStandardMaterial` roughness 0.55, metalness 0, opacity 0.30 alone or 0.10 under L1; L1 beads Cα 1.9 Å and P 2.4 Å with `residueMat` parameters; L2 balls `BALL_SCALE` × element radius; level by `ratio = cameraDistance / bounds.radius` (> 6: L0; 2.5–6: L1; ≤ 2.5: L2); cross-fade 250 ms; `low` tier never shows L2 |
| Procedural atoms (DNA, mRNA, anticodons, NTP, PPi, peptide) | `MoleculeLayer` materials: `atomMat` roughness 0.32, metalness 0.06; `bondMat` 0.42, 0.05; ball-and-stick `BALL_SCALE 0.3`, `BOND_RADIUS 0.17` |
| Detail sphere | Procedural nucleotides and residues whose reference atom (C1′ or Cα) lies within the shot's `detailRadius` of the shot target are drawn as ball-and-stick; the rest are drawn as cartoon (`cartoon.js` tube and slab; peptide as Cα tube of radius `PEPTIDE_BOND_RADIUS 0.42` with beads). Cross-fade band: 12 Å outside the radius. `detailRadius = 0` means cartoon only |
| Cutaway | One clip plane through the shot's cut anchor, normal toward the camera, applied to machine L0 and L1 only (unchanged rule) |
| Event pulse | On bond formation (phosphodiester or peptide), the two bonded atoms scale 1 → 1.35 → 1 and lerp 40 % toward white and back over 400 ms (`easeInOutCubic` each half). One pulse per event |
| PPi departure | PPi atoms move 18 Å outward along the NTP entry path over 900 ms while opacity goes 1 → 0 |
| Part or factor release | The part moves 60 Å along the unit vector from the host machine's `center` anchor to the part's centroid over 2.0 s, while opacity goes 1 → 0 over the last 1.2 s |
| GTP hydrolysis cue | A small label `GTP → GDP` (§4.6 style `hx-sm`) at the factor's `gDomain` anchor, visible for 1.4 s with 250 ms fades |

### 4.5 Representation defaults in the new scene

| Setting | Value |
| --- | --- |
| Representation | Ball-and-stick inside the detail sphere, cartoon outside |
| Colour scheme | `strand` (user may switch to `base`, `codon`, `element` in the existing Style controls) |
| H-bonds | On; drawn only for paired nucleotides in or near the detail sphere |
| Machine LOD | `auto` |
| Crowders | On for `high` and `medium`; off on `low` |
| Quality default | `auto` (existing tier logic) |

### 4.6 Labels

Style: existing `hx-tag` with the `hx-blob` variant for machines and `hx-label` for molecules (`js/render/overlay.js`). Machine tags take the border colour `#<part colour>aa`, as the Round 1 blob tags do. At most **6** tags are visible. When more qualify, the order below decides and the rest fade out over 250 ms.

| Priority | Label text (exact) | Shown when |
| --- | --- | --- |
| 1 | `RNA polymerase` | RNAP visible |
| 2 | `σ⁷⁰` | σ part visible and opacity > 0.5 |
| 3 | `Ribosome` (overview shots) or `30S subunit` and `50S subunit` (all other shots) | ribosome visible |
| 4 | `mRNA 5′` and `mRNA 3′` (ends of the transcript) | mRNA length ≥ 12 |
| 5 | `fMet-tRNA` / `<Aa>-tRNA` (for example `Ala-tRNA`) / `tRNA` (deacylated) | tRNA visible |
| 6 | `EF-Tu`, `EF-G`, `RF1`, `IF1`, `IF2`, `IF3`, `NusG` | factor visible |
| 7 | `Peptide N-terminus` | peptide length ≥ 1 |
| 8 | `DNA 5′`, `DNA 3′` (coding strand ends) | overview shots only |
| 9 | `−35`, `−10`, `+1`, `SD`, `AUG`, `UAA`, `Terminator` (region tags, `hx-sm`) | chapters 1–3 and 8–9 for promoter and SD tags; chapter 7 for `Terminator`; chapter 15 for `UAA` |

ST8 amendments (DEC-030): in chapter 1 the `σ⁷⁰` tag is not shown, so the six tags are `RNA polymerase`, `DNA 5′`, `DNA 3′`, `−35`, `−10` and `+1`; in chapters 11–15 the two `mRNA` end tags are not shown while the ribosome decodes, so the cap reaches `EF-Tu`, `EF-G`, `RF1`, `UAA` and `Peptide N-terminus`; `SD`, `AUG` and `UAA` are placed on the mRNA codons once the ribosome is in the scene.

### 4.7 Camera

- Shots are defined in §6.3. A shot is `{ target, dir, distance, detailRadius, cut, follow }`. `dir` is a unit vector in the target actor's frame, or in the world frame for world targets.
- Shot transitions use `viewer.moveCamera` (existing `easeInOutCubic`). Duration = clamp(0.8 + travel/600 Å, 1.2, 3.0) s, where travel is the distance between the old and new camera positions.
- While a shot has `follow: true`, the camera keeps its offset to the target and re-centres with the existing follow smoothing (`stepFollow`).
- Any user orbit, pan or zoom switches the Camera control to `Free` until the user picks another camera option. This is the existing interrupt behaviour.
- With reduced motion (`prefers-reduced-motion: reduce`), shot transitions are instant cuts and auto-rotate is off.

### 4.8 Express v2 panel (exact layout)

Use only the existing components in `js/ui/components.js` (`segmented`, `toggleTile`, `range`, `stat`, `sectionLabel`), the helpers in `js/ui/dom.js`, and the icons in `js/ui/icons.js`: `play`, `pause`, `restart`, `left`, `right`, `close`, `camera`, `cutaway`, `eye`, `info`. The panel is a new file, `js/ui/view-story.js`, with the root element `section.view#view-express` (it replaces `view-express.js` at G4). Top to bottom:

1. `header.view-head`: `h2` "Express the gene"; `p` "From one gene to one protein, at true scale."
2. `div.peek`:
   - `div.transport`: play/pause button `.btn-play` (icons `play`/`pause`, labels "Play"/"Pause"); restart `.icon-btn` (icon `restart`, label "Restart"); `div.scrub` holding the `range` (min 0, max 1000, step 1, label "Story progress", class `range-scrub`) and a `div.scrub-ticks` with one tick per chapter start; `span.pct`.
   - `div.row-between`: `span.phase` showing the chapter title, with `data-level` from the chapter group (transcription → `closed`, translation initiation → `mid`, translation elongation and termination → `open`, establishing and finale → `closed`); `span.chapter-count.mono` with the text `n / 16`.
   - `p.caption` (`aria-live="polite"`), holding the chapter caption.
3. `div.group.row-between`: left `div.grow` with `sectionLabel('Story')` and `segmented` (class `seg-sm`) options `Step by step` (`sequential`) and `Coupled` (`coupled`); right `div.grow` with `sectionLabel('Speed')` and `segmented` (class `seg-sm`) `0.5×`, `1×`, `2×`, `4×`.
4. `div.group`: `sectionLabel('Camera')`; `segmented` (class `seg-sm`) `Auto`, `Overview`, `RNAP`, `Ribosome`, `Free`. Default `Auto`.
5. `div.group.tiles`: three `toggleTile`s: `Cutaway` (hint "Open machines at the active site"), `Labels` (hint "Names in the scene"), `Crowding` (hint "Neighbouring molecules"). Defaults: on, on, on (`Crowding` off on the `low` tier).
6. `div.card.chapter-card`: `div.card-title` with `h3` "Chapters" and `span.card-sub` showing the total duration at the current speed, formatted `m:ss`; `ol.chapter-list` with one `button.chapter-row` per chapter, containing `span.chapter-n.mono` (`01`…`16`), `span.chapter-t` (title) and `span.chapter-d.mono` (`m:ss`). Clicking a row seeks to that chapter's start. The active row has `aria-current="step"`.
7. `div.card.codon-card`: the existing Round 1 codon card structure (`codon-strip`, `ccell`, `utr-badge`, `peptide-chain`, `codon-nav`), extended to 41 cells (40 sense codons and `UAA`). The strip scrolls horizontally and keeps the active codon centred using the existing scroll behaviour.
8. `div.stats.stats-2`: four `stat`s, all `big`: "mRNA" (unit `/ 179 nt`), "RNA·DNA hybrid" (unit `bp`), "Codon" (value `n / 40`, or `UAA` at the stop), "Peptide" (unit `/ 40 aa`).
9. `div.card.inspect-card`: `div.card-title` with `h3` set to the picked actor's name, or "Inspect" when nothing is picked, plus a `close` `.icon-btn.icon-btn-sm` (label "Clear selection"). Empty state: `p.note` "Click or tap a molecule to see what it is and where its structure comes from." Filled state: `p.inspect-role` (one sentence, §5.4) followed by `dl.inspect-dl` with rows `Source` (for example "PDB 7K00", followed by `a.link-btn` "RCSB ↗" with `target="_blank" rel="noopener"`), `Organism`, `Method`, `Chains shown`, `Detail level` (`Surface` / `Residues` / `Atoms` / `Procedural`), and `Simplifications` (a `ul` of one to three items from §5.4).
10. `div.card`: `div.card-title` with `h3` "Legend"; `ul.legend` with the entries in §4.9.
11. `div.explain`: `h3.label` "What you are seeing"; the two paragraphs in §4.10.

New CSS, appended at the end of `css/style.css` in a block headed `/* ---------- story (Round 3) ---- */`. These are the only new rules allowed:

```css
.scrub { position: relative; }
.scrub-ticks { position: absolute; left: 0; right: 0; top: 50%; height: 0; pointer-events: none; }
.scrub-ticks i { position: absolute; top: -4px; width: 2px; height: 8px; margin-left: -1px; border-radius: 1px; background: var(--line-2); }
.scrub-ticks i.is-active { background: var(--accent); }
.chapter-count { font-size: 12px; color: var(--text-3); }
.chapter-list { display: grid; gap: 2px; max-height: 284px; overflow-y: auto; margin: 2px -4px 0; padding: 0 4px; }
.chapter-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 8px; min-height: 34px; padding: 0 10px; border-radius: var(--r-sm); border: 1px solid transparent; background: none; color: var(--text-2); text-align: left; font-size: 13px; }
.chapter-row:hover { background: var(--raise); color: var(--text); }
.chapter-row[aria-current="step"] { background: var(--accent-2); border-color: var(--accent-line); color: #fff; }
.chapter-n, .chapter-d { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.chapter-row[aria-current="step"] .chapter-n { color: var(--accent); }
.chapter-t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inspect-role { font-size: 13px; line-height: 1.5; color: var(--text-2); margin-bottom: 10px; }
.inspect-dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; font-size: 12.5px; }
.inspect-dl dt { color: var(--text-3); }
.inspect-dl dd { color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.inspect-dl ul { display: grid; gap: 3px; }
.inspect-dl li::before { content: "– "; color: var(--text-3); }
```

Phone layout (< 700 px wide): the existing bottom sheet and its existing rules in `@media (max-width: 699px)`, unchanged. The peek (item 2) shows in the collapsed sheet, where the existing `.snap-peek .caption` rule clamps the caption to 2 lines. `--peek-h` MUST NOT change. Items 3–11 scroll in the expanded sheet. No phone-specific CSS is added.

### 4.9 Legend entries (exact, in order)

Strands (`kind: 'strand'`): `Coding DNA (5′→3′)` `0x7c93c3`; `Template DNA (3′→5′)` `0x9fb2dc`; `mRNA (5′→3′)` `0x2fd9b9`; `tRNA anticodon` `0xffd43b`; `Peptide (N→C)` `0xff7a45`.
Machines (`kind: 'blob'`): `RNA polymerase` `0x4fb6ff`; `σ⁷⁰` `0xb58cff`; `30S subunit` `0xe4dcc4`; `50S subunit` `0xd2b183`; `Initiator tRNA` `0xffd43b`; `Elongator tRNA` `0xff922b`; `EF-Tu` `0xf783ac`; `EF-G` `0xa9e34b`; `RF1` `0xff6b6b`; `IF1–IF3` `0xb197fc`; `NusG` `0x15aabf` (listed only in Coupled mode).

### 4.10 Fixed copy

"What you are seeing", paragraph 1:
> A 248-base-pair synthetic gene in *E. coli*. RNA polymerase copies its template strand into a 179-nucleotide mRNA; a ribosome then reads 40 codons of that mRNA and joins 40 amino acids into a peptide. Every molecule is drawn at its real size.

Paragraph 2 (`p.note`):
> Machines come from cryo-EM and X-ray structures listed under Sources. DNA, RNA, tRNA anticodons and the peptide are built atom by atom and moved between positions taken from those structures. Motion between structures is interpolated, not simulated.

About dialog: the existing `js/ui/about.js` structure. Task U2 adds a "Sources" section listing every entry in §7.2 as `PDB <id> — <title>, <first author> et al. (<year>), <journal>. <resolution> Å, <method>.` Bibliographic fields come from RCSB metadata recorded in `docs/ASSETS.md`.

### 4.11 Forbidden

- No new fonts, no web fonts, no icon libraries, no CSS frameworks.
- No glow or emissive shading on molecules, no outlines, no screen-space ambient occlusion, no depth-of-field, no chromatic aberration, no new post-processing passes.
- No gradients on UI elements other than those already in `style.css`.
- No colour on machines other than §4.3. No per-chain rainbow colouring.
- No text in the 3D scene other than §4.6 labels.
- No sound.

---

## 5. Science specification

### 5.1 Construct v3

Coding strand 5′→3′, 0-based half-open DNA indices. The transcription start site (+1) is index 45. This replaces the contents of `TRUE_SCALE_GENE_CONSTRUCT` in `js/science/scenario.js`, with `version: 3`.

| Region id | Range | Length | Sequence |
| --- | --- | --- | --- |
| `upstream` | [0, 10) | 10 | `CGACTGCATC` |
| `minus35` | [10, 16) | 6 | `TTGACA` |
| `spacer` | [16, 33) | 17 | `GCTAGCTCAGTCCTAGG` |
| `minus10` | [33, 39) | 6 | `TATAAT` |
| `discriminator` | [39, 45) | 6 | `GCTAGC` |
| `utrLeader` | [45, 56) | 11 | `ACTCTAACTAT` |
| `sd` | [56, 62) | 6 | `AGGAGG` |
| `sdSpacer` | [62, 69) | 7 | `TAACATA` |
| `orf` | [69, 189) | 120 | `ATGGCTGAATTTAAAGGTTCTGACTACCAAGCTACCCTGGTTCGTAACATCCACTGGGAACTGACTAAAGTTATGGACCGCTGCACCAACCTGGCGGAAAAGATCCACGGCTCTTACCTG` |
| `stop` | [189, 192) | 3 | `TAA` |
| `linker` | [192, 196) | 4 | `ACTC` |
| `termStem5` | [196, 204) | 8 | `GGCGCCTG` |
| `termLoop` | [204, 208) | 4 | `GAAA` |
| `termStem3` | [208, 216) | 8 | `CAGGCGCC` |
| `uTract` | [216, 224) | 8 | `TTTTTTTT` |
| `downstream` | [224, 248) | 24 | `GACTCAGTCAGCAGTCGATGCAGC` |

Full coding strand (248 bp):
```
CGACTGCATCTTGACAGCTAGCTCAGTCCTAGGTATAATGCTAGCACTCTAACTATAGGAGGTAACATAATGGCTGAATTTAAAGGTTCTGACTACCAAGCTACCCTGGTTCGTAACATCCACTGGGAACTGACTAAAGTTATGGACCGCTGCACCAACCTGGCGGAAAAGATCCACGGCTCTTACCTGTAAACTCGGCGCCTGGAAACAGGCGCCTTTTTTTTGACTCAGTCAGCAGTCGATGCAGC
```

Transcript: DNA [45, 224), 179 nt. mRNA index `j` corresponds to DNA index `j + 45`.
```
ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUACCCUGGUUCGUAACAUCCACUGGGAACUGACUAAAGUUAUGGACCGCUGCACCAACCUGGCGGAAAAGAUCCACGGCUCUUACCUGUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU
```

mRNA landmarks: SD [11, 17); start codon [24, 27); stop codon [144, 147); terminator stem 5′ [151, 159), loop [159, 163), stem 3′ [163, 171); U-tract [171, 179).

Peptide (40 residues, N→C): `fMet-A-E-F-K-G-S-D-Y-Q-A-T-L-V-R-N-I-H-W-E-L-T-K-V-M-D-R-C-T-N-L-A-E-K-I-H-G-S-Y-L`. It contains all 19 non-proline amino acids. GC content is 49 % in the ORF and 48 % overall.

Codon table (codon number is 1-based as shown in the UI; the anticodon is written 5′→3′ as the exact complement, D7):

| # | Codon | aa | Anticodon | # | Codon | aa | Anticodon | # | Codon | aa | Anticodon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | AUG | fMet | CAU | 15 | CGU | Arg | ACG | 29 | ACC | Thr | GGU |
| 2 | GCU | Ala | AGC | 16 | AAC | Asn | GUU | 30 | AAC | Asn | GUU |
| 3 | GAA | Glu | UUC | 17 | AUC | Ile | GAU | 31 | CUG | Leu | CAG |
| 4 | UUU | Phe | AAA | 18 | CAC | His | GUG | 32 | GCG | Ala | CGC |
| 5 | AAA | Lys | UUU | 19 | UGG | Trp | CCA | 33 | GAA | Glu | UUC |
| 6 | GGU | Gly | ACC | 20 | GAA | Glu | UUC | 34 | AAG | Lys | CUU |
| 7 | UCU | Ser | AGA | 21 | CUG | Leu | CAG | 35 | AUC | Ile | GAU |
| 8 | GAC | Asp | GUC | 22 | ACU | Thr | AGU | 36 | CAC | His | GUG |
| 9 | UAC | Tyr | GUA | 23 | AAA | Lys | UUU | 37 | GGC | Gly | GCC |
| 10 | CAA | Gln | UUG | 24 | GUU | Val | AAC | 38 | UCU | Ser | AGA |
| 11 | GCU | Ala | AGC | 25 | AUG | Met | CAU | 39 | UAC | Tyr | GUA |
| 12 | ACC | Thr | GGU | 26 | GAC | Asp | GUC | 40 | CUG | Leu | CAG |
| 13 | CUG | Leu | CAG | 27 | CGC | Arg | GCG | 41 | UAA | Stop | — (RF1) |
| 14 | GUU | Val | AAC | 28 | UGC | Cys | GCA | | | | |

Design checks already applied, which task S1 MUST turn into tests: no in-frame stop before codon 41; exactly one `AGGAGG` in the construct; no run of 4 or more T in the ORF; no run of 6 or more A in the ORF (a slippery A₆ was removed at codon 34); the internal AUG at codon 25 is in frame and is read as Met, not fMet.

### 5.2 Mechanism and its simplifications

| Step | Modelled as | Simplification to disclose |
| --- | --- | --- |
| Promoter search | Holoenzyme approaches along a straight path and binds at −35/−10 | Real search combines 3D diffusion and 1D sliding |
| Open complex | DNA melts registers −11 to +2; upstream DNA bends to the RPo geometry of 6CA0 (DEC-023) | Intermediates between closed and open complex are not shown |
| Initiation | NTPs 1–3 enter by the secondary channel; each bond releases PPi | Abortive initiation is not shown |
| Promoter escape | σ⁷⁰ released after nucleotide 12 | σ⁷⁰ is often retained for longer in cells |
| Elongation | One bp per step, about nine-bp hybrid, bubble re-closes behind | Pausing and backtracking are not shown; the step rate is a teaching speed |
| DNA rotation | DNA spins about its own axis as it threads through RNAP; RNAP does not rotate | Equivalent to RNAP tracking the helix; supercoiling (twin-domain model) is not shown |
| Termination | Hairpin folds in the exit channel as the U-tract is copied; RNA and DNA released | Hairpin pose follows 7YPA; release is shown as a single step |
| Translation initiation | 30S·IF1·IF3 binds SD; IF2 delivers fMet-tRNA to P; 50S joins; IFs leave | Factor order is the textbook canonical path; kinetic branching is not shown |
| Decoding | EF-Tu·GTP·aa-tRNA in A/T state; codon recognition; GTP hydrolysis; accommodation | Proofreading and near-cognate rejection are not shown; anticodon is an exact complement |
| Peptidyl transfer | Peptide moves from the P-site tRNA to the A-site tRNA | Chemistry shown as a bond pulse; no transition state |
| Translocation | EF-G binds; tRNAs pass hybrid states if the asset provides them (§7.4); mRNA moves one codon | Ribosome rotation is not shown; the ribosome is rigid |
| E-site exit | Deacylated tRNA leaves when the next A-site tRNA arrives | — |
| Termination | RF1 reads UAA; peptide released; RF1 leaves | RF3 and ribosome recycling are not shown |
| Peptide | Extended backbone (φ −139°, ψ 135°) following the tunnel centreline, then a smooth free path | No folding; inside the tunnel real peptides can be partly helical |
| Coupling | Ribosome follows RNAP at the 6ZTJ distance with NusG bridging | Coupling distance is fixed |

### 5.3 Invariants (become tests in S1, S2, S3, S4, S5)

1. The transcript equals the coding strand over [45, 224) with T→U, and is the reverse complement of the template strand over that range.
2. At every story time, the mRNA length is an integer that never decreases during transcription, and `stateAt(t)` is identical (bit for bit in `Float32Array` positions) for repeated calls and for any seek order.
3. The P-site codon during elongation cycle k (k = 1…40) is mRNA [24 + 3(k−1), 27 + 3(k−1)).
4. The peptide sequence after cycle k equals the first k residues of §5.1. No residue is added at codon 41.
5. Initiation places fMet-tRNA directly in the P site; it never occupies the A/T or A site.
6. Each anticodon pairs with its codon by Watson–Crick rules in the A site and the P site.
7. The bubble never exceeds 15 bp; DNA outside the bubble is fully paired.
8. Nothing passes through a machine's L1 beads by more than 1.0 Å inside its slot tracks (checked at 64 sample times per chapter).

### 5.4 Inspection text (exact)

| Actor | Role sentence | Simplifications (bullets) |
| --- | --- | --- |
| RNA polymerase | Copies the template DNA strand into RNA, 5′→3′. | Rigid structure; promoter DNA bend from 6CA0 (5.75 Å), elongation DNA from 6ALF |
| σ⁷⁰ | Recognises the −35 and −10 promoter elements and helps open the DNA. | Released at nucleotide 12 here; often retained longer |
| 30S subunit | Binds the mRNA and checks codon–anticodon pairing in the decoding centre. | Rigid; head swivel not shown |
| 50S subunit | Joins amino acids in the peptidyl-transferase centre; the peptide leaves through its exit tunnel. | Rigid; L1 stalk movement not shown |
| Initiator tRNA | Carries formyl-methionine to the start codon in the P site. | Pre-charged; formylation not shown |
| Elongator tRNA | Carries one amino acid and pairs its anticodon with the codon. | One body for all amino acids; anticodon rebuilt per codon |
| EF-Tu | Delivers aminoacyl-tRNAs to the A site and hydrolyses GTP on correct pairing. | Proofreading not shown |
| EF-G | Uses GTP to move tRNAs and mRNA by one codon. | Hybrid states only where the structure provides them |
| RF1 | Reads UAA and UAG and releases the finished peptide. | RF3 and recycling not shown |
| IF1 | Binds the 30S A site, keeping elongator tRNAs out, and supports IF2 and IF3. | Canonical order only |
| IF2 | Delivers the initiator fMet-tRNA to the P site and, as a GTPase, helps the 50S subunit join. | Canonical order only |
| IF3 | Favours the initiator tRNA on the start codon and keeps the subunits apart until the 50S subunit joins. | Canonical order only |
| NusG | Bridges RNA polymerase and the ribosome in coupled expression. | Fixed coupling geometry |
| DNA, mRNA, tRNA anticodon, peptide, NTP, PPi | (one sentence each, written by U2 from §5.2, ≤ 120 characters) | Procedural; ideal geometry |

---

## 6. Storyboard and timeline

### 6.1 Step by step mode (`sequential`)

Durations are at 1×. "nt" steps are transcript additions. The `group` column sets `data-level` (§4.8): T = transcription (`closed`), I = translation initiation (`mid`), E = elongation and termination (`open`), O = establishing and finale (`closed`).

| # | id | Title (exact) | Group | Duration | Content | Shot |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `establish` | A gene in the cytoplasm | O | 6.0 s | Straight DNA; crowders; holoenzyme 400 Å away | `wide` |
| 2 | `search` | Finding the promoter | T | 8.0 s | Holoenzyme moves to the promoter and binds (closed complex) | `rnap-side` |
| 3 | `open` | Opening the DNA | T | 6.0 s | Bubble −11…+2 opens; upstream DNA bends (β 0 → 1) | `rnap-side` |
| 4 | `initiate` | First bonds | T | 6.4 s | Nucleotides 1–3, 1.8 s each (NTP entry 0.8 s, bond 0.4 s, PPi exit 0.6 s), then 1.0 s hold | `rnap-active` |
| 5 | `escape` | Promoter escape | T | 6.0 s | Nucleotides 4–12 at 0.5 s/nt (4.5 s); σ⁷⁰ release 1.5 s overlapping the last two | `rnap-side` |
| 6 | `elongate-tx` | Elongation | T | 20.7 s | Nucleotides 13–150 at 0.15 s/nt | `rnap-follow` |
| 7 | `terminate-tx` | Termination | T | 13.15 s | Nucleotides 151–179 at 0.35 s/nt (10.15 s); hairpin folds; release and DNA relaxation 3.0 s | `rnap-exit` |
| 8 | `scan` | Ribosome meets mRNA | I | 8.0 s | mRNA settles into the translation layout; 30S·IF1·IF3 approaches and pairs with SD | `ribo-30s` |
| 9 | `start` | Start codon | I | 6.0 s | IF2·fMet-tRNA arrives; fMet-tRNA anticodon pairs with AUG in P | `ribo-decode` |
| 10 | `join` | 70S assembly | I | 6.0 s | 50S joins (2.5 s); IF3 leaves (at 1.0 s), IF1 and IF2 leave (from 3.0 s) with GTP cue | `ribo-side` |
| 11 | `decode` | Decoding | E | 9.0 s | EF-Tu·GTP·Ala-tRNA to A/T (3.0 s), pairing (2.0 s), GTP cue and EF-Tu leaves (2.0 s), accommodation to A (2.0 s) | `ribo-decode` |
| 12 | `bond` | Peptide bond | E | 4.0 s | Peptide moves from P-tRNA to A-tRNA; pulse | `ribo-ptc` |
| 13 | `translocate` | Translocation | E | 6.0 s | EF-G binds (1.5 s); tRNAs A→P, P→E and mRNA +3 nt (2.5 s); EF-G leaves (2.0 s) | `ribo-side` |
| 14 | `elongate-tl` | Elongation | E | 41.8 s | Codons 3–40 at 1.1 s per cycle: E-tRNA exit and EF-Tu delivery 0.35 s, bond 0.15 s, translocation 0.6 s | `ribo-tunnel` (codons 3–24), `ribo-exit` (25–40) |
| 15 | `release` | Stop codon | E | 11.0 s | UAA in A; RF1 binds (3.0 s); hydrolysis pulse (2.0 s); peptide slides out (4.0 s); RF1 leaves (2.0 s) | `ribo-decode` → `ribo-exit` |
| 16 | `finale` | Finished | O | 6.0 s | Free mRNA, ribosome, peptide; DNA straight | `wide` |

Total: 164.05 s. If a duration changes, the Chief updates this table and §2 D13 in the same commit.

### 6.2 Captions (exact; one per chapter)

1. A 248-base-pair gene in a patch of *E. coli* cytoplasm. Everything here is at true scale, built from experimental structures.
2. RNA polymerase holoenzyme scans the DNA. Its σ⁷⁰ subunit (violet) recognises the −35 TTGACA and −10 TATAAT promoter elements.
3. σ⁷⁰ melts about 13 base pairs around the start site. The template strand enters the active site and the DNA bends sharply.
4. Each incoming NTP pairs with the template. The RNA 3′-OH attacks its α-phosphate, adding one nucleotide and releasing pyrophosphate.
5. After about 12 nucleotides the enzyme leaves the promoter. Here σ⁷⁰ is shown leaving; in cells it often stays bound for longer.
6. The polymerase reads the template 3′→5′ and builds RNA 5′→3′. About nine base pairs of RNA·DNA hybrid stay inside; the DNA re-closes behind.
7. A GC-rich hairpin folds in the new RNA as the U-tract is copied. The weak U·A hybrid gives way, releasing the RNA and the DNA.
8. The 30S subunit, with IF1 and IF3, finds the Shine–Dalgarno sequence AGGAGG by pairing it with the 3′ end of its 16S rRNA.
9. IF2 brings the initiator fMet-tRNA to the P site, where its anticodon pairs with AUG. This sets the reading frame.
10. The 50S subunit joins. IF3 and IF1 leave, and IF2 hydrolyses GTP and departs, leaving a 70S ribosome ready to read codon 2.
11. EF-Tu brings an aminoacyl-tRNA to the A site. When its anticodon pairs with the codon, EF-Tu hydrolyses GTP and releases the tRNA.
12. In the peptidyl-transferase centre of the 23S rRNA, the new amino acid attacks the ester bond. The growing chain moves to the A-site tRNA.
13. EF-G uses GTP to move both tRNAs and the mRNA by exactly one codon: A to P, P to E. The A site is empty again.
14. Each cycle adds one amino acid to the C-terminus. The chain threads through the 50S exit tunnel and emerges after about {N} residues.
15. UAA has no tRNA. Release factor RF1 reads it in the A site and its GGQ motif hydrolyses the ester bond, freeing the 40-residue peptide.
16. One gene, one transcript, one peptide. More ribosomes could read the same mRNA; the peptide would now fold, which is not modelled here.

`{N}` in caption 14 is the integer number of residues needed to fill the computed tunnel path (task S4 computes it from the asset and asserts 22 ≤ N ≤ 34).

### 6.3 Shots (initial values; Chief may tune distance ±25 % and direction within 20°)

Frames: `rnap` is the `rnap-ec` frame (CONTRACTS §6.3); `ribo` is the ribosome frame (§7.3); `world` is the scene frame, where +x runs along the gene's downstream axis, +y is up, and the gene midpoint (bp 124) is at the origin.

| Shot | Target | dir (in frame) | Distance | detailRadius | Cut | Follow |
| --- | --- | --- | --- | --- | --- | --- |
| `wide` | world origin | world `[0.15, 0.88, 0.45]` | fit all actors except crowders, 10 % margin | 0 | — | no |
| `rnap-side` | rnap `center` | rnap `[0.85, 0.35, -0.40]` | 300 Å | 40 Å | — | yes |
| `rnap-active` | rnap `activeSite` | rnap `[0.80, 0.45, -0.40]` | 95 Å | 28 Å | `activeSite` | yes |
| `rnap-follow` | rnap `activeSite` | rnap `[0.85, 0.35, -0.40]` | 180 Å | 34 Å | `activeSite` | yes |
| `rnap-exit` | rnap `rnaExit` | rnap `[0.60, 0.70, 0.40]` | 160 Å | 36 Å | `rnaExit` | yes |
| `ribo-30s` | ribo `antiSD` | ribo `[-0.30, -0.85, 0.43]` | 380 Å | 34 Å | — | yes |
| `ribo-decode` | ribo `siteA` origin | ribo `[0.20, -0.75, 0.63]` | 130 Å | 30 Å | `decoding` | yes |
| `ribo-side` | ribo `center` | ribo `[0.10, -0.35, 0.93]` | 560 Å | 30 Å | — | yes |
| `ribo-ptc` | ribo `ptc` | ribo `[0.55, 0.25, 0.80]` | 120 Å | 26 Å | `ptc` | yes |
| `ribo-tunnel` | midpoint of path `tunnel` | ribo `[0.70, 0.10, 0.70]` | 210 Å | 30 Å | plane through the tunnel axis | yes |
| `ribo-exit` | ribo `tunnelExit` | ribo `[0.60, 0.55, 0.58]` | 240 Å | 40 Å | — | yes |

The `Overview` camera option uses `wide`. `RNAP` uses `rnap-follow`, or `rnap-side` when no transcript exists. `Ribosome` uses `ribo-side`. `Auto` uses the chapter shot.

### 6.4 Coupled mode (`coupled`)

Coupling distance `D`: the number of nucleotides from the first nucleotide of the ribosome's P-site codon to the RNA 3′-terminal nucleotide in RNAP, in the 6ZTJ expressome. Task A4 computes it from the 6ZTJ mRNA numbering, counting unmodelled nucleotides. It was expected to be roughly 45–55 nt; the measured value is D = 38 nt (chain AV of 6ZTJ, DEC-024), the contact end of that range. The ribosome can only bind once the transcript reaches `24 + D` nt, because at that length its footprint and RNAP's no longer overlap. Locking at exactly that length gives the 6ZTJ geometry with no catch-up phase.

Chapters 1–5 are identical to §6.1. Then:

| # | id | Title | Group | Duration | Content | Shot |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | `elongate-early` | RNA emerges | T | (12 + D) × 0.15 s | Nucleotides 13 to 24 + D at 0.15 s/nt | `rnap-follow` |
| 7 | `couple-scan` | Ribosome joins early | I | 10.0 s | Transcription pauses (teaching pause, disclosed). 30S·IF1·IF3 binds SD at the pose given by the `expressome` anchor; IF2·fMet-tRNA to P | `ribo-30s` |
| 8 | `couple-join` | 70S assembly | I | 7.5 s | As §6.1 chapter 10 (6.0 s), then NusG binds (1.5 s) and the expressome locks | `coupled-wide` |
| 9 | `couple-run` | Coupled elongation | E | ⌊(179 − 24 − D) / 3⌋ × 1.1 s | RNAP and ribosome move as one expressome (fixed 6ZTJ transform). Each translation cycle (1.1 s, as §6.1 chapter 14) matches 3 nt of transcription | `coupled-follow` |
| 10 | `couple-terminate` | Transcription ends | T | 4.0 s | Remaining 0–2 nucleotides; NusG leaves; hairpin release, RNA and DNA release as §6.1 chapter 7; the expressome unlocks | `rnap-exit` |
| 11 | `release` | Stop codon | E | (remaining codons) × 1.1 s + 11.0 s | As §6.1 chapters 14–15 for the remaining codons | `ribo-exit` |
| 12 | `finale` | Finished | O | 6.0 s | As §6.1 chapter 16 | `wide` |

The terminator hairpin folds during `couple-run` by the same rule as in Step by step mode (K2). For D = 38 the total is about 121 s, and no codons remain to read after the polymerase finishes (`remainingCodons = 0`, so chapter 11 is the release only).

Coupled-mode captions (exact):
- 6: The 5′ end of the mRNA, with its Shine–Dalgarno sequence, leaves the polymerase while transcription continues.
- 7: In bacteria a ribosome can start on an mRNA that is still being made. Here transcription pauses briefly so the steps can be seen.
- 8: The 50S subunit joins and the initiation factors leave. NusG links the ribosome to the polymerase, {D} nucleotides behind its active site.
- 9: The polymerase and ribosome move together. Every three nucleotides transcribed match one codon translated.
- 10: The terminator hairpin has folded and the polymerase releases the RNA. The ribosome no longer depends on the polymerase.
- 11: Release factor RF1 reads UAA and frees the 40-residue peptide.
- 12: In coupled expression, transcription and translation overlap in time and space, which is possible because bacteria have no nucleus.

Extra shots for this mode: `coupled-wide` targets the midpoint between RNAP `center` and ribosome `center`, `dir` world `[0.15, 0.80, 0.58]`, distance fitting both machines with a 15 % margin, `detailRadius` 0. `coupled-follow` is the same with `follow: true`.

---

## 7. Asset specification

### 7.1 Pipeline layout (W0 refactor by the Chief)

- `tools/build-assets.mjs` becomes a driver that runs recipes from `tools/assets/<recipe>.mjs`. Each recipe exports `{ id, sources: [pdbId…], build(ctx) → asset }`. CLI: `node tools/build-assets.mjs [--only <id>] [--check]`.
- Shared helpers stay in `tools/lib/`. W0 adds `tools/lib/superpose.mjs` (Kabsch on matched atom lists, returns `{ R, t, rmsd, n }`) and `tools/lib/match.mjs` (residue matching by chain, `label_seq_id` and atom name).
- `tools/fetch-sources.mjs` (W0) downloads every entry in `tools/sources.lock.json` into `tools/sources/` (ignored by Git), checks the SHA-256, and decompresses `.cif.gz` to `.cif`. Every agent that builds assets runs `npm run fetch-sources` first.
- Asset format **v2** (W0, `js/assets/format.js`): everything in v1, plus `paths` (`{ name: { points: base64 int16 xyz, count, synthetic: 0|1 } }`), `lod2.sites` (`[{ anchor, radius }]`, replacing the single `anchor` and `radius`), and `parts[].role` (`"body" | "replaceable" | "release"`). v1 files stay valid; the validator accepts both versions.
- Each asset task writes `docs/assets/<asset-id>.md` (provenance, preprocessing, checks). The Chief copies one summary row per asset into `docs/ASSETS.md` at merge.

### 7.2 Sources (W0 adds all to `tools/sources.lock.json`)

| PDB | Use | Chains used | Method, resolution | Why |
| --- | --- | --- | --- | --- |
| 6ALF | `rnap-ec` (existing) | α×2, β, β′, ω, DNA, RNA | cryo-EM 4.1 Å | Elongation complex with hybrid and exit RNA |
| 6C9Y | `rnap-holo` (existing) plus RPo DNA tracks (A4) | core, σ⁷⁰, promoter DNA | cryo-EM 4.25 Å | Open promoter complex |
| 7K00 | `ribosome-70s`, `trna-init`, `trna-aa`, mRNA core track | 16S, 23S, 5S, all r-proteins, mRNA X, tRNA Y (A), tRNA Z (P) | cryo-EM 1.98 Å | Highest-resolution *E. coli* 70S with A- and P-site tRNA |
| 7ST2 | E-site tRNA frame; mRNA track extension | 16S, 23S (for superposition), E-site tRNA, mRNA | cryo-EM 2.9 Å | Non-rotated post-translocation 70S with a full E-site tRNA |
| 8FZH | `rf1` | RF1 (w), 16S, 23S (superposition) | cryo-EM 2.9 Å | *E. coli* RF1 on UAA |
| 5WE4 | `ef-tu`; A/T tRNA frame | EF-Tu (z), Phe-tRNA (y), 16S, 23S | cryo-EM 3.1 Å | Wild-type EF-Tu ternary complex on the 70S |
| 7PJV | `ef-g`; hybrid tRNA frames if they pass §7.4 | EF-G (x), tRNAs (v, w), 16S, 23S | cryo-EM 3.1 Å | EF-G on the ribosome during translocation |
| 9ZN2 | `if1`, `if2` | IF1 (y), IF2 (x), 16S, 23S | cryo-EM 3.0 Å | 70S initiation complex |
| 9FDA | `if3` | IF3 (J), 16S (B) | cryo-EM 2.0 Å | 30S with IF1 and IF3; edeine is excluded |
| 6ZTJ | `nusg`; RNAP↔ribosome transform; coupled mRNA path | RNAP core, NusG (CF), 16S, 23S, mRNA (AV) | cryo-EM 3.4 Å | NusG-coupled expressome |
| 7YPA | Hairpin pose relative to RNAP | RNAP core, RNA | cryo-EM 3.05 Å | Termination hairpin nucleation complex |
| 1BNA | Existing X-ray mode reference | — | X-ray 1.9 Å | Unchanged |

Chain identifiers above come from RCSB metadata checked on 2026-11-18. Each asset task MUST confirm them against the downloaded file and record any difference in its handoff before continuing. Ligands, antibiotics, waters and ions are dropped, except Mg²⁺ ions within 8 Å of an L2 site.

### 7.3 Frames

- **`rnap` frame:** unchanged (CONTRACTS §6.3).
- **`ribo` frame** (from 7K00): origin = centroid of the C1′ atoms of the three mRNA nucleotides paired with the P-site tRNA anticodon (A1 determines them by pairing; expected codon `AUG`). +z = unit vector from that centroid to the centroid of the A-site codon C1′ atoms (the mRNA 5′→3′ direction). +x = component, perpendicular to z, of (centroid of all 23S P atoms − origin), pointing toward the 50S. +y = z × x.
- **`trna` frame** (each tRNA asset): origin = centroid of the C1′ atoms of nucleotides 34–36. +z = unit vector from the origin to the P atom of nucleotide 76 (or the last modelled 3′ nucleotide, recorded). +x = component, perpendicular to z, of (centroid of all P atoms − origin), pointing into the elbow. +y = z × x. Nucleotide numbers follow standard tRNA numbering. A2 maps `label_seq_id` to standard numbers and records the mapping.
- **Factor assets** (`rf1`, `ef-tu`, `ef-g`, `if1`, `if2`, `if3`) are stored in the `ribo` frame: their bound pose is the identity transform relative to the ribosome actor. `nusg` is stored in the `rnap` frame.
- **Superposition rule** for every source other than 7K00: superpose on P atoms of 16S and 23S nucleotides present in both entries, after excluding residues farther than 2.0 Å from their partner after a first pass (two passes). Record n, RMSD before trimming, and RMSD after. Gate: final RMSD ≤ 1.5 Å. 6ZTJ is the exception: superpose its ribosome on 7K00 (same rule) and its RNAP on `rnap-ec` (Cα of β and β′, same gate, ≤ 2.5 Å).

### 7.4 Assets to produce

| Asset id | Task | Parts (role) | Required anchors | Tracks and paths | L2 sites |
| --- | --- | --- | --- | --- | --- |
| `ribosome-70s` | A1 | `small` (body: 16S + 30S proteins), `large` (body: 23S, 5S + 50S proteins) | `center`, `siteA`, `siteP`, `siteE`, `siteAT`, `siteAP`*, `sitePE`*, `decoding`, `ptc`, `tunnelExit`, `mrnaEntry`, `mrnaExit`, `antiSD`, `smallCenter`, `largeCenter` | track `mrna` (registers −16…+15, register 0 = first nucleotide of the P-site codon); path `tunnel` | `decoding` 12 Å, `ptc` 12 Å |
| `trna-init` | A2 | `body`, `anticodon` (replaceable: nt 34–36) | `center`, `acceptor`, `elbow` | track `anticodon` (registers 34, 35, 36) | `acceptor` 8 Å |
| `trna-aa` | A2 | as `trna-init` | as `trna-init` | as `trna-init` | as `trna-init` |
| `rf1` | A3 | `body` | `center`, `ggq`, `codonReader` | — | `ggq` 8 Å |
| `ef-tu` | A3 | `body` | `center`, `gDomain` | — | — |
| `ef-g` | A3 | `body` | `center`, `gDomain`, `domainIV` | — | — |
| `if1`, `if2`, `if3` | A3 | `body` | `center` (`if2` also `gDomain`) | — | — |
| `nusg` | A4 | `body` | `center`, `ntd`, `ctd` | — | — |
| `rnap-holo` (update) | A4 | unchanged | add `ntpEntry` | add tracks `template`, `nontemplate` from 6C9Y RPo (registers relative to +1 at register 0) | unchanged |
| `rnap-ec` (update) | A4 | unchanged | add `ntpEntry`, `hairpin` (from 7YPA), `expressome` (ribosome pose in the `rnap` frame from 6ZTJ) | add path `coupledMrna` (6ZTJ mRNA from RNAP exit to ribosome entry, synthetic where unmodelled) | unchanged |

Anchor definitions (frames `{ o, R }`; z axes listed, x by the perpendicular-component rule against the stated reference):
- `siteA`, `siteP`, `siteE`: the `trna` frame of the A-site tRNA (7K00 Y), P-site tRNA (7K00 Z) and E-site tRNA (7ST2, superposed) in the `ribo` frame. Placing a `trna-*` asset with this transform puts it in that site exactly.
- `siteAT`: the `trna` frame of 5WE4 Phe-tRNA (superposed).
- `siteAP`, `sitePE` (\*conditional): the `trna` frames of the two 7PJV tRNAs (superposed). Include each only if its anticodon origin lies within 4.0 Å of the anticodon origin of `siteA` (for `siteAP`) or `siteP` (for `sitePE`). Otherwise omit it and record why; the story then interpolates directly between classic sites.
- `decoding`: o = centroid of 16S A1492, A1493 and G530 heavy atoms; z = `ribo` z.
- `ptc`: o = O3′ of A76 of the P-site tRNA; z = first segment direction of path `tunnel`.
- `tunnelExit`: o = last point of `tunnel`; z = last segment direction.
- `mrnaEntry`, `mrnaExit`: frames of `mrna` track registers +15 and −16.
- `antiSD`: o = centroid of 16S nucleotides 1535–1540 (anti-SD `CCUCCU`); z = local strand direction.
- `acceptor` (tRNA): o = O3′ of A76; z = unit (O3′ − C3′).
- `elbow` (tRNA): o = centroid of nucleotides 18, 19, 55, 56.
- `ggq` (RF1): o = centroid of the Gly-Gly-Gln motif Cα atoms. `codonReader`: centroid of the PxT motif Cα atoms.
- `gDomain`: centroid of the G-domain P-loop Cα atoms (GxxxxGK[ST] motif).
- `ntpEntry` (RNAP): the secondary-channel entrance found by ray casting. From `activeSite`, cast 256 rays on a Fibonacci sphere. Discard rays within 35° of `+z`, `−z`, or the direction to `rnaExit`. For each ray, take the minimum distance to any L1 bead over 5–35 Å along it. Pick the ray with the largest minimum. o = `activeSite` + 30 Å along that ray; z = −ray. Mark it synthetic.
- `hairpin` (RNAP): the frame of the 7YPA hairpin closing base pair, after RNAP superposition.

`mrna` track: registers inside the 7K00 modelled range are fitted from 7K00 X; the remaining registers in −16…+15 are fitted from 7ST2 mRNA after superposition, where modelled; anything left is synthetic, interpolated with A-form single-strand steps (rise 2.81 Å, twist 32.73°) from the nearest fitted register. The `synthetic` flags record which source each register used.

Path `tunnel`, computed by A1:
1. Voxelise a 140 Å cube centred on `ptc` at 1.0 Å spacing. Mark voxels within 3.0 Å of any 50S heavy atom as blocked.
2. Target: the unblocked voxel nearest the centroid of the Cα atoms of uL23 and uL29 that also lies on the solvent side (more than 8 Å from any heavy atom along at least one ray that leaves the cube).
3. Dijkstra from the voxel nearest `ptc` + 5 Å along `ribo` −x, with edge cost = length / clearance² (clearance = distance to the nearest heavy atom).
4. Smooth with three Chaikin iterations and resample at 1.0 Å.
5. Gates: length 75–110 Å; minimum clearance ≥ 3.0 Å beyond the first 6 Å. Record the length and clearance profile in `docs/assets/ribosome-70s.md`.

### 7.5 Budgets (per asset JSON; checked by `tests/asset-budgets.test.mjs`, added by Q1)

| Asset | L0 triangles | L1 beads | L2 atoms | File size |
| --- | --- | --- | --- | --- |
| `ribosome-70s` | ≤ 70,000 total | ≤ 15,000 | ≤ 4,000 | ≤ 1.2 MB |
| each tRNA | ≤ 4,000 | ≤ 80 | ≤ 400 | ≤ 60 kB |
| each factor | ≤ 8,000 | ≤ 900 | ≤ 400 | ≤ 120 kB |
| RNAP assets | existing | existing | existing | ≤ 220 kB each |
| all assets together | — | — | — | ≤ 3.0 MB; standalone HTML ≤ 7.5 MB |

---

## 8. Architecture and contracts (frozen by the Chief in W0 as `docs/CONTRACTS.md` §7)

### 8.1 Layout

| Layer | Path | Responsibility | Depends on |
| --- | --- | --- | --- |
| Science | `js/science/` | Construct, genetic code, templates (unchanged home) | — |
| Assets | `js/assets/format.js`, `js/assets/registry.js` (new) | Decode and validate assets; load from `assets/manifest.json` in the browser, from disk in Node, or from inlined data in the standalone build | science |
| Story | `js/sim/gene/` (new): `story.js`, `timeline.js`, `transcription.js`, `translation.js`, `coupled.js`, `shots.js` | Event list and `stateAt(t)`, with no DOM and no three.js | science, assets |
| Kinematics | `js/kin/` (new): `frames.js`, `duplex.js`, `track.js`, `chain.js`, `hairpin.js`, `peptide-path.js`, `trna.js`, `ntp.js`, `pose.js` | World state → atom positions and machine transforms; pure functions on typed arrays | science, assets |
| Scene | `js/scene/` (new): `story-scene.js`, `camera-rails.js`, `crowd.js`, `labels.js` | Builds the Assembly and atom groups, calls the viewer API, applies shots, owns crowders | everything above, `js/render/` |
| Render | `js/render/` | Existing layers plus `atom-groups.js` (R1) and `fx.js` (R2) | three.js |
| UI | `js/ui/view-story.js` (new), `js/ui/inspect.js` (new) | Panel and inspection card | dom |
| App | `js/main.js` | Wiring; the Chief only | all |

### 8.2 Story API

```js
// js/sim/gene/story.js
export function buildStory(scenario, assets, { mode = 'sequential', seed = 19 } = {}) // -> Story
// Story = { mode, duration, chapters: Chapter[], events: Event[], meta }
// Chapter = { index, id, title, group: 'O'|'T'|'I'|'E', t0, t1, shot, caption }
// Event = { id, type, t0, t1, chapter, data }   // t in seconds at 1x; events sorted by t0, then id
export function stateAt(story, t, out = undefined) // -> WorldState; reuses `out` when given
export function chapterAt(story, t)               // -> Chapter
```

Event types: `machine.move`, `machine.bind`, `part.release`, `dna.open`, `dna.close`, `dna.relax`, `ntp.enter`, `bond.phosphodiester`, `ppi.leave`, `rna.hairpin`, `rna.release`, `mrna.layout`, `ribosome.bind`, `ribosome.join`, `factor.enter`, `factor.leave`, `gtp.hydrolyse`, `trna.enter`, `trna.move`, `trna.leave`, `codon.pair`, `bond.peptide`, `translocate`, `peptide.release`, `couple.lock`, `couple.unlock`.

```js
// WorldState (all positions in world ångströms)
{
  t, chapter: Chapter, chapterProgress, caption,
  machines: [{ id, assetId, transform: { o, R }, opacity, visible,
               parts: { [partId]: { visible, opacity, transform? } }, label, pickable }],
  dna: { machineId: 'rnap' | null, register: number /* gene index of template register 0; fractional while stepping */,
         bend: number /* β, 0..1 */, bubble: [lo, hi] /* registers */, relax: number /* 0..1 */ },
  rna: { length: number /* integer */, addProgress: number /* 0..1 for the next nucleotide */,
         hairpin: number /* 0..1 */, released: boolean, layout: 'rnap' | 'free' | 'ribosome' | 'coupled', layoutBlend: number },
  ribosome: { codon: number /* P-site codon index, fractional during translocation */, bound: boolean },
  trnas: [{ slot: 0..3, kind: 'init' | 'aa', aa: 'fMet' | code3 | null, site: 'AT'|'A'|'AP'|'P'|'PE'|'E'|'out',
            from: site, blend: 0..1, codon: number, opacity, peptidyl: boolean }],
  peptide: { length, attach: 'P' | 'A' | 'free', release: 0..1 },
  ntp: { base: 'A'|'C'|'G'|'U' | null, path: 0..1, bonded: boolean },
  ppi: { path: 0..1, opacity },
  fx: [{ type: 'pulse' | 'gtp', anchor: { machineId, name } | { atomGroup, atoms: [i, j] }, f: 0..1 }],
  counters: { mrna, hybrid, codon, peptide },
  highlight: { codon: number | null },
  shot: { id, from: id | null, blend: 0..1 }
}
```

Rules: `stateAt` is a pure function of `(story, t)`. It MUST NOT read the clock, the DOM, or global mutable state. With `out` given, it MUST NOT allocate per call except for strings. Budget: median ≤ 2 ms in Node 22 on the CI container for any `t`.

### 8.3 Kinematics API

```js
// js/kin/pose.js
export function createPoser(scenario, assets)   // -> Poser (precomputes templates, typed buffers)
// Poser.pose(world: WorldState, target: { asm: Assembly, groups: AtomGroups, actors: ActorSpec[] })
//   writes nucleotide frames into asm (then asm.updatePositions()), atom-group positions, actor transforms.
```

Median ≤ 6 ms per `pose` for the full scene in Node 22 on the CI container.

Duplex algorithm (K1). Notation: `S(x)` is the B-DNA screw step, translation `3.38·x` Å along local z composed with rotation `34.2857·x` degrees about local z. Frame products are right-multiplied: `F·S(1)` is the next base pair 3′-ward on the coding strand.
1. **Template frames inside a machine.** For template register `r` within the track range `[r0, r1]`: `F_r` is the machine transform times the track frame. For fractional `r`, interpolate origin linearly and rotation by quaternion slerp between `floor(r)` and `ceil(r)`.
2. **Downstream arm** (`r > r1`): `F_r = M · T_{r1} · S(r − r1)`. Base-pair positions on this arm are stationary in the world while the machine translates along its downstream axis, and the arm spins about its own axis (§5.2 DNA rotation).
3. **Upstream arm** (`r < r0`): the axis follows a cubic Bézier in the machine frame, with `P0 = o(T_{r0})`, tangent `t0 = −z(T_{r0})`, `tE = −z_d` (the downstream axis direction reversed), `L = 40 × 3.38 Å`, `P1 = P0 + t0·L/3`, `P3 = P0 + (t0 + tE)·L/2`, and `P2 = P3 − tE·L/3`; beyond `P3` the axis is straight along `tE`. Arc-length tables use 512 samples. Frames along the curve are rotation-minimising (double-reflection method), seeded from `T_{r0}`, and apply twist `−34.2857°` per base pair going upstream.
4. **Bending blend β:** replace `t0` by `slerp(tE, t0, β)` and each track frame by `slerp(ideal straight frame, track frame, β)`. At β = 0 the whole duplex is ideal and straight.
5. **Strands:** the coding-strand nucleotide frame is `partnerFrame(template frame)` outside the bubble. Inside the bubble it is the `nontemplate` track frame (synthetic where flagged).
6. **Relaxation** after release: freeze the last machine pose, then drive β from 1 to 0 over `dna.relax`.

Machine motion along DNA: `M(t) = M_0 · translate(z_d · 3.38 · (register(t) − register_0))`, with no rotation. Promoter binding uses `rnap-holo` with its RPo tracks. At promoter escape (chapter 5), track frames blend from `rnap-holo` to `rnap-ec` over 1.5 s by slerp per register, and the machine's asset id switches to `rnap-ec` at blend 0.5 (σ is a part of `rnap-holo` only; it is released first).

Free chains (K2): centripetal Catmull–Rom splines through control points; arc length from 512-sample tables; nucleotides as an A-form single strand along the curve (rise 2.81 Å, twist 32.73°, rotation-minimising frames). Tail control points are generated from `mulberry32(seed ⊕ hash(chainId))`: one control point every 20 nt, each turning at most 35° from the previous tangent. Gentle motion: each control point is offset by `6 Å · sin(2π(t/7 s + φ_k))` along its normal, with the amplitude ramping to 0 within 30 Å of any anchor.

Peptide on a path (K2): Cα of residue `k` (k = 0 is the residue attached to the tRNA) at arc length `k · 3.40 Å` along `tunnel`, then along the free-peptide spline. Residue atoms come from per-residue local frames measured once on the ideal `buildPeptide` chain (x = Cα(i+1) − Cα(i−1), y = perpendicular component of Cβ or Hα direction, alternating 180° per residue) and re-applied on the path's rotation-minimising frames. Gate: every C(i)–N(i+1) distance is within 1.33 ± 0.25 Å at every tested time.

### 8.4 Scene API

```js
// js/scene/story-scene.js
export function createStoryScene(viewer, { scenario, assets, mode, tier }) // -> StoryScene
// StoryScene: { story, seek(t), play(), pause(), setSpeed(v), setMode(mode), setCameraOption(opt),
//               setToggles({ cutaway, labels, crowding }), pick(hit) -> InspectInfo | null,
//               state() -> UiState, dispose() }
```

`UiState` merges into `ui.setExpressState` with the keys `progress`, `playing`, `speed`, `mode`, `chapterIndex`, `chapters`, `caption`, `phaseLevel`, `cameraOption`, `counters`, `codons` (41 entries in the Round 1 `DEFAULT_CODONS` shape), `activeCodon`, `peptideSeq`, `inspect`.

Viewer additions (owned by R1 and R2, wired by the Chief): `viewer.setDetailFocus({ center, radius })`, `viewer.setAtomGroups(groups)`, `viewer.setFx(list)`, `viewer.setCrowd(instances)`, `viewer.setLabels(list)`, and `viewer.setFar(far)`.

---

## 9. Team, process and gates

### 9.1 Executors, models and roles (revised 2026-11-19)

Two executors share Round 3. Each stage in §11 belongs to exactly one executor. No stage is shared.

**Claude (Claude Code session).** Owns the three hardest parts, each as a whole stage:

| Part | Stage | Tasks | Why it is hard |
| --- | --- | --- | --- |
| C1 Ribosome and tRNA assets | ST2 | A1, A2 | 7K00 is the largest structure in the project; three superpositions, the tunnel search, a 32-register mRNA track and tight budgets; everything in translation depends on it (critical path) |
| C2 Kinematics core and story engine | ST3 | K1, S2 | The duplex algorithm and the event engine define the determinism, continuity and allocation guarantees that every later choreography relies on |
| C3 Translation choreography | ST7 | K3, S4 | The densest choreography: four tRNA slots, six factors, mRNA sliding, codon pairing, peptide growth through the tunnel, §5.3 items 3–6 and 8 |

Claude runs on its own models and decides its own subagent use. Claude follows §9.2 rules 2–8, this plan, `docs/CONTRACTS.md` and the stage's exit check exactly like any task agent. Claude does not change contracts; requests go into its handoff.

**Gemini (Antigravity).** Owns every other stage: ST1, ST4, ST5, ST6, ST8, ST9 and ST10. Model rules:

| Role | Model and effort | Use | Limits |
| --- | --- | --- | --- |
| Chief (integration owner) | **Gemini 4 Neon, high** (main conversation) | Stage briefs, contracts (`docs/CONTRACTS.md`), merges, gates, integration tasks (INT2–INT5), tuning "initial" values, design gaps, root-cause analysis, intake of Claude stages. Owns `js/main.js`, `docs/CONTRACTS.md`, `docs/TASKS.md`, `docs/VALIDATION.md`, `docs/ASSETS.md`, `docs/DECISIONS.md`, `PLAN.md`, `AGENTS.md`, `dist/` | Does not write feature code that a subagent task owns |
| Implementation subagents | **Gemini 4 Hydrogen** (if Antigravity cannot select a model, subagents inherit Neon; record which in `docs/TASKS.md`) | Every §10 task in a Gemini stage, one task per subagent, in its own worktree | At most 5 at once; only the files in the task's "Owns" list |
| Scarce reviewer | **Gemini 4 Argon** | One time-boxed job per stage, named in §11 "Argon job". Output is a written review or a diagnosis with a proposed patch, saved as `docs/reviews/R3-<stage>-argon.md`; the Chief or a subagent applies it | **At most 30 minutes per stage**; unused time does not carry over. Never used as a long-running implementer. Only the Chief starts it. When the quota is spent the Chief continues on Neon |

Rules for the Argon job:
1. The Chief prepares the input before starting Argon: the exact question, the files to read, and the evidence (test output, screenshots, handoffs). Argon does not explore the repository on its own.
2. Priority if a stage needs more than one job: a failing gate first, then the job listed in §11.
3. The Chief records start time, end time and outcome in `docs/TASKS.md`.

Tier labels written inside §10 tasks (Carbon, Argon, Hydrogen, Flash) are historical and are superseded by this section.

### 9.2 Rules for every agent (repeat at the top of every brief)

1. Work in your own clone or worktree on branch `r3/<task-id>`, created from the `main` commit named in your task's "Base" line. Never switch branches in a shared checkout. Push only your branch.
2. English only in every file.
3. Edit only the files in your task's "Owns" list. Create new files only under paths in your "Owns" list. If you need any other change, write it under "Requests" in your handoff and continue without it.
4. Do not invent data. If an input is missing or a step cannot be done as written, mark the step `BLOCKED` in the handoff with the exact error, and finish the rest.
5. Before handing off, run `npm test` and `npm run smoke`, and paste the final summary lines exactly as printed. Do not skip, delete, or weaken an existing test.
6. Visual work: attach screenshots taken with Playwright at `deviceScaleFactor: 2`, 1440×900 for desktop and an `iPhone 13` device profile for phone, saved under `docs/evidence/r3/<task-id>/`.
7. Handoff file: `docs/handoffs/R3-<task-id>.md` with sections `Changed files`, `Acceptance` (each item: how checked, observed result), `Not verified`, `Design gaps`, `Requests`, `Open questions`.
8. Stay inside the brief. Do not refactor neighbouring code or restyle anything.

### 9.3 Merging

- The Chief merges with `git merge --no-ff r3/<task-id>`, in the order given in §11 for each wave. After each merge: `npm test`, `npm run smoke`, and `node tools/build-assets.mjs --check` when assets changed.
- A failed gate is fixed on the task branch by the task's agent, not on `main`, unless the fix is a one-line integration change in a Chief-owned file.
- After each stage the Chief tags the stage tag from §11 on `main`, updates `docs/TASKS.md` and `docs/VALIDATION.md`, and **pushes `main` and the tag to `origin`**, because a Claude stage starts from that tag on GitHub.
- **Intake of a Claude stage** (start of the next Gemini stage): Claude delivers one branch on `origin` (name given in its handoff) based on the previous stage tag, with one `--no-ff` merge commit per task already made in task order, and handoffs `docs/handoffs/R3-<task-id>.md`. The Chief fetches it, runs `npm test`, `npm run smoke` and `node tools/build-assets.mjs --check`, reads the handoffs, merges it into `main` with `git merge --no-ff`, tags the Claude stage tag, and pushes. A failed check goes back to Claude with the exact output; the Chief does not fix Claude-owned files.

### 9.4 Contract changes

A task that needs a contract change stops that part, writes the proposal under "Requests", and continues with the rest. The Chief accepts or rejects it within the wave and records the decision in `docs/DECISIONS.md` (W0 creates it).

---

## 10. Tasks

Each task lists **Tier**, **Base**, **Depends**, **Owns**, **Steps**, and **Acceptance**. "Base" is the `main` tag to branch from.

**Superseded grouping (2026-11-19):** the wave headings, "Tier" lines, "Base" lines and "Merge order" lines below are kept for reference only. Which stage a task belongs to, who executes it, which model runs it, what it branches from and its merge order are set by §9.1 and §11.

### Wave 0 (Chief only; serial)

#### R3-W0 — Setup and contracts
- **Tier:** Carbon, high. **Base:** `claude/admiring-cray-fdre6q` at `481d681`.
- **Steps:**
  1. Already done when this plan landed: `main` was fast-forwarded to the base commit and this plan committed on top. Branch from that commit.
  2. Done on 2026-11-19: `AGENTS.md` "Operational allocation policy" matches §9.1. Check it and continue.
  3. Refactor `tools/build-assets.mjs` into the driver and recipes (§7.1). Move the RNAP logic into `tools/assets/rnap.mjs`. `--check` MUST still print identical output for `rnap-ec` and `rnap-holo`.
  4. Add `tools/lib/superpose.mjs`, `tools/lib/match.mjs`, `tools/fetch-sources.mjs` and the `npm run fetch-sources` script; add the §7.2 entries to `tools/sources.lock.json` with SHA-256 values.
  5. Asset format v2 in `js/assets/format.js`, with tests; regenerate the fixture as v2 with one `path` and two `lod2.sites`.
  6. Add `js/assets/registry.js` (`loadAssets(ids)` for browser, Node and inlined data) with tests.
  7. Create module stubs for §8.1 (`js/sim/gene/*`, `js/kin/*`, `js/scene/*`, `js/render/atom-groups.js`, `js/render/fx.js`, `js/ui/view-story.js`, `js/ui/inspect.js`). Each exports the documented functions with JSDoc and throws `Error('not implemented: <name>')`.
  8. Add a fixture world state `tests/fixtures/world-state.json` (chapter 6 midpoint, hand-written to the §8.2 schema) and a fixture story `tests/fixtures/story-mini.json` (3 chapters, 12 events), so UI and render lanes can work before the story exists.
  9. Add the new palette values (§4.3) to `ACTOR_TOKENS`, and the crowder rule as a function `crowdColor(hex)`, in `js/render/actors.js`. Update `docs/CONTRACTS.md` §6.4 and add §7 (§8 of this plan, verbatim plus the field lists).
  10. Raise the camera far plane to 12000.
  11. Route `?scene=v2` in `js/main.js` to a placeholder that loads the fixture world state into an empty viewer, so the smoke gate can load it.
  12. Create `docs/DECISIONS.md` and the Round 3 board in `docs/TASKS.md`; tag `r3-w0`.
- **Acceptance:** `npm test` and `npm run smoke` pass; `build-assets --check` identical; `?scene=v2` loads with zero console errors; every stub imports cleanly in Node.

### Wave 1 (eight agents in parallel; Base `r3-w0`)

#### R3-A1 — Ribosome asset
- **Tier:** Argon, high. **Depends:** W0.
- **Owns:** `tools/assets/ribosome.mjs`, `assets/ribosome-70s.asset.json`, `tests/assets-ribosome.test.mjs`, `docs/assets/ribosome-70s.md`, `docs/evidence/r3/A1/`.
- **Steps:**
  1. Fetch the sources. Confirm 7K00 and 7ST2 chain identities (§7.2), and record them.
  2. Build the `ribo` frame (§7.3), and transform all 7K00 atoms into it.
  3. Assign chains to parts and classes: `small` (16S rRNA, uS2–uS21 and bS proteins), `large` (23S, 5S, uL/bL proteins). The `subunit` tag for each chain is `rRNA16S`, `rRNA23S`, `rRNA5S`, `rprotein30S` or `rprotein50S`. Record the full chain table.
  4. Build L0 per part with the existing envelope builder (≥ 95 % bead containment, as for RNAP), L1 (P for RNA, Cα for protein), and L2 for sites `decoding` and `ptc` at 12 Å.
  5. Superpose 7ST2 (§7.3 rule); derive `siteE` and extend the `mrna` track. Superpose 5WE4 and derive `siteAT`. Superpose 7PJV and test the `siteAP`/`sitePE` conditions. Record every RMSD.
  6. Compute all anchors (§7.4) and the `tunnel` path (§7.4 algorithm).
  7. Export `frameAtoms(sourcesDir)` from `tools/assets/ribosome.mjs`: the 7K00 heavy atoms in the `ribo` frame with chain, residue number and atom name. A3 and A4 superpose on it.
  8. Validate with `validateAsset`; check budgets (§7.5).
  9. Screenshots in `dev/actor-card.html` (read-only use): L0, L1 and L2 with cutaway, plus tracks and anchors overlay, at default and `zoom=3`.
- **Acceptance:** the asset validates; P-site codon pairs with the P-tRNA anticodon in the fitted frames (Watson–Crick, all 3); A-site likewise; after superposition, the heavy atoms of nucleotides 75–76 of the 7ST2 E-site tRNA lie within 3.0 Å RMSD of the two nucleotides modelled in the 7K00 E-site fragment (chain `5`), which confirms the chain is in the E site; tunnel length and clearance within gates; budgets met; `npm test` passes; 6 screenshots.

#### R3-A2 — tRNA assets
- **Tier:** Hydrogen, high. **Depends:** W0.
- **Owns:** `tools/assets/trna.mjs`, `assets/trna-init.asset.json`, `assets/trna-aa.asset.json`, `tests/assets-trna.test.mjs`, `docs/assets/trna.md`, `docs/evidence/r3/A2/`.
- **Steps:** extract 7K00 chain Z (initiator, from the P site) and chain Y (elongator, from the A site); map standard numbering (find the anticodon by complementarity to the 7K00 codons `AUG` and `GUA`); build the `trna` frame (§7.3); parts `body` and `anticodon`; track `anticodon` with registers 34–36 fitted by Kabsch base frames; anchors `center`, `acceptor`, `elbow`; L0, L1, L2 (`acceptor` 8 Å); validate; screenshots.
- **Acceptance:** both assets validate; the anticodon track bases read `CAU` (initiator) and `UAC` (elongator) 5′→3′; the L-shape spans 65–80 Å from anticodon origin to the A76 P atom; budgets met.

#### R3-S1 — Construct v3, codon data and residue library
- **Tier:** Hydrogen, medium. **Depends:** W0.
- **Owns:** `js/science/scenario.js`, `js/science/residues.js`, `js/science/genetic-code.js` (additions only), `tests/scenario.test.mjs`, `tests/residues.test.mjs`, `docs/SCIENCE.md` (§3–4 only).
- **Steps:**
  1. Replace the `TRUE_SCALE_GENE_CONSTRUCT` contents with §5.1 (`version: 3`). Add `codonTable(construct)`, which returns the 41 rows of §5.1 in the Round 1 `DEFAULT_CODONS` shape (`index`, `number`, `triplet`, `anticodon3to5`, `aa3`, `aa1`, `aaName`, `color` from `AMINO_ACIDS`, `isInitiator`, `isStop`).
  2. Add residue templates for ARG, ASN, CYS, HIS (neutral, Nδ1-H tautomer, no hydrogens drawn), ILE, LEU, THR, TRP and VAL, with Engh & Huber geometry, in the same table style. Ring and branch torsions take standard extended rotamers (χ1 = −60° unless the residue is β-branched, where χ1 = 180°).
  3. Tests: every §5.1 design check, every §5.3 item 1, chirality (CA chiral volume > 0) and CB torsion for all 20 templates, bond lengths within 0.03 Å of the table values, no intra-residue heavy-atom contacts < 2.2 Å except bonded and 1-3 pairs, and a full 40-residue `buildPeptide` without inter-residue contacts < 2.6 Å outside bonded, 1-3 and 1-4 pairs.
  4. Update `docs/SCIENCE.md` §3 with construct v3 and the codon table, and §4 with the new residues.
- **Acceptance:** tests pass; the peptide sequence string equals §5.1.

#### R3-S2 — Story engine
- **Tier:** Argon, high. **Depends:** W0.
- **Owns:** `js/sim/gene/story.js`, `js/sim/gene/timeline.js`, `js/sim/gene/shots.js`, `tests/story.test.mjs`.
- **Steps:**
  1. Implement the event list builder: chapters from §6.1 and §6.4 as data tables in `timeline.js`; per-nucleotide and per-codon pacing; event ids `<type>:<n>` (unique and stable).
  2. `stateAt`: evaluate machines, counters, captions, shots and blends from the events in O(log E) per call, using binary search on `t0` and a precomputed active-interval index. Kinematic fields that S3 and S4 fill are left at defaults.
  3. Plug points: `transcription.js` and `translation.js` export `contributeTx(story, t, out)` and `contributeTl(story, t, out)`, which S3 and S4 implement. Here, stubs that return without change.
  4. Tests: chapter totals equal §6.1 and §6.4 to ±1 ms; monotonic counters; determinism (1,000 random seeks in random order versus a forward sweep, identical JSON); the `stateAt` allocation check (no growth of `process.memoryUsage().heapUsed` over 10,000 calls with `out`, ±1 MB); the timing budget.
- **Acceptance:** tests pass; the fixture story in W0 loads through `buildStory`.

#### R3-K1 — Duplex and track kinematics
- **Tier:** Argon, high. **Depends:** W0.
- **Owns:** `js/kin/frames.js`, `js/kin/duplex.js`, `js/kin/track.js`, `tests/kin-duplex.test.mjs`, `dev/kin-lab.html`, `docs/evidence/r3/K1/`.
- **Steps:**
  1. `frames.js`: quaternions, slerp, frame compose and invert, screw step `S(x)`, `partnerFrame`, rotation-minimising frames, arc-length tables, cubic Bézier, centripetal Catmull–Rom.
  2. `track.js`: fractional track lookup with slerp, extrapolation by `S`, blend between track and ideal frames.
  3. `duplex.js`: the six-step algorithm in §8.3 for a construct of any length, writing nucleotide frames for coding and template strands into a `Float32Array` frame buffer (16 floats per frame).
  4. `dev/kin-lab.html`: a dev page with `rnap-ec`, the 248-bp duplex and sliders for `register`, `bend` and `relax`, using the existing viewer and actor layer.
  5. Tests: continuity (adjacent base-pair origins 3.38 ± 0.15 Å along the axis outside tracks; O3′(i)–P(i+1) ≤ 1.9 Å everywhere except at the bubble edges, where ≤ 2.6 Å); the world position of a downstream base pair 30 bp ahead stays fixed within 0.01 Å while the register advances 10 steps; the β = 0 output equals the ideal B-DNA built by `Assembly` within 0.01 Å RMSD; clash check against `rnap-ec` L1 beads (§5.3 item 8).
- **Acceptance:** tests pass; screenshots of the lab at β = 0, 0.5 and 1 and register 0 and 60.

#### R3-R1 — Detail sphere and atom groups
- **Tier:** Hydrogen, high. **Depends:** W0.
- **Owns:** `js/render/molecule.js`, `js/render/cartoon.js`, `js/render/atom-groups.js`, `js/render/viewer.js` (only the new methods `setDetailFocus` and `setAtomGroups`, and their calls in the render loop), `tests/render-detail.browser.mjs`, `docs/evidence/r3/R1/`.
- **Steps:**
  1. Per-nucleotide and per-residue representation mask from `setDetailFocus({ center, radius })` (§4.4), with a 12 Å cross-fade band, applied to `MoleculeLayer` (atoms and bonds scaled by the fade) and to `CartoonLayer` (the complement).
  2. `AtomGroupLayer`: instanced balls and bonds for `{ id, count, pos, el, bonds, color?, opacity, detail? }` groups, using `MoleculeLayer` materials and colour schemes (§4.3 peptide rules: `strand` uses `0xff7a45` with side-chain atoms lightened 35 % toward white; `codon` uses `AMINO_ACIDS`; `element` uses `ELEMENT_INFO`; cartoon is a Cα tube of radius 0.42 with beads).
  3. A browser test that loads `dev/viewer-demo.html` with a 248-bp duplex and a 40-residue peptide group, moves the detail focus, and checks with `readPixels` that both representations render; zero console errors.
- **Acceptance:** test passes; Explore, Pairs, Melt, Copy and X-ray screenshots are unchanged against `main` (pixel diff ≤ 0.5 % per image at the same seed and camera); performance: 248-bp duplex plus 179-nt RNA at `high` in software WebGL renders without errors (frame time recorded, no gate).

#### R3-U1 — Express v2 panel
- **Tier:** Hydrogen, medium. **Depends:** W0.
- **Owns:** `js/ui/view-story.js`, `js/ui/ui.js` (registering the view behind `scene=v2` only), `css/style.css` (the §4.8 block only), `dev/ui-story.html`, `tests/ui-story.browser.mjs`, `docs/evidence/r3/U1/`.
- **Steps:** build the panel exactly as §4.8 against the W0 fixture world state and fixture story; wire handlers `onExpression({ action })` with the actions `play`, `pause`, `restart`, `seek`, `speed`, `mode`, `camera`, `toggle`, `chapter`, `selectCodon` and `clearInspect`; add keyboard support (Space play/pause, ←/→ previous/next chapter, Home restart) only while the Express view is active; build the dev page that renders the panel without a viewer.
- **Acceptance:** desktop and phone screenshots of every panel state (empty inspect, filled inspect, chapter 1, 6, 14 and 16 fixtures); browser test: every control emits the right action; axe-core is not available, so check by hand: every button has an accessible name and focus is visible, and record the result.

#### R3-Q1 — Standalone assets and gates
- **Tier:** Flash, high. **Depends:** W0.
- **Owns:** `tools/build-standalone.mjs`, `tests/smoke.browser.mjs`, `tests/asset-budgets.test.mjs`, `package.json` (scripts only).
- **Steps:** inline every manifest asset into the standalone build through `window.__HELIX_ASSETS__`, read by `js/assets/registry.js`; extend the smoke gate to load `?mode=express&scene=v2` on both pages and to print the failing module path when an import fails (wrap each `import()` check); add the budget test (§7.5) reading every asset in `assets/manifest.json`.
- **Acceptance:** `npm run build:standalone` produces a file that loads `?scene=v2` offline (Playwright with all network requests to other origins blocked) with zero errors; a deliberately broken module makes the smoke gate print its path.

**Merge order for W1:** S1 → R1 → Q1 → A2 → A1 → K1 → S2 → U1. Gate **G1** (§12), then tag `r3-w1`.

### Wave 2 (seven agents; Base `r3-w1`)

#### R3-A3 — Factor assets
- **Tier:** Hydrogen, high. **Depends:** A1.
- **Owns:** `tools/assets/factors.mjs`, `assets/rf1.asset.json`, `assets/ef-tu.asset.json`, `assets/ef-g.asset.json`, `assets/if1.asset.json`, `assets/if2.asset.json`, `assets/if3.asset.json`, `tests/assets-factors.test.mjs`, `docs/assets/factors.md`, `docs/evidence/r3/A3/`.
- **Steps:** for each factor, superpose its source ribosome on `ribosome-70s` (§7.3 rule, using the 7K00 coordinates in the `ribo` frame that A1's recipe exports via `tools/assets/ribosome.mjs#frameAtoms`); extract the factor chain; build L0, L1 and L2; compute anchors (§7.4); clash report: count factor L1 beads within 3.0 Å of ribosome L1 beads, and list them.
- **Acceptance:** six assets validate; superposition RMSD ≤ 1.5 Å each; RF1 `codonReader` lies within 10 Å of the `siteA` codon centroid; EF-Tu `gDomain` lies within 25 Å of the 23S sarcin–ricin loop (nucleotides 2653–2667) centroid; clash counts recorded (no gate); budgets met.

#### R3-A4 — RNAP extensions, NusG and coupling geometry
- **Tier:** Hydrogen, high. **Depends:** A1.
- **Owns:** `tools/assets/rnap.mjs` (additions only), `tools/assets/nusg.mjs`, `assets/rnap-ec.asset.json`, `assets/rnap-holo.asset.json`, `assets/nusg.asset.json`, `tests/assets-rnap-v2.test.mjs`, `docs/assets/rnap.md`, `docs/evidence/r3/A4/`.
- **Steps:** `rnap-holo` RPo tracks from 6C9Y (register 0 at +1; the bubble from −11 to +2 must be visible as unpaired frames); `ntpEntry` on both RNAP assets (§7.4 ray algorithm); `hairpin` anchor from 7YPA; `expressome` anchor and `coupledMrna` path from 6ZTJ; the coupling distance `D` (§6.4) computed from the 6ZTJ mRNA numbering; the `nusg` asset in the `rnap` frame.
- **Acceptance:** assets validate; `rnap-ec` and `rnap-holo` keep their previous L0, L1 and L2 byte-for-byte (only anchors, tracks and paths change); the 6ZTJ RNAP superposition RMSD is ≤ 2.5 Å; `D` and how it was counted are recorded in `docs/assets/rnap.md`.

#### R3-K2 — Free chains, hairpin and peptide path
- **Tier:** Hydrogen, high. **Depends:** K1.
- **Owns:** `js/kin/chain.js`, `js/kin/hairpin.js`, `js/kin/peptide-path.js`, `tests/kin-chain.test.mjs`, `docs/evidence/r3/K2/`.
- **Steps:** the free-chain spline and the A-form single strand (§8.3); the terminator hairpin: an 8-bp A-form stem (`HELIX_A`) with a 4-nt GAAA loop on a fixed arc, posed by the RNAP `hairpin` anchor and folded progressively (stem pair `i` forms when both partners exist and the 3′ partner is at least 9 nt from the transcript 3′ end); the peptide on a path (§8.3) with residue frames from S1's templates.
- **Acceptance:** spacing of consecutive nucleotides along a free chain is 2.81 ± 0.05 Å along the axis; O3′–P ≤ 1.9 Å along free chains; hairpin stem pairs are Watson–Crick with H-bond distances 2.7–3.1 Å at full fold; the peptide-path gate (§8.3); everything deterministic for the same seed.

#### R3-S3 — Transcription choreography
- **Tier:** Argon, high. **Depends:** S2, K1, A4 (uses `rnap-ec` tracks for RPo until A4 merges).
- **Owns:** `js/sim/gene/transcription.js`, `js/kin/ntp.js`, `js/kin/pose.js` (transcription parts), `dev/story-lab.html`, `tests/story-tx.test.mjs`, `docs/evidence/r3/S3/`.
- **Note:** codes against the W0 stubs of `js/kin/chain.js` and `js/kin/hairpin.js`; K2 merges first.
- **Steps:** implement `contributeTx` for chapters 1–7 of §6.1 (machine path in chapter 2: a straight line from the start point to the bound pose over 8.0 s with `easeInOutCubic`; the start point is the bound pose shifted 400 Å along world +y and 150 Å along world +x); NTP motion along `ntpEntry` → active site (0.8 s), base frame blended from the entry pose to the i+1 register frame; bond pulse; PPi exit; σ release (§4.4); hairpin fold; release and relaxation; `pose.js` transcription parts: Assembly frames for DNA and mRNA, NTP and PPi atom groups, RNAP actor spec.
- **Acceptance:** §5.3 items 1, 2, 7 and 8 for chapters 1–7 at 64 times per chapter; the RNA·DNA hybrid is 8–10 bp throughout chapter 6; screenshots at the start, middle and end of each chapter in a Node-driven browser page `dev/story-lab.html` (owned here).

#### R3-R2 — Actor layer extensions and effects
- **Tier:** Hydrogen, high. **Depends:** W1.
- **Owns:** `js/render/actors.js`, `js/render/fx.js`, `js/render/viewer.js` (only `setFx`, `setFar`, and per-part transforms and `pickable` in `setActors`), `dev/actor-card.html`, `tests/render-actors.browser.mjs`, `docs/evidence/r3/R2/`.
- **Steps:** per-part transforms and opacity (release motion in §4.4 is computed by the story; the layer only applies it); `pickable: false`; multi-site L2 (format v2); asset v2 paths drawn in the actor card when `tracks=1`; `fx.js` with pulse and GTP cue (§4.4), driven by `WorldState.fx`; instanced crowder rendering via `setCrowd([{ assetId, transforms: Float32Array }])` (L0 only, §4.3 crowder material).
- **Acceptance:** the actor card shows every Wave 1 asset; FX timing matches §4.4 when measured from frame timestamps in the browser test (±1 frame); 200 crowder instances render in one draw call per asset part.

#### R3-R3 — Camera rails and labels
- **Tier:** Hydrogen, high. **Depends:** W1.
- **Owns:** `js/scene/camera-rails.js`, `js/scene/labels.js`, `js/render/overlay.js` (priority and fading only), `tests/camera-rails.test.mjs`, `docs/evidence/r3/R3/`.
- **Steps:** resolve shots (§6.3) to camera position and target from a world state; the transition duration rule (§4.7); the Free interrupt; reduced-motion cuts; label selection (§4.6), with priority, a cap of 6 and 250 ms fades.
- **Acceptance:** unit tests for shot resolution in each frame type; a browser test confirms that orbiting switches the camera option to `Free`; label count never exceeds 6.

#### R3-U2 — Inspection and sources
- **Tier:** Hydrogen, medium. **Depends:** W1 (U1 merged).
- **Owns:** `js/ui/inspect.js`, `js/ui/about.js`, `js/ui/view-story.js` (inspect card body only), `tests/ui-inspect.browser.mjs`.
- **Steps:** the `InspectInfo` builder from an actor pick or a nucleotide or residue pick, using the asset `source` block and §5.4 text; procedural sentences (≤ 120 characters each) for DNA, mRNA, tRNA anticodon, peptide, NTP and PPi, citing §5.2; the About "Sources" section (§4.10) from asset metadata.
- **Acceptance:** every asset has an inspect card with all six rows; the RCSB link is the only external URL and opens only on click (the smoke gate's no-external-request check still passes).

**Merge order for W2:** A4 → A3 → K2 → R2 → R3 → U2 → S3. Then the Chief integrates the transcription slice (§10, R3-INT2).

#### R3-INT2 — Transcription slice (Chief)
- Wire `createStoryScene` for chapters 1–7 behind `?scene=v2` (story time clamps at the end of chapter 7 until W3); review every chapter on desktop and phone; tune shot values within tolerance; gate **G2**; tag `r3-w2`.

### Wave 3 (six agents; Base `r3-w2`)

#### R3-S4 — Translation choreography
- **Tier:** Argon, high. **Depends:** S2, K2, A1, A2, A3; K3 within the wave (codes against the W0 stub of `js/kin/trna.js`; K3 merges first).
- **Owns:** `js/sim/gene/translation.js`, `js/kin/pose.js` (translation parts), `tests/story-tl.test.mjs`, `docs/evidence/r3/S4/`.
- **Steps:** `contributeTl` for chapters 8–16; the mRNA translation layout (ribosome fixed in world at the pose 250 Å along world −z from the mRNA midpoint at the end of chapter 7, oriented so `ribo` +z follows the mRNA 5′→3′ tangent at the SD region); mRNA sliding by 3 nt per translocation; tRNA slot logic (4 slots: delivery, A, P, E); factor enter and leave paths (enter from 220 Å along the factor's `center` direction from the ribosome `center`, over the times in §6.1); peptide growth and release; computing `{N}` for caption 14.
- **Acceptance:** §5.3 items 3–6 and 8 for chapters 8–16; fMet never in A/T or A; the stop codon adds no residue; screenshots per chapter.

#### R3-K3 — tRNA anticodons, aminoacyl ends and codon pairing
- **Tier:** Hydrogen, high. **Depends:** K1, K2, A2.
- **Owns:** `js/kin/trna.js`, `tests/kin-trna.test.mjs`.
- **Steps:** procedural anticodon nucleotides on the `anticodon` track of each placed tRNA; hide the asset's `anticodon` part; codon–anticodon pairs as Assembly pairs (H-bonds drawn) in the A and P sites; aminoacyl residue placement at `acceptor` (ester carbon 1.33 Å along `acceptor` z); the peptidyl attachment point for the peptide path.
- **Acceptance:** pair geometry within 0.3 Å of the ideal Watson–Crick C1′–C1′ distance (10.5 ± 0.3 Å) in A and P; no anticodon–codon pairs drawn in the E site or the A/T site before recognition.

#### R3-R4 — Crowders and context
- **Tier:** Hydrogen, medium. **Depends:** A1, A3 (EF-Tu), R2.
- **Owns:** `js/scene/crowd.js`, `tests/crowd.test.mjs`, `docs/SCIENCE.md` (§5 Crowding only).
- **Steps:** seeded placement in a 1600 × 1000 × 1000 Å box centred on the gene midpoint, excluding a capsule of radius 180 Å around the gene axis and a sphere of radius 320 Å around the ribosome pose; densities (illustrative, with sources recorded as BioNumbers IDs where found, otherwise labelled illustrative): ribosomes 25,000 µm⁻³ (40 instances), EF-Tu·tRNA 60,000 µm⁻³ (96), RNAP 3,000 µm⁻³ (5); random orientations; minimum centre distance = sum of bounds radii × 0.8; tier counts: high 100 %, medium 50 %, low 0.
- **Acceptance:** deterministic for the seed; no crowder inside the exclusion volumes; counts match.

#### R3-U3 — Phone, keyboard and reduced motion
- **Tier:** Hydrogen, medium. **Depends:** U1, U2, R3.
- **Owns:** `js/ui/view-story.js` (keyboard and focus only), `tests/ui-phone.browser.mjs`, `docs/evidence/r3/U3/`.
- **Steps:** verify the §4.8 phone behaviour (existing sheet, peek height, 2-line caption clamp); if a layout defect needs CSS, write it under "Requests" for the Chief; full keyboard path through every control; reduced motion (§4.7).
- **Acceptance:** screenshots on `iPhone 13` and `Pixel 7` profiles for chapters 1, 6, 11, 14 and 16 with the sheet collapsed and expanded; no horizontal scroll; tab order recorded.

#### R3-Q2 — Performance harness
- **Tier:** Flash, high. **Depends:** S2, K1.
- **Owns:** `tools/perf/story-bench.mjs`, `tools/perf/browser-bench.mjs`, `docs/PERF.md`.
- **Steps:** Node benchmark of `stateAt` and `pose` over 2,000 evenly spaced times (median, p95, max); browser benchmark recording draw calls, triangles, instance counts and software-GL frame times per chapter; a template table in `docs/PERF.md` for hardware results, which a human fills in.
- **Acceptance:** scripts run with `npm run perf`; results committed.

#### R3-V2 — Visual evidence sweep
- **Tier:** Flash, high. **Depends:** INT2.
- **Owns:** `tools/evidence/sweep.mjs`, `docs/evidence/r3/sweep/`.
- **Steps:** for every chapter in both modes, capture start, middle and end screenshots at desktop and phone with `Auto` camera, plus a contact sheet per mode.
- **Acceptance:** the files exist and the script is rerunnable; no judgement is required.

**Merge order for W3:** K3 → R4 → Q2 → U3 → S4 → V2.

#### R3-INT3 — Full Step-by-step story (Chief)
- Wire chapters 8–16; full-story review; tune shots; gate **G3**; tag `r3-w3`.

### Wave 4 (four agents; Base `r3-w3`)

#### R3-S5 — Coupled mode
- **Tier:** Argon, high. **Depends:** INT3, A4.
- **Owns:** `js/sim/gene/coupled.js`, `tests/story-coupled.test.mjs`, `docs/evidence/r3/S5/`.
- **Steps:** §6.4 chapters; expressome lock using the `expressome` anchor; the mRNA spacer along `coupledMrna`; the transcription pause at `24 + D` nt; NusG binding and release; decoupling at termination; `{D}` in caption 8.
- **Acceptance:** §5.3 items for the coupled timeline; the distance from the P-site codon to the RNA 3′ end equals `D` (±1 nt) throughout `couple-run`; RNAP and ribosome L0 footprints never overlap on the mRNA; no clash between RNAP and ribosome L1 beads beyond the 6ZTJ contact list.

#### R3-V1 — Independent science review
- **Tier:** Argon, high (read-only). **Depends:** INT3.
- **Owns:** `docs/reviews/R3-V1-science.md`.
- **Steps:** check every caption, label, inspect text and §5.2 row against the cited structures and standard references (recorded with DOIs); check directions, sites and factor order in the running app; list issues by severity, with exact file, line or chapter and a proposed correction.
- **Acceptance:** the review exists; each issue has a location and a proposal.

#### R3-P1 — Port Round 1 Express tests and remove Round 1 Express
- **Tier:** Hydrogen, medium. **Depends:** INT3.
- **Owns:** `tests/sim.test.mjs` (Express parts), `tests/story-legacy-port.test.mjs`, and the deletions of `js/sim/expression.js` and `js/ui/view-express.js` (prepared on the branch; the Chief merges at G4).
- **Steps:** map every Round 1 Express invariant to the new story (same biology on construct v3); remove imports of the old modules except from `js/main.js`, which the Chief changes.
- **Acceptance:** all ported tests pass against the new story; no test is dropped without a written reason.

#### R3-D1 — Documentation
- **Tier:** Flash, high. **Depends:** INT3.
- **Owns:** `README.md`, `docs/SCIENCE.md` (§1–2 and §6 onwards), `docs/RELEASE-NOTES.md`.
- **Steps:** user-facing README (what it shows, how to run, controls, sources); science overview from §5; release notes draft.
- **Acceptance:** every factual statement points to this plan, an asset doc or a reference.

#### R3-INT4 — Cutover (Chief)
- Fix V1 issues (or schedule them as tasks); make the new scene the Express mode; merge P1; remove `?scene=v1`; update CONTRACTS §4 and §5; gate **G4**; tag `r3-w4`.

### Wave 5 (release)

#### R3-Q3 — Release audit
- **Tier:** Flash, high. **Depends:** G4.
- **Owns:** `docs/VALIDATION.md` (§R3 release section, drafted for the Chief), `docs/evidence/r3/release/`.
- **Steps:** network audit of `index.html` and the standalone file over a full play-through in both modes; size table; repeated mode-switch memory check (10 cycles; `renderer.info.memory` geometries and textures return to baseline ±2); console clean.
- **Acceptance:** all checks recorded with numbers.

#### R3-INT5 — Release (Chief, then a human)
- Rebuild `dist/`; final gate **G5**; the human reviewer records visual acceptance in `docs/VALIDATION.md`; tag `v1.0.0`.

---

## 11. Schedule: ten serial stages (revised 2026-11-19)

**Stages run strictly in series.** One stage per working session (about five hours). Inside a stage, tasks run in parallel (Gemini: at most five Hydrogen subagents) and merge in the listed order. Every task branches from the previous stage's tag, which replaces the "Base" line in §10. A Gemini stage begins by taking in the preceding Claude stage, if any (§9.3).

| Stage | Executor | Tasks, merge order | Argon job (≤ 30 min) | Exit check | Tag |
| --- | --- | --- | --- | --- | --- |
| ST1 | Gemini | W0 (Chief). Subagents: W0 step 4 (`fetch-sources`, SHA-256 lock), step 7 (module stubs), step 8 (fixtures); **S1** (construct v3, residues; it touches no W0 file, so it may start from `6c9553b` and merges after W0) | Review the frozen `docs/CONTRACTS.md` §7 and asset format v2 against §7–§8 before the tag | W0 acceptance and S1 acceptance | `r3-w0` |
| ST2 | **Claude (C1)** | A1 → A2 | — | A1 and A2 acceptance; budgets | `r3-st2` |
| ST3 | **Claude (C2)** | K1 → S2 | — | K1 and S2 acceptance | `r3-st3` |
| ST4 | Gemini | Intake ST2, ST3. Q1 → R1 → U1 | Check the G1 evidence for the Claude assets (colour samples, budgets, pairing tests) | **G1** | `r3-w1` |
| ST5 | Gemini | A4 → A3 → K2 → R2 | Review A3 superposition RMSDs and the A4 value of `D` with its counting method | Task acceptance; assets validate | `r3-st5` |
| ST6 | Gemini | R3 → U2 → S3, then INT2 | Before S3 starts: review the S3 brief against §5.3 and the K1 API; if G2 fails: diagnose | **G2** (first playable new scene, chapters 1–7) | `r3-w2` |
| ST7 | **Claude (C3)** | K3 → S4 | — | K3 and S4 acceptance | `r3-st7` |
| ST8 | Gemini | Intake ST7. R4 → Q2 → U3 → V2, then INT3 | Full-story review of the INT3 build against §6.1 and §6.2 | **G3** (full Step by step story) | `r3-w3` |
| ST9 | Gemini | P1 → D1 → S5, then V1, then INT4 | V1 science review (read-only, high-severity issues first) | **G4** (cutover) | `r3-w4` |
| ST10 | Gemini | Q3, then INT5 and a human reviewer | Only if G5 fails: diagnose | **G5**; human visual acceptance | `v1.0.0` |

Dependency notes:
- ST2 needs W0 (`superpose.mjs`, `match.mjs`, `fetch-sources`, format v2, sources lock).
- ST3: K1's lab page and tests use construct v3 from S1 (merged in ST1). S2 uses `codonTable` from S1 and the W0 fixtures.
- ST4: U1 and R1 use the W0 fixtures; Q1 uses `js/assets/registry.js` from W0.
- ST6: S3 uses K1 and S2 (ST3), K2 and A4 (ST5).
- ST7: S4 uses S2 (ST3), K2 and A3 (ST5), A1 and A2 (ST2); K3 merges first.
- ST8: R4 uses A1, A3 (EF-Tu) and R2.

Critical path: ST1 → ST2 (A1) → ST5 (A3) → ST7 (S4) → ST8 (INT3) → ST9 (S5, INT4) → ST10.

Expected pace: one stage per session gives ten sessions. A session that closes its stage early may start the next stage only if it belongs to the same executor.

---

## 12. Gates

| Gate | When | Required evidence (recorded by the Chief in `docs/VALIDATION.md`) |
| --- | --- | --- |
| G1 | After W1 merges | `npm test`, `npm run smoke`, `build-assets --check` pass; `ribosome-70s`, `trna-init`, `trna-aa` pass their tests and budgets; actor-card screenshots match §4.3 colours (Chief compares sampled pixel colours of L1 beads to the tokens within ΔE 6); kin-lab screenshots show a continuous duplex at β = 0, 0.5 and 1; Express v2 panel matches §4.8 (Chief checklist) |
| G2 | After INT2 | Chapters 1–7 play, pause and seek with zero console errors; §5.3 items 1, 2, 7 and 8 pass; every chapter screenshot reviewed at desktop and phone; shot values tuned and committed |
| G3 | After INT3 | The full Step by step story passes §5.3; the peptide visibly emerges from `tunnelExit` before chapter 15 ends; 4× speed and 0.5× speed are identical in content at the same story time; frame-time table filled for software GL |
| G4 | After INT4 | Coupled mode passes its tests; V1 issues of severity "high" are fixed; the Round 1 Express is removed with its tests ported; all six modes load with zero errors; hardware-GPU desktop frame time recorded by a human (target ≤ 16.7 ms median at `high`) |
| G5 | Release | Q3 audit: zero external requests; sizes within §7.5; memory check passes; phone frame time recorded by a human (target ≤ 33 ms median at `low` or `auto`); a human reviewer signs visual acceptance |

---

## 13. Risks and fallbacks

| Risk | Fallback (pre-approved; the Chief records its use in `docs/DECISIONS.md`) |
| --- | --- |
| The curved upstream arm clashes with RNAP or looks wrong | Shorten `L` to 30 bp or lengthen it to 60 bp; if neither works, β = 0.5 everywhere outside the track |
| `siteAP` or `sitePE` fails its condition | Direct interpolation between classic sites (already specified) |
| The tunnel path misses its gates | Use the straight line from `ptc` to the target voxel, resampled, and mark it synthetic |
| A factor source fails the superposition gate | Try the alternative entry: RF1 8FZE; EF-Tu 5WDT; EF-G 7N2V; IF3 9FCO. If both fail, ship the factor L0 only and record it |
| Ribosome L0 exceeds its budget | Raise the envelope grid spacing from 3 Å to 4 Å, then 5 Å |
| Frame time misses its target on hardware | Lower `detailRadius` by 25 %; cap crowders at 50 %; in that order |
| 7ST2 lacks the needed E-site tRNA | Use the E-site tRNA of 8FZH (chain identified by the 7K00 E-fragment test in A1) |
| `D` falls outside 40–60 nt or the locked ribosome clashes with the DNA | Use the computed `D` anyway if there is no clash; if there is a clash, add 3 nt to `D` until it clears and record each step |

---

## 14. Record keeping

| File | Owner | Update |
| --- | --- | --- |
| `PLAN.md` | Chief | When a decision, duration or token changes |
| `docs/CONTRACTS.md` | Chief | W0, then by accepted request only |
| `docs/DECISIONS.md` | Chief | Each accepted request or fallback |
| `docs/TASKS.md` | Chief | At assignment, handoff and merge |
| `docs/VALIDATION.md` | Chief | Each gate |
| `docs/ASSETS.md` | Chief | One summary row per asset at merge |
| `docs/assets/<id>.md` | Asset task | With its asset |
| `docs/SCIENCE.md` | S1, R4, D1 (sections as listed) | With its task |
| `docs/handoffs/R3-<id>.md` | Each task | At handoff |
| `docs/evidence/r3/<id>/` | Each task | At handoff |
