import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const publicationFlow = readFileSync(
  new URL("../../supabase/migrations/20260718000500_publication_flow.sql", import.meta.url),
  "utf8",
)

const softDeleteGuard = readFileSync(
  new URL(
    "../../supabase/migrations/20260718001100_publication_soft_delete_guard.sql",
    import.meta.url,
  ),
  "utf8",
)

const writeAclHardening = readFileSync(
  new URL(
    "../../supabase/migrations/20260718001200_publication_write_acl_hardening.sql",
    import.meta.url,
  ),
  "utf8",
)

const behaviorMatrix = readFileSync(
  new URL("../../supabase/tests/20260722_publication_reliability_matrix.sql", import.meta.url),
  "utf8",
)

const writeRpcs = [
  "public.publish_document(UUID, TEXT)",
  "public.unpublish_document(UUID)",
  "public.moderate_publication(UUID, TEXT)",
]

const scenarioNames = [
  "anon_publish_execute_denied",
  "anon_unpublish_execute_denied",
  "anon_visibility_matrix",
  "duplicate_publish_keeps_one_current_snapshot",
  "failed_publish_preserves_last_success",
  "other_user_cannot_publish_owner_document",
  "other_user_visibility_matrix",
  "owner_can_publish_public_and_unlisted",
  "owner_can_read_private_source",
  "republish_restores_stable_public_identity",
  "restore_does_not_republish",
  "second_withdraw_returns_false_current_contract",
  "soft_delete_hides_public_reader",
  "soft_delete_revokes_current_snapshot",
  "stale_revision_predicate_is_noop",
  "unlisted_republish_rotates_revoked_token",
  "withdraw_revokes_reader_and_resets_draft",
]

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
        if (sql[end] !== "'") {
          end += 1
        } else if (sql[end + 1] === "'") {
          end += 2
        } else {
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
        if (sql[end] !== '"') {
          end += 1
        } else if (sql[end + 1] === '"') {
          end += 2
        } else {
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
  const topLevelSql = maskNonTopLevelSql(sql)
  const statements = topLevelSql
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

test("publication remains one synchronous current-snapshot transaction", () => {
  assert.match(
    publicationFlow,
    /CREATE TABLE IF NOT EXISTS public\.document_publications \([\s\S]*document_id UUID PRIMARY KEY/,
  )
  assert.match(
    publicationFlow,
    /FUNCTION public\.publish_document\(\s*p_document_id UUID,\s*p_audience TEXT\s*\)[\s\S]*RETURNS JSONB[\s\S]*SECURITY INVOKER/,
  )
  assert.match(
    publicationFlow,
    /FROM public\.documents document[\s\S]*document\.deleted_at IS NULL[\s\S]*FOR UPDATE/,
  )
  assert.match(
    publicationFlow,
    /INSERT INTO public\.document_publications[\s\S]*ON CONFLICT \(document_id\) DO UPDATE SET[\s\S]*UPDATE public\.documents/,
  )
  assert.doesNotMatch(publicationFlow, /publication_(?:jobs|queue)|enqueue_publication/i)
})

test("RLS and live-source readers preserve the last-success pointer boundary", () => {
  assert.match(
    publicationFlow,
    /ALTER TABLE public\.document_publications ENABLE ROW LEVEL SECURITY/,
  )
  assert.equal(
    (
      softDeleteGuard.match(
        /CREATE POLICY "Owners can (?:read|create|update) own publications"/g,
      ) ?? []
    ).length,
    3,
  )
  assert.match(
    softDeleteGuard,
    /BEFORE UPDATE OF deleted_at[\s\S]*DELETE FROM public\.document_publications publication/,
  )
  assert.match(
    softDeleteGuard,
    /BEFORE INSERT OR UPDATE ON public\.document_publications[\s\S]*require_live_source_for_document_publication/,
  )
  assert.equal((softDeleteGuard.match(/JOIN public\.documents source_document/g) ?? []).length, 2)
  assert.equal((softDeleteGuard.match(/source_document\.deleted_at IS NULL/g) ?? []).length, 2)
})

test("write ACL stays signed-in only while anonymous reader ABI stays explicit", () => {
  for (const rpc of writeRpcs) {
    const escapedRpc = rpc.replace(/[().]/g, "\\$&")
    assert.match(
      writeAclHardening,
      new RegExp(`REVOKE EXECUTE ON FUNCTION ${escapedRpc}\\s+FROM PUBLIC, anon;`),
    )
    assert.match(
      writeAclHardening,
      new RegExp(`GRANT EXECUTE ON FUNCTION ${escapedRpc}\\s+TO authenticated, service_role;`),
    )
  }

  assert.match(
    softDeleteGuard,
    /FUNCTION public\.read_published_document\([\s\S]*RETURNS JSONB[\s\S]*STABLE[\s\S]*SECURITY DEFINER/,
  )
  assert.match(
    softDeleteGuard,
    /FUNCTION public\.list_public_documents\([\s\S]*RETURNS JSONB[\s\S]*STABLE[\s\S]*SECURITY DEFINER/,
  )
  assert.match(
    softDeleteGuard,
    /GRANT EXECUTE ON FUNCTION public\.read_published_document\(UUID, UUID\) TO anon, authenticated/,
  )
  assert.match(
    softDeleteGuard,
    /GRANT EXECUTE ON FUNCTION public\.list_public_documents\(INTEGER, INTEGER\) TO anon, authenticated/,
  )
})

test("the pending rollback-only SQL matrix contains executable P1A candidate probes", () => {
  assertRollbackOnlyMatrix(behaviorMatrix)

  for (const scenarioName of scenarioNames) {
    const resultInsertPattern = new RegExp(
      `INSERT INTO publication_reliability_results VALUES \\(\\s*'${scenarioName}'`,
      "g",
    )
    assert.ok((behaviorMatrix.match(resultInsertPattern) ?? []).length >= 1)
  }

  for (const exceptionScenario of [
    "failed_publish_preserves_last_success",
    "other_user_cannot_publish_owner_document",
  ]) {
    const resultInsertPattern = new RegExp(
      `INSERT INTO publication_reliability_results VALUES \\(\\s*'${exceptionScenario}'`,
      "g",
    )
    assert.equal((behaviorMatrix.match(resultInsertPattern) ?? []).length, 2)
  }

  assert.match(behaviorMatrix, /SET LOCAL ROLE authenticated/)
  assert.match(behaviorMatrix, /SET LOCAL ROLE anon/)
  assert.match(behaviorMatrix, /request\.jwt\.claim\.sub[\s\S]*other_id/)
  assert.match(
    behaviorMatrix,
    /stale-revision predicate probe only[\s\S]*revision = 99[\s\S]*'stale_revision_predicate_is_noop'/,
  )
  assert.match(
    behaviorMatrix,
    /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM IS DISTINCT FROM 'Body content is required before publishing' THEN\s+RAISE;/,
  )
  assert.match(
    behaviorMatrix,
    /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM IS DISTINCT FROM 'Document not found or not owned by current user' THEN\s+RAISE;/,
  )
  assert.doesNotMatch(behaviorMatrix, /EXCEPTION WHEN OTHERS/i)
  assert.match(
    behaviorMatrix,
    /expected_names TEXT\[\][\s\S]*IF EXISTS \(SELECT 1 FROM publication_reliability_results WHERE NOT passed\)/,
  )
})

test("rollback guard rejects top-level commit aliases and forged rollback comments", () => {
  const safeFixture = `
    BEGIN;
    DO $body$
    BEGIN
      RAISE NOTICE 'END; inside a body is not a transaction command';
    END;
    $body$;
    SELECT "END; COMMIT;";
    ROLLBACK;
  `

  assert.doesNotThrow(() => assertRollbackOnlyMatrix(safeFixture))
  for (const commitAlias of [
    "COMMIT;",
    "END;",
    "END WORK;",
    "END TRANSACTION;",
    "SELECT 1; COMMIT;",
    "ABORT;",
    "PREPARE TRANSACTION 'p1';",
  ]) {
    const mutated = safeFixture.replace("ROLLBACK;", `${commitAlias}\nROLLBACK;`)
    assert.throws(() => assertRollbackOnlyMatrix(mutated))
  }
  assert.throws(() => assertRollbackOnlyMatrix("BEGIN;\n-- ROLLBACK;"))
})

test("legacy retry gaps remain explicit pending versioned atomic replacements", () => {
  assert.match(
    publicationFlow,
    /ON CONFLICT \(document_id\) DO UPDATE SET[\s\S]*published_at = NOW\(\)/,
  )
  assert.match(
    softDeleteGuard,
    /FUNCTION public\.unpublish_document[\s\S]*IF NOT FOUND THEN\s*RETURN FALSE/,
  )
  assert.doesNotMatch(publicationFlow, /operation_id/i)
  assert.doesNotMatch(publicationFlow, /publication_(?:jobs|queue)|enqueue_publication/i)
})
