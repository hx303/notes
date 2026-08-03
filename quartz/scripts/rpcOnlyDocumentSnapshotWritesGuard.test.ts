import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const readRepositoryFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

const migration = readRepositoryFile(
  "supabase/migrations/20260723000100_rpc_only_document_snapshot_writes.sql",
)
const productionPreflight = readRepositoryFile(
  "supabase/tests/20260723_rpc_only_document_snapshot_preflight.sql",
)
const productionContract = readRepositoryFile(
  "supabase/tests/20260723_rpc_only_document_snapshot_contract.sql",
)
const behaviorMatrix = readRepositoryFile(
  "supabase/tests/20260723_rpc_only_document_snapshot_writes.sql",
)
const residueCheck = readRepositoryFile(
  "supabase/tests/20260723_rpc_only_document_snapshot_residue.sql",
)
const publicationFlow = readRepositoryFile(
  "supabase/migrations/20260718000500_publication_flow.sql",
)
const publicationSoftDeleteGuard = readRepositoryFile(
  "supabase/migrations/20260718001100_publication_soft_delete_guard.sql",
)

function functionBody(sql: string, functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\b[\\s\\S]*?AS \\$\\$(?<body>[\\s\\S]*?)\\$\\$;`,
    ),
  )
  assert.ok(match?.groups?.body, `missing body for public.${functionName}`)
  return match.groups.body
}

function normalizedBodyFingerprint(body: string): string {
  return createHash("md5").update(body.replace(/\s+/g, " ")).digest("hex")
}

function maskNonTopLevelSql(sql: string): string {
  let cursor = 0
  let masked = ""
  const mask = (value: string) => value.replace(/[^\r\n]/g, " ")

  while (cursor < sql.length) {
    if (sql.startsWith("--", cursor)) {
      const end = sql.indexOf("\n", cursor + 2)
      const next = end === -1 ? sql.length : end
      masked += mask(sql.slice(cursor, next))
      cursor = next
      continue
    }

    if (sql.startsWith("/*", cursor)) {
      let depth = 1
      let end = cursor + 2
      while (end < sql.length && depth > 0) {
        if (sql.startsWith("/*", end)) {
          depth += 1
          end += 2
        } else if (sql.startsWith("*/", end)) {
          depth -= 1
          end += 2
        } else {
          end += 1
        }
      }
      assert.equal(depth, 0, "SQL guard requires closed block comments")
      masked += mask(sql.slice(cursor, end))
      cursor = end
      continue
    }

    if (sql[cursor] === "'") {
      let end = cursor + 1
      let closed = false
      while (end < sql.length) {
        if (sql[end] !== "'") end += 1
        else if (sql[end + 1] === "'") end += 2
        else {
          end += 1
          closed = true
          break
        }
      }
      assert.ok(closed, "SQL guard requires closed string literals")
      masked += mask(sql.slice(cursor, end))
      cursor = end
      continue
    }

    if (sql[cursor] === '"') {
      let end = cursor + 1
      let closed = false
      while (end < sql.length) {
        if (sql[end] !== '"') end += 1
        else if (sql[end + 1] === '"') end += 2
        else {
          end += 1
          closed = true
          break
        }
      }
      assert.ok(closed, "SQL guard requires closed quoted identifiers")
      masked += mask(sql.slice(cursor, end))
      cursor = end
      continue
    }

    if (sql[cursor] === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(cursor))?.[0]
      if (tag) {
        const bodyEnd = sql.indexOf(tag, cursor + tag.length)
        assert.notEqual(bodyEnd, -1, `SQL guard requires a closing ${tag} delimiter`)
        const end = bodyEnd + tag.length
        masked += mask(sql.slice(cursor, end))
        cursor = end
        continue
      }
    }

    masked += sql[cursor]
    cursor += 1
  }

  return masked
}

function assertRollbackOnlyMatrix(sql: string): void {
  const statements = maskNonTopLevelSql(sql)
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  const transactionCommands = statements
    .filter((statement) =>
      /^(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION|COMMIT(?:\s+(?:WORK|TRANSACTION|PREPARED))?|END(?:\s+(?:WORK|TRANSACTION))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION|PREPARED|TO))?|ABORT(?:\s+(?:WORK|TRANSACTION))?|PREPARE\s+TRANSACTION)\b/i.test(
        statement,
      ),
    )
    .map((statement) => statement.toUpperCase())

  assert.deepEqual(transactionCommands, ["BEGIN", "ROLLBACK"])
  assert.equal(statements.at(-1)?.toUpperCase(), "ROLLBACK")
}

test("the ACL migration hard-depends on the reviewed 22000200 boundary before revoking", () => {
  const firstAclChange = migration.indexOf("REVOKE INSERT, UPDATE ON TABLE public.documents")
  assert.ok(firstAclChange > 0)

  for (const prerequisite of [
    "save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)",
    "wouldkeep_private.document_save_receipts",
    "atomic save owner/RLS contract failed for required relation",
    "atomic save RPC must remain authenticated-only",
    "service_role effective public-table baseline drifted",
    "documents column ABI changed",
    "unexpected API column-level write grant exists",
    "documents owner RLS policy set or expressions drifted",
  ]) {
    const prerequisiteIndex = migration.indexOf(prerequisite)
    assert.ok(prerequisiteIndex >= 0, `missing prerequisite: ${prerequisite}`)
    assert.ok(prerequisiteIndex < firstAclChange, `${prerequisite} must precede the first REVOKE`)
  }
})

test("retained lifecycle writes are pinned to the exact owner RLS policy catalog", () => {
  const expectedFingerprint = "d2447c03b8963da71b4b0f6a3f3c43c4"
  const firstAclChange = migration.indexOf("REVOKE INSERT, UPDATE ON TABLE public.documents")

  for (const sql of [migration, productionPreflight, productionContract]) {
    assert.match(sql, new RegExp(expectedFingerprint))
    assert.match(sql, /pg_catalog\.set_config\('search_path', 'public, pg_catalog', true\)/)
    assert.match(sql, /SELECT count\(\*\)[\s\S]*policy\.tablename = 'documents'[\s\S]*\) <> 4/)
    assert.match(sql, /policy\.roles = ARRAY\['public'\]::NAME\[\]/)
    assert.match(sql, /policy\.qual = '\(auth\.uid\(\) = owner_id\)'/)
    assert.match(sql, /kb\.id=documents\.knowledge_base_id/)
    assert.match(sql, /kb\.owner_id=auth\.uid\(\)/)
    assert.match(sql, /policy\.with_check !~\* '\(\^\|\[\^\[:alnum:\]_\]\)OR/)
    assert.match(sql, /documents owner RLS policy set or expressions drifted/)
  }

  assert.ok(migration.indexOf(expectedFingerprint) > 0)
  assert.ok(migration.indexOf(expectedFingerprint) < firstAclChange)
})

test("publication invoker fingerprints are derived from the reviewed source migrations", () => {
  const publishFingerprint = normalizedBodyFingerprint(
    functionBody(publicationFlow, "publish_document"),
  )
  const unpublishFingerprint = normalizedBodyFingerprint(
    functionBody(publicationSoftDeleteGuard, "unpublish_document"),
  )

  assert.equal(publishFingerprint, "ad486b52a196dc8311fd76d6d42d72c5")
  assert.equal(unpublishFingerprint, "9adc92ad6fa93f0611378370a23e650b")
  for (const sql of [migration, productionPreflight, productionContract]) {
    assert.match(sql, new RegExp(publishFingerprint))
    assert.match(sql, new RegExp(unpublishFingerprint))
  }

  assert.match(
    migration,
    /only status, visibility, published_at, and published_revision may be written/,
  )
  assert.match(
    productionPreflight,
    /publish\/unpublish drifted beyond the four approved document columns/,
  )
})

test("browser snapshot writes are removed while lifecycle columns stay explicit", () => {
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE ON TABLE public\.documents\s+FROM PUBLIC, anon, authenticated;/,
  )
  assert.match(
    migration,
    /GRANT UPDATE \(\s*deleted_at,\s*status,\s*visibility,\s*published_at,\s*published_revision\s*\) ON TABLE public\.documents TO authenticated;/,
  )
  assert.match(
    migration,
    /REVOKE DELETE ON TABLE public\.documents FROM PUBLIC, anon;\s+GRANT SELECT, DELETE ON TABLE public\.documents TO authenticated;/,
  )

  for (const relation of [
    "document_versions",
    "tags",
    "document_tags",
    "document_links",
    "document_sources",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE INSERT, UPDATE, DELETE ON TABLE public\\.${relation}\\s+FROM PUBLIC, anon, authenticated;`,
      ),
    )
  }

  assert.match(
    migration,
    /GRANT SELECT ON TABLE[\s\S]*public\.document_versions,[\s\S]*public\.document_sources\s+TO authenticated;/,
  )

  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.replace_document_sources\(UUID, JSONB\)\s+FROM PUBLIC, anon, authenticated;/,
  )
  assert.doesNotMatch(
    migration,
    /(?:REVOKE|GRANT).*save_document_snapshot_v1\(TEXT, UUID, UUID, BIGINT, JSONB\)/,
  )
})

