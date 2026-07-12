# F05 Verification — Representative knowledge-record header

## Delivered

- Added `KnowledgeMeta` as the structured article-header boundary for normalized topic, type, maturity, summary, last revision, reading time and license data.
- Added `MaturityBadge` with three redundant encodings: `01/02/03`, text labels and empty/half-filled/filled diamond marks. Color supports the distinction but is never the only signal.
- Reworked `ArticleTitle` into an editorial title block with a small archival kicker, balanced serif title and constrained long-title measure.
- Reworked `Breadcrumbs` into an ordered semantic trail. Structured records use 首页 → 主主题 → 当前记录 instead of exposing the physical folder path; the current record is plain text with `aria-current="page"`.
- Kept legacy records on the compact `ContentMeta` fallback and prevented duplicate structured metadata.
- Removed the representative RCWA article's duplicate Markdown H1 so its rendered page has exactly one H1.
- Corrected the legacy dark-mode page-header override so semantic dark tokens are not placed on a light header surface.

## Automated and build checks

- `tsx --test`: 78 passed, 0 failed.
- Full Quartz build: 260 inputs, 1014 outputs, exit code 0.
- TypeScript: F05 introduced no new errors. The existing four baseline errors remain in `FontSize.tsx`, `citations.ts`, `latex.ts` and `ofm.ts`.
- Generated `public/notes/rcwa-from-zero.html` contains one H1, one `knowledge-record-header`, `data-maturity="growing"`, the semantic breadcrumb current state and no duplicate article-body title.

## Responsive browser checks

| Viewport | Observed header behavior |
| --- | --- |
| 375 × 900 | 33.78px title wraps to three balanced lines; summary remains 16px; facts become a two-column grid; no horizontal overflow. |
| 800 × 1000 | Two-column site layout remains intact; article title and metadata fit the 437px content column without overlap or overflow. |
| 1440 × 1000 | 44px title uses a 458px reading measure; summary stays within 672px; facts remain a single quiet row; no horizontal overflow. |

## State and theme review

- `seed / 萌芽`: `01` plus an empty clay diamond.
- `growing / 整理中`: `02` plus a half-filled amber diamond.
- `stable / 相对完整`: `03` plus a filled evergreen diamond.
- An isolated non-production fixture visually reviewed all three states with long Chinese/English titles. The missing-optional-data case omitted summary and fact rows cleanly and reduced the metadata region to 65px without placeholder copy.
- Dark mode produced a warm charcoal canvas (`rgb(26, 24, 20)`), off-white title (`rgb(232, 230, 222)`), secondary summary (`rgb(187, 184, 174)`) and transparent page-header surface. All three maturity marks retained distinct shapes and adjusted dark-theme colors.
- A legacy `/topics` page rendered one compact `content-meta`, no structured header and a semantic current breadcrumb.

## Baseline retained

- Browser logs still contain the pre-existing external KaTeX `mhchem` `__defineMacro` error.
- Existing KaTeX Unicode warnings and the upstream Node `punycode` deprecation warning remain build-time noise outside F05.

The isolated fixture lives only under the writable work area and is not part of the published knowledge corpus.
