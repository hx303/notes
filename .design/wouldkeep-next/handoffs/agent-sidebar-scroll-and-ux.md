# Handoff: `agent/sidebar-scroll-and-ux`

- Role: integration commander with delegated real-browser UX acceptance.
- Model / reasoning effort: Codex primary; browser acceptance delegated after explicit user request.
- Worktree: `worktrees-next/main-after-pr18`.
- Branch: `agent/sidebar-scroll-and-ux`.
- Baseline SHA: `f949cf554e7a252f31199012f2d41028a03363d7` (merged PR #21).
- Current functional SHA: `64e6d1fc`.
- Demonstrable slice: bounded side-rail scrolling, compact medium-width workspace navigation, and stable/keyboard-operable admin file navigation.
- Approved research brief: no external research was needed; the user requested browser-led diagnosis and the implementation follows the existing wouldkeep design context.

## Completed

- Reproduced the production admin scroll problem at 1050×707: the body and main shell are locked, while only the 292px-wide file pane accepts vertical wheel input.
- Measured 53 folders and 260 documents eagerly expanded into a 13,743px scroll surface.
- Added explicit flex min-size and dynamic-viewport scroll boundaries to the admin shell, Quartz side rails, and sticky workspace navigation, with flowing-layout resets.
- Changed admin folders to collapsed-by-default disclosure, retained automatic opening for selected/recent files, added a visible scrollbar, touch pan containment, and Enter/Space folder control.
- Fixed filtered-file DOM identities and stale recent-file indices by using real indices and path lookup.
- Fixed incomplete HTML escaping in the admin file list.
- Reworked the 1180px-and-below workspace navigation from a 347px-tall stacked block to one compact row with a horizontally scrollable primary link strip; mobile returns to one column.
- Reconciled the merge queue and current-state record through merged PR #21 while preserving the separate not-deployed status of migration `20260718001200`.

## Changed files and scope

- Allowed paths changed: `static/admin/index.html`, `static/admin/admin.css`, `quartz/styles/base.scss`, `quartz/components/styles/accountPage.scss`, one new static regression test, and wouldkeep-next status/handoff documents.
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none; this branch is commander-owned.

## Evidence

- Commands run and raw result summary:
  - Focused sidebar/account stability tests: 11/11 pass.
  - TypeScript: pass.
  - Full Quartz suite: 217/217 pass across 45 suites.
  - Production build: pass with 284 Markdown inputs and 1,046 emitted files.
  - `git diff --check`: pass.
- UI evidence:
  - Production admin at 1050×707, DPR 1.875: `body` and `#mainUI2` fixed to the viewport with hidden overflow; `#sidebarFiles` measured about 292×532 with `scrollHeight=13743`, `clientHeight=532`, and wheel input working only while the pointer stayed inside the pane.
  - Production workspace at 1050×707: no horizontal overflow and normal page scrolling, but the static workspace navigation measured 929×347 and consumed about 49% of the viewport before the primary task.
  - Two delegated browser sessions were interrupted by the platform's selected-model capacity limit after returning the evidence above; final preview regression remains a PR gate.
- Security evidence: no production data, account role, AI preference, budget, Secret, or publication was changed by browser acceptance.
- Migration or Edge Function deployed to production: **No**. Migration `20260718001200` remains not deployed.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; stable routes, publication/AI boundaries, and storage contracts are unchanged.
- Types, fixtures, and tests synchronized: `sidebarScrollStability.test.ts` covers inline-script syntax, bounded scroll containers and resets, medium/mobile workspace navigation, collapsed admin layout, keyboard disclosure, and stable file identity.

## Risk and recovery

- Known risks: final visual behavior must still be confirmed on a deployment/preview because production does not yet contain this branch.
- Rollback or forward-fix path: revert the UI slice or adjust the forward CSS/DOM behavior; no data rollback is involved.
- Blockers: none for PR creation; merge still requires explicit user authorization.
- Next task prerequisites: publish a PR, wait for preview checks, run browser regression against the preview, then request merge approval. Production deployment of `20260718001200` remains a separate authorization gate.