test("trusted service access is preserved without exposing private receipt state", () => {
  const firstAclChange = migration.indexOf("REVOKE INSERT, UPDATE ON TABLE public.documents")
  for (const sql of [migration, productionPreflight]) {
    const failureMarker = sql.indexOf("service_role effective public-table baseline drifted")
    const baselineStart = sql.lastIndexOf("FOREACH relation_name IN ARRAY ARRAY[", failureMarker)
    const baselineEnd = sql.indexOf(
      "IF NOT EXISTS (\n    SELECT 1\n    FROM pg_catalog.pg_namespace namespace",
      failureMarker,
    )
    assert.ok(baselineStart >= 0 && baselineEnd > failureMarker)
    const serviceBaseline = sql.slice(baselineStart, baselineEnd)
    for (const relation of [
      "documents",
      "document_versions",
      "tags",
      "document_tags",
      "document_links",
      "document_sources",
    ]) {
      assert.match(serviceBaseline, new RegExp(`'public\\.${relation}'`))
    }
    assert.match(
      serviceBaseline,
      /FOREACH privilege_name IN ARRAY ARRAY\['SELECT', 'INSERT', 'UPDATE', 'DELETE'\]/,
    )
    assert.match(
      serviceBaseline,
      /NOT has_table_privilege\('service_role', relation_name, privilege_name\)/,
    )
    assert.match(serviceBaseline, /explicit GRANT would widen access/)
  }
  assert.ok(
    migration.indexOf("service_role effective public-table baseline drifted") < firstAclChange,
  )
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*public\.documents,[\s\S]*public\.document_sources\s+TO service_role;/,
  )
  for (const sql of [migration, productionPreflight, productionContract]) {
    assert.match(sql, /has_function_privilege\('service_role', save_rpc, 'EXECUTE'\)/)
    assert.match(sql, /has_schema_privilege\(application_role, 'wouldkeep_private', 'USAGE'\)/)
    assert.match(sql, /has_table_privilege\(application_role, receipt_relation, 'SELECT'\)/)
  }
  assert.match(productionContract, /private atomic-save objects are exposed to an API role/)
})

