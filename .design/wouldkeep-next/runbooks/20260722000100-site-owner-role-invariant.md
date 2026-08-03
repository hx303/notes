# Runbook: `20260722000100_site_owner_role_invariant`

This runbook makes release A repeatable and fail closed. It is an instruction artifact only. It does not authorize a merge, a production connection, a backup, or a migration deployment.

## Scope and immutable inputs

- Approved migration: `supabase/migrations/20260722000100_site_owner_role_invariant.sql` only.
- Expected pending filename: `20260722000100_site_owner_role_invariant.sql` exactly.
- Production-safe read-only gates:
  - `supabase/tests/20260722_site_owner_role_invariant_activity_gate.sql`
  - `supabase/tests/20260722_site_owner_role_invariant_preflight.sql`
  - `supabase/tests/20260722_site_owner_role_invariant_contract.sql`
  - `supabase/tests/20260722_site_owner_role_invariant_state_fingerprint.sql`
- Disposable-only gates:
  - `supabase/tests/20260722_site_owner_role_invariant.sql`
  - `supabase/tests/20260722_site_owner_role_invariant_residue.sql`
- Validated Supabase CLI: `2.109.1`. A different version requires a fresh help and behavior review before use.

Never place a password, access token, database URL, API key, raw user row, backup, or production command output in the repository. The public-data backup contains private user content and must remain in the separately approved protected backup location.

## Universal stop conditions

Stop without attempting a workaround when any of these is true:

- fresh written authorization for the exact next production operation is absent;
- the approved Git SHA, linked project ref, CLI version, clean worktree, or evidence path cannot be proven;
- any command exits with an unexpected code or any evidence write is empty or fails;
- the linked migration list is not the exact pre-deployment or post-deployment version set defined below;
- a dry-run contains any filename or version other than the single approved migration before deployment;
- a preflight or contract assertion command exits nonzero, or the separate state query does not emit its exact sentinel and exactly one 32-character fingerprint;
- the initial, immediate pre-write, and postflight fingerprints differ;
- a lock, long transaction, schema, ACL, RLS, policy, protected-owner row, or ledger assertion fails;
- the three scoped backup artifacts are missing, empty, structurally incomplete, or do not have exactly three SHA-256 hashes.

Do not use `migration repair`, `--include-all`, Dashboard SQL, temporary SQL hotfixes, or a manually copied migration body. Do not retry after a partial or ambiguous result. Preserve the evidence and stop for review.

## 1. Candidate verification on a disposable database

Run this section from the repository root in one continuous PowerShell 7 session. It must use an explicitly disposable local PostgreSQL URL. It must never use `--linked`, a production pooler URL, or a production direct connection.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

function Assert-LocalPostgresUrl {
  param([Parameter(Mandatory = $true)][string]$Url)

  try {
    $Uri = [Uri]$Url
  } catch {
    throw "Disposable database URL is invalid"
  }

  if ($Uri.Scheme -notin @("postgres", "postgresql")) {
    throw "Disposable database URL must use postgres or postgresql"
  }
  if ($Uri.Host -ieq "localhost") { return }

  $HostText = $Uri.Host.Trim([char[]]"[]")
  $Address = $null
  if (-not [System.Net.IPAddress]::TryParse($HostText, [ref]$Address) -or
      -not [System.Net.IPAddress]::IsLoopback($Address)) {
    throw "Refusing a non-loopback disposable database target"
  }
}

function Write-CandidateEvidence {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][object[]]$Value
  )

  $Path = Join-Path $CandidateEvidenceDir $Name
  $Value | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  $Item = Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($Item.Length -le 0) { throw "Candidate evidence is empty: $Name" }
}

$Psql = "psql"
$DisposableDbUrl = Read-Host "Disposable local PostgreSQL URL"
Assert-LocalPostgresUrl -Url $DisposableDbUrl
$CandidateEvidenceDir = "<absolute-path-outside-repository>"

