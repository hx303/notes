import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const readRepositoryFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

const foundation = readRepositoryFile(
  "supabase/migrations/20260718000600_site_owner_permissions.sql",
)
const migration = readRepositoryFile(
  "supabase/migrations/20260722000100_site_owner_role_invariant.sql",
)
const productionPreflight = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_preflight.sql",
)
const productionContract = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_contract.sql",
)
const behaviorMatrix = readRepositoryFile("supabase/tests/20260722_site_owner_role_invariant.sql")
const residueCheck = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_residue.sql",
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

const transactionCommandPattern =
  /^(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION|COMMIT(?:\s+(?:WORK|TRANSACTION|PREPARED))?|END(?:\s+(?:WORK|TRANSACTION))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION|PREPARED|TO))?|ABORT(?:\s+(?:WORK|TRANSACTION))?|PREPARE\s+TRANSACTION)\b/i

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
  const transactionCommands = topLevelStatements(sql)
    .filter((statement) => transactionCommandPattern.test(statement))
    .map((statement) => statement.toUpperCase())

  assert.deepEqual(transactionCommands, ["BEGIN", "ROLLBACK"])
  assert.equal(topLevelStatements(sql).at(-1)?.toUpperCase(), "ROLLBACK")
}

test("site-owner role changes fail before the only role upsert", () => {
  const body = functionBody(migration, "grant_role")
  const callerCheck = body.indexOf("admin_uid IS DISTINCT FROM caller")
  const roleCheck = body.indexOf("target_role NOT IN ('editor', 'admin')")
  const targetLookup = body.indexOf("SELECT account.id INTO target_uid")
  const ownerTargetCheck = body.indexOf("IF public.is_site_owner(target_uid) THEN")
  const roleUpsert = body.indexOf("INSERT INTO public.user_roles")

  assert.ok(callerCheck >= 0)
  assert.ok(callerCheck < roleCheck)
  assert.ok(roleCheck < targetLookup)
  assert.ok(targetLookup < ownerTargetCheck)
  assert.ok(ownerTargetCheck < roleUpsert)
  assert.equal(body.match(/INSERT INTO public\.user_roles/g)?.length, 1)
  assert.match(body, /ERRCODE = '42501'/)
  assert.match(body, /MESSAGE = 'The site owner role cannot be changed here'/)
  assert.match(migration, /LANGUAGE plpgsql\s+SECURITY DEFINER/)
  assert.match(migration, /SET search_path = pg_catalog, public/)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.grant_role\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.grant_role\(UUID, TEXT, TEXT\) TO authenticated/,
  )

  const topLevel = maskNonTopLevelSql(migration)
  assert.doesNotMatch(topLevel, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im)
  assert.deepEqual(
    topLevelStatements(migration).filter((statement) => transactionCommandPattern.test(statement)),
    [],
  )
})

test("catalog fingerprints are derived from the reviewed source functions", () => {
  const oldGrantFingerprint = normalizedBodyFingerprint(functionBody(foundation, "grant_role"))
  const newGrantFingerprint = normalizedBodyFingerprint(functionBody(migration, "grant_role"))
  const ownerFingerprint = normalizedBodyFingerprint(functionBody(foundation, "is_site_owner"))

  assert.equal(oldGrantFingerprint, "9760c14500ea0d408bb1d6439fef7886")
  assert.equal(newGrantFingerprint, "5b2324f851dafa4bcdb99af3b511e933")
  assert.equal(ownerFingerprint, "8ec91e11707949067560ee1b7a5f4389")

  assert.match(productionPreflight, new RegExp(oldGrantFingerprint))
  assert.match(productionContract, new RegExp(newGrantFingerprint))
  for (const sql of [productionPreflight, productionContract]) {
    assert.match(sql, new RegExp(ownerFingerprint))
  }
  assert.match(behaviorMatrix, new RegExp(oldGrantFingerprint))
  assert.match(behaviorMatrix, new RegExp(newGrantFingerprint))
})

