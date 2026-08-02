# Runbook: `20260722000150_normalize_existing_tags_for_atomic_save`

This fail-closed runbook is an instruction artifact only. It **does not authorize production deployment**, merging a PR, production access, backup, or any database write. Installing or removing the temporary write-pause gate is itself a production database write and requires fresh written authorization for the exact operation.

## Scope and immutable inputs

- Branch: `release/p1b-00150-tag-write-pause-gate`.
- Creation base: `19571ca19dabc80aeacac7a1ac016667dcaa9f0f` (PR #31 before merge).
- Approved migration: `supabase/migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql` only.
- Validated Supabase CLI: `2.109.1`.
- Pre-deployment remote ledger: exactly 19 distinct versions through `20260722000100`.
- `20260722000200` must be absent from this branch and from the remote ledger throughout this runbook.

Current `main` contains the not-yet-deployed `20260722000200`. A future `00150` deployment must therefore run from a clean worktree at the approved SHA on this isolated branch. Running from `main`, using `--include-all`, copying SQL into the Dashboard, or invoking `migration repair` is forbidden.

This gate covers ordinary SQL writers, owner/service-role/RLS bypass, foreign-key cascades, and `session_replication_role = replica`. PostgreSQL 17 logical-replication apply workers do not fire statement-level triggers, so every state checkpoint also requires zero enabled inbound subscription relations for `public.tags` and `public.document_tags`. Supabase Realtime's outbound publication is not an inbound subscription. Physical replication, logical apply, and disaster restore remain outside this artifact; if the catalog proof cannot be read or is non-empty, stop.

Production-safe, read-only inputs:

- `supabase/tests/20260722_tag_normalization_activity_gate.sql`
- `supabase/tests/20260722_tag_normalization_preflight.sql`
- `supabase/tests/20260722_tag_normalization_state_fingerprint.sql`
- `supabase/tests/20260722_tag_write_pause_state.sql`
- `supabase/tests/20260722_tag_write_pause_behavior.sql` (zero-row `INSERT`/`UPDATE`/`DELETE` only; never production `TRUNCATE`)

Versioned production-operation inputs, not migrations:

- `supabase/operations/20260722_tag_write_pause_enable.sql`
- `supabase/operations/20260722_tag_write_pause_disable.sql`

Disposable-only inputs, never allowed with `--linked` or a production URL:

- `supabase/tests/20260722_tag_write_pause_sealed.ps1`
- `supabase/tests/20260722_tag_write_pause_sealed.Dockerfile`
- `supabase/tests/20260722_tag_write_pause_sealed_db.Dockerfile`
- `supabase/tests/20260722_tag_write_pause_sealed_manifest.sha256`
- `supabase/tests/20260722_tag_write_pause_sealed_{config,roles,bootstrap,rename,sanitize,attestation,container,postgresql,pg_hba}.*`
- `supabase/tests/20260722_tag_write_pause_disposable.ps1`
- `supabase/tests/20260722_tag_write_pause_disposable_*.sql`
- `supabase/tests/20260722_tag_normalization.sql`
- `supabase/tests/20260722_tag_normalization_collision.sql`
- `supabase/tests/20260722_tag_normalization_invalid.sql`
- `supabase/tests/20260722_tag_normalization_residue.sql`

## Universal stop conditions

Stop and preserve the evidence directory if any condition fails. Do not weaken an assertion, retry an ambiguous write, repair the ledger, or run ad-hoc SQL.

- Fresh written authorization does not name the exact next production operation.
- The approved SHA, branch, creation base, clean worktree, CLI version, linked project ref, or protected evidence path cannot be proven.
- Any command exits unexpectedly or produces empty evidence.
- Initial identity or the hash-pinned Supabase archive, executable, project ref, migration set, operation input, or read-only probe changes.
- The initial gate state is not exactly absent, the active gate state or 24-probe behavior contract is not exact, an active checkpoint changes the baseline catalog fingerprints, or the released state is not byte-for-byte equal to the initial absent state.
- Either target relation belongs to an enabled inbound logical subscription, or the subscription catalogs cannot be verified by the exact operator.
- Any interruption occurs while the gate may be active. Preserve evidence, stop all migration work, determine the exact gate state, and use only the reviewed disable operation. Do not improvise recovery.
- The preflight aggregate is not exactly `462` tags, `6` candidates, `65` affected references, and zero collisions.
- A dry-run contains anything except the single approved `00150` filename/version.
- Any backup is empty or structurally incomplete, or the set does not produce exactly three SHA-256 hashes.

Never commit backup data or raw evidence. The public-data dump contains private content. Sanitized records may contain only aggregate counts, whole-set fingerprints, CLI/Git/project identity, gate object OIDs, and pass/fail status; never tag text, per-row hashes, production UUIDs, account content, database URLs, or secrets.

## 1. Disposable candidate verification

The release gate uses the sealed host orchestrator below. It creates a new content-addressed input snapshot containing `schema.sql`, a reviewed roles template with one deterministic synthetic owner, exactly 19 migrations through `20260722000100`, and the unchanged reviewed matrix. The CLI bootstrap project contains only its fixed config, one deterministically rendered pure-SQL `roles.sql`, and those 19 migrations. It does not contain a standalone `schema.sql`. `20260722000150`, `20260722000200`, `.env`, linked-project state, the repository, the Docker socket, and user credentials are physically absent from the runner.

The bootstrap is allowed to use only Supabase CLI `2.109.1` with SHA-256 `22C0F28F013411C7A7B880116CD33636EDB955A64278914692EEA010BCC98DC7`. Each CLI-exact fully qualified mutable image alias (`public.ecr.aws/supabase/postgres`, `public.ecr.aws/supabase/gotrue`, `public.ecr.aws/supabase/storage-api`, and disabled `public.ecr.aws/supabase/realtime`) is temporarily mapped to one pinned public-ECR digest and is removed or restored to its exact pre-run image ID in cleanup. The CLI and Docker children receive a cleared environment plus only an explicit reviewed Windows base and call-specific values; unknown parent database, Supabase, cloud, GitHub, proxy, and API-key variables are not inherited. Realtime is disabled, auth/storage must finish as one-shot helpers with zero residue, and exactly one persistent database container must remain when the CLI returns.

Supabase CLI `2.109.1` parses bootstrap role files itself rather than invoking `psql`, so raw `\set` or `\ir` lines must never reach it. The host therefore verifies exactly one reviewed `\set ON_ERROR_STOP on` and one `\ir schema.sql` in the source template, rejects every other line-start backslash command, removes the former, replaces the latter with the hash-pinned schema bytes, and rejects any meta-command in the schema or rendered output. It records source and rendered hashes in `bootstrap-rendered-inputs.txt`, requires `psql_meta_commands=0` and `ledger_mutations=0`, and does not modify `supabase_migrations`. The rendered `roles.sql` loads the schema first and the sole synthetic owner second, before the 19 migrations with seeding disabled. A read-only attestation then requires the initialized database owner to be one of the two fixed platform roles (`postgres` or `supabase_admin`) and requires `supabase_admin` to be a login-capable superuser; only the fixed rename and credential-sanitization stages use that administrative role, while the business-schema baseline remains owned and verified by `postgres`. The host renames the database to the nonce-prefixed disposable name, removes every login password and database/role secret setting, and performs a clean database shutdown. The stopped PGDATA is archived from a read-only source volume, hashed, and restored into a fresh nonce volume only after matching the clean cluster state and system identifier. The final database container is recreated with deterministic secret-free configuration, `network=none`, no published ports, one fresh PGDATA volume, a read-only root filesystem, and no credentials. A separate unprivileged read-only runner shares only that exact container network namespace; it has no bind/volume mounts, Docker socket, repository, routes, external DNS, or credentials, and uses exact tmpfs paths only for bounded evidence transfer.

The CLI bootstrap requests and reports a wildcard publication for its random database port. Docker Desktop may expose that request as an actual Windows wildcard listener or narrow it to IPv4/IPv6 loopback; the host records both Docker's runtime binding and the OS listener set, accepts only `0.0.0.0`, `::`, `127.0.0.1`, or `::1`, and rejects every other local-interface address. Because the requested publication remains wildcard and the observed behavior may vary, this command must run from an elevated Windows PowerShell session with Windows Defender Firewall running. Before `db start`, the orchestrator creates one nonce-named persistent inbound **Block** rule for that TCP port whose remote ranges exclude loopback, verifies the exact active rule and `InstanceID`, and separately proves loopback access. In `finally`, it first reconciles the nonce-scoped runtime. It removes only the freshly revalidated PersistentStore object after proving the recorded Docker engine, exact-zero scoped resource/listener residue, exact persistent rule identity and filters, and then proves both firewall stores contain zero residue. If any ownership, runtime, listener, engine, or PersistentStore proof is incomplete, it deliberately retains the rule and writes credential-free `firewall-retained.txt` evidence when possible; cleanup is then blocking. An ActiveStore projection or global-profile mismatch alone does not authorize retaining a now-unnecessary exact persistent block after all those removal proofs pass: the orchestrator removes the exact PersistentStore InputObject, verifies both stores are zero, records the cleanup failure, waits for every cleanup step, and rethrows the original projection/profile error when it is the sole failure. If a main failure also exists or more than one cleanup step fails, the caller receives an `AggregateException` that preserves the exact main exception first and the exact cleanup exceptions in step order.

If `firewall-retained.txt` exists, stop and preserve the complete evidence directory. Never improvise a name-based firewall deletion or continue the database procedure. Any later removal requires separate written authorization and a reviewed recovery that re-proves the recorded engine identity, zero nonce/project-scoped resources, zero listener on the recorded port, and the full PersistentStore rule identity and filters; removal must use that freshly validated exact InputObject and verify both PersistentStore and ActiveStore are zero afterward. A partial creation with no recorded `InstanceID` is manual-review-only. Do not change global firewall profiles or policies.

Every external CLI call has a fixed call label, bounded duration, split stdout/stderr hashes and counts, and fail-closed credential-free diagnostics. The three fixed containerized SQL stages also have distinct `bootstrap-attestation`, `bootstrap-rename`, and `bootstrap-sanitize` labels. On failure, `native-failure.txt` or `docker-sql-failure-<label>.txt` may contain only bounded allowlisted lines, redacted placeholders, fixed booleans, and aggregate metadata; arguments and raw output never enter the exception. If a timed-out native process cannot be reaped after tree termination, runtime cleanup cannot be proven: the firewall and sealed working directory are deliberately retained for reviewed recovery. Preserve these files and every retained-resource record with the rest of the failed-run evidence.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SupabaseCli = "<absolute-path-to-reviewed-supabase-2.109.1>"
$EvidenceDirectory = "<new-absolute-path-outside-repository>"

& pwsh -NoProfile -File "supabase/tests/20260722_tag_write_pause_sealed.ps1" `
  -SupabaseCli $SupabaseCli `
  -EvidenceDirectory $EvidenceDirectory `
  -Confirmation "I_UNDERSTAND_THIS_BUILDS_AND_DESTROYS_A_SEALED_LOCAL_PG17_ENVIRONMENT" `
  -FirewallConfirmation "I_AUTHORIZE_TEMPORARY_NON_LOOPBACK_FIREWALL_BLOCK_FOR_SEALED_LOCAL_PG17"
if ($LASTEXITCODE -ne 0) { throw "Sealed PG17 verification failed" }
```

Success requires exactly one `tag_write_pause_sealed_host_passed`, the inner `tag_write_pause_sealed_matrix_passed`, complete before/after attestation, `bootstrap-rendered-inputs.txt` with the exact reviewed source/render hashes and both zero contracts, and `tag_write_pause_sealed_cleanup_passed`. Any build, hash, topology, ledger, fixture, matrix, evidence-copy, clean-shutdown, or cleanup failure is blocking. Never weaken an assertion or reuse the database/evidence directory.

The preserved Run11a attempt (`wouldkeep-p1b-sealed-run11a-20260731T070852Z-88ba05f0270c`) stopped during `supabase db start` before the PostgreSQL 17 matrix and is not success evidence. Its final cleanup evidence and an independent post-run check proved the exact firewall rule absent from both stores, zero listener on port `55450`, zero nonce/project-scoped Docker containers, volumes, networks, and images, and the same Docker engine ID. That evidence directory is immutable and must never be reused. The failed run motivated the strict native diagnostics/environment, CLI-exact alias, and pure-SQL roles-render contracts above; a fresh evidence directory is mandatory for the next attempt.

The older direct invocation below documents the inner matrix contract only. It is not sufficient release-gate evidence by itself. If used for isolated development, it must still target a throwaway PostgreSQL 17 database at the exact `20260722000100` baseline. The URL must contain a literal loopback IP address and no query or fragment. Never use `--linked`, a hostname, a Supabase pooler, or a non-loopback URL.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$Psql = "psql"
$DisposableDbUrl = "<loopback-postgres-url>"
$CandidateEvidenceDir = "<absolute-path-outside-repository>"
$GateEvidenceDir = "<different-new-absolute-path-outside-repository>"

function Assert-LoopbackPostgresUrl([string]$Url) {
  try { $Uri = [Uri]$Url } catch { throw "Disposable database URL is invalid" }
  if ($Uri.Scheme -notin @("postgres", "postgresql")) {
    throw "Disposable database URL must use postgres or postgresql"
  }
  if (-not [string]::IsNullOrEmpty($Uri.Query) -or
      -not [string]::IsNullOrEmpty($Uri.Fragment)) {
    throw "Disposable database URL must not contain query or fragment overrides"
  }
  $Address = $null
  $HostText = $Uri.Host.Trim([char[]]"[]")
  if (-not [Net.IPAddress]::TryParse($HostText, [ref]$Address) -or
      -not [Net.IPAddress]::IsLoopback($Address)) {
    throw "Refusing a non-loopback disposable database"
  }
}

function Write-CandidateEvidence([string]$Name, [object[]]$Value) {
  $Path = Join-Path $CandidateEvidenceDir $Name
  $Value | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -le 0) {
    throw "Candidate evidence is empty: $Name"
  }
}

function Invoke-PsqlCapture(
  [string]$Name,
  [string[]]$Arguments,
  [int]$ExpectedExit,
  [string]$ExpectedText
) {
  $Output = @(& $script:Psql @Arguments 2>&1)
  $Exit = $LASTEXITCODE
  Write-CandidateEvidence "$Name.txt" $Output
  if ($Exit -ne $ExpectedExit) {
    throw "$Name exited $Exit instead of exact expected exit $ExpectedExit"
  }
  $Text = $Output -join "`n"
  if ($Text -notmatch [regex]::Escape($ExpectedText)) {
    throw "$Name did not emit the reviewed rejection/pass text"
  }
  return $Output
}

