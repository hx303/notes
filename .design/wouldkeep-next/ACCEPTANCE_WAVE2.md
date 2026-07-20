# Wave 2 acceptance baseline

Audited: 2026-07-17. Baseline: `main` merge `24536ab5` / branch `agent/wave2-orchestration`.

Local evidence: focused account/settings tests 12/12, full suite 197/197, TypeScript, diff check, and production build (284 inputs / 1,046 outputs) pass. Unit and source-contract tests do not replace real-browser, database, or production evidence.

| Priority | Area                        | Current verdict                                                                          | Release evidence still required                                                                                                                     |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Supabase migration history  | Fail/block deployment: duplicate prefixes `20260712` x3, `20260714` x3, `20260716` x2    | Forward-only filename/ledger mapping, clean-project replay, linked dry-run, rollback/forward-fix record; do not change already-applied SQL          |
| P0 gate  | AI live safety              | Code pass; production live gates are recorded off                                        | Read back database and function flags immediately before any future live operation                                                                  |
| P1       | AI settings persistence     | Unit/source pass                                                                         | Real Chrome SPA leave/return, refresh, server readback, failed save, account switch, stale response, and two-submit scenarios                       |
| P1       | Login stability             | Unit/source pass                                                                         | New-email registration/verification/recovery, return URL, logout/login, real CDN 8-second stall then in-place recovery                              |
| P1       | Publication privacy         | Fail/blocked: no non-AI SQL test matrix; soft-deleted source may leave a public snapshot | Owner/other/anonymous across private/unlisted/public, soft delete, revision conflict, unpublish, and cross-account denial                           |
| P1       | Publication reliability     | Partial: transactional upsert preserves one snapshot                                     | Idempotent retry, failure state, last-success preservation, preview, rollback, and unpublish integration evidence                                   |
| P1       | Editor recovery             | Partial: durable outbox, serialized saves, two-tab coordination, revision conflicts, explicit recovery choices, token-safe cleanup, and fail-closed retry are implemented | Deployed-preview offline replay, completed two-tab conflict choices, retry interaction, full keyboard traversal, and server idempotency evidence |
| P1       | Narrow/mobile accessibility | Static pass                                                                              | 320/375/800 widths, landscape, soft keyboard, 200% zoom, keyboard, screen-reader smoke, and axe-equivalent evidence                                 |
| P1       | Browser automation          | Fail: no Playwright/Cypress/axe coverage in package                                      | Install an isolated E2E harness and make critical auth/settings flows repeatable                                                                    |
| P2       | Desktop density             | Static pass                                                                              | 1,200/1,536 screenshots and task review confirming remaining whitespace is intentional                                                              |
| P2       | Other settings              | Partial                                                                                  | Profile text survives navigation; verify theme/font/reader settings and decide whether unsaved avatar crop should persist                           |

## Ordered release gates

1. Normalize migration versions and prove database history safety.
2. Add publication owner/other/anonymous and soft-delete SQL evidence.
3. Add real-browser settings/login/new-user acceptance.
4. Add offline/two-tab/save-concurrency and complete version restoration.
5. Add multi-viewport, zoom, keyboard, and accessibility evidence.
6. Only then reconsider a production paid AI canary under a new explicit approval.

## Immediate finding resolved in this branch

The AI settings page previously said that no paid model/key was connected. That was stale after the DeepSeek adapter and server secret deployment. The copy now states that DeepSeek is configured, both live gates remain off, positive budget alone does not enable calls, and private notes are not currently sent to DeepSeek. A regression assertion prevents the old wording from returning.
