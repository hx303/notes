# R02 Evidence — Consolidate persistent reading tools

## Outcome

Theme, font size and focus mode now form one labeled reading-settings group on desktop and one progressive-disclosure reading sheet on mobile. Existing preference keys remain compatible, every state is expressed in text and ARIA, and a single reset restores system theme, 100% text size and normal reading mode.

## Implementation

- Added `ReadingTools` and `MobileReadingTools` with a native mobile `dialog`.
- Reworked `Darkmode`, `FontSize` and `ReaderMode` into labeled 44px controls with explicit values and pressed/disabled states.
- Preserved `theme`, `content-scale` and `reader-mode` storage keys.
- Added `readingpreferencesreset` and `fontsizechange` typed events.
- Removed the former article zoom/locked-center horizontal-scroll behavior.
- Added mobile safe-area spacing, body scroll lock, backdrop close, close-button focus return, SPA cleanup and reduced-motion handling.
- Closing the mobile sheet is coordinated with focus-mode activation, and the persistent focus exit control uses the shared toolbar layer.

## Verification

- Full automated suite: **91/91 passing** after adding three R02 tests.
- Production build: **success**, 260 content files emitted to 1014 public files.
- TypeScript: no R02 errors. Project check remains blocked only by the recorded baseline errors in `citations.ts`, `latex.ts` and `ofm.ts`.
- Browser, desktop 1440×900: named group; all controls at least 44px; theme state persists through reload; no duplicate IDs or horizontal overflow.
- Browser, mobile 390×844: named native bottom sheet; scroll lock and focus return; all controls at least 44px; font increase reports 106% without overflow; focus activation closes the sheet and exposes an operable 44px exit; reset restores system theme, 100% and focus off.

## Known baseline observations

- Build output contains existing content-level LaTeX compatibility warnings.
- Browser console contains existing `__defineMacro` errors from the current math integration; R02 controls themselves completed all tested interactions.
