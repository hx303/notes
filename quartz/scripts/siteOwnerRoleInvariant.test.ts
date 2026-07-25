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
const productionActivityGate = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_activity_gate.sql",
)
const productionStateFingerprint = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_state_fingerprint.sql",
)
const behaviorMatrix = readRepositoryFile("supabase/tests/20260722_site_owner_role_invariant.sql")
const residueCheck = readRepositoryFile(
  "supabase/tests/20260722_site_owner_role_invariant_residue.sql",
)
const productionRunbook = readRepositoryFile(
  ".design/wouldkeep-next/runbooks/20260722000100-site-owner-role-invariant.md",
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
    assert.match(sql, /actual_ledger IS DISTINCT FROM expected_ledger/)
    assert.equal(topLevelStatements(sql).length, 1)
  }

  assert.match(productionPreflight, /count\(\*\).*schema_migrations[\s\S]*<> 18/)
  assert.match(productionPreflight, /version = '20260721000100'/)
  assert.match(productionPreflight, /version = '20260722000100'/)
  assert.match(productionContract, /count\(\*\).*schema_migrations[\s\S]*<> 19/)
  assert.match(productionContract, /name = 'site_owner_role_invariant'/)
  assert.throws(() => assertReadOnlyGate("DO $$ BEGIN DELETE FROM public.user_roles; END; $$;"))
  assert.throws(() =>
    assertReadOnlyGate("DO $$ BEGIN EXECUTE 'DELETE FROM public.user_roles'; END; $$;"),
  )

  const fingerprintProjection =
    /md5\(COALESCE\(string_agg\([\s\S]*?\), ''\)\) AS protected_owner_state_fingerprint/
  assertReadOnlyGate(productionStateFingerprint)
  assert.equal(topLevelStatements(productionStateFingerprint).length, 1)
  assert.ok(productionStateFingerprint.match(fingerprintProjection)?.[0])
  assert.match(productionStateFingerprint, /site_owner_role_invariant_state_fingerprint_passed/)
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

test("the production activity gate rejects lock waits and long transactions", () => {
  assertReadOnlyGate(productionActivityGate)
  assert.match(productionActivityGate, /pg_catalog\.pg_stat_activity/)
  assert.match(productionActivityGate, /pg_catalog\.pg_locks/)
  assert.match(productionActivityGate, /activity\.pid <> pg_backend_pid\(\)/)
  assert.match(productionActivityGate, /activity\.backend_type = 'client backend'/)
  assert.match(productionActivityGate, /activity\.wait_event_type = 'Lock'/)
  assert.match(productionActivityGate, /clock_timestamp\(\) - activity\.xact_start/)
  assert.match(productionActivityGate, /INTERVAL '5 minutes'/)
  assert.match(productionActivityGate, /NOT waiting_lock\.granted/)
  assert.match(productionActivityGate, /site_owner_role_invariant_activity_gate_passed/)
  assert.match(productionActivityGate, /site_owner_role_invariant_activity_gate_failed/)
  assert.match(productionActivityGate, /300::INTEGER AS max_transaction_age_seconds/)
  assert.doesNotMatch(productionActivityGate, /pg_(?:terminate|cancel)_backend/)
})

