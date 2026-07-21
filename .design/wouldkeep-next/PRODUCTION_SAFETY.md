# wouldkeep Production Safety Record

No production change is authorized by this file. Create a completed operation record and obtain explicit user approval before running a production migration, replacing an Edge Function, bulk-writing content, enabling a feature flag, raising AI budget, or publishing a release.

## Current observed baseline — 2026-07-17

- Git baseline: `main` at merge commit `13cbf2e630ef6845c7e741d434104b38e93d8c68` after the explicitly approved PR #18 merge. PR #18 included orchestration commit `12852207` and migration-normalization commit `e9eeb477`.
- PR #11: all checks passed; the site owner explicitly authorized merge; merged at 2026-07-16T15:05:24Z.
- Supabase project: `agocyybolrisqujvjqdj` (public project identifier only).
- Committed evidence says the AI migration and `ai-write` mock function are deployed, unauthenticated calls return 401, and four real-account RLS assertions passed.
- The site owner explicitly confirmed the signed-in mock gateway returned the expected no-model/no-cost result.
- The site owner explicitly authorized configuration, deployment, and a real DeepSeek test call on 2026-07-17, subject to completing the recorded prerequisites. After local checks and independent review, the key was validated and used transiently for one guarded synthetic-public provider canary; it was not printed, persisted, or committed. It was imported into Supabase Secrets only after the production backup and database safety migration succeeded.
- PR #12's A20 migration/RPCs passed local PostgreSQL migration, RLS, rollback-only SQL, and true two-session concurrency validation. `agent/ai-live-canary` adds a separately reviewed default-off public-snapshot-only runtime hookup; P0/P1 review, full tests, TypeScript, and build passed.
- Production execution completed through the default-off deployment gate: CLI authentication, backup, migration history repair, A20 migration, Secrets import, and `ai-write` version 4 deployment succeeded. Both database and function live flags remain off; no production paid canary was run.
- Local provider-canary result: `deepseek-v4-flash`, success/stop, 13 prompt tokens, 2 completion tokens, 15 total tokens, zero cache-hit tokens, 13 cache-miss tokens, and 1 CNY fen actual audited cost. The prompt contained only fixed synthetic public text; no note or account data was read.
- Fresh database row counts, backup hashes, production deployment SHA, and verification results are recorded below. Cloudflare state was not changed. Enabling production live AI or running a paid production canary remains stopped pending an authenticated site-owner session and a public publication target.

## Operation record template

- Operation ID / title:
- Executor:
- User approval reference and time:
- Planned execution time:
- Git SHA and branch:
- Target environment/project:
- Migration filenames / function versions / deployment artifact:
- Last successful deployment and URL:
- Backup/snapshot location and timestamp:
- Pre-change row counts for affected tables:
- Pre-change function/config versions:
- Exact verification queries and expected results:
- RLS owner/other/anonymous checks:
- Forward-fix migration/function plan:
- Data-destructive rollback required: yes/no. If yes, stop for separate approval.

## Execution result

