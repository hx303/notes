# Handoff: `release/p1b-220002-ledger-21`

- Role: 00200 production ledger-gate implementation
- Model / reasoning effort: GPT-5.6, high
- Worktree: `worktrees-next/release-p1b-220002-ledger-21`
- Branch: `release/p1b-220002-ledger-21`
- Baseline SHA: `bb7a3e9116c68df4569c22a5127b13d08a344cc6`
- Current checkpoint SHA: `9b3a655b9e5eb6e862678d20eb2b2c75cd2c8801` after merging latest `origin/main` (`f34d53b0`); the evidence update follows this checkpoint
- Demonstrable slice: make the already-reviewed `00200` release gates consume the deployed `00150` predecessor and prove the isolated `19 -> 20 -> 21` migration chain
- Approved research brief (or why none is needed): none; this is a bounded release-gate correction against already-merged migration contracts

## Completed

- Updated the production preflight to require the exact 20-version ledger through named `20260722000150`, with `20260722000200` absent.
- Updated the production contract to require the exact 21-version ledger through named `20260722000150` and named `20260722000200`.
- Updated the production runbook to pin the `20 -> 21` deployment, require `00150` in the ledger backup, and accept only the exact `00200` filename and version in the production dry-run.
- Made the exact-20 disposable candidate proof one `psql --single-transaction` sequence: preflight, exact `00200` migration, exact disposable ledger bookkeeping, then the exact-21 contract. Both success markers are required, and any failure rolls back the whole candidate proof.
- Added a disposable, opt-in, rollback-only chain proof for exact `19 -> 00150 -> 20 -> 00200 -> 21`, including an in-place synthetic NFKC tag change with preserved identity/reference state.
- Extended the residue probe so it works before the private `00200` schema exists and detects the new chain fixture namespace.
- Synchronized the static atomic-save guard with every ledger, runbook, chain-order, rollback, and residue assertion.
- Merged the latest `main`, including the reviewed continuous-pause `00150` deployment channel from PR #40, without conflicts.
- Executed the exact database-backed `19 -> 00150 -> 20 -> 00200 -> 21` path against a new disposable Supabase CLI 2.109.1 / PostgreSQL 17 database, including both fail-closed guards, rollback proofs, the exact-20 preflight, exact-21 contract, and the 37-case behavior matrix.

## Changed files and scope

- Allowed paths changed:
  - `.design/wouldkeep-next/runbooks/20260722000200-atomic-document-snapshot-save.md`
  - `.design/wouldkeep-next/handoffs/release-p1b-220002-ledger-21.md`
  - `quartz/scripts/atomicDocumentSaveGuard.test.ts`
  - `supabase/tests/20260722_atomic_document_snapshot_preflight.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_contract.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_residue.sql`
  - `supabase/tests/20260722_atomic_document_snapshot_migration_chain.sql`
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none.

## Evidence

- Commands run and raw result summary:
  - focused `atomicDocumentSaveGuard.test.ts`: **13/13 passed** after merging latest `main`.
  - migration guard: passed; migration versions and the legacy history map are consistent.
  - `tsc --noEmit`: passed after merging latest `main`.
  - targeted Prettier check for the runbook, handoff, and static guard: passed.
  - `git diff --check`: passed after all current edits.
  - full Quartz suite: **370/370 passed** after merging latest `main`.
  - Quartz production build (`--concurrency=1`): passed with 284 inputs and 1,051 emitted files; existing untracked-date and LaTeX Unicode warnings remain non-blocking.
  - independent read-only acceptance: passed for Draft publication with no remaining P0/P1. The reviewer found the original candidate-ledger P1, then verified its single-transaction fix, exact 20/21 ledgers, chain order, loopback/rollback boundaries, focused tests, migration guard, and diff hygiene.
  - Docker-backed chain execution: **passed** on a newly provisioned exact 19-row Supabase/PostgreSQL 17 baseline. The opt-in chain produced the single `19,20,21,atomic_document_snapshot_migration_chain_passed` marker, then rolled back to exact ledger 19 with zero residue.
  - Exact-20 candidate: **passed** after applying `00150` and exact disposable ledger bookkeeping. The `00200` preflight produced one success marker; the single-transaction migration/bookkeeping/contract sequence produced one preflight marker and one contract marker and advanced the disposable ledger to exact 21/21.
  - Behavior evidence: missing chain and matrix confirmations both failed closed with psql exit code 3; the full rollback-only matrix returned 37 passing rows; the final residue probe returned zero and the final exact-21 contract passed.
  - An exploratory attempt to run the production-only `00150` postflight contract against the empty disposable baseline correctly failed its fixed 462-tag production assertion; the enclosing transaction rolled back to exact ledger 19 before the prescribed `00200` candidate path continued.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI files changed.
- Security evidence (owner / other user / anonymous): unchanged business SQL. Static gates still pin the authenticated-only RPC ACL and owner-only private schema/table/functions; the new chain is disposable-only and rollback-only.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; release evidence now reflects the already-deployed `00150` predecessor.
- Types, fixtures, and tests synchronized: production ledger SQL, runbook, rollback residue, disposable chain fixture, and TypeScript guard are synchronized at 20 pre / 21 post.

## Risk and recovery

- Known risks: production still requires a fresh evidence directory, three backups, activity gate, exact-20 preflight, state fingerprint, one-file dry run, and fresh explicit deployment authorization. The local evidence does not authorize a production write.
- Rollback or forward-fix path: production remains untouched. The migration-chain and behavior fixtures roll back, and the disposable Supabase container, volume, and temporary directory were removed after acceptance.
- Blockers: none for Ready/merge review; every local commander and database-backed gate has passed.
- Next task prerequisites: update the Draft PR non-force and request fresh authorization before Ready/merge. Production backup/preflight and `00200` deployment remain later, separately authorized operations.
