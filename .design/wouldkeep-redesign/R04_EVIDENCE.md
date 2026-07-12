# R04 Evidence — Provenance, revision and citation actions

## Outcome

Structured knowledge records now show honest provenance, license, creation and revision information, followed by reusable citation and sharing actions. Canonical URLs are generated from the public base URL and canonical slug, suggested citations are stable, and every action reports success, cancellation, fallback or failure through a non-blocking live status region.

## Implementation

- Added `RevisionHistory` with license, created/updated dates, source presentation and a concise revision timeline.
- Added `CitationActions` with copy-permanent-link, copy-suggested-citation and system-share actions.
- Added provenance utilities for safe dates, canonical URLs, suggested citations, source URL/DOI validation and revision-event construction.
- Supports linked sources, DOI sources and title-only bibliographic records without inventing unverifiable links.
- Uses native buttons and a `role="status"`, `aria-live="polite"`, `aria-atomic="true"` feedback region.
- Keeps R04 limited to structured knowledge records and places it before the existing continuation section.

## Verification

- Full automated suite: **103/103 passing** across 35 suites.
- Six R04-focused tests cover canonical URL construction, local calendar dates, suggested citations, safe source links, revision events, component rendering and accessible action markup.
- Production build: **success**, 260 content files emitted to 1014 public files.
- TypeScript: no R04 errors. The project check retains only the recorded baseline errors in `citations.ts`, `latex.ts` and `ofm.ts`.
- Desktop browser:
  - provenance, citation actions and related knowledge render in the intended order;
  - canonical URL is `https://wouldkeep.com/notes/rcwa-from-zero`;
  - suggested citation includes the canonical URL and the correct local date, `2026-07-07`;
  - copy-link and copy-citation write the exact expected values to the clipboard and announce success;
  - system-share failure in the automation environment announces a clear non-blocking error;
  - no duplicate IDs or horizontal overflow.
- Mobile browser at 390×844:
  - provenance facts and actions reflow to one column;
  - all three action buttons are full-width and 44px high;
  - no horizontal page overflow.
- Accessibility semantics:
  - all actions are enabled native `button` elements with explicit `type="button"`;
  - feedback is exposed as an atomic polite live status region for keyboard and screen-reader users.

## Known baseline observations

- Build output retains existing content-level LaTeX compatibility warnings.
- The browser environment retains the existing `__defineMacro` math-integration error; R04 interactions and responsive checks completed successfully.
