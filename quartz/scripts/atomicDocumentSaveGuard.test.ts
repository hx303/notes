import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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

const productionContract = readFileSync(
  new URL("../../supabase/tests/20260722_atomic_document_snapshot_contract.sql", import.meta.url),
  "utf8",
)

const productionActivityGate = readFileSync(
  new URL(
    "../../supabase/tests/20260722_atomic_document_snapshot_activity_gate.sql",
    import.meta.url,
  ),
  "utf8",
)

const productionStateFingerprint = readFileSync(
  new URL(
    "../../supabase/tests/20260722_atomic_document_snapshot_state_fingerprint.sql",
    import.meta.url,
  ),
  "utf8",
)

const residueCheck = readFileSync(
  new URL("../../supabase/tests/20260722_atomic_document_snapshot_residue.sql", import.meta.url),
  "utf8",
)

const migrationChain = readFileSync(
  new URL(
    "../../supabase/tests/20260722_atomic_document_snapshot_migration_chain.sql",
    import.meta.url,
  ),
  "utf8",
)

const productionRunbook = readFileSync(
  new URL(
    "../../.design/wouldkeep-next/runbooks/20260722000200-atomic-document-snapshot-save.md",
    import.meta.url,
  ),
  "utf8",
)

const expectedBehaviorScenarios = [
  "account_deletion_cascades_saved_receipts",
  "anonymous_execute_is_denied",
  "authenticated_cross_account_tag_squat_is_rejected",
  "authenticated_cannot_access_private_receipts_directly",
  "canonical_replay_returns_exact_saved_response",
  "core_and_organization_commit_together",
  "cross_owner_tag_insert_is_rejected_without_residue",
  "cross_knowledge_base_relationship_is_rejected",
  "downstream_failure_rolls_back_every_table",
  "historical_cross_owner_tag_is_detected_without_residue",
  "knowledge_base_owner_change_with_tags_is_rejected",
  "knowledge_base_deletion_cascades_tag_once",
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
  "same_owner_tag_save_preserves_global_owner_invariant",
  "soft_deleted_source_is_not_writable",
  "source_duplicate_ignores_fragment_but_preserves_path_case",
  "stale_revision_returns_read_only_conflict",
  "tag_owner_and_knowledge_base_updates_are_rejected",
  "unpersisted_conflict_recomputes_without_write_amplification",
  "unsafe_expected_revision_is_rejected",
]

function functionBody(sql: string, schema: string, functionName: string): string {
  const escapedSchema = schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = sql.match(
    new RegExp(
      `CREATE FUNCTION ${escapedSchema}\\.${escapedName}\\b[\\s\\S]*?AS \\$\\$(?<body>[\\s\\S]*?)\\$\\$;`,
    ),
  )
  assert.ok(match?.groups?.body, `missing body for ${schema}.${functionName}`)
  return match.groups.body
}

function normalizedBodyFingerprint(body: string): string {
  return createHash("md5").update(body.replace(/\s+/g, " ")).digest("hex")
}

function maskNonTopLevelSql(sql: string, preserveDollarBodies = false): string {
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
        if (preserveDollarBodies) {
          masked += mask(tag)
          masked += maskNonTopLevelSql(sql.slice(cursor + tag.length, bodyEnd), false)
          masked += mask(tag)
        } else {
          masked += mask(sql.slice(cursor, end))
        }
        cursor = end
        continue
      }
    }

    masked += sql[cursor]
    cursor += 1
  }

  return masked
}

function topLevelStatements(sql: string): string[] {
  const withoutPsqlMetaCommands = sql.replace(/^\s*\\[^\r\n]*(?:\r?\n|$)/gm, (line) =>
    line.replace(/[^\r\n]/g, " "),
  )
  return maskNonTopLevelSql(withoutPsqlMetaCommands)
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

function assertReadOnlyGate(sql: string): void {
  const topLevel = maskNonTopLevelSql(sql)
  assert.doesNotMatch(topLevel, /^\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT)\b/im)
  assert.doesNotMatch(topLevel, /^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|COPY)\b/im)
  assert.doesNotMatch(
    topLevel,
    /^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\b/im,
  )
  const executableBodies = maskNonTopLevelSql(sql, true)
  assert.doesNotMatch(
    executableBodies,
    /\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT|CALL|EXECUTE|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|COPY)\b/i,
  )
  assert.doesNotMatch(sql, /migration\s+repair/i)
}

