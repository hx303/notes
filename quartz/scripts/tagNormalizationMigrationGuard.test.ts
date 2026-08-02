import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const readRepositoryFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

const migration = readRepositoryFile(
  "supabase/migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql",
)
const productionPreflight = readRepositoryFile(
  "supabase/tests/20260722_tag_normalization_preflight.sql",
)
const productionContract = readRepositoryFile(
  "supabase/tests/20260722_tag_normalization_contract.sql",
)
const productionActivityGate = readRepositoryFile(
  "supabase/tests/20260722_tag_normalization_activity_gate.sql",
)
const productionStateFingerprint = readRepositoryFile(
  "supabase/tests/20260722_tag_normalization_state_fingerprint.sql",
)
const behaviorMatrix = readRepositoryFile("supabase/tests/20260722_tag_normalization.sql")
const collisionFixture = readRepositoryFile(
  "supabase/tests/20260722_tag_normalization_collision.sql",
)
const invalidFixture = readRepositoryFile("supabase/tests/20260722_tag_normalization_invalid.sql")
const residueCheck = readRepositoryFile("supabase/tests/20260722_tag_normalization_residue.sql")
const productionRunbook = readRepositoryFile(
  ".design/wouldkeep-next/runbooks/20260722000150-tag-normalization.md",
)

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
  return maskNonTopLevelSql(sql.replace(/^\s*\\[^\r\n]*(?:\r?\n|$)/gm, ""))
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

const transactionCommandPattern =
  /^(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION|COMMIT(?:\s+(?:WORK|TRANSACTION|PREPARED))?|END(?:\s+(?:WORK|TRANSACTION))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION|PREPARED|TO))?|ABORT(?:\s+(?:WORK|TRANSACTION))?|PREPARE\s+TRANSACTION)\b/i

function transactionCommands(sql: string): string[] {
  return topLevelStatements(sql)
    .filter((statement) => transactionCommandPattern.test(statement))
    .map((statement) => statement.toUpperCase())
}

function psqlMetaCommands(sql: string): string[] {
  return (sql.match(/^\s*\\.*$/gm) ?? []).map((command) => command.trim())
}

