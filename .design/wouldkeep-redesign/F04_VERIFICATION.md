# F04 Verification — Dual-brand masthead and primary navigation

## Delivered

- Added the `wouldkeep / 夔嵬` masthead and the proposition “拥有你的知识，也让知识照见他人”.
- Added four primary destinations: 主题、学习路径、知识地图、建立知识库.
- Moved the site header into its own named grid region so wide layouts can span the reading and context columns without crowding the left knowledge tools.
- Added a compact native-dialog navigation for constrained layouts with explicit close, backdrop dismissal, Escape handling, body scroll lock and focus return.
- Added a restrained editorial footer and removed emoji from its utility links.
- Added honest construction-state route pages for `/topics/`, `/paths/`, `/map/` and `/build/` so the new navigation never leads to a 404 before the later discovery/method slices replace them.
- Kept Search in the global header and kept appearance/reading tools in the existing left utility region.

## Automated checks

- `tsx --test`: 78 tests passed, 0 failed.
- Full Quartz build: 260 inputs, 1014 outputs, exit code 0.
- `git diff --check`: passed.
- `tsc --noEmit --incremental false`: no F04 errors. The four existing baseline errors remain in `FontSize.tsx`, `citations.ts`, `latex.ts` and `ofm.ts`.

## Browser checks

| Viewport | Navigation mode | Result |
| --- | --- | --- |
| 375 × 900 | Compact, full-height dialog | No horizontal overflow; 44px Search/menu targets; masthead, tools and main content occupy separate grid rows. |
| 800 × 900 | Compact menu in two-column layout | No horizontal overflow; 320px tool rail and 437px content column do not overlap. |
| 1440 × 1000 | Full horizontal four-item navigation | Header spans content/context columns; active item has `aria-current="page"` plus a 2px non-color-only underline; toggle is hidden. |

Interaction checks:

- Opening the compact menu moves focus to the close button and locks background scrolling.
- Escape closes the dialog, clears the lock and returns focus to the menu trigger.
- Selecting 主题 closes the dialog, navigates to `/topics`, focuses `#main-content` through the existing SPA focus contract and marks both responsive copies of the route as current (only the visible copy is exposed at each breakpoint).
- Browser console showed only the pre-existing external KaTeX `mhchem` `__defineMacro` error; no F04 runtime error was observed.

## Notes

- The four route pages intentionally describe their construction state. D02, D06, D07 and M01 own their full experiences.
- At 800px the medium layout begins exactly; narrow styles end at 799px to prevent overlapping breakpoint rules.