- Start/end time: 2026-07-17 14:58 to 15:39 CST.
- Commands or Dashboard actions actually run: Supabase CLI link/list/dump/query/migration-repair/secrets/functions commands; no Dashboard write and no database reset.
- Git source: `agent/ai-live-canary` at `a87f786ba7de3e83e45245dce14004ab359d3810`, followed by the transaction/import-extension fixes in this operation record commit.
- Target: Supabase project `agocyybolrisqujvjqdj`; Edge Function `ai-write`.
- Backup: `work/backups/supabase-production-20260717/public-schema.sql`, 72,378 bytes, SHA-256 `14310C1AC6E7AAD52CB31EF5ACBB2F7585A295DFE0A12A71DAB4D8C3EF1EF110`; `public-data.sql`, 3,812,060 bytes, SHA-256 `0D974F95BDF87167A11711B279B70500A49AE15FA47FBDC267D32339B749B70E`.
- Migration/function/deployment result: remote schema proved migrations through `20260716` already existed while the migration ledger was empty. Versions `20260712`, `20260714`, `20260715`, and `20260716` were marked applied without rerunning SQL. `db push --dry-run` correctly exposed duplicate-version legacy files and was stopped. `20260717_ai_runtime_safety.sql` was then executed alone through `db query --linked --file` with explicit transaction boundaries and marked applied only after verification. `ai-write` version 4 deployed ACTIVE at 2026-07-17 07:33:10 UTC.
- Post-change row-count comparison: backup had `ai_preferences=0`, `ai_runs=0`, `ai_suggestions=0`; post-change counts remain `0/0/0`, and the singleton `ai_runtime_config` row count is 1.
- Verification query results: `live_disabled`, safe hard-limit/provider/rate-card defaults, RLS on AI tables, anon/auth RPC denial, service-role RPC grant, and exclusion from `supabase_realtime` were all true.
- Secret handling: eight AI settings were uploaded directly from memory; the provided DeepSeek key and generated HMAC key were not printed or written to a repository/temp plaintext file. `AI_LIVE_ENABLED=false`.
- Function verification: missing Authorization returned HTTP 401. A synthetic request with the public publishable key returned HTTP 200 with `mock=true`, `status=gateway_ready`, `model=null`, and the exact synthetic preview; no provider call occurred.
- Validation: Deno-compatible `.ts` imports and explicit migration transaction boundaries passed TypeScript, 48/48 focused AI tests, 193/193 full tests, and a production build (284 inputs / 1,046 outputs).
- Error or discrepancy: the first backup attempt timed out while downloading the exact PostgreSQL image; no SQL ran and the zero-byte file was replaced by the verified backup. The first function deploy failed server-side bundling on extensionless imports and did not replace production; imports were fixed and retested. The first post-migration read-only verification used incorrect display column names and failed without writes; the corrected invariant query passed. Repository migration filenames still contain duplicate date-only versions, so normal future `db push` remains unsafe until filenames/history are normalized in a dedicated forward-repair change.
- Forward fix / follow-up: keep both live gates off; normalize duplicate migration IDs in a separate reviewed change; use an authenticated site-owner session and a public snapshot for at most one production paid canary, then immediately restore/verify both gates off.
- Data-destructive rollback required: no.
- Final status: default-off production deployment succeeded; paid production canary intentionally not run.

## W2-10 production migration-ledger normalization - 2026-07-17

