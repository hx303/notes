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

## Changed files and scope

- Allowed paths changed: `supabase/functions/_shared/ai-provider.ts`, `supabase/functions/_shared/deepseek-provider.ts`, `supabase/functions/README.md`, `quartz/components/deepseekProvider.test.ts`, and this handoff.
- Non-authorized paths touched: none by this agent. Commander-owned design documents were concurrently modified in this worktree and are intentionally excluded from this slice's commit.
- Commander-owned hookup requested: none. A later approved server router must enforce content classification, consent, feature flag, zero-budget release, audit, concurrency, and quota gates before invoking this adapter.

## Evidence

- Commands run and raw result summary: bundled Node `tsc --noEmit` passed; DeepSeek focused tests passed 9/9; full Quartz tests passed 154/154; `git diff --check` passed.
- Static build: passed with 284 Markdown inputs and 1046 emitted files. Existing untracked-date, LaTeX Unicode, and Node deprecation warnings remain non-blocking.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI was changed.
- Security evidence (owner / other user / anonymous): provider tests are fully offline with injected fake fetch. Tests prove fixed endpoint, Bearer shape, absent `store`/`user_id`, capability `supportsZeroRetention=false` / `allowsPrivateContent=false`, normalized errors without raw provider detail, and timeout/abort behavior.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: implements a dormant provider seam under D-005 without enabling paid/model behavior.
- Contract changes requested: later integration contract should require a server-side private-content rejection gate; capability metadata alone does not filter content.
- Types, fixtures, and tests synchronized: provider types and 9 fake-fetch tests are included; no database fixture or migration was needed.

## Risk and recovery

- Known risks: DeepSeek has no documented API zero-retention guarantee and its context cache is on by default. The adapter must not receive private note bodies. Capability metadata is declarative, so the future router must actively enforce it.
- Rollback or forward-fix path: revert the single slice commit; the deployed mock gateway is unaffected. Forward integration should add budget/audit/consent/privacy gates before any secret loader or provider invocation.
- Blockers: real invocation remains deliberately blocked by missing secret, default-off feature flag, zero budget, absent audit/quota/router gates, and required privacy approval.
- Next task prerequisites: commander review and integration; later explicit user approval for key configuration and a separately reviewed real-call slice.
