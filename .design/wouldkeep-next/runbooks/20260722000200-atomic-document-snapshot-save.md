# 20260722000200 atomic document snapshot save

Validated Supabase CLI: `2.109.1`. This runbook deploys exactly
`20260722000200_atomic_document_snapshot_save.sql`. It does not authorize deployment;
the operator must have a fresh written production authorization naming this version.

Stop before any write if the approved main SHA, linked project ref, CLI version, clean
worktree, three backups, activity gate, preflight, state fingerprint, 20-row remote
ledger, or single pending migration check differs. Never use `--include-all`, SQL
Editor, `migration repair`, a second push, or a production rollback matrix.

## 1. Disposable candidate proof

Use two explicitly disposable loopback PostgreSQL databases. The chain database must be
at the exact 19-row `20260722000100` baseline; it proves the rollback-only sequence
`19 -> 00150 -> 20 -> 00200 -> 21`. The candidate database must already be at the exact
20-row `20260722000150` baseline; it runs the exact `00200` preflight, migration,
contract, and behavior matrix. Omitting either unique confirmation variable must fail
with psql exit code `3`; the residue probe must pass after every rollback-only run.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$Psql = "psql"
$ChainDbUrl = "<postgresql://...@127.0.0.1:port/chain>"
$DisposableDbUrl = "<postgresql://...@127.0.0.1:port/postgres>"

function Assert-LoopbackPostgresUrl([string]$Url) {
  try { $Uri = [Uri]$Url } catch { throw "Disposable database URL is invalid" }
  if ($Uri.Scheme -notin @("postgres", "postgresql")) {
    throw "Disposable database URL must use postgres or postgresql"
  }
  if ($Uri.Host -ieq "localhost") { return }
  $Address = $null
  $HostText = $Uri.Host.Trim([char[]]"[]")
  if (-not [Net.IPAddress]::TryParse($HostText, [ref]$Address) -or
      -not [Net.IPAddress]::IsLoopback($Address)) {
    throw "Refusing a non-loopback disposable database target"
  }
}

Assert-LoopbackPostgresUrl $ChainDbUrl
Assert-LoopbackPostgresUrl $DisposableDbUrl

# The chain proof includes both exact migrations, their production-safe 00200
# preflight/contract, synthetic tag normalization, and transaction-scoped ledger
# bookkeeping. It must roll back to the untouched 19-row baseline.
& $Psql -X --dbname=$ChainDbUrl `
  --file=supabase/tests/20260722_atomic_document_snapshot_migration_chain.sql
$ChainGuardExit = $LASTEXITCODE
if ($ChainGuardExit -ne 3) { throw "Missing chain confirmation did not fail closed" }
& $Psql -X --dbname=$ChainDbUrl --set=ON_ERROR_STOP=1 `
  --file=supabase/tests/20260722_atomic_document_snapshot_residue.sql
if ($LASTEXITCODE -ne 0) { throw "Chain guard residue probe failed" }

$ChainOutput = @(& $Psql -X --dbname=$ChainDbUrl --set=ON_ERROR_STOP=1 `
  --set=wouldkeep_p1b_20260722000200_chain_disposable=true `
  --file=supabase/tests/20260722_atomic_document_snapshot_migration_chain.sql 2>&1)
$ChainExit = $LASTEXITCODE
if ($ChainExit -ne 0 -or
    [regex]::Matches(($ChainOutput -join "`n"),
      '19,20,21,atomic_document_snapshot_migration_chain_passed').Count -ne 1) {
  throw "Exact 19-to-20-to-21 disposable migration chain failed"
}
& $Psql -X --dbname=$ChainDbUrl --set=ON_ERROR_STOP=1 `
  --file=supabase/tests/20260722_atomic_document_snapshot_residue.sql
if ($LASTEXITCODE -ne 0) { throw "Migration-chain residue probe failed" }

# The second database is independently provisioned at exact ledger 20 after 00150.
# This keeps the full 00200 behavior matrix available after the chain proof rolls back.

$CandidateOutput = @(& $Psql -X --single-transaction --dbname=$DisposableDbUrl `
  --set=ON_ERROR_STOP=1 `
  --file=supabase/tests/20260722_atomic_document_snapshot_preflight.sql `
  --file=supabase/migrations/20260722000200_atomic_document_snapshot_save.sql `
  --command="INSERT INTO supabase_migrations.schema_migrations (version, statements, name) VALUES ('20260722000200', ARRAY['disposable candidate bookkeeping']::TEXT[], 'atomic_document_snapshot_save');" `
  --file=supabase/tests/20260722_atomic_document_snapshot_contract.sql 2>&1)
