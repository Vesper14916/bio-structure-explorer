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
