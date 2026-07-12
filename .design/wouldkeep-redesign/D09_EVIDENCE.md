# D09 — Recent growth and monthly change archive evidence

Completed 2026-07-12.

## Delivered

- Added `/changes/` as a generated “最近生长” page instead of relying on a flat RecentNotes timestamp list.
- Classified records into three explicit change kinds: `新记录`, `实质修订` and `小修`.
- Grouped changes by month and exposed the modified date, change kind, topic and article link for each record.
- Added shareable month/topic/change-type filters whose state is serialized in the URL.
- Added an RSS subscription entry point linked to the existing generated site feed.
- Excluded structural roots from the change archive so the page focuses on public knowledge records.

## Generated output verification

- Production build parsed 272 Markdown inputs and emitted 1026 files.
- `/changes/` generated successfully with 256 change records, 5 month groups, 3 filters and an RSS entry.
- The page emits honest empty-state markup when a filter combination has no records.

## Automated verification

- Full suite: 135/135 passed across 45 suites.
- Added D09 coverage for monthly records, all three change labels and the three filter controls.
- D09 implementation and test files pass Prettier.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
- In-app browser localhost navigation was authorized by the user but remained blocked by the current Browser Use URL policy; shell HTTP and static output checks were used.