$CandidateExit = $LASTEXITCODE
$CandidateText = $CandidateOutput -join "`n"
if ($CandidateExit -ne 0 -or
    [regex]::Matches($CandidateText, 'atomic_save_preflight_passed').Count -ne 1 -or
    [regex]::Matches($CandidateText, 'atomic_document_snapshot_contract_passed').Count -ne 1) {
  throw "Single-transaction disposable 00200 candidate proof failed"
}

& $Psql -X --dbname=$DisposableDbUrl `
  --file=supabase/tests/20260722_atomic_document_snapshot_save.sql
$GuardExit = $LASTEXITCODE
if ($GuardExit -ne 3) { throw "Missing-confirmation guard did not fail closed" }
& $Psql -X --dbname=$DisposableDbUrl --set=ON_ERROR_STOP=1 `
  --file=supabase/tests/20260722_atomic_document_snapshot_residue.sql
if ($LASTEXITCODE -ne 0) { throw "Guard residue probe failed" }

& $Psql -X --dbname=$DisposableDbUrl --set=ON_ERROR_STOP=1 `
  --set=wouldkeep_p1b_20260722000200_disposable=true `
  --file=supabase/tests/20260722_atomic_document_snapshot_save.sql
if ($LASTEXITCODE -ne 0) { throw "Rollback matrix failed" }
& $Psql -X --dbname=$DisposableDbUrl --set=ON_ERROR_STOP=1 `
  --file=supabase/tests/20260722_atomic_document_snapshot_residue.sql
if ($LASTEXITCODE -ne 0) { throw "Rollback residue probe failed" }
```

## 2. Production backup and read-only preflight

Run sections 2-4 in one uninterrupted PowerShell 7 session. Restart from a new evidence
directory if the session stops. The evidence directory must be outside the repository.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Supabase = "supabase"
$ApprovedSha = "<approved-full-main-sha>"
$ApprovedProjectRef = "<approved-project-ref>"
$EvidenceRoot = "<absolute-protected-path-outside-repository>"
$ExpectedMigrationFile = "20260722000200_atomic_document_snapshot_save.sql"
$ExpectedRemotePre = @(
  "20260712", "20260714", "20260715", "20260716", "20260717",
  "20260718000100", "20260718000200", "20260718000300",
  "20260718000400", "20260718000500", "20260718000600",
  "20260718000700", "20260718000800", "20260718000900",
  "20260718001000", "20260718001100", "20260718001200",
  "20260721000100", "20260722000100", "20260722000150"
)
$ExpectedRemotePost = @($ExpectedRemotePre + "20260722000200")