function Assert-ResidueZero([string]$Name) {
  $Output = @(& $script:Psql -X --csv --dbname=$script:DisposableDbUrl `
    --set=ON_ERROR_STOP=1 --file=supabase/tests/20260722_tag_normalization_residue.sql 2>&1)
  $Exit = $LASTEXITCODE
  Write-CandidateEvidence "$Name.txt" $Output
  $Text = $Output -join "`n"
  if ($Exit -ne 0 -or
      $Text -notmatch '(?m)^0,0,0,0,0,0,0,tag_normalization_rollback_residue_zero\r?$') {
    throw "$Name did not prove exact zero residue"
  }
}

Assert-LoopbackPostgresUrl $DisposableDbUrl
$RepositoryRoot = [IO.Path]::GetFullPath((git rev-parse --show-toplevel).Trim())
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve repository root" }
$CandidateEvidenceDir = [IO.Path]::GetFullPath($CandidateEvidenceDir)
if ($CandidateEvidenceDir.StartsWith($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Candidate evidence must remain outside the repository"
}
New-Item -ItemType Directory -Path $CandidateEvidenceDir -ErrorAction Stop | Out-Null
$script:Psql = $Psql
$script:DisposableDbUrl = $DisposableDbUrl

# Missing opt-in must be a SQL-script rejection (psql exit 3), not a connection,
# path, or syntax failure. The fixture guard runs before BEGIN.
Invoke-PsqlCapture "missing-confirmation" @(
  "-X", "--dbname=$DisposableDbUrl", "--set=ON_ERROR_STOP=1",
  "--file=supabase/tests/20260722_tag_normalization.sql"
) 3 "Disposable environment confirmation is required"
Assert-ResidueZero "missing-confirmation-residue"

$Positive = Invoke-PsqlCapture "positive-matrix" @(
  "-X", "--csv", "--dbname=$DisposableDbUrl", "--set=ON_ERROR_STOP=1",
  "--set=wouldkeep_p1b_20260722000150_disposable=true",
  "--file=supabase/tests/20260722_tag_normalization.sql"
) 0 "transient_unique_swap_succeeds"
$PositiveText = $Positive -join "`n"
$ExpectedScenarios = @(
  "rollback_fixture_namespace_clean_before_run",
  "second_apply_is_idempotent",
  "six_tags_canonicalized_in_place",
  "sixty_five_references_preserved",
  "tag_identity_and_metadata_preserved",
  "transient_unique_swap_succeeds"
)
$ActualScenarios = @([regex]::Matches($PositiveText, '(?m)^"?([a-z0-9_]+)"?,t,') |
  ForEach-Object { $_.Groups[1].Value } | Sort-Object)
if ($ActualScenarios.Count -ne 6 -or
    (($ActualScenarios -join "`n") -cne (($ExpectedScenarios | Sort-Object) -join "`n"))) {
  throw "Positive matrix did not emit the exact six passing scenarios"
}
if ([regex]::Matches($PositiveText, '(?m)^ROLLBACK\r?$').Count -ne 1) {
  throw "Positive matrix did not end in exactly one ROLLBACK"
}
Assert-ResidueZero "positive-matrix-residue"

Invoke-PsqlCapture "collision-rejection" @(
  "-X", "--dbname=$DisposableDbUrl", "--set=ON_ERROR_STOP=1",
  "--set=wouldkeep_p1b_20260722000150_collision_disposable=true",
  "--file=supabase/tests/20260722_tag_normalization_collision.sql"
) 3 "canonical tag names would collide inside a knowledge base"
Assert-ResidueZero "collision-rejection-residue"

Invoke-PsqlCapture "invalid-rejection" @(
  "-X", "--dbname=$DisposableDbUrl", "--set=ON_ERROR_STOP=1",
  "--set=wouldkeep_p1b_20260722000150_invalid_disposable=true",
  "--file=supabase/tests/20260722_tag_normalization_invalid.sql"
) 3 "a tag cannot be represented by the v1 canonical contract"
Assert-ResidueZero "invalid-rejection-residue"

$GateMatrixOutput = @(& pwsh -NoProfile -File `
  "supabase/tests/20260722_tag_write_pause_disposable.ps1" `
  -DisposableDbUrl $DisposableDbUrl `
  -Confirmation "I_UNDERSTAND_THIS_IS_A_THROWAWAY_LOOPBACK_DATABASE" `
  -EvidenceDirectory $GateEvidenceDir `
  -Psql $Psql 2>&1)
$GateMatrixExit = $LASTEXITCODE
Write-CandidateEvidence "tag-write-pause-disposable-matrix.txt" $GateMatrixOutput
if ($GateMatrixExit -ne 0 -or
    [regex]::Matches(
      ($GateMatrixOutput -join "`n"),
      'tag_write_pause_disposable_matrix_passed'
    ).Count -ne 1) {
  throw "Tag-write pause disposable matrix did not pass exactly once"
}
```

Also replay every migration through `00150` on a fresh empty disposable database. The migration must apply successfully with zero tags and zero writes. Preserve only credential-free aggregate evidence outside the repository.

## 2. Production backup and read-only preflight

Section 2 requires separately written authorization and must run in one uninterrupted PowerShell 7 session. If the session stops, restart section 2 in a new evidence directory.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$SupabaseCommand = "supabase"
$ApprovedSha = "<approved-full-git-sha>"
$ApprovedProjectRef = "<approved-project-ref>"
$EvidenceRoot = "<absolute-protected-path-outside-repository>"
$ExpectedMigrationFile = "20260722000150_normalize_existing_tags_for_atomic_save.sql"
$CreationBase = "19571ca19dabc80aeacac7a1ac016667dcaa9f0f"
$ExpectedRemotePre = @(
  "20260712", "20260714", "20260715", "20260716", "20260717",
  "20260718000100", "20260718000200", "20260718000300",
  "20260718000400", "20260718000500", "20260718000600",
  "20260718000700", "20260718000800", "20260718000900",
  "20260718001000", "20260718001100", "20260718001200",
  "20260721000100", "20260722000100"
)
$ExpectedLocalPre = @($ExpectedRemotePre + "20260722000150")

function Write-Evidence([string]$Name, [object[]]$Value) {
  $Path = Join-Path $script:EvidenceDir $Name
  $Value | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -le 0) {
    throw "Required evidence is missing or empty: $Name"
  }
}

function Invoke-Capture([string]$Name, [string[]]$Arguments) {
  Assert-ApprovedSnapshot
  $Output = @(& $script:Supabase @Arguments "--workdir" $script:ApprovedWorkdir 2>&1)
  $Exit = $LASTEXITCODE
  Write-Evidence "$Name.txt" $Output
  Assert-ApprovedSnapshot
  if ($Exit -ne 0) { throw "Supabase command failed: $Name" }
  return $Output
}

function Assert-Identity {
  $Branch = @(git branch --show-current 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Branch.Count -ne 1 -or
      $Branch[0].Trim() -cne "release/p1b-00150-tag-write-pause-gate") {
    throw "Release branch mismatch"
  }
  $Sha = @(git rev-parse HEAD 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Sha.Count -ne 1 -or $Sha[0].Trim() -cne $ApprovedSha) {
    throw "Approved SHA mismatch"
  }
  $MergeBase = @(git merge-base HEAD $CreationBase 2>&1)
  if ($LASTEXITCODE -ne 0 -or $MergeBase.Count -ne 1 -or
      $MergeBase[0].Trim() -cne $CreationBase) {
    throw "Creation-base ancestry mismatch"
  }
  $Status = @(git status --porcelain 2>&1)
  if ($LASTEXITCODE -ne 0 -or ($Status -join "`n").Length -ne 0) {
    throw "Production worktree is not clean"
  }
  $Cli = @(& $script:Supabase --version 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Cli.Count -ne 1 -or $Cli[0].Trim() -cne "2.109.1") {
    throw "Supabase CLI version mismatch"
  }
  $RefPath = Join-Path $script:RepositoryRoot "supabase/.temp/project-ref"
  $Ref = (Get-Content -LiteralPath $RefPath -Raw -ErrorAction Stop).Trim()
  if ($Ref -cne $ApprovedProjectRef) { throw "Linked project ref mismatch" }
  return [pscustomobject]@{
    Branch = $Branch[0].Trim(); Sha = $Sha[0].Trim(); Cli = $Cli[0].Trim(); Ref = $Ref
  }
}

