# R06 — Mobile article slice evidence

Completed 2026-07-11.

## Delivered

- Compact mobile masthead and a fixed, safe-area-aware two-action article toolbar.
- Native modal knowledge directory with the full Explorer tree, folder disclosure state, current-page marking and focus return.
- Native modal reading-settings sheet with focus return and reader-mode integration.
- One-column article flow with an inline, bounded `本文目录`, stacked participation surfaces and locally scrollable long tables, code and formulae.
- Desktop-only Explorer and TOC instances are removed from the mobile interaction surface; the empty left-sidebar shell is also hidden.
- Motion is limited to `prefers-reduced-motion: no-preference`.

## Automated verification

- Targeted R06/R02 tests: 6/6 passed.
- Full Vitest suite: 110/110 passed across 37 suites.
- TypeScript check: no R06 errors. The three existing baseline diagnostics remain in `citations.ts`, `latex.ts` and `ofm.ts`.
- Final production build: 260 inputs parsed and 1014 files emitted successfully.
- `git diff --check` passed for the R06 implementation files before browser verification.

## Browser verification

Tested the production build at 320px, 375px and 430px on each of:

1. `notes/rcwa-from-zero.html` — very long guide with tables, code and formulae.
2. `大学物理-第七章-恒定电流与恒定磁场（完整版）.html` — long physics notes and wide tables.
3. `第九章-重积分及其应用（完整版）.html` — long calculus notes with formula overflow cases.

All nine viewport/article combinations passed:

- `documentElement.scrollWidth <= clientWidth`; no ordinary page-level horizontal scrolling.
- Left desktop sidebar hidden with zero height; participation and right-sidebar content stack in one column.
- Mobile toolbar visible with two 44px-minimum controls; `本文目录` summary measured about 67px high.
- Wide tables are contained by local `overflow: auto` wrappers (for example 567px table content inside a 276px container at 320px).
- Knowledge directory opens with focus on its 44px close control, traps subsequent Tab focus inside, exposes 236 populated links on the representative RCWA article, marks exactly one current page, and returns focus to its trigger on close.
- Reading settings opens with focus inside, retains Tab focus inside and returns focus to its trigger on close.
- Inline `本文目录` opens and closes normally; its 113-link long example is bounded to 448px with local vertical scrolling.
- Insets use `env(safe-area-inset-top/right/bottom/left)` for the toolbar and both modal surfaces.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings.
- Browser logs contain only the pre-existing jsDelivr `mhchem` / `__defineMacro` error; no R06-specific runtime error was observed.
