# Bio Structure Explorer: Gene Expression Demo Plan

Status: Round 1 delivered a complete placeholder loop (audit in §13). Round 2 is planned in Part II (§13–§21) and not started.
Updated: 2026-11-17

Part I (§1–§12) is the Round 1 plan, kept as the record of original scope and conventions. Where Part I and Part II disagree on forward work (milestones, backlog, construct, scale), Part II wins.

## 1. Objective and project conventions

Build a visually coherent, interactive 3D demonstration of bacterial gene expression: a DNA segment is transcribed into mRNA, and that same mRNA is translated into a short peptide. Users can orbit the scene, move between overview and close-up views, inspect molecules, pause playback, and seek through the process.

The setting is a small region of bacterial cytoplasm. A complete single-cell simulation is a later ambition, not a prerequisite for this demo. Bacteria are single-celled organisms; this choice also avoids introducing a nucleus, nuclear export, or eukaryotic RNA processing into the first scene.

Project conventions:

- All project files must be written in English, including documentation, filenames, code comments, UI copy, task records, and handoff notes. Preserve established scientific symbols and identifiers.
- Maintain modular source files in Git. Publish a static website with locally bundled dependencies and selected molecular data.
- No required third-party API, account, cloud computation, or remote molecular-data request during normal playback.
- A local HTTP server is a development file server, not an external API dependency.
- A downloadable single-file demo or an offline-capable website is an optional later deliverable. Neither capability is currently implemented.
- This document defines the proposed implementation baseline. Unverified assets, performance figures, and scientific details remain explicitly provisional.

## 2. Existing foundation

The DNA demo exists in `origin/claude/dna-structure-visualization-85q6rc`, inspected at commit `246fa52`. The current checkout is `main`, which contained only `.gitattributes` before this plan was added. Do not infer that the DNA source is missing or overwrite the source branch to match this checkout.

At implementation kickoff, preserve this plan, inspect the current Git state, and create an implementation branch based on the DNA source branch. Reconcile these planning documents onto that branch explicitly. No branch switch, source merge, deployment, or implementation has been performed by this planning task.

| Existing capability | Reuse decision | Additional work |
| --- | --- | --- |
| Ideal B-DNA geometry and nucleotide assembly | Reuse as the DNA foundation | Add a local transcription bubble and explicit sequence annotations |
| Ball-and-stick, space-filling, and cartoon views | Reuse the visual vocabulary | Support RNA, proteins, mixed assemblies, and per-object detail levels |
| Lighting, background, camera controls, quality tiers | Reuse selectively | Extend framing and selection from one DNA assembly to multiple actors |
| Deterministic replication timeline | Reuse the design pattern | Build separate transcription and translation state models |
| DNA replication enzyme blobs | Keep in the existing replication demo | Do not relabel DNA polymerase as RNA polymerase |
| Scientific and simulation tests | Preserve and rerun at kickoff | Add gene-expression invariants and integration tests |
| Crystal DNA reference data | Keep as a separate reference mode | Select and document appropriate RNA/protein structures |

Inspected source includes `js/science/assembly.js`, `js/sim/replication.js`, and `js/render/viewer.js`. The assembly currently contains DNA-specific templates and pairing rules; RNA support is not a simple label change. The viewer references a `CONTRACT.md` that was not present in the inspected tree; recover any useful historical contract or write the new contract explicitly.

Previous browser inspection covered Explore and selected Copy states at a narrow viewport. It was not a complete desktop, mobile, performance, or scientific acceptance review. Earlier reported test counts must be rerun rather than adopted as current evidence.

## 3. Scope of the first release

### Required

- One annotated synthetic teaching gene in a bacterial context.
- One transcription event producing one identifiable mRNA.
- One ribosome translating that mRNA into a short peptide.
- A continuous scene with overview, polymerase-follow, and ribosome-close-up camera modes.
- Correct sequence relationships, strand directions, codon reading frame, and termination behavior.
- Play, pause, restart, speed control, and deterministic forward/backward seeking.
- Molecular inspection, consistent colors, readable labels, and an explanation of scientific simplifications.
- Desktop support and a deliberately simplified mobile presentation.

### Deferred

- A full bacterial cell, genome, membrane transport, metabolism, or population simulation.
- Eukaryotic nucleus, nuclear pores, splicing, capping, and polyadenylation.
- Mandatory replication before transcription: DNA replication is a separate process and remains an independent Helix mode.
- Coupled transcription and translation, multiple polymerases, and polysomes. Start with sequential phases in the same scene; label this as a teaching simplification rather than a universal bacterial timing rule.
- Full-atom molecular dynamics, chemically predictive reaction kinetics, and protein-folding prediction.
- User-imported structures, arbitrary gene sequences, mutation experiments, and a general scene editor.
- User accounts, collaboration servers, and backend infrastructure.

## 4. Molecular building blocks

Build components for this specific process first. A universal library of all RNAs, enzymes, and proteins is not needed to complete the demo.