function Assert-IdentityMatchesInitial([string]$Label) {
  $Actual = Assert-Identity
  $Expected = $script:InitialIdentity
  if ($Actual.Branch -cne $Expected.Branch -or $Actual.Sha -cne $Expected.Sha -or
      $Actual.Cli -cne $Expected.Cli -or $Actual.Ref -cne $Expected.Ref) {
    throw "$Label source identity changed"
  }
}

function Assert-ApprovedSnapshot {
  if ((Get-FileHash -LiteralPath $script:Supabase -Algorithm SHA256 -ErrorAction Stop).Hash -cne
      $script:SupabaseHash) {
    throw "Pinned Supabase executable changed"
  }
  foreach ($Entry in $script:SnapshotHashes.GetEnumerator()) {
    $Path = Join-Path $script:ApprovedWorkdir $Entry.Key
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash -cne
          $Entry.Value) {
      throw "Approved snapshot input changed: $($Entry.Key)"
    }
  }
  $CurrentMigrations = @(Get-ChildItem -LiteralPath (
      Join-Path $script:ApprovedWorkdir "supabase/migrations"
    ) -Filter "*.sql" -File -Recurse -ErrorAction Stop | ForEach-Object {
      [IO.Path]::GetRelativePath($script:ApprovedWorkdir, $_.FullName).Replace('\', '/')
    } | Sort-Object)
  if (($CurrentMigrations -join "`n") -cne
      ($script:ExpectedSnapshotMigrations -join "`n")) {
    throw "Approved snapshot migration set changed"
  }
  $PinnedRef = (Get-Content -LiteralPath $script:ApprovedProjectRefFile -Raw -ErrorAction Stop).Trim()
  if ($PinnedRef -cne $ApprovedProjectRef) {
    throw "Approved snapshot project ref changed"
  }
}

