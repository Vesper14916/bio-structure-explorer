# Repository working rules

## Language

All project files must be written in English. This applies to filenames, documentation, code comments, UI text, task records, and agent handoffs. Preserve scientific symbols, identifiers, and required third-party license text.

## Planning baseline

Read `PLAN.md` before implementing the gene-expression demo. Its initial scope is a local bacterial gene-expression scene, not a full-cell simulation. Keep scientific assumptions and unverified claims explicit.

The existing DNA source was inspected on `origin/claude/dna-structure-visualization-85q6rc` at `246fa52`. Check the current branch and working tree before editing; do not assume the source is already present on `main`.

## Collaboration

- Assign bounded tasks, explicit file ownership, dependencies, and acceptance criteria before parallel implementation.
- Use separate worktrees when practical. Never switch branches in a checkout shared by active agents.
- Give shared contracts and application wiring one integration owner.
- Coordinate incompatible interface changes before implementing them.
- Report changes, validation evidence, and known limitations in each handoff.
- Preserve existing user changes and working Helix modes.

## Product constraints

- Keep the deployed application static and browser-driven.
- Bundle required runtime dependencies and molecular data with the project; do not introduce required third-party APIs without a scope decision.
- Keep sequence/mechanism logic separate from rendering and UI.
- Record sources and simplifications for structure assets and process animations.
- Verify visual behavior in a browser; passing automated checks alone is not visual acceptance.

## Model selection and multi-agent allocation rules

Model selection across multi-agent workflows follows a structured 4-tier matrix based on capability, cost, and task complexity.

### Tier matrix (as of November 2026)

| Tier | Claude model & pricing (Input / Output per 1M) | Google model & pricing (2026.11) | Core parameters & typical division of labor |
| --- | --- | --- | --- |
| **Extreme Breakthrough**<br>*(极限攻坚)* | **Claude Fable 5.2**<br>\$8 / \$40 (cache read: \$0.20) | **Gemini 4 Carbon**<br>\$2 / \$10 (from 12/1: \$4 / \$20) | 1M context. Reserved for major architectural refactoring, deep water troubleshooting, open-ended scientific / quantitative research, and leading large multi-agent teams. |
| **Default Workhorse**<br>*(默认主力)* | **Claude Opus 5.5**<br>\$4 / \$20 (cache read: \$0.20) | **Gemini 4 Argon**<br>\$2 / \$10 (from 12/1: \$4 / \$20) | 1M context. Recommended baseline for complex daily development, multi-PR requirements, intricate financial modeling, and computer use. |
| **Fast Execution**<br>*(快速执行)* | **Claude Sonnet 5.5**<br>\$2 / \$10 (cache read: \$0.10) | **Gemini 4 Hydrogen**<br>\$1.50 / \$7.50 (flat across 1M context) | Released Nov 12, optimized for high-concurrency agent workflows and routine code execution (surpassing Argon in AA index under high reasoning depth). Matches Sonnet 5.5 for well-scoped coding, dialogue, and documentation. |
| **Massive Lightweight**<br>*(海量轻量)* | **Claude Haiku 5.5**<br>\$0.10 / \$0.50 ($\le$100K)<br>\$0.50 / \$2.50 (>100K) | **Gemini 3.8 Flash** (\$0.75 / \$3.75, from 2027/1/1: \$1.50 / \$7.50)<br>**Gemini 3.5 Flash-Lite** (\$0.30 / \$2.50)<br>**3.1 Flash-Lite** (\$0.25 / \$1.50) | High-throughput tasks handled by 3.8 Flash; ultra-low-cost classification, intent routing, information extraction, and log-reading subagents assigned to Flash-Lite. |

### Operational allocation policy

Revised 2026-11-19. `PLAN.md` §9.1 and §11 are the binding detail; this is the summary.

1. **Two executors, ten serial stages.** Claude (Claude Code) owns stages ST2, ST3 and ST7: ribosome and tRNA assets, kinematics core and story engine, translation choreography. Gemini (Antigravity) owns ST1, ST4, ST5, ST6, ST8, ST9 and ST10. Stages never run at the same time.
2. **Gemini Chief: Gemini 4 Neon, high.** The main conversation is the Integration Owner: briefs, contracts, merges, gates, integration tasks, and intake of Claude stages.
3. **Gemini subagents: Gemini 4 Hydrogen.** One bounded task each, at most five at once, inside one stage. If Antigravity cannot select a model, subagents inherit Neon and the Chief records that.
4. **Gemini 4 Argon: at most 30 minutes per stage.** Started only by the Chief for the single review or diagnosis job named in `PLAN.md` §11. Unused time does not carry over. Never a long-running implementer.
5. **Hand-over:** after every stage the owner pushes its result to `origin` (Gemini: `main` and the stage tag; Claude: a branch named in its handoff). The next stage starts from that.
