# F06 Verification — Foundation regression checks

## Outcome

The F01–F05 foundation now has focused, locally reproducible regression coverage without changing production-rendered markup, styling, or behavior. The only runtime-adjacent change is the `npm test` command, which registers test-only loaders for Quartz SCSS and inline-script imports before collecting both `*.test.ts` and `*.test.tsx` files.

## Automated coverage

- Existing canonical slug tests retain collision and physical-path shadowing checks.
- `frontmatter.test.ts` verifies canonical migration, declared aliases, automatic legacy-path aliases, and duplicate removal.
- Existing knowledge metadata tests cover structured, legacy, invalid, epoch-date, and source variants.
- `foundation.test.tsx` server-renders the real components and checks:
  - first-tab-stop skip link and one focusable `main` landmark;
  - labeled left/right complementary landmarks;
  - four primary destinations, current-page state, compact trigger, and named dialog;
  - semantic breadcrumbs, exactly one H1, representative record classification, revision, reading time, and license;
  - graceful omission of optional record facts;
  - all three maturity states with text labels and stable indices.

Command:

```text
npm test
```

Result: **85 tests, 29 suites, 85 passed, 0 failed**.

## Static build

- Inputs: 260 Markdown files
- Outputs: 1014 static files
- Result: passed
- Existing build noise remains limited to known KaTeX Unicode warnings, missing Git metadata in the isolated copy, and Node's `punycode` deprecation warning.

## Browser smoke

The built `/topics` route was captured at 375×900, 800×900, and 1440×900. All three widths reported:

- one `main` landmark;
- one H1;
- no horizontal overflow.

At 375px and 800px the compact navigation trigger is visible and desktop links are hidden. At 1440px desktop links are visible and the compact trigger is hidden. The compact dialog also passed an interaction check: focus moved to the close control on open, Escape closed it, and focus returned to the opener.

The representative `/notes/rcwa-from-zero` record was separately measured at 375px: one H1, one `main`, `#main-content` as the skip target, `tabindex="-1"`, visible record metadata, `growing` maturity, and no horizontal overflow.

Artifacts:

- `browser-smoke/foundation-375.png`
- `browser-smoke/foundation-800.png`
- `browser-smoke/foundation-1440.png`
- `browser-smoke/metrics.json`

The browser console still reports the pre-existing external KaTeX `mhchem` `__defineMacro` error; F06 did not add new production console failures.

## TypeScript baseline

`tsc --noEmit --pretty false` reports the same four pre-existing errors in `FontSize.tsx`, `citations.ts`, `latex.ts`, and `ofm.ts`. No F06 file adds a TypeScript error.