$CandidateRepositoryRootOutput = @(git rev-parse --show-toplevel 2>&1)
$CandidateRepositoryRootExit = $LASTEXITCODE
if ($CandidateRepositoryRootExit -ne 0 -or $CandidateRepositoryRootOutput.Count -ne 1) {
  throw "Cannot resolve candidate repository root"
}
$CandidateRepositoryPrefix = [IO.Path]::GetFullPath(
  $CandidateRepositoryRootOutput[0].ToString().Trim()
).TrimEnd([char[]]"\/") + [IO.Path]::DirectorySeparatorChar
$CandidateEvidenceFull = [IO.Path]::GetFullPath($CandidateEvidenceDir).TrimEnd([char[]]"\/")
if (($CandidateEvidenceFull + [IO.Path]::DirectorySeparatorChar).StartsWith(
    $CandidateRepositoryPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Candidate evidence directory must be outside the repository"
}
$CandidateEvidenceDir = $CandidateEvidenceFull
New-Item -ItemType Directory -Path $CandidateEvidenceDir -ErrorAction Stop | Out-Null

$CandidateShaOutput = @(git rev-parse HEAD 2>&1)
$CandidateShaExit = $LASTEXITCODE
if ($CandidateShaExit -ne 0 -or $CandidateShaOutput.Count -ne 1) {
  throw "Cannot record candidate SHA"
}
$CandidateSha = $CandidateShaOutput[0].ToString().Trim()

$GitStatusOutput = @(git status --porcelain 2>&1)
$GitStatusExit = $LASTEXITCODE
if ($GitStatusExit -ne 0 -or ($GitStatusOutput -join "`n").Length -ne 0) {
  throw "Candidate worktree is not clean"
}
Write-CandidateEvidence -Name "git-sha.txt" -Value @($CandidateSha)
```

First prove that omitting the unique opt-in fails before `BEGIN`. Exit code `3` is part of the contract. Run the residue probe immediately after that rejection and require its exact zero row before writing evidence:

```powershell
$GuardOutput = @(& $Psql -X --csv --dbname="$DisposableDbUrl" --set=ON_ERROR_STOP=1 --file=supabase/tests/20260722_site_owner_role_invariant.sql 2>&1)
$GuardExit = $LASTEXITCODE
if ($GuardExit -ne 3) { throw "Missing-confirmation guard did not exit exactly 3" }

$GuardResidueOutput = @(& $Psql -X --csv --dbname="$DisposableDbUrl" --set=ON_ERROR_STOP=1 --file=supabase/tests/20260722_site_owner_role_invariant_residue.sql 2>&1)
$GuardResidueExit = $LASTEXITCODE
$GuardResidueText = $GuardResidueOutput -join "`n"
if ($GuardResidueExit -ne 0 -or
    $GuardResidueText -notmatch '(?m)^0,0,0,0,site_owner_role_invariant_rollback_residue_zero\r?$') {
  throw "Missing-confirmation guard left residue or the residue probe failed"
}

Write-CandidateEvidence -Name "missing-confirmation.txt" -Value $GuardOutput
Write-CandidateEvidence -Name "missing-confirmation-residue.txt" -Value $GuardResidueOutput
```

Run the matrix with the unique opt-in. Require the exact eight scenarios, one final rollback sentinel, and a second exact zero-residue row:

```powershell
$ExpectedScenarios = @(
  "anonymous_execute_denied_42501_zero_write",
  "caller_identity_mismatch_denied_zero_write",
  "double_apply_idempotent",
  "non_owner_caller_denied_zero_write",
  "ordinary_member_role_change_preserved",
  "other_site_owner_change_denied_42501_zero_write",
  "rollback_fixture_namespace_clean_before_run",
  "site_owner_self_change_denied_42501_zero_write"
)

$MatrixOutput = @(& $Psql -X --csv --dbname="$DisposableDbUrl" --set=ON_ERROR_STOP=1 --set=wouldkeep_p1a_20260722000100_disposable=true --file=supabase/tests/20260722_site_owner_role_invariant.sql 2>&1)
$MatrixExit = $LASTEXITCODE
$MatrixText = $MatrixOutput -join "`n"
if ($MatrixExit -ne 0) { throw "Disposable matrix failed" }

$ActualScenarios = @(
  [regex]::Matches($MatrixText, '(?m)^"?([a-z0-9_]+)"?,t,') |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object
)
if ($ActualScenarios.Count -ne 8 -or
    (($ActualScenarios -join "`n") -cne (($ExpectedScenarios | Sort-Object) -join "`n"))) {
  throw "Disposable matrix did not return the exact eight passing scenarios"
}
if ([regex]::Matches($MatrixText, '(?m)^ROLLBACK\r?$').Count -ne 1) {
  throw "Disposable matrix did not end in exactly one explicit ROLLBACK"
}

$MatrixResidueOutput = @(& $Psql -X --csv --dbname="$DisposableDbUrl" --set=ON_ERROR_STOP=1 --file=supabase/tests/20260722_site_owner_role_invariant_residue.sql 2>&1)
$MatrixResidueExit = $LASTEXITCODE
$MatrixResidueText = $MatrixResidueOutput -join "`n"
if ($MatrixResidueExit -ne 0 -or
    $MatrixResidueText -notmatch '(?m)^0,0,0,0,site_owner_role_invariant_rollback_residue_zero\r?$') {
  throw "Disposable matrix left residue or the residue probe failed"
}

Write-CandidateEvidence -Name "behavior-matrix.txt" -Value $MatrixOutput
Write-CandidateEvidence -Name "behavior-matrix-residue.txt" -Value $MatrixResidueOutput
```

PASS requires all checks above. Preserve the credential-free evidence outside the repository.

## 2. Production preparation - backup and read-only gates only

This section requires separate explicit authorization for a production connection, backup, and read-only preflight. It still does not authorize deployment.

Run sections 2 through 4 from the approved repository root in one continuous PowerShell 7 session. If the session is interrupted, restart at the beginning of section 2 and create a new evidence directory. Replace every angle-bracket placeholder before running any command.

Start strict mode, define the exact ledger sets, and create fail-closed helpers:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$Supabase = "supabase"
$ExpectedVersion = "20260722000100"
$ExpectedMigrationFile = "20260722000100_site_owner_role_invariant.sql"
$ApprovedSha = "<approved-full-git-sha>"
$ApprovedProjectRef = "<approved-project-ref>"
$EvidenceRoot = "<absolute-protected-path-outside-repository>"

$ExpectedRemotePre = @(
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
  "20260721000100"
)
$ExpectedLocalPre = @($ExpectedRemotePre + $ExpectedVersion)
$ExpectedRemotePost = @($ExpectedLocalPre)
$ExpectedLocalPost = @($ExpectedLocalPre)

function Write-EvidenceText {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][object[]]$Value
  )

  $Path = Join-Path $script:EvidenceDir $Name
  $Value | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  $Item = Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($Item.Length -le 0) { throw "Evidence is empty: $Name" }
}

function Invoke-SupabaseCapture {
  param(
    [Parameter(Mandatory = $true)][string]$EvidenceName,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $Output = @(& $script:Supabase @Arguments 2>&1)
  $ExitCode = $LASTEXITCODE
  Write-EvidenceText -Name "$EvidenceName.txt" -Value $Output
  if ($ExitCode -ne 0) { throw "Supabase command failed: $EvidenceName" }
  return $Output
}

function Invoke-SupabaseJsonCapture {
  param(
    [Parameter(Mandatory = $true)][string]$EvidenceName,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $script:Supabase
  $StartInfo.WorkingDirectory = (Get-Location).ProviderPath
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  foreach ($Argument in $Arguments) { [void]$StartInfo.ArgumentList.Add($Argument) }

  $Process = [System.Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  try {
    if (-not $Process.Start()) { throw "Cannot start Supabase CLI: $EvidenceName" }
    $StdoutTask = $Process.StandardOutput.ReadToEndAsync()
    $StderrTask = $Process.StandardError.ReadToEndAsync()
    $Process.WaitForExit()
    $Stdout = $StdoutTask.GetAwaiter().GetResult()
    $Stderr = $StderrTask.GetAwaiter().GetResult()
    $ExitCode = $Process.ExitCode
  } finally {
    $Process.Dispose()
  }

  Write-EvidenceText -Name "$EvidenceName.txt" -Value @(
    "STDOUT",
    $Stdout.TrimEnd(),
    "STDERR",
    $Stderr.TrimEnd()
  )
  if ($ExitCode -ne 0) { throw "Supabase JSON command failed: $EvidenceName" }
  if ([string]::IsNullOrWhiteSpace($Stdout)) { throw "Supabase JSON stdout is empty: $EvidenceName" }

  try {
    $Json = $Stdout | ConvertFrom-Json -Depth 20 -ErrorAction Stop
  } catch {
    throw "Supabase stdout is not exactly one JSON document: $EvidenceName"
  }
  return [pscustomobject]@{
    Json = $Json
    Stdout = $Stdout
    Stderr = $Stderr
  }
}

function Get-MigrationColumnsFromJson {
  param([Parameter(Mandatory = $true)][object]$Json)

  $RootProperties = @($Json.PSObject.Properties.Name | Sort-Object)
  if (($RootProperties -join "`n") -cne "message`nmigrations" -or
      $Json.message -isnot [string] -or
      $Json.message -cne "Migrations listed") {
    throw "Migration-list JSON root contract changed"
  }

  $Local = [System.Collections.Generic.List[string]]::new()
  $Remote = [System.Collections.Generic.List[string]]::new()
  foreach ($Migration in @($Json.migrations)) {
    $Properties = @($Migration.PSObject.Properties.Name | Sort-Object)
    if (($Properties -join "`n") -cne "local`nremote`ntime" -or
        $Migration.local -isnot [string] -or
        $Migration.remote -isnot [string] -or
        $Migration.time -isnot [string] -or
        [string]::IsNullOrWhiteSpace($Migration.time) -or
        $Migration.local -notmatch '^(?:|\d{8}(?:\d{6})?)$' -or
        $Migration.remote -notmatch '^(?:|\d{8}(?:\d{6})?)$' -or
        ($Migration.local.Length -eq 0 -and $Migration.remote.Length -eq 0)) {
      throw "Migration-list JSON row contract changed"
    }
    if ($Migration.local.Length -gt 0) { [void]$Local.Add($Migration.local) }
    if ($Migration.remote.Length -gt 0) { [void]$Remote.Add($Migration.remote) }
  }
  return [pscustomobject]@{ Local = @($Local); Remote = @($Remote) }
}