function Assert-Sentinel([object[]]$Output, [string]$Sentinel) {
  $Text = $Output -join "`n"
  if ([regex]::Matches($Text, [regex]::Escape($Sentinel)).Count -ne 1) {
    throw "Sentinel missing or repeated: $Sentinel"
  }
}

function Get-MigrationVersions([object[]]$Output) {
  $JsonLines = @($Output | ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_.StartsWith('{') -and $_.EndsWith('}') })
  if ($JsonLines.Count -ne 1) { throw "Migration-list JSON missing or repeated" }
  $Parsed = $JsonLines[0] | ConvertFrom-Json -Depth 20 -ErrorAction Stop
  if ($Parsed.message -cne "Migrations listed" -or $null -eq $Parsed.migrations) {
    throw "Migration-list JSON root contract changed"
  }
  $Local = @($Parsed.migrations |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_.local) } |
    ForEach-Object { [string]$_.local })
  $Remote = @($Parsed.migrations |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_.remote) } |
    ForEach-Object { [string]$_.remote })
  return [pscustomobject]@{ Local = $Local; Remote = $Remote }
}

function Assert-ExactVersions([string[]]$Actual, [string[]]$Expected, [string]$Label) {
  $A = @($Actual | Sort-Object)
  $E = @($Expected | Sort-Object)
  if ($A.Count -ne $E.Count -or (($A -join "`n") -cne ($E -join "`n"))) {
    throw "$Label migration ledger mismatch"
  }
}

