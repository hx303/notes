# Handoff: `agent/p1-reliability`

- Role: P1A publication reliability candidate-matrix and source-contract implementer
- Model / reasoning effort: inherited Codex GPT-5 agent
- Worktree: `worktrees-next/p1-reliability`
- Branch: `agent/p1-reliability`
- Baseline SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f`
- Current SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f` (uncommitted handoff)
- Demonstrable slice: locally executed rollback-only publication matrix, static migration/source guard, and explicit current/next reliability contracts
- Approved research brief (or why none is needed): no external research was needed; this slice describes behavior present in the reviewed repository migrations and editor source but does not establish database runtime evidence.

## Completed

- Added a rollback-only SQL matrix for owner, other-account, and anonymous access across private, unlisted, and public documents, then executed it once against a fresh disposable local Supabase database.
- Added candidate probes for a stale-revision SQL predicate, duplicate publish, failed publish preserving the last successful snapshot, soft-delete revocation, restore-without-republish, withdrawal retry, public republish, and unlisted token rotation. The stale-revision probe does not execute or prove the product save path.
- Added a Node static guard for the publication ABI, current-snapshot transaction, owner RLS, live-source readers/triggers, anonymous write denial, reader grants, rollback discipline, and known non-idempotency.
- Documented that publication is synchronous and has no task queue, and that current publish/withdraw retries are not strictly idempotent.
- Proposed `save_document_snapshot_v1` as the next separately reviewed additive atomic/idempotent save contract; it is not implemented or deployed in this slice.

## Changed files and scope

- Allowed paths changed:
  - `supabase/tests/20260722_publication_reliability_matrix.sql`
  - `quartz/scripts/publicationReliabilityContract.test.ts`
  - `.design/wouldkeep-next/CONTRACTS.md`
  - `.design/wouldkeep-next/CURRENT_STATE.md`
  - `.design/wouldkeep-next/handoffs/agent-p1-reliability.md`
- Non-authorized paths touched: none. No `AccountPage` hotspot, package/lockfile, workflow, `MERGE_QUEUE`, migration, or production code changed.
- Commander-owned hookup requested: none for P1A. A future atomic-save RPC and frontend switch require their own reviewed task and deployment authorization.

## Evidence

- Commands run and raw result summary:
  - Focused Node tests for the new guard plus existing soft-delete/ACL guards: **15/15 passed**.
  - `quartz/scripts/check-supabase-migrations.ts`: **passed**, migration versions and legacy history map consistent.
  - `tsc --noEmit`: **passed** after linking this dependency-free worktree to an existing local `node_modules`; no package or lockfile changed.
  - Prettier check for changed TypeScript/Markdown: **passed**.
  - `git diff --check`: **passed**.
  - Disposable runtime: Supabase CLI 2.109.1, PostgreSQL 17.6, isolated project ID `wouldkeep_p1a_20260722`, repository `schema.sql`, two local-only identities, and repository migrations through `20260721000100`. No production URL or linked project was used.
  - `psql -X -v ON_ERROR_STOP=1 -f /tmp/publication_reliability_matrix.sql`: **17/17 result rows passed**, followed by `DO` success and `ROLLBACK`.
  - A separate post-run query returned `fixture_bases = 0`, `fixture_documents = 0`, and `transient_grant_persisted = false`.
  - The runtime result is evidence for this disposable publication/RLS/ACL matrix. It is not evidence for production drift or the product save path; the stale-revision probe remains a SQL predicate probe only.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI changed.
- Security evidence (owner / other user / anonymous): all 17 disposable-local probes passed, including owner RLS, other-account isolation, anonymous write denial, public/unlisted/private readers, live-source revocation, and signed-in publication behavior. Production state was not queried or changed.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: P1 publication reliability baseline and next atomic-save boundary.
- Contract changes requested: current publication is a synchronous last-success pointer; duplicate publish and repeated withdrawal are not strict operation-id idempotency; no asynchronous queue exists. The next contract is the additive `save_document_snapshot_v1` proposal with owner-scoped operation IDs, request fingerprints, atomic related writes, and zero-write conflicts.
- Types, fixtures, and tests synchronized: no production type or fixture changed. The candidate SQL fixtures are transaction-local when executed; the Node guard and docs name the same source-level contract and known gaps.

## Risk and recovery

- Known risks: the local database was bootstrapped from repository `schema.sql` plus repository migrations, not cloned from production, so production drift remains a separate preflight concern. The proposed save RPC has no implementation, concurrency proof, migration, or production deployment yet.
- Rollback or forward-fix path: discard these uncommitted evidence/docs files to return to baseline. Future behavior changes must update the SQL matrix, static guard, and contracts together.
- Blockers: the prior disposable two-profile execution blocker is closed. Independent review may now judge the evidence slice for Ready/merge; it still must not be described as an atomic-save fix or production verification.
- Next task prerequisites: review the `save_document_snapshot_v1` payload/result schema, add an additive migration and owner/other/anonymous plus two-session concurrency evidence, then seek separate backup/preflight/deploy authorization before switching the editor without legacy fallback.
