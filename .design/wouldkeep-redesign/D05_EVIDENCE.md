# D05 — First end-to-end learning path evidence

Completed 2026-07-12.

## Delivered

- Added a typed `LearningPath` schema with published/draft/archived status, maintenance state, audience, outcome, estimated time, prerequisites, ordered core steps and optional branches.
- Published `从物理到光学建模` at `/paths/physics-to-optical-modeling/` as a curated sequence rather than a folder-order listing.
- The path contains five resolved core steps spanning electromagnetic fields, eigenvalues, RCWA/TMM concepts, TMM boundaries and a measurement application.
- Added one explicitly optional COMSOL branch after the RCWA overview; skipping it does not block the main line.
- Each step exposes position, duration, maturity, topic/type context, purpose and a concrete “完成这一站后” outcome.
- Missing targets render an honest unresolved state; the production path currently has zero missing targets.
- Added path-position context back into articles. Core articles show `第 n 个节点 · 共 5 个`; legacy/unstructured branch articles still show `可选分支`.
- Added path maintenance and last-reviewed signals so curated paths can be maintained as living knowledge assets.

## Content and relation verification

- Path page: 5 main steps, 1 optional branch, 0 missing targets, exactly 1 H1.
- RCWA article: links back to the path and displays `第 3 个节点 · 共 5 个`.
- COMSOL article: links back to the path and displays `可选分支`, including when the article has no structured knowledge metadata.
- All six configured article targets resolve to generated public pages.

## Automated verification

- Full suite: 133/133 passed across 44 suites.
- D05 targeted coverage includes schema normalization/fail-closed behavior, ordered path rendering, core/optional membership derivation and article context for both structured and legacy articles.
- Production build: 269 Markdown inputs parsed and 1023 files emitted successfully.
- Prettier checks pass for the D05 component and test changes.
- TypeScript reports no D05-specific diagnostics; existing baseline diagnostics remain in citations.ts, latex.ts and ofm.ts.

## Browser verification limitation

- The local preview server started successfully and returned HTTP 200 from the shell.
- The in-app Browser refused localhost navigation under its current URL policy, so visual/browser assertions could not be completed in this turn. No policy bypass was attempted.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