function Assert-PreMigrationList([object[]]$Output, [string]$Label) {
  $Versions = Get-MigrationVersions $Output
  Assert-ExactVersions $Versions.Local $ExpectedLocalPre "$Label local"
  Assert-ExactVersions $Versions.Remote $ExpectedRemotePre "$Label remote"
}

function Assert-OnlyTargetPending([object[]]$Output) {
  $Text = $Output -join "`n"
  $Files = @([regex]::Matches($Text, '\b\d{8}(?:\d{6})?_[A-Za-z0-9_]+\.sql\b') |
    ForEach-Object Value | Sort-Object -Unique)
  $Versions = @([regex]::Matches($Text, '(?<!\d)\d{14}(?!\d)') |
    ForEach-Object Value | Sort-Object -Unique)
  if ($Files.Count -ne 1 -or $Files[0] -cne $ExpectedMigrationFile -or
      $Versions.Count -ne 1 -or $Versions[0] -cne "20260722000150") {
    throw "Dry-run is not exactly the approved 00150 migration"
  }
}

function Get-TagState([object[]]$Output) {
  $Pattern = 'tag_normalization_state\|tags=(\d+)\|refs=(\d+)\|candidates=(\d+)\|affected_refs=(\d+)\|immutable=([0-9a-f]{64})\|document_tags=([0-9a-f]{64})\|actual=([0-9a-f]{64})\|projected=([0-9a-f]{64})'
  $Matches = @([regex]::Matches(($Output -join "`n"), $Pattern))
  if ($Matches.Count -ne 1) { throw "Aggregate tag-state row missing or repeated" }
  $M = $Matches[0]
  return [pscustomobject]@{
    Tags = [int64]$M.Groups[1].Value
    Refs = [int64]$M.Groups[2].Value
    Candidates = [int64]$M.Groups[3].Value
    AffectedRefs = [int64]$M.Groups[4].Value
    Immutable = $M.Groups[5].Value
    DocumentTags = $M.Groups[6].Value
    Actual = $M.Groups[7].Value
    Projected = $M.Groups[8].Value
  }
}

function Assert-PreTagState([object]$State) {
  if ($State.Tags -ne 462 -or $State.Candidates -ne 6 -or $State.AffectedRefs -ne 65 -or
      $State.Actual -ceq $State.Projected) {
    throw "Reviewed 462/6/65 pre-state contract changed"
  }
}

function Assert-DumpArtifact([string]$Path, [string[]]$Patterns, [string]$Label) {
  if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -le 0) {
    throw "$Label backup is empty"
  }
  foreach ($Pattern in $Patterns) {
    if (-not (Select-String -LiteralPath $Path -Pattern $Pattern -Quiet -ErrorAction Stop)) {
      throw "$Label backup is missing marker: $Pattern"
    }
  }
}

function Get-GateState([object[]]$Output) {
  $Pattern = 'tag_write_pause_state\|gate=(absent|active)\|catalog=([0-9a-f]{64})\|acl=([0-9a-f]{64})\|rls_policies=([0-9a-f]{64})\|nongate_triggers=([0-9a-f]{64})\|schema_oid=(\d+)\|function_oid=(\d+)\|tags_trigger_oid=(\d+)\|document_tags_trigger_oid=(\d+)'
  $Matches = @([regex]::Matches(($Output -join "`n"), $Pattern))
  if ($Matches.Count -ne 1) { throw "Gate state row missing or repeated" }
  $M = $Matches[0]
  return [pscustomobject]@{
    Gate = $M.Groups[1].Value
    Baseline = ($M.Groups[2].Value, $M.Groups[3].Value,
      $M.Groups[4].Value, $M.Groups[5].Value) -join "|"
    SchemaOid = [uint32]$M.Groups[6].Value
    FunctionOid = [uint32]$M.Groups[7].Value
    TagsTriggerOid = [uint32]$M.Groups[8].Value
    DocumentTagsTriggerOid = [uint32]$M.Groups[9].Value
    Line = $M.Value
  }
}

function Assert-GateAbsent([object]$Gate, [string]$Label) {
  if ($Gate.Gate -cne "absent" -or $Gate.SchemaOid -ne 0 -or
      $Gate.FunctionOid -ne 0 -or $Gate.TagsTriggerOid -ne 0 -or
      $Gate.DocumentTagsTriggerOid -ne 0) {
    throw "$Label did not prove the exact absent gate state"
  }
}

function Assert-GateActive([object]$Gate, [string]$Label) {
  if ($Gate.Gate -cne "active" -or $Gate.SchemaOid -eq 0 -or
      $Gate.FunctionOid -eq 0 -or $Gate.TagsTriggerOid -eq 0 -or
      $Gate.DocumentTagsTriggerOid -eq 0) {
    throw "$Label did not prove the exact active gate state"
  }
  if ($Gate.Baseline -cne $script:InitialGate.Baseline) {
    throw "$Label changed the protected table catalog baseline"
  }
}

function Assert-GateActiveAtCheckpoint([string]$Label) {
  $Output = Invoke-Capture "gate-state-$Label" @(
    "db", "query", "--linked", "--file",
    $script:GateStateFile,
    "--agent", "no", "--output-format", "text"
  )
  $Gate = Get-GateState $Output
  Assert-GateActive $Gate $Label
}

