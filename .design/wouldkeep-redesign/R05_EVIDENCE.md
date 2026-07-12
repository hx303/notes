# R05 Evidence — Correction and discussion participation

## Outcome

Correction suggestions are now a separate, structured participation path instead of being mixed into ordinary discussion. The discussion surface now communicates loading, empty, submitting, success, authentication, retry, offline, rate-limit and service-failure states, while retaining in-progress drafts in the current browser whenever submission does not complete.

## Implementation

- Added `CorrectionAction` as a native expandable form with issue type, precise location and correction rationale fields.
- Rebuilt `SupabaseComments` as a visible discussion section with an honest loading state, actionable empty state, section selector and discussion form.
- Reused the existing Supabase project, authenticated session, `comments` table and stable `commentKey`; no parallel identity or data system was introduced.
- Encodes corrections with a structured marker and excludes them from the public discussion list so the two participation intents remain distinct.
- Preserves drafts per canonical comment key and participation type in browser storage; restores them after reload and clears them only after confirmed server success.
- Prevents double submission, maps authentication expiry and HTTP 429/rate-limit failures, retries comment loading and submission, and handles unavailable storage and SDK timeouts.
- Renders untrusted comment content with `textContent`, not HTML injection.
- Uses native labels, inputs, selects, textareas, buttons and details/summary controls; all async form feedback uses atomic polite live regions.

## Verification

- R05-focused tests: **4/4 passing**.
- Full automated suite: **107/107 passing** across 36 suites.
- Production build: **success**, 260 content files emitted to 1014 public files.
- TypeScript: no R05 errors. The project check retains only the recorded baseline errors in `citations.ts`, `latex.ts` and `ofm.ts`.
- Desktop browser:
  - one correction region and one discussion region render after the article continuation content;
  - correction expands through a native disclosure and exposes all three structured fields;
  - the empty discussion state explains what readers can contribute;
  - unauthenticated submission is blocked before any external write, announces the login requirement and keeps the entered draft;
  - after reload, the interface announces that the previous draft was restored;
  - both forms expose `role="status"`, `aria-live="polite"` and `aria-atomic="true"` feedback;
  - no duplicate IDs or horizontal page overflow were found.
- Responsive rules and focused tests verify one-column forms, full-width submit actions, 44px minimum targets, long-text wrapping and reduced-motion fallback. The browser viewport override did not apply in this run, so multi-width visual confirmation is intentionally deferred to R06 rather than reported as completed.

## Known baseline observations

- Build output retains existing content-level LaTeX compatibility warnings.
- Browser console retains the existing `__defineMacro` KaTeX/mhchem integration error; no R05-specific console error appeared.