- Operation window: 2026-07-17 19:43-20:11 CST (11:43-12:11 UTC).
- Executor and authorization: Codex root agent; the site owner explicitly authorized pushing `e9eeb477`, creating and merging the W2-10 PR, and performing the production migration-ledger repair.
- Git source: PR #18 merged to `main` as `13cbf2e630ef6845c7e741d434104b38e93d8c68` with tree `f05a7f8eb1328ce796213f5d051a1557c2ce84fa`. Supabase CLI `2.109.1` was used.
- Target: Supabase project `agocyybolrisqujvjqdj`, region `ap-southeast-1`.
- Backup state: managed physical backups were unavailable (`pitr_enabled=false`, `walg_enabled=true`, no listed backup). A scoped logical backup of `supabase_migrations.schema_migrations` was created outside the repository and successfully restored into a disposable PostgreSQL database before any write.
- Backup artifacts: `schema_migrations_schema.sql`, SHA-256 `18B99FBBB3EC9FBB964BB255A56171329ACD99B6977ECE2ADDD89FDF5AA5105B`; `schema_migrations_data.sql`, SHA-256 `9B642294468C838A9686F9D726F4152492BB3CBF011E146E0DF434ABE2D91154`.
- Preflight: the five legacy ledger rows matched the pinned version/name/statement-count/statement-array-MD5 tuples. A linked migration list and dry-run showed exactly the ten mapped `20260718000100` through `20260718001000` migrations pending. The database live flag was false, `AI_LIVE_ENABLED` remained false, daily limit was 20, concurrency limit was 1, provider was DeepSeek, user AI preference count and total budget were zero, and no paid call was made.
- Write scope: four `migration repair --status applied` batches of 1/3/3/3 versions were executed in dependency order. No archived migration SQL, `db push`, schema/data write, Edge Function deployment, Secret update, live-flag update, budget/model change, or publication action was executed.
- Post-repair ledger: exactly 15 rows and 15 unique versions; all five legacy tuples remained byte-for-byte unchanged and all ten normalized tuples matched their independently computed statement counts and MD5 sentinels. `migration list` aligned all local and remote versions, and linked `db push --dry-run` reported the remote database up to date with zero pending migrations.
- Business-data invariants: `profiles=6`, `documents=260`, `document_publications=0`, `ai_preferences=0`, `ai_runs=0`, and `site_owners=1` before and after.
- Object invariants: the normalized production schema dump SHA-256 was identical before and after (`1c064af3dd931035cfbf31be060bc0874d86e459b1c2899a2f12839da850c856`). Selected publication/AI function fingerprint remained `da1738e317e6f199b076937d5e5646ed`; public/storage policy fingerprint remained `e4f4b6ce6aac2b882d42b8b083d4da48`.
- Credential hygiene: one CLI dry-run emitted a temporary auto-generated database login credential to the private execution channel. It was not copied into source, artifacts, or reports; a final read-only role query confirmed no matching temporary CLI login role remained.
- Error or discrepancy: none. Each batch was read back before continuing, and all independent tuple/object/data/config checks matched.
- Forward boundary: new business migrations must use versions greater than `20260718001000`. The publication soft-delete repair is a separate forward migration and is not authorized for production by this record.
- Recovery: no destructive rollback is required. The exact pre-repair ledger backup is retained outside the repository and has passed restore validation.
- Final status: production migration history normalized successfully; AI remains default-off with zero user budget and zero paid production calls.

## P1 publication soft-delete guard production deployment - 2026-07-17

