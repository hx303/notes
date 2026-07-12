# F03 Verification: Semantic, Accessible Global Shell

Date: 2026-07-11

## Implemented

- Added a visible-on-focus “跳到正文” link as the first interactive element on every rendered page.
- Replaced the anonymous center wrapper with one focusable `<main id="main-content">` landmark.
- Replaced left and right anonymous sidebar wrappers with named `<aside>` landmarks.
- Promoted Explorer to a named `<nav>` landmark and added an accessible name, state and controlled-region relationship to its mobile trigger.
- Removed site branding and disclosure labels from the document heading outline; right-rail section headings now enter at level 2 after the page heading.
- Added `viewport-fit=cover` and light/dark `theme-color` metadata, including live synchronization when the manual theme changes and after SPA navigation.
- Added SPA route focus management: hash navigation focuses its target, ordinary route changes focus the new `main`, and the existing assertive route announcer remains present.
- Added one cross-page `:focus-visible` contract using the approved high-contrast focus token, including forced-colors support.
- Enforced a 44×44px minimum for buttons, button-like controls, summaries, form controls and the back-to-top action.
- Added a complete `prefers-reduced-motion` fallback that removes smooth scrolling, reduces transitions/animations to 1ms and hides the scroll-driven reading-progress animation.
- Reworked BackToTop to target the page content landmark, use safe-area offsets and semantic design tokens, and avoid `transition: all`.
- Corrected the responsive grid, mobile tool wrapping and Explorer drawer positioning so the semantic `main` reflows without page-level horizontal scrolling.
- Persisted the approved audience, brand, aesthetic direction, implementation defaults and design principles in `.better-web-ui.md` for future UI work.

## Automated Checks

- Unit tests: 78 passed, 0 failed.
- Prettier: all F03 TypeScript, TSX and modular SCSS implementation files checked successfully. The legacy long-form `custom.scss` retained its existing formatting to avoid unrelated churn.
- `git diff --check`: passed.
- TypeScript: F03 introduced no remaining errors. The repository still has the four pre-existing errors in `FontSize.tsx`, `citations.ts`, `latex.ts` and `ofm.ts`.
- Built CSS contains the global focus ring, 44px target contract and `prefers-reduced-motion: reduce` fallback.

## Build and Semantic Checks

- Final production build: 256 Markdown inputs, 1010 emitted files, completed successfully with two parser workers.
- Representative article and list pages each contain exactly one `main`, one skip link before `#quartz-body`, two named `aside` landmarks, one Explorer `nav`, two theme-color records and the safe-area viewport setting.
- The skip link is the first item in the browser accessibility tree.
- Page branding is no longer exposed as an `h2` before the page `h1`; Explorer and TOC disclosure labels no longer inject headings into the outline.

## Browser Checks

- Tested the real production build at 320, 375, 640, 800 and 1440 CSS pixels.
- No tested viewport has document-level or main-content horizontal overflow; 640px also exercises the reflow expected from a 1280px layout at 200% zoom.
- Every visible button at all tested widths is at least 44×44px.
- Light mode resolves to `#f4f1e9`, dark mode to `#171914`, and both `theme-color` records update with the manual theme.
- An internal homepage link completed through Quartz SPA navigation; the destination retained one `main`, the route announcer remained present and focus moved to `#main-content`.
- The accessibility snapshot exposes the expected landmark order: skip link, named site-tools aside, named Explorer navigation, main content, named supporting aside and footer.

## Baseline Findings Retained

- Existing content still produces KaTeX Unicode/strict-mode build warnings.
- Node still reports the upstream `punycode` deprecation warning.
- Local browser checks still report the existing external KaTeX `mhchem` initialization error; no F03 script error was observed.
- A real NVDA/VoiceOver walkthrough remains part of the later Q04 WCAG audit; F03 establishes the semantic and focus foundation for that pass.
