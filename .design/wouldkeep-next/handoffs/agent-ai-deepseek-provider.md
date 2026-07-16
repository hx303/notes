# Handoff: `agent/ai-deepseek-provider`

- Role: AI provider implementation
- Model / reasoning effort: Codex, high
- Worktree: `C:/Users/23012/Documents/Codex/2026-07-16/c-users-23012-desktop-wouldkeep/worktrees-next/ai-deepseek-provider`
- Branch: `agent/ai-deepseek-provider`
- Baseline SHA: `72ea5f96cfaa2601fd96a8923ce2635caa972a9d`
- Implementation SHA: `b86376b320c0ab41adfa95e8acdc4671199988bd`; earlier authority fix `8260d96dfceeac464c4c03addd745753800feca5`, earlier review evidence integrated at `214ea59e`
- Demonstrable slice: pluggable DeepSeek adapter plus a dormant, fully offline-tested production authority/quota boundary, with no runtime hookup or paid call
- Approved research brief (or why none is needed): commander supplied the reviewed current DeepSeek endpoint, model, error, retention, and thinking contracts for this bounded adapter slice.

## Completed

- Added a provider-neutral request/result/capability/error contract.
- Added a non-streaming DeepSeek adapter fixed to the official chat-completions endpoint.
- Restricted models to `deepseek-v4-flash` (default) and `deepseek-v4-pro`; legacy names fail closed.
- Disabled thinking for ordinary writing; omitted `store` and `user_id`.
- Normalized documented HTTP errors, timeout, caller cancellation, network failure, empty/truncated/filtered output, and resource exhaustion.
- Exposed response ID and prompt/completion/cache token usage for later budget/audit work.
- Preserved `ai-write` exactly as the authenticated fixed mock; no provider hookup, secret read, deployment, or real request was made.
- Added the dormant A20 `AiQuotaAuditBoundary` and `GuardedAiProvider` control plane with an atomic in-memory reference implementation.
- Enforced site/user opt-in, private/unknown scope rejection, zero/monthly budget, daily request, concurrency, conservative reservation, and accounting-finalization gates before provider execution.
- Ensured success, failure, and blocked audit records contain hashes and bounded metadata only, never prompts, bodies, outputs, or raw upstream errors.
- Replaced caller-supplied owner/scope/provider input with an injected server authority that verifies context and constructs the provider request; only a proven public publication snapshot is eligible for DeepSeek.
- Made missing provider token usage a conservative `usage_missing` accounting failure charged at the reserved estimate.
- Added a server-only Supabase authority that validates the user session and uses the same user JWT/publishable key for publication reads so authenticated owner RLS proves isolation; prompts are built only from a verified current public publication snapshot.
- Added an injected owner-scoped HMAC-SHA256 audit hash covering schema/version and generation controls; no prompt is stored in the audit RPC payload.
- Added a versioned DeepSeek CNY rate card bound to the provider/model identity, with complete wire-JSON/framing reservation and strict actual-usage/model validation.
- Added a forward-only migration with default-off runtime config, service-role-only atomic reserve/finalize RPCs, two-minute leases, UTC quota windows, and browser write denial while preserving owner audit reads.
- Added a rollback-only SQL verification script for service-role grants, publication/audit RLS, default-off, explicit provider/model consent, concurrency, leases, private/unknown blocking, NULL/rate mismatch, and actual/reserved accounting.

## Changed files and scope

- Allowed paths changed in the current A20 slice: `supabase/functions/_shared/ai-runtime-safety.ts`, `supabase/functions/_shared/ai-request-hmac.ts`, `supabase/functions/_shared/deepseek-rate-card.ts`, `supabase/functions/_shared/supabase-ai-runtime.ts`, `supabase/migrations/20260717_ai_runtime_safety.sql`, `supabase/tests/20260717_ai_runtime_safety.sql`, `supabase/functions/README.md`, `quartz/components/aiRuntimeSafety.test.ts`, `quartz/components/aiRuntimeProduction.test.ts`, and this handoff.
- Non-authorized paths touched: none by this agent. Commander-owned design documents were concurrently modified in this worktree and are intentionally excluded from this slice's commit.
- Commander-owned hookup requested: none. A later approved server router must enforce content classification, consent, feature flag, zero-budget release, audit, concurrency, and quota gates before invoking this adapter.

## Evidence

- Commands run and raw result summary for the final candidate: bundled Node `tsc --noEmit` passed; focused provider/runtime/production tests passed 42/42; full Quartz tests passed 187/187; `git diff --check` passed. Independent P1 re-review repeated the focused/type/diff gates and returned no remaining P0/P1; static build passed with 284 inputs and 1046 outputs.
- Static build: the earlier dormant-control slice passed with 284 Markdown inputs and 1046 emitted files; the current production-boundary candidate has not rerun the static build because the requested candidate gate is focused tests + TypeScript. Existing untracked-date, LaTeX Unicode, and Node deprecation warnings remain non-blocking.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI was changed.
- Security evidence (owner / other user / anonymous): all TypeScript tests are offline and use injected fake fetch. Static tests cover publishable-key/user-JWT RLS reads, service-secret RPC separation, redirect rejection, generic error handling, public-snapshot proof, HMAC owner/control binding, provider/model/rate identity binding, complete wire/framing rate arithmetic, strict RPC payloads, and absence of prompt/output fields. The rollback-only SQL script asserts service-role-only execution, authenticated owner-only publication/audit SELECT, anonymous/other-owner denial, browser config denial, provider-consent mismatch, concurrency, lease expiry, NULL/rate mismatch, private/unknown rejection, and actual/reserved accounting; it has not yet been executed against Supabase.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: implements a dormant provider seam under D-005 without enabling paid/model behavior.
- Contract changes requested: production candidates now exist for `AiRuntimeContextAuthority`, service-role atomic reserve/finalize RPCs, HMAC audit identifiers, and the version-controlled worst-case rate card. No live route uses these controls yet.
- Types, fixtures, and tests synchronized: provider/runtime types, 42 focused offline tests, a forward migration, and rollback-only SQL verification are included.

## Risk and recovery

- Known risks: DeepSeek has no documented API zero-retention guarantee and its context cache is on by default. The production boundary and migration have not been exercised against a real Supabase project; SQL syntax, grants, RLS behavior, contention, lease cleanup, and existing-row compatibility require non-production verification. The UTF-8 prompt upper bound is deliberately conservative but must be re-reviewed if prompt construction or model tokenization changes.
- Rollback or forward-fix path: revert the single slice commit; the deployed mock gateway is unaffected. Forward integration should add budget/audit/consent/privacy gates before any secret loader or provider invocation.
- Blockers: real invocation remains deliberately blocked by missing secret, default-off feature flag, zero budget, no `ai-write` hookup, no migration deployment, and required privacy approval.
- Next task prerequisites: commander integration/full verification, non-production SQL execution evidence, then later explicit user approval for key configuration and a separately reviewed real-call slice.
