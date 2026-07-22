# Handoff: `agent/p1b-atomic-save-rpc`

- Role: Platform / P1 reliability implementation
- Model / reasoning effort: Codex, high
- Worktree: `worktrees-next/p1b-atomic-save-rpc`
- Branch: `agent/p1b-atomic-save-rpc`
- Baseline SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f`
- Current SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f` plus the uncommitted files below
- Demonstrable slice: authenticated owner-only `save_document_snapshot_v1` with one-transaction core/organization/version writes, CAS, saved-result idempotency, and deterministic local concurrency evidence
- Approved research brief (or why none is needed): No external research was needed; this slice implements the repository's existing P1 reliability and privacy contracts.

## Completed

- Added forward migration `20260722000200` with a hard executable dependency on `20260722000100` before any schema change.
- Added a strict `SECURITY DEFINER` RPC with fixed `pg_catalog, pg_temp` search path and authenticated-only execute ACL.
- Added browser-unexposed saved-result receipts with zero API ACL, enabled policy-free/non-forced RLS, an INSERT-only owner/document/knowledge-base validation trigger, owner and knowledge-base cascade lifecycle, and no document FK so a hard-delete/lost-ACK replay cannot create a duplicate.
- Added canonical request hashing, operation-ID reuse rejection, JS-safe revision limits, bounded snapshots, safe source URLs, NFKC tags, owner/library relationship validation, and unchanged last-success publication snapshots.
- Added production-safe preflight and post-migration catalog/ACL/owner/FK/trigger/PostgREST-exposure contracts.
- Added a rollback-only 30-scenario owner/other-user/anonymous/atomicity matrix.
- Added deterministic two-process `psql` evidence for same-operation new-document exactly-once, different-operation CAS, and knowledge-base delete lock ordering. The harness waits for a named holder's granted advisory lock while it is in a post-RPC sleep barrier, requires a post-COMMIT sentinel from every session, has a 30-second process timeout, and cleans fixtures in `finally`.
- Kept the RPC unwired. No browser behavior, production object, AI setting, provider call, or paid request changed.

## Changed files and scope

- Allowed paths changed:
  - `supabase/migrations/20260722000200_atomic_document_snapshot_save.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_preflight.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_contract.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_save.sql`
  - `supabase/tests/run-atomic-save-concurrency.ps1`
  - `supabase/tests/concurrency/atomic-save-*.sql`
  - `quartz/scripts/atomicDocumentSaveGuard.test.ts`
  - this handoff
- Non-authorized paths touched: none.
- Commander-owned hookup requested: after reviewed deployment of `20260722000200`, switch the replay-safe outbox/controller to the versioned RPC with no legacy multi-write fallback.

## Evidence

- Commands run and raw result summary:
  - Disposable Supabase CLI `2.109.1` / PostgreSQL `17.6` start: complete local chain applied in order through `20260721000100`, then `20260722000100`, then `20260722000200`; health checks passed on isolated ports.
  - Restored the disposable database to the post-`22000100` state; `20260722_atomic_document_snapshot_preflight.sql`: `atomic_save_preflight_passed`.
  - Reapplied the exact current `20260722000200` SQL: all `DO`/DDL/ACL statements passed.
  - `20260722_atomic_document_snapshot_contract.sql`: `DO` passed.
  - `20260722_atomic_document_snapshot_save.sql`: 30/30 scenarios returned `passed = true`; final assertion passed; transaction ended in `ROLLBACK`.
  - `run-atomic-save-concurrency.ps1`: `same-op new exactly once, different-op CAS, and knowledge-base delete lock order passed`.
  - Post-concurrency cleanup query: `t|t|t|t` for absent test schema, absent test account, absent named sessions, and absent related granted locks.
  - Focused static guard: 8/8 passed.
  - Full Quartz suite: 323/323 passed.
  - `tsc --noEmit`: passed.
  - Supabase migration normalization guard: passed.
  - changed TypeScript Prettier check: passed.
  - `git diff --check`: passed.
  - Disposable `wouldkeep-p1b-local` Supabase project: stopped successfully with `--no-backup`.
- UI evidence (viewport, theme, state, screenshot path/diff): Not applicable; the RPC is deliberately not wired to the browser in this slice.
- Security evidence (owner / other user / anonymous): owner save/replay/CAS/atomicity passed; other-user bind/replay/mutation attempts were zero-write; anonymous execute was denied; authenticated direct receipt access was denied; account deletion cascaded receipts.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: no existing decision entry was rewritten.
- Contract changes requested: saved acknowledgements are persisted only for committed saves; conflicts and not-found results remain read-only/recomputed. Receipt lifetime is account/knowledge-base scoped, not document scoped, to preserve new-document exactly-once after a hard delete.
- Types, fixtures, and tests synchronized: SQL ABI, static guard, rollback matrix, catalog contract, preflight, and real concurrency harness agree on result version 1 and the receipt lifecycle.

## Risk and recovery

- Known risks:
  - The RPC is intentionally not online until the replay-safe outbox/controller is integrated after deployment.
  - The owner advisory lock serializes saves for one owner; this is conservative for correctness and may be revisited only with equivalent same-operation new-document proof.
  - A historical saved acknowledgement can reference a hard-deleted document while its knowledge base remains; this is intentional so replay returns the original outcome instead of creating a duplicate.
- Rollback or forward-fix path: nothing is deployed. If later deployed, use a reviewed forward migration rather than rewriting this migration. The RPC can remain unwired while a forward fix is prepared.
- Blockers: `20260722000100` must be merged, backed up, deployed, and verified with a zero-pending ledger before `20260722000200` is considered for production.
- Next task prerequisites: independent diff review, explicit authorization to push/open a Draft PR, then preview/release review. Production backup/preflight/deployment requires a separate explicit authorization. Real AI remains later and disabled.
