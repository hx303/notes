# Handoff: `release/p1b-220002-ledger-21`

- Role: 00200 production ledger-gate implementation
- Model / reasoning effort: GPT-5.6, high
- Worktree: `worktrees-next/release-p1b-220002-ledger-21`
- Branch: `release/p1b-220002-ledger-21`
- Baseline SHA: `bb7a3e9116c68df4569c22a5127b13d08a344cc6`
- Current SHA: uncommitted working tree on `bb7a3e9116c68df4569c22a5127b13d08a344cc6`
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
  - focused `atomicDocumentSaveGuard.test.ts`: **13/13 passed**.
  - `npm run check:migrations`: passed; migration versions and the legacy history map are consistent.
  - `tsc --noEmit`: passed.
  - targeted Prettier check for the runbook, handoff, and static guard: passed.
  - `git diff --check`: passed after all current edits.
  - full `npm test`: passed.
  - isolated Quartz build (`--concurrency=1`, repository-external output): passed with `index.html` and 1,050 files; the temporary output directory was then removed.
  - independent read-only acceptance: passed for Draft publication with no remaining P0/P1. The reviewer found the original candidate-ledger P1, then verified its single-transaction fix, exact 20/21 ledgers, chain order, loopback/rollback boundaries, focused tests, migration guard, and diff hygiene.
  - Docker-backed chain execution: not run because Docker Desktop was unavailable (`dockerDesktopLinuxEngine` pipe absent); this is required before Ready/merge or production authorization, but does not block Draft publication.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI files changed.
- Security evidence (owner / other user / anonymous): unchanged business SQL. Static gates still pin the authenticated-only RPC ACL and owner-only private schema/table/functions; the new chain is disposable-only and rollback-only.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; release evidence now reflects the already-deployed `00150` predecessor.
- Types, fixtures, and tests synchronized: production ledger SQL, runbook, rollback residue, disposable chain fixture, and TypeScript guard are synchronized at 20 pre / 21 post.

## Risk and recovery

- Known risks: the new SQL chain has not yet been executed against an exact disposable 19-row Supabase baseline because Docker was unavailable. Static ordering/rollback tests pass; database execution is required before Ready/merge or production authorization, but does not block Draft publication.
- Rollback or forward-fix path: all edits are uncommitted release artifacts; production remains untouched. The disposable chain itself always ends in `ROLLBACK`.
- Blockers: an available disposable PostgreSQL/Supabase baseline is required for database-backed chain evidence.
- Next task prerequisites: execute the chain against exact ledger 19 before Ready/merge or production authorization; migration history, TypeScript, full suite, and build remain commander-level final verification.