function Assert-ReleasedMatchesInitial([object[]]$Output) {
  $Released = Get-GateState $Output
  Assert-GateAbsent $Released "Released state"
  if (-not [StringComparer]::Ordinal.Equals($Released.Line, $script:InitialGate.Line)) {
    throw "Released gate/catalog state differs from the exact initial baseline"
  }
}

$RootOutput = @(git rev-parse --show-toplevel 2>&1)
if ($LASTEXITCODE -ne 0 -or $RootOutput.Count -ne 1) { throw "Cannot resolve repository root" }
$RepositoryRoot = [IO.Path]::GetFullPath($RootOutput[0].Trim())
$script:RepositoryRoot = $RepositoryRoot
$EvidenceFull = [IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceFull.StartsWith($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Evidence root must remain outside the repository"
}
$EvidenceDir = Join-Path $EvidenceFull (
  "p1b-tag-normalization-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
)
New-Item -ItemType Directory -Path $EvidenceDir -ErrorAction Stop | Out-Null
$script:EvidenceDir = $EvidenceDir
$ResolvedSupabase = Get-Command $SupabaseCommand -CommandType Application -ErrorAction Stop
$SupabaseSource = [IO.Path]::GetFullPath($ResolvedSupabase.Source)
$SupabaseSourceHash = (Get-FileHash -LiteralPath $SupabaseSource -Algorithm SHA256).Hash
$ApprovedSupabase = Join-Path $EvidenceDir "supabase-2.109.1.exe"
Copy-Item -LiteralPath $SupabaseSource -Destination $ApprovedSupabase -ErrorAction Stop
$script:Supabase = $ApprovedSupabase
$script:SupabaseHash = (Get-FileHash -LiteralPath $script:Supabase -Algorithm SHA256).Hash
if ($script:SupabaseHash -cne $SupabaseSourceHash) {
  throw "Pinned Supabase executable copy mismatch"
}

$Identity = Assert-Identity
$script:InitialIdentity = $Identity
Write-Evidence "git-sha.txt" @($Identity.Sha)
Write-Evidence "supabase-version.txt" @($Identity.Cli)
Write-Evidence "project-ref.txt" @($Identity.Ref)
Write-Evidence "supabase-cli-sha256.txt" @($script:SupabaseHash)
Write-Evidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

# Materialize the reviewed Git object, not the mutable worktree. Every linked
# command below is forced through this pinned workdir and every used file is
# re-hashed before and after each call. The protected copy remains usable for
# exact state/disable recovery even if the source worktree changes mid-window.
$ApprovedArchive = Join-Path $EvidenceDir "approved-supabase.zip"
$ApprovedWorkdir = Join-Path $EvidenceDir "approved-workdir"
& git archive --format=zip "--output=$ApprovedArchive" $ApprovedSha supabase
if ($LASTEXITCODE -ne 0 -or
    (Get-Item -LiteralPath $ApprovedArchive -ErrorAction Stop).Length -le 0) {
  throw "Could not materialize the approved Supabase tree"
}
Expand-Archive -LiteralPath $ApprovedArchive -DestinationPath $ApprovedWorkdir -ErrorAction Stop
$ApprovedTempDir = Join-Path $ApprovedWorkdir "supabase/.temp"
New-Item -ItemType Directory -Path $ApprovedTempDir -ErrorAction Stop | Out-Null
$ApprovedProjectRefFile = Join-Path $ApprovedTempDir "project-ref"
Set-Content -LiteralPath $ApprovedProjectRefFile -Value $ApprovedProjectRef `
  -Encoding ascii -NoNewline -ErrorAction Stop

$script:ApprovedWorkdir = $ApprovedWorkdir
$script:ApprovedProjectRefFile = $ApprovedProjectRefFile
$script:SnapshotHashes = [ordered]@{}
$SnapshotFiles = @(Get-ChildItem -LiteralPath (Join-Path $ApprovedWorkdir "supabase") `
  -File -Recurse -ErrorAction Stop | Where-Object {
    $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).temp$([IO.Path]::DirectorySeparatorChar)*" -or
      $_.FullName -ceq $ApprovedProjectRefFile
  })