function Assert-ExactVersionSet {
  param(
    [Parameter(Mandatory = $true)][string[]]$Actual,
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $ActualSorted = @($Actual | Sort-Object)
  $ExpectedSorted = @($Expected | Sort-Object)
  if ($ActualSorted.Count -ne $ExpectedSorted.Count -or
      (($ActualSorted -join "`n") -cne ($ExpectedSorted -join "`n"))) {
    throw "$Label migration versions do not match the exact approved set"
  }
}

function Assert-PreMigrationList {
  param([Parameter(Mandatory = $true)][object]$Json)

  $Columns = Get-MigrationColumnsFromJson -Json $Json
  Assert-ExactVersionSet -Actual $Columns.Local -Expected $script:ExpectedLocalPre -Label "Preflight local"
  Assert-ExactVersionSet -Actual $Columns.Remote -Expected $script:ExpectedRemotePre -Label "Preflight remote"
}

function Assert-PostMigrationList {
  param([Parameter(Mandatory = $true)][object]$Json)

  $Columns = Get-MigrationColumnsFromJson -Json $Json
  Assert-ExactVersionSet -Actual $Columns.Local -Expected $script:ExpectedLocalPost -Label "Postflight local"
  Assert-ExactVersionSet -Actual $Columns.Remote -Expected $script:ExpectedRemotePost -Label "Postflight remote"
}

function Get-PendingMigrationData {
  param([Parameter(Mandatory = $true)][object[]]$Output)

  $Text = $Output -join "`n"
  $FilePattern = '(?<![a-z0-9_])\d{8}(?:\d{6})?_[a-z0-9][a-z0-9_]*\.sql(?![a-z0-9_])'
  $VersionPattern = '(?<!\d)\d{8}(?:\d{6})?(?!\d)'
  $Files = @(
    [regex]::Matches($Text, $FilePattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) |
      ForEach-Object { $_.Value.ToLowerInvariant() } |
      Sort-Object -Unique
  )
  $Versions = @(
    [regex]::Matches($Text, $VersionPattern) |
      ForEach-Object { $_.Value } |
      Sort-Object -Unique
  )
  return [pscustomobject]@{ Text = $Text; Files = $Files; Versions = $Versions }
}

function Assert-SinglePendingMigration {
  param([Parameter(Mandatory = $true)][object[]]$Output)

  $Pending = Get-PendingMigrationData -Output $Output
  $InitialPendingMigrationFiles = @($Pending.Files)
  $InitialPendingVersions = @($Pending.Versions)
  if ($InitialPendingMigrationFiles.Count -ne 1 -or
      $InitialPendingMigrationFiles[0] -cne $script:ExpectedMigrationFile -or
      $InitialPendingVersions.Count -ne 1 -or
      $InitialPendingVersions[0] -cne $script:ExpectedVersion) {
    throw "Dry-run is not the exact approved migration filename and version"
  }
}

function Get-GateFingerprint {
  param(
    [Parameter(Mandatory = $true)][object[]]$Output,
    [Parameter(Mandatory = $true)][string]$Sentinel,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Assert-SentinelOnce -Output $Output -Sentinel $Sentinel -Label $Label
  $Text = $Output -join "`n"
  $FingerprintMatches = @(
    [regex]::Matches($Text, '(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  )
  if ($FingerprintMatches.Count -ne 1) { throw "$Label fingerprint is missing or repeated" }
  return $FingerprintMatches[0].Value.ToLowerInvariant()
}

function Assert-SentinelOnce {
  param(
    [Parameter(Mandatory = $true)][object[]]$Output,
    [Parameter(Mandatory = $true)][string]$Sentinel,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $Text = $Output -join "`n"
  if ([regex]::Matches($Text, [regex]::Escape($Sentinel)).Count -ne 1) {
    throw "$Label did not emit its exact pass sentinel once"
  }
}

function Get-OrdinalLineMultisetCanonical {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Output
  )

  $Canonical = [string[]]::new($Output.Count)
  for ($Index = 0; $Index -lt $Output.Count; $Index++) {
    if ($null -eq $Output[$Index]) {
      throw "Ordinal line multiset output contains a null entry"
    }
    $Canonical[$Index] = $Output[$Index].ToString()
  }
  [Array]::Sort($Canonical, [StringComparer]::Ordinal)
  return ,$Canonical
}

function Assert-OrdinalLineMultisetEqual {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Actual,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $ActualCanonical = Get-OrdinalLineMultisetCanonical -Output $Actual
  $ExpectedCanonical = Get-OrdinalLineMultisetCanonical -Output $Expected
  if ($ActualCanonical.Count -ne $ExpectedCanonical.Count) {
    throw "$Label output changed after approval"
  }
  for ($Index = 0; $Index -lt $ActualCanonical.Count; $Index++) {
    if (-not [StringComparer]::Ordinal.Equals(
        $ActualCanonical[$Index],
        $ExpectedCanonical[$Index]
      )) {
      throw "$Label output changed after approval"
    }
  }
}
```

Prove the clean approved commit, CLI, linked project, and protected evidence path. `git status` is captured once and its exit code is checked immediately:

```powershell
$RepositoryRootOutput = @(git rev-parse --show-toplevel 2>&1)
$RepositoryRootExit = $LASTEXITCODE
if ($RepositoryRootExit -ne 0 -or $RepositoryRootOutput.Count -ne 1) {
  throw "Cannot resolve repository root"
}
$RepositoryRoot = $RepositoryRootOutput[0].ToString().Trim()

$ActualShaOutput = @(git rev-parse HEAD 2>&1)
$ActualShaExit = $LASTEXITCODE
if ($ActualShaExit -ne 0 -or $ActualShaOutput.Count -ne 1) { throw "Cannot read Git SHA" }
$ActualSha = $ActualShaOutput[0].ToString().Trim()
if ($ActualSha -cne $ApprovedSha) { throw "Git SHA mismatch" }

$GitStatusOutput = @(git status --porcelain 2>&1)
$GitStatusExit = $LASTEXITCODE
if ($GitStatusExit -ne 0 -or ($GitStatusOutput -join "`n").Length -ne 0) {
  throw "Production worktree is not clean"
}

$RepositoryPrefix = [IO.Path]::GetFullPath($RepositoryRoot).TrimEnd([char[]]"\/") + [IO.Path]::DirectorySeparatorChar
$EvidenceRootFull = [IO.Path]::GetFullPath($EvidenceRoot).TrimEnd([char[]]"\/")
if (($EvidenceRootFull + [IO.Path]::DirectorySeparatorChar).StartsWith(
    $RepositoryPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Evidence root must be outside the repository"
}

$RunId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$EvidenceDir = Join-Path $EvidenceRootFull "p1a-$RunId"
New-Item -ItemType Directory -Path $EvidenceDir -ErrorAction Stop | Out-Null
$script:EvidenceDir = $EvidenceDir

$CliVersionOutput = @(& $Supabase --version 2>&1)
$CliVersionExit = $LASTEXITCODE
if ($CliVersionExit -ne 0 -or $CliVersionOutput.Count -ne 1 -or
    $CliVersionOutput[0].ToString().Trim() -cne "2.109.1") {
  throw "Supabase CLI version mismatch"
}

$ProjectRefPath = "supabase/.temp/project-ref"
$LinkedProjectRef = (Get-Content -LiteralPath $ProjectRefPath -Raw -ErrorAction Stop).Trim()
if ($LinkedProjectRef -cne $ApprovedProjectRef) { throw "Linked project ref mismatch" }

Write-EvidenceText -Name "git-sha.txt" -Value @($ActualSha)
Write-EvidenceText -Name "supabase-version.txt" -Value $CliVersionOutput
Write-EvidenceText -Name "project-ref.txt" -Value @($LinkedProjectRef)
Write-EvidenceText -Name "started-utc.txt" -Value @($RunId)
```

Create exactly three scoped logical backup artifacts before any migration write. Verify each file, expected structural markers, and exactly three SHA-256 hashes. This is artifact verification, not a claim that these three scoped dumps are a full Supabase disaster-recovery backup.

```powershell
$SchemaBackup = Join-Path $EvidenceDir "public-schema.sql"
$PublicDataBackup = Join-Path $EvidenceDir "public-data.sql"
$LedgerBackup = Join-Path $EvidenceDir "migration-ledger-data.sql"

& $Supabase db dump --linked --schema public --file $SchemaBackup --agent no --output-format text
$SchemaBackupExit = $LASTEXITCODE
if ($SchemaBackupExit -ne 0) { throw "Public schema backup failed" }

& $Supabase db dump --linked --data-only --use-copy --schema public --file $PublicDataBackup --agent no --output-format text
$PublicDataBackupExit = $LASTEXITCODE
if ($PublicDataBackupExit -ne 0) { throw "Public data backup failed" }

& $Supabase db dump --linked --data-only --use-copy --schema supabase_migrations --file $LedgerBackup --agent no --output-format text
$LedgerBackupExit = $LASTEXITCODE
if ($LedgerBackupExit -ne 0) { throw "Migration ledger backup failed" }

$BackupFiles = @($SchemaBackup, $PublicDataBackup, $LedgerBackup)
if ($BackupFiles.Count -ne 3) { throw "Backup set must contain exactly three files" }
foreach ($BackupFile in $BackupFiles) {
  $BackupItem = Get-Item -LiteralPath $BackupFile -ErrorAction Stop
  if ($BackupItem.Length -le 0) { throw "Backup artifact is empty: $BackupFile" }
}

if (-not (Select-String -LiteralPath $SchemaBackup -SimpleMatch 'CREATE OR REPLACE FUNCTION "public"."grant_role"' -Quiet -ErrorAction Stop)) {
  throw "Public schema backup is missing grant_role"
}
if (-not (Select-String -LiteralPath $PublicDataBackup -SimpleMatch 'Data for Name: site_owners' -Quiet -ErrorAction Stop) -or
    -not (Select-String -LiteralPath $PublicDataBackup -SimpleMatch 'Data for Name: user_roles' -Quiet -ErrorAction Stop)) {
  throw "Public data backup is missing protected-owner table sections"
}
if (-not (Select-String -LiteralPath $LedgerBackup -SimpleMatch 'Data for Name: schema_migrations' -Quiet -ErrorAction Stop)) {
  throw "Migration ledger backup is missing schema_migrations"
}

$BackupHashRows = @(
  $BackupFiles | ForEach-Object { Get-FileHash -LiteralPath $_ -Algorithm SHA256 -ErrorAction Stop }
)
if ($BackupHashRows.Count -ne 3 -or
    @($BackupHashRows | Where-Object { $_.Hash -notmatch '^[A-F0-9]{64}$' }).Count -ne 0) {
  throw "Backup hashing did not produce exactly three SHA-256 results"
}
$BackupHashLines = @(
  $BackupHashRows | ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" }
)
Write-EvidenceText -Name "sha256.txt" -Value $BackupHashLines
```

Capture and validate the exact pre-deployment local and remote ledger sets as non-agent JSON, the exact pending filename/version tuple, the concurrency gate, and the read-only preflight fingerprint:

```powershell
$InitialMigrationListCapture = Invoke-SupabaseJsonCapture -EvidenceName "migration-list-pre" -Arguments @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PreMigrationList -Json $InitialMigrationListCapture.Json

$InitialDryRun = @(
  Invoke-SupabaseCapture -EvidenceName "db-push-dry-run-pre" -Arguments @(
    "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
  )
)
Assert-SinglePendingMigration -Output $InitialDryRun

$InitialActivityGate = @(
  Invoke-SupabaseCapture -EvidenceName "activity-gate-initial" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_activity_gate.sql",
    "--agent", "no", "--output-format", "text"
  )
)
Assert-SentinelOnce -Output $InitialActivityGate -Sentinel "site_owner_role_invariant_activity_gate_passed" -Label "Initial activity gate"

$InitialPreflightAssertions = @(
  Invoke-SupabaseCapture -EvidenceName "preflight-initial" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_preflight.sql",
    "--agent", "no", "--output-format", "text"
  )
)
$InitialStateFingerprint = @(
  Invoke-SupabaseCapture -EvidenceName "state-fingerprint-initial" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_state_fingerprint.sql",
    "--agent", "no", "--output-format", "text"
  )
)
$ApprovedPreflightFingerprint = Get-GateFingerprint -Output $InitialStateFingerprint -Sentinel "site_owner_role_invariant_state_fingerprint_passed" -Label "Initial state fingerprint"
Write-EvidenceText -Name "approved-preflight-fingerprint.txt" -Value @($ApprovedPreflightFingerprint)
```

Stop here unless a fresh written authorization separately names production deployment of only `20260722000100`.

## 3. Production deployment - separately authorized single write

Do not enter this section without the new explicit authorization. Immediately before the write, re-prove the approved identity and rerun all four read-only gates into separate variables. Require the same ordinal line multiset: stdout/stderr interleaving may change line order, but line contents, duplicates, empty lines, case, and whitespace must remain identical. Compare the separately named fingerprint with `-cne` so the approved value cannot be overwritten:

```powershell
$ImmediateShaOutput = @(git rev-parse HEAD 2>&1)
$ImmediateShaExit = $LASTEXITCODE
if ($ImmediateShaExit -ne 0 -or $ImmediateShaOutput.Count -ne 1) { throw "Cannot re-read Git SHA" }
$ImmediateSha = $ImmediateShaOutput[0].ToString().Trim()
if ($ImmediateSha -cne $ApprovedSha) { throw "Git SHA changed after approval" }

$ImmediateGitStatusOutput = @(git status --porcelain 2>&1)
$ImmediateGitStatusExit = $LASTEXITCODE
if ($ImmediateGitStatusExit -ne 0 -or ($ImmediateGitStatusOutput -join "`n").Length -ne 0) {
  throw "Worktree changed after approval"
}

$ImmediateCliVersionOutput = @(& $Supabase --version 2>&1)
$ImmediateCliVersionExit = $LASTEXITCODE
if ($ImmediateCliVersionExit -ne 0 -or $ImmediateCliVersionOutput.Count -ne 1 -or
    $ImmediateCliVersionOutput[0].ToString().Trim() -cne "2.109.1") {
  throw "Supabase CLI changed after approval"
}

$ImmediateProjectRef = (Get-Content -LiteralPath $ProjectRefPath -Raw -ErrorAction Stop).Trim()
if ($ImmediateProjectRef -cne $ApprovedProjectRef) { throw "Linked project changed after approval" }

Write-EvidenceText -Name "git-sha-immediate.txt" -Value @($ImmediateSha)
Write-EvidenceText -Name "git-status-immediate.txt" -Value @("clean")
Write-EvidenceText -Name "supabase-version-immediate.txt" -Value $ImmediateCliVersionOutput
Write-EvidenceText -Name "project-ref-immediate.txt" -Value @($ImmediateProjectRef)

$ImmediateMigrationListCapture = Invoke-SupabaseJsonCapture -EvidenceName "migration-list-immediate" -Arguments @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PreMigrationList -Json $ImmediateMigrationListCapture.Json
if ($ImmediateMigrationListCapture.Stdout -cne $InitialMigrationListCapture.Stdout -or
    $ImmediateMigrationListCapture.Stderr -cne $InitialMigrationListCapture.Stderr) {
  throw "Migration list changed after approval"
}

$ImmediateDryRun = @(
  Invoke-SupabaseCapture -EvidenceName "db-push-dry-run-immediate" -Arguments @(
    "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
  )
)
Assert-SinglePendingMigration -Output $ImmediateDryRun
Assert-OrdinalLineMultisetEqual -Actual $ImmediateDryRun -Expected $InitialDryRun -Label "Dry-run"

$ImmediateActivityGate = @(
  Invoke-SupabaseCapture -EvidenceName "activity-gate-immediate" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_activity_gate.sql",
    "--agent", "no", "--output-format", "text"
  )
)
Assert-SentinelOnce -Output $ImmediateActivityGate -Sentinel "site_owner_role_invariant_activity_gate_passed" -Label "Immediate activity gate"
Assert-OrdinalLineMultisetEqual -Actual $ImmediateActivityGate -Expected $InitialActivityGate -Label "Activity gate"

$ImmediatePreflightAssertions = @(
  Invoke-SupabaseCapture -EvidenceName "preflight-immediate" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_preflight.sql",
    "--agent", "no", "--output-format", "text"
  )
)
Assert-OrdinalLineMultisetEqual -Actual $ImmediatePreflightAssertions -Expected $InitialPreflightAssertions -Label "Preflight assertion"