| ID | Component | First working version | Polished demo requirement | Dependencies |
| --- | --- | --- | --- | --- |
| B01 | DNA and annotated gene | Existing duplex plus coding/template strands and coordinates | Local bubble opens ahead of polymerase and closes behind it; direction and selected sequence remain readable | Existing assembly |
| B02 | mRNA | Sequence-correct strand with a backbone path, nucleotide IDs, and a growing 3-prime end | Flexible path, codon highlighting, correct RNA identity; detailed chemistry only where supported | Sequence contract, RNA representation |
| B03 | RNA polymerase | A labeled placeholder with DNA entry/exit, RNA exit, and active-site anchors | Structure-derived silhouette or surface with a useful cutaway; clearly documented animation approximations | Asset selection, B01, B02 |
| B04 | Nucleotide substrates | A small illustrative set of incoming ribonucleotides | Distinguish RNA substrates from DNA substrates; incorporate the correct nucleotide without visual clutter | Transcription state |
| B05 | Ribosome | Two subunit placeholders with mRNA path and A/P/E-site anchors | Structure-derived large/small subunits; cutaway reveals decoding and peptide exit | Asset selection, B02 |
| B06 | tRNA and attached amino acids | Reusable carriers associated with codons and cargo | L-shaped 3D representation; anticodon/codon pairing; distinct initiator handling | Genetic code, B05 |
| B07 | Nascent peptide | Ordered residue chain growing from the ribosome | Traceable residue sequence and clear release at termination | B06, translation state |
| B08 | Process factors and termination cues | State labels and simplified actors where necessary | Explain initiation and release; no invented stop-codon tRNA or stop amino acid | Scientific review |

RNA has uracil and ribose chemistry, including the 2-prime hydroxyl group. Do not represent atomically detailed RNA by merely changing the letter T to U in the current DNA templates. A documented coarse backbone is acceptable for the first integration milestone; atom-level RNA requires separately validated templates and geometry.

The ribosome is an RNA-protein complex. Its rRNA can initially be included in the structure asset rather than developed as a separate general-purpose rRNA simulator.

Precharged tRNAs are an explicit first-release simplification. Aminoacyl-tRNA synthetases, the charging cycle, detailed initiation/elongation factors, and ATP/GTP chemistry are acknowledged in the explanation but do not all need independent animated models. Bacterial initiation should distinguish initiator fMet from ordinary elongator methionine; initiator placement must not be forced through the generic elongation cycle.

## 5. Environment and viewing tools

| ID | Component | Responsibility |
| --- | --- | --- |
| E01 | Local cytoplasm stage | Establish spatial context with restrained background molecules; do not imply that a small scene is a whole cell |
| E02 | Scene layout | Place DNA, polymerase, mRNA, and ribosome coherently; maintain mRNA identity between phases |
| E03 | Camera system | Free orbit, overview, polymerase follow, ribosome follow, and reset view; manual control can interrupt a guided camera |
| E04 | Inspection system | Pick an actor or residue; display name, role, sequence position, source, and simplification notes |
| E05 | Visibility tools | Cutaway, hide/isolate, and label prioritization; keep active sites readable without requiring transparent everything |
| E06 | Shared timeline | Coordinate all actors, captions, progress counters, and sequence highlights from one simulation state |
| E07 | Detail and quality management | Use surfaces/backbones at scene scale and detail near the focus; reduce effects and labels on mobile |

Keep the established Helix visual language as a starting point: dark spatial background, controlled highlights, clear molecular color coding, and restrained motion. The final quality bar is visual inspection, not the presence of a particular rendering effect.

## 6. Scientific scenario and data provenance

Use a short synthetic teaching construct with explicit annotations for the promoter/transcription region, transcription start/end, coding and template strands, untranslated region, ribosome-binding region, translation start, reading frame, and stop codon. These annotations are scenario inputs, not genomic feature predictions.

Proposed coding-region fixture:

```text
Coding DNA:  5'-ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT TAA-3'
Template:    3'-TAC CGA CTT AAA TTT CCA AGA CTG ATG GTT CGA ATT-5'
mRNA:        5'-AUG GCU GAA UUU AAA GGU UCU GAC UAC CAA GCU UAA-3'
Code labels:   M   A   E   F   K   G   S   D   Y   Q   A  Stop
```

This is only the coding-region fixture. Upstream/downstream annotations must be added before calling it a complete scene construct. In the bacterial scene, the first incorporated residue is represented as fMet; the standard sequence label M must be explained. Stop is a control event and produces no residue. This short peptide is not presented as a verified folded, functional protein.

Select structure assets during M0/M1, preferably from a consistent bacterial system. Do not silently combine structures from different species and describe the result as an experimentally observed complex.

For each external asset record: source URL, PDB/other identifier, species, method, chains/assembly used, license or reuse terms, downloaded version/date, preprocessing steps, coordinate units, missing regions, and scientific/visual simplifications. Experimental coordinates support static structure; interpolated motion and scene choreography remain separately described approximations.

Sources to review when selecting assets:

- [RCSB PDB 8FIZ: E. coli ribosome with mRNA and tRNA](https://www.rcsb.org/structure/8FIZ) — candidate reference, not yet selected or downloaded.
- [RCSB PDB-101: RNA synthesis](https://pdb101.rcsb.org/global-health/antimicrobial-resistance/drugs/antibiotics/rna-synthesis/rna-synthesis) — process background.
- [Mol*](https://molstar.org/) — reference for molecular representations and large-structure inspection; not a required replacement for the existing renderer.

## 7. Shared implementation contracts

Freeze a small contract before agents independently build components. The following are proposed defaults to confirm in `docs/CONTRACTS.md` during M0:

1. **Coordinates:** right-handed molecular coordinates in angstroms; explicit local-to-world transforms; any display scaling is stored and disclosed. DNA initially retains its existing axis convention. Do not let each component invent a different unit or up axis.
2. **Identity:** stable actor, strand, nucleotide, and residue IDs. Hiding or changing detail level must not change identity.
3. **Sequence indexing:** zero-based internal indices and half-open ranges; one-based positions in the UI. Store each strand in its own 5-prime to 3-prime order and define mappings explicitly.
4. **Anchors:** named position/orientation frames for binding sites, entry/exit paths, active sites, tRNA sites, and peptide exit. Agree on names before independent asset work.
5. **Simulation ownership:** sequence and mechanism code has no DOM or rendering dependencies. A single controller owns event order and simulation time; renderers do not mutate biological state.
6. **Determinism:** state is reproducible from scenario, seed, and time. Seeking uses direct evaluation or snapshots plus deterministic replay; incremental visual motion cannot be the source of truth.
7. **Events:** define transcription start/nucleotide addition/completion, translation initiation/codon recognition/residue addition/translocation/release. Each event carries stable IDs and sequence positions.
8. **Rendering lifecycle:** components expose create/update/select/dispose behavior, share the scene camera and clock, and release geometry/material resources when unloaded.
9. **Detail levels:** agree on overview, structure, and local-detail representations. Do not require every asset to provide atom-level rendering in M1.
10. **Packaging:** runtime assets resolve from the deployed site itself. Scientific references may be clickable external links, but following them is optional and not required for playback.

Extend the current `js/science`, `js/sim`, `js/render`, and `js/ui` separation. Introduce scenario definitions and assets as needed. Do not rewrite the application into a different framework solely for this demo. A build step may be introduced if it simplifies bundling and asset preparation; the published output must remain static.

## 8. Milestones and exit gates

| Milestone | Work | Required evidence before advancing |
| --- | --- | --- |
| M0: Establish baseline | Reconcile source branch and plan; run existing tests; inspect all five modes; define scenario, contracts, and asset candidates | Baseline commit recorded; current failures documented; contracts and scientific simplifications reviewed |
| M1: Run the complete skeleton | Use placeholder actors to run DNA → mRNA → peptide in one scene | Sequence fixture passes; same mRNA reaches translation; pause/restart/seek work; one shared clock |
| M2: Complete transcription | Build reusable RNA, local DNA bubble, polymerase representation, and nucleotide-addition close-up | Correct directions and RNA sequence; DNA re-closes; RNA remains continuous; close-up and overview both readable |
| M3: Complete translation | Replace ribosome/tRNA placeholders; implement initiation, elongation, and release | Correct reading frame/residue order; initiator handled separately; stop adds no residue; mRNA retained |
| M4: Integrate the experience | Add cytoplasm context, inspection, camera presets, cutaways, responsive controls, and quality settings | Entire story readable from multiple views; no blocking labels/clipping; mobile interaction and reduced-motion behavior inspected |
| M5: Release the static demo | Bundle assets, verify deployment paths, perform browser/network/performance review, and finalize sources | No required third-party runtime requests; regression checks pass; visual acceptance recorded; publishing scope decided |

Do not spend weeks polishing isolated molecules before M1. A rough complete loop exposes integration errors earlier. Do not mark M2–M4 complete while final assets remain placeholders unless the release scope explicitly records that simplification.

## 9. Multi-agent collaboration

Use one integration owner and bounded work packages. Parallelism starts after shared contracts are agreed; it does not replace integration milestones.

| Role | Primary ownership | Typical deliverable | Boundary |
| --- | --- | --- | --- |
| Integration owner | Main entry point, shared contracts, task board, scene orchestration | Integrated milestone and reviewed handoffs | Sole owner of shared wiring while other tasks run |
| Science and simulation agent | Sequence logic, event/state model, scientific checks | Deterministic transcription/translation state and tests | No renderer or UI ownership |
| Molecular assets agent | RNA/protein geometry, provenance, anchors, asset preparation | Validated reusable components and asset manifest | No independent global clock or camera |
| Rendering and interaction agent | Scene layout, camera, labels, cutaways, detail levels | Usable multi-object scene and inspection UI | Consumes simulation state; does not derive biological outcomes |
| Review role | Scientific, visual, regression, and performance review | Evidence with issues and limitations | May be scheduled as a separate pass rather than a fifth simultaneous worker |

For a four-agent session, use the integration owner plus the three implementation agents. Schedule independent review after a batch or when an implementation slot becomes free.

Workflow:

1. The integration owner creates a bounded task with dependencies, owned files, expected interfaces, and acceptance criteria.
2. Assign a branch/worktree per agent using a `codex/` prefix when available. If agents share a checkout, enforce non-overlapping file ownership; agents must not switch the shared branch.
3. Do not concurrently edit `js/main.js`, shared contracts, or the same task-board section. Agents report proposed shared changes to the integration owner.
4. Build against the agreed fixture and contract. Request contract changes explicitly instead of silently adapting only one component.
5. Handoff includes changed files, interface changes, tests run and results, visual evidence where applicable, known limitations, and next dependencies.
6. The integration owner merges a small batch, checks the combined flow, and updates project status. An isolated component passing tests does not complete an integration milestone.

Suggested batches:

- After M0: simulation skeleton, molecular placeholders/anchors, and scene/UI skeleton can proceed in parallel.
- After M1: transcription refinement, translation assets, and camera/inspection work can proceed in parallel against stable contracts.
- During M3–M4: integrate frequently; prioritize complete-flow fixes over additional molecular detail.

## 10. Markdown project records

Keep one owner for each fact rather than copying the full plan into every handoff. Create the implementation records during M0, when their contents become concrete.

| File | Purpose | Update rule |
| --- | --- | --- |
| `PLAN.md` | Scope, building blocks, milestones, and collaboration approach | Update when scope or milestone definitions change |
| `AGENTS.md` | English-only requirement and repository collaboration rules | Update when repository-wide working rules change |
| `docs/TASKS.md` | Task ID, status, owner, dependencies, files, acceptance, evidence | Integration owner updates after assignment or handoff |
| `docs/CONTRACTS.md` | Shared data, coordinates, anchors, state/events, lifecycle | Review before incompatible implementation changes |
| `docs/SCIENCE.md` | Biological scenario, sources, assumptions, simplifications | Update with each new mechanism or scientific correction |
| `docs/ASSETS.md` | Structure provenance, preprocessing, and reuse terms | Update whenever an asset is added or replaced |
| `docs/DECISIONS.md` | Dated architectural decisions and their reasons | Append when a significant choice is made or superseded |
| `docs/VALIDATION.md` | Test/browser/device evidence and unresolved limits | Update at each milestone review |
| `docs/handoffs/<task-id>.md` | Short implementation handoff | One record per completed or blocked work package |

Task statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`. A task is `DONE` only after its acceptance evidence is checked. A blocked task names its missing dependency and the action needed to unblock it.

## 11. Initial backlog

All tasks below are unassigned and `TODO`. These are planning tasks, not claims of completed implementation.

| Task | Milestone | Deliverable | Depends on |
| --- | --- | --- | --- |
| T01 | M0 | Source branch integrated with planning documents; clean baseline recorded | None |
| T02 | M0 | Existing tests rerun and all Helix modes inspected | T01 |
| T03 | M0 | Scenario, sequence annotations, sources, and simplifications agreed | T01 |
| T04 | M0 | Component contracts and placeholder fixture frozen | T02, T03 |
| T05 | M1 | Pure sequence transformation and deterministic process state | T04 |
| T06 | M1 | Placeholder actors with agreed anchors and identity | T04 |
| T07 | M1 | Scene, shared timeline, basic camera, and complete-loop integration | T05, T06 |
| T08 | M2 | Reusable mRNA plus transcription-ready DNA | T07 |
| T09 | M2 | Polymerase asset and readable transcription cycle | T08, asset review |
| T10 | M3 | Ribosome and tRNA assets with translation anchors | T04, asset review; integrate after T07 |
| T11 | M3 | Translation cycle, peptide growth, and release | T08, T10 |
| T12 | M4 | Environment, inspection, cutaways, camera presets, responsive polish | T09, T11 |
| T13 | M5 | Static packaging, regression/network/performance review, release notes | T12 |

The first concrete development objective is T01–T07: a complete working skeleton. The next reusable molecular component is mRNA, developed together with transcription behavior rather than as an isolated decorative strand.

## 12. Acceptance and known risks

### Biological and state checks

- Coding/template/RNA relationships and directions are consistent.
- The selected open reading frame yields the expected residue sequence.
- Translation starts at the annotated site; untranslated regions are not translated.
- Stop codons trigger release without adding an amino acid.
- Initiator tRNA behavior is distinct from the elongation cycle.
- Repeated seeks to the same time reproduce biological state, captions, and visible actor identities.
- Restart clears prior products and state; pause prevents biological advancement.
- Existing Helix modes remain functional.

### Visual and interaction checks

- Inspect start, bubble formation, RNA growth, translation initiation, elongation, termination, and final overview.
- Inspect from several camera angles; no critical molecule permanently obscures the event being taught.
- Observe actual playback as well as screenshots; static captures cannot establish motion quality.
- Inspect desktop and phone layouts, touch controls, keyboard operation, and reduced-motion behavior.
- Record limitations honestly; automated tests do not establish visual acceptance.

### Packaging and performance checks

- Inspect network activity during startup and the full scene: assets come from the site, with no required third-party calls.
- Test the actual static host path, including a repository subpath if used.
- Record device, browser, viewport, quality tier, asset size, loading time, and frame-time measurements.
- Provisional targets: approximately 60 fps on the chosen reference desktop and 30 fps on the chosen reference phone. Select reference devices in M0; these are goals, not verified promises.
- Check repeated mode changes for resource growth. Lower detail before sacrificing essential labels or biological clarity.

Primary risks are incompatible component interfaces, misleading chemistry, untraceable mixed-species assets, unreadable active sites, and excessive structure size. Address them with early contracts, a small complete-loop fixture, provenance records, cutaways, and detail levels. Expand scope only after the first end-to-end demo meets its exit gates.

---

# Part II: Round 2 plan (true-scale molecular machines and final integration)

Status: Proposed 2026-11-17; not started. Items marked *proposed* or *unverified* must be confirmed in R2-M0 before they are treated as decisions.

## 13. Round 1 audit and re-baseline

Evidence was gathered on 2026-11-17 at `72d888b` (`main`) with Node 22 and headless Chromium (software WebGL, 1440×900). This was a load-and-inspect pass, not a full visual acceptance review.

| # | Finding | Evidence | Consequence for Round 2 |
| --- | --- | --- | --- |
| 1 | The merged application did not load. `js/ui/about.js` contained one unbalanced `)`, so `index.html` and `dist/helix-standalone.html` both rendered a blank page. | Browser reported `SyntaxError: Unexpected token ')'` at `about.js:36`. Fixed on `claude/admiring-cray-fdre6q`; afterwards all six modes load with zero console errors and zero external requests. | A browser load check becomes a required gate for every merge. |
| 2 | The syntax check used in Round 1 gives false passes. | `node --check js/ui/about.js` exited 0 on the broken file; the same content checked as `.mjs` failed. The repository has no `package.json` declaring `"type": "module"` (root cause not investigated further). | Add `package.json` with `"type": "module"` and check every module as ESM. |
| 3 | 37/37 tests pass, but no test imports `js/ui`, `js/render`, or `js/main.js`. `docs/TASKS.md` marks T13 `DONE` and `docs/VALIDATION.md` contains no browser evidence. | Test files and records as merged. | Correct the records; add a headless smoke test. |
| 4 | RNAP, both ribosomal subunits, tRNA bodies, and RF1 are anonymous translucent ellipsoids drawn about 4–6× smaller (linear) than life next to true-scale atomic DNA. | `EXPRESS_BLOB_DEF`: the RNAP envelope is about 35 × 29 × 41 Å against the ~150 × 115 × 110 Å quoted in `docs/ASSETS.md`; the 50S envelope is about 40 Å across against a 70S particle of roughly 200–250 Å; the tRNA body is about 10 × 18 Å against a ~70 Å L-shape. | Building blocks B03, B05, B06, B08 are still placeholders. This is the main work of Round 2. |
| 5 | The construct cannot host true-scale machines and its signals are abbreviated. | 48 bp ≈ 162 Å of DNA, about the length of one RNAP. A 4-bp `TATA` stands in for the −10 element, there is no −35 element, the transcript starts immediately after it, the Shine–Dalgarno-to-`AUG` spacer is 2 nt, and there is no transcription terminator. | A longer, annotated construct is required (§17.1). |
| 6 | Records disagree with code. | `docs/SCIENCE.md` §3.1 and `docs/CONTRACTS.md` §3 describe a 5-bp `TATAA`, `AGGAGGU`, a 43-nt mRNA, and region lengths that sum to 49; code and handoffs use a 4-bp `TATA`, `AGGAGGUA`, and a 44-nt mRNA. | Reconcile in R2-M0; code is the reference until the new construct replaces it. |
| 7 | `js/sim/expression.js` (1,215 lines) mixes sequence fallbacks, layout, transcription, translation, and captions, and carries fallback copies of science constants. | Source inspection. | Split before adding machines (§17.4). |
| 8 | The free mRNA is drawn as a rigid helical strand; the peptide is a straight row of Cα beads. | Screenshots at 30 %, 70 %, 100 % progress. | Upgrades U2 and N5 in §15. |
| 9 | Not verified in this pass: camera-follow presets, cutaway readability, mobile layout, frame rate on a hardware GPU, reduced motion, repeated mode switching. | — | Verify in R2-M0 and record in `docs/VALIDATION.md`. |

Milestone status after audit: **M0 and M1 are met** (complete loop with placeholder actors, deterministic seek). **M2–M4 are partially met**: sequence logic, RNA chemistry, UI, and timeline exist, but §8 does not allow these milestones to close while final assets are placeholders. **M5 is not met**: the published build did not load, and no visual acceptance is recorded.

## 14. Round 2 objective and principles

Objective: replace every placeholder with a structure-derived model at true scale, and integrate them into one continuous, inspectable scene in which the procedurally built DNA, mRNA, tRNA anticodons, and peptide pass through the real channels of the machines.

1. **One world, one scale.** Everything is in angstroms in one frame. No per-actor shrink factor. If something does not fit, lengthen the construct or move the camera.
2. **One experimental source per machine, one species.** Prefer *Escherichia coli* entries that already contain the nucleic acids we animate, so anchors come from data rather than hand placement. Record every exception.
3. **Machines are rigid bodies with anchors and slot tracks** (§17.2). No molecular dynamics; conformational changes are discrete, labelled states.
4. **Atoms only where they teach.** Large complexes use coarse levels of detail; atomic detail is limited to active sites and to the procedural nucleic acids and peptide.
5. **Vertical slices.** Integrate RNAP end to end before starting the ribosome. A rough true-scale slice exposes the hard problems (path threading, occlusion, camera) earliest.
6. **Evidence gates include a browser.** No task is `DONE` on Node tests alone.

## 15. Model inventory: what exists and what is still needed

Summary: **7 required new models, 3 recommended, 2 upgrades of existing models, 1 optional context group.** Five of the required models are large structure-derived assets, but they come from only about three PDB entries through one shared pipeline, so the effort is closer to three asset jobs plus three small procedural models.

### Existing models

| ID | Model | State | Round 2 action |
| --- | --- | --- | --- |
| B01 | B-DNA duplex, atomic | Release quality | **U1:** longer construct with real promoter elements; follow a curved path through RNAP |
| B02 | RNA strand and A-RNA duplex, atomic, with 2′-OH and U | Release quality as chemistry; rigid as a free chain | **U2:** flexible, length-preserving free-chain path between machines |
| B07 | Nascent peptide, Cα beads | Placeholder | Replaced by N5 |
| B03/B05/B06/B08 | RNAP, ribosome, tRNA, RF1 | Placeholder ellipsoids | Replaced by N1–N4, N6 |

### Required new models

| ID | Model | Target representation | Candidate source (*unverified until asset review*) | Notes |
| --- | --- | --- | --- | --- |
| N1 | RNA polymerase core (α₂ββ′ω) with σ⁷⁰ as a separable part | Surface, per-chain coarse beads, atomic active-site subset; σ⁷⁰ leaves after promoter escape | Elongation complex PDB 6ALF (4.1 Å) or 6ALH (4.4 Å), *E. coli*; holoenzyme/open complex PDB 6C9Y (4.25 Å) / 6CA0 (5.75 Å), *E. coli* | The elongation complex supplies template, RNA·DNA hybrid, and RNA exit paths. Two source entries means two documented states of one machine. |
| N2 | 30S subunit (16S rRNA + proteins) | Same three levels; decoding centre atomic | PDB 7K00 (*E. coli* 70S, 1.98 Å, with A-, P-, and E-site tRNAs) | One entry yields N2, N3, and N4. |
| N3 | 50S subunit (23S + 5S rRNA + proteins) | Same; peptidyl-transferase centre atomic; exit tunnel visible in cutaway | PDB 7K00 | Tunnel centreline is computed offline and recorded as an approximation. |
| N4 | Full-length tRNA (~76 nt L-shape) with aminoacyl end | Atomic or backbone trace; one initiator and one elongator fold | P-site tRNA^fMet and A-site tRNA from PDB 7K00 | The elongator fold is reused for all ten amino acids with only the anticodon rebuilt; label this simplification. |
| N5 | Amino-acid residue library and atomic nascent peptide | Heavy-atom backbone and side chains for the residues in the fixture (fMet, A, E, F, K, G, S, D, Y, Q), extended conformation | Standard residue geometry from the literature (for example Engh & Huber parameters); no PDB asset | Procedural, like the nucleotide templates. No folding is claimed. |
| N6 | Release factor RF1 | Surface and coarse beads, with the stop-codon-reading and peptide-release regions marked | *Open:* an *E. coli* 70S·RF1 entry must be selected in asset review | Do not reuse a *Thermus thermophilus* entry silently. |
| N7 | NTP substrates and pyrophosphate | Atomic templates extending the ribonucleotide with β- and γ-phosphates; PPi leaves on bond formation | Procedural from standard geometry | Small, but removes the "nucleotide appears" simplification. |

### Recommended models (include if Round 2 scope allows)

| ID | Model | Why | Candidate source (*unverified*) |
| --- | --- | --- | --- |
| N8 | EF-Tu, delivering each aminoacyl-tRNA | Without it tRNAs "fly in" unaided | PDB 5WDT (70S with EF-Tu ternary complex, 3.0 Å) |
| N9 | EF-G, driving translocation | Gives the A→P→E step a visible cause | *Open:* candidates include the 3J5T/3J5U/3J5W/3J5X family; state mapping not checked |
| N10 | RNA hairpin (intrinsic terminator) | Gives transcription a real end and adds the first RNA secondary structure | Procedural from the existing A-RNA duplex builder plus a loop |

### Optional context

Initiation factors IF1–IF3, aminoacyl-tRNA synthetase, and generic cytoplasm crowders (E01). These are context, not mechanism; build them only after R2-M4 passes.

## 16. Asset pipeline and levels of detail

All large models come through one offline tool so provenance and format are uniform.

1. `tools/build-assets.mjs` reads mmCIF files listed in `tools/sources.lock.json` (identifier, URL, download date, SHA-256, chains used). Raw mmCIF files are not committed; derived assets and the lock file are.
2. For each machine the tool emits into `assets/`:
   - **L0 envelope:** a low-resolution surface mesh for overview and mobile.
   - **L1 architecture:** one bead per residue (P for RNA, Cα for protein), grouped by chain and class (rRNA, r-protein, σ, and so on).
   - **L2 active site:** heavy atoms within a fixed radius of named anchors only.
   - **Anchors and slot tracks** (§17.2) and a provenance block for `docs/ASSETS.md`.
3. Coordinates are quantised integers in a binary buffer plus a JSON manifest. `tools/build-standalone.mjs` must inline these assets.
4. Provisional budgets, to be measured in R2-M1: all derived assets ≤ 1.5 MB compressed; ≤ 40k triangles per L0 mesh; ≤ 15k L1 beads per machine; ≤ 3k L2 atoms per machine.
5. The simulation must run in Node without WebGL, so anchors and slot tracks are plain JSON that tests can load.

Build-time prerequisite: the pipeline needs `files.rcsb.org` (and `data.rcsb.org` for metadata). Both are blocked by the current cloud environment's network policy. Either allow them for the assets agent or download the selected entries manually into an ignored `tools/sources/` folder. Runtime still makes no external requests.

## 17. Integration design

### 17.1 True-scale construct (*proposed*)

Replace the 48-bp construct with a scenario-defined construct of roughly 150 bp so that true-size RNAP (about 35 bp of contact) and ribosome (about 30 nt of mRNA) fit with visible free DNA and mRNA on both sides:

- upstream DNA with −35 and −10 elements at standard spacing and a discriminator before +1;
- a 5′ UTR long enough for 30S binding, with the Shine–Dalgarno sequence 5–9 nt upstream of `AUG`;
- the existing 11-codon ORF and `UAA` stop, unchanged, so Round 1 sequence tests remain valid;
- a 3′ region with an intrinsic terminator (N10) or, if N10 is deferred, a documented run-off end.

Estimated size is about 6k DNA atoms plus 2k mRNA atoms, compared with 3.6k atoms today. Exact sequence, lengths, and literature references are fixed in `docs/SCIENCE.md` during R2-M0.

Known consequence to decide (§21): at true scale the 50S exit tunnel (reported as roughly 80–100 Å long) is longer than an extended 11-residue peptide (about 40 Å). The peptide stays inside the ribosome until release and is visible only in cutaway. Either accept this as an honest teaching point or lengthen the ORF to 30–40 codons.

### 17.2 Machines as rigid bodies with anchors and slot tracks

This is the central integration idea. Each machine asset carries:

- **Anchors:** named frames taken from the experimental structure (active site, A/P/E sites, entry and exit points, tunnel exit).
- **Slot tracks:** ordered lists of per-nucleotide frames extracted from the nucleic acids present in the structure. Examples: template-strand registers through RNAP, the RNA·DNA hybrid and RNA exit channel, mRNA registers through the 30S channel relative to the P-site codon, and whole-tRNA frames for A, P, and E.

The simulation assigns each procedural nucleotide either an ideal-helix position, a slot index (fractional while translocating), or a free-chain parameter. A pure kinematics layer turns that assignment into atom frames, blending over about one helical turn between ideal geometry outside a machine and slot frames inside it. Procedural atoms therefore sit where the experimental atoms sat, and motion through a machine is interpolation along data-defined slots rather than hand-tuned offsets.

Where a structure lacks a segment (for example a disordered non-template strand in the bubble), the track is completed synthetically and flagged in the manifest. Motion between slots is an interpolation, not an observed trajectory.

Hardest open problem: real elongation complexes bend DNA, so upstream and downstream duplex axes are not collinear. Prototype in R2-M1 a duplex builder that follows a local curved axis travelling with RNAP. Fallback if it stalls: keep the duplex straight outside the enzyme, use slot tracks only for the bubble, hybrid, and RNA exit, and document the relaxed bend.

### 17.3 Free chains

The mRNA between the RNAP exit and the ribosome, and the mRNA tails, follow a deterministic, seeded smooth curve through control points (machine exit anchors and rest positions), re-parameterised so nucleotide spacing stays constant. The same component draws the released peptide. This is a visual model of flexibility, not polymer physics.

### 17.4 Layers and ownership

| Layer | Location (*proposed*) | Responsibility |
| --- | --- | --- |
| Scenario | `js/scenario/` | Construct sequence, annotations, which assets are used |
| Asset manifest | `assets/`, `js/assets/` | Levels of detail, anchors, slot tracks, provenance; loader with a Node path |
| Simulation | `js/sim/expression/` (`timeline`, `transcription`, `translation`) | Event list and, for any time, machine transforms, slot assignments, bond states, captions |
| Kinematics | `js/sim/expression/kinematics.js` | Slot assignment → atom and residue frames |
| Scene | `js/scene/` | Actor registry, level-of-detail selection, cutaway, labels, camera rails |
| UI | `js/ui/` | Controls and inspection cards |

One event list is the single source of truth for order and duration (bind, bond, translocate, release). Seeking evaluates the state directly from time, as today. Renderers never change biological state. `js/main.js` and `docs/CONTRACTS.md` keep a single integration owner.

### 17.5 Integration order

1. **RNAP slice:** new construct, pipeline, N1 and N7, transcription on slot tracks, σ⁷⁰ release, true-scale camera.
2. **Ribosome slice:** N2–N5, translation on slot tracks, peptide in the tunnel.
3. **Factors:** N6, then N8–N10 if in scope.
4. **Scene:** chapters, camera rails, inspection with provenance, level-of-detail tuning, mobile, context.
5. **Stretch, coupled mode:** start translation on the nascent mRNA while RNAP is still transcribing. PDB 8FIZ and its related entries describe an *E. coli* transcription–translation complex and can ground the relative arrangement. Keep the sequential timeline as the default teaching mode.

Each model first passes an isolated "actor card" page under `dev/` (all levels of detail, anchors drawn, provenance shown), then enters the scene. If a structure-derived model fails a size or readability gate, fall back to its own L0 envelope at true scale, never to an anonymous ellipsoid.

## 18. Contract changes to freeze in R2-M0

- Asset manifest schema: units, quantisation, chain classes, levels of detail, anchors, slot tracks, provenance, synthetic-segment flags.
- Actor descriptor: replaces `sim.blobs` entries with `{ id, assetId, state, transform, lod hints, cutaway }`; keep a compatibility shim until the Copy mode is migrated or explicitly left on blobs.
- Slot assignment per nucleotide and residue, and the kinematics function signature.
- Event list schema and chapter markers.
- Scenario schema for the construct, replacing hard-coded indices and the fallback constants in the simulation.
- Rule: display scale is 1 for all actors; any exception is listed in `docs/SCIENCE.md`.

## 19. Milestones and exit gates

| Milestone | Work | Required evidence |
| --- | --- | --- |
| R2-M0: Stabilise and re-baseline | Hotfix merged; `package.json` and ESM checks; headless smoke test for all six modes; records corrected (§13 items 3, 6); unverified items in §13 item 9 inspected; construct, asset selection, and contracts frozen; build-time data access arranged | Smoke test fails on the pre-fix commit and passes after; updated `docs/` records; signed-off asset list with chains and licences |
| R2-M1: Pipeline and RNAP slice | `tools/build-assets.mjs`; loader; level-of-detail renderer; new construct; N1, N7; transcription on slot tracks | RNAP at true scale; RNA sequence and direction tests pass on the new construct; DNA re-closes; actor card and scene screenshots reviewed; asset sizes recorded |
| R2-M2: Ribosome slice | N2–N5; translation on slot tracks | Codon–anticodon pairing sits in the decoding centre of the asset; initiator in P site; residue order correct; peptide path through the tunnel visible in cutaway |
| R2-M3: Factors and termination | N6; N8–N10 if in scope | Stop adds no residue; RF1 occupies the A site of the asset; transcription end state documented |
| R2-M4: Scene integration | Chapters, camera rails, inspection with provenance, level-of-detail and mobile tuning, optional context and coupled mode | Whole story readable from overview and close-up; frame times recorded on a hardware GPU and a phone; no blocking occlusion |
| R2-M5: Release | Standalone bundle with assets; network audit; final validation and release notes | Page and bundle load with zero errors and zero external requests; visual acceptance recorded by a human reviewer |

## 20. Work packages and allocation

Model tiers follow the allocation policy in `AGENTS.md`: the integration owner uses the top available tier (Gemini 4 Argon or Claude Opus 5.5), implementation agents use the workhorse tier (Gemini 4 Hydrogen or Claude Sonnet 5.5), and smoke runs, log parsing, and record checks use the utility tier.

| Task | Milestone | Deliverable | Owner role | Depends on |
| --- | --- | --- | --- | --- |
| R2-T01 | M0 | `package.json`, ESM syntax check, headless smoke test (`tests/smoke.browser.mjs`) | Review / utility | — |
| R2-T02 | M0 | Records reconciled: `TASKS.md`, `VALIDATION.md`, `SCIENCE.md`, `CONTRACTS.md`, `ASSETS.md` | Integration owner | R2-T01 |
| R2-T03 | M0 | True-scale construct and scenario schema; literature references | Science | — |
| R2-T04 | M0 | Asset selection: entries, chains, species, licences, missing regions | Assets | data access |
| R2-T05 | M0 | Contracts in §18 frozen, plus a tiny synthetic asset fixture so lanes can start in parallel | Integration owner | R2-T03, R2-T04 |
| R2-T06 | M1 | `tools/build-assets.mjs`, lock file, asset format, loader | Assets | R2-T05 |
| R2-T07 | M1 | Simulation split; event list; kinematics with slot tracks; removal of fallback constants | Science | R2-T05 |
| R2-T08 | M1 | Actor registry and level-of-detail renderer; actor card page | Rendering | R2-T05 |
| R2-T09 | M1 | N1 and N7 assets; curved-path duplex prototype | Assets + Science | R2-T06, R2-T07 |
| R2-T10 | M1 | RNAP slice integrated in `js/main.js`; gate review | Integration owner | R2-T07–R2-T09 |
| R2-T11 | M2 | N2, N3, N4 assets with A/P/E and mRNA tracks, tunnel centreline | Assets | R2-T06 |
| R2-T12 | M2 | N5 residue library and atomic peptide builder with tests | Science | R2-T05 |
| R2-T13 | M2 | Translation on slot tracks; free-chain mRNA (U2) | Science | R2-T07, R2-T11 |
| R2-T14 | M2 | Ribosome slice integrated; gate review | Integration owner | R2-T11–R2-T13 |
| R2-T15 | M3 | N6, and N8–N10 if approved | Assets + Science | R2-T14 |
| R2-T16 | M4 | Chapters, camera rails, inspection cards, cutaway tuning, mobile | Rendering | R2-T14 |
| R2-T17 | M4 | Optional context (E01) and coupled mode | Integration owner decides | R2-T15, R2-T16 |
| R2-T18 | M5 | Bundle, audits, validation evidence, release notes | Review + Integration owner | R2-T16 |

After R2-T05, lanes R2-T06, R2-T07, R2-T08, and R2-T12 run in parallel against the synthetic fixture. Integration tasks (R2-T10, R2-T14) are serial and owned by one agent.

## 21. Decisions needed and risks

Decisions for the project owner before R2-M0 closes:

1. **True scale with a longer construct** (recommended) or keep the 48-bp scene with a disclosed shrink factor.
2. **Scope tier:** required models only (N1–N7), or also the recommended N8–N10.
3. **Peptide visibility:** keep 11 residues and rely on cutaway, or lengthen the ORF.
4. **Coupled transcription–translation** as a final optional mode, or defer.
5. **Build-time access to RCSB** for the assets agent, or manual download of the selected entries.

Risks and mitigations:

| Risk | Mitigation |
| --- | --- |
| Large machines hide the events being taught | Cutaway and L2 active-site detail are gate criteria in M1 and M2, not polish |
| Curved DNA through RNAP is harder than expected | Time-boxed prototype with the documented straight-DNA fallback in §17.2 |
| Asset size or frame rate on phones | L0-only mobile profile; budgets measured in M1 before the ribosome is built |
| Mixed sources described as one complex | One entry per machine where possible; every exception listed in `docs/ASSETS.md` and shown in the inspection card |
| Candidate entries turn out unsuitable (missing chains, low resolution, wrong state) | Asset review (R2-T04) happens before any pipeline work depends on a specific entry |
| Records drift from code again | Smoke test and record reconciliation are part of every integration task's acceptance |