function Write-Evidence([string]$Name, [object[]]$Value) {
  $Path = Join-Path $script:EvidenceDir $Name
  $Value | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -le 0) {
    throw "Required evidence is missing or empty: $Name"
  }
}
function Invoke-Capture([string]$Name, [string[]]$Arguments) {
  $Output = @(& $script:Supabase @Arguments 2>&1)
  $Exit = $LASTEXITCODE
  Write-Evidence "$Name.txt" $Output
  if ($Exit -ne 0) { throw "Supabase command failed: $Name" }
  return $Output
}
function Assert-DumpArtifact([string]$Path, [string[]]$Patterns, [string]$Label) {
  $Item=Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($Item.Length -le 0) { throw "$Label backup is empty" }
  foreach ($Pattern in $Patterns) {
    if (-not (Select-String -LiteralPath $Path -Pattern $Pattern -Quiet)) {
      throw "$Label backup is missing required marker: $Pattern"
    }
  }
}
function Assert-Identity {
  $Sha = @(git rev-parse HEAD 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Sha.Count -ne 1 -or $Sha[0].Trim() -cne $ApprovedSha) {
    throw "Approved main SHA mismatch"
  }
  $Status = @(git status --porcelain 2>&1)
  if ($LASTEXITCODE -ne 0 -or ($Status -join "`n").Length -ne 0) {
    throw "Production worktree is not clean"
  }
  $Cli = @(& $Supabase --version 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Cli.Count -ne 1 -or $Cli[0].Trim() -cne "2.109.1") {
    throw "Supabase CLI version mismatch"
  }
  $Ref = (Get-Content supabase/.temp/project-ref -Raw -ErrorAction Stop).Trim()
  if ($Ref -cne $ApprovedProjectRef) { throw "Linked project ref mismatch" }
  return [pscustomobject]@{ Sha=$Sha[0].Trim(); Cli=$Cli[0].Trim(); Ref=$Ref }
}
function Assert-Sentinel([object[]]$Output, [string]$Sentinel) {
  if (@($Output | Where-Object { $_.ToString().Contains($Sentinel) }).Count -ne 1) {
    throw "Sentinel missing or repeated: $Sentinel"
  }
}
function Get-Fingerprint([object[]]$Output) {
  Assert-Sentinel $Output "atomic_document_snapshot_state_fingerprint_passed"
  $Matches = @([regex]::Matches(($Output -join "`n"), '(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])'))
  if ($Matches.Count -ne 1) { throw "State fingerprint missing or repeated" }
  return $Matches[0].Value
}
function Get-Canonical([object[]]$Output) {
  $Copy = [string[]]::new($Output.Count)
  for ($Index=0; $Index -lt $Output.Count; $Index++) { $Copy[$Index]=$Output[$Index].ToString() }
  [Array]::Sort($Copy, [StringComparer]::Ordinal)
  return $Copy
}
function Get-RemoteVersions([object[]]$Output) {
  $JsonLines=@($Output | ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_.StartsWith('{') -and $_.EndsWith('}') })
  if ($JsonLines.Count -ne 1) { throw "Migration-list JSON missing or repeated" }
  $Parsed=$JsonLines[0] | ConvertFrom-Json -ErrorAction Stop
  return @($Parsed.migrations | Where-Object { -not [string]::IsNullOrWhiteSpace($_.remote) } |
    ForEach-Object { [string]$_.remote })
}
function Assert-ExactVersions([string[]]$Actual, [string[]]$Expected, [string]$Label) {
  if ($Actual.Count -ne $Expected.Count) { throw "$Label migration count mismatch" }
  for ($Index=0; $Index -lt $Expected.Count; $Index++) {
    if (-not [StringComparer]::Ordinal.Equals($Actual[$Index],$Expected[$Index])) {
      throw "$Label migration ledger mismatch"
    }
  }
}
function Assert-SameEvidence([object[]]$Actual, [object[]]$Expected, [string]$Label) {
  $A=Get-Canonical $Actual; $E=Get-Canonical $Expected
  if ($A.Count -ne $E.Count) { throw "$Label output changed after approval" }
  for ($Index=0; $Index -lt $A.Count; $Index++) {
    if (-not [StringComparer]::Ordinal.Equals($A[$Index],$E[$Index])) {
      throw "$Label output changed after approval"
    }
  }
}
function Assert-OnlyTargetPending([object[]]$Output) {
  $Text = $Output -join "`n"
  $Files = @([regex]::Matches($Text, '\b\d{8}(?:\d{6})?_[A-Za-z0-9_]+\.sql\b') |
    ForEach-Object Value | Sort-Object -Unique)
  $Versions = @([regex]::Matches($Text, '(?<!\d)\d{14}(?!\d)') |
    ForEach-Object Value | Sort-Object -Unique)
  if ($Files.Count -ne 1 -or $Files[0] -cne $ExpectedMigrationFile -or
      $Versions.Count -ne 1 -or $Versions[0] -cne "20260722000200") {
    throw "Dry-run is not exactly the approved target migration"
  }
}

