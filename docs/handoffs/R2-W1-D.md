# Handoff: R2-W1 Task D (module hygiene, browser smoke gate, record reconciliation, true-scale construct)

Branch: `r2w1-d`, created from `c9b0744` (the base commit given in the task; `docs/tasks/R2-W1-README.md` names `claude/admiring-cray-fdre6q` as the base branch, which was not used).
Worktree: `/home/user/bio-structure-explorer/.claude/worktrees/agent-a97ef5031eafdb218`
Not pushed.

## Commits

| Part | Commit | Message |
| --- | --- | --- |
| 1 | `2445f22` | chore: add package.json and syntax check script |
| 2 | `43d20b2` | test: add browser smoke gate |
| 3 | `69f5e96` | docs: reconcile 48-bp construct coordinates with genetic-code.js |
| 4 | `e811f3f` | feat: add true-scale 150-bp construct (scenario.js) |

## Status per part

| Part | Status |
| --- | --- |
| 1. `package.json` and syntax check | DONE |
| 2. Browser smoke gate | DONE for PASS on the clean tree. BLOCKED for one acceptance item: the failing run does not name `about.js` (details below). |
| 3. Record reconciliation (48-bp construct) | DONE |
| 4. True-scale construct | DONE |

## Part 1 evidence

Clean tree, `npm run check`:

```
> check
> node tools/check-syntax.mjs

checked 34 files, 0 failed
```

Deliberate break: one `)` appended to the end of `js/ui/about.js` line 35 (the line now ends `structures.'))))`). Output of `npm run check`:

```
> check
> node tools/check-syntax.mjs

js/ui/about.js: /home/user/bio-structure-explorer/.claude/worktrees/agent-a97ef5031eafdb218/js/ui/about.js:36 | ); | ^ | SyntaxError: Unexpected token ')' | at checkSyntax (node:internal/main/check_syntax:74:5) | Node.js v22.23.4
checked 34 files, 1 failed
exit=1
```

Restored (`structures.')))`), then `git diff js/ui/about.js | wc -c` printed `0`. `npm run check` again: `checked 34 files, 0 failed`, exit 0.

`npm test` (after Part 1, before Part 4): 40 tests, `# pass 40`, `# fail 0`, exit 0.

`node tools/build-standalone.mjs`: `Built standalone single-file explorer: .../dist/helix-standalone.html (2556.3 KB)`, exit 0. Then `git checkout dist/` printed `Updated 1 path from the index`.

## Part 2 evidence

Clean tree, `npm run smoke`:

```
> smoke
> node tests/smoke.browser.mjs

SMOKE PASS
smoke-exit=0
```

Deliberate break (same one-character change to `js/ui/about.js`), `npm run smoke`:

```
> smoke
> node tests/smoke.browser.mjs

[/index.html] pageerror: Unexpected token ')'
[/index.html] expected at least 1 canvas, found 0
[/index.html] range input "Gene expression progress" not found after key 5
[/index.html] page text does not contain "Translation" after scrubbing to 700
SMOKE FAIL
smoke-exit=1
```

The gate fails as required, but the output does not name `about.js`. Playwright's `pageerror` for this module load carries only the message `Unexpected token ')'` with an empty stack and no location. A probe (run from the scratchpad, outside the repository) confirmed that `page.on('console')` emits no `console.error` for the same failure. Naming the file would need a different design (for example, recording failed module URLs), which the brief rules out, so the harness was left as written. `about.js` is named by `npm run check` (Part 1), not by the smoke gate. Restored; `git diff js/ui/about.js` printed nothing; `npm run smoke` passed again.

Harness notes:
- The "requests to another host" check counts only `http:` and `https:` URLs. `data:` and `blob:` URLs have no host and are skipped (interpretation of "host is not the local server").
- The static server binds `127.0.0.1` on an OS-assigned port.
- `check-syntax.mjs` runs `process.execPath --check <file>` (the same Node binary running the script) instead of the literal `node` command.

## Part 3 evidence

