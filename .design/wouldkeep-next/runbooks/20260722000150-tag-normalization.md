# Runbook: `20260722000150_normalize_existing_tags_for_atomic_save`

This fail-closed runbook is an instruction artifact only. It **does not authorize production deployment**, merging the Draft PR, production access, backup, or any database write.

## Scope and immutable inputs

- Branch: `release/p1b-tag-normalization-22000150`.
- Creation base: `19571ca19dabc80aeacac7a1ac016667dcaa9f0f` (PR #31 before merge).
- Approved migration: `supabase/migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql` only.
- Validated Supabase CLI: `2.109.1`.
- Pre-deployment remote ledger: exactly 19 distinct versions through `20260722000100`.
- Post-deployment remote ledger: exactly 20 distinct versions through `20260722000150`.
- `20260722000200` must be absent from this branch and from the remote ledger throughout this runbook.

Current `main` contains the not-yet-deployed `20260722000200`. A future `00150` deployment must therefore run from a clean worktree at the approved SHA on this isolated branch. Running from `main`, using `--include-all`, copying SQL into the Dashboard, or invoking `migration repair` is forbidden.

Production-safe, read-only inputs:

- `supabase/tests/20260722_tag_normalization_activity_gate.sql`
- `supabase/tests/20260722_tag_normalization_preflight.sql`
- `supabase/tests/20260722_tag_normalization_contract.sql`
- `supabase/tests/20260722_tag_normalization_state_fingerprint.sql`

Disposable-only inputs, never allowed with `--linked` or a production URL:

- `supabase/tests/20260722_tag_normalization.sql`
- `supabase/tests/20260722_tag_normalization_collision.sql`
- `supabase/tests/20260722_tag_normalization_invalid.sql`
- `supabase/tests/20260722_tag_normalization_residue.sql`

## Universal stop conditions

Stop and preserve the evidence directory if any condition fails. Do not weaken an assertion, retry an ambiguous write, repair the ledger, or run ad-hoc SQL.

- Fresh written authorization does not name the exact next production operation.
- The approved SHA, branch, creation base, clean worktree, CLI version, linked project ref, or protected evidence path cannot be proven.
- Any command exits unexpectedly or produces empty evidence.
- Initial and immediate identity, migration list, dry-run, activity, preflight, or state evidence differs.
- The preflight aggregate is not exactly `462` tags, `6` candidates, `65` affected references, and zero collisions.
- A dry-run contains anything except the single approved `00150` filename/version.
- Any backup is empty or structurally incomplete, or the set does not produce exactly three SHA-256 hashes.
- Postflight does not prove the exact 20/20 ledger, zero pending, 462 tags, zero candidates, unchanged immutable/reference state, and actual tag state equal to the approved projected state.

Never commit backup data or raw evidence. The public-data dump contains private content. Sanitized records may contain only aggregate counts, whole-set fingerprints, CLI/Git/project identity, and pass/fail status; never tag text, per-row hashes, production UUIDs, account content, database URLs, or secrets.

## 1. Disposable candidate verification

Run on a throwaway PostgreSQL 17 database at the exact `20260722000100` schema baseline. The URL must resolve to `localhost` or an IP loopback address. Never use `--linked`, a Supabase pooler, or a non-loopback URL.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$Psql = "psql"
$DisposableDbUrl = "<loopback-postgres-url>"
$CandidateEvidenceDir = "<absolute-path-outside-repository>"

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
```

Also replay every migration through `00150` on a fresh empty disposable database. The migration must apply successfully with zero tags and zero writes. Preserve only credential-free aggregate evidence outside the repository.

## 2. Production backup and read-only preflight

Sections 2-4 require separately written authorization and must run in one uninterrupted PowerShell 7 session. If the session stops, restart section 2 in a new evidence directory.

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "PowerShell 7 or newer is required" }

$Supabase = "supabase"
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
$ExpectedRemotePost = @($ExpectedLocalPre)
$ExpectedLocalPost = @($ExpectedLocalPre)

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

function Assert-Identity {
  $Branch = @(git branch --show-current 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Branch.Count -ne 1 -or
      $Branch[0].Trim() -cne "release/p1b-tag-normalization-22000150") {
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
  $Cli = @(& $Supabase --version 2>&1)
  if ($LASTEXITCODE -ne 0 -or $Cli.Count -ne 1 -or $Cli[0].Trim() -cne "2.109.1") {
    throw "Supabase CLI version mismatch"
  }
  $Ref = (Get-Content supabase/.temp/project-ref -Raw -ErrorAction Stop).Trim()
  if ($Ref -cne $ApprovedProjectRef) { throw "Linked project ref mismatch" }
  return [pscustomobject]@{
    Branch = $Branch[0].Trim(); Sha = $Sha[0].Trim(); Cli = $Cli[0].Trim(); Ref = $Ref
  }
}

function Assert-Sentinel([object[]]$Output, [string]$Sentinel) {
  $Text = $Output -join "`n"
  if ([regex]::Matches($Text, [regex]::Escape($Sentinel)).Count -ne 1) {
    throw "Sentinel missing or repeated: $Sentinel"
  }
}

