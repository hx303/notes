# wouldkeep Production Safety Record

No production change is authorized by this file. Create a completed operation record and obtain explicit user approval before running a production migration, replacing an Edge Function, bulk-writing content, enabling a feature flag, raising AI budget, or publishing a release.

## Current observed baseline — 2026-07-17

- Git baseline: `main` at `f09eeea5a9ae687bea7c62144b59fcaca47874ff` after the explicitly approved PR #12 merge.
- PR #11: all checks passed; the site owner explicitly authorized merge; merged at 2026-07-16T15:05:24Z.
- Supabase project: `agocyybolrisqujvjqdj` (public project identifier only).
- Committed evidence says the AI migration and `ai-write` mock function are deployed, unauthenticated calls return 401, and four real-account RLS assertions passed.
- The site owner explicitly confirmed the signed-in mock gateway returned the expected no-model/no-cost result.
- The site owner explicitly authorized configuration, deployment, and a real DeepSeek test call on 2026-07-17, subject to completing the recorded prerequisites. The key file exists but has not been read, imported, logged, or committed.
- PR #12's A20 migration/RPCs passed local PostgreSQL migration, RLS, rollback-only SQL, and true two-session concurrency validation. `agent/ai-live-canary` adds a separately reviewed default-off public-snapshot-only runtime hookup; P0/P1 review, full tests, TypeScript, and build passed.
- Production execution is still stopped: the Supabase CLI has no authenticated profile, GitHub Actions exposes no Supabase deployment secrets, remote migration history and a backup cannot yet be captured, and therefore the migration/function/secret/live flag/paid canary have not run.
- Fresh database row counts, backup location, production deployment SHA, and Cloudflare state are not yet recorded. Therefore migrations, function replacement, secrets, feature flags, and paid calls remain stopped.

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

- Start/end time:
- Commands or Dashboard actions actually run:
- Migration/function/deployment result:
- Post-change row-count comparison:
- Verification query results:
- Browser/UI verification:
- Error or discrepancy:
- Forward fix applied / follow-up required:
- Final status: stopped / succeeded / needs forward fix.
