# Handoff: `agent/p1-rpc-only-acl`

- Role: Platform ACL / P1 reliability implementation
- Model / reasoning effort: Codex, high
- Worktree: `worktrees-next/p1-rpc-only-acl`
- Branch: `agent/p1-rpc-only-acl`
- Baseline SHA: `a44a5118`
- Current SHA: `a44a5118` plus the uncommitted files below
- Demonstrable slice: browser snapshot writes are RPC-only while publication and document lifecycle permissions remain narrowly available
- Approved research brief (or why none is needed): No external research was needed; this slice implements the reviewed repository ACL, atomic-save, publication, and lifecycle contracts.

## Completed

- Added forward ACL migration `20260723000100` with a hard executable dependency on the exact `20260722000200` atomic-save boundary before any ACL mutation.
- Removed browser table writes for core snapshot columns, versions, tags, document tags, links, and sources. Removed authenticated execution of `replace_document_sources`.
- Preserved authenticated document `SELECT`, owner/RLS-scoped hard `DELETE`, and exact column-level `UPDATE` for `deleted_at`, `status`, `visibility`, `published_at`, and `published_revision`.
- Preserved authenticated child-table `SELECT`, authenticated-only `save_document_snapshot_v1`, and the reviewed `publish_document` / `unpublish_document` invoker paths.
- Kept `wouldkeep_private` hidden from `PUBLIC`, `anon`, `authenticated`, and `service_role`; the private receipt ledger remains callable only through the owner-controlled atomic RPC.
- Added a fail-closed service-role baseline: all six public target tables must already grant effective `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to `service_role` before the migration may make those permissions direct. A drifted environment cannot use this migration to widen trusted-service access.
- Added production-safe preflight/postflight, rollback-only behavior and residue checks, and a static guard for dependency order, ACL shape, inherited/direct grants, service baseline, publication fingerprints, and rollback discipline.
- Audited the current uncommitted `agent/p1-save-controller` integration. Every active editor save entry point reaches `createEditorSaveController` and `save_document_snapshot_v1`; no legacy document/child-table write or `replace_document_sources` call remains. The document, version, tag, link, and source queries in the controller are reads. Publish/unpublish remain RPC calls. No separate product write entry for tags, links, or sources was found.
- The currently inspected controller exposes no soft-delete, restore, or hard-delete UI entry. The ACL intentionally preserves only those lifecycle capabilities for an existing or future owner-scoped flow; it does not add a new product entry.

## Changed files and scope

- Allowed paths changed:
  - `supabase/migrations/20260723000100_rpc_only_document_snapshot_writes.sql`
  - `supabase/tests/20260723_rpc_only_document_snapshot_preflight.sql`
  - `supabase/tests/20260723_rpc_only_document_snapshot_contract.sql`
  - `supabase/tests/20260723_rpc_only_document_snapshot_writes.sql`
  - `supabase/tests/20260723_rpc_only_document_snapshot_residue.sql`
  - `quartz/scripts/rpcOnlyDocumentSnapshotWritesGuard.test.ts`
  - this handoff
- Non-authorized paths touched: none. The operational `node_modules` junction was repointed to an existing shared dependency directory and is not tracked.
- Commander-owned hookup requested: independently review the no-fallback save controller and this ACL slice, then release them in the order below.

## Evidence

- Commands run and raw result summary:
  - Focused ACL static guard: 9/9 passed after the final service-role baseline addition.
  - Supabase migration normalization guard: passed after the final documentation pass.
  - Full Quartz suite: 372/372 passed after the final service-role baseline assertion.
  - `tsc --noEmit`: passed.
  - Quartz production build: passed; 285 Markdown inputs produced 1,046 output files. Existing content/KaTeX warnings were non-fatal.
  - Changed TypeScript/Markdown Prettier and `git diff --check`: passed after this handoff was added.
  - Final disposable project: Supabase CLI `2.109.1`, PostgreSQL `17.6`, project `wouldkeep-p1b-local`, database port `56322`; no remote link or production URL was used.
  - Negative service baseline proof on a clean disposable bootstrap: all 24 effective service-role table/privilege pairs were absent, and the production preflight failed closed at `public.documents` / `SELECT` before any ACL mutation.
  - The disposable bootstrap omits managed production service-table defaults. After explicitly installing those 24 permissions as local-only test baseline, the five segments were actually executed in order: preflight passed with zero business rows; exact migration passed; postflight contract passed with zero business rows; rollback-only behavior matrix passed 14/14; residue probe returned zero users, knowledge bases, documents, and receipts.
  - Existing atomic-save regression matrix after ACL: 30/30 passed and rolled back.
  - Two-session concurrency harness after ACL: `same-op new exactly once, different-op CAS, and knowledge-base delete lock order passed`; fixtures were removed.
  - Representative local commands, with no credential output retained:

    ```powershell
    $db = "supabase_db_wouldkeep-p1b-local"
    supabase start
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_preflight.sql # expected fail on clean local service baseline
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.documents, public.document_versions, public.tags, public.document_tags, public.document_links, public.document_sources TO service_role;" # disposable fixture only
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_preflight.sql
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_migration.sql
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_contract.sql
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_writes.sql
    docker exec $db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rpc_only_residue.sql
    .\supabase\tests\run-atomic-save-concurrency.ps1 -Container $db
    ```

    The 24-permission `GRANT` above is only a disposable simulation of managed Supabase defaults. Production must pass the unmodified preflight against its real effective ACL before deployment; never install this fixture or bypass the preflight in production.

- UI evidence (viewport, theme, state, screenshot path/diff): Not applicable to this database-only slice. The active-path audit was source-based; signed-in preview acceptance belongs to the save-controller release gate.
- Security evidence (owner / other user / anonymous): legacy existing/new saves fail with `42501` and zero write; all independent child writes and the legacy source RPC are denied; owner atomic existing/new/replay/CAS paths pass; publication, soft delete/restore, and hard delete remain owner/RLS-scoped; other-user and anonymous attempts are zero-write; private receipt access is denied.
- Environment limits:
  - The disposable database is a repository migration bootstrap, not a production clone and not evidence that production has no ACL drift.
  - Its missing managed service-table defaults were installed only as an explicit local fixture after the negative fail-closed proof.
  - Its behavior transaction grants authenticated knowledge-base `SELECT` because the repository bootstrap omits that legacy read grant; the grant rolls back with the matrix.
  - SQL behavior uses `SET ROLE` / JWT claims rather than a PostgREST browser request. Catalog checks cover effective/inherited and direct `PUBLIC` ACLs; browser integration still requires preview acceptance.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: no existing decision entry was rewritten.
- Contract changes requested: `save_document_snapshot_v1` becomes the sole authenticated browser boundary for core snapshots, versions, tags, links, and sources. Publication and document lifecycle remain separate and can write only the five allowlisted document columns; hard delete remains available.
- Types, fixtures, and tests synchronized: migration preflight/postcondition, production preflight/postflight, static guard, rollback behavior matrix, residue probe, existing 30-case RPC suite, and two-session concurrency harness agree on the ACL boundary.

## Risk and recovery

- Known risks:
  - A stale browser tab using the removed legacy writes will receive `42501` by design. The active client must keep its local/outbox recovery data and show a useful recovery path.
  - The sibling `agent/p1-save-controller` slice now freezes deterministic `42501`, `22*`, and `23*` rejection, exposes export/local/private-copy recovery, blocks automatic and reconnect replay until an explicit form submit, and conditionally resolves only the exact durable snapshot that was archived. It must still be released and accepted before this ACL migration; never deploy the ACL first.
  - Production must independently prove the 24 effective service-role baseline permissions. If any are absent, preflight must stop; do not bypass the gate or apply the direct grant manually.
- Release order:
  1. Independently review and merge the no-legacy-fallback save controller and this ACL change as separate slices.
  2. Take a production backup, prove a zero-pending migration ledger, and run the exact `20260722000200` preflight/contract. Deploy and verify `20260722000200` first if it is not already present.
  3. Release the no-fallback frontend while broad legacy ACL still exists. Complete signed-in preview/production acceptance for existing save, new save, replay, conflict recovery, publication, and lifecycle behavior.
  4. Only after the new frontend is active, take another backup, run `20260723_rpc_only_document_snapshot_preflight.sql`, and deploy only `20260723000100` with separate explicit production authorization.
  5. Run the read-only postflight and ledger check. Treat `42501` from old tabs as expected recovery telemetry. Do not run fixture/rollback matrices against production without separate authorization.
- Rollback or forward-fix path:
  - Preferred incident response is a controller/RPC forward fix while the ACL remains closed; this migration does not mutate business data.
  - Re-granting legacy document/child-table writes or `replace_document_sources` reopens the partial-multiwrite/lost-ack P1 and requires fresh incident authorization. If unavoidable, use the narrowest temporary grant and never expose the private schema, receipt ledger, or service-only RPCs.
  - There is no destructive data rollback. Any ACL reversal must be a separately reviewed forward migration with explicit expiration and post-incident removal.
- Blockers: production backup/ledger/preflight/deployment authorization; release of the independently verified save-controller slice; signed-in preview acceptance.
- Next task prerequisites: final diff review, formatting/migration guard rerun, independent acceptance, then explicit authorization to commit/push/open a PR. No production connection or mutation occurred.