$ImmediateStateFingerprint = @(
  Invoke-SupabaseCapture -EvidenceName "state-fingerprint-immediate" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_state_fingerprint.sql",
    "--agent", "no", "--output-format", "text"
  )
)
$ImmediatePreflightFingerprint = Get-GateFingerprint -Output $ImmediateStateFingerprint -Sentinel "site_owner_role_invariant_state_fingerprint_passed" -Label "Immediate state fingerprint"
if ($ImmediatePreflightFingerprint -cne $ApprovedPreflightFingerprint) {
  throw "Protected-owner state changed after approval"
}
Assert-OrdinalLineMultisetEqual -Actual $ImmediateStateFingerprint -Expected $InitialStateFingerprint -Label "State fingerprint"

$FinalPreWriteShaOutput = @(git rev-parse HEAD 2>&1)
$FinalPreWriteShaExit = $LASTEXITCODE
if ($FinalPreWriteShaExit -ne 0 -or $FinalPreWriteShaOutput.Count -ne 1 -or
    $FinalPreWriteShaOutput[0].ToString().Trim() -cne $ApprovedSha) {
  throw "Git SHA changed during immediate gates"
}
$FinalPreWriteStatusOutput = @(git status --porcelain 2>&1)
$FinalPreWriteStatusExit = $LASTEXITCODE
if ($FinalPreWriteStatusExit -ne 0 -or ($FinalPreWriteStatusOutput -join "`n").Length -ne 0) {
  throw "Worktree changed during immediate gates"
}
$FinalPreWriteCliVersion = @(& $Supabase --version 2>&1)
$FinalPreWriteCliVersionExit = $LASTEXITCODE
if ($FinalPreWriteCliVersionExit -ne 0 -or $FinalPreWriteCliVersion.Count -ne 1 -or
    $FinalPreWriteCliVersion[0].ToString().Trim() -cne "2.109.1") {
  throw "Supabase CLI changed during immediate gates"
}
$FinalPreWriteProjectRef = (Get-Content -LiteralPath $ProjectRefPath -Raw -ErrorAction Stop).Trim()
if ($FinalPreWriteProjectRef -cne $ApprovedProjectRef) {
  throw "Linked project changed during immediate gates"
}
Write-EvidenceText -Name "git-sha-final-prewrite.txt" -Value $FinalPreWriteShaOutput
Write-EvidenceText -Name "git-status-final-prewrite.txt" -Value @("clean")
Write-EvidenceText -Name "supabase-version-final-prewrite.txt" -Value $FinalPreWriteCliVersion
Write-EvidenceText -Name "project-ref-final-prewrite.txt" -Value @($FinalPreWriteProjectRef)
```

The only allowed migration write is the following command:

```powershell
$Push = @(
  Invoke-SupabaseCapture -EvidenceName "db-push" -Arguments @(
    "db", "push", "--linked", "--yes", "--agent", "no", "--output-format", "text"
  )
)
```

Do not pass `--include-all`. Do not run a second push to fix an ambiguous first result.

## 4. Immediate production postflight - read only

Run the committed one-statement contract, then the separate one-statement state fingerprint, and require ordinal equality with the original approved fingerprint:

```powershell
$ContractAssertions = @(
  Invoke-SupabaseCapture -EvidenceName "contract" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_contract.sql",
    "--agent", "no", "--output-format", "text"
  )
)
$PostStateFingerprint = @(
  Invoke-SupabaseCapture -EvidenceName "state-fingerprint-post" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_state_fingerprint.sql",
    "--agent", "no", "--output-format", "text"
  )
)
$ContractFingerprint = Get-GateFingerprint -Output $PostStateFingerprint -Sentinel "site_owner_role_invariant_state_fingerprint_passed" -Label "Postflight state fingerprint"
if ($ContractFingerprint -cne $ApprovedPreflightFingerprint) {
  throw "Protected-owner state changed during deployment"
}
```

Capture an executable final activity, ledger, and dry-run postflight. Require a quiet concurrency gate, both local and remote ledgers to contain the exact 19-version set, zero pending migration filenames, zero pending versions, and the CLI up-to-date sentinel:

```powershell
$PostActivityGate = @(
  Invoke-SupabaseCapture -EvidenceName "activity-gate-post" -Arguments @(
    "db", "query", "--linked", "--file", "supabase/tests/20260722_site_owner_role_invariant_activity_gate.sql",
    "--agent", "no", "--output-format", "text"
  )
)
Assert-SentinelOnce -Output $PostActivityGate -Sentinel "site_owner_role_invariant_activity_gate_passed" -Label "Postflight activity gate"

