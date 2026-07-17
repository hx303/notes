# Supabase migration history normalization

Status: local W2-10 implementation; **no production migration-history write is authorized or executed by this change**.

## Why this is required

Supabase parses every numeric prefix before the first underscore as the migration version and compares local and remote history by that version. The previous repository reused `20260712`, `20260714`, and `20260716`, while the production ledger contains one row for each date-level version. A normal `db push` therefore cannot identify which SQL each row represented.

Official references:

- [Database migrations and migration repair](https://supabase.com/docs/guides/deployment/database-migrations)
- [db push and dry-run](https://supabase.com/docs/reference/cli/supabase-db-push)
- [CLI migration filename parser](https://github.com/supabase/cli/blob/4e99f37dd9217f1f51aeaed3a3ff554759d4ffb1/apps/cli-go/pkg/migration/file.go)
- [CLI migration history primary key behavior](https://github.com/supabase/cli/blob/4e99f37dd9217f1f51aeaed3a3ff554759d4ffb1/apps/cli-go/pkg/migration/history.go)

`migration repair --status applied` changes migration history only; it does not execute the SQL. `db push --dry-run` prints the candidate list but does not prove that SQL can execute. `migration squash` is not used because it can omit data statements and expands the repair scope.

## Local forward-only layout

The five versions already present in production remain as comment-only compatibility markers:

```text
20260712_legacy_history_marker.sql
20260714_legacy_history_marker.sql
20260715_legacy_history_marker.sql
20260716_legacy_history_marker.sql
20260717_legacy_history_marker.sql
```

The ten original SQL files move, byte-for-byte, after the last legacy version. The complete mapping, original SQL SHA-256 pins, and exact read-only production-ledger baseline (version, name, statement count, and statement-array MD5) are machine-readable in `migration-history-map.json`.

The remote statement-array MD5 is a drift sentinel for the exact ledger export, not a cryptographic integrity proof or a production-schema fingerprint. Supabase list/push compares versions only, and a ledger row can be marked applied without executing SQL. The raw file SHA-256 and production object-level checks therefore remain separate mandatory evidence.

| Legacy group | New version      | Migration                      |
| ------------ | ---------------- | ------------------------------ |
| `20260712`   | `20260718000100` | knowledge workspace foundation |
| `20260712`   | `20260718000200` | document versions              |
| `20260712`   | `20260718000300` | document organization          |
| `20260714`   | `20260718000400` | document sources               |
| `20260714`   | `20260718000500` | publication flow               |
| `20260714`   | `20260718000600` | site-owner permissions         |
| `20260715`   | `20260718000700` | profile avatars                |
| `20260716`   | `20260718000800` | profile personalization        |
| `20260716`   | `20260718000900` | AI assistant foundation        |
| `20260717`   | `20260718001000` | AI runtime safety              |

Putting every new version after `20260717` is deliberate. Supabase reads files in filename order; using a longer version with the same date prefix would place the new file before the underscore in the old marker and break linked-history reconciliation.

Three renamed SQL files retain their original `Apply after ...` comments byte-for-byte. Those historical comments still name `20260712_document_organization.sql`, `20260714_document_sources.sql`, and `20260714_publication_flow.sql`; the mapping table above is authoritative. They are intentionally exempt from reference replacement so the original SQL hashes remain audit evidence. Historical operation records, handoffs, and the separately named `supabase/tests/20260717_ai_runtime_safety.sql` also keep their original names.

Run the permanent static guard with:

```powershell
npm run check:migrations
```

It rejects duplicate or malformed versions, executable legacy markers, changed legacy SQL hashes, non-monotonic CLI filename order, missing map entries, and a local prefix that no longer matches the known production ledger.

## Local and isolated-environment acceptance

Completed local evidence on 2026-07-17 with Supabase CLI `2.109.1`:

- A disposable project loaded the repository's documented base `schema.sql` before the migration sequence.
- A disposable synthetic owner identity satisfied the historical site-owner migration's explicit precondition; the fixture was never added to the product migrations and the temporary project was deleted.
- Two consecutive `db reset --local` runs applied the base schema, all five legacy markers, and all ten normalized migrations successfully.
- Normalized `pg_dump --schema-only` output for `public`, `storage`, and `auth` produced the same SHA-256 after both runs: `8ca4051d41d8c46856ca632305e19b8f6eb048568f5144cba77a424249806db2`.
- Both transaction-style SQL assertion scripts passed through `psql -v ON_ERROR_STOP=1` using synthetic owner and other-user profiles, covering owner isolation, cross-account rejection, browser audit-write denial, service-only runtime RPCs, and anonymous denial. The CLI `test db` wrapper was not used as the pass signal because these pre-existing scripts intentionally emit result rows rather than a pgTAP plan.
- The test containers, volumes, temporary copy, and copied linked-project metadata were removed after verification.

Before this branch can be proposed for merge:

1. Confirm `npm run check:migrations` passes.
2. Start a disposable local Supabase or isolated test project and replay from an empty database.
3. Run workspace and AI SQL tests, including owner/other/anonymous RLS and default-off runtime flags.
4. Reset and replay a second time; compare schema fingerprints and migration lists.
5. Run TypeScript, the full Quartz tests, and a production build.
6. Run a linked **read-only** migration list and dry-run. Before any repair, the only pending migrations should be the ten mapped `20260718...` versions; no old marker should be pending and no missing-local/out-of-order error is acceptable.

If a production object from any mapped SQL is missing, stop. That file must become a new forward-fix migration and must not be marked applied.

## Separately authorized production operation

The following is a future operation outline, not authorization:

1. Reconfirm project ref, backup, schema dump, row counts, function version, and both AI live flags off.
2. Export `supabase_migrations.schema_migrations` including version, name, and statements.
3. Prove the schema fingerprint for every mapped file.
4. With explicit user approval, mark each `20260718...` version applied in dependency order. Do not execute the ten SQL files, do not revert/delete the five legacy rows, and do not run `db push`.
5. Read migration history after every small batch and stop on any discrepancy.
6. Require linked `db push --dry-run` to report no pending migrations.
7. Re-run read-only schema/RLS/live-flag verification and append the complete operation record to `PRODUCTION_SAFETY.md`.

Merging the PR and writing production migration history each require fresh explicit user authorization. This task does not authorize SQL execution, function deployment, Secret/flag/budget changes, paid calls, content publication, or destructive cleanup.