$Root=(git rev-parse --show-toplevel).Trim()
$EvidenceFull=[IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceFull.StartsWith([IO.Path]::GetFullPath($Root),[StringComparison]::OrdinalIgnoreCase)) {
  throw "Evidence directory must be outside the repository"
}
$EvidenceDir=Join-Path $EvidenceFull ("p1b-"+(Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"))
New-Item -ItemType Directory -Path $EvidenceDir -ErrorAction Stop | Out-Null
$script:EvidenceDir=$EvidenceDir
$Identity=Assert-Identity
Write-Evidence "git-sha.txt" @($Identity.Sha)
Write-Evidence "supabase-version.txt" @($Identity.Cli)
Write-Evidence "project-ref.txt" @($Identity.Ref)
Write-Evidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

$SchemaBackup=Join-Path $EvidenceDir "public-schema.sql"
$DataBackup=Join-Path $EvidenceDir "public-data.sql"
$LedgerBackup=Join-Path $EvidenceDir "migration-ledger-data.sql"
& $Supabase db dump --linked --schema public --file $SchemaBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Schema backup failed" }
& $Supabase db dump --linked --data-only --use-copy --schema public --file $DataBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Data backup failed" }
& $Supabase db dump --linked --data-only --use-copy --schema supabase_migrations --file $LedgerBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Ledger backup failed" }
$BackupFiles=@($SchemaBackup,$DataBackup,$LedgerBackup)
if ($BackupFiles.Count -ne 3) { throw "Exactly three backups are required" }
Assert-DumpArtifact $SchemaBackup @(
  '(?i)^\s*CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"public"|public)\.(?:"documents"|documents)\s*\('
) "Public schema"
Assert-DumpArtifact $DataBackup @(
  '(?i)^\s*COPY\s+(?:"public"|public)\.(?:"documents"|documents)\s*\('
) "Public data"
Assert-DumpArtifact $LedgerBackup @(
  '(?i)^\s*COPY\s+(?:"supabase_migrations"|supabase_migrations)\.(?:"schema_migrations"|schema_migrations)\s*\(',
  '20260722000100',
  '20260722000150'
) "Migration ledger"
$Hashes=@($BackupFiles | ForEach-Object { Get-FileHash $_ -Algorithm SHA256 })
if ($Hashes.Count -ne 3) { throw "Exactly three backup hashes are required" }
Write-Evidence "sha256.txt" @($Hashes | ForEach-Object { "$($_.Hash) $($_.Path)" })

$MigrationListInitial=Invoke-Capture "migration-list-initial" @("migration","list","--linked","--agent","no","--output-format","json")
Assert-ExactVersions @(Get-RemoteVersions $MigrationListInitial) $ExpectedRemotePre "Initial remote"
$DryRunInitial=Invoke-Capture "dry-run-initial" @("db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text")
Assert-OnlyTargetPending $DryRunInitial
$ActivityInitial=Invoke-Capture "activity-initial" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_activity_gate.sql","--agent","no","--output-format","text")
Assert-Sentinel $ActivityInitial "atomic_document_snapshot_activity_gate_passed"
$PreflightInitial=Invoke-Capture "preflight-initial" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_preflight.sql","--agent","no","--output-format","text")
Assert-Sentinel $PreflightInitial "atomic_save_preflight_passed"
$StateInitial=Invoke-Capture "state-initial" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_state_fingerprint.sql","--agent","no","--output-format","text")
$ApprovedFingerprint=Get-Fingerprint $StateInitial
Write-Evidence "approved-fingerprint.txt" @($ApprovedFingerprint)
```

The preflight ends with one explicit aggregate-only `SELECT` result row. The pinned
CLI's linked Management API channel suppresses `RAISE NOTICE`, so a notice must not be
used as the success sentinel. Any failed assertion aborts the preceding `DO` block
before the result row can be returned.

The preflight SQL itself proves the exact 20/20 unique remote ledger and exact
`20260722000150` predecessor. Stop here until the fresh deployment authorization.

## 3. Single production migration write

Immediately recheck identity and all four gates. They must equal the approved evidence
as ordinal line multisets; the fingerprint must be byte-identical.

```powershell
$ImmediateIdentity=Assert-Identity
if ($ImmediateIdentity.Sha -cne $Identity.Sha -or $ImmediateIdentity.Ref -cne $Identity.Ref -or $ImmediateIdentity.Cli -cne $Identity.Cli) { throw "Identity changed after approval" }
$MigrationListImmediate=Invoke-Capture "migration-list-immediate" @("migration","list","--linked","--agent","no","--output-format","json")
Assert-ExactVersions @(Get-RemoteVersions $MigrationListImmediate) $ExpectedRemotePre "Immediate remote"
Assert-SameEvidence $MigrationListImmediate $MigrationListInitial "Migration list"
$DryRunImmediate=Invoke-Capture "dry-run-immediate" @("db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text")
Assert-OnlyTargetPending $DryRunImmediate; Assert-SameEvidence $DryRunImmediate $DryRunInitial "Dry-run"
$ActivityImmediate=Invoke-Capture "activity-immediate" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_activity_gate.sql","--agent","no","--output-format","text")
Assert-Sentinel $ActivityImmediate "atomic_document_snapshot_activity_gate_passed"; Assert-SameEvidence $ActivityImmediate $ActivityInitial "Activity"
$PreflightImmediate=Invoke-Capture "preflight-immediate" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_preflight.sql","--agent","no","--output-format","text")
Assert-SameEvidence $PreflightImmediate $PreflightInitial "Preflight"
$StateImmediate=Invoke-Capture "state-immediate" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_state_fingerprint.sql","--agent","no","--output-format","text")
Assert-SameEvidence $StateImmediate $StateInitial "State"
if ((Get-Fingerprint $StateImmediate) -cne $ApprovedFingerprint) { throw "State changed after approval" }
$FinalIdentity=Assert-Identity
if ($FinalIdentity.Sha -cne $ApprovedSha -or $FinalIdentity.Ref -cne $ApprovedProjectRef -or $FinalIdentity.Cli -cne "2.109.1") { throw "Final pre-write identity changed" }

$Push=Invoke-Capture "db-push" @("db", "push", "--linked", "--yes", "--agent", "no", "--output-format", "text")
```

The `db-push` command above is the only authorized production write.

## 4. Immediate read-only postflight

```powershell
$Contract=Invoke-Capture "contract" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_contract.sql","--agent","no","--output-format","text")
Assert-Sentinel $Contract "atomic_document_snapshot_contract_passed"
$StatePost=Invoke-Capture "state-post" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_state_fingerprint.sql","--agent","no","--output-format","text")
if ((Get-Fingerprint $StatePost) -cne $ApprovedFingerprint) { throw "Business state changed during deployment" }
$ActivityPost=Invoke-Capture "activity-post" @("db","query","--linked","--file","supabase/tests/20260722_atomic_document_snapshot_activity_gate.sql","--agent","no","--output-format","text")
Assert-Sentinel $ActivityPost "atomic_document_snapshot_activity_gate_passed"
$MigrationListPost=Invoke-Capture "migration-list-post" @("migration","list","--linked","--agent","no","--output-format","json")
Assert-ExactVersions @(Get-RemoteVersions $MigrationListPost) $ExpectedRemotePost "Postflight remote"
$DryRunPost=Invoke-Capture "dry-run-post" @("db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text")
$PostFiles=@([regex]::Matches(($DryRunPost -join "`n"),'\b\d{8}(?:\d{6})?_[A-Za-z0-9_]+\.sql\b'))
if ($PostFiles.Count -ne 0 -or ($DryRunPost -join "`n") -notmatch '(?i)\bup to date\b') { throw "Postflight is not zero pending/up to date" }
Write-Evidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))
```

The contract proves the exact 21/21 unique ledger, target name, four function-body
fingerprints, receipt trigger/constraint fingerprint, owner-only private ACLs, private
schema non-exposure, and composite tag-owner FK. Record the approved SHA, project ref,
CLI, three backup hashes, initial/immediate/post evidence, exact 20 -> 21 ledger result,
single write result, and zero-pending dry-run in `PRODUCTION_SAFETY.md`. Keep raw evidence
outside the repository and never include credentials or database URLs.
