# Task D: module hygiene, browser smoke gate, record reconciliation, true-scale construct

Model: Haiku, high effort. Branch: `r2w1-d`. Read first: `docs/tasks/R2-W1-README.md`, `docs/CONTRACTS.md` sections 3 and 6.5, `js/science/genetic-code.js`.

Do the four parts in order. Follow the instructions literally. If something does not work as written, stop that part, write the exact error in the handoff, and continue with the next part.

## Files you own

`package.json`, `tools/check-syntax.mjs`, `tests/smoke.browser.mjs`, `js/science/scenario.js`, `tests/scenario.test.mjs`, `docs/SCIENCE.md`, `docs/CONTRACTS.md` (section 3 only), `docs/handoffs/R2-W1-D.md`. Do not edit any other file.

## Part 1: `package.json` and syntax check

1. Create `package.json` in the repository root with exactly this content:

```json
{
  "name": "bio-structure-explorer",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node tools/check-syntax.mjs",
    "test": "node tools/check-syntax.mjs && node --test tests/*.test.mjs",
    "smoke": "node tests/smoke.browser.mjs",
    "build:standalone": "node tools/build-standalone.mjs"
  }
}
```

2. Create `tools/check-syntax.mjs`. It must: walk `js/` recursively, skip `js/vendor/`, collect every `.js` file, run `node --check <file>` for each with `child_process.spawnSync`, print one line per failing file with the error text, print a final line `checked N files, M failed`, and exit with code 1 when `M > 0`.
3. Prove the check works. Temporarily add one extra `)` at the end of line 35 of `js/ui/about.js` (the last list-item line, directly above the line that contains only `);`), run `npm run check`, and confirm it reports `js/ui/about.js` and exits with code 1. Then remove the extra `)` and confirm `git diff js/ui/about.js` prints nothing. Record both outputs in the handoff. If the broken file is not detected, stop and report; do not continue to part 2.
4. Run `npm test` and `node tools/build-standalone.mjs`. Both must succeed. Run `git checkout dist/` afterwards so the bundle is not changed by this task.

## Part 2: browser smoke gate (`tests/smoke.browser.mjs`)

Write a Node script (not a `node --test` file) that:

1. Loads Playwright with `createRequire(import.meta.url)('playwright')`. If that throws, print `SMOKE SKIPPED: playwright not available` and exit with code 2.
2. Starts a static file server with `node:http` on port 0 (any free port) serving the repository root. Map extensions: `.html` → `text/html`, `.js` and `.mjs` → `text/javascript`, `.css` → `text/css`, `.json` → `application/json`, `.png` → `image/png`, anything else → `application/octet-stream`. Reject paths that resolve outside the root with status 403.
3. Launches Chromium with arguments `--use-gl=swiftshader`, `--enable-unsafe-swiftshader`, `--ignore-gpu-blocklist`, viewport 1280×800.
4. Collects problems in an array: every `pageerror`, every console message of type `error`, every response with status ≥ 400, and every request whose host is not the local server.
5. For each of these pages: `/index.html` and `/dist/helix-standalone.html`:
   - open it, wait 2,000 ms;
   - assert that `document.querySelectorAll('canvas').length >= 1`;
   - press keys `1`, `2`, `3`, `4`, `5`, `6` with 800 ms between presses;
   - after key `5`, set the range input whose `aria-label` is `Gene expression progress` to `700` and dispatch an `input` event, wait 800 ms, and assert that the page text contains `Translation`.
6. Closes the browser and the server. Prints `SMOKE PASS` and exits 0 when the problems array is empty and every assertion held; otherwise prints each problem on its own line, then `SMOKE FAIL`, and exits 1.

Prove it works: run `npm run smoke` (expect `SMOKE PASS`). Then repeat the temporary extra `)` from part 1, run `npm run smoke` (expect `SMOKE FAIL` naming `about.js`), and restore the file. Record both outputs.

## Part 3: record reconciliation (48-bp construct)

The code in `js/science/genetic-code.js` is correct. Two documents describe it wrongly. Fix only the text below.

1. In `docs/SCIENCE.md` section 3.1, replace the fenced `text` block with exactly:

```text
Region:       [Promoter] [  5' UTR (SD)  ] [                Coding ORF (11 aa)                 ] [Stop]
Indices (0b): [0, 4)     [4, 12)           [12, 45)                                              [45, 48)
Coding DNA:   5'-TATA    AGGAGGTA          ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT           TAA-3'
Template DNA: 3'-ATAT    TCCTCCAT          TAC CGA CTT AAA TTT CCA AGA CTG ATG GTT CGA           ATT-5'
mRNA (44 nt):            5'-AGGAGGUA       AUG GCU GAA UUU AAA GGU UCU GAC UAC CAA GCU           UAA-3'
Peptide:                                   fMet-Ala-Glu-Phe-Lys-Gly-Ser-Asp-Tyr-Gln-Ala          (RF1)
```

