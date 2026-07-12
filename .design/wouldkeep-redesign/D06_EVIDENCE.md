# D06 — Path index and initial curated set evidence

Completed 2026-07-12.

## Delivered

- Replaced the `/paths/` placeholder with a generated path index that explains the editorial contract and lists each curated path with status, main-line count, estimated time and target audience.
- Published three complete paths:
  - `从物理到光学建模` — 5 core steps plus 1 optional branch.
  - `从极限到微分方程` — 4 core steps from limits through a first-order differential equation.
  - `用线性代数理解模式与变换` — 3 core steps from systems and elimination through rank and eigenvalues.
- The index sorts published paths before paths marked `建设中`, preserving a clear place for future approved paths without presenting empty pages as finished work.
- Reused the D05 LearningPath schema and detail component; the new paths inherit the same target resolution, maintenance, prerequisites and article position backlinks.

## Generated output verification

- Production build parsed 271 Markdown inputs and emitted 1025 files.
- `/paths/` index is generated with exactly 3 path entries.
- `从物理到光学建模`: 5 resolved steps, 0 missing targets.
- `从极限到微分方程`: 4 resolved steps, 0 missing targets.
- `用线性代数理解模式与变换`: 3 resolved steps, 0 missing targets.
- All path pages have the same ordered editorial rail and maintenance metadata contract.

## Automated verification

- Full suite: 134/134 passed across 45 suites.
- Added a D06 path-index component test covering published and `建设中` statuses, counts, estimated time and audience metadata.
- D06 component/content files pass Prettier after formatting in the staging workspace and synchronization.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
- In-app browser localhost navigation remains blocked by the current Browser Use URL policy; static output and shell HTTP checks were used for this turn.
