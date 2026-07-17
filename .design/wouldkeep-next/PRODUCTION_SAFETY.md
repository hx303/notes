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