Edits applied to `docs/SCIENCE.md` section 3.1 (block), 3.2 (three replacements), and 3.3 (one new bullet), and to `docs/CONTRACTS.md` section 3 (region bullets and one mRNA line).

Deviations from the literal text:
- The replacement region bullets in CONTRACTS section 3 have no trailing `;` (the brief's inline list used `;` as a separator).
- The coding-region bullet reads `[12, 45)` (33 bp, 11 sense codons) coding region (`ORF`):, keeping its colon and the three existing sub-bullets. The brief's phrase "keeping the three existing sub-bullets ... unchanged" was read as an instruction, not as text.
- The mRNA line was added as a bullet at the same level as the region bullets.
- Spelling "recognised" follows the brief, not the surrounding "recognized".

`node -e` check (Part 3 step 5):

```
$ node -e "import('./js/science/genetic-code.js').then(m=>{const c=m.DEFAULT_GENE_CONSTRUCT;console.log(c.sequence,c.tss,c.mrna,c.mrna.length,c.promoter.end,c.utr5.end,c.orf.end,c.stop.end)})"
TATAAGGAGGTAATGGCTGAATTTAAAGGTTCTGACTACCAAGCTTAA 4 AGGAGGUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUUAA 44 4 12 45 48
```

These values match the edited text: TSS 4, mRNA 44 nt, promoter `[0, 4)`, UTR `[4, 12)`, ORF end 45, stop end 48.

## Part 4 evidence

`js/science/scenario.js` and `tests/scenario.test.mjs` are new. The 16 regions are copied from `docs/CONTRACTS.md` 6.5. The 150-bp transcript string in the test was copied from the contract (verified with `grep -o 'ACUCU[ACGU]*' docs/CONTRACTS.md`, one match).

Interpretation choices (the brief leaves these open):
- `orf.codons` is the sense-codon count (11), matching `DEFAULT_GENE_CONSTRUCT.orf.codons`. The top-level `codons` array has 12 entries, the last being the stop codon (`codonIndex` 11).
- Codon `dnaStart` and `dnaEnd` are absolute indices into the 150-bp sequence. `mrnaStart` and `mrnaEnd` are relative to the transcription start (45).
- `region(id)` returns `undefined` for an unknown id. `buildConstruct` throws for an unknown `transcribedFrom` or `transcribedTo`, and requires regions with ids `orf` and `stop`.
- Region labels were written by me (the brief specifies only ids and sequences).
- `scenario.js` is not re-exported from `js/science/index.js` (outside task scope; Integration Owner's job).

`node --test tests/scenario.test.mjs`: 9 tests, all pass.

## Final verification

`npm run check`:

```
> check
> node tools/check-syntax.mjs

checked 35 files, 0 failed
```

`npm test`:

```
# tests 49
# suites 0
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

(40 existing tests plus 9 new ones; none removed, skipped, or changed.)

`npm run smoke`: `SMOKE PASS`, exit 0.

`node tools/build-standalone.mjs` after Part 4: built, bundle size 2563.6 KB (grew because the build inlines all of `js/`, including `scenario.js`). `git checkout dist/` restored the committed bundle.

## Not verified

- The smoke gate has not been checked for visual correctness beyond the automated assertions (canvas present, mode keys respond, `Translation` text present). No screenshots were taken.
- The `about.js` break is named only by `npm run check`, not by `npm run smoke` (see Part 2).
- The 150-bp construct has no visual or simulation consumer yet; its tests check sequence and coordinates only.
- The scientific content of the synthetic regions is taken from `docs/CONTRACTS.md` 6.5 as written (the contract says the construct is synthetic). No external source was checked.

## Open questions

1. Should the smoke gate name the failing module? If yes, the Integration Owner should decide the mechanism (for example, recording failed module URLs from `requestfailed` or a module-load probe) before a Part 2 revision.
2. The base-branch mismatch: the README names `claude/admiring-cray-fdre6q`, while the task gave `c9b0744`. This branch is based on `c9b0744`. The Integration Owner should confirm which is correct before merging.
