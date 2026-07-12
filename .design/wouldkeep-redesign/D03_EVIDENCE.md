# D03 — Reusable topic hubs evidence

Completed 2026-07-11.

## Delivered

- Added seven real topic routes below `/topics/`, each backed by one shared `TopicPage` component and the existing `topicDefinitions` data.
- Added `FilterBar` with native subtopic, type, maturity and sort controls, plus result count, current-filter feedback, reset and zero-result recovery.
- Added a topic summary, curated recommended start, learning-path direction, subtopic entry points, relationship preview and an editorial knowledge ledger.
- Included records when the current topic is either their primary or secondary context, while deduplicating by canonical slug.
- Marked secondary-context results explicitly with their primary topic and kept every result link pointed at the single canonical article page.
- Linked every row on the seven-topic index to its topic hub.
- Kept the no-JavaScript baseline useful: all records are server-rendered before the enhancement script applies URL state and filtering.

## Topic routes

- `/topics/mathematics/`
- `/topics/physics-optics/`
- `/topics/chemistry-materials/`
- `/topics/computing-simulation/`
- `/topics/research-methods/`
- `/topics/history-society/`
- `/topics/growth-practice/`

All seven routes are generated from `topicDefinitions`; their Markdown files only establish stable routes, titles and short descriptions.

## URL and history behavior

- Filter selections serialize to `subtopic`, `type`, `maturity` and `sort` query parameters.
- Default values are omitted from the URL.
- Every user selection adds a history entry with `history.pushState`.
- `popstate` reparses the URL, restores the controls, filters the list and updates the live result count.
- Unknown URL values fall back safely to the default option.

Browser sequence verified on `/topics/physics-optics/`:

1. Initial state: 47 contextual records.
2. `subtopic=量子物理`: 22 records and the encoded query parameter in the URL.
3. Add `maturity=stable`: 0 records and the explicit zero-result recovery state.
4. Browser back: returns to 22 records with only the subtopic selected.
5. Browser back again: returns to all 47 records with default controls.

## Cross-topic canonical verification

The RCWA/TMM guide with canonical slug `notes/rcwa-from-zero` was verified in two contexts:

- `/topics/computing-simulation/`: appears once as a primary-topic record, without a secondary-context marker.
- `/topics/physics-optics/`: appears once with `跨主题 · 主主题 计算与仿真`.

Both rows expose the same `data-canonical-slug` and resolve to the same canonical article route. No copied article page is emitted.

## Automated verification

- D03 targeted tests: 7/7 passed across 2 suites.
- Final full suite: 121/121 passed across 40 suites.
- Tests cover the seven configured routes, reusable component contract, URL/history implementation signals, contextual deduplication, connection generation and the shared canonical slug.
- D03 Prettier check passed for all implementation, test and route files.
- TypeScript check reports no D03-specific diagnostics; the existing baseline diagnostics remain in `citations.ts`, `latex.ts` and `ofm.ts`.
- Production build: 267 inputs parsed and 1021 files emitted successfully.

## Browser and responsive verification

- Exactly one H1 is present after removing the duplicate decorative heading.
- Legacy recommended records without a concise summary receive a short topic-specific orientation sentence instead of a body-length excerpt.
- At 320 × 800, the page has no horizontal overflow, the filter bar collapses to one column, the mobile reading toolbar is present and the selects/reset action measure 44px high.
- Dark mode switches to `saved-theme=dark`; the verified surface/text colors were `rgb(26, 24, 20)` and `rgb(196, 185, 168)`.
- Desktop and narrow DOM checks confirm the generated counts, orientation sections, relationship links, filter labels and canonical cross-topic marker.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
- Browser logs contain only the pre-existing jsDelivr `mhchem` / `__defineMacro` error; no D03-specific runtime error was observed.
