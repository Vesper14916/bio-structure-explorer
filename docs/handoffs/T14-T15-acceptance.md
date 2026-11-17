# Handoff: T14 (visual and mobile acceptance) and T15 (repository close-out)

Date: 2026-11-17
Branch: `claude/ecstatic-sagan-7fl6hp` (base: `main` at `72d888b`)
Owner: single integration session

## Changed files

| File | Change |
| :--- | :--- |
| `js/ui/about.js` | Removed one extra `)` that made the module fail to parse. This prevented the entire application from starting (V-01). |
| `css/style.css` | Phone peek state: `.snap-peek .view` is a flex column and `.peek` has `order: -1`, so the quick-access row is visible in peek (V-02). |
| `dist/helix-standalone.html` | Rebuilt with `node tools/build-standalone.mjs`. |
| `README.md` | Layout section updated (vendor, tools, dist, docs index); rebuild instructions added. |
| `AGENTS.md` | Removed the Chinese parenthetical labels in the model tier table. The file rule requires English only; the model names and prices are unchanged. |
| `PLAN.md` | Status updated from "not started" to "first release implemented", with a pointer to the current task board. |
| `docs/VALIDATION.md` | New §3: defects, automated checks, visual review, limitations. |
| `docs/TASKS.md` | Branch history, owner-name note, rows T14–T15, open follow-up tasks T16–T19. |
| `docs/DECISIONS.md` | New: decisions D-001 to D-006, including branch policy and acceptance rules. |
| `docs/README.md` | New: index of the project records, owner and update rule for each. |
| `docs/evidence/2026-11-17/` | New: 14 downscaled JPEG screenshots (12 mode views, 2 sheet states). |
| `docs/handoffs/T14-T15-acceptance.md` | This file. |

No interface or contract changes. `docs/CONTRACTS.md` is unchanged.

## Evidence

- `node --test tests/science.test.mjs tests/sim.test.mjs`: 37/37 pass.
- `node --check` on every project module: pass after V-01.
- Headless Chromium, six modes at desktop 1440×900 (2x) and phone 390×664: no page errors, no horizontal overflow, no external requests.
- `dist/helix-standalone.html` via `file://`: renders with no errors and no external requests.

Details and the limits of this evidence are in `docs/VALIDATION.md` §3.

## Known limitations

- Software WebGL only; frame rate not measured.
- Motion, label fade, and camera transitions not reviewed live.
- One emulated phone profile; no physical device.
- Keyboard, reduced-motion, and contrast not re-audited.
- RNAP, ribosome, tRNA, and RF1 are still envelopes, not structure-derived.

## Next dependencies

- T16 (live motion and performance) and T19 (accessibility) can start now.
- T17 depends on confirming the Express label issue in a live browser.
- T18 needs a decision on the structure source and its licence before any download.

## Process note

The blocking defect V-01 existed on `main` at `72d888b`. The earlier validation record (37/37 and "static packaging PASS") did not catch it, because it covered the science and simulation modules only. Future UI changes need a browser check and a `node --check` pass (D-005).