test("postconditions test effective inherited and direct PUBLIC privileges", () => {
  for (const sql of [migration, productionContract]) {
    assert.match(sql, /has_table_privilege\('authenticated', 'public\.documents', 'INSERT'\)/)
    assert.match(
      sql,
      /has_column_privilege\('authenticated', 'public\.documents', column_name, 'UPDATE'\)/,
    )
    assert.match(sql, /has_table_privilege\('anon', relation_name, 'DELETE'\)/)
  }
  assert.match(productionContract, /LATERAL pg_catalog\.aclexplode/)
  assert.match(productionContract, /acl\.grantee = 0/)
  assert.match(productionContract, /PUBLIC retains a direct snapshot-write grant/)
})

test("preflight and postflight are read-only and the migration contains no business DML", () => {
  for (const sql of [productionPreflight, productionContract]) {
    assert.doesNotMatch(sql, /^\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT)\b/im)
    assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im)
  }

  assert.doesNotMatch(migration, /^\s*INSERT\s+INTO\s+public\./im)
  assert.doesNotMatch(migration, /^\s*UPDATE\s+public\./im)
  assert.doesNotMatch(migration, /^\s*DELETE\s+FROM\s+public\./im)
  assert.doesNotMatch(migration, /^\s*TRUNCATE\b/im)
  assert.doesNotMatch(migration, /^BEGIN;$/m)
  assert.doesNotMatch(migration, /^COMMIT;$/m)
})

test("rollback-only runtime evidence covers the complete ACL and lifecycle matrix", () => {
  assertRollbackOnlyMatrix(behaviorMatrix)
  for (const scenario of [
    "anonymous_denied_zero_write",
    "atomic_existing_snapshot_and_publication_invariant",
    "atomic_new_and_replay_exactly_once",
    "atomic_replay_exactly_once",
    "atomic_stale_cas_zero_write",
    "authenticated_private_receipt_access_denied",
    "child_snapshot_writes_and_replace_rpc_denied",
    "hard_delete_preserved",
    "legacy_existing_save_denied_42501_zero_write",
    "legacy_new_save_denied_42501_zero_write",
    "other_user_denied_zero_write",
    "publish_unpublish_preserved",
    "rollback_fixture_namespace_clean_before_run",
    "soft_delete_restore_preserved",
  ]) {
    assert.match(behaviorMatrix, new RegExp(`'${scenario}'`))
  }
  assert.match(behaviorMatrix, /GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE/)
  assert.match(behaviorMatrix, /returned_state = '42501'/)
  assert.doesNotMatch(behaviorMatrix, /EXCEPTION WHEN OTHERS/i)
})

test("a separate read-only residue probe proves rollback cleanup", () => {
  assert.match(residueCheck, /operation_id LIKE 'rpc-only-acl-%'/)
  assert.match(residueCheck, /rpc_only_document_snapshot_rollback_residue_zero/)
  assert.doesNotMatch(residueCheck, /^\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT)\b/im)
  assert.doesNotMatch(residueCheck, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im)
})

test("rollback guard rejects commit aliases, prepared transactions, and forged comments", () => {
  const safeFixture = `
    BEGIN;
    DO $body$
    BEGIN
      RAISE NOTICE 'COMMIT; END; hidden inside a body';
    END;
    $body$;
    SELECT "ROLLBACK; COMMIT;";
    ROLLBACK;
  `

  assert.doesNotThrow(() => assertRollbackOnlyMatrix(safeFixture))
  for (const forbidden of [
    "COMMIT;",
    "END;",
    "END WORK;",
    "END TRANSACTION;",
    "SELECT 1; COMMIT;",
    "ABORT;",
    "PREPARE TRANSACTION 'rpc-only-acl';",
  ]) {
    assert.throws(() =>
      assertRollbackOnlyMatrix(safeFixture.replace(/ROLLBACK;\s*$/, `${forbidden}\n`)),
    )
  }
  assert.throws(() => assertRollbackOnlyMatrix("BEGIN;\n-- ROLLBACK;"))
})
