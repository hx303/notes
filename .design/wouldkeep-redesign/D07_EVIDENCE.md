# D07 — Standalone accessible knowledge map evidence

Completed 2026-07-12.

## Delivered

- Replaced the `/map/` placeholder with a dedicated knowledge map page.
- Removed the heavy Graph rail from every article page; articles now link to the standalone map through the primary navigation and page content.
- The map page keeps the existing relationship graph as a discovery surface, but adds an equivalent semantic list of 255 public knowledge records.
- Added keyboard-friendly record links, topic and maturity filters, a focus search field and URL state preservation for `topic`, `maturity` and `focus`.
- Added responsive list layout and visible focus treatment for low-power/mobile contexts; the list remains usable even when the graph is unavailable.
- Kept graph rendering scoped to `/map/`, avoiding the global graph bundle on the article path.

## Generated output verification

- `/map/` generated successfully with `data-map-page`, one graph surface, one equivalent list surface, focus input and topic/maturity selects.
- The generated map list contains 255 public records after excluding structural roots.
- Representative article output contains no `global-graph-outer` markup.
- Production build parsed 271 Markdown inputs and emitted 1025 files successfully.

## Automated verification

- Full suite: 134/134 passed across 45 suites.
- TypeScript reports no D07-specific diagnostics; only the three existing baseline diagnostics remain in citations.ts, latex.ts and ofm.ts.
- D07 component/content files were formatted with Prettier.

## Browser verification limitation

- The local preview server returned HTTP 200 from the shell, but the in-app Browser refused localhost navigation under its current URL policy. Static output, build output and automated checks were used; no policy bypass was attempted.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
