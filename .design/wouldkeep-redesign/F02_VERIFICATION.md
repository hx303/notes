# F02 Verification: Public Knowledge Metadata

Date: 2026-07-11

## Implemented

- Added one normalization boundary for `primaryTopic`, `topics`, `type`, `maturity`, `summary`, `created`, `updated`, `prerequisites`, `related`, `sources`, `license`, `publish` and `commentKey`.
- Defined the seven approved primary topics, eight initial content types and three maturity states with stable keys and Chinese display labels.
- Exposed normalized metadata and validation issues through `QuartzPluginData` during frontmatter processing.
- Preserved legacy pages through safe inference and fallback behavior without generating warning noise for pages that have not adopted structured metadata.
- Added actionable structured-metadata build warnings that name the page, field, problem and fallback behavior.
- Upgraded the representative RCWA article frontmatter with a summary, topic/type/maturity, dates, prerequisites, sources, publication state and an explicit conservative license value.
- Rendered the representative article's topic, type, maturity, summary, updated date, reading time and license in `ContentMeta`; legacy articles retain the existing compact metadata presentation.
- Added semantic styling based on the approved Phase 3 design tokens.

## Automated Checks

- Unit tests: 78 passed, 0 failed; 4 focused tests cover complete records, legacy compatibility, invalid structured fields, epoch dates and source variants.
- Prettier: all F02 TypeScript, TSX and SCSS implementation files checked successfully; the long-form representative Markdown body was intentionally left untouched.
- `git diff --check`: passed.
- TypeScript: F02 introduced no remaining errors. The repository still has four pre-existing errors in `FontSize.tsx`, `citations.ts`, `latex.ts` and `ofm.ts`.

## Build and Rendering Checks

- Final production build: 256 Markdown inputs, 1010 emitted files, completed successfully with two parser workers.
- No `[knowledge-metadata]` warnings were emitted for the production corpus.
- `notes/rcwa-from-zero.html` contains `data-primary-topic="computing-simulation"`, `data-type="project-guide"` and `data-maturity="growing"`.
- The representative article renders “计算与仿真”, “项目指南”, “整理中”, its summary and “许可：未声明许可”.
- A representative legacy linear-algebra page renders the existing `content-meta` and does not opt into `knowledge-meta`.

## Invalid Metadata Fixture

- An isolated one-page build with invalid topic, type, maturity, date and publish values completed successfully.
- The build emitted field-specific `[knowledge-metadata]` warnings for invalid `primaryTopic`, `type`, `maturity`, `updated` and `publish`, plus missing `summary` and `license`.
- Every warning includes the fallback or preservation behavior, so authors can fix the source without guessing whether the public build changed.

## Baseline Warnings Retained

- Existing content still produces multiple KaTeX Unicode/strict-mode warnings.
- Node still reports the upstream `punycode` deprecation warning.
- These warnings did not fail the build and are outside F02.