test("production gates are read-only and pin catalog, data, ACL, and ledger state", () => {
  for (const sql of [productionPreflight, productionContract]) {
    assertReadOnlyGate(sql)
    assert.match(sql, /to_regprocedure\('public\.grant_role\(uuid,text,text\)'\)/)
    assert.match(sql, /procedure\.proname = 'grant_role'/)
    assert.match(sql, /procedure\.prosecdef/)
    assert.match(sql, /owner\.rolname = 'postgres'/)
    assert.match(sql, /ARRAY\['search_path=pg_catalog, public'\]::TEXT\[\]/)
    assert.match(sql, /has_function_privilege\('authenticated', grant_rpc, 'EXECUTE'\)/)
    assert.match(sql, /has_function_privilege\('service_role', grant_rpc, 'EXECUTE'\)/)
    assert.match(sql, /has_function_privilege\('anon', grant_rpc, 'EXECUTE'\)/)
    assert.match(sql, /LATERAL pg_catalog\.aclexplode/)
    assert.match(sql, /acl\.is_grantable/)
    assert.match(sql, /relation\.relrowsecurity/)
    assert.match(sql, /policy\.policyname = 'Users can read own role'/)
    assert.match(sql, /policy\.cmd IN \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/)
    assert.match(sql, /role\.role = 'admin'/)
    assert.match(sql, /role\.granted_by = protected_owner/)
    assert.match(sql, /protected_owner_state_fingerprint/)
    assert.match(sql, /actual_ledger IS DISTINCT FROM expected_ledger/)
  }

  assert.match(productionPreflight, /count\(\*\).*schema_migrations[\s\S]*<> 18/)
  assert.match(productionPreflight, /version = '20260721000100'/)
  assert.match(productionPreflight, /version = '20260722000100'/)
  assert.match(productionPreflight, /site_owner_role_invariant_preflight_passed/)
  assert.match(productionContract, /count\(\*\).*schema_migrations[\s\S]*<> 19/)
  assert.match(productionContract, /name = 'site_owner_role_invariant'/)
  assert.match(productionContract, /site_owner_role_invariant_contract_passed/)
  assert.throws(() => assertReadOnlyGate("DO $$ BEGIN DELETE FROM public.user_roles; END; $$;"))
  assert.throws(() =>
    assertReadOnlyGate("DO $$ BEGIN EXECUTE 'DELETE FROM public.user_roles'; END; $$;"),
  )

  const fingerprintProjection =
    /md5\(COALESCE\(string_agg\([\s\S]*?\), ''\)\) AS protected_owner_state_fingerprint/
  const preflightProjection = productionPreflight.match(fingerprintProjection)?.[0]
  const contractProjection = productionContract.match(fingerprintProjection)?.[0]
  assert.ok(preflightProjection)
  assert.equal(preflightProjection.replace(/\s+/g, " "), contractProjection?.replace(/\s+/g, " "))
})

test("rollback-only runtime evidence covers idempotency and the identity matrix", () => {
  assertRollbackOnlyMatrix(behaviorMatrix)
  assert.match(behaviorMatrix, /^\\set ON_ERROR_STOP on$/m)
  assert.match(behaviorMatrix, /:\{\?wouldkeep_p1a_20260722000100_disposable\}/)
  assert.match(behaviorMatrix, /-v wouldkeep_p1a_20260722000100_disposable=true/)
  assert.match(behaviorMatrix, /RAISE EXCEPTION 'Disposable environment confirmation is required'/)
  assert.equal(
    behaviorMatrix.match(/\\ir \.\.\/migrations\/20260722000100_site_owner_role_invariant\.sql/g)
      ?.length,
    2,
  )

  for (const scenario of [
    "anonymous_execute_denied_42501_zero_write",
    "caller_identity_mismatch_denied_zero_write",
    "double_apply_idempotent",
    "non_owner_caller_denied_zero_write",
    "ordinary_member_role_change_preserved",
    "other_site_owner_change_denied_42501_zero_write",
    "rollback_fixture_namespace_clean_before_run",
    "site_owner_self_change_denied_42501_zero_write",
  ]) {
    assert.match(behaviorMatrix, new RegExp(`'${scenario}'`))
  }

  assert.match(behaviorMatrix, /GET STACKED DIAGNOSTICS/)
  assert.match(behaviorMatrix, /RETURNED_SQLSTATE/)
  assert.match(behaviorMatrix, /returned_state = '42501'/)
  assert.match(behaviorMatrix, /returned_state = 'P0001'/)
  assert.match(behaviorMatrix, /The site owner role cannot be changed here/)
  assert.match(behaviorMatrix, /Site owner permission required/)
  assert.match(behaviorMatrix, /pg_temp\.p1a_user_roles_fingerprint\(\)/)
  assert.match(behaviorMatrix, /pg_temp\.p1a_site_owner_state_fingerprint\(\)/)
  assert.match(behaviorMatrix, /pg_temp\.p1a_grant_role_contract_fingerprint\(\)/)
  assert.doesNotMatch(behaviorMatrix, /EXCEPTION WHEN OTHERS/i)
})

test("a separate read-only residue probe proves rollback cleanup", () => {
  assertReadOnlyGate(residueCheck)
  assert.match(residueCheck, /p1a-role-gate-%@example\.test/)
  assert.match(residueCheck, /a7220000-0000-4000-8000-000000000101/)
  assert.match(residueCheck, /a7220000-0000-4000-8000-000000000102/)
  assert.match(residueCheck, /site_owner_role_invariant_rollback_residue_zero/)
})

test("rollback guard rejects aliases, prepared transactions, and forged comments", () => {
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
    "PREPARE TRANSACTION 'p1a-production-gates';",
  ]) {
    assert.throws(() =>
      assertRollbackOnlyMatrix(safeFixture.replace(/ROLLBACK;\s*$/, `${forbidden}\n`)),
    )
  }
  assert.throws(() => assertRollbackOnlyMatrix("BEGIN;\n-- ROLLBACK;"))
})