- Operation window: 2026-07-17 22:38-22:54 CST.
- Executor and authorization: Codex root agent; after PR #19 merged, the site owner explicitly authorized continuing with the separately gated production deployment in the current thread.
- Git source: remote `main` merge commit `bb83889ea9dd3c09ac34fd67d20042bd1330db87`; migration blob `fb1eace7316f42da82533934df4836bbc1f5940c`; Supabase CLI `2.109.1`.
- Target: Supabase project `agocyybolrisqujvjqdj`, region `ap-southeast-1`; migration `20260718001100_publication_soft_delete_guard.sql`.
- Pre-change backups outside the repository: `public-schema.sql`, 89,104 bytes, SHA-256 `CAE2B3BE933271FDA79C89713B6700D5EED6269D264EF12D45951946375F0570`; `public-data.sql`, 3,812,659 bytes, SHA-256 `7E0E3EDA3C9A196ED3AB7F7B00F362B7BE53FC7514C7F4E3B73F8725E3916977`; `migration-ledger-data.sql`, 100,761 bytes, SHA-256 `A7766C993520B3300A6FEC982BB550650C758D2E23BD63A6B6AAB36665539190`.
- Preflight: ledger was exactly 15 rows and 15 unique versions with no `20260718001100` row. Linked migration list and `db push --dry-run` showed only `20260718001100` pending. Counts were `documents=260`, soft-deleted documents `0`, `document_publications=0`, public/unlisted publications `0/0`, stale or orphan/owner-mismatch snapshots `0/0`, long transactions `0`, waiting locks `0`, and publication-relation locks `0`.
- AI preflight: database live flag `false`, daily limit `20`, concurrency limit `1`, provider `deepseek`, preferences/enabled preferences `0/0`, total budget `0`, runs `0`, and audited cost `0`.
- Production write: the only production write command was an atomic linked `db push --yes`. It applied `20260718001100` successfully. No manual SQL execution, migration repair, Edge Function deployment, Secret change, AI flag/budget/provider/model change, publication action, or real-account content write ran.
- Postflight ledger: exactly 16 rows and 16 unique versions; `20260718001100` exists exactly once; migration list is fully aligned and linked dry-run reports the remote database up to date with zero pending migrations.
- Postflight data and AI invariants: all document/publication counts and all AI configuration, preference, budget, run, and cost aggregates matched the preflight values exactly. Because production had no publication rows or soft-deleted documents, the historical cleanup changed no business rows.
- Security verification: both new triggers exist and are enabled; both trigger functions are `SECURITY DEFINER` with the restricted search path and are not executable by `anon` or `authenticated`; reader RPC ABI, live-source joins, and caller ACLs pass; publication RLS is enabled with four expected policies, including three live-source policies and the owner delete policy; anonymous direct table access remains denied. Anonymous read/list smoke returned `NULL`/`[]`.
- Existing ACL drift: the pre-change schema backup already granted `anon` direct EXECUTE on `publish_document`; this was not introduced by `20260718001100`. The RPC remains `SECURITY INVOKER`, rejects a missing authenticated user before publishing, and publication-table RLS remains fail-closed. No untracked production ACL hotfix was made; a dedicated forward migration should revoke this direct grant so production matches the repository's local ACL assertion.
- Post-change schema snapshot: `public-schema-post.sql`, 93,564 bytes, SHA-256 `580A95D7A698162C897EADA6DA0DAE9CAD6FEA9F2F8C6FCEA5E31E2D92F7D9EE`.
- Error or discrepancy: an initial combined backup wrapper timed out before creating artifacts; it performed no database write and left no completed backup. The schema, data, and ledger exports were then run individually and all completed with the checksums above.
- Recovery boundary: do not reverse the fail-closed soft-delete boundary or restore revoked snapshots by default. Any defect after commit must use a new forward migration; use the protected pre-change backups only for a separately approved, precisely scoped data recovery.
- Final status: P1 production deployment succeeded; ledger and business/AI invariants pass; AI remains default-off with zero budget and zero paid production calls. The pre-existing anonymous `publish_document` EXECUTE grant is recorded as a separate hardening follow-up.

## Publication write RPC ACL production deployment - 2026-07-18

