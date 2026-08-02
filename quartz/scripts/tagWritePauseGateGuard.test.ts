import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const readRepositoryFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

const enable = readRepositoryFile("supabase/operations/20260722_tag_write_pause_enable.sql")
const disable = readRepositoryFile("supabase/operations/20260722_tag_write_pause_disable.sql")
const state = readRepositoryFile("supabase/tests/20260722_tag_write_pause_state.sql")
const behavior = readRepositoryFile("supabase/tests/20260722_tag_write_pause_behavior.sql")
const disposable = readRepositoryFile("supabase/tests/20260722_tag_write_pause_disposable.ps1")
const disposableBaseline = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_baseline.sql",
)
const disposableSetup = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_setup.sql",
)
const disposableExtended = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_extended.sql",
)
const disposableCopyFrom = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_copy_from.sql",
)
const disposableCommentDrift = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_comment_drift.sql",
)
const disposableActivePresence = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_active_presence.sql",
)
const disposableCommentRestore = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_comment_restore.sql",
)
const disposableCleanup = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_cleanup.sql",
)
const disposableResidue = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_residue.sql",
)
const disposableWriter = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_writer.sql",
)
const disposableWriterState = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_writer_state.sql",
)
const disposableWriterAbsent = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_writer_absent.sql",
)
const disposableWriterRelease = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_disposable_writer_release.sql",
)
const sealedHost = readRepositoryFile("supabase/tests/20260722_tag_write_pause_sealed.ps1")
const sealedContainer = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_container.ps1",
)
const sealedDockerfile = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed.Dockerfile",
)
const sealedDbDockerfile = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_db.Dockerfile",
)
const sealedPostgresConfig = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_postgresql.conf",
)
const sealedHba = readRepositoryFile("supabase/tests/20260722_tag_write_pause_sealed_pg_hba.conf")
const sealedConfig = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_config.toml",
)
const sealedRoles = readRepositoryFile("supabase/tests/20260722_tag_write_pause_sealed_roles.sql")
const sealedBootstrap = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_bootstrap.sql",
)
const sealedRename = readRepositoryFile("supabase/tests/20260722_tag_write_pause_sealed_rename.sql")
const sealedSanitize = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_sanitize.sql",
)
const sealedAttestation = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_attestation.sql",
)
const sealedManifest = readRepositoryFile(
  "supabase/tests/20260722_tag_write_pause_sealed_manifest.sha256",
)
const runbook = readRepositoryFile(
  ".design/wouldkeep-next/runbooks/20260722000150-tag-normalization.md",
)
const handoff = readRepositoryFile(
  ".design/wouldkeep-next/handoffs/release-p1b-00150-tag-write-pause-gate.md",
)

const forbiddenOperationSyntax =
  /(?:\bDROP\b[^;\r\n]*\bIF\s+EXISTS\b|\bCREATE\s+OR\s+REPLACE\b|\bDROP\b[^;\r\n]*\bCASCADE\b|^\s*GRANT\b)/im

test("enable drains writers in fixed order and installs two exact ALWAYS statement gates", () => {
  assert.doesNotMatch(enable, forbiddenOperationSyntax)
  assert.match(
    enable,
    /LOCK TABLE public\.tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;[\s\S]*LOCK TABLE public\.document_tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;/,
  )
  assert.match(enable, /wouldkeep_tag_write_pause_objects_not_absent/)
  assert.match(enable, /pg_catalog\.pg_subscription_rel/)
  assert.match(enable, /wouldkeep_tag_write_pause_inbound_subscription_unsupported/)
  assert.match(enable, /CREATE SCHEMA wouldkeep_maintenance AUTHORIZATION CURRENT_USER/)
  assert.match(enable, /SECURITY INVOKER/)
  assert.match(enable, /SET search_path = pg_catalog/)
  assert.match(enable, /ERRCODE = '55000'/)
  assert.match(enable, /MESSAGE = 'wouldkeep_tag_writes_paused'/)
  assert.equal((enable.match(/CREATE TRIGGER wouldkeep_/g) ?? []).length, 2)
  assert.equal((enable.match(/BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE/g) ?? []).length, 2)
  assert.equal((enable.match(/FOR EACH STATEMENT/g) ?? []).length, 2)
  assert.equal((enable.match(/ENABLE ALWAYS TRIGGER/g) ?? []).length, 2)
  assert.match(enable, /trigger\.tgtype = 62/)
  assert.match(enable, /trigger\.tgenabled = 'A'/)
  assert.match(enable, /relowner[\s\S]*current_user/)
  assert.match(enable, /gate_owner_oid[\s\S]*public\.tags[\s\S]*public\.document_tags/)
})

