# Handoff: `agent/ai-deepseek-provider`

- Role: AI provider implementation
- Model / reasoning effort: Codex, high
- Worktree: `C:/Users/23012/Documents/Codex/2026-07-16/c-users-23012-desktop-wouldkeep/worktrees-next/ai-deepseek-provider`
- Branch: `agent/ai-deepseek-provider`
- Baseline SHA: `72ea5f96cfaa2601fd96a8923ce2635caa972a9d`
- Current SHA: recorded after commit in commander handoff
- Demonstrable slice: pluggable AI provider contract and fully offline-tested DeepSeek adapter, with no runtime hookup or paid call
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

## Changed files and scope

- Allowed paths changed: `supabase/functions/_shared/ai-provider.ts`, `supabase/functions/_shared/deepseek-provider.ts`, `supabase/functions/_shared/ai-runtime-safety.ts`, `supabase/functions/README.md`, `quartz/components/deepseekProvider.test.ts`, `quartz/components/aiRuntimeSafety.test.ts`, and this handoff.
- Non-authorized paths touched: none by this agent. Commander-owned design documents were concurrently modified in this worktree and are intentionally excluded from this slice's commit.
- Commander-owned hookup requested: none. A later approved server router must enforce content classification, consent, feature flag, zero-budget release, audit, concurrency, and quota gates before invoking this adapter.

## Evidence

- Commands run and raw result summary: bundled Node `tsc --noEmit` passed; post-review A20 focused tests passed 18/18. Before this follow-up, DeepSeek focused tests passed 9/9, full Quartz suite passed 170/170, and `git diff --check` passed; root owns the next full-suite run.
- Static build: final A20 candidate passed with 284 Markdown inputs and 1046 emitted files. Existing untracked-date, LaTeX Unicode, and Node deprecation warnings remain non-blocking.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI was changed.
- Security evidence (owner / other user / anonymous): all tests are offline. Provider tests use injected fake fetch. A20 tests prove default-off/zero-budget, authority/JWT-context failure, ignored body owner/scope fields, publication-snapshot proof, private/unknown rejection before invocation, atomic concurrency, daily/monthly gates, trusted cost estimation, missing-usage/conservative accounting, all terminal audit states, and absence of raw input/output/error content from audit records.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: implements a dormant provider seam under D-005 without enabling paid/model behavior.
- Contract changes requested: production integration must implement `AiRuntimeContextAuthority` using verified JWT + ownership + publication snapshot reads, replace the in-memory reference with a service-role-only atomic reserve/finalize RPC, and add a version-controlled worst-case rate card. No live route uses these controls yet.
- Types, fixtures, and tests synchronized: provider types and 9 fake-fetch tests are included; no database fixture or migration was needed.

## Risk and recovery

- Known risks: DeepSeek has no documented API zero-retention guarantee and its context cache is on by default. The in-memory boundary is not safe for production multi-instance quotas. Database RPC, rate card, config storage, RLS verification, and deployment evidence remain outstanding.
- Rollback or forward-fix path: revert the single slice commit; the deployed mock gateway is unaffected. Forward integration should add budget/audit/consent/privacy gates before any secret loader or provider invocation.
- Blockers: real invocation remains deliberately blocked by missing secret, default-off feature flag, zero budget, absent audit/quota/router gates, and required privacy approval.
- Next task prerequisites: commander review and integration; later explicit user approval for key configuration and a separately reviewed real-call slice.