test("migration is a bounded two-phase in-place tag update", () => {
  const statements = topLevelStatements(migration)
  assert.equal(statements.length, 5)
  assert.match(statements[0], /^SET lock_timeout =/)
  assert.match(statements[1], /^SET statement_timeout =/)
  assert.match(statements[2], /^DO\b/)
  assert.match(statements[3], /^RESET statement_timeout$/)
  assert.match(statements[4], /^RESET lock_timeout$/)

  const body = migration.match(/DO \$tag_normalization\$(?<body>[\s\S]*?)\$tag_normalization\$;/)
    ?.groups?.body
  assert.ok(body, "migration DO body is missing")
  const executable = maskNonTopLevelSql(body, true)

  assert.equal((executable.match(/\bUPDATE\s+public\.tags\b/gi) ?? []).length, 2)
  assert.equal((executable.match(/\bUPDATE\b/gi) ?? []).length, 2)
  assert.doesNotMatch(
    executable,
    /\b(?:INSERT|DELETE|MERGE|TRUNCATE|COPY|EXECUTE|ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT)\b/i,
  )
  assert.match(
    migration,
    /LOCK TABLE public\.tags, public\.document_tags IN SHARE ROW EXCLUSIVE MODE/,
  )
  assert.match(migration, /SET lock_timeout = '5s'/)
  assert.match(migration, /SET statement_timeout = '5min'/)
  assert.equal((migration.match(/GET DIAGNOSTICS phase_row_count = ROW_COUNT/g) ?? []).length, 2)
  assert.match(migration, /SET normalized_name =\s*'__wouldkeep_tmp_22000150_'/)
  assert.match(
    migration,
    /SET\s+name = regexp_replace[\s\S]*normalized_name = lower\(regexp_replace/,
  )
  assert.doesNotMatch(migration, /LIKE '__wouldkeep_tmp_22000150_%'/)
  assert.match(
    migration,
    /left\([\s\S]*char_length\('__wouldkeep_tmp_22000150_'\)[\s\S]*= '__wouldkeep_tmp_22000150_'/,
  )
  assert.doesNotMatch(migration, /\b(?:462|65)\b/)
})

test("all failures precede writes and all immutable state is verified after writes", () => {
  const firstUpdate = migration.indexOf("UPDATE public.tags tag")
  for (const prerequisite of [
    "a tag cannot be represented by the v1 canonical contract",
    "canonical tag names would collide inside a knowledge base",
    "the reserved tag-normalization keyspace is not empty",
    "expected_tag_fingerprint",
  ]) {
    const index = migration.indexOf(prerequisite)
    assert.ok(index > -1 && index < firstUpdate, `${prerequisite} must precede the first write`)
  }
  assert.match(migration, /actual_tag_fingerprint IS DISTINCT FROM expected_tag_fingerprint/)
  assert.match(migration, /immutable_tag_fingerprint_before/)
  assert.match(migration, /document_tag_fingerprint_before/)
  assert.match(migration, /document_tag_count_before/)
  assert.match(migration, /20260722000100 and the tag relations must exist/)
  assert.match(migration, /20260722000200 is already present/)
  assert.match(migration, /affected_count := cardinality\(affected_ids\)/)
  assert.match(migration, /phase_row_count <> affected_count/g)
})

test("migration and the future atomic-save contract use the identical canonical formula", () => {
  const compact = migration.replace(/\s+/g, " ")
  assert.match(
    compact,
    /regexp_replace\( btrim\(normalize\(tag\.name, NFKC\)\), '\[\[:space:\]\]\+', ' ', 'g' \)/,
  )
  assert.match(migration, /intended\.canonical_name ~ '\^\[\[:punct:\]\[:space:\]\]\+\$'/)
  assert.match(migration, /char_length\(intended\.canonical_name\) > 80/)
})

test("production gates are single-statement read-only aggregate contracts", () => {
  for (const sql of [
    productionPreflight,
    productionContract,
    productionActivityGate,
    productionStateFingerprint,
    residueCheck,
  ]) {
    assertReadOnlyGate(sql)
    assert.equal(topLevelStatements(sql).length, 1)
  }

  for (const sql of [productionPreflight, productionContract, productionStateFingerprint]) {
    assert.doesNotMatch(
      sql,
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
  }

  assert.match(productionPreflight, /count\(\*\) FROM public\.tags\) <> 462/)
  assert.match(productionPreflight, /candidate_count <> 6/)
  assert.match(productionPreflight, /affected_reference_count <> 65/)
  assert.match(productionPreflight, /transient_collision_count <> 0/)
  assert.match(productionPreflight, /count\(\*\).*schema_migrations[\s\S]*<> 19/)
  assert.match(productionPreflight, /version IN \('20260722000150', '20260722000200'\)/)
  assert.match(productionPreflight, /tag_normalization_preflight_passed/)

  assert.match(productionContract, /count\(\*\) FROM public\.tags\) <> 462/)
  assert.match(productionContract, /count\(\*\).*schema_migrations[\s\S]*<> 20/)
  assert.match(productionContract, /name = 'normalize_existing_tags_for_atomic_save'/)
  assert.match(productionContract, /version = '20260722000200'/)
  assert.match(productionContract, /tag_normalization_contract_passed/)

  assert.match(productionActivityGate, /pg_catalog\.pg_stat_activity/)
  assert.match(productionActivityGate, /pg_catalog\.pg_locks/)
  assert.match(productionActivityGate, /INTERVAL '5 minutes'/)
  assert.match(productionActivityGate, /tag_normalization_activity_gate_passed/)

  assert.equal((productionStateFingerprint.match(/sha256\(/g) ?? []).length, 4)
  assert.match(productionStateFingerprint, /tag_normalization_state\|tags=/)
  assert.match(productionStateFingerprint, /\|affected_refs=/)
  assert.match(productionStateFingerprint, /\|document_tags=/)
})

test("positive behavior fixture proves six in-place changes, 65 references, and idempotency", () => {
  assert.deepEqual(transactionCommands(behaviorMatrix), ["BEGIN", "ROLLBACK"])
  assert.equal(topLevelStatements(behaviorMatrix).at(-1)?.toUpperCase(), "ROLLBACK")

  const allowedMetaCommand =
    /^(?:\\set ON_ERROR_STOP on|\\if :\{\?wouldkeep_p1b_20260722000150_disposable\}|\\else|\\set wouldkeep_p1b_20260722000150_disposable false|\\if :wouldkeep_p1b_20260722000150_disposable|\\echo 'Refusing to run: pass the exact disposable-environment confirmation variable\.'|\\endif|\\ir \.\.\/migrations\/20260722000150_normalize_existing_tags_for_atomic_save\.sql)$/
  for (const command of psqlMetaCommands(behaviorMatrix)) {
    assert.match(command, allowedMetaCommand, `unsafe psql meta-command: ${command}`)
  }
  assert.equal(
    psqlMetaCommands(behaviorMatrix).filter((command) => command.startsWith("\\ir ")).length,
    2,
  )

  for (const scenario of [
    "rollback_fixture_namespace_clean_before_run",
    "second_apply_is_idempotent",
    "six_tags_canonicalized_in_place",
    "sixty_five_references_preserved",
    "tag_identity_and_metadata_preserved",
    "transient_unique_swap_succeeds",
  ]) {
    assert.match(behaviorMatrix, new RegExp(`'${scenario}'`))
  }
  assert.match(behaviorMatrix, /generate_series\(1, 65\)/g)
  assert.match(behaviorMatrix, /'Ａ', 'b'/)
  assert.match(behaviorMatrix, /'Ｂ', 'a'/)
  assert.match(behaviorMatrix, /EXCEPT/g)
})

test("negative fixtures fail inside open disposable transactions and residue is observable", () => {
  for (const [fixture, confirmation] of [
    [collisionFixture, "wouldkeep_p1b_20260722000150_collision_disposable"],
    [invalidFixture, "wouldkeep_p1b_20260722000150_invalid_disposable"],
  ] as const) {
    assert.deepEqual(transactionCommands(fixture), ["BEGIN"])
    assert.doesNotMatch(maskNonTopLevelSql(fixture), /^\s*(?:COMMIT|END|ROLLBACK|ABORT)\b/im)
    const metaCommands = psqlMetaCommands(fixture)
    assert.equal(metaCommands.filter((command) => command.startsWith("\\ir ")).length, 1)
    assert.ok(metaCommands.some((command) => command.includes(confirmation)))
    assert.ok(
      metaCommands.includes(
        "\\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql",
      ),
    )
  }
  assert.match(collisionFixture, /'Ａ', 'legacy-a'[\s\S]*'A', 'a'/)
  assert.match(invalidFixture, /'！！！', 'legacy-punctuation'/)
  assert.match(residueCheck, /tag_normalization_rollback_residue_zero/)
  assert.match(residueCheck, /temporary_keys/)
})

test("runbook pins the isolated gate branch, three backups, and read-only preflight", () => {
  assert.match(productionRunbook, /Validated Supabase CLI: `2\.109\.1`/)
  assert.match(productionRunbook, /release\/p1b-00150-tag-write-pause-gate/)
  assert.match(productionRunbook, /19571ca19dabc80aeacac7a1ac016667dcaa9f0f/)
  assert.match(productionRunbook, /ApprovedSha/)
  assert.match(productionRunbook, /ApprovedProjectRef/)
  assert.match(productionRunbook, /public-schema\.sql/)
  assert.match(productionRunbook, /public-data\.sql/)
  assert.match(productionRunbook, /migration-ledger-data\.sql/)
  assert.match(productionRunbook, /Get-FileHash[\s\S]*-Algorithm SHA256/)
  assert.match(productionRunbook, /20260722000150_normalize_existing_tags_for_atomic_save\.sql/)
  assert.match(productionRunbook, /20260722_tag_normalization_preflight\.sql/)
  assert.match(productionRunbook, /20260722_tag_normalization_state_fingerprint\.sql/)
  assert.match(productionRunbook, /\$ExpectedRemotePre = @\([\s\S]*"20260722000100"\s*\)/)
  assert.match(
    productionRunbook,
    /\$ExpectedLocalPre = @\(\$ExpectedRemotePre \+ "20260722000150"\)/,
  )
  for (const helper of [
    "function Invoke-Capture",
    "function Assert-Identity",
    "function Assert-OnlyTargetPending",
    "function Get-TagState",
    "function Assert-ResidueZero",
    "function Invoke-PsqlCapture",
  ]) {
    assert.match(productionRunbook, new RegExp(helper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  assert.match(
    productionRunbook,
    /\$Exit = \$LASTEXITCODE[\s\S]*Write-Evidence[\s\S]*if \(\$Exit -ne 0\)/,
  )
  assert.match(productionRunbook, /\) 3 "Disposable environment confirmation is required"/)
  assert.match(
    productionRunbook,
    /\) 3 "canonical tag names would collide inside a knowledge base"/,
  )
  assert.match(productionRunbook, /\) 3 "a tag cannot be represented by the v1 canonical contract"/)
  assert.match(productionRunbook, /Production deployment is closed in this artifact/)
  assert.doesNotMatch(productionRunbook, /db", "push", "--linked", "--yes"/)
  assert.doesNotMatch(productionRunbook, /Invoke-Capture\s+"db-push"/)
  assert.match(productionRunbook, /does not authorize production deployment/i)
})
