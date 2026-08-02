# wouldkeep Decision Log

Append new entries; never rewrite prior decisions. Each reversal must cite new evidence and its affected contracts.

## D-001 — Reconcile before rebuilding

- Date: 2026-07-16
- Question: Should unchecked legacy task boxes be treated as missing implementation?
- Options: rebuild from task files; inspect code/deployment evidence first.
- Decision: inspect and classify reality first. Legacy boxes are planning history, not authoritative state.
- Reason: public discovery, workspace, organization, source/version, publication, admin, and AI foundation code already exist.
- Impact: Wave 1 tasks are gap-finding vertical slices, not greenfield rewrites.
- Re-evaluate when: a route or contract is proven absent in code and online behavior.

## D-002 — Serial integration with isolated worktrees

- Date: 2026-07-16
- Question: How should parallel work be integrated?
- Options: all agents edit one checkout; isolated worktrees with a serial merge queue.
- Decision: one branch/worktree per agent, and only one functional branch in verification at a time.
- Reason: account, layout, and folder-routing files are high-conflict hotspots.
- Impact: shared hookups are commander-owned; feature agents report requested hookups in handoffs.
- Re-evaluate when: file ownership can be proven non-overlapping and integration checks remain stable.

## D-003 — Preserve the current Quartz visual system

- Date: 2026-07-16
- Question: Introduce another heavy UI framework?
- Decision: no. Continue with Quartz 4.5.2, Preact, TypeScript, and SCSS.
- Reason: the product already has a coherent component/token system and static-first delivery.
- Impact: new dependencies require commander approval, size/license evidence, and a reuse analysis.
- Re-evaluate when: a required capability cannot be implemented safely with the current stack.

## D-004 — Public readers consume snapshots, not private source rows

- Date: 2026-07-16
- Question: How can public discovery expose account-authored knowledge?
- Decision: public/unlisted reads consume a whitelisted publication snapshot; private `documents` remain owner-scoped.
- Reason: this minimizes accidental private-field exposure and allows revocation.
- Impact: author pages and public discovery must depend on the publication contract, not broaden document RLS.
- Re-evaluate when: versioned public snapshots gain a separately reviewed contract.

## D-005 — AI remains consent-first and cost-closed

- Date: 2026-07-16
- Question: When may real model calls begin?
- Decision: keep AI disabled by default, monthly budget at zero, no model secret, and only the fixed mock gateway until signed-in validation and later budget/audit gates pass.
- Reason: private knowledge, cross-account isolation, and cost require explicit proof before model connectivity.
- Impact: AI output cannot overwrite or publish content; later suggestions require preview, explicit acceptance, and base-version checks.
- Re-evaluate when: N00, A20, production snapshot, and user approval are complete.

## D-006 — Prepare DeepSeek behind a provider boundary without enabling calls

