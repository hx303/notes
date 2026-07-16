# F01 Verification: Stable URL Migration

Date: 2026-07-10

## Implemented

- Added build-time `canonicalSlug` discovery, validation and collision detection.
- Kept physical Markdown paths as automatic one-hop aliases when a canonical URL is assigned.
- Rebased internal links and local resources from their physical source location to the rendered canonical page.
- Added stable `commentKey` support with fallback to the previous file-path key.
- Added `audit:urls` and generated `URL_INVENTORY.json` for all public Markdown records.
- Migrated `科研项目/RCWA从零开始学习指南.md` to `notes/rcwa-from-zero` without moving the source file.

## Automated Checks

- Unit tests: 74 passed, 0 failed; 5 tests cover canonical format, mapping and collisions.
- Prettier: all F01 TypeScript and package files checked successfully.
- `git diff --check`: passed.
- TypeScript: F01 introduced no remaining errors. The repository still has four pre-existing errors in `FontSize.tsx`, `citations.ts`, `latex.ts` and `ofm.ts`.

## Build Checks

- Full production build: 256 Markdown inputs, 1010 emitted files, completed successfully with two parser workers.
- URL inventory: 256 records, 1 migrated, 256 legacy URLs covered.
- Canonical page emitted: `notes/rcwa-from-zero.html`.
- Legacy file-path redirect emitted and points directly to `../notes/rcwa-from-zero`.
- Existing aliases `RCWA从零开始` and `光学建模入门` also redirect directly to the canonical page.
- Canonical, Open Graph URL, Twitter URL, body slug and stable comment key all use the expected identity.
- `contentIndex.json` contains `notes/rcwa-from-zero` and does not contain the legacy article slug.
- `sitemap.xml` contains the canonical slug and does not contain the legacy article slug.
- An isolated RSS build contains the canonical URL and does not contain the legacy URL.

## Baseline Warnings Retained

- Existing content produces multiple KaTeX Unicode/strict-mode warnings.
- Node reports the upstream `punycode` deprecation warning.
- These warnings did not fail the build and are outside F01; they remain candidates for later resilience work.