foreach ($File in $SnapshotFiles) {
  $Relative = [IO.Path]::GetRelativePath($ApprovedWorkdir, $File.FullName).Replace('\', '/')
  $script:SnapshotHashes[$Relative] = (
    Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256 -ErrorAction Stop
  ).Hash
}
$script:ExpectedSnapshotMigrations = @($script:SnapshotHashes.Keys |
  Where-Object { $_ -like "supabase/migrations/*.sql" } | Sort-Object)
if ($script:ExpectedSnapshotMigrations.Count -ne $ExpectedLocalPre.Count) {
  throw "Approved snapshot migration count is not exact"
}
Write-Evidence "approved-inputs-sha256.txt" @($script:SnapshotHashes.GetEnumerator() |
  Sort-Object Key | ForEach-Object { "$($_.Value) $($_.Key)" })
Write-Evidence "approved-archive-sha256.txt" @((
  Get-FileHash -LiteralPath $ApprovedArchive -Algorithm SHA256 -ErrorAction Stop
).Hash)

$script:GateEnableFile = Join-Path $ApprovedWorkdir `
  "supabase/operations/20260722_tag_write_pause_enable.sql"
$script:GateDisableFile = Join-Path $ApprovedWorkdir `
  "supabase/operations/20260722_tag_write_pause_disable.sql"
$script:GateStateFile = Join-Path $ApprovedWorkdir `
  "supabase/tests/20260722_tag_write_pause_state.sql"
$script:GateBehaviorFile = Join-Path $ApprovedWorkdir `
  "supabase/tests/20260722_tag_write_pause_behavior.sql"
$script:ActivityFile = Join-Path $ApprovedWorkdir `
  "supabase/tests/20260722_tag_normalization_activity_gate.sql"
$script:PreflightFile = Join-Path $ApprovedWorkdir `
  "supabase/tests/20260722_tag_normalization_preflight.sql"
$script:TagStateFile = Join-Path $ApprovedWorkdir `
  "supabase/tests/20260722_tag_normalization_state_fingerprint.sql"

Assert-IdentityMatchesInitial "after-approved-snapshot"
Assert-ApprovedSnapshot

$GateInitialOutput = Invoke-Capture "gate-state-initial" @(
  "db", "query", "--linked", "--file",
  $script:GateStateFile,
  "--agent", "no", "--output-format", "text"
)
$script:InitialGate = Get-GateState $GateInitialOutput
Assert-GateAbsent $script:InitialGate "Initial state"

$SchemaBackup = Join-Path $EvidenceDir "public-schema.sql"
$DataBackup = Join-Path $EvidenceDir "public-data.sql"
$LedgerBackup = Join-Path $EvidenceDir "migration-ledger-data.sql"
$GateEnableAttempted = $false
$GateConfirmedActive = $false
try {
  Assert-IdentityMatchesInitial "before-enable"
  Assert-ApprovedSnapshot
  $GateEnableAttempted = $true
  $GateEnable = Invoke-Capture "gate-enable" @(
    "db", "query", "--linked", "--file",
    $script:GateEnableFile,
    "--agent", "no", "--output-format", "text"
  )
  Assert-Sentinel $GateEnable "tag_write_pause_enabled"
  Assert-GateActiveAtCheckpoint "after-enable"
  $GateConfirmedActive = $true

  Assert-GateActiveAtCheckpoint "before-behavior"
  $GateBehavior = Invoke-Capture "gate-behavior" @(
    "db", "query", "--linked", "--file",
    $script:GateBehaviorFile,
    "--agent", "no", "--output-format", "text"
  )
  Assert-Sentinel $GateBehavior "tag_write_pause_behavior_passed"
  Assert-GateActiveAtCheckpoint "after-behavior"

  Assert-GateActiveAtCheckpoint "before-schema-backup"
  $null = Invoke-Capture "schema-backup-command" @(
    "db", "dump", "--linked", "--schema", "public,wouldkeep_maintenance",
    "--file", $SchemaBackup, "--agent", "no", "--output-format", "text"
  )
  Assert-GateActiveAtCheckpoint "after-schema-backup"

  Assert-GateActiveAtCheckpoint "before-data-backup"
  $null = Invoke-Capture "data-backup-command" @(
    "db", "dump", "--linked", "--data-only", "--use-copy", "--schema", "public",
    "--file", $DataBackup, "--agent", "no", "--output-format", "text"
  )
  Assert-GateActiveAtCheckpoint "after-data-backup"

  Assert-GateActiveAtCheckpoint "before-ledger-backup"
  $null = Invoke-Capture "ledger-backup-command" @(
    "db", "dump", "--linked", "--data-only", "--use-copy", "--schema", "supabase_migrations",
    "--file", $LedgerBackup, "--agent", "no", "--output-format", "text"
  )
  Assert-GateActiveAtCheckpoint "after-ledger-backup"

  $BackupFiles = @($SchemaBackup, $DataBackup, $LedgerBackup)
  if ($BackupFiles.Count -ne 3) { throw "Exactly three backups are required" }
  Assert-DumpArtifact $SchemaBackup @(
    '(?i)^\s*CREATE SCHEMA\s+(?:"wouldkeep_maintenance"|wouldkeep_maintenance)\s*;',
    '(?i)^\s*CREATE FUNCTION\s+(?:"wouldkeep_maintenance"|wouldkeep_maintenance)\.(?:"reject_tag_write_while_paused"|reject_tag_write_while_paused)\s*\(',
    '(?i)^\s*CREATE TRIGGER\s+(?:"wouldkeep_tags_write_pause"|wouldkeep_tags_write_pause)\b',
    '(?i)^\s*CREATE TRIGGER\s+(?:"wouldkeep_document_tags_write_pause"|wouldkeep_document_tags_write_pause)\b',
    '(?i)^\s*ALTER TABLE(?: ONLY)?\s+(?:"public"|public)\.(?:"tags"|tags)\s+ENABLE ALWAYS TRIGGER\s+(?:"wouldkeep_tags_write_pause"|wouldkeep_tags_write_pause)\s*;',
    '(?i)^\s*ALTER TABLE(?: ONLY)?\s+(?:"public"|public)\.(?:"document_tags"|document_tags)\s+ENABLE ALWAYS TRIGGER\s+(?:"wouldkeep_document_tags_write_pause"|wouldkeep_document_tags_write_pause)\s*;',
    '(?i)^\s*CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"public"|public)\.(?:"tags"|tags)\s*\('
  ) "Public plus active-maintenance schema"
  Assert-DumpArtifact $DataBackup @(
    '(?i)^\s*COPY\s+(?:"public"|public)\.(?:"tags"|tags)\s*\(',
    '(?i)^\s*COPY\s+(?:"public"|public)\.(?:"document_tags"|document_tags)\s*\('
  ) "Public data"
  Assert-DumpArtifact $LedgerBackup @(
    '(?i)^\s*COPY\s+(?:"supabase_migrations"|supabase_migrations)\.(?:"schema_migrations"|schema_migrations)\s*\(',
    '20260722000100'
  ) "Migration ledger"
  $BackupHashes = @($BackupFiles | ForEach-Object { Get-FileHash $_ -Algorithm SHA256 })
  if ($BackupHashes.Count -ne 3 -or
      @($BackupHashes | Where-Object { $_.Hash -notmatch '^[A-F0-9]{64}$' }).Count -ne 0) {
    throw "Exactly three valid SHA-256 backup hashes are required"
  }
  Write-Evidence "sha256.txt" @($BackupHashes | ForEach-Object { "$($_.Hash) $($_.Path)" })

  Assert-GateActiveAtCheckpoint "before-migration-list"
  $MigrationListInitial = Invoke-Capture "migration-list-initial" @(
    "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
  )
  Assert-PreMigrationList $MigrationListInitial "Initial"
  Assert-GateActiveAtCheckpoint "after-migration-list"

  Assert-GateActiveAtCheckpoint "before-dry-run"
  $DryRunInitial = Invoke-Capture "dry-run-initial" @(
    "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
  )
  Assert-OnlyTargetPending $DryRunInitial
  Assert-GateActiveAtCheckpoint "after-dry-run"

  Assert-GateActiveAtCheckpoint "before-activity"
  $ActivityInitial = Invoke-Capture "activity-initial" @(
    "db", "query", "--linked", "--file",
    $script:ActivityFile,
    "--agent", "no", "--output-format", "text"
  )
  Assert-Sentinel $ActivityInitial "tag_normalization_activity_gate_passed"
  Assert-GateActiveAtCheckpoint "after-activity"

  Assert-GateActiveAtCheckpoint "before-preflight"
  $PreflightInitial = Invoke-Capture "preflight-initial" @(
    "db", "query", "--linked", "--file",
    $script:PreflightFile,
    "--agent", "no", "--output-format", "text"
  )
  Assert-Sentinel $PreflightInitial "tag_normalization_preflight_passed"
  Assert-GateActiveAtCheckpoint "after-preflight"

  Assert-GateActiveAtCheckpoint "before-state"
  $StateInitial = Invoke-Capture "state-initial" @(
    "db", "query", "--linked", "--file",
    $script:TagStateFile,
    "--agent", "no", "--output-format", "text"
  )
  $ApprovedState = Get-TagState $StateInitial
  Assert-PreTagState $ApprovedState
  Assert-GateActiveAtCheckpoint "after-state"
  Write-Evidence "approved-state.txt" @(
    "tags=$($ApprovedState.Tags)", "refs=$($ApprovedState.Refs)",
    "candidates=$($ApprovedState.Candidates)", "affected_refs=$($ApprovedState.AffectedRefs)",
    "immutable=$($ApprovedState.Immutable)", "document_tags=$($ApprovedState.DocumentTags)",
    "actual=$($ApprovedState.Actual)", "projected=$($ApprovedState.Projected)"
  )
}
finally {
  if ($GateEnableAttempted) {
    # If this state query fails, do not guess or weaken the disable contract: the
    # pause may still be active and all migration work must stop for review.
    $BeforeReleaseOutput = Invoke-Capture "gate-state-before-release" @(
      "db", "query", "--linked", "--file",
      $script:GateStateFile,
      "--agent", "no", "--output-format", "text"
    )
    $BeforeRelease = Get-GateState $BeforeReleaseOutput
    if ($BeforeRelease.Gate -ceq "active") {
      Assert-GateActive $BeforeRelease "Before release"
      $GateDisable = Invoke-Capture "gate-disable" @(
        "db", "query", "--linked", "--file",
        $script:GateDisableFile,
        "--agent", "no", "--output-format", "text"
      )
      Assert-Sentinel $GateDisable "tag_write_pause_disabled"
    } elseif ($GateConfirmedActive) {
      throw "A confirmed active gate disappeared before reviewed release"
    }

    $ReleasedOutput = Invoke-Capture "gate-state-released" @(
      "db", "query", "--linked", "--file",
      $script:GateStateFile,
      "--agent", "no", "--output-format", "text"
    )
    Assert-ReleasedMatchesInitial $ReleasedOutput
  }
}

Write-Evidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))
$RequiredEvidence = @(
  "git-sha.txt", "supabase-version.txt", "supabase-cli-sha256.txt", "project-ref.txt",
  "supabase-2.109.1.exe", "approved-supabase.zip", "approved-archive-sha256.txt",
  "approved-inputs-sha256.txt",
  "started-utc.txt",
  "gate-state-initial.txt", "gate-enable.txt", "gate-state-after-enable.txt",
  "gate-state-before-behavior.txt", "gate-behavior.txt", "gate-state-after-behavior.txt",
  "gate-state-before-schema-backup.txt", "schema-backup-command.txt", "public-schema.sql",
  "gate-state-after-schema-backup.txt", "gate-state-before-data-backup.txt",
  "data-backup-command.txt", "public-data.sql", "gate-state-after-data-backup.txt",
  "gate-state-before-ledger-backup.txt", "ledger-backup-command.txt",
  "migration-ledger-data.sql", "gate-state-after-ledger-backup.txt",
  "sha256.txt", "gate-state-before-migration-list.txt", "migration-list-initial.txt",
  "gate-state-after-migration-list.txt", "gate-state-before-dry-run.txt", "dry-run-initial.txt",
  "gate-state-after-dry-run.txt", "gate-state-before-activity.txt", "activity-initial.txt",
  "gate-state-after-activity.txt", "gate-state-before-preflight.txt", "preflight-initial.txt",
  "gate-state-after-preflight.txt", "gate-state-before-state.txt", "state-initial.txt",
  "approved-state.txt", "gate-state-after-state.txt", "gate-state-before-release.txt",
  "gate-disable.txt", "gate-state-released.txt", "completed-utc.txt"
)
foreach ($EvidenceName in $RequiredEvidence) {
  if ((Get-Item (Join-Path $EvidenceDir $EvidenceName) -ErrorAction Stop).Length -le 0) {
    throw "Required evidence is missing or empty: $EvidenceName"
  }
}
```

Stop here unless a fresh written authorization separately names production deployment of only `20260722000150`.

The schema backup is deliberately self-contained: it covers both `public` and the active `wouldkeep_maintenance` dependency. It is **not a turnkey restore procedure**. Restoring the schema also restores both ALWAYS triggers, so a following public-data `COPY` would be rejected with SQLSTATE `55000`. Any disaster recovery therefore requires a separately reviewed and authorized restore artifact that first stops application and API writes outside PostgreSQL, defines the exact gate-removal/data-load order, and validates the restored schema and data semantically. Never compare restored-object OIDs with the source database's initial state. The byte-for-byte released-state comparison in section 2 applies only to normal enable/disable on the same database.

Section 2 must restart in a fresh evidence directory after any session interruption. If active-state verification or disable/released-state verification fails, stop with tag writes treated as paused; do not continue to section 3 and do not issue hand-written DDL.

## 3. Production deployment is closed in this artifact

There is intentionally no executable production migration or postflight command here. The hard pause rejects `00150`'s `UPDATE public.tags` with SQLSTATE `55000`; section 2 then restores normal writes after the authorized backup and read-only preflight. Therefore a later operator must not append a push command to this session or reuse its evidence.

Production deployment requires a new review and fresh authorization for a design that preserves a continuous write exclusion while allowing only the exact migration statement—for example, a precisely scoped operator exception or a single reviewed transaction. That future artifact must repeat fresh backup/preflight evidence, define failure recovery, prove the exact 20-version ledger and zero pending state, and add postflight separately. Until then, Dashboard SQL, a linked CLI push, migration-ledger repair, and manual trigger changes are forbidden.

## Recovery

NFKC normalization is intentionally one-way. Before the write, recovery is to stop. After an unambiguous committed write with a failed postflight, preserve all evidence and backups, stop application rollout, and prepare a separately reviewed forward fix or disaster-recovery artifact. The three dumps are inputs to that review, not an executable restore sequence. Never guess original Unicode spellings or merge/delete tags.
