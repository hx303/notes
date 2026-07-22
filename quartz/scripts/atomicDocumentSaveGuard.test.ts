import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260722000200_atomic_document_snapshot_save.sql",
    import.meta.url,
  ),
  "utf8",
)

const behaviorMatrix = readFileSync(
  new URL("../../supabase/tests/20260722_atomic_document_snapshot_save.sql", import.meta.url),
  "utf8",
)

const productionPreflight = readFileSync(
  new URL("../../supabase/tests/20260722_atomic_document_snapshot_preflight.sql", import.meta.url),
  "utf8",
)

const expectedBehaviorScenarios = [
  "account_deletion_cascades_saved_receipts",
  "anonymous_execute_is_denied",
  "authenticated_cannot_access_private_receipts_directly",
  "canonical_replay_returns_exact_saved_response",
  "core_and_organization_commit_together",
  "cross_knowledge_base_relationship_is_rejected",
  "downstream_failure_rolls_back_every_table",
  "new_deleted_target_relationship_is_rejected",
  "new_document_hard_delete_replay_does_not_recreate",
  "new_document_lost_ack_replay_creates_exactly_once",
  "nonpublished_status_returns_to_draft",
  "not_found_is_zero_write",
  "omitting_tombstone_removes_it_without_touching_continues",
  "only_successful_commits_have_receipts",
  "operation_id_hash_mismatch_is_rejected",
  "other_user_attempt_leaves_owner_state_unchanged",
  "other_user_cannot_replay_or_bind_owner_receipt",
  "owner_atomic_save_returns_versioned_ack",
  "owner_document_cannot_move_across_knowledge_bases",
  "percent_encoded_sensitive_source_key_is_rejected",
  "publication_last_success_survives_all_save_attempts",
  "publication_snapshot_is_last_success_unchanged",
  "relationship_tombstone_and_continues_are_preserved",
  "saved_receipts_contain_no_document_body",
  "saved_receipts_reject_malformed_inserts",
  "soft_deleted_source_is_not_writable",
  "source_duplicate_ignores_fragment_but_preserves_path_case",
  "stale_revision_returns_read_only_conflict",
  "unpersisted_conflict_recomputes_without_write_amplification",
  "unsafe_expected_revision_is_rejected",
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

test("atomic save is a strict authenticated-only definer boundary", () => {
  assert.match(
    migration,
    /to_regprocedure\('public\.grant_role\(uuid,text,text\)'\) IS NULL[\s\S]*20260722000100 site-owner invariant is not deployed/,
  )
  assert.match(
    migration,
    /CREATE FUNCTION public\.save_document_snapshot_v1\([\s\S]*RETURNS JSONB[\s\S]*SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/,
  )
  assert.match(migration, /actor_id UUID := auth\.uid\(\)/)
  assert.match(migration, /IF actor_id IS NULL[\s\S]*ERRCODE = '42501'/)
  assert.match(migration, /knowledge_base\.owner_id = actor_id\s+FOR KEY SHARE/)
  assert.match(
    migration,
    /document\.owner_id = actor_id[\s\S]*document\.deleted_at IS NULL\s+FOR UPDATE/,
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.save_document_snapshot_v1\(TEXT, UUID, UUID, BIGINT, JSONB\)\s+FROM PUBLIC, anon, service_role/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.save_document_snapshot_v1\(TEXT, UUID, UUID, BIGINT, JSONB\)\s+TO authenticated/,
  )
})

test("saved receipts are private, exact, append-only, and content-free", () => {
  const receiptTrigger =
    migration.match(
      /CREATE TRIGGER document_save_receipts_require_valid_owner_document[\s\S]*?;/,
    )?.[0] ?? ""

  assert.match(migration, /CREATE SCHEMA wouldkeep_private/)
  assert.match(
    migration,
    /REVOKE ALL ON SCHEMA wouldkeep_private\s+FROM PUBLIC, anon, authenticated, service_role/,
  )
  assert.match(
    migration,
    /REVOKE ALL ON TABLE wouldkeep_private\.document_save_receipts\s+FROM PUBLIC, anon, authenticated, service_role/,
  )
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*document_save_receipts/)
  assert.match(
    migration,
    /ALTER TABLE wouldkeep_private\.document_save_receipts ENABLE ROW LEVEL SECURITY/,
  )
  assert.doesNotMatch(migration, /document_save_receipts FORCE ROW LEVEL SECURITY/)
  assert.match(migration, /response->'operation_id' = to_jsonb\(operation_id\)/)
  assert.match(migration, /document_save_receipts_response_exact_keys/)
  assert.match(receiptTrigger, /BEFORE INSERT\s+ON wouldkeep_private\.document_save_receipts/)
  assert.doesNotMatch(
    receiptTrigger,
    /BEFORE INSERT OR UPDATE|BEFORE INSERT OR DELETE|BEFORE UPDATE OR DELETE/,
  )
  assert.match(migration, /response JSONB NOT NULL/)
  assert.match(
    migration,
    /retaining[\s\S]*receipt prevents that lost acknowledgement from creating a duplicate[\s\S]*document_id UUID NOT NULL,/,
  )
  assert.doesNotMatch(migration, /document_id UUID NOT NULL REFERENCES public\.documents/)
  assert.match(
    migration,
    /knowledge_base_id UUID NOT NULL REFERENCES public\.knowledge_bases\(id\) ON DELETE CASCADE/,
  )
  assert.doesNotMatch(
    migration.match(
      /CREATE TABLE wouldkeep_private\.document_save_receipts \([\s\S]*?\n\);/,
    )?.[0] ?? "",
    /\b(?:body|snapshot|payload)\b/i,
  )
})

test("deployment fails closed when the private schema is exposed to PostgREST", () => {
  for (const sql of [migration, productionPreflight]) {
    assert.match(sql, /current_setting\('pgrst\.db_schemas', TRUE\)/)
    assert.match(sql, /FROM pg_catalog\.pg_roles role/)
    assert.match(sql, /FROM pg_catalog\.pg_db_role_setting setting/)
    assert.match(sql, /wouldkeep_private is configured as a PostgREST exposed schema/)
  }
})

test("request validation, canonical hashing, and JS-safe CAS are explicit", () => {
  assert.match(migration, /snapshot contains an unsupported field/)
  assert.match(migration, /snapshot exceeds the 5000000-byte v1 request limit/)
  assert.match(migration, /snapshot\.body exceeds the v1 character or UTF-8 byte limit/)
  assert.match(migration, /p_expected_revision > 9007199254740990/)
  assert.match(migration, /source_document\.revision > 9007199254740990/)
  assert.match(migration, /normalize\(value #>> '\{\}', NFKC\)/)
  assert.match(migration, /canonical_value ~ '\^\[\[:punct:\]\[:space:\]\]\+\$'/)
  assert.match(migration, /'snapshot', canonical_snapshot/)
  assert.match(migration, /RAISE EXCEPTION 'operation_id_reused' USING ERRCODE = '22023'/)
  assert.match(migration, /RETURN receipt\.response/)
})

test("organization sync preserves tombstones, continues, and source URL semantics", () => {
  assert.match(migration, /cannot create a deleted-target relationship/)
  assert.match(
    migration,
    /relation_type_value[\s\S]*existing_link\.relation_type = relation_type_value/,
  )
  assert.match(migration, /Only prerequisite\/related are synchronized[\s\S]*`continues`/)
  assert.doesNotMatch(migration, /relation_type = 'continues'.*(?:DELETE|UPDATE)/)
  assert.match(migration, /percent_decode_url_component/)
  assert.match(migration, /source_url_has_secret/)
  assert.match(migration, /SELECT regexp_replace\(source\.value->>'url', '#\.\*\$', ''\) AS url/)
  assert.doesNotMatch(migration, /regexp_replace\(lower\(source\.value->>'url'/)
  assert.match(migration, /source_kind = 'personal' AND \(source_url <> ''/)
  assert.match(migration, /CASE WHEN source_kind = 'web' THEN source_value->>'url' ELSE NULL END/)
})

test("one transaction preserves legacy status and last-success publication metadata", () => {
  assert.match(
    migration,
    /status = CASE\s+WHEN source_document\.status = 'published' THEN 'published'\s+ELSE 'draft'\s+END/,
  )
  assert.match(migration, /INSERT INTO public\.document_versions/)
  assert.match(migration, /DELETE FROM public\.document_tags/)
  assert.match(migration, /DELETE FROM public\.document_links/)
  assert.match(migration, /DELETE FROM public\.document_sources/)
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|DELETE FROM) public\.document_publications/)
})

test("rollback-only behavior matrix contains the complete security and reliability set", () => {
  assertRollbackOnlyMatrix(behaviorMatrix)
  for (const scenario of expectedBehaviorScenarios) {
    assert.match(behaviorMatrix, new RegExp(`'${scenario}'`))
  }
  assert.match(behaviorMatrix, /SET LOCAL ROLE authenticated/)
  assert.match(behaviorMatrix, /SET LOCAL ROLE anon/)
  assert.match(behaviorMatrix, /expected_names TEXT\[\]/)
  assert.match(behaviorMatrix, /IF EXISTS \(SELECT 1 FROM atomic_save_results WHERE NOT passed\)/)
  assert.doesNotMatch(behaviorMatrix, /EXCEPTION WHEN OTHERS/i)
})

test("rollback guard rejects commits, aliases, prepared transactions, and forged comments", () => {
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
    "PREPARE TRANSACTION 'atomic-save';",
  ]) {
    assert.throws(() =>
      assertRollbackOnlyMatrix(safeFixture.replace(/ROLLBACK;\s*$/, `${forbidden}\n`)),
    )
  }
  assert.throws(() => assertRollbackOnlyMatrix("BEGIN;\n-- ROLLBACK;"))
})
