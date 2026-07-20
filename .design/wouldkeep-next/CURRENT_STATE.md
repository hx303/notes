# wouldkeep Current State

Last reconciled: 2026-07-18 (Asia/Shanghai)

Working baseline: merged `main` at `a4662b1d163d4d60d7ad0ed291ce4b0eebebc8b6`

Merged foundation PR: [#11](https://github.com/hx303/notes/pull/11)

Merged provider PR: [#12](https://github.com/hx303/notes/pull/12)

Merged production-canary PR: [#13](https://github.com/hx303/notes/pull/13)

Merged settings-persistence PR: [#16](https://github.com/hx303/notes/pull/16)

Merged Wave 2 / migration-normalization PR: [#18](https://github.com/hx303/notes/pull/18)

Merged publication-integrity PR: [#19](https://github.com/hx303/notes/pull/19)

Merged production-operation record PR: [#20](https://github.com/hx303/notes/pull/20)

Merged publication-write ACL hardening PR: [#21](https://github.com/hx303/notes/pull/21)

Merged sidebar-scroll and UX repair PR: [#22](https://github.com/hx303/notes/pull/22)

Merged production ACL operation record PR: [#23](https://github.com/hx303/notes/pull/23)

Merged novice import and refresh-recovery PR: [#24](https://github.com/hx303/notes/pull/24)

Status vocabulary: **complete**, **partial**, **not started**, **not deployed**, **stale status**, **unverified online**.

## 2026-07-17 reconciliation after PR #16

- PR #13 merged the reviewed, public-publication-only DeepSeek canary boundary to `main` as `29b27b57`; production deployment completed with both live gates still off.
- PR #16 merged account and AI settings persistence to `main` as `24536ab5`. AI and profile drafts are account-scoped, survive SPA navigation, reject stale responses, and clear only after a confirmed save.
- Production Supabase contains the A20 runtime-safety migration, imported server-side secrets, and active `ai-write` v4. Database and function live flags remain false, and no paid production canary has run.
- The current baseline passes TypeScript, 197/197 tests, and a production build with 284 Markdown inputs and 1,046 emitted files.
- Existing account/workspace task checkboxes materially understate implemented import, autosave, version, organization, and publication foundations. Remaining work must begin with browser-level acceptance and gap repair, not wholesale reconstruction.
- PR #18 merged the reviewed migration namespace normalization. The separately authorized production ledger-only repair retained the five legacy rows, added the ten exact normalized rows without executing their SQL, and ended with 15 aligned versions and zero pending migrations.
- PR #19 merged the soft-delete/publication-snapshot repair. The separately authorized production deployment applied `20260718001100`; the ledger reached 16 aligned versions and postflight publication, document, and AI invariants passed.
- PR #21 merged the forward-only anonymous publication-write RPC ACL repair as `f949cf55`. The separately authorized production deployment applied `20260718001200`; all three publication write RPCs now deny anonymous/PUBLIC execution, the ledger reached 17 aligned versions, and business/AI invariants were unchanged.
- PR #22 merged the browser-led sidebar scroll, medium-width navigation, admin file-nav, and keyboard repair as `01dc10a9`. The merged baseline passes TypeScript, 217/217 tests, and a production build with 284 inputs and 1,046 outputs.
- PR #23 merged the production ACL operation record and advanced `main` to `a6ef3be6`.
- PR #24 merged the P03/P04 import hardening and refresh-recovery work to `main` as `a4662b1d`. TypeScript, 18/18 focused tests, 229/229 full tests, the 284-input/1,051-output production build, all Vercel checks, and the site-owner browser check passed. Broader DOCX/drag-drop/network/screen-reader/zoom/touch evidence remains P2.
- P05 editor recovery is at implementation checkpoint `c40aa471` from baseline `a4662b1d`. It adds an owner-scoped IndexedDB outbox, interrupted-save recovery, latest-intent coalescing, authoritative acknowledgements, Web Locks/BroadcastChannel coordination, offline local-first open, account/document race guards, safe historical restore, and three explicit conflict actions. Conflict groups now resolve or re-freeze through one IndexedDB transaction; failure injection proves rollback without partial deletion, conflict actions are single-flight, and a newer cross-tab intent refreshes both durable state and the comparison panel. Signed-in Draft-preview and independent code checks exposed two same-owner auth-refresh races: one could return the active editor to the launcher, and the other could replace an active document form with a pending `new` draft. Both are repaired; independent browser acceptance kept the detailed editor active for at least 35 seconds after selection, and independent code re-review found no remaining P0/P1. At exact implementation HEAD, focused 52/52, full 275/275, migration guard, TypeScript, diff check, and the 284-input/1,051-output build pass. Draft-preview save/refresh, offline, conflict-action, and keyboard evidence remains open because the exact deployment lacked the branch alias login session and Chrome control repeatedly timed out; server idempotency and an atomic multi-table save remain separately reviewed forward work.

## Executive status

| Area                            | Status                           | Evidence and remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public discovery redesign       | partial                          | `DiscoverHome`, `MapPage`, `RecentGrowth`, topic/path/search components and routes exist. Old redesign task checkboxes understate the implementation. Production behavior still needs Wave 0 online reconciliation.                                                                                                                                                                                                                                                                 |
| Account and private workspace   | partial                          | Password auth, account/workspace routes, private knowledge bases/documents, editor, tags, links, sources, versions, publication snapshot UI and admin shell exist. A multi-agent hotfix now covers stable auth loading, retry after SDK/network failure, duplicate-submit protection, SPA cleanup, and responsive account/workspace layouts. The 39 unchecked account tasks are stale as a source of truth; Wave 1 must test remaining flows and fix gaps rather than rebuild them. |
| Publication and public snapshot | partial                          | `document_publications`, `publish_document`, `unpublish_document`, `read_published_document`, and `list_public_documents` exist in migrations. Idempotent job/retry/last-success failure semantics still require P01/P02 reconciliation and production verification.                                                                                                                                                                                                                |
| AI consent and data foundation  | complete                         | Default-off settings, zero budget, four AI tables with owner RLS, browser write restrictions, and authenticated mock `ai-write` code exist. Migration deployment, unauthenticated `401`, four real-account RLS assertions, and the signed-in no-model/no-cost response have all been accepted.                                                                                                                                                                                      |
| AI provider preparation         | complete; deployed default-off   | PR #12/#13 merged the server boundary and guarded DeepSeek path. A20, server Secrets, and `ai-write` v4 are deployed; both live gates remain off and no production paid request has run.                                                                                                                                                                                                                                                                                            |
| AI paid/model features          | narrow canary deployed; disabled | Only an authenticated owner's verified public publication snapshot is eligible, and only when both environment and database flags allow it. Client selection/context is ignored. A local synthetic canary passed; production paid canary and broad rollout remain closed.                                                                                                                                                                                                           |
| PR #11                          | complete                         | All three Vercel checks passed; the site owner explicitly approved the merge; GitHub merged it to `main` as `72ea5f96` at 2026-07-16T15:05:24Z.                                                                                                                                                                                                                                                                                                                                     |
| PR #12                          | complete                         | The site owner explicitly approved the merge; GitHub merged it to `main` as `f09eeea5` at 2026-07-16T23:46:41Z.                                                                                                                                                                                                                                                                                                                                                                     |
| Vercel preview                  | complete                         | The signed-in mock result was explicitly confirmed by the site owner before merge.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Cloudflare/production site      | unverified online                | Repository contains `cf_project.json` with project `notes-website` and production branch `main`; no fresh deployment/runtime proof has been collected in this Wave 0 pass.                                                                                                                                                                                                                                                                                                          |

## Verification run on 2026-07-16

- TypeScript: passed (`tsc --noEmit`).
- AI focused tests: 3/3 passed.
- Full Quartz tests: 140/140 passed.
- Static build: passed using bundled Node; 284 Markdown inputs and 1046 emitted files.
- Build warnings: existing untracked-date warnings and LaTeX Unicode warnings; no build failure.
- PR checks: `Vercel Preview Comments`, `Vercel – notes`, and `Vercel – vcdeploy` successful.
- Signed-in mock gateway: the site owner explicitly confirmed the expected fixed safety result, no real model call, and no fee. N00 is complete.

## Account/auth hotfix verification on 2026-07-16

- Implementation: `7f08b1b`; independent QA evidence: `8752958`; both integrated into this branch.
- TypeScript passed; full Quartz suite passed 145/145; static build passed with 284 inputs and 1046 emitted files.
- Independent QA: PASS with no P0/P1 blocker at 1536, 1200, 1024, 800, 375, and 320 CSS pixels, including dark mode and keyboard focus.
- The 1200px account page height dropped from about 2223px to 1141px after removing empty Quartz rails and article-only chrome.
- Mobile account routes have no horizontal overflow, 44px auth-link targets, and no overlapping reading toolbar.
- Remaining P2 verification boundary: a real CDN request hanging for the full 8-second timeout and then recovering could not be injected reliably; source review and regression tests cover failed-cache eviction and in-place retry.

## DeepSeek provider preparation on 2026-07-16

- Implementation: `90d8a7af`; independent review report: `bec6206f`; both based on merged `main` `72ea5f96`.
- Provider interface and DeepSeek adapter use native/injected `fetch`, the fixed official endpoint, `deepseek-v4-flash`/`deepseek-v4-pro` allowlist, thinking disabled, non-streaming output, timeout/caller abort, normalized errors, cache token usage, and no raw provider error detail.
- Capabilities explicitly declare `supportsZeroRetention=false`, `allowsPrivateContent=false`, and provider-managed/unknown retention. The adapter sends neither `store` nor `user_id`.
- Focused tests: 9/9; full Quartz suite: 154/154; TypeScript and static build passed (284 inputs, 1046 outputs). All provider tests use fake `fetch`; no request reached DeepSeek.
- Independent verdict: no P0/P1. P2 before runtime hookup: a server router must enforce the private-content rejection; the capability declaration alone is not an enforcement control.

## A20 runtime-safety preparation on 2026-07-17

- Implementation: `b93d1a3a`; P1 fixes: `8260d96d`; independent review evidence integrated as `214ea59e`.
- The guarded provider now accepts only an authorization value and route document ID. A server authority must verify JWT, ownership, and source, then build the provider request; only a verified public publication snapshot may be classified as `public`.
- DeepSeek rejects private, unknown, malformed, unlisted, draft, free-input, or otherwise unverified scopes before provider execution. Missing usage, invalid cost, cost above reservation, and audit-finalization failure are accounting failures rather than zero-cost success.
- The in-memory boundary covers site/user opt-in, monthly budget, daily requests, concurrency, conservative reservations, and sanitized success/failed/blocked audits, but is explicitly a single-process test reference rather than a production quota store.
- Independent focused verification passed 27/27; commander full suite passed 172/172; TypeScript and static build passed with 284 inputs and 1046 outputs. The first sandboxed build attempt hit a filesystem permission boundary; the identical build passed outside that sandbox. Existing content-date and LaTeX warnings remain non-blocking.
- Production-boundary candidate: `b86376b3`. It adds an owner-RLS-preserving Supabase authority, owner-scoped HMAC-SHA256 audit identifiers, provider/model-bound DeepSeek CNY pricing, default-off service configuration, and service-role-only atomic reserve/finalize RPCs with UTC windows and two-minute leases.
- The final identity/privacy review requires credential-bearing fetches to reject redirects, DeepSeek responses to state the exact reserved model, and the guard to snapshot provider/model/private-content/rate identities before asynchronous work. Final independent verdict: no remaining P0/P1.
- Final local evidence: focused 42/42, full Quartz 187/187, TypeScript, diff-check, and static build passed (284 inputs, 1046 outputs). All provider and Supabase fetches in tests are injected fakes; no real provider call occurred.
- These preparation gates were later completed for the default-off deployment recorded above: non-production RLS/concurrency evidence passed, A20 and `ai-write` v4 were deployed, and server Secrets were configured. Feature-flag enablement, positive budget, any production paid call, and broader content scope remain separately closed.

## DeepSeek live-canary preparation on 2026-07-17

- `agent/ai-live-canary` keeps live mode off unless `AI_LIVE_ENABLED=true`; the database singleton flag, user opt-in, budget, provider/model consent, rate-card version, daily limit, concurrency limit, JWT identity, owner RLS, and public publication snapshot remain authoritative.
- The first live capability is deliberately only whole-publication `rewrite`. The caller's selection/context is ignored and never reaches DeepSeek; private, unlisted, free-input, missing, malformed, or other-user sources are blocked first.
- Focused tests, the full 192-test Quartz suite, TypeScript, diff-check, and the 284-input/1046-output static build passed. Independent review found no P0/P1 for a site-owner, one-request, low-budget canary and explicitly rejected broad rollout.
- After the independent review, one local guarded synthetic-public canary used the key transiently and succeeded on `deepseek-v4-flash` with 13 prompt tokens, 2 completion tokens, and an audited actual cost of 1 CNY fen. No note content was used and the key was not printed, persisted, committed, or imported into Supabase. The CLI was subsequently authenticated and the production boundary deployed default-off; no production paid canary has run.

## Git and worktree reality

- Repository is shallow and its configured fetch refspec tracks only `origin/v4`; `origin/main` and the PR branch were fetched explicitly for reconciliation.
- Existing worktrees must be preserved:
  - `C:/Users/23012/Desktop/wouldkeep/_repo` — `agent/ai-knowledge-assistant-plan`, with untracked `supabase/generated/`.
  - `.../admin-publish` — `agent/admin-editorial-workspace`.
  - `.../work/ai-assistant-foundation` — `agent/ai-assistant-foundation`, clean at reconciliation time.
- Remote `main` was last reconciled at `24536ab5802e315654d3810da334fcd19b804eaf` after PR #16; the earlier PR #11 baseline was `72ea5f96cfaa2601fd96a8923ce2635caa972a9d`.
- Because the local repository is shallow, local merge-base/diff counts against `origin/main` are not authoritative. GitHub's PR mergeability is the current authoritative merge signal until history is deepened.

## Legacy task-file reconciliation

| Task file                                   |    Checkbox count | Interpretation                                                                                                                      |
| ------------------------------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `.design/wouldkeep-redesign/TASKS.md`       | 18 done / 23 open | stale status; many open items have evidence files or implemented components.                                                        |
| `.design/account-knowledge-system/TASKS.md` |  0 done / 39 open | stale status; major account/workspace/database features exist.                                                                      |
| `.design/ai-knowledge-assistant/TASKS.md`   | 11 done / 25 open | foundation and default-off DeepSeek production boundary are reconciled; paid rollout and later AI phases remain intentionally open. |

## Remaining orchestration and production gates

1. Finish N04 only when the full integration/reference/platform/workspace/public worktree set is needed; the DeepSeek implementation/review worktrees already use the merged baseline and do not disturb occupied worktrees.
2. Complete fresh Cloudflare/production behavior checks and a production operation record before any further migration, Edge Function replacement, Secret change, feature-flag enablement, or paid call.
3. Treat the production migration ledger as normalized at 17 aligned versions with zero pending migrations. Any new business change must be a reviewed forward migration with a version greater than `20260718001200` and requires separate production deployment approval.