- Operation window: 2026-07-18 13:46-13:55 CST.
- Executor and authorization: Codex root agent; the site owner explicitly authorized converting and merging PR #22, updating local `main`, taking a production backup, running migration preflight, deploying only `20260718001200`, verifying all three anonymous publication-write RPC denials and zero pending migrations, and recording the operation.
- Git source: PR #22 merged as remote `main` commit `01dc10a9fe478f9fbcc03a0f443232ef5e776d5d`; migration `20260718001200_publication_write_acl_hardening.sql`, SHA-256 `D1A475D1A3314BF501A38ED4A5AF00B98CAD6047DF5E185EFB8D6942757BF9B1`; Supabase CLI `2.109.1`.
- Target: Supabase project `agocyybolrisqujvjqdj`; no Edge Function, Secret, live flag, budget, provider/model, publication, or business-content change was authorized or performed.
- Pre-change backups outside the repository: `public-schema.sql`, 93,564 bytes, SHA-256 `580A95D7A698162C897EADA6DA0DAE9CAD6FEA9F2F8C6FCEA5E31E2D92F7D9EE`; `public-data.sql`, 3,657,205 bytes, SHA-256 `154986270EEC40174844827E0FC0BD9846B3841F4FF7C1F28ACE3BAC0F30B0F8`; `migration-ledger-data.sql`, 111,019 bytes, SHA-256 `1958458847098D95B4367DC3CEF9CF883C7C76A60B0EA5E9C90287252893791C`.
- Preflight: ledger was exactly 16 rows and 16 unique versions with no `20260718001200` row. Linked migration list and `db push --dry-run` showed only `20260718001200` pending. Counts were `profiles=6`, `documents=260`, soft-deleted documents `0`, `document_publications=0`, public/unlisted publications `0/0`, stale/orphan/owner-mismatch publications `0/0/0`, long transactions `0`, waiting lock sessions/locks `0/0`, and publication-relation locks `0`.
- AI preflight: database live flag `false`, daily limit `20`, concurrency limit `1`, provider `deepseek`, preferences/enabled preferences `1/1`, total configured budget `2000` cents, runs `0`, and audited cost `0`. These account settings pre-existed this operation and were observed only; the deployment did not change them or make a model call.
- ACL preflight: `anon` could execute `publish_document(uuid,text)` but could not execute `unpublish_document(uuid)` or `moderate_publication(uuid,text)`; `authenticated` and `service_role` could execute all three. This matched the previously recorded production drift and the migration's exact repair scope.
- Production write: the only production write command was an atomic linked `db push --yes`. It applied only `20260718001200_publication_write_acl_hardening.sql`. No manual SQL, migration repair, schema/data mutation beyond the reviewed ACL statements and ledger row, Edge Function deployment, Secret/config change, publication action, or account-content write ran.
- Postflight ledger: exactly 17 rows and 17 unique versions; `20260718001200` exists exactly once; linked migration list is fully aligned and `db push --dry-run` reports the remote database up to date with zero pending migrations.
- Security verification: the repository ACL guard passed with no exception. `anon` and `PUBLIC` lack direct/effective EXECUTE on all three publication write RPCs; `authenticated` and `service_role` retain EXECUTE. Anonymous reader RPC access, publication RPC ABI/security modes, publication RLS/policy fingerprint, anonymous table denial, and the soft-delete safety triggers/functions remained intact.
- Postflight data and AI invariants: all business counts, AI runtime values, preference/enabled counts, configured budget, run count, and audited cost matched preflight exactly. AI remained live-disabled and no paid request occurred.
- Post-change schema snapshot: `public-schema-post.sql`, 93,458 bytes, SHA-256 `DECA8BE027850562156CA22B32D6E61645D66EBBD3AC89370D57004EA2D34ED2`.
- Error or discrepancy: the first backup attempt could not start because Docker Desktop was not running; Supabase CLI failed before SQL execution. Docker Desktop was started, a new backup directory was used, and all three backup artifacts completed and were hashed before preflight. No production write occurred during the failed attempt.
- Recovery boundary: the ACL change is fail-closed and should not be reversed by default. Any defect must use a separately reviewed forward migration; the protected pre-change backups are retained only for separately authorized, precisely scoped recovery.
- Final status: PR #22 is merged, local `main` is synchronized, migration `20260718001200` is deployed, all three anonymous publication-write RPC permissions are denied, and the production migration list has zero pending entries.

## 2026-07-21 P06 document-link integrity deployment attempt (stopped pre-write)

- Executor and authorization: Codex root/database agents; the site owner explicitly authorized production backup, preflight, deployment, and verification of only `20260721000100_document_links_integrity.sql`.
- Target: linked Supabase project ref `agocyybolrisqujvjqdj`.
- Required gates: remote ledger must show only `20260721000100` pending; logical backup must complete; cross-owner, cross-knowledge-base, and missing-endpoint counts must be zero before deployment.
- Connection evidence: `supabase link` failed with a Management API transport timeout. Two read-only linked `migration list` attempts then failed while initializing the database login role with `LegacyDbConfigLoginRoleNetworkError`; the final attempt used `--dns-resolver https` and failed after 71.9 seconds.
- External status evidence: the official Supabase status page reported all systems, Management API, Connection Pooler, and Database operational, so the observed failure was treated as a CLI/network-path blocker rather than permission to bypass the gates.
- Production result: backup not started; preflight not started; migration not deployed; rollback test not run; no business/test row written; no Secret read or exposed; production unchanged.
- Resume boundary: restart at linked remote-ledger verification after connectivity recovers. Do not use the Dashboard SQL editor or a direct migration write unless an equally complete backup and preflight can be proven first.