test("state is read-only, fingerprints the baseline, and rejects partial or catalog drift", () => {
  assert.doesNotMatch(
    state,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im,
  )
  for (const fingerprint of ["|catalog=", "|acl=", "|rls_policies=", "|nongate_triggers="]) {
    assert.ok(state.includes(fingerprint))
  }
  assert.match(state, /gate=(?:'?,?\s*)?absent|THEN 'absent'/)
  assert.match(state, /THEN 'absent' ELSE 'active'/)
  assert.match(state, /wouldkeep_tag_write_pause_partial_state/)
  assert.match(state, /pg_catalog\.pg_subscription_rel/)
  assert.match(state, /wouldkeep_tag_write_pause_inbound_subscription_unsupported/)
  assert.match(state, /wouldkeep_tag_write_pause_catalog_drift/)
  assert.match(state, /wouldkeep_tag_write_pause_acl_drift/)
  assert.match(state, /wouldkeep_tag_write_pause_function_dependency_drift/)
  assert.match(state, /wouldkeep_tag_write_pause_trigger_dependency_drift/)
  assert.match(state, /function\.prosrc = expected_body/)
  assert.match(state, /function\.prosecdef/)
  assert.match(state, /function\.proconfig = ARRAY\['search_path=pg_catalog'\]/)
  assert.match(state, /trigger\.tgtype = 62/)
  assert.match(state, /trigger\.tgenabled = 'A'/)
  assert.match(state, /obj_description/)
  assert.match(state, /aclexplode/)
  assert.match(state, /pg_catalog\.pg_depend/)
  assert.match(state, /gate_owner_oid[\s\S]*tags_oid[\s\S]*document_tags_oid/)
})

test("production behavior probe is zero-row INSERT/UPDATE/DELETE for four roles", () => {
  assert.match(behavior, /operator_role, 'anon'::name, 'authenticated'::name, 'service_role'::name/)
  assert.equal(
    (behavior.match(/\('(?:tags|document_tags)_(?:insert|update|delete)'/g) ?? []).length,
    6,
  )
  assert.equal((behavior.match(/WHERE false/g) ?? []).length, 6)
  assert.doesNotMatch(behavior, /\bTRUNCATE\s+(?:TABLE\s+)?public\./i)
  assert.match(behavior, /pg_catalog\.has_table_privilege/)
  assert.match(behavior, /pg_catalog\.has_column_privilege/)
  assert.match(behavior, /baseline_authorized := write_authorized AND read_authorized/)
  assert.match(behavior, /observed_state IS DISTINCT FROM '55000'/)
  assert.match(behavior, /observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused'/)
  assert.match(behavior, /observed_state IS DISTINCT FROM '42501'/)
  assert.match(behavior, /gate_blocks < 6/)
  assert.match(behavior, /gate_blocks \+ acl_blocks <> 24/)
  assert.match(behavior, /tag_write_pause_behavior_counts/)
  assert.match(behavior, /tag_write_pause_behavior_passed/)
  assert.match(behavior, /4::integer AS roles_checked/)
  assert.match(behavior, /24::integer AS statements_checked/)
})

test("disposable harness accepts only an exact literal-loopback target and bounds every psql process", () => {
  assert.match(disposable, /DatabaseUri\.Query/)
  assert.match(disposable, /DatabaseUri\.Fragment/)
  assert.match(disposable, /\[Net\.IPAddress\]::TryParse/)
  assert.match(disposable, /\[Net\.IPAddress\]::IsLoopback/)
  assert.doesNotMatch(disposable, /localhost/i)
  assert.match(disposable, /CommandTimeoutSeconds/)
  assert.match(disposable, /\$MyInvocation\.UnboundArguments/)
  assert.doesNotMatch(disposable, /@\(\$args\)/)
  assert.match(disposable, /WaitForExit\(\$TimeoutSeconds \* 1000\)/)
  assert.match(disposable, /\.Kill\(\$true\)/)
  assert.match(disposable, /writer-emergency-release/)
  assert.match(disposable, /writer-emergency-absent-poll/)
  for (const stage of [
    "entry",
    "version",
    "confirmation",
    "linked",
    "uri",
    "loopback",
    "database-name",
    "psql",
    "evidence-parent",
    "evidence-created",
  ]) {
    assert.match(disposable, new RegExp(`Write-DisposablePreflightMarker "${stage}"`))
    assert.match(sealedContainer, new RegExp(`marker_${stage.replaceAll("-", "_")} = .*${stage}`))
  }

  assert.match(disposableBaseline, /server_address inet := pg_catalog\.inet_server_addr\(\)/)
  assert.match(disposableBaseline, /server_address IS NULL/)
  assert.match(disposableBaseline, /server_address <<= '127\.0\.0\.0\/8'::inet/)
  assert.match(disposableBaseline, /server_address = '::1'::inet/)
  assert.match(disposableBaseline, /wouldkeep_tag_write_pause_literal_loopback_server_required/)
})

test("disposable matrix covers extended writes, drift recovery, cleanup, and exact zero residue", () => {
  const disposableSqlFiles = [
    disposableBaseline,
    disposableSetup,
    disposableExtended,
    disposableCopyFrom,
    disposableCommentDrift,
    disposableActivePresence,
    disposableCommentRestore,
    disposableCleanup,
    disposableResidue,
    disposableWriter,
    disposableWriterState,
    disposableWriterAbsent,
    disposableWriterRelease,
  ]
  for (const sql of disposableSqlFiles) {
    assert.match(sql, /wouldkeep_p1b_tag_write_pause_disposable/)
    assert.match(sql, /wouldkeep_tag_write_pause_disposable_/)
  }

  assert.match(disposableSetup, /tag_write_pause_disposable_setup_passed/)
  assert.match(disposableExtended, /ON CONFLICT/)
  assert.match(disposableExtended, /MERGE INTO public\.tags/)
  assert.match(disposableExtended, /TRUNCATE TABLE public\.document_tags/)
  assert.match(disposableExtended, /SECURITY DEFINER/)
  assert.match(disposableExtended, /session_replication_role = replica/)
  assert.match(disposableExtended, /current_user <> 'supabase_admin'/)
  assert.match(disposableExtended, /AND rolsuper[\s\S]*AND rolcanlogin/)
  assert.match(disposable, /\[UriBuilder\]::new\(\$DatabaseUri\)/)
  assert.match(disposable, /\$SuperuserUriBuilder\.UserName = "supabase_admin"/)
  assert.match(
    disposable,
    /\$ConnectionUrl -cnotin @\(\$script:DisposableDbUrl, \$script:SuperuserDbUrl\)/,
  )
  assert.match(disposable, /"extended-matrix"[\s\S]*-ConnectionUrl \$script:SuperuserDbUrl/)
  assert.match(disposableCopyFrom, /COPY public\.tags/)
  assert.match(disposableCommentDrift, /COMMENT ON TRIGGER wouldkeep_tags_write_pause/)
  assert.match(disposableActivePresence, /tag_write_pause_disposable_active_after_failed_disable/)
  assert.match(disposableCommentRestore, /tag_write_pause_disposable_comment_restored/)
  assert.match(disposableCleanup, /tag_write_pause_disposable_cleanup_passed/)
  assert.match(disposableResidue, /tag_write_pause_disposable_residue_zero/)
})

test("disposable concurrency proves NOWAIT rollback before normal enable and state fails closed on drift", () => {
  assert.match(disposableWriter, /SET application_name = 'wouldkeep_p1b_tag_write_pause_writer'/)
  assert.match(disposableWriter, /SET statement_timeout = '75s'/)
  assert.match(disposableWriter, /UPDATE public\.tags SET name = name WHERE false/)
  assert.match(
    disposableWriterState,
    /activity\.application_name = 'wouldkeep_p1b_tag_write_pause_writer'/,
  )
  assert.match(disposableWriterState, /lock\.mode = 'RowExclusiveLock'/)
  assert.match(disposableWriterState, /lock\.granted/)
  assert.match(disposableWriterAbsent, /tag_write_pause_disposable_writer_absent/)
  assert.match(disposableWriterRelease, /SELECT activity\.pid[\s\S]*INTO STRICT target_pid/)
  assert.match(disposableWriterRelease, /activity\.client_addr <<= '127\.0\.0\.0\/8'::inet/)
  assert.match(disposableWriterRelease, /lock\.mode = 'RowExclusiveLock'/)
  assert.match(disposableWriterRelease, /pg_catalog\.pg_terminate_backend\(target_pid, 5000\)/)
  assert.match(disposableWriterRelease, /tag_write_pause_disposable_writer_backend_terminated/)
  assert.match(disposable, /\$Files\.WriterRelease/)
  assert.match(disposable, /Controlled writer client did not exit after its backend was terminated/)

  const orderedHarnessMarkers = [
    '$ContentionInitialState = Invoke-GateState "state-before-writer"',
    "$WriterRunning = Start-ControlledWriter",
    "$WriterAbsentConfirmed = $false",
    "Wait-ControlledWriterReady $WriterRunning",
    'Invoke-PsqlFile "enable-rejected-by-writer"',
    'Invoke-GateState "state-after-writer-rejection"',
    'Invoke-PsqlFile "residue-after-writer-rejection"',
    'Invoke-PsqlFile "writer-state-after-rejection"',
    'Stop-ControlledWriter $WriterRunning "writer-controlled-release"',
    'Wait-ControlledWriterAbsent "writer-absent-poll"',
    'Invoke-PsqlFile "fixture-setup"',
    'Invoke-PsqlFile "gate-enable"',
  ]
  let priorIndex = -1
  for (const marker of orderedHarnessMarkers) {
    const markerIndex = disposable.indexOf(marker)
    assert.ok(markerIndex > priorIndex, `missing or out-of-order harness marker: ${marker}`)
    priorIndex = markerIndex
  }
  assert.match(disposable, /"enable-rejected-by-writer"[\s\S]*"55P03"/)
  assert.match(disposable, /Assert-GateAbsent \$AfterContentionState/)
  assert.match(disposable, /Assert-ResidueZero \$AfterContentionResidue/)
  assert.match(disposable, /Rejected enable did not preserve the exact absent catalog state/)

  const driftStateIndex = disposable.indexOf('Invoke-PsqlFile "state-rejected-on-drift"')
  const driftDisableIndex = disposable.indexOf('Invoke-PsqlFile "disable-rejected-on-drift"')
  assert.ok(driftStateIndex >= 0 && driftStateIndex < driftDisableIndex)
  assert.match(
    disposable,
    /"state-rejected-on-drift"[\s\S]*"55000"[\s\S]*wouldkeep_tag_write_pause_object_drift/,
  )
})

test("disable validates exact active ownership, ACL, body, comments and dependencies before atomic drop", () => {
  assert.doesNotMatch(disable, forbiddenOperationSyntax)
  assert.match(
    disable,
    /LOCK TABLE public\.tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;[\s\S]*LOCK TABLE public\.document_tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;/,
  )
  assert.match(disable, /function\.prosrc = expected_body/)
  assert.match(disable, /function\.proowner = gate_owner_oid/)
  assert.match(disable, /gate_owner_oid[\s\S]*tags_oid[\s\S]*document_tags_oid/)
  assert.match(disable, /pg_catalog\.aclexplode/)
  assert.match(disable, /pg_catalog\.obj_description/)
  assert.match(disable, /pg_catalog\.pg_depend/)
  assert.match(disable, /trigger\.tgtype = 62/)
  assert.match(disable, /trigger\.tgenabled = 'A'/)
  assert.match(disable, /count\(\*\) FROM pg_catalog\.pg_trigger WHERE tgfoid = gate_function_oid/)
  assert.match(disable, /wouldkeep_tag_write_pause_trigger_drift/)
  assert.match(disable, /DROP TRIGGER wouldkeep_tags_write_pause ON public\.tags/)
  assert.match(disable, /DROP TRIGGER wouldkeep_document_tags_write_pause ON public\.document_tags/)
  assert.match(disable, /DROP FUNCTION wouldkeep_maintenance\.reject_tag_write_while_paused\(\)/)
  assert.match(disable, /DROP SCHEMA wouldkeep_maintenance/)
})

test("runbook keeps the pause active around every preflight read and always restores it", () => {
  assert.match(runbook, /release\/p1b-00150-tag-write-pause-gate/)
  assert.match(runbook, /zero enabled inbound subscription relations/i)
  assert.match(runbook, /20260722_tag_write_pause_enable\.sql/)
  assert.match(runbook, /20260722_tag_write_pause_disable\.sql/)
  assert.match(runbook, /20260722_tag_write_pause_state\.sql/)
  assert.match(runbook, /20260722_tag_write_pause_behavior\.sql/)
  assert.match(runbook, /20260722_tag_write_pause_disposable\.ps1/)
  assert.match(runbook, /I_UNDERSTAND_THIS_IS_A_THROWAWAY_LOOPBACK_DATABASE/)
  assert.match(runbook, /I_AUTHORIZE_TEMPORARY_NON_LOOPBACK_FIREWALL_BLOCK_FOR_SEALED_LOCAL_PG17/)
  assert.match(runbook, /Windows Defender Firewall/)
  assert.match(runbook, /first reconciles the nonce-scoped runtime/)
  assert.match(runbook, /tag_write_pause_disposable_matrix_passed/)
  assert.match(runbook, /"--schema", "public,wouldkeep_maintenance"/)
  assert.match(runbook, /reject_tag_write_while_paused/)
  assert.match(runbook, /wouldkeep_tags_write_pause/)
  assert.match(runbook, /wouldkeep_document_tags_write_pause/)
  assert.match(runbook, /Assert-GateActiveAtCheckpoint "before-schema-backup"/)
  assert.match(runbook, /Assert-GateActiveAtCheckpoint "after-state"/)
  assert.match(runbook, /git archive --format=zip/)
  assert.match(runbook, /Copy-Item -LiteralPath \$SupabaseSource -Destination \$ApprovedSupabase/)
  assert.match(runbook, /function Assert-ApprovedSnapshot/)
  assert.match(runbook, /\$script:SnapshotHashes/)
  assert.match(runbook, /"--workdir" \$script:ApprovedWorkdir/)
  assert.match(runbook, /Assert-IdentityMatchesInitial "before-enable"/)
  assert.match(runbook, /\$script:GateEnableFile/)
  assert.match(runbook, /\$script:GateDisableFile/)
  assert.match(runbook, /\$script:GateStateFile/)
  assert.match(runbook, /\$script:GateBehaviorFile/)
  assert.match(runbook, /finally/)
  assert.match(runbook, /Assert-ReleasedMatchesInitial/)
  assert.match(runbook, /not a turnkey restore procedure/i)
  assert.match(runbook, /stops application and API writes outside PostgreSQL/i)
  assert.match(runbook, /Never compare restored-object OIDs/i)
  assert.match(runbook, /section 2 must restart in a fresh evidence directory/i)
  assert.doesNotMatch(runbook, /Invoke-Capture\s+"db-push"/)
  assert.doesNotMatch(runbook, /db", "push", "--linked", "--yes"/)
  assert.doesNotMatch(runbook, /"migration",\s*"repair"/)
})

test("sealed snapshot is content-addressed and physically excludes pending migrations and credentials", () => {
  const lines = sealedManifest.trimEnd().split("\n")
  const entries = lines.map((line) => {
    const match = /^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)\r?$/.exec(line)
    assert.ok(match, `invalid sealed manifest line: ${line}`)
    return { hash: match[1], path: match[2] }
  })
  const paths = entries.map((entry) => entry.path)
  assert.equal(paths.length, 50)
  assert.deepEqual(
    paths,
    [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  )
  assert.equal(new Set(paths).size, paths.length)

  const migrationPaths = paths.filter((path) => path.startsWith("supabase/migrations/"))
  assert.equal(migrationPaths.length, 19)
  assert.ok(migrationPaths.at(-1)?.endsWith("20260722000100_site_owner_role_invariant.sql"))
  assert.ok(paths.includes("supabase/schema.sql"))
  assert.ok(paths.includes("supabase/tests/20260722_tag_write_pause_sealed.ps1"))
  assert.ok(paths.includes("supabase/tests/20260722_tag_write_pause_sealed_container.ps1"))
  assert.ok(paths.includes("supabase/tests/20260722_tag_write_pause_disposable.ps1"))
  assert.ok(paths.includes("supabase/tests/20260722_tag_write_pause_disposable_writer_release.sql"))
  assert.match(sealedHost, /20260722_tag_write_pause_disposable_writer_release\.sql/)
  assert.ok(paths.includes("supabase/operations/20260722_tag_write_pause_enable.sql"))
  assert.ok(paths.includes("supabase/operations/20260722_tag_write_pause_disable.sql"))
  assert.doesNotMatch(paths.join("\n"), /20260722000150|20260722000200|(?:^|\/)\.env|project-ref/)

  for (const entry of entries) {
    const actual = createHash("sha256").update(readRepositoryFile(entry.path)).digest("hex")
    assert.equal(actual, entry.hash, `sealed hash mismatch: ${entry.path}`)
  }
})

test("sealed CLI bootstrap loads the exact schema and one synthetic owner before 19 migrations", () => {
  assert.match(sealedConfig, /^major_version = 17$/m)
  assert.match(sealedConfig, /\[db\.seed\][\s\S]*enabled = false/)
  assert.match(sealedConfig, /\[realtime\][\s\S]*enabled = false/)
  assert.match(sealedConfig, /\[auth\][\s\S]*enabled = true/)
  assert.match(sealedConfig, /\[storage\][\s\S]*enabled = true/)
  assert.doesNotMatch(sealedConfig, /seed\.sql/)
  assert.match(sealedRoles, /^\\ir schema\.sql$/m)
  assert.equal((sealedRoles.match(/INSERT INTO auth\.users/g) ?? []).length, 1)
  assert.match(sealedRoles, /b154d7e9-07c9-4412-8673-86239bbbe367/)
  assert.match(sealedRoles, /2149665127@qq\.com/)
  assert.match(sealedBootstrap, /actual_versions IS DISTINCT FROM expected_versions/)
  assert.match(sealedBootstrap, /count\(\*\) FROM supabase_migrations\.schema_migrations\) <> 19/)
  assert.match(sealedBootstrap, /20260722000150', '20260722000200/)
  assert.match(sealedBootstrap, /tag_write_pause_sealed_bootstrap_passed/)
  assert.match(sealedBootstrap, /AS database_owner/)
  assert.match(sealedBootstrap, /database\.datname = 'postgres'/)
  assert.match(sealedBootstrap, /role\.rolname = 'supabase_admin'/)
  assert.match(sealedBootstrap, /role\.rolsuper/)
  assert.match(sealedBootstrap, /role\.rolcanlogin/)
  assert.match(sealedHost, /tag_write_pause_sealed_bootstrap_passed,\(\[0-9\]\+\),19,\(\[a-z_\]/)
  assert.match(sealedHost, /Write-HostEvidence "bootstrap-admin-observation\.txt"/)
  assert.match(sealedHost, /\$BootstrapDatabaseOwner -notin @\("postgres", "supabase_admin"\)/)
  assert.match(sealedHost, /\$BootstrapAdminSuperuser -cne "t"/)
  assert.match(sealedHost, /\$BootstrapAdminLogin -cne "t"/)
  assert.equal((sealedHost.match(/"--username=supabase_admin"/g) ?? []).length, 2)
  assert.match(sealedRename, /ALTER DATABASE postgres ALLOW_CONNECTIONS false/)
  assert.match(sealedRename, /pg_terminate_backend/)
  assert.match(sealedRename, /ALTER DATABASE postgres RENAME TO :"sealed_database_name"/)
})

test("sealed runner image pins compatible Debian digests and performs no package or network install", () => {
  assert.match(
    sealedDockerfile,
    /mcr\.microsoft\.com\/powershell:7\.5-debian-12@sha256:7ab5bd5ca6f95a3351fa0c6a1205237d57048c94542355aab55519a0861a9b25/,
  )
  assert.match(
    sealedDockerfile,
    /public\.ecr\.aws\/docker\/library\/postgres:17\.6-bookworm@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3/,
  )
  assert.match(sealedDockerfile, /FROM \$\{POSTGRES_RUNNER_IMAGE\} AS postgres_client/)
  assert.match(sealedDockerfile, /FROM \$\{POWERSHELL_IMAGE\}/)
  assert.match(sealedDockerfile, /\/usr\/lib\/postgresql\/17\/bin\/psql/)
  assert.match(sealedDockerfile, /\/usr\/lib\/postgresql\/17\/bin\/pg_isready/)
  assert.doesNotMatch(sealedDockerfile, /\/usr\/bin\/psql|COPY[^\n]*pg_wrapper/)
  assert.match(sealedDockerfile, /ldd \/opt\/pg17\/bin\/psql/)
  assert.match(sealedDockerfile, /grep -F 'not found'/)
  assert.ok(sealedDockerfile.includes("psql \\\\(PostgreSQL\\\\) 17\\\\.6"))
  assert.match(sealedDockerfile, /USER 65534:65534/)
  assert.doesNotMatch(sealedDockerfile, /\b(?:apt|apt-get|apk|curl|wget)\b/i)

  assert.match(
    sealedDbDockerfile,
    /public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.143@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8/,
  )
  assert.match(sealedDbDockerfile, /FROM \$\{SUPABASE_POSTGRES_IMAGE\}/)
  assert.match(sealedDbDockerfile, /20260722_tag_write_pause_sealed_postgresql\.conf/)
  assert.match(sealedDbDockerfile, /20260722_tag_write_pause_sealed_pg_hba\.conf/)
  assert.match(sealedDbDockerfile, /^STOPSIGNAL SIGINT$/m)
  assert.doesNotMatch(sealedDbDockerfile, /\bVOLUME\b|\b(?:apt|apt-get|apk|curl|wget)\b/i)
  assert.match(sealedPostgresConfig, /^listen_addresses = '127\.0\.0\.1'$/m)
  assert.match(sealedPostgresConfig, /^ssl = off$/m)
  assert.match(sealedPostgresConfig, /^shared_preload_libraries = ''$/m)
  assert.match(sealedHba, /^host all all 127\.0\.0\.1\/32 trust$/m)
  assert.match(sealedHba, /^host all all 0\.0\.0\.0\/0 reject$/m)
  assert.match(sealedHba, /^local all all reject$/m)
})

test("sealed host pins CLI and helper digests, gates bootstrap publication, and cleans exact resources", () => {
  assert.match(sealedHost, /Supabase CLI must be exactly 2\.109\.1/)
  assert.match(sealedHost, /function Invoke-DockerSql/)
  for (const label of ["bootstrap-attestation", "bootstrap-rename", "bootstrap-sanitize"]) {
    assert.match(sealedHost, new RegExp(`Invoke-DockerSql "${label}"`))
  }
  assert.match(sealedHost, /docker-sql-failure-\$CallLabel\.txt/)
  assert.doesNotMatch(sealedHost, /Write-HostEvidence[^\n]*docker-sql[^\n]*\$Arguments/)
  assert.match(sealedHost, /Write-HostEvidence "bootstrap-port-observation\.txt"/)
  assert.match(sealedHost, /\$_ -notin @\("0\.0\.0\.0", "::", "127\.0\.0\.1", "::1"\)/)
  assert.match(
    sealedHost,
    /Published PostgreSQL host listener is neither wildcard nor loopback-only/,
  )
  assert.match(sealedHost, /Write-HostEvidence "bootstrap-container-identity\.txt"/)
  for (const field of [
    "expected_name",
    "actual_name",
    "expected_image_id",
    "actual_image_id",
    "expected_running",
    "actual_running",
    "expected_network_mode",
    "actual_network_mode",
  ]) {
    assert.match(sealedHost, new RegExp(`"${field}=`))
  }
  assert.doesNotMatch(sealedHost, /Bootstrap container identity or immutable image is wrong/)
  assert.match(sealedHost, /22c0f28f013411c7a7b880116cd33636edb955a64278914692eea010bcc98dc7/)
  for (const digest of [
    "288d880ebc80a1cb5ad52dc7d12328f76e9c90127003306864a270118bba00a8",
    "5f5377bf9d1f0e6b59fe6a0cb57e9ff65f9960eed5b43e93862969f81c44acae",
    "28f8a3cc5dd81b1b13098ca12460883ecb911d017a371b4b5efcb3ec432c1f1e",
  ]) {
    assert.ok(sealedHost.includes(digest))
  }
  assert.match(sealedHost, /HOME = \$IsolatedHome/)
  assert.match(sealedHost, /USERPROFILE = \$IsolatedHome/)
  assert.match(sealedHost, /SUPABASE_ACCESS_TOKEN/)
  assert.match(sealedHost, /local-image-preflight\.txt/)
  assert.match(sealedHost, /tag_write_pause_sealed_local_images_verified/)
  assert.doesNotMatch(sealedHost, /Invoke-Docker @\("pull"/)
  assert.match(
    sealedHost,
    /A required exact digest image is not available in the local Docker engine/,
  )
  assert.match(sealedHost, /"db", "start", "--workdir", \$BootstrapRoot/)
  assert.match(sealedHost, /NewContainers\.Count -ne 1/)
  assert.match(sealedHost, /\/supabase_auth_\$ProjectId/)
  assert.match(sealedHost, /\/supabase_storage_\$ProjectId/)
  assert.match(sealedHost, /\/supabase_realtime_\$ProjectId/)
  assert.match(sealedHost, /realtime=disabled/)
  assert.doesNotMatch(sealedHost, /--internal|host_binding_ipv4/)
  assert.match(
    sealedHost,
    /I_AUTHORIZE_TEMPORARY_NON_LOOPBACK_FIREWALL_BLOCK_FOR_SEALED_LOCAL_PG17/,
  )
  assert.match(sealedHost, /New-NetFirewallRule -PolicyStore "PersistentStore"/)
  assert.match(sealedHost, /Get-NetFirewallProfile -PolicyStore "ActiveStore"/)
  assert.match(sealedHost, /Get-NetFirewallApplicationFilter/)
  assert.match(sealedHost, /Get-NetFirewallServiceFilter/)
  assert.match(sealedHost, /Get-NetFirewallInterfaceFilter/)
  assert.match(sealedHost, /Get-NetFirewallInterfaceTypeFilter/)
  assert.match(sealedHost, /\$LocalPorts\.Count -ne 1/)
  assert.match(sealedHost, /\$RemotePorts\.Count -ne 1/)
  assert.match(sealedHost, /\$LocalAddresses\.Count -ne 1/)
  assert.match(sealedHost, /Domain`nPrivate`nPublic/)
  assert.match(sealedHost, /0\.0\.0\.0-126\.255\.255\.255/)
  assert.match(sealedHost, /128\.0\.0\.0-255\.255\.255\.255/)
  assert.match(sealedHost, /::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/)
  assert.match(sealedHost, /Rule\.DisplayName -cne \$DisplayName/)
  assert.match(sealedHost, /Rule\.Group -cne \$Group/)
  assert.match(sealedHost, /Rule\.Description -cne \$Description/)
  assert.match(sealedHost, /Remove-NetFirewallRule -InputObject \$FreshReleasePersistentRule\.Rule/)
  assert.match(sealedHost, /firewall-release\.txt/)
  assert.match(sealedHost, /host_listener_count=0/)
  assert.match(sealedHost, /temporary-firewall-rule/)
  assert.match(sealedHost, /runtime cleanup was not proven/)
  assert.match(sealedHost, /HostPortConnected/)
  assert.match(
    sealedHost,
    /\$BootstrapPgCtlPath = "\/nix\/var\/nix\/profiles\/default\/bin\/pg_ctl"/,
  )
  assert.match(sealedHost, /pg_ctl \(PostgreSQL\) 17\.6/)
  assert.match(
    sealedHost,
    /\$BootstrapPgCtlPath, "-D", \$PgData, "-m", "fast", "-w", "-t", "30", "stop"/,
  )
  assert.match(sealedHost, /"stop", "--signal", "SIGINT", "--time", "30", \$DatabaseContainerId/)
  assert.match(sealedHost, /\$StoppedBootstrapExitCode -notin @\(0, 1\)/)
  assert.match(sealedHost, /\$StoppedDatabaseExitCode -notin @\(0, 130\)/)
  assert.equal((sealedHost.match(/"OOMKilled"/g) ?? []).length, 2)
  assert.equal((sealedHost.match(/"Dead"/g) ?? []).length, 2)
  assert.match(sealedHost, /bootstrap-stop-observation\.txt/)
  assert.match(sealedHost, /database-stop-observation\.txt/)
  assert.match(sealedHost, /Invoke-DockerControl "bootstrap-pgctl-version"/)
  assert.match(sealedHost, /Invoke-DockerControl "bootstrap-pgctl-stop"/)
  assert.match(sealedHost, /Invoke-DockerControl "bootstrap-restart-disable"/)
  assert.match(sealedHost, /"update", "--restart=no", \$BootstrapContainerId/)
  assert.match(sealedHost, /expected_restart_policy=unless-stopped/)
  assert.match(sealedHost, /current_restart_policy=no/)
  assert.match(sealedHost, /bootstrap-restart-policy\.txt/)
  const dockerSqlBlock = sealedHost.match(
    /function Invoke-DockerSql\([\s\S]*?(?=function Invoke-DockerControl\()/,
  )
  const dockerControlBlock = sealedHost.match(
    /function Invoke-DockerControl\([\s\S]*?(?=function Get-OptionalDockerImageId\()/,
  )
  assert.ok(dockerSqlBlock)
  assert.ok(dockerControlBlock)
  assert.doesNotMatch(dockerSqlBlock[0], /ExpectedExitCodes/)
  assert.match(dockerControlBlock[0], /\$CallLabel -ceq "bootstrap-pgctl-stop"/)
  assert.match(dockerControlBlock[0], /@\(0, 137\)/)
  assert.match(sealedHost, /docker-control-failure-\$CallLabel\.txt/)
  assert.match(sealedHost, /bootstrap-pgctl-stop\.txt/)
  assert.match(sealedHost, /allowed_exec_exit_codes=0,137/)
  assert.match(sealedHost, /requested_method=pg_ctl-fast/)
  assert.match(sealedHost, /\^waiting for server to shut down\(\?<dots>\\\.\{1,30\}\)\$/)
  assert.match(
    sealedHost,
    /\^waiting for server to shut down\(\?<dots>\\\.\{1,30\}\) done\\nserver stopped\$/,
  )
  assert.match(
    sealedHost,
    /\$BootstrapPgCtlStopOutput\.CharacterCount -eq \(31 \+ \$BootstrapPgCtlProgressDots\)/,
  )
  assert.match(
    sealedHost,
    /\$BootstrapPgCtlStopOutput\.CharacterCount -eq \(51 \+ \$BootstrapPgCtlProgressDots\)/,
  )
  assert.match(sealedHost, /\$BootstrapPgCtlStopOutput\.TotalLineCount -eq 1/)
  assert.match(sealedHost, /\$BootstrapPgCtlStopOutput\.TotalLineCount -eq 2/)
  assert.match(
    sealedHost,
    /interrupted_shape_standard=\$\(\$BootstrapPgCtlInterruptedMatch\.Success\)/,
  )
  assert.match(sealedHost, /completed_shape_standard=\$\(\$BootstrapPgCtlCompletedMatch\.Success\)/)
  assert.match(sealedHost, /progress_dot_count=\$BootstrapPgCtlProgressDots/)
  assert.match(sealedHost, /function Write-DockerHelperExitDiagnostic/)
  assert.match(sealedHost, /ValidateSet\("quiesce", "archive", "restore"\)/)
  assert.match(sealedHost, /docker-helper-failure-\$HelperLabel\.txt/)
  assert.match(sealedHost, /Write-DockerHelperExitDiagnostic `\s*"quiesce"/)
  assert.match(sealedHost, /Write-DockerHelperExitDiagnostic `\s*"archive"/)
  assert.match(sealedHost, /Write-DockerHelperExitDiagnostic `\s*"restore"/)
  assert.match(sealedHost, /function Write-DockerDatabaseReadinessDiagnostic/)
  assert.match(sealedHost, /docker-database-readiness-failure\.txt/)
  assert.match(sealedHost, /Write-DockerDatabaseReadinessDiagnostic \$DatabaseContainerId/)
  assert.match(sealedHost, /function Write-DockerRunnerStateDiagnostic/)
  assert.match(sealedHost, /docker-runner-state-diagnostic\.txt/)
  assert.match(sealedHost, /function Invoke-DockerTopology/)
  assert.match(sealedHost, /docker-topology-failure-\$CallLabel\.txt/)
  assert.match(sealedHost, /Invoke-DockerTopology "runner-netns"/)
  assert.match(sealedHost, /function Copy-DockerTextEvidenceFile/)
  assert.match(sealedHost, /Invoke-DockerTopology "runner-evidence-stat"/)
  assert.match(sealedHost, /Invoke-DockerTopology "runner-evidence-read"/)
  assert.match(sealedHost, /Invoke-DockerTopology "runner-evidence-inventory"/)
  assert.match(sealedHost, /"--format=%F\|%s"/)
  assert.match(sealedHost, /"-printf", "%y\|%P\\n"/)
  assert.match(sealedHost, /\$Read\.StandardOutputUtf8ByteCount -ne \$SourceSize/)
  assert.match(sealedHost, /\[IO\.File\]::WriteAllBytes/)
  assert.match(sealedHost, /\$TotalEvidenceBytes -gt 67108864/)
  assert.match(sealedHost, /runner-evidence-transfer\.txt/)
  assert.equal(
    (sealedHost.match(/Sealed runner evidence destination already exists/g) ?? []).length,
    2,
  )
  assert.doesNotMatch(sealedHost, /\$\{RunnerContainerId\}:\/evidence/)
  assert.match(sealedHost, /\$RunnerFailureReady = \$false/)
  assert.match(sealedHost, /\/evidence\/failure-evidence-sha256\.txt/)
  assert.match(sealedHost, /runner-failure-transfer\.txt/)
  assert.match(sealedHost, /Runner failure evidence inventory differs from its manifest/)
  assert.match(sealedHost, /Copied runner failure evidence hash mismatch/)
  assert.match(sealedHost, /Sealed runner reported a bounded failure/)
  assert.match(sealedHost, /\$FailedRunnerWait\.Output\[0\]\.Trim\(\) -cne "1"/)
  assert.match(sealedContainer, /trap \{/)
  assert.match(sealedContainer, /tag_write_pause_sealed_runner_failed/)
  assert.match(sealedContainer, /\[IO\.File\]::WriteAllLines\(/)
  assert.match(sealedContainer, /failure-evidence-sha256\.txt/)
  assert.match(sealedContainer, /\.failure-evidence-sha256\.tmp/)
  assert.match(sealedContainer, /\[IO\.File\]::Move\(/)
  assert.match(sealedContainer, /function Get-SealedTextMetrics/)
  assert.match(sealedContainer, /function Write-SealedSubprocessFailureDiagnostic/)
  assert.match(sealedContainer, /Write-SealedEvidence "subprocess-failure\.txt"/)
  assert.match(sealedContainer, /diagnostic_evidence=\$Diagnostic/)
  assert.match(sealedContainer, /parameter_binding = "ParameterBindingException"/)
  assert.match(sealedContainer, /command_not_found = "CommandNotFoundException"/)
  assert.match(sealedContainer, /parser_error = "ParserError"/)
  assert.doesNotMatch(
    sealedContainer,
    /Write-SealedEvidence[^\n]*\$Result\.(?:StandardOutputText|StandardErrorText)/,
  )
  assert.match(sealedContainer, /\$script:RunnerStage = "input-initial"/)
  assert.match(sealedContainer, /\$script:RunnerStage = "evidence-initialization"/)
  assert.match(
    sealedDockerfile,
    /\/root\/\.supabase\/access-token[\s\S]*\/root\/\.config\/supabase\/access-token[\s\S]*\/home\/postgres\/\.supabase\/access-token[\s\S]*\/home\/postgres\/\.config\/supabase\/access-token/,
  )
  assert.match(sealedDockerfile, /do test ! -e \\"\$path\\"; done/)
  assert.match(sealedContainer, /\/tmp\/wouldkeep-home\/\.supabase\/access-token/)
  assert.match(sealedContainer, /\/tmp\/wouldkeep-home\/\.config\/supabase\/access-token/)
  assert.doesNotMatch(sealedContainer, /\/root\/\.supabase\/access-token/)
  assert.doesNotMatch(sealedContainer, /\/home\/postgres\/\.supabase\/access-token/)
  assert.match(sealedContainer, /"\/usr\/bin\/cat"/)
  assert.match(sealedContainer, /"\/usr\/bin\/find"/)
  assert.match(sealedContainer, /"\/usr\/bin\/stat"/)
  assert.match(sealedContainer, /\$script:RunnerStage = "attestation-before"/)
  assert.match(sealedContainer, /\$script:RunnerStage = "matrix"/)
  assert.doesNotMatch(sealedContainer, /runner-failure\.txt" \$_/)
  assert.doesNotMatch(
    sealedHost,
    /Write-HostEvidence[^\n]*\$Logs\.(?:Output|StandardOutputText|StandardErrorText)/,
  )
  assert.equal((sealedHost.match(/engine_error_empty=/g) ?? []).length, 4)
  assert.match(sealedHost, /bootstrap-clean-shutdown\.txt/)
  assert.match(sealedHost, /pg_ctl_exec_exit_code=\$\(\$BootstrapPgCtlStop\.ExitCode\)/)
  assert.match(sealedHost, /container_entrypoint_exit_code=\$StoppedBootstrapExitCode/)
  assert.match(sealedHost, /pg_ctl_progress_dot_count=\$BootstrapPgCtlProgressDots/)
  assert.match(sealedHost, /offline_pg_controldata=shut down/)
  assert.match(sealedHost, /"--network", "none", "--read-only"/)
  assert.match(sealedHost, /"--network", "container:\$DatabaseContainerId"/)
  assert.equal((sealedHost.match(/"create", "--pull=never"/g) ?? []).length, 5)
  assert.match(sealedHost, /tag_write_pause_sealed_quiesce_passed/)
  assert.match(sealedHost, /bootstrap-quiesce-recovery\.txt/)
  assert.match(sealedHost, /recovery_helper_exit_code=0/)
  assert.match(sealedHost, /\$QuiesceCapAdd\.Count -ne 0/)
  assert.match(sealedHost, /\$QuiesceCapDrop\[0\] -cne "ALL"/)
  assert.match(sealedHost, /\$QuiesceSecurityOpt\[0\] -cne "no-new-privileges"/)
  assert.match(sealedHost, /\$QuiesceMounts\.Count -ne 1/)
  assert.match(sealedHost, /\$QuiesceMounts\[0\] "RW"\) -cne \$true/)
  assert.match(
    sealedHost,
    /Get-DockerRequiredString \$DatabaseConfig "User"\) -cne[\s\S]*"\$\{BootstrapUser\}:\$BootstrapGroup"/,
  )
  assert.match(sealedHost, /Get-DockerRequiredString \$RunnerConfig "User"\) -cne "65534:65534"/)
  assert.match(
    sealedHost,
    /Get-DockerRequiredString \$RunnerInspect "Image"\) -cne \$RunnerImageId/,
  )
  assert.match(
    sealedHost,
    /Get-DockerRequiredString \$DatabaseInspect "Image"\) -cne \$DatabaseImageId/,
  )
  assert.match(sealedHost, /Get-DockerRequiredString \$DatabaseRestartPolicy "Name"/)
  assert.match(sealedHost, /Get-DockerRequiredString \$RunnerRestartPolicy "Name"/)
  assert.match(
    sealedHost,
    /Get-DockerRequiredNullableMapProperties \$DatabaseHostConfig "PortBindings"/,
  )
  assert.match(
    sealedHost,
    /Get-DockerRequiredNullableMapProperties \$RunnerHostConfig "PortBindings"/,
  )
  assert.match(
    sealedHost,
    /Get-DockerNullableListValue \$BootstrapPortProperties\[0\]\.Value "PortBindings\.5432\/tcp"/,
  )
  assert.match(
    sealedHost,
    /\$BootstrapRequestedHostIp = Get-DockerRequiredString \$BootstrapPortBinding\[0\] "HostIp"/,
  )
  assert.match(
    sealedHost,
    /\$BootstrapRequestedHostPort = Get-DockerRequiredString \$BootstrapPortBinding\[0\] "HostPort"/,
  )
  assert.match(sealedHost, /Get-DockerRequiredBoolean \$DatabaseHostConfig "PublishAllPorts"/)
  assert.match(sealedHost, /Get-DockerRequiredBoolean \$RunnerHostConfig "PublishAllPorts"/)
  assert.match(sealedHost, /Get-DockerRequiredBoolean \$DatabaseHostConfig "Privileged"/)
  assert.match(sealedHost, /Get-DockerRequiredBoolean \$RunnerHostConfig "Privileged"/)
  for (const [owner, hostConfig] of [
    ["Database", "DatabaseHostConfig"],
    ["Runner", "RunnerHostConfig"],
  ] as const) {
    for (const field of ["CapAdd", "Devices", "Binds", "ExtraHosts", "Dns"]) {
      assert.match(
        sealedHost,
        new RegExp(
          `\\$${owner}${field} = @\\(Get-DockerRequiredNullableList \\$${hostConfig} "${field}"\\)`,
        ),
      )
    }
  }
  assert.match(
    sealedHost,
    /\$DatabasePidMode = Get-DockerRequiredString \$DatabaseHostConfig "PidMode"/,
  )
  assert.match(
    sealedHost,
    /\$DatabaseIpcMode = Get-DockerRequiredString \$DatabaseHostConfig "IpcMode"/,
  )
  assert.match(
    sealedHost,
    /\$RunnerPidMode = Get-DockerRequiredString \$RunnerHostConfig "PidMode"/,
  )
  assert.match(
    sealedHost,
    /\$RunnerIpcMode = Get-DockerRequiredString \$RunnerHostConfig "IpcMode"/,
  )
  assert.match(
    sealedHost,
    /Get-DockerRequiredNullableMapProperties \$DatabaseNetworkSettings "Networks"/,
  )
  assert.match(sealedHost, /DatabaseNetworks\[0\]\.Name -ceq "none"/)
  assert.match(
    sealedHost,
    /\$DatabaseNoneEndpointId = Get-DockerRequiredString \$DatabaseNoneNetwork "EndpointID"/,
  )
  assert.match(
    sealedHost,
    /\$DatabaseNoneIpAddress = Get-DockerRequiredString \$DatabaseNoneNetwork "IPAddress"/,
  )
  assert.match(
    sealedHost,
    /\$DatabaseNoneGateway = Get-DockerRequiredString \$DatabaseNoneNetwork "Gateway"/,
  )
  assert.match(
    sealedHost,
    /Get-DockerRequiredNullableMapProperties \$RunnerNetworkSettings "Networks"/,
  )
  assert.match(sealedHost, /rw,nosuid,nodev,noexec,size=67108864/)
  assert.match(sealedHost, /rw,nosuid,nodev,noexec,size=268435456/)
  assert.match(
    sealedHost,
    /\$RunnerMounts = @\(Get-DockerRequiredNullableList \$RunnerInspect "Mounts"\)/,
  )
  assert.match(sealedHost, /Get-DockerRequiredString \$_ "Type"\) -in @\("bind", "volume"\)/)
  assert.match(sealedHost, /readlink", "\/proc\/1\/ns\/net"/)
  assert.match(sealedHost, /"\/proc\/net\/dev"/)
  assert.match(sealedHost, /"\/proc\/net\/route"/)
  assert.match(sealedHost, /"\/proc\/net\/ipv6_route"/)
  assert.match(sealedHost, /\$Fields\[-1\] -cne "lo"/)
  assert.match(sealedHost, /non-loopback IPv6 default route/)
  assert.match(sealedHost, /"\/usr\/bin\/timeout", "3", "\/usr\/bin\/getent"/)
  assert.match(sealedHost, /Invoke-DockerTopology "database-ports"/)
  assert.match(sealedHost, /Invoke-DockerTopology "runner-ports"/)
  assert.match(sealedHost, /runner_external_mounts=none/)
  assert.match(sealedHost, /runner_credentials=none/)
  assert.match(sealedHost, /"--env", "HOME=\/tmp\/wouldkeep-home"/)
  assert.match(sealedHost, /"--env", "XDG_CONFIG_HOME=\/tmp\/wouldkeep-home\/\.config"/)
  assert.match(sealedHost, /"--env", "XDG_CACHE_HOME=\/tmp\/wouldkeep-home\/\.cache"/)
  assert.match(sealedHost, /\$RunnerHome\[0\] -cne "HOME=\/tmp\/wouldkeep-home"/)
  assert.match(sealedHost, /runner_home=tmpfs-only/)
  assert.match(sealedHost, /PGPASSWORD\|PGPASSFILE\|JWT\|SECRET\|TOKEN/)
  assert.match(sealedHost, /network_interfaces=lo-only/)
  assert.match(sealedHost, /external_dns_resolution=failed-within-3s/)
  assert.ok(sealedHost.indexOf("try {") < sealedHost.indexOf("foreach ($Directory in @("))
  assert.match(sealedHost, /Assert-FrozenInput/)
  assert.match(sealedHost, /Assert-BootstrapFrozenInput/)
  assert.match(sealedHost, /Assert-FrozenBuildContextMetadata/)
  assert.match(sealedHost, /Source changed while freezing sealed input/)
  assert.match(sealedHost, /\$ManifestLines \| Set-Content/)
  assert.match(sealedHost, /Copied sealed evidence set differs from its manifest/)
  assert.match(sealedHost, /Copied sealed evidence hash mismatch/)
  assert.match(sealedHost, /DOCKER_CONFIG/)
  assert.match(sealedHost, /npipe:\/\/\/\/\.\/pipe\/dockerDesktopLinuxEngine/)
  assert.match(sealedHost, /Docker context must be exactly desktop-linux/)
  assert.match(sealedHost, /Docker daemon identity or OS type drifted/)
  assert.match(sealedHost, /\$CliEnvironment\.DOCKER_HOST = \$script:DockerEndpoint/)
  assert.match(sealedHost, /"ps", "-aq", "--no-trunc"/)
  assert.match(sealedHost, /\$VolumesBefore/)
  assert.match(sealedHost, /\$NetworksBefore/)
  assert.match(sealedHost, /ExpectedFreshContainerNames/)
  assert.match(sealedHost, /ExpectedFreshVolumeNames/)
  assert.match(sealedHost, /ExpectedFreshNetworkNames/)
  assert.match(sealedHost, /nonce-runtime-reconciliation/)
  assert.match(sealedHost, /ValidateSet\("container", "volume", "network", "image"\)/)
  assert.match(sealedHost, /Get-DockerInspect "volume" \$VolumeName/)
  assert.match(sealedHost, /Get-DockerInspect "container" \$ContainerId/)
  assert.match(sealedHost, /Get-DockerInspect "network" \$NetworkId/)
  assert.match(sealedHost, /cleanup-ownership-block\.txt/)
  assert.match(sealedHost, /\$null = Complete-RuntimeCleanupProof \$Proof/)
  assert.doesNotMatch(sealedHost, /RuntimeIsolationCleanupPassed|CleanupEngineVerified/)
  const bootstrapStop = sealedHost.indexOf(
    '$BootstrapPgCtlPath, "-D", $PgData, "-m", "fast", "-w", "-t", "30", "stop"',
  )
  const restartDisable = sealedHost.indexOf('"update", "--restart=no", $BootstrapContainerId')
  const listenerZero = sealedHost.indexOf(
    'throw "Bootstrap host listener remained after the database container stopped"',
  )
  const bootstrapRemove = sealedHost.indexOf('$null = Invoke-Docker @("rm", $RemovedBootstrapId)')
  const firewallRelease = sealedHost.indexOf(
    "Remove-NetFirewallRule -InputObject $FreshReleasePersistentRule.Rule",
  )
  assert.ok(
    restartDisable >= 0 &&
      restartDisable < bootstrapStop &&
      bootstrapStop >= 0 &&
      bootstrapStop < listenerZero &&
      listenerZero < bootstrapRemove &&
      bootstrapRemove < firewallRelease,
  )
  assert.match(sealedHost, /\$ActiveFailure = \$null/)
  assert.match(sealedHost, /Remove-NetFirewallRule -InputObject \$FreshPersistentRule\.Rule/)
  assert.match(sealedHost, /tag_write_pause_sealed_archive_passed/)
  assert.match(sealedHost, /pg_controldata/)
  const archiveProof = sealedHost.indexOf("$ArchiveSha256 = $ArchiveMatch.Groups[1].Value")
  const cleanShutdownProof = sealedHost.indexOf('Write-HostEvidence "bootstrap-clean-shutdown.txt"')
  assert.ok(archiveProof >= 0 && archiveProof < cleanShutdownProof)
  assert.equal((sealedHost.match(/"--cap-add"/g) ?? []).length, 3)
  assert.match(sealedHost, /"--cap-add", "DAC_READ_SEARCH"/)
  assert.match(
    sealedHost,
    /\$ArchiveCapAdd = @\(Get-DockerRequiredNullableList \$ArchiveHostConfig "CapAdd"\)/,
  )
  assert.match(sealedHost, /\$ArchiveCapAdd\[0\] -cne "CAP_DAC_READ_SEARCH"/)
  assert.match(sealedHost, /\$ArchiveCapDrop\[0\] -cne "ALL"/)
  assert.match(sealedHost, /\$ArchiveSecurityOpt\[0\] -cne "no-new-privileges"/)
  assert.match(sealedHost, /"--cap-add", "CHOWN", "--cap-add", "DAC_READ_SEARCH"/)
  assert.match(sealedHost, /tar --no-same-owner -C \/target -xf/)
  assert.match(sealedHost, /chown -R '\$BootstrapUser`:\$BootstrapGroup' \/target/)
  assert.match(sealedHost, /find \/target -xdev/)
  assert.match(sealedHost, /\$RestoreCapAddSorted\[0\] -cne "CAP_CHOWN"/)
  assert.match(sealedHost, /\$RestoreCapAddSorted\[1\] -cne "CAP_DAC_READ_SEARCH"/)
  assert.match(sealedHost, /\$RestoreCapDrop\[0\] -cne "ALL"/)
  assert.match(sealedHost, /fresh_final_volume=true/)
  assert.match(sealedHost, /config_file=\/opt\/wouldkeep-db\/postgresql\.conf/)
  assert.match(sealedHost, /Remove-Item -LiteralPath \$ResolvedWorking -Recurse -Force/)
  assert.match(sealedHost, /tag_write_pause_sealed_cleanup_passed/)
  assert.match(sealedHost, /Supabase --linked mode is forbidden/)
  assert.doesNotMatch(sealedHost, /"db", "push"/i)
})

test("sealed firewall uses the exact canonical non-loopback union and race-closed release order", () => {
  const addressBlock = sealedHost.match(/\$FirewallRemoteAddresses = @\(\r?\n([\s\S]*?)\r?\n\)/)
  assert.ok(addressBlock)
  const addresses = [...addressBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(addresses, [
    "0.0.0.0-126.255.255.255",
    "128.0.0.0-255.255.255.255",
    "::",
    "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  ])
  assert.doesNotMatch(addressBlock[1], /::-::|::1|127\.|\bAny\b|0\.0\.0\.0\/0|::\/0/)

  const ipv4 = (value: string) =>
    value.split(".").reduce((result, part) => result * 256n + BigInt(part), 0n)
  const expandIpv6 = (value: string) => {
    const [left = "", right = ""] = value.split("::")
    const leftParts = left.length === 0 ? [] : left.split(":")
    const rightParts = right.length === 0 ? [] : right.split(":")
    const missing = 8 - leftParts.length - rightParts.length
    assert.ok(missing >= 0)
    return [...leftParts, ...Array<string>(missing).fill("0"), ...rightParts]
  }
  const ipv6 = (value: string) =>
    expandIpv6(value).reduce((result, part) => result * 65536n + BigInt(`0x${part}`), 0n)
  const [ipv4Left, ipv4Right] = addresses.slice(0, 2).map((range) => range.split("-"))
  assert.equal(ipv4(ipv4Left[1]) + 1n, ipv4("127.0.0.0"))
  assert.equal(ipv4(ipv4Right[0]) - 1n, ipv4("127.255.255.255"))
  assert.equal(ipv4(ipv4Left[0]), 0n)
  assert.equal(ipv4(ipv4Right[1]), 2n ** 32n - 1n)
  const [ipv6Start, ipv6End] = addresses[3].split("-")
  assert.equal(ipv6(addresses[2]), 0n)
  assert.equal(ipv6(ipv6Start) - 1n, ipv6("::1"))
  assert.equal(ipv6(ipv6End), 2n ** 128n - 1n)

  const firewallQueryStart = sealedHost.indexOf("function Get-ExactFirewallRule")
  const firewallQueryEnd = sealedHost.indexOf("function Test-AnyOrEmptyFirewallValue")
  const firewallQuery = sealedHost.slice(firewallQueryStart, firewallQueryEnd)
  assert.match(firewallQuery, /Get-NetFirewallRule -PolicyStore \$PolicyStore -ErrorAction Stop/)
  assert.match(firewallQuery, /OrdinalIgnoreCase\.Equals\(\$_\.Name, \$RuleName\)/)
  assert.doesNotMatch(firewallQuery, /SilentlyContinue/)

  const normalInventory = sealedHost.indexOf("$NormalReleaseInventory = Get-SealedRuntimeInventory")
  const normalEngine = sealedHost.indexOf("$null = Assert-DockerEngineIdentity", normalInventory)
  const normalFirstListener = sealedHost.indexOf(
    'throw "Host listener appeared immediately before firewall release"',
    normalEngine,
  )
  const normalFreshRule = sealedHost.indexOf(
    "$FreshReleasePersistentRules = @(Get-ExactFirewallRule",
    normalFirstListener,
  )
  const normalFinalListener = sealedHost.indexOf(
    'throw "Host listener appeared after final firewall identity proof"',
    normalFreshRule,
  )
  const normalRemove = sealedHost.indexOf(
    "Remove-NetFirewallRule -InputObject $FreshReleasePersistentRule.Rule",
    normalFinalListener,
  )
  assert.ok(
    normalInventory >= 0 &&
      normalInventory < normalEngine &&
      normalEngine < normalFirstListener &&
      normalFirstListener < normalFreshRule &&
      normalFreshRule < normalFinalListener &&
      normalFinalListener < normalRemove,
  )

  const cleanupStart = sealedHost.indexOf('Name = "temporary-firewall-rule"')
  const cleanupInventory = sealedHost.indexOf(
    "$ReleaseInventory = Get-SealedRuntimeInventory @InventoryParameters",
    cleanupStart,
  )
  const cleanupEngine = sealedHost.indexOf("$null = Assert-DockerEngineIdentity", cleanupInventory)
  const cleanupFirstListener = sealedHost.indexOf(
    'throw "Host listener appeared during cleanup firewall release proof"',
    cleanupEngine,
  )
  const cleanupFreshRule = sealedHost.indexOf("$FreshPersistentRules = @(", cleanupFirstListener)
  const cleanupFinalListener = sealedHost.indexOf(
    'throw "Host listener appeared after final cleanup firewall identity proof"',
    cleanupFreshRule,
  )
  const cleanupComplete = sealedHost.indexOf(
    "$null = Complete-RuntimeCleanupProof $ReleaseProof",
    cleanupFinalListener,
  )
  const cleanupRemove = sealedHost.indexOf(
    "Remove-NetFirewallRule -InputObject $FreshPersistentRule.Rule",
    cleanupComplete,
  )
  assert.ok(
    cleanupInventory >= 0 &&
      cleanupInventory < cleanupEngine &&
      cleanupEngine < cleanupFirstListener &&
      cleanupFirstListener < cleanupFreshRule &&
      cleanupFreshRule < cleanupFinalListener &&
      cleanupFinalListener < cleanupComplete &&
      cleanupComplete < cleanupRemove,
  )
  assert.equal((sealedHost.match(/Remove-NetFirewallRule -InputObject/g) ?? []).length, 2)
  assert.doesNotMatch(
    sealedHost,
    /Remove-NetFirewallRule -InputObject \$(?:ReleasePersistentRule|PersistentRule)\.Rule/,
  )
  assert.match(sealedHost, /firewall-retained\.txt/)
  assert.match(runbook, /firewall-retained\.txt/)
  assert.match(runbook, /Never improvise a name-based firewall deletion/)
})

test("sealed cleanup proof survives child scopes and listener discovery fails closed", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const stateStart = normalizedHost.indexOf("function New-RuntimeCleanupProofState")
  const stateEnd = normalizedHost.indexOf("\n}\n\nfunction Assert-DockerEngineIdentity", stateStart)
  const listenerStart = normalizedHost.indexOf("function Get-HostListenersOnPort")
  const listenerEnd = normalizedHost.indexOf("\n}\n\nfunction Assert-FrozenInput", listenerStart)
  assert.ok(stateStart >= 0 && stateEnd > stateStart)
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart)
  const stateSource = normalizedHost.slice(stateStart, stateEnd + 2)
  const listenerSource = normalizedHost.slice(listenerStart, listenerEnd + 2)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-cleanup-proof-"))
  const probePath = join(probeRoot, "cleanup-proof-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    stateSource,
    listenerSource,
    "function Assert-Throws {",
    "  param([scriptblock]$Action, [string]$Name)",
    "  $DidThrow = $false",
    "  try { $null = & $Action } catch { $DidThrow = $true }",
    '  if (-not $DidThrow) { throw "Expected rejection: $Name" }',
    "}",
    "function Set-PassingProof {",
    "  param([object]$State)",
    "  $State.SameEngineVerified = $true",
    "  $State.OwnershipAmbiguityCount = 0",
    "  $State.OwnedResourceCleanupCompleted = $true",
    "  $State.FinalOwnershipAmbiguityCount = 0",
    "  $State.HostListenerCount = 0",
    "  $State.FinalContainerCount = 0",
    "  $State.FinalVolumeCount = 0",
    "  $State.FinalNetworkCount = 0",
    "}",
    '$Shared = [pscustomobject]@{ RuntimeProof = New-RuntimeCleanupProofState; ContainerId = "owned" }',
    "$StepOne = {",
    "  $null = Set-PassingProof $Shared.RuntimeProof",
    "  $null = Complete-RuntimeCleanupProof $Shared.RuntimeProof",
    "  $Shared.ContainerId = $null",
    "}",
    "$StepTwo = {",
    '  if (-not $Shared.RuntimeProof.Proven -or $null -ne $Shared.ContainerId) { throw "child-scope state was lost" }',
    "  $Shared.RuntimeProof.FinalNetworkCount = 0",
    "}",
    "$null = & $StepOne",
    "$null = & $StepTwo",
    "$Reset = New-RuntimeCleanupProofState",
    'Assert-Throws { Complete-RuntimeCleanupProof $Reset } "default proof"',
    "$null = Set-PassingProof $Reset",
    "$null = Reset-RuntimeCleanupProofState $Reset",
    'Assert-Throws { Complete-RuntimeCleanupProof $Reset } "reset proof"',
    "$Cases = @(",
    '  [pscustomobject]@{ Name = "SameEngineVerified"; Value = $false },',
    '  [pscustomobject]@{ Name = "OwnedResourceCleanupCompleted"; Value = $false },',
    '  [pscustomobject]@{ Name = "OwnershipAmbiguityCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "FinalOwnershipAmbiguityCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "HostListenerCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "FinalContainerCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "FinalVolumeCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "FinalNetworkCount"; Value = 1 },',
    '  [pscustomobject]@{ Name = "SameEngineVerified"; Value = "true" },',
    '  [pscustomobject]@{ Name = "HostListenerCount"; Value = "0" }',
    ")",
    "foreach ($Case in $Cases) {",
    "  $State = New-RuntimeCleanupProofState",
    "  $null = Set-PassingProof $State",
    "  $State.($Case.Name) = $Case.Value",
    '  Assert-Throws { Complete-RuntimeCleanupProof $State } ("phase " + $Case.Name)',
    '  if ($State.Proven) { throw "failed proof remained true" }',
    "}",
    "$script:ListenerMode = " + '"empty"',
    "function Get-NetTCPConnection {",
    "  [CmdletBinding()]",
    "  param([string]$State)",
    '  if ($State -cne "Listen") { throw "wrong listener state" }',
    '  if ($script:ListenerMode -ceq "throw") { throw "synthetic listener query failure" }',
    '  if ($script:ListenerMode -ceq "invalid") { return [pscustomobject]@{ LocalPort = "bad" } }',
    '  if ($script:ListenerMode -ceq "match") { return [pscustomobject]@{ LocalPort = [uint16]54321 } }',
    '  if ($script:ListenerMode -ceq "other") { return [pscustomobject]@{ LocalPort = [uint16]54322 } }',
    "  return @()",
    "}",
    'if (@(Get-HostListenersOnPort 54321).Count -ne 0) { throw "empty listener query" }',
    '$script:ListenerMode = "throw"',
    'Assert-Throws { Get-HostListenersOnPort 54321 } "listener query failure"',
    '$script:ListenerMode = "invalid"',
    'Assert-Throws { Get-HostListenersOnPort 54321 } "listener port type"',
    '$script:ListenerMode = "match"',
    'if (@(Get-HostListenersOnPort 54321).Count -ne 1) { throw "matching listener" }',
    '$script:ListenerMode = "other"',
    'if (@(Get-HostListenersOnPort 54321).Count -ne 0) { throw "unrelated listener" }',
    'Write-Output "cleanup_proof_and_listener_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /cleanup_proof_and_listener_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed firewall query and semantic filters reject identity or canonical-scope drift", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const queryStart = normalizedHost.indexOf("function Get-ExactFirewallRule")
  const queryEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Test-AnyOrEmptyFirewallValue",
    queryStart,
  )
  const sortStart = normalizedHost.indexOf("function Get-OrdinalSorted")
  const sortEnd = normalizedHost.indexOf("\n}\n\nfunction Get-HostListenersOnPort", sortStart)
  const contractStart = normalizedHost.indexOf("function Test-AnyOrEmptyFirewallValue")
  const contractEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Assert-FirewallProfilesEnabled",
    contractStart,
  )
  const profileStart = normalizedHost.indexOf("function Assert-FirewallProfilesEnabled")
  const profileEnd = normalizedHost.indexOf("\n}\n\n$ExpectedInputPaths", profileStart)
  assert.ok(queryStart >= 0 && queryEnd > queryStart)
  assert.ok(sortStart >= 0 && sortEnd > sortStart)
  assert.ok(contractStart >= 0 && contractEnd > contractStart)
  assert.ok(profileStart >= 0 && profileEnd > profileStart)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-firewall-contract-"))
  const probePath = join(probeRoot, "firewall-contract-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    normalizedHost.slice(queryStart, queryEnd + 2),
    normalizedHost.slice(sortStart, sortEnd + 2),
    normalizedHost.slice(contractStart, contractEnd + 2),
    normalizedHost.slice(profileStart, profileEnd + 2),
    "function Assert-Throws {",
    "  param([scriptblock]$Action, [string]$Name)",
    "  $DidThrow = $false",
    "  try { $null = & $Action } catch { $DidThrow = $true }",
    '  if (-not $DidThrow) { throw "Expected rejection: $Name" }',
    "}",
    '$script:RuleMode = "empty"',
    "$script:RuleSet = @()",
    '$script:RemoteAddresses = @("::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "::", "128.0.0.0-255.255.255.255", "0.0.0.0-126.255.255.255")',
    '$script:Protocol = "TCP"',
    '$script:LocalPort = "54321"',
    '$script:RemotePort = "Any"',
    '$script:LocalAddress = "Any"',
    '$script:Program = "Any"',
    '$script:Service = "Any"',
    '$script:InterfaceAlias = "Any"',
    '$script:InterfaceType = "Any"',
    "$script:PortFilterCount = 1",
    "$script:AddressFilterCount = 1",
    "$script:ApplicationFilterCount = 1",
    "$script:ServiceFilterCount = 1",
    "$script:InterfaceFilterCount = 1",
    "$script:InterfaceTypeFilterCount = 1",
    '$script:ProfileMode = "valid"',
    "function Get-NetFirewallRule {",
    "  [CmdletBinding()]",
    "  param([string]$PolicyStore)",
    '  if ($script:RuleMode -ceq "throw") { throw "synthetic firewall query failure" }',
    "  return @($script:RuleSet)",
    "}",
    "function Get-NetFirewallPortFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:PortFilterCount; $Index++) {",
    "    $Result += [pscustomobject]@{ Protocol = $script:Protocol; LocalPort = $script:LocalPort; RemotePort = $script:RemotePort }",
    "  }",
    "  return $Result",
    "}",
    "function Get-NetFirewallAddressFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:AddressFilterCount; $Index++) {",
    "    $Result += [pscustomobject]@{ LocalAddress = $script:LocalAddress; RemoteAddress = @($script:RemoteAddresses) }",
    "  }",
    "  return $Result",
    "}",
    "function Get-NetFirewallApplicationFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:ApplicationFilterCount; $Index++) { $Result += [pscustomobject]@{ Program = $script:Program } }",
    "  return $Result",
    "}",
    "function Get-NetFirewallServiceFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:ServiceFilterCount; $Index++) { $Result += [pscustomobject]@{ Service = $script:Service } }",
    "  return $Result",
    "}",
    "function Get-NetFirewallInterfaceFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:InterfaceFilterCount; $Index++) { $Result += [pscustomobject]@{ InterfaceAlias = $script:InterfaceAlias } }",
    "  return $Result",
    "}",
    "function Get-NetFirewallInterfaceTypeFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    "  $Result = @()",
    "  for ($Index = 0; $Index -lt $script:InterfaceTypeFilterCount; $Index++) { $Result += [pscustomobject]@{ InterfaceType = $script:InterfaceType } }",
    "  return $Result",
    "}",
    "function Get-NetFirewallProfile {",
    "  [CmdletBinding()] param([string]$PolicyStore)",
    '  if ($PolicyStore -cne "ActiveStore") { throw "wrong profile store" }',
    '  if ($script:ProfileMode -ceq "throw") { throw "synthetic profile query failure" }',
    '  if ($script:ProfileMode -ceq "count") { return @([pscustomobject]@{ Name = "Domain"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "True" }) }',
    '  if ($script:ProfileMode -ceq "names") { return @([pscustomobject]@{ Name = "Domain"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "True" }) }',
    '  if ($script:ProfileMode -ceq "disabled") { return @([pscustomobject]@{ Name = "Domain"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "False" }, [pscustomobject]@{ Name = "Public"; Enabled = "True" }) }',
    '  return @([pscustomobject]@{ Name = "Public"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "True" }, [pscustomobject]@{ Name = "Domain"; Enabled = "True" })',
    "}",
    '$ExactRule = [pscustomobject]@{ Name = "rule"; DisplayName = "display"; Group = "group"; Description = "description"; InstanceID = "instance"; Direction = "Inbound"; Action = "Block"; Enabled = "True"; Profile = "Any"; PolicyStoreSourceType = "Local"; PolicyStoreSource = "PersistentStore" }',
    '$UnrelatedRule = [pscustomobject]@{ Name = "unrelated" }',
    "$script:RuleSet = @($UnrelatedRule, $ExactRule)",
    'if (@(Get-ExactFirewallRule "rule" "PersistentStore").Count -ne 1) { throw "exact query" }',
    "$script:RuleSet = @()",
    'if (@(Get-ExactFirewallRule "rule" "PersistentStore").Count -ne 0) { throw "empty query" }',
    '$script:RuleMode = "throw"',
    'Assert-Throws { Get-ExactFirewallRule "rule" "PersistentStore" } "query failure"',
    '$script:RuleMode = "exact"',
    "$script:RuleSet = @($ExactRule, $ExactRule)",
    'Assert-Throws { Get-ExactFirewallRule "rule" "PersistentStore" } "duplicate exact rules"',
    '$CaseRule = $ExactRule.PSObject.Copy(); $CaseRule.Name = "Rule"',
    "$script:RuleSet = @($CaseRule)",
    'Assert-Throws { Get-ExactFirewallRule "rule" "PersistentStore" } "case-variant rule"',
    "$script:RuleSet = @($ExactRule)",
    '$ExpectedRemote = @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")',
    '$null = Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote',
    "$null = Assert-FirewallProfilesEnabled",
    '$script:ProfileMode = "throw"',
    'Assert-Throws { Assert-FirewallProfilesEnabled } "profile query failure"',
    '$script:ProfileMode = "count"',
    'Assert-Throws { Assert-FirewallProfilesEnabled } "profile count drift"',
    '$script:ProfileMode = "names"',
    'Assert-Throws { Assert-FirewallProfilesEnabled } "profile name-set drift"',
    '$script:ProfileMode = "disabled"',
    'Assert-Throws { Assert-FirewallProfilesEnabled } "disabled profile"',
    '$script:ProfileMode = "valid"',
    "$BadRemoteSets = @(",
    '  @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::-::", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),',
    '  @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::1", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),',
    '  @("0.0.0.0/0", "::/0"),',
    '  @("Any"),',
    '  @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::"),',
    '  @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::", "::", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")',
    ")",
    "foreach ($BadRemote in $BadRemoteSets) {",
    "  $script:RemoteAddresses = @($BadRemote)",
    '  Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "remote scope drift"',
    "}",
    "$script:RemoteAddresses = @($ExpectedRemote)",
    "$RuleMutations = @(",
    '  [pscustomobject]@{ Field = "Name"; Value = "Rule" },',
    '  [pscustomobject]@{ Field = "DisplayName"; Value = "other-display" },',
    '  [pscustomobject]@{ Field = "Group"; Value = "other-group" },',
    '  [pscustomobject]@{ Field = "Description"; Value = "other-description" },',
    '  [pscustomobject]@{ Field = "Direction"; Value = "Outbound" },',
    '  [pscustomobject]@{ Field = "Action"; Value = "Allow" },',
    '  [pscustomobject]@{ Field = "Enabled"; Value = "False" },',
    '  [pscustomobject]@{ Field = "Profile"; Value = "Private" },',
    '  [pscustomobject]@{ Field = "PolicyStoreSourceType"; Value = "GroupPolicy" }',
    ")",
    "foreach ($Mutation in $RuleMutations) {",
    "  $BadRule = $ExactRule.PSObject.Copy()",
    "  $BadRule.($Mutation.Field) = $Mutation.Value",
    '  Assert-Throws { Assert-SealedFirewallRule $BadRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } ("rule field drift: " + $Mutation.Field)',
    "}",
    '$BadRule = $ExactRule.PSObject.Copy(); $BadRule.InstanceID = "other"',
    'Assert-Throws { Assert-SealedFirewallRule $BadRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "instance drift"',
    "$BadRule = $ExactRule.PSObject.Copy(); $BadRule.InstanceID = 7",
    'Assert-Throws { Assert-SealedFirewallRule $BadRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "instance type"',
    'Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" 7 54321 $ExpectedRemote } "expected instance type"',
    '$BadRule = $ExactRule.PSObject.Copy(); $BadRule.PSObject.Properties.Remove("Group")',
    'Assert-Throws { Assert-SealedFirewallRule $BadRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "missing rule field"',
    "$BadRule = $ExactRule.PSObject.Copy(); $BadRule.Direction = $null",
    'Assert-Throws { Assert-SealedFirewallRule $BadRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "null rule field"',
    "$FilterCountCases = @(",
    '  "PortFilterCount", "AddressFilterCount", "ApplicationFilterCount",',
    '  "ServiceFilterCount", "InterfaceFilterCount", "InterfaceTypeFilterCount"',
    ")",
    "foreach ($CountName in $FilterCountCases) {",
    "  foreach ($BadCount in @(0, 2)) {",
    "    Set-Variable -Scope Script -Name $CountName -Value $BadCount",
    '    Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } ("filter count drift: " + $CountName)',
    "    Set-Variable -Scope Script -Name $CountName -Value 1",
    "  }",
    "}",
    "$FilterValueCases = @(",
    '  [pscustomobject]@{ Name = "Protocol"; Value = "UDP" },',
    '  [pscustomobject]@{ Name = "LocalPort"; Value = "54322" },',
    '  [pscustomobject]@{ Name = "RemotePort"; Value = "443" },',
    '  [pscustomobject]@{ Name = "LocalAddress"; Value = "127.0.0.1" },',
    '  [pscustomobject]@{ Name = "Program"; Value = "C:\\unexpected.exe" },',
    '  [pscustomobject]@{ Name = "Service"; Value = "Dnscache" },',
    '  [pscustomobject]@{ Name = "InterfaceAlias"; Value = "Ethernet" },',
    '  [pscustomobject]@{ Name = "InterfaceType"; Value = "Wireless" }',
    ")",
    "foreach ($ValueCase in $FilterValueCases) {",
    "  $OriginalValue = Get-Variable -Scope Script -Name $ValueCase.Name -ValueOnly",
    "  Set-Variable -Scope Script -Name $ValueCase.Name -Value $ValueCase.Value",
    '  Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } ("filter value drift: " + $ValueCase.Name)',
    "  Set-Variable -Scope Script -Name $ValueCase.Name -Value $OriginalValue",
    "}",
    "$script:Protocol = $null",
    'Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "null filter field"',
    '$script:Protocol = "TCP"; $script:RemoteAddresses = @($null)',
    'Assert-Throws { Assert-SealedFirewallRule $ExactRule "rule" "display" "group" "description" "instance" 54321 $ExpectedRemote } "null remote address"',
    'Write-Output "firewall_query_and_contract_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /firewall_query_and_contract_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }

  const cleanupStart = sealedHost.indexOf('Name = "temporary-firewall-rule"')
  const cleanupEnd = sealedHost.indexOf('Name = "data-volume"', cleanupStart)
  const cleanup = sealedHost.slice(cleanupStart, cleanupEnd)
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart)
  const baselineRetain = cleanup.indexOf("if (-not $CliBaselineCaptured)")
  const partialRetain = cleanup.indexOf(
    "Partial firewall creation has no recorded exact rule identity",
  )
  const remove = cleanup.indexOf("Remove-NetFirewallRule -InputObject $FreshPersistentRule.Rule")
  const postStoreZero = cleanup.indexOf('throw "Temporary firewall rule residue remains')
  const clearOwnership = cleanup.indexOf("$CleanupState.FirewallRuleOwnershipEstablished = $false")
  assert.ok(
    baselineRetain >= 0 &&
      baselineRetain < remove &&
      partialRetain >= 0 &&
      partialRetain < remove &&
      remove < postStoreZero &&
      postStoreZero < clearOwnership,
  )
  assert.match(runbook, /separate written authorization/)
  assert.match(runbook, /manual-review-only/)
})

test("sealed firewall cleanup removes only after fresh proof and retains every unsafe residue", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const stateStart = normalizedHost.indexOf("function New-RuntimeCleanupProofState")
  const stateEnd = normalizedHost.indexOf("\n}\n\nfunction Assert-DockerEngineIdentity", stateStart)
  const queryStart = normalizedHost.indexOf("function Get-ExactFirewallRule")
  const queryEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Test-AnyOrEmptyFirewallValue",
    queryStart,
  )
  const sortStart = normalizedHost.indexOf("function Get-OrdinalSorted")
  const sortEnd = normalizedHost.indexOf("\n}\n\nfunction Get-HostListenersOnPort", sortStart)
  const contractStart = normalizedHost.indexOf("function Test-AnyOrEmptyFirewallValue")
  const contractEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Assert-FirewallProfilesEnabled",
    contractStart,
  )
  const profileStart = normalizedHost.indexOf("function Assert-FirewallProfilesEnabled")
  const profileEnd = normalizedHost.indexOf("\n}\n\n$ExpectedInputPaths", profileStart)
  const actionPrefix = '[pscustomobject]@{ Name = "temporary-firewall-rule"; Action = {'
  const actionStart = normalizedHost.indexOf(actionPrefix)
  const actionBodyStart = actionStart + actionPrefix.length
  const actionEnd = normalizedHost.indexOf(
    '\n    }},\n    [pscustomobject]@{ Name = "data-volume"',
    actionBodyStart,
  )
  const cleanupLoopStart = normalizedHost.indexOf("  foreach ($Step in $CleanupSteps) {", actionEnd)
  const cleanupLoopEnd = normalizedHost.indexOf(
    "\n}\n\nif ($CleanupFailures.Count -gt 0)",
    cleanupLoopStart,
  )
  const cleanupDecisionStart = normalizedHost.indexOf(
    "if ($CleanupFailures.Count -gt 0)",
    cleanupLoopEnd,
  )
  const cleanupDecisionEnd = normalizedHost.indexOf(
    '\nWrite-HostEvidence "cleanup.txt"',
    cleanupDecisionStart,
  )
  assert.ok(stateStart >= 0 && stateEnd > stateStart)
  assert.ok(queryStart >= 0 && queryEnd > queryStart)
  assert.ok(sortStart >= 0 && sortEnd > sortStart)
  assert.ok(contractStart >= 0 && contractEnd > contractStart)
  assert.ok(profileStart >= 0 && profileEnd > profileStart)
  assert.ok(actionStart >= 0 && actionEnd > actionBodyStart)
  assert.ok(cleanupLoopStart >= 0 && cleanupLoopEnd > cleanupLoopStart)
  assert.ok(cleanupDecisionStart >= 0 && cleanupDecisionEnd > cleanupDecisionStart)
  assert.doesNotMatch(normalizedHost, /= \[int\]\s*\n\s*\$/)

  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-firewall-cleanup-"))
  const probePath = join(probeRoot, "firewall-cleanup-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    normalizedHost.slice(stateStart, stateEnd + 2),
    normalizedHost.slice(queryStart, queryEnd + 2),
    normalizedHost.slice(sortStart, sortEnd + 2),
    normalizedHost.slice(contractStart, contractEnd + 2),
    normalizedHost.slice(profileStart, profileEnd + 2),
    '$FirewallRuleName = "rule"',
    '$FirewallRuleDisplayName = "display"',
    '$FirewallRuleGroup = "group"',
    '$FirewallRuleDescription = "description"',
    "$DbPort = 54321",
    '$FirewallRemoteAddresses = @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")',
    "$CliBaselineCaptured = $true",
    "$InventoryParameters = @{}",
    "function Set-PassingProof {",
    "  param([object]$State)",
    "  $State.SameEngineVerified = $true",
    "  $State.OwnershipAmbiguityCount = 0",
    "  $State.OwnedResourceCleanupCompleted = $true",
    "  $State.FinalOwnershipAmbiguityCount = 0",
    "  $State.HostListenerCount = 0",
    "  $State.FinalContainerCount = 0",
    "  $State.FinalVolumeCount = 0",
    "  $State.FinalNetworkCount = 0",
    "}",
    "function New-ExactRule {",
    "  param([string]$Marker)",
    '  return [pscustomobject]@{ Name = "rule"; DisplayName = "display"; Group = "group"; Description = "description"; InstanceID = "instance"; Direction = "Inbound"; Action = "Block"; Enabled = "True"; Profile = "Any"; PolicyStoreSourceType = "Local"; PolicyStoreSource = "PersistentStore"; Marker = $Marker }',
    "}",
    "function Get-NetFirewallRule {",
    "  [CmdletBinding()] param([string]$PolicyStore)",
    '  if ($PolicyStore -ceq "PersistentStore") {',
    "    if ($script:Removed) { return @() }",
    "    $null = $script:PersistentCallCount++",
    '    if ($script:Scenario -in @("partial-no-residue", "created-missing")) { return @() }',
    "    if ($script:PersistentCallCount -eq 1) { return $script:PersistentInitial }",
    "    return $script:PersistentFresh",
    "  }",
    '  if ($PolicyStore -ceq "ActiveStore") {',
    "    if ($script:Removed) { return @() }",
    '    if ($script:Scenario -in @("partial-no-residue", "active-mismatch")) { return @() }',
    "    return $script:ActiveRule",
    "  }",
    '  throw "unexpected policy store"',
    "}",
    "function Get-NetFirewallPortFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  $Port = if ($script:Scenario -ceq "persistent-filter-drift" -and [object]::ReferenceEquals($AssociatedNetFirewallRule, $script:PersistentFresh)) { "54322" } else { "54321" }',
    '  return [pscustomobject]@{ Protocol = "TCP"; LocalPort = $Port; RemotePort = "Any" }',
    "}",
    "function Get-NetFirewallAddressFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  return [pscustomobject]@{ LocalAddress = "Any"; RemoteAddress = @($FirewallRemoteAddresses) }',
    "}",
    "function Get-NetFirewallApplicationFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  return [pscustomobject]@{ Program = "Any" }',
    "}",
    "function Get-NetFirewallServiceFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  return [pscustomobject]@{ Service = "Any" }',
    "}",
    "function Get-NetFirewallInterfaceFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  return [pscustomobject]@{ InterfaceAlias = "Any" }',
    "}",
    "function Get-NetFirewallInterfaceTypeFilter {",
    "  [CmdletBinding()] param([object]$AssociatedNetFirewallRule)",
    '  return [pscustomobject]@{ InterfaceType = "Any" }',
    "}",
    "function Get-NetFirewallProfile {",
    "  [CmdletBinding()] param([string]$PolicyStore)",
    '  if ($PolicyStore -cne "ActiveStore") { throw "wrong profile store" }',
    '  if ($script:Scenario -ceq "profile-mismatch") { return @([pscustomobject]@{ Name = "Domain"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "False" }, [pscustomobject]@{ Name = "Public"; Enabled = "True" }) }',
    '  return @([pscustomobject]@{ Name = "Domain"; Enabled = "True" }, [pscustomobject]@{ Name = "Private"; Enabled = "True" }, [pscustomobject]@{ Name = "Public"; Enabled = "True" })',
    "}",
    "function Get-SealedRuntimeInventory {",
    "  $null = $script:InventoryCallCount++",
    "  return [pscustomobject]@{ Containers = @(); Volumes = @(); Networks = @(); AmbiguousOwnership = @() }",
    "}",
    "function Assert-DockerEngineIdentity {",
    "  $null = $script:EngineCallCount++",
    "  return $true",
    "}",
    "function Get-HostListenersOnPort {",
    "  param([int]$LocalPort)",
    "  $null = $script:ListenerCallCount++",
    "  return @()",
    "}",
    "function Remove-NetFirewallRule {",
    "  [CmdletBinding()] param([object]$InputObject)",
    "  if (-not [object]::ReferenceEquals($InputObject, $script:PersistentFresh)) {",
    '    throw "cleanup did not use the freshly revalidated PersistentStore InputObject"',
    "  }",
    "  if (-not $CleanupState.RuntimeProof.Proven -or",
    "      $script:InventoryCallCount -ne 1 -or",
    "      $script:EngineCallCount -ne 1 -or",
    "      $script:ListenerCallCount -ne 2 -or",
    "      $script:PersistentCallCount -ne 2) {",
    '    throw "cleanup removed before all fresh release proofs completed"',
    "  }",
    "  $null = $script:RemoveCount++",
    "  $script:Removed = $true",
    "}",
    "function Write-HostEvidence {",
    "  param([string]$Name, [object[]]$Value)",
    '  if ($Name -ceq "firewall-retained.txt") {',
    "    $null = $script:EvidenceCount++",
    "    $script:RetainedEvidenceValues = @($Value)",
    "    return",
    "  }",
    '  if ($Name -ceq "cleanup-failure.txt") {',
    "    $null = $script:CleanupFailureEvidenceCount++",
    "    $script:CleanupFailureEvidenceValues = @($Value)",
    "    return",
    "  }",
    '  throw "unexpected evidence name: $Name"',
    "}",
    "function Reset-Scenario {",
    "  param([string]$Name)",
    "  $script:Scenario = $Name",
    "  $script:PersistentCallCount = 0",
    "  $script:InventoryCallCount = 0",
    "  $script:EngineCallCount = 0",
    "  $script:ListenerCallCount = 0",
    "  $script:RemoveCount = 0",
    "  $script:EvidenceCount = 0",
    "  $script:CleanupFailureEvidenceCount = 0",
    "  $script:RetainedEvidenceValues = @()",
    "  $script:CleanupFailureEvidenceValues = @()",
    "  $script:AfterStepCount = 0",
    "  $script:SecondStepCount = 0",
    "  $script:LastStepCount = 0",
    "  $script:Removed = $false",
    "  $script:CaughtMessage = $null",
    '  $script:PersistentInitial = New-ExactRule "initial"',
    '  $script:PersistentFresh = New-ExactRule "fresh"',
    '  $script:ActiveRule = New-ExactRule "active"',
    '  if ($Name -ceq "persistent-identity-drift") { $script:PersistentFresh.Description = "drifted" }',
    "  $Proof = New-RuntimeCleanupProofState",
    "  $null = Set-PassingProof $Proof",
    "  $null = Complete-RuntimeCleanupProof $Proof",
    "  $Created = $true",
    '  $InstanceId = "instance"',
    '  if ($Name -in @("partial-identity", "partial-no-residue")) { $Created = $false; $InstanceId = $null }',
    "  $script:CleanupState = [pscustomobject]@{",
    "    RuntimeProof = $Proof",
    "    FirewallRuleOwnershipEstablished = $true",
    "    FirewallRuleCreated = $Created",
    "    FirewallRuleInstanceId = $InstanceId",
    "  }",
    "}",
    "$FirewallCleanupAction = {",
    normalizedHost.slice(actionBodyStart, actionEnd),
    "}",
    "$OuterCleanupDecision = {",
    normalizedHost.slice(cleanupLoopStart, cleanupLoopEnd),
    normalizedHost.slice(cleanupDecisionStart, cleanupDecisionEnd),
    "}",
    "function Test-ExceptionPreserved {",
    "  param([Exception]$Actual, [Exception]$Expected)",
    "  return [object]::ReferenceEquals($Actual, $Expected) -or",
    "    ($null -ne $Actual.InnerException -and",
    "      [object]::ReferenceEquals($Actual.InnerException, $Expected))",
    "}",
    "function Get-CaughtAggregateException {",
    "  param([Exception]$Failure)",
    "  if ($Failure -is [AggregateException]) { return $Failure }",
    "  if ($Failure.InnerException -is [AggregateException]) { return $Failure.InnerException }",
    '  throw "caller did not receive an AggregateException"',
    "}",
    "function Invoke-OuterCleanup {",
    "  param([Exception]$Main = $null, [Exception]$AdditionalCleanupFailure = $null)",
    "  $script:MainFailure = $Main",
    "  $script:CleanupFailures = [Collections.Generic.List[string]]::new()",
    "  $script:CleanupExceptions = [Collections.Generic.List[Exception]]::new()",
    "  $script:AdditionalCleanupFailure = $AdditionalCleanupFailure",
    "  $Steps = [Collections.Generic.List[object]]::new()",
    '  $Steps.Add([pscustomobject]@{ Name = "temporary-firewall-rule"; Action = $FirewallCleanupAction })',
    '  $Steps.Add([pscustomobject]@{ Name = "after-firewall"; Action = { $null = $script:AfterStepCount++ } })',
    "  if ($null -ne $AdditionalCleanupFailure) {",
    '    $Steps.Add([pscustomobject]@{ Name = "second-failure"; Action = { $null = $script:SecondStepCount++; throw $script:AdditionalCleanupFailure } })',
    "  }",
    '  $Steps.Add([pscustomobject]@{ Name = "last-step"; Action = { $null = $script:LastStepCount++ } })',
    "  $script:CleanupSteps = @($Steps.ToArray())",
    "  $CallerFailure = $null",
    "  try {",
    "    $null = & $OuterCleanupDecision",
    "  } catch {",
    "    $CallerFailure = $_.Exception",
    "  }",
    '  if ($null -eq $CallerFailure) { throw "outer cleanup decision did not fail" }',
    "  return ,$CallerFailure",
    "}",
    "function Invoke-CleanupHarness {",
    "  try {",
    "    $null = & $FirewallCleanupAction",
    "  } catch {",
    "    $Failure = $_.Exception",
    "    if ($CleanupState.FirewallRuleOwnershipEstablished) {",
    '      Write-HostEvidence "firewall-retained.txt" @($Failure.Message)',
    "    }",
    "    $script:CaughtMessage = $Failure.Message",
    "  }",
    "}",
    "foreach ($ProjectionCase in @(",
    '    [pscustomobject]@{ Name = "profile-mismatch"; Message = "All three active Windows Firewall profiles must be enabled" },',
    '    [pscustomobject]@{ Name = "active-mismatch"; Message = "Owned temporary firewall rule is not active during cleanup" }',
    "  )) {",
    "  $null = Reset-Scenario $ProjectionCase.Name",
    "  $null = Invoke-CleanupHarness",
    "  if ($script:CaughtMessage -cne $ProjectionCase.Message -or",
    "      $script:RemoveCount -ne 1 -or",
    "      $script:EvidenceCount -ne 0 -or",
    "      $CleanupState.FirewallRuleOwnershipEstablished -or",
    "      $CleanupState.FirewallRuleCreated) {",
    '    throw ("projection/profile mismatch did not remove, clear, and rethrow exactly: {0}; caught={1}; remove={2}; evidence={3}; ownership={4}; created={5}; persistent_calls={6}; listeners={7}; inventory={8}; engine={9}; ambiguity={10}; final_ambiguity={11}; containers={12}; volumes={13}; networks={14}" -f $ProjectionCase.Name, $script:CaughtMessage, $script:RemoveCount, $script:EvidenceCount, $CleanupState.FirewallRuleOwnershipEstablished, $CleanupState.FirewallRuleCreated, $script:PersistentCallCount, $script:ListenerCallCount, $script:InventoryCallCount, $script:EngineCallCount, $CleanupState.RuntimeProof.OwnershipAmbiguityCount, $CleanupState.RuntimeProof.FinalOwnershipAmbiguityCount, $CleanupState.RuntimeProof.FinalContainerCount, $CleanupState.RuntimeProof.FinalVolumeCount, $CleanupState.RuntimeProof.FinalNetworkCount)',
    "  }",
    "}",
    'foreach ($RetainCase in @("persistent-identity-drift", "persistent-filter-drift", "partial-identity", "created-missing")) {',
    "  $null = Reset-Scenario $RetainCase",
    "  $null = Invoke-CleanupHarness",
    "  if ([string]::IsNullOrWhiteSpace($script:CaughtMessage) -or",
    "      $script:RemoveCount -ne 0 -or",
    "      $script:EvidenceCount -ne 1 -or",
    "      -not $CleanupState.FirewallRuleOwnershipEstablished) {",
    '    throw "unsafe cleanup branch failed to retain exact ownership evidence: $RetainCase"',
    "  }",
    "}",
    '$null = Reset-Scenario "partial-no-residue"',
    "$null = Invoke-CleanupHarness",
    "if ($null -ne $script:CaughtMessage -or",
    "    $script:RemoveCount -ne 0 -or",
    "    $script:EvidenceCount -ne 0 -or",
    "    $CleanupState.FirewallRuleOwnershipEstablished) {",
    '  throw "verified no-residue partial creation was not cleared without deletion"',
    "}",
    '$null = Reset-Scenario "profile-mismatch"',
    "$SingleProjectionFailure = Invoke-OuterCleanup",
    "if ($CleanupExceptions.Count -ne 1 -or",
    "    -not (Test-ExceptionPreserved $SingleProjectionFailure $CleanupExceptions[0]) -or",
    '    $SingleProjectionFailure.Message -cne "All three active Windows Firewall profiles must be enabled" -or',
    "    $script:RemoveCount -ne 1 -or",
    "    $script:EvidenceCount -ne 0 -or",
    "    $script:CleanupFailureEvidenceCount -ne 1 -or",
    "    $script:AfterStepCount -ne 1 -or",
    "    $script:LastStepCount -ne 1 -or",
    "    $CleanupState.FirewallRuleOwnershipEstablished) {",
    '  throw "single projection cleanup failure was not preserved through the exact outer decision"',
    "}",
    '$null = Reset-Scenario "persistent-identity-drift"',
    "$SingleRetainedFailure = Invoke-OuterCleanup",
    "if ($CleanupExceptions.Count -ne 1 -or",
    "    -not (Test-ExceptionPreserved $SingleRetainedFailure $CleanupExceptions[0]) -or",
    "    $script:RemoveCount -ne 0 -or",
    "    $script:EvidenceCount -ne 1 -or",
    "    $script:CleanupFailureEvidenceCount -ne 1 -or",
    "    $script:AfterStepCount -ne 1 -or",
    "    $script:LastStepCount -ne 1 -or",
    "    -not $CleanupState.FirewallRuleOwnershipEstablished) {",
    '  throw "single unsafe cleanup failure was not retained through the exact outer decision"',
    "}",
    '$RetainedEvidenceText = $script:RetainedEvidenceValues -join "`n"',
    "foreach ($ExpectedEvidence in @(",
    '    "tag_write_pause_sealed_firewall_retained", "name=rule",',
    '    "instance_id=instance", "creation_returned_success=True",',
    '    "runtime_cleanup_proven=False", "local_port=54321",',
    '    "automatic_name_based_removal=forbidden",',
    '    "partial_create_without_recorded_instance=manual_review_only"',
    "  )) {",
    "  if ($ExpectedEvidence -cnotin $script:RetainedEvidenceValues) {",
    '    throw "retained evidence omitted an exact field: $ExpectedEvidence"',
    "  }",
    "}",
    'if ($RetainedEvidenceText -notmatch "reason=Temporary firewall rule identity or policy contract failed" -or',
    '    $RetainedEvidenceText -notmatch "removal_requires=separate authorization; recorded engine identity; zero scoped resources; zero host listeners; full PersistentStore identity and filters; exact InputObject removal; PersistentStore and ActiveStore zero residue") {',
    '  throw "retained evidence omitted the exact failure or recovery contract"',
    "}",
    '$null = Reset-Scenario "active-mismatch"',
    '$MainException = [InvalidOperationException]::new("synthetic main failure")',
    "$MainAndCleanupFailure = Invoke-OuterCleanup -Main $MainException",
    "$MainAggregate = Get-CaughtAggregateException $MainAndCleanupFailure",
    "if ($MainAggregate.InnerExceptions.Count -ne 2 -or",
    "    -not [object]::ReferenceEquals($MainAggregate.InnerExceptions[0], $MainException) -or",
    "    -not [object]::ReferenceEquals($MainAggregate.InnerExceptions[1], $CleanupExceptions[0]) -or",
    "    $script:AfterStepCount -ne 1 -or",
    "    $script:LastStepCount -ne 1 -or",
    "    $script:EvidenceCount -ne 0 -or",
    "    $script:CleanupFailureEvidenceCount -ne 1) {",
    '  throw "main plus cleanup failures were not aggregated in deterministic order"',
    "}",
    '$null = Reset-Scenario "persistent-filter-drift"',
    '$SecondCleanupException = [ApplicationException]::new("synthetic second cleanup failure")',
    "$MultipleCleanupFailure = Invoke-OuterCleanup -AdditionalCleanupFailure $SecondCleanupException",
    "$CleanupAggregate = Get-CaughtAggregateException $MultipleCleanupFailure",
    "if ($CleanupAggregate.InnerExceptions.Count -ne 2 -or",
    "    -not [object]::ReferenceEquals($CleanupAggregate.InnerExceptions[0], $CleanupExceptions[0]) -or",
    "    -not [object]::ReferenceEquals($CleanupAggregate.InnerExceptions[1], $SecondCleanupException) -or",
    "    $CleanupExceptions.Count -ne 2 -or",
    "    $script:AfterStepCount -ne 1 -or",
    "    $script:SecondStepCount -ne 1 -or",
    "    $script:LastStepCount -ne 1 -or",
    "    $script:EvidenceCount -ne 1 -or",
    "    $script:CleanupFailureEvidenceCount -ne 1 -or",
    "    $script:CleanupFailureEvidenceValues.Count -ne 2) {",
    '  throw "multiple cleanup failures were not aggregated in step order after all steps ran"',
    "}",
    'Write-Output "firewall_cleanup_decision_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /firewall_cleanup_decision_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }

  const retainedEvidenceStart = normalizedHost.indexOf('Write-HostEvidence "firewall-retained.txt"')
  const retainedEvidenceEnd = normalizedHost.indexOf("$CleanupFailures.Add", retainedEvidenceStart)
  assert.ok(retainedEvidenceStart >= 0 && retainedEvidenceEnd > retainedEvidenceStart)
  const retainedEvidence = normalizedHost.slice(retainedEvidenceStart, retainedEvidenceEnd)
  for (const exactField of [
    '"tag_write_pause_sealed_firewall_retained"',
    '"name=$FirewallRuleName"',
    '"instance_id=$RecordedInstanceId"',
    '"creation_returned_success=$($CleanupState.FirewallRuleCreated)"',
    '"runtime_cleanup_proven=$($CleanupState.RuntimeProof.Proven)"',
    '"local_port=$DbPort"',
    '"reason=$($CleanupStepFailure.Message)"',
    '"automatic_name_based_removal=forbidden"',
    '"partial_create_without_recorded_instance=manual_review_only"',
    '"removal_requires=separate authorization;',
    "recorded engine identity",
    "zero scoped resources",
    "zero host listeners",
    "full PersistentStore identity and filters",
    "exact InputObject removal",
    "PersistentStore and ActiveStore zero residue",
  ]) {
    assert.ok(
      retainedEvidence.includes(exactField),
      `missing retained evidence field: ${exactField}`,
    )
  }

  assert.match(runbook, /ActiveStore projection or global-profile mismatch alone/)
  assert.match(
    runbook,
    /ownership, runtime, listener, engine, or PersistentStore proof is incomplete/,
  )
  assert.match(runbook, /rethrows the original projection\/profile error/)
  assert.match(handoff, /incomplete ownership\/runtime\/PersistentStore proof retains the rule/)
  assert.match(
    handoff,
    /ActiveStore projection or global-profile drift alone is recorded and rethrown only after the fully proven exact persistent object is removed and both stores are zero/,
  )
  assert.match(handoff, /never use a name-only removal/)
  assert.match(handoff, /exact InputObject removal, and both-store zero/)
  assert.match(handoff, /unrecorded partial creation is manual-review-only/)
})

test("sealed runtime inventory never owns baseline objects and blocks every late rogue delta", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const helperStart = normalizedHost.indexOf("function Get-DockerPropertyState")
  const helperEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Assert-DockerEngineIdentity",
    helperStart,
  )
  const inventoryStart = normalizedHost.indexOf("function Get-SealedRuntimeInventory")
  const inventoryEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Get-FreeLoopbackPort",
    inventoryStart,
  )
  assert.ok(helperStart >= 0 && helperEnd > helperStart)
  assert.ok(inventoryStart >= 0 && inventoryEnd > inventoryStart)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-runtime-inventory-"))
  const probePath = join(probeRoot, "runtime-inventory-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    normalizedHost.slice(helperStart, helperEnd + 2),
    normalizedHost.slice(inventoryStart, inventoryEnd + 2),
    "$script:ContainerIds = @()",
    "$script:VolumeNames = @()",
    "$script:NetworkIds = @()",
    "$script:Inspects = @{}",
    "function Invoke-Docker {",
    "  param([string[]]$Arguments, [int]$TimeoutSeconds = 120)",
    '  if ($Arguments[0] -ceq "ps") { return [pscustomobject]@{ Output = @($script:ContainerIds) } }',
    '  if ($Arguments[0] -ceq "volume") { return [pscustomobject]@{ Output = @($script:VolumeNames) } }',
    '  if ($Arguments[0] -ceq "network") { return [pscustomobject]@{ Output = @($script:NetworkIds) } }',
    '  throw "unexpected synthetic docker command"',
    "}",
    "function Get-DockerInspect {",
    "  param([string]$ObjectType, [string]$ObjectId)",
    '  $Key = "$ObjectType|$ObjectId"',
    '  if (-not $script:Inspects.ContainsKey($Key)) { throw "baseline object was inspected or fixture is missing: $Key" }',
    "  return $script:Inspects[$Key]",
    "}",
    "function Reset-Snapshot {",
    "  $script:ContainerIds = @()",
    "  $script:VolumeNames = @()",
    "  $script:NetworkIds = @()",
    "  $script:Inspects = @{}",
    "}",
    "function Invoke-Inventory {",
    "  param([bool]$IncludeDelta, [string[]]$BaselineContainers = @(), [string[]]$BaselineVolumes = @(), [string[]]$BaselineNetworks = @())",
    "  return Get-SealedRuntimeInventory -AllowedContainerNames @('expected-container') -AllowedVolumeNames @('expected-volume') -AllowedNetworkNames @('expected-network') -BaselineContainerIds $BaselineContainers -BaselineVolumeNames $BaselineVolumes -BaselineNetworkIds $BaselineNetworks -IncludePostBaselineDelta $IncludeDelta -ProjectId 'project' -Nonce 'nonce'",
    "}",
    "function Set-SingleFixture {",
    "  param([string]$Kind, [string]$Name, [object]$Labels)",
    "  $null = Reset-Snapshot",
    '  if ($Kind -ceq "container") {',
    "    $Id = [string]::new('1', 64)",
    "    $script:ContainerIds = @($Id)",
    '    $script:Inspects["container|$Id"] = [pscustomobject]@{ Name = "/$Name"; Config = [pscustomobject]@{ Labels = $Labels } }',
    "    return",
    "  }",
    '  if ($Kind -ceq "volume") {',
    "    $script:VolumeNames = @($Name)",
    '    $script:Inspects["volume|$Name"] = [pscustomobject]@{ Name = $Name; Labels = $Labels }',
    "    return",
    "  }",
    '  if ($Kind -ceq "network") {',
    "    $Id = [string]::new('2', 64)",
    "    $script:NetworkIds = @($Id)",
    '    $script:Inspects["network|$Id"] = [pscustomobject]@{ Name = $Name; Labels = $Labels }',
    "    return",
    "  }",
    '  throw "unknown fixture kind"',
    "}",
    "function Get-OwnedKindCount {",
    "  param([object]$Inventory, [string]$Kind)",
    '  if ($Kind -ceq "container") { return [int]$Inventory.Containers.Count }',
    '  if ($Kind -ceq "volume") { return [int]$Inventory.Volumes.Count }',
    '  if ($Kind -ceq "network") { return [int]$Inventory.Networks.Count }',
    '  throw "unknown inventory kind"',
    "}",
    "$BaselineContainer = [string]::new('a', 64)",
    "$BaselineNetwork = [string]::new('b', 64)",
    "$null = Reset-Snapshot",
    "$EmptyResult = Invoke-Inventory $true",
    'if ($EmptyResult.Containers.Count -ne 0 -or $EmptyResult.Volumes.Count -ne 0 -or $EmptyResult.Networks.Count -ne 0 -or $EmptyResult.AmbiguousOwnership.Count -ne 0) { throw "empty inventory was not exact zero" }',
    "$EmptyProof = New-RuntimeCleanupProofState",
    "$EmptyProof.SameEngineVerified = $true",
    "$EmptyProof.OwnershipAmbiguityCount = 0",
    "$EmptyProof.OwnedResourceCleanupCompleted = $true",
    "$EmptyProof.FinalOwnershipAmbiguityCount = 0",
    "$EmptyProof.HostListenerCount = 0",
    "$EmptyProof.FinalContainerCount = 0",
    "$EmptyProof.FinalVolumeCount = 0",
    "$EmptyProof.FinalNetworkCount = 0",
    "$null = Complete-RuntimeCleanupProof $EmptyProof",
    'if (-not $EmptyProof.Proven) { throw "empty inventory did not complete proof" }',
    "$script:ContainerIds = @($BaselineContainer)",
    "$script:VolumeNames = @('expected-volume')",
    "$script:NetworkIds = @($BaselineNetwork)",
    "$BaselineResult = Invoke-Inventory $true @($BaselineContainer) @('expected-volume') @($BaselineNetwork)",
    'if ($BaselineResult.Containers.Count -ne 0 -or $BaselineResult.Volumes.Count -ne 0 -or $BaselineResult.Networks.Count -ne 0 -or $BaselineResult.AmbiguousOwnership.Count -ne 0) { throw "baseline members were classified" }',
    "$null = Reset-Snapshot",
    "$UnrelatedContainer = [string]::new('c', 64)",
    "$script:ContainerIds = @($UnrelatedContainer)",
    "$script:Inspects[\"container|$UnrelatedContainer\"] = [pscustomobject]@{ Name = '/unrelated'; Config = [pscustomobject]@{ Labels = $null } }",
    "$PreBaselineUnrelated = Invoke-Inventory $false",
    'if ($PreBaselineUnrelated.Containers.Count -ne 0 -or $PreBaselineUnrelated.AmbiguousOwnership.Count -ne 0) { throw "prebaseline unrelated resource was scoped" }',
    "$null = Reset-Snapshot",
    "$ScopedContainer = [string]::new('d', 64)",
    "$ExactLabels = [pscustomobject]@{ 'wouldkeep.sealed' = 'nonce' }",
    "$script:ContainerIds = @($ScopedContainer)",
    "$script:Inspects[\"container|$ScopedContainer\"] = [pscustomobject]@{ Name = '/expected-container'; Config = [pscustomobject]@{ Labels = $ExactLabels } }",
    "$PreBaselineScoped = Invoke-Inventory $false",
    'if ($PreBaselineScoped.Containers.Count -ne 0 -or $PreBaselineScoped.AmbiguousOwnership.Count -ne 1) { throw "prebaseline scoped resource was not retained as ambiguity" }',
    "$PostBaselineOwned = Invoke-Inventory $true",
    'if ($PostBaselineOwned.Containers.Count -ne 1 -or $PostBaselineOwned.AmbiguousOwnership.Count -ne 0) { throw "postbaseline exact resource was not owned" }',
    "$ExactLabels = [pscustomobject]@{ 'wouldkeep.sealed' = 'nonce' }",
    "$ConflictingLabels = [pscustomobject]@{ 'com.supabase.cli.project' = 'project'; 'wouldkeep.sealed' = 'other-nonce' }",
    "$CaseVariantLabels = [pscustomobject]@{ 'wouldkeep.sealed' = 'Nonce' }",
    "foreach ($Kind in @('container', 'volume', 'network')) {",
    '  $ExpectedName = "expected-$Kind"',
    '  $WrongName = "unrelated-$Kind"',
    "  $null = Set-SingleFixture $Kind $ExpectedName $ExactLabels",
    "  $Owned = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $Owned $Kind) -ne 1 -or $Owned.AmbiguousOwnership.Count -ne 0) { throw "exact postbaseline fixture was not owned: $Kind" }',
    "  $ScopedBeforeBaseline = Invoke-Inventory $false",
    '  if ((Get-OwnedKindCount $ScopedBeforeBaseline $Kind) -ne 0 -or $ScopedBeforeBaseline.AmbiguousOwnership.Count -ne 1) { throw "prebaseline scoped fixture was not ambiguous: $Kind" }',
    "  $null = Set-SingleFixture $Kind $WrongName $null",
    "  $UnrelatedBeforeBaseline = Invoke-Inventory $false",
    '  if ((Get-OwnedKindCount $UnrelatedBeforeBaseline $Kind) -ne 0 -or $UnrelatedBeforeBaseline.AmbiguousOwnership.Count -ne 0) { throw "prebaseline unrelated fixture was scoped: $Kind" }',
    "  $null = Set-SingleFixture $Kind $ExpectedName $null",
    "  $NameOnly = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $NameOnly $Kind) -ne 0 -or $NameOnly.AmbiguousOwnership.Count -ne 1) { throw "exact-name/no-label fixture was not ambiguous: $Kind" }',
    "  $null = Set-SingleFixture $Kind $WrongName $ExactLabels",
    "  $LabelOnly = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $LabelOnly $Kind) -ne 0 -or $LabelOnly.AmbiguousOwnership.Count -ne 1) { throw "exact-label/wrong-name fixture was not ambiguous: $Kind" }',
    "  $null = Set-SingleFixture $Kind $ExpectedName $ConflictingLabels",
    "  $Conflicting = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $Conflicting $Kind) -ne 0 -or $Conflicting.AmbiguousOwnership.Count -ne 1) { throw "conflicting-label fixture was not ambiguous: $Kind" }',
    '  $null = Set-SingleFixture $Kind ("Expected-" + $Kind.Substring(0, 1).ToUpperInvariant() + $Kind.Substring(1)) $ExactLabels',
    "  $CaseVariantName = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $CaseVariantName $Kind) -ne 0 -or $CaseVariantName.AmbiguousOwnership.Count -ne 1) { throw "case-variant name fixture was not ambiguous: $Kind" }',
    "  $null = Set-SingleFixture $Kind $ExpectedName $CaseVariantLabels",
    "  $CaseVariantLabel = Invoke-Inventory $true",
    '  if ((Get-OwnedKindCount $CaseVariantLabel $Kind) -ne 0 -or $CaseVariantLabel.AmbiguousOwnership.Count -ne 1) { throw "case-variant label fixture was not ambiguous: $Kind" }',
    "}",
    "$null = Reset-Snapshot",
    "$RogueContainer = [string]::new('e', 64)",
    "$RogueNetwork = [string]::new('f', 64)",
    "$script:ContainerIds = @($RogueContainer)",
    "$script:VolumeNames = @('rogue-volume')",
    "$script:NetworkIds = @($RogueNetwork)",
    "$script:Inspects[\"container|$RogueContainer\"] = [pscustomobject]@{ Name = '/rogue-container'; Config = [pscustomobject]@{ Labels = $null } }",
    "$script:Inspects['volume|rogue-volume'] = [pscustomobject]@{ Name = 'rogue-volume'; Labels = $null }",
    "$script:Inspects[\"network|$RogueNetwork\"] = [pscustomobject]@{ Name = 'rogue-network'; Labels = $null }",
    "$RogueResult = Invoke-Inventory $true",
    'if ($RogueResult.Containers.Count -ne 0 -or $RogueResult.Volumes.Count -ne 0 -or $RogueResult.Networks.Count -ne 0 -or $RogueResult.AmbiguousOwnership.Count -ne 3) { throw "late rogue deltas did not block" }',
    "$Proof = New-RuntimeCleanupProofState",
    "$Proof.SameEngineVerified = $true",
    "$Proof.OwnershipAmbiguityCount = $RogueResult.AmbiguousOwnership.Count",
    "$Proof.OwnedResourceCleanupCompleted = $true",
    "$Proof.FinalOwnershipAmbiguityCount = $RogueResult.AmbiguousOwnership.Count",
    "$Proof.HostListenerCount = 0",
    "$Proof.FinalContainerCount = $RogueResult.Containers.Count",
    "$Proof.FinalVolumeCount = $RogueResult.Volumes.Count",
    "$Proof.FinalNetworkCount = $RogueResult.Networks.Count",
    "$DidThrow = $false",
    "try { $null = Complete-RuntimeCleanupProof $Proof } catch { $DidThrow = $true }",
    'if (-not $DidThrow -or $Proof.Proven) { throw "rogue inventory completed cleanup proof" }',
    'Write-Output "runtime_inventory_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /runtime_inventory_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }

  const inventory = normalizedHost.slice(inventoryStart, inventoryEnd)
  assert.match(inventory, /\$ContainerId -cin \$BaselineContainerIds[\s\S]*continue/)
  assert.match(inventory, /\$VolumeName -cin \$BaselineVolumeNames[\s\S]*continue/)
  assert.match(inventory, /\$NetworkId -cin \$BaselineNetworkIds[\s\S]*continue/)
  assert.equal((inventory.match(/if \(-not \$IncludePostBaselineDelta\)/g) ?? []).length, 3)
})

test("sealed bootstrap deterministically renders pure SQL roles and preserves the exact 19-version ledger", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  assert.equal((sealedRoles.match(/^\s*\\set\s+ON_ERROR_STOP\s+on\s*$/gm) ?? []).length, 1)
  assert.equal((sealedRoles.match(/^\s*\\ir\s+schema\.sql\s*$/gm) ?? []).length, 1)
  assert.equal((sealedRoles.match(/^\s*\\/gm) ?? []).length, 2)
  assert.match(normalizedHost, /function Get-RenderedBootstrapRolesArtifact/)
  assert.match(normalizedHost, /psql_meta_commands=0/)
  assert.match(normalizedHost, /ledger_mutations=0/)
  assert.doesNotMatch(
    normalizedHost,
    /Copy-Item[\s\S]{0,160}supabase\/schema\.sql[\s\S]{0,160}BootstrapSupabase/,
  )
  assert.match(normalizedHost, /\$ExpectedBootstrapFiles = @\("config\.toml", "roles\.sql"\)/)
  assert.doesNotMatch(
    normalizedHost,
    /(?:INSERT|DELETE|UPDATE)\s+(?:INTO\s+|FROM\s+)?supabase_migrations/i,
  )

  const renderStart = normalizedHost.indexOf("function Get-Utf8NativeTextMetrics")
  const renderEnd = normalizedHost.indexOf("\n}\n\nfunction Start-NativeProcess", renderStart)
  assert.ok(renderStart >= 0 && renderEnd > renderStart)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-roles-render-"))
  const schemaPath = join(probeRoot, "schema.sql")
  const rolesPath = join(probeRoot, "roles-template.sql")
  const renderedPath = join(probeRoot, "rendered.sql")
  const probePath = join(probeRoot, "roles-render-probe.ps1")
  const schemaText = "CREATE TABLE public.synthetic(id bigint);\n"
  const rolesText = [
    "-- reviewed roles template",
    "\\set ON_ERROR_STOP on",
    "\\ir schema.sql",
    "SELECT 'tag_write_pause_sealed_schema_and_owner_fixture_loaded';",
    "INSERT INTO public.synthetic(id) VALUES (1);",
    "",
  ].join("\n")
  const expectedRendered = rolesText
    .replace("\\set ON_ERROR_STOP on\n", "")
    .replace("\\ir schema.sql\n", schemaText)
  writeFileSync(schemaPath, schemaText, "utf8")
  writeFileSync(rolesPath, rolesText, "utf8")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    normalizedHost.slice(renderStart, renderEnd + 2),
    "$Artifact = Get-RenderedBootstrapRolesArtifact $env:WOULDKEEP_SCHEMA $env:WOULDKEEP_ROLES",
    "[IO.File]::WriteAllText($env:WOULDKEEP_RENDERED, $Artifact.Text, [Text.UTF8Encoding]::new($false))",
    '$BadRoles = Join-Path $env:WOULDKEEP_PROBE_ROOT "bad-roles.sql"',
    '[IO.File]::WriteAllText($BadRoles, (Get-Content -LiteralPath $env:WOULDKEEP_ROLES -Raw) + "\\include extra.sql`n", [Text.UTF8Encoding]::new($false))',
    "$Rejected = $false",
    "try { $null = Get-RenderedBootstrapRolesArtifact $env:WOULDKEEP_SCHEMA $BadRoles } catch { $Rejected = $true }",
    'if (-not $Rejected) { throw "an extra roles meta-command was accepted" }',
    '$BadSchema = Join-Path $env:WOULDKEEP_PROBE_ROOT "bad-schema.sql"',
    '[IO.File]::WriteAllText($BadSchema, "\\set bad on`nSELECT 1;`n", [Text.UTF8Encoding]::new($false))',
    "$Rejected = $false",
    "try { $null = Get-RenderedBootstrapRolesArtifact $BadSchema $env:WOULDKEEP_ROLES } catch { $Rejected = $true }",
    'if (-not $Rejected) { throw "a schema meta-command was accepted" }',
    'Write-Output ("roles_render_synthetic_passed|{0}|{1}|{2}" -f $Artifact.SchemaSha256,$Artifact.RolesTemplateSha256,$Artifact.RenderedRolesSha256)',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: {
          ...process.env,
          WOULDKEEP_SCHEMA: schemaPath,
          WOULDKEEP_ROLES: rolesPath,
          WOULDKEEP_RENDERED: renderedPath,
          WOULDKEEP_PROBE_ROOT: probeRoot,
        },
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.equal(readFileSync(renderedPath, "utf8"), expectedRendered)
    const expectedHashes = [schemaText, rolesText, expectedRendered].map((value) =>
      createHash("sha256").update(value, "utf8").digest("hex"),
    )
    assert.match(
      result.stdout,
      new RegExp(`roles_render_synthetic_passed\\|${expectedHashes.join("\\|")}`),
    )
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed CLI aliases match the exact v2.109.1 image references while source digests stay immutable", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  for (const alias of [
    "public.ecr.aws/supabase/postgres:17.6.1.143",
    "public.ecr.aws/supabase/gotrue:v2.192.0",
    "public.ecr.aws/supabase/storage-api:v1.62.5",
    "public.ecr.aws/supabase/realtime:v2.112.6",
  ]) {
    const escapedAlias = alias.replaceAll(".", "\\.").replaceAll("/", "\\/")
    assert.equal((sealedHost.match(new RegExp(`Tag = "${escapedAlias}"`, "g")) ?? []).length, 1)
  }
  assert.match(
    sealedHost,
    /\$SupabaseMutableTag = "public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.143"/,
  )
  assert.equal((sealedHost.match(/Tag = "public\.ecr\.aws\/supabase\//g) ?? []).length, 4)
  assert.match(
    sealedHost,
    /\$SupabasePostgresImage\s*=\s*\r?\n\s*"public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.143@sha256:[a-f0-9]{64}"/,
  )
  assert.equal(
    (sealedHost.match(/Exact = "public\.ecr\.aws\/supabase\/.+@sha256:[a-f0-9]{64}"/g) ?? [])
      .length,
    3,
  )
  assert.match(sealedHost, /A temporary Supabase CLI image alias was not removed/)
  assert.match(sealedHost, /A pre-existing Supabase CLI image alias was not restored/)
  assert.doesNotMatch(normalizedHost, /\$MutableInspect\s*=/)
  const mutableCleanupStart = normalizedHost.indexOf('[pscustomobject]@{ Name = "mutable-tags"')
  const mutableCleanupEnd = normalizedHost.indexOf(
    '[pscustomobject]@{ Name = "working-directory"',
    mutableCleanupStart,
  )
  assert.ok(mutableCleanupStart >= 0 && mutableCleanupEnd > mutableCleanupStart)
  assert.doesNotMatch(
    normalizedHost.slice(mutableCleanupStart, mutableCleanupEnd),
    /RuntimeProof\.Proven/,
  )

  const optionalStart = normalizedHost.indexOf("function Get-OptionalDockerImageId")
  const optionalEnd = normalizedHost.indexOf("\n}\n\nfunction Get-DockerInspect", optionalStart)
  assert.ok(optionalStart >= 0 && optionalEnd > optionalStart)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-optional-image-"))
  const probePath = join(probeRoot, "optional-image-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    "$PinnedCliImages = @([pscustomobject]@{ Tag = 'public.ecr.aws/supabase/postgres:17.6.1.143' })",
    normalizedHost.slice(optionalStart, optionalEnd + 2),
    "$script:Result = $null",
    "$script:StartCount = 0",
    "function Start-DockerProcess { param([string[]]$Arguments) $null = $script:StartCount++; return $Arguments }",
    "function Complete-NativeProcess { param([object]$Running, [int]$TimeoutSeconds) if ($TimeoutSeconds -ne 30) { throw 'timeout changed' }; return $script:Result }",
    "function Set-SyntheticResult {",
    "  param([int]$ExitCode, [bool]$TimedOut, [string[]]$Stdout, [string[]]$Stderr)",
    "  $script:Result = [pscustomobject]@{ ExitCode = $ExitCode; TimedOut = $TimedOut; StandardOutput = @($Stdout); StandardError = @($Stderr) }",
    "}",
    '$Reference = "public.ecr.aws/supabase/postgres:17.6.1.143"',
    '$ImageId = "sha256:" + ("a" * 64)',
    "Set-SyntheticResult 0 $false @($ImageId) @()",
    "$Actual = Get-OptionalDockerImageId $Reference",
    'if ($Actual -cne $ImageId) { throw "an exact image ID was not returned" }',
    'Set-SyntheticResult 1 $false @() @("Error response from daemon: No such image: $Reference")',
    "$Missing = Get-OptionalDockerImageId $Reference",
    'if ($null -ne $Missing) { throw "exact absence did not return null" }',
    "$BadResults = @(",
    "  [pscustomobject]@{ ExitCode = 2; TimedOut = $false; Stdout = @(); Stderr = @('access denied') },",
    "  [pscustomobject]@{ ExitCode = 1; TimedOut = $false; Stdout = @(); Stderr = @('Error response from daemon: No such image: wrong') },",
    "  [pscustomobject]@{ ExitCode = 0; TimedOut = $false; Stdout = @('invalid'); Stderr = @() },",
    "  [pscustomobject]@{ ExitCode = 0; TimedOut = $true; Stdout = @($ImageId); Stderr = @() }",
    ")",
    "foreach ($Bad in $BadResults) {",
    "  Set-SyntheticResult $Bad.ExitCode $Bad.TimedOut $Bad.Stdout $Bad.Stderr",
    "  $Rejected = $false",
    "  try { $null = Get-OptionalDockerImageId $Reference } catch { $Rejected = $true }",
    '  if (-not $Rejected) { throw "an ambiguous image inspection was accepted" }',
    "}",
    "$StartsBeforeUnknown = $script:StartCount",
    "$Rejected = $false",
    "try { $null = Get-OptionalDockerImageId 'unreviewed/image:tag' } catch { $Rejected = $true }",
    'if (-not $Rejected -or $script:StartCount -ne $StartsBeforeUnknown) { throw "an unreviewed alias reached Docker" }',
    'Write-Output "optional_image_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /optional_image_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed native failures preserve bounded split-stream diagnostics without credentials", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const diagnosticStart = normalizedHost.indexOf("function Get-Utf8NativeTextMetrics")
  const diagnosticEnd = normalizedHost.indexOf(
    "\n}\n\nfunction Start-DockerProcess",
    diagnosticStart,
  )
  assert.ok(diagnosticStart >= 0 && diagnosticEnd > diagnosticStart)
  const diagnosticSource = normalizedHost.slice(diagnosticStart, diagnosticEnd + 2)
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-native-diagnostic-"))
  const probePath = join(probeRoot, "native-diagnostic-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    diagnosticSource,
    "$script:NativeResult = $null",
    "$script:EvidenceName = $null",
    "$script:EvidenceLines = @()",
    '$script:EvidenceMode = "capture"',
    "$script:StartCount = 0",
    "function Start-NativeProcess {",
    "  param([string]$FilePath, [string[]]$Arguments, [hashtable]$EnvironmentOverrides = @{}, [string[]]$RemoveEnvironment = @())",
    "  $null = $script:StartCount++",
    '  if ($FilePath -cne "C:\\fixed\\supabase.exe" -or',
    '      ($Arguments -join "|") -cne "db|start|--password|ARG_SECRET" -or',
    '      $EnvironmentOverrides.HOME -cne "isolated" -or',
    '      "TOKEN" -cnotin $RemoveEnvironment) { throw "native arguments changed" }',
    '  return "synthetic-running"',
    "}",
    "function Complete-NativeProcess {",
    "  param([object]$Running, [int]$TimeoutSeconds)",
    '  if ($Running -cne "synthetic-running" -or $TimeoutSeconds -ne 1200) { throw "native completion changed" }',
    "  return $script:NativeResult",
    "}",
    "function Write-HostEvidence {",
    "  param([string]$Name, [object[]]$Value)",
    '  if ($script:EvidenceMode -ceq "throw") { throw "synthetic evidence failure" }',
    "  $script:EvidenceName = $Name",
    "  $script:EvidenceLines = @($Value)",
    "}",
    "function Invoke-CapturedFailure {",
    "  param([string]$Label)",
    "  $Failure = $null",
    "  try {",
    "    $null = Invoke-Native $Label 'C:\\fixed\\supabase.exe' @('db', 'start', '--password', 'ARG_SECRET') 1200 0 @{ HOME = 'isolated'; PATH = 'C:\\fixed'; TEMP = 'C:\\fixed\\tmp'; TMP = 'C:\\fixed\\tmp' } @('TOKEN')",
    "  } catch {",
    "    $Failure = $_.Exception",
    "  }",
    '  if ($null -eq $Failure) { throw "native failure was not propagated" }',
    "  return ,$Failure",
    "}",
    "function New-SyntheticResult {",
    "  param([int]$ExitCode, [bool]$TimedOut, [long]$Duration, [string[]]$StdoutLines, [string[]]$StderrLines)",
    '  $StdoutText = $StdoutLines -join "`n"',
    '  $StderrText = $StderrLines -join "`n"',
    "  $StdoutMetrics = Get-Utf8NativeTextMetrics $StdoutText",
    "  $StderrMetrics = Get-Utf8NativeTextMetrics $StderrText",
    "  return [pscustomobject]@{",
    "    ExitCode = $ExitCode; TimedOut = $TimedOut; DurationMilliseconds = $Duration",
    "    StandardOutput = @($StdoutLines); StandardError = @($StderrLines)",
    "    StandardOutputCharacterCount = $StdoutMetrics.CharacterCount",
    "    StandardOutputUtf8ByteCount = $StdoutMetrics.Utf8ByteCount",
    "    StandardOutputSha256 = $StdoutMetrics.Sha256",
    "    StandardOutputTotalLineCount = $StdoutMetrics.TotalLineCount",
    "    StandardOutputNonemptyLineCount = $StdoutMetrics.NonemptyLineCount",
    "    StandardOutputText = $StdoutText",
    "    StandardErrorCharacterCount = $StderrMetrics.CharacterCount",
    "    StandardErrorUtf8ByteCount = $StderrMetrics.Utf8ByteCount",
    "    StandardErrorSha256 = $StderrMetrics.Sha256",
    "    StandardErrorTotalLineCount = $StderrMetrics.TotalLineCount",
    "    StandardErrorNonemptyLineCount = $StderrMetrics.NonemptyLineCount",
    "    StandardErrorText = $StderrText",
    "    Output = @($StdoutLines) + @($StderrLines)",
    "  }",
    "}",
    '$LongLine = "x" * 400',
    "$Stdout = [Collections.Generic.List[string]]::new()",
    '$null = $Stdout.Add("2.109.1")',
    '$null = $Stdout.Add("DB URL: postgresql://postgres:URI_SECRET@127.0.0.1:5432/postgres")',
    '$null = $Stdout.Add(\'{"access_token":"JSON_TOKEN_SECRET","password":"JSON_PASSWORD_SECRET"}\')',
    '$null = $Stdout.Add("https://example.test/URL_PATH_SECRET?token=QUERY_SECRET#FRAGMENT_SECRET")',
    '$null = $Stdout.Add("Authorization: Bearer BEARER_SECRET")',
    '$null = $Stdout.Add("ghp_GITHUB_SECRET_abcdefghijklmnopqrstuvwxyz")',
    '$null = $Stdout.Add("pull access denied for public.ecr.aws/supabase/postgres:17.6.1.143")',
    '$null = $Stdout.Add("public.ecr.aws/supabase/postgres:17.6.1.143@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8")',
    '$null = $Stdout.Add("`e[31mcolored`e[0m")',
    "$null = $Stdout.Add($LongLine)",
    'foreach ($Index in 1..20) { $null = $Stdout.Add("extra-$Index") }',
    "$Stderr = @(",
    "  'syntax error at or near \"\\\\\" in roles.sql',",
    "  '\\ir schema.sql',",
    "  'anon key | eyJabcdefgh.ijklmnop.qrstuvwx',",
    "  'service_role key: sb_secret_abcdefghijk',",
    "  'timeout'",
    ")",
    "$script:NativeResult = New-SyntheticResult 17 $false 4321 $Stdout.ToArray() $Stderr",
    '$Failure = Invoke-CapturedFailure "supabase-db-start"',
    '$EvidenceText = $script:EvidenceLines -join "`n"',
    'if ($script:EvidenceName -cne "native-failure.txt") { throw "native failure evidence name changed" }',
    "$RequiredPatterns = @(",
    "  '(?m)^call_label=supabase-db-start$',",
    "  '(?m)^exit_code=17$',",
    "  '(?m)^timed_out=False$',",
    "  '(?m)^duration_ms=4321$',",
    "  '(?m)^stdout_total_lines=30$',",
    "  '(?m)^stdout_captured_lines=20$',",
    "  '(?m)^stdout_truncated=True$',",
    "  '(?m)^stderr_total_lines=5$',",
    "  '(?m)^stderr_truncated=False$',",
    "  '(?m)^stdout_sha256=[0-9a-f]{64}$',",
    "  '(?m)^stderr_sha256=[0-9a-f]{64}$',",
    "  '(?m)^stdout\\[00\\]=2\\.109\\.1$',",
    "  '(?m)^stdout\\[01\\]=<redacted-unclassified>$',",
    "  '(?m)^stderr\\[04\\]=timeout$',",
    "  '(?m)^signal_cli_alias_db=True$',",
    "  '(?m)^signal_source_ref_db=True$',",
    "  '(?m)^signal_keyword_pull=True$',",
    "  '(?m)^signal_keyword_access_denied=True$',",
    "  '(?m)^signal_keyword_syntax_error=True$',",
    "  '(?m)^signal_keyword_roles_sql=True$',",
    "  '(?m)^signal_keyword_schema_sql=True$',",
    "  '(?m)^signal_keyword_psql_include=True$'",
    ")",
    "foreach ($Pattern in $RequiredPatterns) {",
    '  if ($EvidenceText -notmatch $Pattern) { throw "native evidence omitted a required field: $Pattern" }',
    "}",
    '$CombinedFailure = $EvidenceText + "`n" + $Failure.Message',
    "foreach ($Secret in @('URI_SECRET', 'JSON_TOKEN_SECRET', 'JSON_PASSWORD_SECRET', 'URL_PATH_SECRET', 'QUERY_SECRET', 'FRAGMENT_SECRET', 'BEARER_SECRET', 'GITHUB_SECRET', 'eyJabcdefgh.ijklmnop.qrstuvwx', 'sb_secret_abcdefghijk', 'ARG_SECRET')) {",
    '  if ($CombinedFailure.Contains($Secret)) { throw "native diagnostic leaked a credential: $Secret" }',
    "}",
    'if ($CombinedFailure -match "`e\\[" -or',
    '    $Failure.Message -notmatch "call_label=supabase-db-start" -or',
    '    $Failure.Message -notmatch "duration_ms=4321" -or',
    '    $Failure.Message -notmatch "diagnostic_evidence=native-failure.txt" -or',
    '    $Failure.Message -match "stdout=|stderr=|ARG_SECRET") {',
    '  throw "native exception summary is unsafe or incomplete"',
    "}",
    "$MaximumDiagnosticLineLength = ($script:EvidenceLines | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum",
    'if ($script:EvidenceLines.Count -gt 100 -or $MaximumDiagnosticLineLength -gt 350) { throw "native diagnostic is not bounded" }',
    "$script:EvidenceMode = 'capture'",
    "$script:EvidenceName = $null",
    "$script:NativeResult = New-SyntheticResult -1 $true 1200456 @() @('timeout')",
    '$TimeoutFailure = Invoke-CapturedFailure "supabase-db-start"',
    'if ($TimeoutFailure.Message -notmatch "timed_out=True" -or $TimeoutFailure.Message -notmatch "duration_ms=1200456" -or $script:EvidenceName -cne "native-failure.txt") { throw "timeout diagnostic is incomplete" }',
    "$script:EvidenceMode = 'throw'",
    "$script:NativeResult = New-SyntheticResult 3 $false 12 @() @('safe error')",
    '$EvidenceFailure = Invoke-CapturedFailure "supabase-db-start"',
    'if ($EvidenceFailure.Message -notmatch "diagnostic_evidence=<unavailable>" -or $EvidenceFailure.Message -match "safe error" -or $null -eq $EvidenceFailure.InnerException -or $EvidenceFailure.InnerException.Message -cne "synthetic evidence failure") { throw "evidence failure replaced or erased native failure metadata" }',
    "$script:EvidenceMode = 'capture'",
    "$script:EvidenceName = $null",
    "$script:NativeResult = New-SyntheticResult 0 $false 9 @('2.109.1') @()",
    "$Success = Invoke-Native 'supabase-version' 'C:\\fixed\\supabase.exe' @('db', 'start', '--password', 'ARG_SECRET') 1200 0 @{ HOME = 'isolated'; PATH = 'C:\\fixed'; TEMP = 'C:\\fixed\\tmp'; TMP = 'C:\\fixed\\tmp' } @('TOKEN')",
    'if ($Success.ExitCode -ne 0 -or $null -ne $script:EvidenceName) { throw "successful native call emitted failure evidence" }',
    "$StartsBeforeInvalidLabel = $script:StartCount",
    "$InvalidLabelRejected = $false",
    "try { $null = Invoke-Native 'bad label' 'C:\\fixed\\supabase.exe' @() 1 } catch { $InvalidLabelRejected = $true }",
    'if (-not $InvalidLabelRejected -or $script:StartCount -ne $StartsBeforeInvalidLabel) { throw "invalid native call label reached process start" }',
    'Write-Output "native_diagnostic_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /native_diagnostic_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }

  assert.match(
    normalizedHost,
    /Invoke-Native "supabase-db-start" \$SupabasePath[\s\S]*?"db", "start", "--workdir", \$BootstrapRoot/,
  )
  assert.match(normalizedHost, /"--agent", "no", "--yes", "--output-format", "text"/)
  assert.match(diagnosticSource, /Write-HostEvidence \$DiagnosticEvidence/)
  assert.doesNotMatch(diagnosticSource, /Write-HostEvidence[^\n]*\$Arguments/)
})

test("sealed native subprocesses clear parent secrets and Docker receives the exact reviewed environment", () => {
  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  assert.match(
    normalizedHost,
    /\$script:NativeProcessReapFailure = \$true[\s\S]*?Timed-out native process could not be reaped/,
  )
  assert.match(
    normalizedHost,
    /Name = "nonce-runtime-reconciliation"[\s\S]*?if \(\$script:NativeProcessReapFailure\)[\s\S]*?unreaped native process prevents runtime cleanup proof/,
  )
  assert.match(
    normalizedHost,
    /Name = "working-directory"[\s\S]*?if \(\$script:NativeProcessReapFailure\)[\s\S]*?working directory is retained/,
  )
  const baseStart = normalizedHost.indexOf("function Get-ReviewedNativeBaseEnvironment")
  const baseEnd = normalizedHost.indexOf("\n}\n\nfunction Get-Utf8NativeTextMetrics", baseStart)
  const startStart = normalizedHost.indexOf("function Start-NativeProcess")
  const startEnd = normalizedHost.indexOf("\n}\n\nfunction Complete-NativeProcess", startStart)
  const completeStart = normalizedHost.indexOf("function Complete-NativeProcess")
  const completeEnd = normalizedHost.indexOf(
    "\n}\n\nfunction ConvertTo-SafeNativeDiagnosticLine",
    completeStart,
  )
  const metricsStart = normalizedHost.indexOf("function Get-Utf8NativeTextMetrics")
  const metricsEnd = normalizedHost.indexOf("\n}\n\nfunction Read-StrictUtf8NoBom", metricsStart)
  const dockerStart = normalizedHost.indexOf("function Start-DockerProcess")
  const dockerEnd = normalizedHost.indexOf("\n}\n\nfunction Invoke-Docker", dockerStart)
  assert.ok(baseStart >= 0 && baseEnd > baseStart)
  assert.ok(startStart >= 0 && startEnd > startStart)
  assert.ok(completeStart >= 0 && completeEnd > completeStart)
  assert.ok(metricsStart >= 0 && metricsEnd > metricsStart)
  assert.ok(dockerStart >= 0 && dockerEnd > dockerStart)

  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-native-environment-"))
  const probePath = join(probeRoot, "native-environment-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    normalizedHost.slice(baseStart, baseEnd + 2),
    normalizedHost.slice(metricsStart, metricsEnd + 2),
    normalizedHost.slice(startStart, startEnd + 2),
    normalizedHost.slice(completeStart, completeEnd + 2),
    "$ProbeRoot = [IO.Path]::GetFullPath($env:WOULDKEEP_PROBE_ROOT)",
    "$ReviewedPath = [IO.Path]::GetFullPath($env:WOULDKEEP_PROBE_PATH)",
    "foreach ($SecretName in @('PGPASSWORD','PGPASSFILE','SUPABASE_UNKNOWN_TOKEN','DATABASE_SHADOW_PASSWORD','AWS_SECRET_ACCESS_KEY','GITHUB_TOKEN','HTTPS_PROXY')) {",
    '  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($SecretName))) { throw "parent synthetic secret is missing: $SecretName" }',
    "}",
    '$CommandPath = Join-Path ([Environment]::GetEnvironmentVariable("SystemRoot")) "System32/cmd.exe"',
    "$Overrides = @{",
    "  PATH = $ReviewedPath; TEMP = $ProbeRoot; TMP = $ProbeRoot",
    "  HOME = $ProbeRoot; USERPROFILE = $ProbeRoot; XDG_CONFIG_HOME = $ProbeRoot",
    "  APPDATA = $ProbeRoot; LOCALAPPDATA = $ProbeRoot; DOCKER_CONFIG = $ProbeRoot",
    "}",
    "$Running = Start-NativeProcess $CommandPath @('/d','/s','/c','set') $Overrides @()",
    "$Result = Complete-NativeProcess $Running 30",
    'if ($Result.TimedOut -or $Result.ExitCode -ne 0) { throw "synthetic child environment process failed" }',
    "$Observed = @{}",
    "foreach ($Line in $Result.StandardOutput) {",
    "  if ($Line -match '^(?<name>[^=]+)=(?<value>.*)$') { $Observed[$Matches.name] = $Matches.value }",
    "}",
    "$Expected = Get-ReviewedNativeBaseEnvironment",
    "foreach ($Entry in $Overrides.GetEnumerator()) { $Expected[$Entry.Key] = $Entry.Value }",
    "if ($Observed.PROMPT -cne '$P$G') { throw \"cmd.exe intrinsic PROMPT changed\" }",
    "$null = $Observed.Remove('PROMPT')",
    "foreach ($Entry in $Observed.GetEnumerator()) {",
    '  if (-not $Expected.ContainsKey($Entry.Key) -or $Expected[$Entry.Key] -cne $Entry.Value) { throw "child received an unreviewed environment value: $($Entry.Key)" }',
    "}",
    "foreach ($Entry in $Expected.GetEnumerator()) {",
    '  if (-not $Observed.ContainsKey($Entry.Key) -or $Observed[$Entry.Key] -cne $Entry.Value) { throw "child omitted a reviewed environment value: $($Entry.Key)" }',
    "}",
    "$ChildText = $Result.StandardOutputText",
    "foreach ($Secret in @('PARENT_PG_PASSWORD_SECRET','PARENT_PGPASSFILE_SECRET','PARENT_SUPABASE_SECRET','PARENT_DATABASE_SECRET','PARENT_AWS_SECRET','PARENT_GITHUB_SECRET','PARENT_PROXY_SECRET')) {",
    '  if ($ChildText.Contains($Secret)) { throw "parent secret reached the child process" }',
    "}",
    normalizedHost.slice(dockerStart, dockerEnd + 2),
    '$script:DockerEndpoint = "npipe:////./pipe/dockerDesktopLinuxEngine"',
    "$script:IsolatedDockerConfig = $ProbeRoot",
    "$ReviewedNativePath = $ReviewedPath",
    "$NativeTemp = $ProbeRoot",
    '$DockerPath = "C:\\fixed\\docker.exe"',
    "function Start-NativeProcess {",
    "  param([string]$FilePath, [string[]]$Arguments, [hashtable]$EnvironmentOverrides = @{}, [string[]]$RemoveEnvironment = @())",
    '  if ($FilePath -cne "C:\\fixed\\docker.exe" -or',
    '      ($Arguments -join "|") -cne "--host=npipe:////./pipe/dockerDesktopLinuxEngine|info" -or',
    "      $EnvironmentOverrides.DOCKER_HOST -cne $script:DockerEndpoint -or",
    "      $EnvironmentOverrides.DOCKER_CONFIG -cne $ProbeRoot -or",
    "      $EnvironmentOverrides.PATH -cne $ReviewedPath -or",
    "      $EnvironmentOverrides.TEMP -cne $ProbeRoot -or",
    '      $EnvironmentOverrides.TMP -cne $ProbeRoot) { throw "Start-DockerProcess omitted a reviewed environment value" }',
    '  return "synthetic-docker-running"',
    "}",
    '$DockerRunning = Start-DockerProcess @("info")',
    'if ($DockerRunning -cne "synthetic-docker-running") { throw "Start-DockerProcess did not return the bounded process" }',
    'Write-Output "native_environment_synthetic_passed"',
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")
  try {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows"
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: {
          ...process.env,
          WOULDKEEP_PROBE_ROOT: probeRoot,
          WOULDKEEP_PROBE_PATH: join(systemRoot, "System32"),
          PGPASSWORD: "PARENT_PG_PASSWORD_SECRET",
          PGPASSFILE: "PARENT_PGPASSFILE_SECRET",
          SUPABASE_UNKNOWN_TOKEN: "PARENT_SUPABASE_SECRET",
          DATABASE_SHADOW_PASSWORD: "PARENT_DATABASE_SECRET",
          AWS_SECRET_ACCESS_KEY: "PARENT_AWS_SECRET",
          GITHUB_TOKEN: "PARENT_GITHUB_SECRET",
          HTTPS_PROXY: "PARENT_PROXY_SECRET",
        },
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /native_environment_synthetic_passed/)
    for (const secret of [
      "PARENT_PG_PASSWORD_SECRET",
      "PARENT_PGPASSFILE_SECRET",
      "PARENT_SUPABASE_SECRET",
      "PARENT_DATABASE_SECRET",
      "PARENT_AWS_SECRET",
      "PARENT_GITHUB_SECRET",
      "PARENT_PROXY_SECRET",
    ]) {
      assert.doesNotMatch(output, new RegExp(secret))
    }
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed host entrypoint supports pwsh -File with no extra arguments and still rejects linked parameter values", () => {
  assert.doesNotMatch(sealedHost, /@\(\$args\)/)
  assert.match(
    sealedHost,
    /if \(\(\$SupabaseCli, \$EvidenceDirectory, \$Docker\) -match '\(\?i\)--linked'\)/,
  )
  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-pwsh-file-"))
  const evidenceDirectory = join(probeRoot, "evidence-must-not-exist")
  const missingSupabase = join(probeRoot, "missing-supabase", "supabase.exe")
  const confirmation = "I_UNDERSTAND_THIS_BUILDS_AND_DESTROYS_A_SEALED_LOCAL_PG17_ENVIRONMENT"
  const firewallConfirmation =
    "I_AUTHORIZE_TEMPORARY_NON_LOOPBACK_FIREWALL_BLOCK_FOR_SEALED_LOCAL_PG17"
  const sealedHostPath = fileURLToPath(
    new URL("../../supabase/tests/20260722_tag_write_pause_sealed.ps1", import.meta.url),
  )
  const forbiddenEnvironment =
    /^(?:SUPABASE_ACCESS_TOKEN|SUPABASE_PROJECT_REF|DATABASE_URL|DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|DOCKER_CONFIG|SUPABASE_INTERNAL_IMAGE_REGISTRY|INTERNAL_IMAGE_REGISTRY|BITBUCKET_CLONE_DIR)$/i
  const cleanEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !forbiddenEnvironment.test(name)),
  )
  type InvocationValues = {
    SupabaseCli: string
    EvidenceDirectory: string
    Confirmation: string
    FirewallConfirmation: string
    Docker: string
  }
  const invokeHost = (overrides: Partial<InvocationValues> = {}) => {
    const values: InvocationValues = {
      SupabaseCli: missingSupabase,
      EvidenceDirectory: evidenceDirectory,
      Confirmation: confirmation,
      FirewallConfirmation: firewallConfirmation,
      Docker: "docker",
      ...overrides,
    }
    return spawnSync(
      "pwsh",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        sealedHostPath,
        "-SupabaseCli",
        values.SupabaseCli,
        "-EvidenceDirectory",
        values.EvidenceDirectory,
        "-Confirmation",
        values.Confirmation,
        "-FirewallConfirmation",
        values.FirewallConfirmation,
        "-Docker",
        values.Docker,
      ],
      {
        encoding: "utf8",
        env: cleanEnvironment,
        timeout: 30_000,
        windowsHide: true,
      },
    )
  }

  try {
    const noExtraArguments = invokeHost()
    const noExtraOutput = `${noExtraArguments.error?.message ?? ""}\n${noExtraArguments.stdout}\n${noExtraArguments.stderr}`
    assert.notEqual(noExtraArguments.status, 0)
    assert.match(
      noExtraOutput,
      /Explicit application path must be one absolute existing Windows \.exe for supabase/,
    )
    assert.doesNotMatch(noExtraOutput, /\$args|variable[^\r\n]*args[^\r\n]*cannot be retrieved/i)
    assert.equal(existsSync(evidenceDirectory), false)

    const rejectionCases: Array<[keyof InvocationValues, string, RegExp]> = [
      ["SupabaseCli", `${missingSupabase}--linked`, /Supabase --linked mode is forbidden/],
      ["EvidenceDirectory", `${evidenceDirectory}--linked`, /Supabase --linked mode is forbidden/],
      ["Docker", "docker--linked", /Supabase --linked mode is forbidden/],
      [
        "Confirmation",
        `${confirmation}--linked`,
        /Exact sealed-environment confirmation is required/,
      ],
      [
        "FirewallConfirmation",
        `${firewallConfirmation}--linked`,
        /Independent exact temporary-firewall confirmation is required/,
      ],
    ]
    for (const [parameter, value, expectedFailure] of rejectionCases) {
      const rejected = invokeHost({ [parameter]: value })
      assert.notEqual(rejected.status, 0)
      assert.match(
        `${rejected.error?.message ?? ""}\n${rejected.stdout}\n${rejected.stderr}`,
        expectedFailure,
      )
      assert.equal(existsSync(parameter === "EvidenceDirectory" ? value : evidenceDirectory), false)
    }
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed application resolver selects one exact Windows exe and rejects ambiguity", () => {
  assert.match(sealedHost, /Get-Command \$Command -CommandType Application -All -ErrorAction Stop/)
  assert.match(sealedHost, /\[IO\.Path\]::IsPathFullyQualified\(\$Source\)/)
  assert.match(sealedHost, /\[IO\.File\]::Exists\(\$Source\)/)
  assert.match(sealedHost, /GetExtension\(\$FullPath\), "\.exe"/)
  assert.match(sealedHost, /\$CandidatePaths\.Count -ne 1/)
  assert.match(
    sealedHost,
    /\$SupabasePath = Resolve-Application \$SupabaseCli "supabase" -RequireExplicitPath/,
  )
  assert.match(sealedHost, /Get-FileHash -LiteralPath \$SupabasePath -Algorithm SHA256/)
  assert.ok(
    sealedHost.indexOf(
      '$SupabasePath = Resolve-Application $SupabaseCli "supabase" -RequireExplicitPath',
    ) < sealedHost.indexOf("Get-FileHash -LiteralPath $SupabasePath -Algorithm SHA256"),
  )

  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const resolverStart = normalizedHost.indexOf("function Resolve-Application")
  const resolverEndMarker = "\n}\n\n$SupabasePath ="
  const resolverEnd = normalizedHost.indexOf(resolverEndMarker, resolverStart)
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart)
  const resolverSource = normalizedHost.slice(resolverStart, resolverEnd + 2)

  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-resolve-application-"))
  const singleDirectory = join(probeRoot, "single")
  const ambiguousDirectoryA = join(probeRoot, "ambiguous-a")
  const ambiguousDirectoryB = join(probeRoot, "ambiguous-b")
  const supabaseDirectory = join(probeRoot, "supabase-explicit")
  const alternateSupabaseDirectory = join(probeRoot, "supabase-alternate")
  for (const directory of [
    singleDirectory,
    ambiguousDirectoryA,
    ambiguousDirectoryB,
    supabaseDirectory,
    alternateSupabaseDirectory,
  ]) {
    mkdirSync(directory)
  }
  const singleExe = join(singleDirectory, "docker.exe")
  const extensionless = join(singleDirectory, "docker")
  const wrongDockerBasename = join(singleDirectory, "not-docker.exe")
  const missingDockerExe = join(singleDirectory, "missing-docker.exe")
  const ambiguousExeA = join(ambiguousDirectoryA, "docker.exe")
  const ambiguousExeB = join(ambiguousDirectoryB, "docker.exe")
  const explicitSupabase = join(supabaseDirectory, "supabase.exe")
  const alternateSupabase = join(alternateSupabaseDirectory, "supabase.exe")
  const supabaseExtensionless = join(supabaseDirectory, "supabase")
  const wrongSupabaseBasename = join(supabaseDirectory, "not-supabase.exe")
  const missingSupabaseExe = join(supabaseDirectory, "missing-supabase.exe")
  for (const path of [
    singleExe,
    extensionless,
    wrongDockerBasename,
    ambiguousExeA,
    ambiguousExeB,
    explicitSupabase,
    alternateSupabase,
    supabaseExtensionless,
    wrongSupabaseBasename,
  ]) {
    writeFileSync(path, "sealed resolver fixture", "utf8")
  }
  writeFileSync(explicitSupabase, "expected explicit supabase", "utf8")
  writeFileSync(alternateSupabase, "alternate supabase", "utf8")
  const probePath = join(probeRoot, "resolve-application-probe.ps1")
  const probeSource = [
    "[CmdletBinding()]",
    "param(",
    "  [string]$SingleExe,",
    "  [string]$Extensionless,",
    "  [string]$WrongDockerBasename,",
    "  [string]$MissingDockerExe,",
    "  [string]$AmbiguousExeA,",
    "  [string]$AmbiguousExeB,",
    "  [string]$ExplicitSupabase,",
    "  [string]$AlternateSupabase,",
    "  [string]$SupabaseExtensionless,",
    "  [string]$WrongSupabaseBasename,",
    "  [string]$MissingSupabaseExe",
    ")",
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    resolverSource,
    "$script:Candidates = @()",
    "function Get-Command {",
    "  [CmdletBinding()]",
    "  param(",
    "    [Parameter(Position = 0)][string]$Name,",
    "    [object]$CommandType,",
    "    [switch]$All",
    "  )",
    "  if ([string]::IsNullOrWhiteSpace($Name) -or -not $All.IsPresent -or",
    '      [string]$CommandType -cne "Application") {',
    '    throw "Resolver did not request all application candidates"',
    "  }",
    "  return @($script:Candidates)",
    "}",
    "function Assert-ExplicitPathRejected {",
    "  [CmdletBinding()]",
    "  param([Parameter(Mandatory = $true)][string]$Value)",
    "  $Rejected = $false",
    "  try {",
    '    $null = Resolve-Application $Value "supabase" -RequireExplicitPath',
    "  } catch {",
    '    if ($_.Exception.Message -notmatch "Explicit application path must be one absolute existing Windows \\.exe") {',
    "      throw",
    "    }",
    "    $Rejected = $true",
    "  }",
    "  if (-not $Rejected) {",
    '    throw "Resolver accepted an invalid explicit Supabase path"',
    "  }",
    "}",
    "function Assert-DockerCandidatesRejected {",
    "  [CmdletBinding()]",
    "  param([Parameter(Mandatory = $true)][object[]]$Candidates)",
    "  $script:Candidates = @($Candidates)",
    "  $Rejected = $false",
    "  try {",
    '    $null = Resolve-Application "docker" "docker"',
    "  } catch {",
    '    if ($_.Exception.Message -notmatch "Expected exactly one absolute existing Windows \\.exe") {',
    "      throw",
    "    }",
    "    $Rejected = $true",
    "  }",
    "  if (-not $Rejected) {",
    '    throw "Resolver accepted invalid Docker candidates"',
    "  }",
    "}",
    "try {",
    "  $script:Candidates = @([pscustomobject]@{ Source = $ExplicitSupabase })",
    '  $SelectedSupabase = Resolve-Application $ExplicitSupabase "supabase" -RequireExplicitPath',
    "  if ($SelectedSupabase -cne $ExplicitSupabase) {",
    '    throw "Resolver changed the explicit Supabase executable path"',
    "  }",
    "  $SelectedHash = (Get-FileHash -LiteralPath $SelectedSupabase -Algorithm SHA256).Hash",
    "  $ExplicitHash = (Get-FileHash -LiteralPath $ExplicitSupabase -Algorithm SHA256).Hash",
    "  if ($SelectedHash -cne $ExplicitHash) {",
    '    throw "Resolver did not hash the exact explicit Supabase path"',
    "  }",
    '  foreach ($InvalidExplicit in @("supabase", $SupabaseExtensionless,',
    "      $WrongSupabaseBasename, $MissingSupabaseExe)) {",
    "    Assert-ExplicitPathRejected -Value $InvalidExplicit",
    "  }",
    "  $script:Candidates = @([pscustomobject]@{ Source = $AlternateSupabase })",
    "  $AlternateRejected = $false",
    "  try {",
    '    $null = Resolve-Application $ExplicitSupabase "supabase" -RequireExplicitPath',
    "  } catch {",
    '    if ($_.Exception.Message -notmatch "Expected exactly one absolute existing Windows \\.exe") {',
    "      throw",
    "    }",
    "    $AlternateRejected = $true",
    "  }",
    "  if (-not $AlternateRejected) {",
    '    throw "Resolver accepted an alternate Supabase executable path"',
    "  }",
    '  Write-Output "explicit_supabase_path_enforced"',
    "  $script:Candidates = @(",
    "    [pscustomobject]@{ Source = $SingleExe },",
    "    [pscustomobject]@{ Source = $Extensionless }",
    "  )",
    '  $Selected = Resolve-Application "docker" "docker"',
    "  if ($Selected -cne $SingleExe) {",
    '    throw "Resolver did not select the unique docker.exe"',
    "  }",
    '  Write-Output "unique_windows_exe_selected"',
    "  Assert-DockerCandidatesRejected -Candidates @(",
    "    [pscustomobject]@{ Source = $AmbiguousExeA }",
    "    [pscustomobject]@{ Source = $AmbiguousExeB }",
    "    [pscustomobject]@{ Source = $Extensionless }",
    "  )",
    '  Write-Output "ambiguous_windows_exe_rejected"',
    "  Assert-DockerCandidatesRejected -Candidates @(",
    "    [pscustomobject]@{ Source = $Extensionless }",
    "  )",
    "  Assert-DockerCandidatesRejected -Candidates @(",
    "    [pscustomobject]@{ Source = $WrongDockerBasename }",
    "  )",
    "  Assert-DockerCandidatesRejected -Candidates @(",
    "    [pscustomobject]@{ Source = $MissingDockerExe }",
    "  )",
    '  Write-Output "invalid_windows_exe_candidates_rejected"',
    "} catch {",
    '  Write-Output ("resolver_probe_failure=" + $_.Exception.Message)',
    "  exit 91",
    "}",
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")

  try {
    const result = spawnSync(
      "pwsh",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        probePath,
        "-SingleExe",
        singleExe,
        "-Extensionless",
        extensionless,
        "-WrongDockerBasename",
        wrongDockerBasename,
        "-MissingDockerExe",
        missingDockerExe,
        "-AmbiguousExeA",
        ambiguousExeA,
        "-AmbiguousExeB",
        ambiguousExeB,
        "-ExplicitSupabase",
        explicitSupabase,
        "-AlternateSupabase",
        alternateSupabase,
        "-SupabaseExtensionless",
        supabaseExtensionless,
        "-WrongSupabaseBasename",
        wrongSupabaseBasename,
        "-MissingSupabaseExe",
        missingSupabaseExe,
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /explicit_supabase_path_enforced/)
    assert.match(result.stdout, /unique_windows_exe_selected/)
    assert.match(result.stdout, /ambiguous_windows_exe_rejected/)
    assert.match(result.stdout, /invalid_windows_exe_candidates_rejected/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed Docker inspect helpers distinguish optional emptiness from missing security fields", () => {
  assert.match(sealedHost, /function Get-DockerPropertyState/)
  assert.match(sealedHost, /function Get-DockerRequiredNullableMapProperties/)
  assert.match(sealedHost, /function Get-DockerRequiredNullableList/)
  assert.match(sealedHost, /function Get-DockerRequiredString/)
  assert.match(sealedHost, /function Get-DockerRequiredBoolean/)
  assert.match(sealedHost, /function Get-DockerRequiredInteger/)
  assert.match(sealedHost, /function Get-DockerOptionalInteger/)
  assert.match(sealedHost, /OrdinalIgnoreCase\.Equals\(\$_\.Name, \$Name\)/)
  assert.match(sealedHost, /-not \$NameExpected -or -not \$LabelExact -or \$LabelConflicts/)
  assert.doesNotMatch(
    sealedHost,
    /\.(?:Config|HostConfig|NetworkSettings|State|Labels|PortBindings|Tmpfs|Aliases|DriverOpts|DNSNames)\./,
  )
  assert.doesNotMatch(
    sealedHost,
    /\$(?:RunnerImageConfig|DatabaseImageConfig)\.Volumes|\$(?:DatabaseNetworkSettings|RunnerNetworkSettings)\.Networks/,
  )

  const normalizedHost = sealedHost.replaceAll("\r\n", "\n")
  const helperStart = normalizedHost.indexOf("function Get-DockerPropertyState")
  const helperEndMarker = "\n}\n\nfunction Assert-DockerEngineIdentity"
  const helperEnd = normalizedHost.indexOf(helperEndMarker, helperStart)
  assert.ok(helperStart >= 0 && helperEnd > helperStart)
  const helperSource = normalizedHost.slice(helperStart, helperEnd + 2)

  const probeRoot = mkdtempSync(join(tmpdir(), "wouldkeep-docker-inspect-helper-"))
  const probePath = join(probeRoot, "docker-inspect-helper-probe.ps1")
  const probeSource = [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    helperSource,
    "function Assert-Throws {",
    "  param([scriptblock]$Action, [string]$Name)",
    "  $DidThrow = $false",
    "  try {",
    "    $null = & $Action",
    "  } catch {",
    "    $DidThrow = $true",
    "  }",
    '  if (-not $DidThrow) { throw "Expected rejection: $Name" }',
    "}",
    "try {",
    `$Missing = '{}' | ConvertFrom-Json`,
    `$Nulls = '{"Object":null,"Map":null,"List":null,"String":null,"Bool":null,"Integer":null}' | ConvertFrom-Json`,
    `$Empties = '{"Object":{},"Map":{},"List":[],"String":"","Bool":"","Integer":""}' | ConvertFrom-Json`,
    `$WrongShapes = '{"Object":[],"Map":[],"List":{},"String":[],"Bool":[],"Integer":[]}' | ConvertFrom-Json`,
    `$NonEmpty = '{"Map":{"key":{}},"List":["value"]}' | ConvertFrom-Json`,
    `$Scalars = '{"String":"","False":false,"True":true,"Zero":0,"NumericBool":0}' | ConvertFrom-Json`,
    `$RunnerImage = '{"Id":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Config":{"User":"65534:65534"}}' | ConvertFrom-Json`,
    `$ImageWithVolume = '{"Config":{"Volumes":{"/data":{}}}}' | ConvertFrom-Json`,
    '  $RunnerConfig = Get-DockerRequiredObject $RunnerImage "Config"',
    '  if (@((Get-DockerRequiredObject $Empties "Object").PSObject.Properties).Count -ne 0) { throw "valid empty object" }',
    '  Assert-Throws { Get-DockerRequiredObject $Missing "Object" } "object missing"',
    '  Assert-Throws { Get-DockerRequiredObject $Nulls "Object" } "object null"',
    '  Assert-Throws { Get-DockerRequiredObject $WrongShapes "Object" } "object array"',
    '  if ((Get-DockerRequiredString $RunnerConfig "User") -cne "65534:65534") { throw "runner user" }',
    '  if (@(Get-DockerOptionalMapProperties $RunnerConfig "Volumes").Count -ne 0) { throw "missing image volumes" }',
    '  if (@(Get-DockerOptionalMapProperties $Nulls "Map").Count -ne 0) { throw "null optional map" }',
    '  if (@(Get-DockerOptionalMapProperties $Empties "Map").Count -ne 0) { throw "empty optional map" }',
    '  if (@(Get-DockerOptionalMapProperties $NonEmpty "Map").Count -ne 1) { throw "nonempty optional map" }',
    '  $ImageVolumeConfig = Get-DockerRequiredObject $ImageWithVolume "Config"',
    '  if (@(Get-DockerOptionalMapProperties $ImageVolumeConfig "Volumes").Count -ne 1) { throw "nonempty image volumes" }',
    '  Assert-Throws { Get-DockerOptionalMapProperties $WrongShapes "Map" } "optional map wrong type"',
    '  if (@(Get-DockerOptionalList $Missing "List").Count -ne 0 -or',
    '      @(Get-DockerOptionalList $Nulls "List").Count -ne 0 -or',
    '      @(Get-DockerOptionalList $Empties "List").Count -ne 0 -or',
    '      @(Get-DockerOptionalList $NonEmpty "List").Count -ne 1) { throw "optional list shapes" }',
    '  Assert-Throws { Get-DockerOptionalList $WrongShapes "List" } "optional list wrong type"',
    '  Assert-Throws { Get-DockerRequiredNullableMapProperties $Missing "Map" } "required map missing"',
    '  if (@(Get-DockerRequiredNullableMapProperties $Nulls "Map").Count -ne 0) { throw "required map null" }',
    '  if (@(Get-DockerRequiredNullableMapProperties $Empties "Map").Count -ne 0) { throw "required map empty" }',
    '  if (@(Get-DockerRequiredNullableMapProperties $NonEmpty "Map").Count -ne 1) { throw "required map nonempty" }',
    '  Assert-Throws { Get-DockerRequiredNullableMapProperties $WrongShapes "Map" } "required map wrong type"',
    '  Assert-Throws { Get-DockerRequiredNullableList $Missing "List" } "required list missing"',
    '  if (@(Get-DockerRequiredNullableList $Nulls "List").Count -ne 0) { throw "required list null" }',
    '  if (@(Get-DockerRequiredNullableList $Empties "List").Count -ne 0) { throw "required list empty" }',
    '  if (@(Get-DockerRequiredNullableList $NonEmpty "List").Count -ne 1) { throw "required list nonempty" }',
    '  Assert-Throws { Get-DockerRequiredNullableList $WrongShapes "List" } "required list wrong type"',
    '  if (@(Get-DockerNullableListValue $Nulls.List "null map value").Count -ne 0 -or',
    '      @(Get-DockerNullableListValue $Empties.List "empty map value").Count -ne 0 -or',
    '      @(Get-DockerNullableListValue $NonEmpty.List "nonempty map value").Count -ne 1) { throw "nullable map-value list shapes" }',
    '  Assert-Throws { Get-DockerNullableListValue $Scalars.String "string map value" } "map-value string"',
    '  Assert-Throws { Get-DockerNullableListValue $WrongShapes.List "object map value" } "map-value object"',
    '  if ((Get-DockerRequiredString $Scalars "String") -cne "") { throw "empty typed string" }',
    '  Assert-Throws { Get-DockerRequiredString $Missing "String" } "string missing"',
    '  Assert-Throws { Get-DockerRequiredString $Nulls "String" } "string null"',
    '  Assert-Throws { Get-DockerRequiredString $WrongShapes "String" } "string array"',
    '  if ((Get-DockerRequiredBoolean $Scalars "False") -cne $false) { throw "false bool" }',
    '  if ((Get-DockerRequiredBoolean $Scalars "True") -cne $true) { throw "true bool" }',
    '  foreach ($Case in @(@($Missing, "Bool"), @($Nulls, "Bool"), @($Empties, "Bool"), @($WrongShapes, "Bool"), @($Scalars, "NumericBool"))) {',
    "    $Current = $Case[0]; $Property = $Case[1]",
    '    Assert-Throws { Get-DockerRequiredBoolean $Current $Property } "invalid bool"',
    "  }",
    '  if ((Get-DockerRequiredInteger $Scalars "Zero") -ne 0) { throw "zero integer" }',
    '  foreach ($Case in @(@($Missing, "Integer"), @($Nulls, "Integer"), @($Empties, "Integer"), @($WrongShapes, "Integer"), @($Scalars, "False"))) {',
    "    $Current = $Case[0]; $Property = $Case[1]",
    '    Assert-Throws { Get-DockerRequiredInteger $Current $Property } "invalid integer"',
    "  }",
    '  if ((Get-DockerOptionalInteger $Missing "Integer" 0) -ne 0 -or',
    '      (Get-DockerOptionalInteger $Nulls "Integer" 0) -ne 0 -or',
    '      (Get-DockerOptionalInteger $Scalars "Zero" 9) -ne 0) { throw "optional integer default" }',
    '  Assert-Throws { Get-DockerOptionalInteger $WrongShapes "Integer" 0 } "optional integer array"',
    `$MissingLabel = '{}' | ConvertFrom-Json`,
    `$ExactLabel = '{"wouldkeep.sealed":"nonce"}' | ConvertFrom-Json`,
    `$EmptyLabel = '{"wouldkeep.sealed":""}' | ConvertFrom-Json`,
    `$NullLabel = '{"wouldkeep.sealed":null}' | ConvertFrom-Json`,
    `$WrongLabel = '{"wouldkeep.sealed":["nonce"]}' | ConvertFrom-Json`,
    `$CaseLabel = '{"WouldKeep.Sealed":"nonce"}' | ConvertFrom-Json`,
    '  if ($null -ne (Get-DockerLabel $MissingLabel "wouldkeep.sealed")) { throw "missing label" }',
    '  if ((Get-DockerLabel $ExactLabel "wouldkeep.sealed") -cne "nonce") { throw "exact label" }',
    '  if ((Get-DockerLabel $EmptyLabel "wouldkeep.sealed") -cne "") { throw "empty label" }',
    '  Assert-Throws { Get-DockerLabel $NullLabel "wouldkeep.sealed" } "null label"',
    '  Assert-Throws { Get-DockerLabel $WrongLabel "wouldkeep.sealed" } "wrong label type"',
    '  Assert-Throws { Get-DockerLabel $CaseLabel "wouldkeep.sealed" } "case-variant label"',
    '  Assert-Throws { Get-DockerLabel @() "wouldkeep.sealed" } "wrong labels shape"',
    '  Write-Output "docker_inspect_optional_helpers_synthetic_passed"',
    "} catch {",
    '  Write-Output ("docker_inspect_optional_helpers_synthetic_failed=" + $_.Exception.Message)',
    "  exit 91",
    "}",
    "",
  ].join("\n")
  writeFileSync(probePath, probeSource, "utf8")

  try {
    const result = spawnSync(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", probePath],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    )
    const output = `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`
    assert.equal(result.status, 0, output)
    assert.match(result.stdout, /docker_inspect_optional_helpers_synthetic_passed/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test("sealed container attests exact PG17 baseline before and after the unchanged matrix", () => {
  assert.match(sealedContainer, /\/opt\/pg17\/bin\/psql/)
  assert.match(sealedContainer, /\/opt\/pg17\/bin\/pg_isready/)
  assert.ok(sealedContainer.includes("psql \\(PostgreSQL\\) 17\\.6"))
  assert.match(sealedContainer, /Complete-BoundedProcess/)
  assert.match(sealedContainer, /\.Kill\(\$true\)/)
  assert.match(sealedContainer, /attestation-before\.txt/)
  assert.match(sealedContainer, /20260722_tag_write_pause_disposable\.ps1/)
  assert.match(sealedContainer, /tag_write_pause_disposable_matrix_passed/)
  assert.match(sealedContainer, /attestation-after\.txt/)
  assert.match(sealedContainer, /Assert-SealedInput/)
  assert.match(sealedContainer, /input-reverified\.txt/)
  assert.match(sealedContainer, /wouldkeep_sealed_evidence_copied/)
  const evidencePathSort = sealedContainer.indexOf(
    "$EvidenceRelativePaths = Get-OrdinalSorted $EvidenceRelativePaths",
  )
  const evidenceHashFormatting = sealedContainer.indexOf(
    "$EvidenceFiles = @($EvidenceRelativePaths | ForEach-Object",
  )
  assert.ok(evidencePathSort >= 0 && evidencePathSort < evidenceHashFormatting)
  assert.doesNotMatch(sealedContainer, /Get-OrdinalSorted \$EvidenceFiles/)
  assert.doesNotMatch(
    sealedContainer,
    /\$_\.Name -notin @\("evidence-sha256\.txt", "completed-utc\.txt"\)/,
  )
  assert.match(
    sealedContainer,
    /\$_ -cne "evidence-sha256\.txt" -and \$_ -cne "completed-utc\.txt"/,
  )
  assert.match(sealedContainer, /Remove-Item Env:PGPASSWORD/)
  assert.match(sealedContainer, /Remove-Item Env:PGPASSFILE/)
  assert.match(sealedContainer, /existing tmpfs directory outside sealed input/)
  assert.match(sealedContainer, /Runner evidence tmpfs must be empty and must not be a link/)

  assert.match(sealedSanitize, /ALTER ROLE %I PASSWORD NULL/)
  assert.match(sealedSanitize, /ALTER SYSTEM RESET ALL/)
  assert.match(sealedSanitize, /rolpassword IS NOT NULL/)
  assert.match(sealedSanitize, /setting\.name ~\* '\(jwt\|secret\|password\|token\)'/)
  assert.match(sealedSanitize, /setting\.name <> 'password_encryption'/)
  assert.match(sealedSanitize, /tag_write_pause_sealed_secrets_removed/)

  assert.match(sealedAttestation, /pg_control_system\(\)/)
  assert.match(sealedAttestation, /inet_server_addr\(\)/)
  assert.match(sealedAttestation, /inet_client_addr\(\)/)
  assert.match(sealedAttestation, /actual_versions IS DISTINCT FROM expected_versions/)
  assert.match(sealedAttestation, /20260722000150', '20260722000200/)
  assert.match(sealedAttestation, /FROM pg_catalog\.pg_subscription/)
  assert.match(sealedAttestation, /rolpassword IS NOT NULL/)
  assert.match(sealedAttestation, /shared_preload_libraries/)
  assert.match(sealedAttestation, /backend_type = 'client backend'/)
  assert.match(sealedAttestation, /tag_write_pause_sealed_attestation_passed/)
})
