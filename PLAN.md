# Bio Structure Explorer: Gene Expression Demo Plan

Status: Planning complete; implementation not started.
Updated: 2026-11-13

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