$PostMigrationListCapture = Invoke-SupabaseJsonCapture -EvidenceName "migration-list-post" -Arguments @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PostMigrationList -Json $PostMigrationListCapture.Json

$PostDryRun = @(
  Invoke-SupabaseCapture -EvidenceName "db-push-dry-run-post" -Arguments @(
    "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
  )
)
$PostPending = Get-PendingMigrationData -Output $PostDryRun
$PostPendingMigrationFiles = @($PostPending.Files)
$PostPendingVersions = @($PostPending.Versions)
if ($PostPendingMigrationFiles.Count -ne 0 -or $PostPendingVersions.Count -ne 0) {
  throw "Postflight dry-run still contains pending migrations"
}
if ($PostPending.Text -notmatch '(?i)\bup to date\b') {
  throw "Postflight dry-run did not emit the up-to-date sentinel"
}

$CompletedUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-EvidenceText -Name "completed-utc.txt" -Value @($CompletedUtc)

$RequiredEvidence = @(
  "git-sha.txt",
  "supabase-version.txt",
  "project-ref.txt",
  "started-utc.txt",
  "public-schema.sql",
  "public-data.sql",
  "migration-ledger-data.sql",
  "sha256.txt",
  "migration-list-pre.txt",
  "db-push-dry-run-pre.txt",
  "activity-gate-initial.txt",
  "preflight-initial.txt",
  "state-fingerprint-initial.txt",
  "approved-preflight-fingerprint.txt",
  "git-sha-immediate.txt",
  "git-status-immediate.txt",
  "supabase-version-immediate.txt",
  "project-ref-immediate.txt",
  "migration-list-immediate.txt",
  "db-push-dry-run-immediate.txt",
  "activity-gate-immediate.txt",
  "preflight-immediate.txt",
  "state-fingerprint-immediate.txt",
  "git-sha-final-prewrite.txt",
  "git-status-final-prewrite.txt",
  "supabase-version-final-prewrite.txt",
  "project-ref-final-prewrite.txt",
  "db-push.txt",
  "contract.txt",
  "state-fingerprint-post.txt",
  "activity-gate-post.txt",
  "migration-list-post.txt",
  "db-push-dry-run-post.txt",
  "completed-utc.txt"
)
foreach ($EvidenceName in $RequiredEvidence) {
  $EvidenceItem = Get-Item -LiteralPath (Join-Path $EvidenceDir $EvidenceName) -ErrorAction Stop
  if ($EvidenceItem.Length -le 0) { throw "Required evidence is missing or empty: $EvidenceName" }
}
```

Only after every check passes, append a sanitized operation entry to `.design/wouldkeep-next/PRODUCTION_SAFETY.md` in a later documentation commit. Never commit the evidence directory or its contents.

## Forbidden production commands

The following files are never production inputs:

- `supabase/tests/20260722_site_owner_role_invariant.sql`
- `supabase/tests/20260722_site_owner_role_invariant_residue.sql`

Never combine either file with `--linked`, a production `--db-url`, or a production `psql` connection. Never run `migration repair`, hand-written `GRANT` or `REVOKE`, or a manual function replacement as a substitute for the committed migration.
