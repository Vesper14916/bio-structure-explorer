# Express v2 panel: hit areas (expanded sheet, CSS px)

Hard floor 24x24 (test failure below it, except the known allowance in the handoff); informational target 44x44. Smallest size per element type, measured on chapter 1 with the sheet expanded (the sizes do not depend on the chapter).

## iPhone 13

| Element | Count | Min width | Min height | Below 44 |
| --- | --- | --- | --- | --- |
| `button.btn-play` | 1 | 46.0 | 46.0 | no |
| `button.ccell` | 41 | 52.0 | 64.0 | no |
| `button.chapter-row` | 16 | 326.0 | 34.0 | yes |
| `button.grip` | 1 | 388.0 | 22.0 | yes |
| `button.icon-btn` | 4 | 32.0 | 32.0 | yes |
| `button.pep-pill` | 40 | 24.0 | 22.0 | yes |
| `button.seg-btn` | 11 | 41.0 | 40.0 | yes |
| `button.tab` | 6 | 63.0 | 50.0 | no |
| `button.tile` | 3 | 174.0 | 46.0 | no |
| `input.range` | 1 | 208.9 | 44.0 | no |

## Pixel 7

| Element | Count | Min width | Min height | Below 44 |
| --- | --- | --- | --- | --- |
| `button.btn-play` | 1 | 46.0 | 46.0 | no |
| `button.ccell` | 41 | 52.0 | 64.0 | no |
| `button.chapter-row` | 16 | 348.0 | 34.0 | yes |
| `button.grip` | 1 | 410.0 | 22.0 | yes |
| `button.icon-btn` | 4 | 32.0 | 32.0 | yes |
| `button.pep-pill` | 40 | 24.0 | 22.0 | yes |
| `button.seg-btn` | 11 | 43.8 | 40.0 | yes |
| `button.tab` | 6 | 66.7 | 50.0 | no |
| `button.tile` | 3 | 185.0 | 46.0 | no |
| `input.range` | 1 | 230.9 | 44.0 | no |