- Date: 2026-07-16
- Question: How should the first real-model API be prepared after the mock gateway is accepted?
- Options: wire DeepSeek directly into `ai-write`; add a provider adapter and keep the runtime mock-only; add a general SDK dependency.
- Decision: add a small server-only provider interface and a first-party DeepSeek Chat Completions adapter, but do not call it from `ai-write`, configure a key, deploy a function, or enable paid traffic in this slice.
- Reason: the site owner requested DeepSeek-first support, while A20 budget/audit controls and the production safety snapshot are still incomplete. Separating adapter readiness from runtime enablement preserves the accepted zero-cost gateway.
- Current official contract: `https://api.deepseek.com/chat/completions`, Bearer authentication, `deepseek-v4-flash` as the default economical model, optional `deepseek-v4-pro`; legacy `deepseek-chat` and `deepseek-reasoner` are scheduled for deprecation on 2026-07-24.
- Privacy decision: the current DeepSeek endpoint reference does not document an OpenAI-style `store:false` request field or a guaranteed zero-retention capability; its disk context cache is enabled by default and unused entries are usually cleared only after hours to days. The adapter therefore declares `supportsZeroRetention=false`; private content must not be routed to it without a separately reviewed data-processing decision.
- Impact: provider code must be fetch-injected and testable without network access, normalize provider errors, enforce timeout/abort, and never expose a secret to Quartz/browser code, logs, or responses. Existing mock response and API contract remain unchanged.
- Re-evaluate when: A20 is complete, a production operation record exists, the site owner supplies the key through a Function Secret, and a separate live-call/deployment approval is granted.
- Official sources checked: [API quick start](https://api-docs.deepseek.com/), [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/), [error codes](https://api-docs.deepseek.com/quick_start/error_codes/), [context caching](https://api-docs.deepseek.com/guides/kv_cache), and [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html?locale=en_US).

## D-007 — Server-authoritative AI context and conservative accounting

- Date: 2026-07-17.
- Question: May a future AI route trust caller-supplied owner IDs, visibility labels, prompts, or incomplete provider usage when enforcing privacy and budget controls?
- Decision: no. A server authority must verify the JWT, ownership, source, and publication snapshot, then construct the provider request. Only a verified public publication snapshot may be sent to the current DeepSeek adapter. Missing usage or accounting inconsistencies fail closed and conservatively consume the reserved cost.
- Reason: independent review showed that UUID-shape validation and a caller-declared `public` label could otherwise borrow another owner's quota or bypass the private-content gate; missing usage could otherwise release a paid request as zero-cost success.
- Impact: the dormant guard accepts authorization plus route document identity, not owner/scope/prompt assertions. Production still requires a real Supabase authority, service-role-only atomic quota RPC, a versioned worst-case rate card, and database/RLS/failure evidence.
- Re-evaluate when: a provider offers an independently verified zero-retention contract or a separately approved private-data processing agreement changes the eligible content scope.

## D-008 — Prepare the production A20 boundary without authorizing rollout

- Date: 2026-07-17.
- Question: May the real Supabase quota, audit, authority, and pricing boundary be implemented before a DeepSeek key or live route is authorized?
- Decision: yes, as dormant code only. Add a forward migration, service-role-only atomic reserve/finalize RPCs, default-off runtime config, owner-RLS publication authority, owner-scoped HMAC identifiers, and a versioned worst-case DeepSeek CNY rate card; do not load a key, change `ai-write`, deploy, enable the flag, raise a budget, or make a real request.
- Reason: the security controls can be reviewed and tested offline without exposing private content or creating cost, while deployment and live-call authority remain separate explicit gates.
- Security decision: publication reads use the same user JWT and publishable key after JWT verification so owner RLS is not bypassed; the service secret is used only for quota/audit RPCs. Credential-bearing fetches reject redirects. Provider/model/rate identities are snapshotted and every successful response must explicitly match the reserved model.
- Evidence: implementation `b86376b3`; independent verdict no remaining P0/P1; focused 42/42, full 187/187, TypeScript, diff-check, and static build passed with only injected fake fetches.
- Impact: A20 production-boundary code is locally complete but not production-proven. Non-production migration/RLS/two-session concurrency evidence and an operation record are mandatory before any deployment proposal.
- Re-evaluate when: staging evidence is complete and the site owner separately approves deployment, secret configuration, runtime hookup, feature-flag enablement, budget, and a real call.

## D-009 — Limit the first live DeepSeek path to an owner public-snapshot canary

- Date: 2026-07-17.
- Question: After A20 local database validation and explicit deployment/paid-call approval, what is the smallest safe live route?
- Decision: connect only `rewrite` for a JWT-authenticated owner's verified `public` publication snapshot. Keep both the Edge Function environment switch and authoritative database switch off by default. Ignore caller selection/context and never route private, unlisted, draft, free-input, unknown, or other-user content to DeepSeek.
- Reason: DeepSeek does not declare zero retention, while the publication snapshot is already the reviewed public data boundary. The narrow route exercises identity, RLS, quota, audit, price, provider, and model controls without widening private-data processing.
- Evidence: focused and full tests, TypeScript, diff-check, static build, and independent P0/P1 review passed on `agent/ai-live-canary`.
- Impact: this is a site-owner, single-request, low-budget canary only. The UI does not yet offer DeepSeek consent, `base_version` is not bound to publication `source_revision`, and the live result must not be wired into selection replacement or automatic writeback.
- Re-evaluate when: production Supabase migration history/backup is captured, the migration and function are deployed with live flags off, secret configuration succeeds, and the canary operation record is complete.

## D-010 — Preserve removable relationship tombstones while hardening writes

- Date: 2026-07-21.
- Question: Should a soft-deleted relationship endpoint hide or destroy the existing link, and where must tenant/library integrity be enforced?
- Decision: keep the existing link owner-readable and owner-deletable so the editor can show a title-free removable tombstone. Reject every insert or update unless both endpoints are live, owned by the link owner, and in the same knowledge base. Enforce this in both pre-write UI validation and a locked database trigger that also covers service-role writes.
- Reason: silently hiding the row traps users who need to remove it, while relying on browser validation alone permits forged cross-owner or cross-library REST writes.
- Impact: P06 includes forward migration `20260721000100`, command-specific owner RLS, anonymous denial, owner/other/anon/service-role verification, same-library candidate filtering, and fail-before-core-write relationship checks. The migration remains a separate production approval gate.
- Re-evaluate when: document restoration semantics or a reviewed relationship-history model requires a different tombstone lifecycle.

## D-011 — Keep the tag pause continuous with a transaction-local `00150` permit

- Date: 2026-08-02.
- Question: How can `20260722000150` update six legacy tags while production tag writes remain continuously paused?
- Decision: keep both ALWAYS statement triggers active and add one owner-only, security-invoker helper that opens a transaction-local temporary permit only after the migration backend holds exact `SHARE ROW EXCLUSIVE` locks on both tag relations. The trigger recognizes the exact permit only for statement-level `BEFORE UPDATE` on `public.tags` in the same backend, transaction, session user, invoker, and table owner. The migration closes the permit before completion.
- Reason: temporarily disabling the hard pause creates an application-write race. A narrowly catalog-validated permit preserves continuous exclusion and remains unavailable to ordinary roles, forged temporary tables, security-definer indirection, other operations, and `document_tags`.
- Atomicity decision: pinned Supabase CLI `db push` executes every statement in one migration and its ledger insert in one implicit batch transaction. Data and the `00150` ledger row therefore commit or roll back together. Normal deployment never repairs the ledger; any observed mixed state is blocking and keeps the pause active.
- Evidence: static migration/gate contracts, disposable spoof/ACL/operation matrix, and the sealed PostgreSQL 17 flow. Official implementation references: [Supabase `db push`](https://supabase.com/docs/reference/cli/supabase-db-push) and [`MigrationFile.ExecBatch`](https://github.com/supabase/cli/blob/bd0d25023ed2/pkg/migration/file.go).
- Impact: the deployment window must use the isolated exact-20-migration snapshot, repeat fresh backups and preflight, apply only `00150`, prove the exact 20/20 ledger and canonical fingerprints while the pause remains active, then run the reviewed disable operation. `00200` remains a later gate.
- Re-evaluate when: the migration runner stops providing batch transaction atomicity, the tag ownership model changes, or another migration needs a separately named permit.