function Get-CanonicalLines([object[]]$Output) {
  $Copy = [string[]]::new($Output.Count)
  for ($Index = 0; $Index -lt $Output.Count; $Index++) {
    if ($null -eq $Output[$Index]) { throw "Evidence contains a null line" }
    $Copy[$Index] = $Output[$Index].ToString()
  }
  [Array]::Sort($Copy, [StringComparer]::Ordinal)
  return ,$Copy
}

function Assert-SameEvidence([object[]]$Actual, [object[]]$Expected, [string]$Label) {
  $A = Get-CanonicalLines $Actual
  $E = Get-CanonicalLines $Expected
  if ($A.Count -ne $E.Count) { throw "$Label output changed after approval" }
  for ($Index = 0; $Index -lt $A.Count; $Index++) {
    if (-not [StringComparer]::Ordinal.Equals($A[$Index], $E[$Index])) {
      throw "$Label output changed after approval"
    }
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

function Get-RemoteVersions([object[]]$Output) {
  return @((Get-MigrationVersions $Output).Remote)
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

function Assert-PostMigrationList([object[]]$Output, [string]$Label) {
  $Versions = Get-MigrationVersions $Output
  Assert-ExactVersions $Versions.Local $ExpectedLocalPost "$Label local"
  Assert-ExactVersions $Versions.Remote $ExpectedRemotePost "$Label remote"
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

function Assert-ZeroPending([object[]]$Output) {
  $Text = $Output -join "`n"
  $Files = @([regex]::Matches($Text, '\b\d{8}(?:\d{6})?_[A-Za-z0-9_]+\.sql\b'))
  if ($Files.Count -ne 0 -or $Text -notmatch '(?i)\bup to date\b') {
    throw "Postflight is not zero pending/up to date"
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

function Assert-PostTagState([object]$State, [object]$Approved) {
  if ($State.Tags -ne 462 -or $State.Refs -ne $Approved.Refs -or
      $State.Candidates -ne 0 -or $State.AffectedRefs -ne 0 -or
      $State.Immutable -cne $Approved.Immutable -or
      $State.DocumentTags -cne $Approved.DocumentTags -or
      $State.Actual -cne $Approved.Projected -or
      $State.Projected -cne $Approved.Projected) {
    throw "Postflight tag identity/reference/projected-state contract failed"
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

$RootOutput = @(git rev-parse --show-toplevel 2>&1)
if ($LASTEXITCODE -ne 0 -or $RootOutput.Count -ne 1) { throw "Cannot resolve repository root" }
$RepositoryRoot = [IO.Path]::GetFullPath($RootOutput[0].Trim())
$EvidenceFull = [IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceFull.StartsWith($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Evidence root must remain outside the repository"
}
$EvidenceDir = Join-Path $EvidenceFull (
  "p1b-tag-normalization-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
)
New-Item -ItemType Directory -Path $EvidenceDir -ErrorAction Stop | Out-Null
$script:EvidenceDir = $EvidenceDir
$script:Supabase = $Supabase

$Identity = Assert-Identity
Write-Evidence "git-sha.txt" @($Identity.Sha)
Write-Evidence "supabase-version.txt" @($Identity.Cli)
Write-Evidence "project-ref.txt" @($Identity.Ref)
Write-Evidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

$SchemaBackup = Join-Path $EvidenceDir "public-schema.sql"
$DataBackup = Join-Path $EvidenceDir "public-data.sql"
$LedgerBackup = Join-Path $EvidenceDir "migration-ledger-data.sql"

& $Supabase db dump --linked --schema public --file $SchemaBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Schema backup failed" }
& $Supabase db dump --linked --data-only --use-copy --schema public --file $DataBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Public-data backup failed" }
& $Supabase db dump --linked --data-only --use-copy --schema supabase_migrations --file $LedgerBackup --agent no --output-format text
if ($LASTEXITCODE -ne 0) { throw "Ledger backup failed" }

$BackupFiles = @($SchemaBackup, $DataBackup, $LedgerBackup)
if ($BackupFiles.Count -ne 3) { throw "Exactly three backups are required" }
Assert-DumpArtifact $SchemaBackup @(
  '(?i)^\s*CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"public"|public)\.(?:"tags"|tags)\s*\('
) "Public schema"
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

$MigrationListInitial = Invoke-Capture "migration-list-initial" @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PreMigrationList $MigrationListInitial "Initial"
$DryRunInitial = Invoke-Capture "dry-run-initial" @(
  "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
)
Assert-OnlyTargetPending $DryRunInitial
$ActivityInitial = Invoke-Capture "activity-initial" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_activity_gate.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $ActivityInitial "tag_normalization_activity_gate_passed"
$PreflightInitial = Invoke-Capture "preflight-initial" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_preflight.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $PreflightInitial "tag_normalization_preflight_passed"
$StateInitial = Invoke-Capture "state-initial" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_state_fingerprint.sql",
  "--agent", "no", "--output-format", "text"
)
$ApprovedState = Get-TagState $StateInitial
Assert-PreTagState $ApprovedState
Write-Evidence "approved-state.txt" @(
  "tags=$($ApprovedState.Tags)", "refs=$($ApprovedState.Refs)",
  "candidates=$($ApprovedState.Candidates)", "affected_refs=$($ApprovedState.AffectedRefs)",
  "immutable=$($ApprovedState.Immutable)", "document_tags=$($ApprovedState.DocumentTags)",
  "actual=$($ApprovedState.Actual)", "projected=$($ApprovedState.Projected)"
)
```

Stop here unless a fresh written authorization separately names production deployment of only `20260722000150`.

## 3. Immediate gates and the single production write

Immediately before the write, machine-recheck identity and all read-only evidence. No operator judgment substitutes for these comparisons.

```powershell
$ImmediateIdentity = Assert-Identity
if ($ImmediateIdentity.Branch -cne $Identity.Branch -or
    $ImmediateIdentity.Sha -cne $Identity.Sha -or
    $ImmediateIdentity.Ref -cne $Identity.Ref -or
    $ImmediateIdentity.Cli -cne $Identity.Cli) {
  throw "Identity changed after approval"
}

$MigrationListImmediate = Invoke-Capture "migration-list-immediate" @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PreMigrationList $MigrationListImmediate "Immediate"
Assert-SameEvidence $MigrationListImmediate $MigrationListInitial "Migration list"

$DryRunImmediate = Invoke-Capture "dry-run-immediate" @(
  "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
)
Assert-OnlyTargetPending $DryRunImmediate
Assert-SameEvidence $DryRunImmediate $DryRunInitial "Dry-run"

$ActivityImmediate = Invoke-Capture "activity-immediate" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_activity_gate.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $ActivityImmediate "tag_normalization_activity_gate_passed"
Assert-SameEvidence $ActivityImmediate $ActivityInitial "Activity"

$PreflightImmediate = Invoke-Capture "preflight-immediate" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_preflight.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $PreflightImmediate "tag_normalization_preflight_passed"
Assert-SameEvidence $PreflightImmediate $PreflightInitial "Preflight"

$StateImmediate = Invoke-Capture "state-immediate" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_state_fingerprint.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-SameEvidence $StateImmediate $StateInitial "State"
$ImmediateState = Get-TagState $StateImmediate
Assert-PreTagState $ImmediateState
if ($ImmediateState.Immutable -cne $ApprovedState.Immutable -or
    $ImmediateState.DocumentTags -cne $ApprovedState.DocumentTags -or
    $ImmediateState.Actual -cne $ApprovedState.Actual -or
    $ImmediateState.Projected -cne $ApprovedState.Projected) {
  throw "Tag state changed after approval"
}

$FinalIdentity = Assert-Identity
if ($FinalIdentity.Sha -cne $ApprovedSha -or
    $FinalIdentity.Ref -cne $ApprovedProjectRef -or
    $FinalIdentity.Cli -cne "2.109.1") {
  throw "Final pre-write identity changed"
}

$Push = Invoke-Capture "db-push" @(
  "db", "push", "--linked", "--yes", "--agent", "no", "--output-format", "text"
)
```

The `Invoke-Capture "db-push"` call above is the only permitted production write. Do not add `--include-all`, issue a second push, or substitute Dashboard/manual SQL.

## 4. Immediate read-only postflight

```powershell
$Contract = Invoke-Capture "contract" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_contract.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $Contract "tag_normalization_contract_passed"

$StatePost = Invoke-Capture "state-post" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_state_fingerprint.sql",
  "--agent", "no", "--output-format", "text"
)
$PostState = Get-TagState $StatePost
Assert-PostTagState $PostState $ApprovedState

$ActivityPost = Invoke-Capture "activity-post" @(
  "db", "query", "--linked", "--file",
  "supabase/tests/20260722_tag_normalization_activity_gate.sql",
  "--agent", "no", "--output-format", "text"
)
Assert-Sentinel $ActivityPost "tag_normalization_activity_gate_passed"

$MigrationListPost = Invoke-Capture "migration-list-post" @(
  "migration", "list", "--linked", "--agent", "no", "--output-format", "json"
)
Assert-PostMigrationList $MigrationListPost "Postflight"
Assert-ExactVersions @(Get-RemoteVersions $MigrationListPost) $ExpectedRemotePost "Postflight remote"

$DryRunPost = Invoke-Capture "dry-run-post" @(
  "db", "push", "--linked", "--dry-run", "--agent", "no", "--output-format", "text"
)
Assert-ZeroPending $DryRunPost

$FinalIdentityAfter = Assert-Identity
if ($FinalIdentityAfter.Sha -cne $ApprovedSha -or
    $FinalIdentityAfter.Ref -cne $ApprovedProjectRef) {
  throw "Identity changed during postflight"
}
Write-Evidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

$RequiredEvidence = @(
  "git-sha.txt", "supabase-version.txt", "project-ref.txt", "started-utc.txt",
  "public-schema.sql", "public-data.sql", "migration-ledger-data.sql", "sha256.txt",
  "migration-list-initial.txt", "dry-run-initial.txt", "activity-initial.txt",
  "preflight-initial.txt", "state-initial.txt", "approved-state.txt",
  "migration-list-immediate.txt", "dry-run-immediate.txt", "activity-immediate.txt",
  "preflight-immediate.txt", "state-immediate.txt", "db-push.txt", "contract.txt",
  "state-post.txt", "activity-post.txt", "migration-list-post.txt", "dry-run-post.txt",
  "completed-utc.txt"
)
foreach ($EvidenceName in $RequiredEvidence) {
  if ((Get-Item (Join-Path $EvidenceDir $EvidenceName) -ErrorAction Stop).Length -le 0) {
    throw "Required evidence is missing or empty: $EvidenceName"
  }
}
```

PASS requires exact local/remote 20-version sets ending at `00150`, zero pending, 462 tags, zero candidates, unchanged total references, tag immutable fingerprint, and complete `document_tags` fingerprint, plus post `actual == projected == approved pre projected`.

Only after every check passes may a later documentation-only commit append a sanitized entry to `.design/wouldkeep-next/PRODUCTION_SAFETY.md`. Keep raw evidence outside the repository.

## Recovery

NFKC normalization is intentionally one-way. Before the write, recovery is to stop. After an unambiguous committed write with a failed postflight, preserve all evidence and backups, stop application rollout, and prepare a separately reviewed forward fix or controlled restore. Never guess original Unicode spellings or merge/delete tags.
