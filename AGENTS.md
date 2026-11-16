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

Because developer access does not currently include Gemini 4 Carbon:

1. **Architectural Ceiling (Argon)**: **Gemini 4 Argon** (or Claude Opus 5.5) serves as the highest-tier model for this repository. It acts as the **Integration Owner**, responsible for milestone planning, architectural design, shared contract freezing (`CONTRACTS.md`), and difficult root-cause analysis.
2. **Primary Workhorse (Hydrogen)**: The vast majority of development tasks are assigned to **Gemini 4 Hydrogen** (or Claude Sonnet 5.5). This includes the **Science & Simulation Agent**, **Molecular Assets Agent**, and **Rendering & Interaction Agent** executing bounded, well-specified implementation tasks.
3. **Utility & Support (Flash / Flash-Lite)**: Use **Gemini 3.8 Flash** or **Flash-Lite** for quick lookups, test log parsing, repetitive file checks, and routine sentinel/subagent tasks to minimize latency and token overhead.