function assertRollbackOnlyMatrix(sql: string): void {
  const metaCommands = sql.match(/^\s*\\.*$/gm) ?? []
  const allowedMetaCommand =
    /^(?:\\set ON_ERROR_STOP on|\\if :\{\?wouldkeep_p1b_20260722000200_disposable\}|\\else|\\set wouldkeep_p1b_20260722000200_disposable false|\\if :wouldkeep_p1b_20260722000200_disposable|\\echo 'Refusing to run: pass the exact disposable-environment confirmation variable\.'|\\endif)$/
  for (const metaCommand of metaCommands) {
    assert.match(metaCommand.trim(), allowedMetaCommand, `unsafe psql meta-command: ${metaCommand}`)
  }

  const maskedSql = maskNonTopLevelSql(sql)
  const statements = maskedSql
    .replace(/^\s*\\.*$/gm, "")
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

function assertRollbackOnlyMigrationChain(sql: string): void {
  const metaCommands = sql.match(/^\s*\\.*$/gm) ?? []
  const allowedMetaCommand =
    /^(?:\\set ON_ERROR_STOP on|\\if :\{\?wouldkeep_p1b_20260722000200_chain_disposable\}|\\else|\\set wouldkeep_p1b_20260722000200_chain_disposable false|\\if :wouldkeep_p1b_20260722000200_chain_disposable|\\echo 'Refusing to run: pass the exact disposable migration-chain confirmation variable\.'|\\endif|\\ir \.\.\/migrations\/20260722000150_normalize_existing_tags_for_atomic_save\.sql|\\ir 20260722_atomic_document_snapshot_preflight\.sql|\\ir \.\.\/migrations\/20260722000200_atomic_document_snapshot_save\.sql|\\ir 20260722_atomic_document_snapshot_contract\.sql)$/
  for (const metaCommand of metaCommands) {
    assert.match(
      metaCommand.trim(),
      allowedMetaCommand,
      `unsafe chain meta-command: ${metaCommand}`,
    )
  }

  const statements = topLevelStatements(sql)
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
  const lockTimeout = migration.indexOf("SET lock_timeout = '5s';")
  const statementTimeout = migration.indexOf("SET statement_timeout = '5min';")
  const firstDoBlock = migration.indexOf("DO $$")
  const statementReset = migration.lastIndexOf("RESET statement_timeout;")
  const lockReset = migration.lastIndexOf("RESET lock_timeout;")

  assert.ok(lockTimeout > -1 && lockTimeout < statementTimeout && statementTimeout < firstDoBlock)
  assert.ok(statementReset > firstDoBlock && statementReset < lockReset)
  assert.equal(migration.slice(lockReset).trim(), "RESET lock_timeout;")
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

test("tag ownership is a native bidirectional database invariant", () => {
  for (const sql of [migration, productionPreflight, productionContract]) {
    assert.match(sql, /LEFT JOIN public\.knowledge_bases knowledge_base/)
    assert.match(sql, /knowledge_base\.owner_id = tag\.owner_id/)
    assert.match(sql, /WHERE knowledge_base\.id IS NULL/)
  }
  assert.match(
    migration,
    /ADD CONSTRAINT knowledge_bases_id_owner_unique\s+UNIQUE \(id, owner_id\)/,
  )
  assert.match(
    migration,
    /ADD CONSTRAINT tags_knowledge_base_owner_fkey[\s\S]*FOREIGN KEY \(knowledge_base_id, owner_id\)[\s\S]*REFERENCES public\.knowledge_bases\(id, owner_id\)[\s\S]*ON UPDATE RESTRICT[\s\S]*ON DELETE CASCADE[\s\S]*NOT DEFERRABLE/,
  )
  assert.match(productionPreflight, /knowledge_bases_id_owner_unique/)
  assert.match(productionPreflight, /tags_knowledge_base_owner_fkey/)
  assert.match(productionContract, /catalog_constraint\.confupdtype = 'r'/)
  assert.match(productionContract, /catalog_constraint\.confdeltype = 'c'/)
  assert.match(productionContract, /catalog_constraint\.conkey = ARRAY/)
  assert.match(productionContract, /catalog_constraint\.confkey = ARRAY/)
  assert.match(productionContract, /catalog_index\.indisvalid/)
})

test("catalog fingerprints are derived from every reviewed atomic-save function body", () => {
  const fingerprints = {
    decode: normalizedBodyFingerprint(
      functionBody(migration, "wouldkeep_private", "percent_decode_url_component"),
    ),
    secret: normalizedBodyFingerprint(
      functionBody(migration, "wouldkeep_private", "source_url_has_secret"),
    ),
    receipt: normalizedBodyFingerprint(
      functionBody(migration, "wouldkeep_private", "require_valid_document_save_receipt"),
    ),
    save: normalizedBodyFingerprint(functionBody(migration, "public", "save_document_snapshot_v1")),
  }

  assert.deepEqual(fingerprints, {
    decode: "e5c327994552b280617a8820e4107d46",
    secret: "c4881a93b30fe7445f1fadadf17308e6",
    receipt: "9a6b5a61d9d8e615cee64f05574f5d4d",
    save: "9eeb474d4151b9639ed2db44d0e6a04c",
  })
  assert.match(
    productionContract,
    new RegExp(`procedure\\.oid = decode_helper[\\s\\S]*?${fingerprints.decode}`),
  )
  assert.match(
    productionContract,
    new RegExp(`procedure\\.oid = secret_helper[\\s\\S]*?${fingerprints.secret}`),
  )
  assert.match(
    productionContract,
    new RegExp(`procedure\\.oid = receipt_guard[\\s\\S]*?${fingerprints.receipt}`),
  )
  assert.match(
    productionContract,
    new RegExp(`procedure\\.oid = save_rpc[\\s\\S]*?${fingerprints.save}`),
  )
  assert.match(productionContract, /6dfbe536863354651eb24e0d6cff6a28/)
})

test("production contract pins owners, complete ACLs, exposure, and the exact target ledger", () => {
  for (const sql of [productionPreflight, productionContract]) {
    assertReadOnlyGate(sql)
  }
  assert.equal(topLevelStatements(productionPreflight).length, 2)
  assert.equal(topLevelStatements(productionContract).length, 1)
  assert.equal((productionPreflight.match(/atomic_save_preflight_passed/g) ?? []).length, 1)
  assert.match(
    productionPreflight,
    /\$\$;\s*SELECT\s+'atomic_save_preflight_passed' AS result,[\s\S]*FROM public\.documents[\s\S]*FROM public\.document_versions[\s\S]*FROM public\.tags[\s\S]*FROM public\.document_links[\s\S]*FROM public\.document_sources/,
  )
  assert.match(productionContract, /owner\.rolname = 'postgres'/)
  assert.match(
    productionContract,
    /procedure\.proconfig = ARRAY\['search_path=pg_catalog, pg_temp'\]/,
  )
  assert.match(productionContract, /LATERAL pg_catalog\.aclexplode/g)
  assert.match(productionContract, /acl\.is_grantable::TEXT/)
  assert.match(productionContract, /private schema ACL is not owner-only/)
  assert.match(productionContract, /private receipt table ACL is not owner-only/)
  assert.match(productionContract, /postgres\|MAINTAIN\|false\|postgres/)
  assert.match(productionContract, /a1606e84292826e2735ed41a52354a66/)
  assert.match(productionContract, /current_setting\('pgrst\.db_schemas', TRUE\)/)
  assert.match(productionContract, /actual_ledger IS DISTINCT FROM expected_ledger/)
  assert.match(productionContract, /count\(\*\).*schema_migrations[\s\S]*<> 21/)
  assert.match(
    productionContract,
    /version = '20260722000150'[\s\S]*name = 'normalize_existing_tags_for_atomic_save'/,
  )
  assert.match(productionContract, /name = 'atomic_document_snapshot_save'/)
  assert.match(productionContract, /atomic_document_snapshot_contract_passed/)
  assert.match(productionPreflight, /count\(\*\).*schema_migrations[\s\S]*<> 20/)
  assert.match(
    productionPreflight,
    /version = '20260722000150'[\s\S]*name = 'normalize_existing_tags_for_atomic_save'/,
  )
  assert.match(productionPreflight, /version = '20260722000200'/)
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
  assert.match(behaviorMatrix, /^\\set ON_ERROR_STOP on$/m)
  assert.match(behaviorMatrix, /:\{\?wouldkeep_p1b_20260722000200_disposable\}/)
  assert.match(behaviorMatrix, /-v wouldkeep_p1b_20260722000200_disposable=true/)
  assert.match(behaviorMatrix, /Disposable environment confirmation is required/)
  for (const scenario of expectedBehaviorScenarios) {
    assert.match(behaviorMatrix, new RegExp(`'${scenario}'`))
  }
  assert.match(behaviorMatrix, /SET LOCAL ROLE authenticated/)
  assert.match(behaviorMatrix, /SET LOCAL ROLE anon/)
  assert.match(behaviorMatrix, /expected_names TEXT\[\]/)
  assert.match(behaviorMatrix, /IF EXISTS \(SELECT 1 FROM atomic_save_results WHERE NOT passed\)/)
  assert.doesNotMatch(behaviorMatrix, /EXCEPTION WHEN OTHERS/i)
})

test("target-specific activity, fingerprint, residue, and runbook gates are pinned", () => {
  for (const sql of [productionActivityGate, productionStateFingerprint, residueCheck]) {
    assertReadOnlyGate(sql)
    assert.equal(topLevelStatements(sql).length, 1)
  }
  assert.match(productionActivityGate, /pg_catalog\.pg_stat_activity/)
  assert.match(productionActivityGate, /pg_catalog\.pg_locks/)
  assert.match(productionActivityGate, /INTERVAL '5 minutes'/)
  assert.match(productionActivityGate, /atomic_document_snapshot_activity_gate_passed/)
  assert.match(productionStateFingerprint, /md5\(COALESCE\(string_agg\(/)
  assert.match(productionStateFingerprint, /atomic_document_snapshot_state_fingerprint_passed/)
  assert.match(residueCheck, /p1b historical cross owner squat/)
  assert.match(residueCheck, /p1b-atomic-save-chain@example\.test/)
  assert.match(residueCheck, /to_regclass\('wouldkeep_private\.document_save_receipts'\)/)
  assert.match(residueCheck, /atomic_document_snapshot_rollback_residue_zero/)

  assert.match(productionRunbook, /Validated Supabase CLI: `2\.109\.1`/)
  assert.match(productionRunbook, /ApprovedSha/)
  assert.match(productionRunbook, /ApprovedProjectRef/)
  assert.match(productionRunbook, /20260722000200_atomic_document_snapshot_save\.sql/)
  assert.match(productionRunbook, /public-schema\.sql/)
  assert.match(productionRunbook, /public-data\.sql/)
  assert.match(productionRunbook, /migration-ledger-data\.sql/)
  assert.match(productionRunbook, /Assert-DumpArtifact/)
  assert.match(productionRunbook, /CREATE TABLE\\s\+/)
  assert.match(productionRunbook, /COPY\\s\+/)
  assert.match(productionRunbook, /20260722000100/)
  assert.match(productionRunbook, /20260722000150/)
  assert.match(productionRunbook, /19 -> 00150 -> 20 -> 00200 -> 21/)
  assert.match(productionRunbook, /20260722_atomic_document_snapshot_migration_chain\.sql/)
  assert.match(productionRunbook, /wouldkeep_p1b_20260722000200_chain_disposable=true/)
  assert.match(productionRunbook, /atomic_document_snapshot_migration_chain_passed/)
  assert.match(productionRunbook, /Get-FileHash .* -Algorithm SHA256/)
  assert.match(productionRunbook, /20260722_atomic_document_snapshot_activity_gate\.sql/)
  assert.match(productionRunbook, /20260722_atomic_document_snapshot_preflight\.sql/)
  assert.match(productionRunbook, /20260722_atomic_document_snapshot_state_fingerprint\.sql/)
  assert.match(productionRunbook, /20260722_atomic_document_snapshot_contract\.sql/)
  assert.match(productionRunbook, /"db", "push", "--linked", "--yes"/)
  assert.match(productionRunbook, /"db", "push", "--linked", "--dry-run"/)
  assert.match(productionRunbook, /ExpectedRemotePre/)
  assert.match(productionRunbook, /ExpectedRemotePost/)
  assert.match(productionRunbook, /Get-RemoteVersions/)
  assert.match(productionRunbook, /Assert-ExactVersions/)
  assert.match(productionRunbook, /\$ExpectedRemotePre = @\([\s\S]*"20260722000150"\s*\)/)
  assert.match(
    productionRunbook,
    /\$ExpectedRemotePost = @\(\$ExpectedRemotePre \+ "20260722000200"\)/,
  )
  assert.match(
    productionRunbook,
    /\$Versions\.Count -ne 1[\s\S]*\$Versions\[0\] -cne "20260722000200"/,
  )
  assert.match(productionRunbook, /Assert-DumpArtifact \$LedgerBackup[\s\S]*'20260722000150'/)
  assert.match(productionRunbook, /atomic_document_snapshot_contract_passed/)
  assert.ok(productionRunbook.includes("\\d{8}(?:\\d{6})?"))
  assert.match(productionRunbook, /PRODUCTION_SAFETY\.md/)

  const candidateStart = productionRunbook.indexOf(
    "$CandidateOutput = @(& $Psql -X --single-transaction",
  )
  const candidateEnd = productionRunbook.indexOf("$CandidateExit = $LASTEXITCODE", candidateStart)
  assert.ok(candidateStart > -1 && candidateEnd > candidateStart)
  const candidateProof = productionRunbook.slice(candidateStart, candidateEnd)
  const candidatePreflight = candidateProof.indexOf(
    "--file=supabase/tests/20260722_atomic_document_snapshot_preflight.sql",
  )
  const candidateMigration = candidateProof.indexOf(
    "--file=supabase/migrations/20260722000200_atomic_document_snapshot_save.sql",
  )
  const candidateBookkeeping = candidateProof.indexOf(
    "INSERT INTO supabase_migrations.schema_migrations",
  )
  const candidateContract = candidateProof.indexOf(
    "--file=supabase/tests/20260722_atomic_document_snapshot_contract.sql",
  )
  assert.ok(
    candidatePreflight > -1 &&
      candidateMigration > candidatePreflight &&
      candidateBookkeeping > candidateMigration &&
      candidateContract > candidateBookkeeping,
  )
  assert.equal((productionRunbook.match(/--single-transaction/g) ?? []).length, 1)
  assert.match(
    candidateProof,
    /\(version, statements, name\) VALUES \('20260722000200', ARRAY\['disposable candidate bookkeeping'\]::TEXT\[\], 'atomic_document_snapshot_save'\)/,
  )
  assert.match(
    productionRunbook,
    /\$CandidateExit -ne 0[\s\S]*atomic_save_preflight_passed[\s\S]*atomic_document_snapshot_contract_passed/,
  )
})

test("disposable migration chain proves exact 19-to-20-to-21 ordering", () => {
  assertRollbackOnlyMigrationChain(migrationChain)
  assert.match(migrationChain, /:\{\?wouldkeep_p1b_20260722000200_chain_disposable\}/)
  assert.match(migrationChain, /Disposable migration-chain confirmation is required/)

  const normalization = migrationChain.indexOf(
    "\\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql",
  )
  const ledger20 = migrationChain.indexOf("'20260722000150'", normalization)
  const preflight = migrationChain.indexOf("\\ir 20260722_atomic_document_snapshot_preflight.sql")
  const atomicSave = migrationChain.indexOf(
    "\\ir ../migrations/20260722000200_atomic_document_snapshot_save.sql",
  )
  const ledger21 = migrationChain.indexOf("'20260722000200'", atomicSave)
  const contract = migrationChain.indexOf("\\ir 20260722_atomic_document_snapshot_contract.sql")

  assert.ok(
    normalization > -1 &&
      ledger20 > normalization &&
      preflight > ledger20 &&
      atomicSave > preflight &&
      ledger21 > atomicSave &&
      contract > ledger21,
  )
  assert.equal(
    (migrationChain.match(/INSERT INTO supabase_migrations\.schema_migrations/g) ?? []).length,
    2,
  )
  for (const count of [19, 20, 21]) {
    assert.match(
      migrationChain,
      new RegExp(`count\\(\\*\\).*schema_migrations[\\s\\S]*?<> ${count}`),
    )
  }
  assert.match(migrationChain, /'Ａ　Ｂ'[\s\S]*'legacy-chain-key'/)
  assert.match(migrationChain, /name = 'A B'[\s\S]*normalized_name = 'a b'/)
  assert.match(migrationChain, /atomic_save_chain_reference_before/)
  assert.match(migrationChain, /atomic_document_snapshot_migration_chain_passed/)
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
  for (const unsafeMetaCommand of ["\\ir other.sql", "\\gexec", "\\copy x to y", "\\! whoami"]) {
    assert.throws(() => assertRollbackOnlyMatrix(`${unsafeMetaCommand}\n${safeFixture}`))
  }
})
