# Handoff: `release/p1b-atomic-220002`

- Role: Platform / P1 reliability implementation and release gating
- Model / reasoning effort: Codex, high
- Worktree: `worktrees-next/release-p1b-220002`
- Branch: `release/p1b-atomic-220002`
- Baseline SHA: `1be357231fc4ffbc71e4b5f8df320500e4179b87`
- Current SHA: baseline plus the uncommitted hardening described below
- PR: #31, retargeted to latest `main`, still Draft
- Demonstrable slice: authenticated owner-only atomic snapshot save plus exact, fail-closed production migration gates
- Approved research brief (or why none is needed): no external research was needed; this slice implements the repository's existing P1 reliability, privacy, and production-safety contracts.

## Completed

- Kept the original `20260722000200` atomic save RPC, owner-scoped idempotent receipts, CAS, bounded/canonical request validation, organization synchronization, and unchanged last-success publication snapshots.
- Added a native global tag tenant invariant: `(knowledge_bases.id, owner_id)` is unique and `tags(knowledge_base_id, owner_id)` references it with validated, immediate, nondeferrable `ON UPDATE RESTRICT` / `ON DELETE CASCADE` behavior.
- Added exact production-safe preflight and postflight contracts for the 19 -> 20 migration ledger, function bodies, trigger set, receipt schema/constraints, owners, direct ACLs, effective API-role denial, private-schema exposure, and tag ownership.
- Added finite migration execution bounds before the first check/DDL: `lock_timeout = 5s` and `statement_timeout = 5min`, with explicit successful resets at the end.
- Expanded the rollback-only matrix to 37 owner/other-user/anonymous/security/reliability scenarios, with a unique disposable opt-in, missing-confirmation exit code `3`, and a separate read-only residue probe.
- Added read-only activity and business-state fingerprint gates plus an executable production runbook. The runbook pins approved SHA/project/CLI, exact pending migration, exact 19/20 ledgers, one production push, three nonempty structurally validated backups and SHA-256 hashes, immediate gate replay, exact postflight contract, and zero pending afterward.
- Kept the RPC unwired. No browser behavior, production object, AI flag, provider call, or paid request changed.

## Changed files and scope

- Allowed paths changed:
  - `supabase/migrations/20260722000200_atomic_document_snapshot_save.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_preflight.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_contract.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_save.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_activity_gate.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_state_fingerprint.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_residue.sql`
  - `.design/wouldkeep-next/runbooks/20260722000200-atomic-document-snapshot-save.md`
  - `quartz/scripts/atomicDocumentSaveGuard.test.ts`
  - this handoff
- Existing PR files retained and revalidated:
  - `supabase/tests/run-atomic-save-concurrency.ps1`
  - `supabase/tests/concurrency/atomic-save-*.sql`
- Non-authorized paths touched: none.
- Commander-owned hookup requested: only after reviewed production deployment of `20260722000200`, switch the replay-safe outbox/controller to the versioned RPC with no legacy multi-write fallback.

## Evidence

- Disposable Supabase CLI `2.109.1` / PostgreSQL `17.6` container only; no production database command was run.
- Full rollback simulation of the production predecessor shape: exact `20260722000100` state -> current preflight -> current migration -> target ledger row -> current contract passed, including `atomic_save_preflight_passed` and `atomic_document_snapshot_contract_passed`; final `ROLLBACK` restored the container.
- Missing disposable confirmation: psql exit code `3`; the separate residue probe returned `0,0,0,0` afterward.
- Full rollback matrix: 37/37 scenarios returned `passed = true`; the separate residue probe again returned `0,0,0,0`.
- Real two-process concurrency harness: same-operation create exactly once, different-operation CAS, and knowledge-base delete lock ordering passed; cleanup completed.
- Focused static gate: 12/12 passed.
- Full Quartz suite: 328/328 passed.
- `tsc --noEmit`: passed.
- Supabase migration normalization guard: passed.
- changed TypeScript and Markdown Prettier check: passed; SQL is not configured with a Prettier parser.
- `git diff --check`: passed.
- Production build: 284 inputs -> 1051 outputs, exit code 0; only pre-existing untracked-content date and LaTeX compatibility warnings appeared.
- Backup marker expressions were checked against existing production backup artifacts without displaying their contents; schema, public-data COPY, and ledger COPY formats matched. A fresh P1B backup must additionally contain predecessor `20260722000100` as enforced by the runbook.
- UI evidence: not applicable; the RPC remains deliberately unwired in this slice.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Saved acknowledgements exist only for committed saves; conflict and not-found responses stay read-only/recomputed.
- Receipt lifetime remains account/knowledge-base scoped, not document scoped, so a lost-ack replay after hard deletion cannot create a duplicate document.
- The global tag owner/knowledge-base owner relationship is now declarative and race-free in both child-write and parent-owner-update directions.
- Production checks are exact and fail closed: no migration repair, no `--include-all`, no production rollback matrix, no second push, and no credential/database URL in repository evidence.

## Risk and recovery

- The owner advisory lock still serializes saves for one owner; this is conservative for correctness and may be narrowed only with equivalent exactly-once/concurrency proof.
- A historical saved acknowledgement may reference a hard-deleted document while its knowledge base remains; this is intentional replay behavior.
- The migration creates a validated UNIQUE index and FK. Finite lock/statement timeouts make contention fail closed, but production still requires the activity gate and a fresh uninterrupted evidence session.
- Nothing is deployed. If later deployed, use a reviewed forward migration rather than rewriting this version.
- Current blockers: hardening is uncommitted/unpushed; PR #31 must stay Draft until the updated branch and downstream stack are propagated and checks pass. Production requires a separate explicit authorization after merge.
- Next step: independent final diff review, then obtain explicit authorization to commit/push PR #31 and propagate its commit through the dependent C/D stack without force-pushing. Do not Ready/merge or deploy from this handoff alone.