2. In `docs/SCIENCE.md` section 3.2: change "position `+1` (index `5`, immediately downstream of the `-10` Pribnow element `TATAA`)" to "position `+1` (index `4`, immediately downstream of the abbreviated `-10` element `TATA`)"; change "nucleotide index `13..16`" to "mRNA index `[8, 11)`"; change "nucleotide index `46..48`" to "mRNA index `[41, 44)`".
3. In `docs/SCIENCE.md`, add this sentence at the end of section 3.3 as a new bullet: "**Abbreviated signals:** the 48-bp construct has a 4-bp stand-in for the −10 element, no −35 element, a 2-nt Shine–Dalgarno-to-start spacer, and no terminator. It is replaced by the 150-bp true-scale construct (`docs/CONTRACTS.md` 6.5) when the simulation migrates."
4. In `docs/CONTRACTS.md` section 3, replace the four region bullets under "Total duplex length" so they read: `[0, 4)` (4 bp) abbreviated −10 element `TATA`; `[4, 12)` (8 bp) 5′ UTR `AGGAGGTA` with Shine–Dalgarno `AGGAGG` at `[4, 10)`; `[12, 45)` (33 bp, 11 sense codons) coding region, keeping the three existing sub-bullets for coding DNA, mRNA, and amino acids unchanged; `[45, 48)` (3 bp, codon index 11) stop `TAA` / `UAA`, recognised by RF1, adds no amino acid. Also add one line: "mRNA: DNA `[4, 48)`, 44 nt."
5. Check your edits against the code by running:
   `node -e "import('./js/science/genetic-code.js').then(m=>{const c=m.DEFAULT_GENE_CONSTRUCT;console.log(c.sequence,c.tss,c.mrna,c.mrna.length,c.promoter.end,c.utr5.end,c.orf.end,c.stop.end)})"`
   and paste the output into the handoff.

## Part 4: true-scale construct (`js/science/scenario.js`)

1. Create `js/science/scenario.js`. Import `cleanRnaSequence`, `reverseComplement`, `complement` from `./assembly.js` and `CODON_TABLE`, `AMINO_ACID_INFO`, `anticodonOf` from `./genetic-code.js`.
2. Define the regions exactly as the table in `docs/CONTRACTS.md` 6.5, in order, as an array of `{ id, label, sequence }` with these ids: `upstream`, `minus35`, `spacer`, `minus10`, `discriminator`, `utrLeader`, `sd`, `sdSpacer`, `orf`, `stop`, `linker`, `termStem5`, `termLoop`, `termStem3`, `uTract`, `downstream`. Copy every sequence from the table character by character.
3. Export `buildConstruct(regions, { id, name, transcribedFrom, transcribedTo })` which concatenates the sequences, computes each region's `start` and `end`, and returns an object with: `id`, `name`, `length`, `sequence`, `codingDna`, `templateDna` (`complement`), `templateDna5to3` (`reverseComplement`), `regions` (array with `start`, `end`), `region(id)` lookup, `tss` and `transcriptionStart` (start of region `transcribedFrom`), `transcriptionEnd` (end of region `transcribedTo`), `mrna` (`cleanRnaSequence` of the transcribed slice), `mrnaLength`, `orf: { start, end, mrnaStart, mrnaEnd, codons }`, `stop: { start, end, mrnaStart, mrnaEnd, codonIndex, factor }`, `codons` (same fields as the entries built by `buildConstructCodons` in `genetic-code.js`, computed from the `orf` and `stop` regions; the first codon uses `AMINO_ACID_INFO.fMet`), `peptide`, `peptideLength`, `peptideSequence1`, `peptideSequence3` (same shapes as in `DEFAULT_GENE_CONSTRUCT`).
4. Export `TRUE_SCALE_GENE_CONSTRUCT = buildConstruct(REGIONS, { id: 'bacterial-true-scale-gene', name: 'Synthetic bacterial teaching gene (150 bp)', transcribedFrom: 'utrLeader', transcribedTo: 'uTract' })`.
5. Do not modify `js/science/genetic-code.js` or `js/science/index.js`.
6. Create `tests/scenario.test.mjs` (`node:test`, `node:assert/strict`) asserting:
   - `length === 150`; `tss === 45`; `transcriptionEnd === 137`; `mrnaLength === 92`;
   - `mrna` equals the transcript string in `docs/CONTRACTS.md` 6.5 exactly;
   - `mrna.indexOf('AUG') === 24` and `orf.mrnaStart === 24`; `stop.mrnaStart === 57`;
   - `region('minus35').sequence === 'TTGACA'`, `region('minus10').sequence === 'TATAAT'`, and `region('minus10').start - region('minus35').end === 17`;
   - `region('sdSpacer').sequence.length === 7`;
   - `reverseComplement(region('termStem5').sequence) === region('termStem3').sequence`;
   - `peptideSequence1` equals `DEFAULT_GENE_CONSTRUCT.peptideSequence1` and `codons.length === 12`, last codon `isStop` with `factor === 'RF1'`;
   - `translateMrna(mrna.slice(24))` (read its return shape in `genetic-code.js` first) yields the same eleven residues;
   - `DEFAULT_GENE_CONSTRUCT.length === 48` (unchanged).

## Acceptance checklist
- [ ] `npm test` passes; counts reported.
- [ ] `npm run smoke` prints `SMOKE PASS`; the deliberate break was detected by both `check` and `smoke`, and `js/ui/about.js` is restored (`git diff` empty).
- [ ] `git status` shows changes only in files you own.
- [ ] Handoff contains every command output requested above.