test("the production runbook pins a reproducible single-migration operation", () => {
  assert.doesNotMatch(productionRunbook, /[^\x00-\x7f]/)
  assert.match(productionRunbook, /Validated Supabase CLI: `2\.109\.1`/)
  assert.match(productionRunbook, /Set-StrictMode -Version Latest/)
  assert.match(productionRunbook, /\$ErrorActionPreference = "Stop"/)
  assert.match(productionRunbook, /\$PSVersionTable\.PSVersion\.Major -lt 7/)
  assert.match(productionRunbook, /function Assert-LocalPostgresUrl/)
  assert.match(productionRunbook, /\[System\.Net\.IPAddress\]::IsLoopback\(\$Address\)/)
  assert.match(productionRunbook, /Candidate evidence directory must be outside the repository/)
  assert.doesNotMatch(productionRunbook, /Host -notin/)
  assert.match(productionRunbook, /if \(\$GuardExit -ne 3\)/)
  assert.match(
    productionRunbook,
    /--set=wouldkeep_p1a_20260722000100_disposable=true --file=supabase\/tests\/20260722_site_owner_role_invariant\.sql/,
  )
  assert.match(productionRunbook, /0,0,0,0,site_owner_role_invariant_rollback_residue_zero/)
  assert.match(productionRunbook, /\$ActualScenarios\.Count -ne 8/)
  assert.match(productionRunbook, /explicit ROLLBACK/)

  const guard = productionRunbook.indexOf("$GuardOutput =")
  const guardExit = productionRunbook.indexOf("if ($GuardExit -ne 3)")
  const guardResidue = productionRunbook.indexOf("$GuardResidueOutput =")
  const guardEvidence = productionRunbook.indexOf(
    'Write-CandidateEvidence -Name "missing-confirmation.txt"',
  )
  assert.ok(guard >= 0)
  assert.ok(guard < guardExit)
  assert.ok(guardExit < guardResidue)
  assert.ok(guardResidue < guardEvidence)

  assert.match(productionRunbook, /public-schema\.sql/)
  assert.match(productionRunbook, /public-data\.sql/)
  assert.match(productionRunbook, /migration-ledger-data\.sql/)
  assert.match(productionRunbook, /\$BackupFiles\.Count -ne 3/)
  assert.match(productionRunbook, /Get-FileHash .* -Algorithm SHA256/)
  assert.match(productionRunbook, /\$BackupHashRows\.Count -ne 3/)
  assert.match(productionRunbook, /Write-EvidenceText -Name "sha256\.txt"/)
  assert.doesNotMatch(productionRunbook, /db dump --linked --role-only/)
  assert.doesNotMatch(productionRunbook, /restore rehearsal/i)
  assert.doesNotMatch(productionRunbook, /Tee-Object|Out-File/)

  assert.match(productionRunbook, /function Invoke-SupabaseJsonCapture/)
  assert.match(productionRunbook, /RedirectStandardOutput = \$true/)
  assert.match(productionRunbook, /RedirectStandardError = \$true/)
  assert.match(productionRunbook, /ConvertFrom-Json -Depth 20 -ErrorAction Stop/)
  assert.match(productionRunbook, /Migration-list JSON root contract changed/)
  assert.match(productionRunbook, /Migration-list JSON row contract changed/)
  assert.match(productionRunbook, /function Get-MigrationColumnsFromJson/)
  assert.doesNotMatch(productionRunbook, /function Get-MigrationColumns \{/)
  assert.match(
    productionRunbook,
    /"migration", "list", "--linked", "--agent", "no", "--output-format", "json"/,
  )
  assert.match(
    productionRunbook,
    /"db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"/,
  )
  assert.ok(productionRunbook.includes("\\d{8}(?:\\d{6})?"))
  assert.match(productionRunbook, /function Assert-ExactVersionSet/)
  assert.match(productionRunbook, /function Assert-PreMigrationList/)
  assert.match(productionRunbook, /function Assert-PostMigrationList/)
  assert.match(productionRunbook, /\$ExpectedRemotePre = @\(/)
  assert.match(productionRunbook, /\$ExpectedRemotePost = @\(\$ExpectedLocalPre\)/)
  assert.match(
    productionRunbook,
    /\$ExpectedMigrationFile = "20260722000100_site_owner_role_invariant\.sql"/,
  )
  assert.match(productionRunbook, /\$InitialPendingMigrationFiles\.Count -ne 1/)
  assert.match(productionRunbook, /\$InitialPendingVersions\.Count -ne 1/)

  for (const version of [
    "20260712",
    "20260714",
    "20260715",
    "20260716",
    "20260717",
    "20260718000100",
    "20260718000200",
    "20260718000300",
    "20260718000400",
    "20260718000500",
    "20260718000600",
    "20260718000700",
    "20260718000800",
    "20260718000900",
    "20260718001000",
    "20260718001100",
    "20260718001200",
    "20260721000100",
    "20260722000100",
  ]) {
    assert.match(productionRunbook, new RegExp(`"${version}"`))
  }

  assert.match(
    productionRunbook,
    /supabase\/tests\/20260722_site_owner_role_invariant_preflight\.sql/,
  )
  assert.equal(
    productionRunbook.match(
      /supabase\/tests\/20260722_site_owner_role_invariant_activity_gate\.sql/g,
    )?.length,
    4,
  )
  assert.equal(
    productionRunbook.match(
      /supabase\/tests\/20260722_site_owner_role_invariant_state_fingerprint\.sql/g,
    )?.length,
    4,
  )
  assert.match(productionRunbook, /\$InitialActivityGate = @\(/)
  assert.match(productionRunbook, /\$ImmediateActivityGate = @\(/)
  assert.match(productionRunbook, /\$PostActivityGate = @\(/)
  assert.match(productionRunbook, /Activity gate output changed after approval/)
  assert.match(productionRunbook, /\$InitialPreflightAssertions = @\(/)
  assert.match(productionRunbook, /\$ImmediatePreflightAssertions = @\(/)
  assert.match(productionRunbook, /\$ContractAssertions = @\(/)
  assert.match(productionRunbook, /site_owner_role_invariant_state_fingerprint_passed/)
  assert.match(productionRunbook, /\$ApprovedPreflightFingerprint = Get-GateFingerprint/)
  assert.match(productionRunbook, /\$ImmediatePreflightFingerprint = Get-GateFingerprint/)
  assert.match(productionRunbook, /\$FingerprintMatches\.Count -ne 1/)
  assert.doesNotMatch(productionRunbook, /\$Fingerprints.*Sort-Object -Unique/s)
  assert.match(
    productionRunbook,
    /\$ImmediatePreflightFingerprint -cne \$ApprovedPreflightFingerprint/,
  )
  assert.match(
    productionRunbook,
    /"db", "push", "--linked", "--yes", "--agent", "no", "--output-format", "text"/,
  )
  assert.match(
    productionRunbook,
    /supabase\/tests\/20260722_site_owner_role_invariant_contract\.sql/,
  )
  assert.match(productionRunbook, /\$ContractFingerprint -cne \$ApprovedPreflightFingerprint/)
  assert.match(productionRunbook, /\$PostMigrationListCapture = Invoke-SupabaseJsonCapture/)
  assert.match(productionRunbook, /\$PostDryRun = @\(/)
  assert.match(productionRunbook, /\$PostPendingMigrationFiles\.Count -ne 0/)
  assert.match(productionRunbook, /\$PostPendingVersions\.Count -ne 0/)
  assert.match(productionRunbook, /\(\?i\)\\bup to date\\b/)

  assert.match(productionRunbook, /ApprovedSha/)
  assert.match(productionRunbook, /ApprovedProjectRef/)
  assert.match(productionRunbook, /\$ImmediateSha -cne \$ApprovedSha/)
  assert.match(productionRunbook, /\$ImmediateGitStatusExit -ne 0/)
  assert.match(productionRunbook, /Supabase CLI changed after approval/)
  assert.match(productionRunbook, /\$ImmediateProjectRef -cne \$ApprovedProjectRef/)
  assert.match(productionRunbook, /git-sha-immediate\.txt/)
  assert.match(productionRunbook, /git-status-immediate\.txt/)
  assert.match(productionRunbook, /supabase-version-immediate\.txt/)
  assert.match(productionRunbook, /project-ref-immediate\.txt/)
  assert.match(productionRunbook, /\$FinalPreWriteShaOutput = @\(git rev-parse HEAD/)
  assert.match(productionRunbook, /\$FinalPreWriteStatusExit -ne 0/)
  assert.match(productionRunbook, /Supabase CLI changed during immediate gates/)
  assert.match(productionRunbook, /\$FinalPreWriteProjectRef -cne \$ApprovedProjectRef/)
  assert.match(productionRunbook, /started-utc\.txt/)
  assert.match(productionRunbook, /completed-utc\.txt/)
  assert.match(productionRunbook, /Set-Content .* -ErrorAction Stop/)
  assert.match(productionRunbook, /Required evidence is missing or empty/)
  assert.match(productionRunbook, /PRODUCTION_SAFETY\.md/)
  assert.match(productionRunbook, /Do not pass `--include-all`/)
  assert.match(productionRunbook, /Never run `migration repair`/)
  assert.doesNotMatch(
    productionRunbook,
    /db query --linked --file supabase\/tests\/20260722_site_owner_role_invariant(?:_residue)?\.sql/,
  )

  const backup = productionRunbook.indexOf("& $Supabase db dump --linked")
  const initialPreflight = productionRunbook.indexOf('EvidenceName "preflight-initial"')
  const immediateIdentity = productionRunbook.indexOf("$ImmediateShaOutput =")
  const immediatePreflight = productionRunbook.indexOf('EvidenceName "preflight-immediate"')
  const finalPreWriteIdentity = productionRunbook.indexOf("$FinalPreWriteShaOutput =")
  const push = productionRunbook.indexOf('EvidenceName "db-push" -Arguments')
  const contract = productionRunbook.indexOf('EvidenceName "contract"')
  const postDryRun = productionRunbook.indexOf('EvidenceName "db-push-dry-run-post"')
  assert.ok(backup >= 0)
  assert.ok(backup < initialPreflight)
  assert.ok(initialPreflight < immediateIdentity)
  assert.ok(immediateIdentity < immediatePreflight)
  assert.ok(immediatePreflight < finalPreWriteIdentity)
  assert.ok(finalPreWriteIdentity < push)
  assert.ok(push < contract)
  assert.ok(contract < postDryRun)
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
