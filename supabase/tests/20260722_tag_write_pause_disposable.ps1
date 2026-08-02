# Disposable PostgreSQL 17 harness for the temporary tag-write pause gate.
# This script never starts a database and never accepts Supabase --linked mode.

[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$DisposableDbUrl,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Confirmation,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$EvidenceDirectory,

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$Psql = "psql",

  [Parameter(Mandatory = $false)]
  [ValidateRange(5, 120)]
  [int]$CommandTimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-DisposablePreflightMarker([string]$Stage) {
  if ($Stage -notin @(
      "entry", "version", "confirmation", "linked", "uri", "loopback",
      "database-name", "psql", "evidence-parent", "evidence-created"
    )) {
    throw "Disposable preflight marker is invalid"
  }
  Write-Output "tag_write_pause_disposable_preflight=$Stage"
  [Console]::Out.Flush()
}

Write-DisposablePreflightMarker "entry"
if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "PowerShell 7 or newer is required"
}
Write-DisposablePreflightMarker "version"
if ($Confirmation -cne "I_UNDERSTAND_THIS_IS_A_THROWAWAY_LOOPBACK_DATABASE") {
  throw "Exact disposable confirmation is required"
}
Write-DisposablePreflightMarker "confirmation"
$LinkedRequested = $DisposableDbUrl -match "(?i)--linked"
foreach ($UnboundArgument in @($MyInvocation.UnboundArguments)) {
  if ($null -ne $UnboundArgument -and $UnboundArgument.ToString() -ceq "--linked") {
    $LinkedRequested = $true
  }
}
if ($LinkedRequested) {
  throw "Supabase --linked mode is forbidden for this disposable harness"
}
Write-DisposablePreflightMarker "linked"

try {
  $DatabaseUri = [Uri]$DisposableDbUrl
} catch {
  throw "Disposable database URL is invalid"
}
if ($DatabaseUri.Scheme -notin @("postgres", "postgresql")) {
  throw "Disposable database URL must use postgres or postgresql"
}
if (-not [string]::IsNullOrEmpty($DatabaseUri.Query) -or
    -not [string]::IsNullOrEmpty($DatabaseUri.Fragment)) {
  throw "Disposable database URL must not contain query parameters or a fragment"
}
Write-DisposablePreflightMarker "uri"

$HostText = $DatabaseUri.Host.Trim([char[]]"[]")
$HostAddress = $null
$IsLiteralLoopback = [Net.IPAddress]::TryParse($HostText, [ref]$HostAddress) -and
  [Net.IPAddress]::IsLoopback($HostAddress)
if (-not $IsLiteralLoopback) {
  throw "Disposable database host must be a literal loopback IP address"
}
Write-DisposablePreflightMarker "loopback"

$DatabaseName = [Uri]::UnescapeDataString($DatabaseUri.AbsolutePath.TrimStart([char]"/"))
if ($DatabaseName -notmatch "^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$") {
  throw "Disposable database name must use the wouldkeep_p1b_tag_write_pause_ prefix"
}
Write-DisposablePreflightMarker "database-name"

$SuperuserUriBuilder = [UriBuilder]::new($DatabaseUri)
$SuperuserUriBuilder.UserName = "supabase_admin"
$SuperuserUriBuilder.Password = ""
$SuperuserDbUrl = $SuperuserUriBuilder.Uri.AbsoluteUri

$PsqlCommand = Get-Command $Psql -CommandType Application -ErrorAction Stop
$PsqlPath = $PsqlCommand.Source
if ([IO.Path]::GetFileNameWithoutExtension($PsqlPath) -cne "psql") {
  throw "The selected executable must be psql"
}
Write-DisposablePreflightMarker "psql"

$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
$EvidenceParent = Resolve-Path -LiteralPath (Split-Path -Parent $EvidenceDirectory) -ErrorAction Stop
$EvidenceFull = [IO.Path]::GetFullPath((Join-Path $EvidenceParent.Path (Split-Path -Leaf $EvidenceDirectory)))
$RepositoryPrefix = $RepositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($EvidenceFull.Equals($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $EvidenceFull.StartsWith($RepositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Evidence directory must remain outside the repository"
}
if (Test-Path -LiteralPath $EvidenceFull) {
  throw "Evidence directory must not already exist"
}
Write-DisposablePreflightMarker "evidence-parent"
New-Item -ItemType Directory -Path $EvidenceFull -ErrorAction Stop | Out-Null
Write-DisposablePreflightMarker "evidence-created"

$Files = [ordered]@{
  Baseline = "supabase/tests/20260722_tag_write_pause_disposable_baseline.sql"
  Writer = "supabase/tests/20260722_tag_write_pause_disposable_writer.sql"
  WriterState = "supabase/tests/20260722_tag_write_pause_disposable_writer_state.sql"
  WriterAbsent = "supabase/tests/20260722_tag_write_pause_disposable_writer_absent.sql"
  WriterRelease = "supabase/tests/20260722_tag_write_pause_disposable_writer_release.sql"
  Setup = "supabase/tests/20260722_tag_write_pause_disposable_setup.sql"
  State = "supabase/tests/20260722_tag_write_pause_state.sql"
  Enable = "supabase/operations/20260722_tag_write_pause_enable.sql"
  Behavior = "supabase/tests/20260722_tag_write_pause_behavior.sql"
  Extended = "supabase/tests/20260722_tag_write_pause_disposable_extended.sql"
  CopyFrom = "supabase/tests/20260722_tag_write_pause_disposable_copy_from.sql"
  CommentDrift = "supabase/tests/20260722_tag_write_pause_disposable_comment_drift.sql"
  ActivePresence = "supabase/tests/20260722_tag_write_pause_disposable_active_presence.sql"
  CommentRestore = "supabase/tests/20260722_tag_write_pause_disposable_comment_restore.sql"
  Disable = "supabase/operations/20260722_tag_write_pause_disable.sql"
  Cleanup = "supabase/tests/20260722_tag_write_pause_disposable_cleanup.sql"
  Residue = "supabase/tests/20260722_tag_write_pause_disposable_residue.sql"
}
foreach ($Key in @($Files.Keys)) {
  $FullPath = Join-Path $RepositoryRoot $Files[$Key]
  if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
    throw "Required reviewed file is missing: $Key"
  }
  $Files[$Key] = $FullPath
}

$script:DisposableDbUrl = $DisposableDbUrl
$script:SuperuserDbUrl = $SuperuserDbUrl
$script:EvidenceFull = $EvidenceFull
$script:PsqlPath = $PsqlPath
$script:SecretUserInfo = $DatabaseUri.UserInfo
$script:CommandTimeoutSeconds = $CommandTimeoutSeconds

function ConvertTo-SafeEvidence([object[]]$Output) {
  return @($Output | ForEach-Object {
    $Line = $_.ToString().Replace($script:DisposableDbUrl, "<redacted-disposable-db-url>")
    $Line = $Line.Replace($script:SuperuserDbUrl, "<redacted-disposable-superuser-db-url>")
    if (-not [string]::IsNullOrEmpty($script:SecretUserInfo)) {
      $Line = $Line.Replace($script:SecretUserInfo, "<redacted-userinfo>")
    }
    $Line
  })
}

function Write-Evidence([string]$Name, [object[]]$Value) {
  if ($Name -notmatch "^[a-z0-9-]+\.txt$") {
    throw "Evidence filename is not fixed and safe"
  }
  $Path = Join-Path $script:EvidenceFull $Name
  $SafeValue = ConvertTo-SafeEvidence $Value
  $SafeValue | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -le 0) {
    throw "Evidence is empty: $Name"
  }
}

function Start-PsqlProcess([string[]]$Arguments) {
  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $script:PsqlPath
  $StartInfo.UseShellExecute = $false
  $StartInfo.CreateNoWindow = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  foreach ($Argument in $Arguments) {
    $null = $StartInfo.ArgumentList.Add($Argument)
  }

  $Process = [Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  if (-not $Process.Start()) {
    $Process.Dispose()
    throw "Could not start bounded psql process"
  }
  return [pscustomobject]@{
    Process = $Process
    StandardOutput = $Process.StandardOutput.ReadToEndAsync()
    StandardError = $Process.StandardError.ReadToEndAsync()
    Reaped = $false
    Result = $null
  }
}

function Complete-PsqlProcess([object]$Running, [int]$TimeoutSeconds) {
  if ($Running.Reaped) {
    return $Running.Result
  }
  $TimedOut = $false
  $TimedOut = -not $Running.Process.WaitForExit($TimeoutSeconds * 1000)
  if ($TimedOut) {
    try {
      $Running.Process.Kill($true)
    } catch {
      # The bounded reap below remains authoritative.
    }
    if (-not $Running.Process.WaitForExit(5000)) {
      throw "Timed-out psql process could not be reaped"
    }
  }
  $Running.Process.WaitForExit()
  $ExitCode = $Running.Process.ExitCode
  $StandardOutput = $Running.StandardOutput.GetAwaiter().GetResult()
  $StandardError = $Running.StandardError.GetAwaiter().GetResult()
  $Output = @(
    @($StandardOutput -split "\r?\n" | Where-Object { $_.Length -gt 0 })
    @($StandardError -split "\r?\n" | Where-Object { $_.Length -gt 0 })
  )
  if ($TimedOut) {
    $Output += "wouldkeep_disposable_process_timeout"
  }
  $Result = [pscustomobject]@{
    ExitCode = $ExitCode
    Output = $Output
    TimedOut = $TimedOut
  }
  $Running.Result = $Result
  $Running.Reaped = $true
  $Running.Process.Dispose()
  return $Result
}

function Invoke-PsqlFile(
  [string]$EvidenceName,
  [string]$File,
  [int]$ExpectedExit,
  [string[]]$ExpectedPatterns,
  [string]$ConnectionUrl = $script:DisposableDbUrl
) {
  if ($ConnectionUrl -cnotin @($script:DisposableDbUrl, $script:SuperuserDbUrl)) {
    throw "Disposable psql connection URL is not one of the two reviewed local identities"
  }
  $Arguments = @(
    "-X", "--csv", "--dbname=$ConnectionUrl",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
    "--set=wouldkeep_p1b_tag_write_pause_disposable=true",
    "--file=$File"
  )
  $Running = Start-PsqlProcess $Arguments
  $Result = Complete-PsqlProcess $Running $script:CommandTimeoutSeconds
  $Output = @($Result.Output)
  Write-Evidence "$EvidenceName.txt" $Output
  if ($Result.TimedOut) {
    throw "$EvidenceName exceeded the exact subprocess timeout"
  }
  if ($Result.ExitCode -ne $ExpectedExit) {
    throw "$EvidenceName exited $($Result.ExitCode) instead of exact expected exit $ExpectedExit"
  }
  $Text = $Output -join "`n"
  foreach ($Pattern in $ExpectedPatterns) {
    if ([regex]::Matches($Text, $Pattern).Count -ne 1) {
      throw "$EvidenceName did not emit exactly one required pattern: $Pattern"
    }
  }
  return ,$Output
}

function Get-GateState([object[]]$Output) {
  $Pattern = "tag_write_pause_state\|gate=(absent|active)\|catalog=([0-9a-f]{64})\|acl=([0-9a-f]{64})\|rls_policies=([0-9a-f]{64})\|nongate_triggers=([0-9a-f]{64})\|schema_oid=(\d+)\|function_oid=(\d+)\|tags_trigger_oid=(\d+)\|document_tags_trigger_oid=(\d+)"
  $Matches = @([regex]::Matches(($Output -join "`n"), $Pattern))
  if ($Matches.Count -ne 1) {
    throw "Gate state row is missing or repeated"
  }
  $Match = $Matches[0]
  return [pscustomobject]@{
    Gate = $Match.Groups[1].Value
    Baseline = ($Match.Groups[2].Value, $Match.Groups[3].Value,
      $Match.Groups[4].Value, $Match.Groups[5].Value) -join "|"
    SchemaOid = [uint32]$Match.Groups[6].Value
    FunctionOid = [uint32]$Match.Groups[7].Value
    TagsTriggerOid = [uint32]$Match.Groups[8].Value
    DocumentTagsTriggerOid = [uint32]$Match.Groups[9].Value
    Line = $Match.Value
  }
}

function Invoke-GateState([string]$EvidenceName) {
  $Output = Invoke-PsqlFile $EvidenceName $Files.State 0 @("tag_write_pause_state\|gate=")
  return Get-GateState $Output
}

function Assert-GateAbsent([object]$State, [string]$Label) {
  if ($State.Gate -cne "absent" -or $State.SchemaOid -ne 0 -or
      $State.FunctionOid -ne 0 -or $State.TagsTriggerOid -ne 0 -or
      $State.DocumentTagsTriggerOid -ne 0) {
    throw "$Label is not exact absent state"
  }
}

function Assert-GateActive([object]$State, [object]$Initial, [string]$Label) {
  if ($State.Gate -cne "active" -or $State.SchemaOid -eq 0 -or
      $State.FunctionOid -eq 0 -or $State.TagsTriggerOid -eq 0 -or
      $State.DocumentTagsTriggerOid -eq 0 -or $State.Baseline -cne $Initial.Baseline) {
    throw "$Label is not exact active state on the initial catalog baseline"
  }
}

function Assert-ResidueZero([object[]]$Output, [string]$Label) {
  $Pattern = "(?m)^0,0,0,0,0,0,0,0,0,tag_write_pause_disposable_residue_zero\r?$"
  if ([regex]::Matches(($Output -join "`n"), $Pattern).Count -ne 1) {
    throw "$Label did not prove exact zero residue"
  }
}

function Start-ControlledWriter() {
  $Arguments = @(
    "-X", "--csv", "--dbname=$($script:DisposableDbUrl)",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
    "--set=wouldkeep_p1b_tag_write_pause_disposable=true",
    "--set=wouldkeep_p1b_tag_write_pause_hold_seconds=60",
    "--file=$($Files.Writer)"
  )
  return Start-PsqlProcess $Arguments
}

function Wait-ControlledWriterReady([object]$Writer) {
  foreach ($Attempt in 1..20) {
    if ($Writer.Process.HasExited) {
      throw "Controlled writer exited before its RowExclusive lock was observed"
    }
    $EvidenceName = "writer-state-poll-{0:d2}" -f $Attempt
    $Output = Invoke-PsqlFile $EvidenceName $Files.WriterState 0 @(
      "(?m)^tag_write_pause_disposable_writer_(?:ready|not_ready)\r?$"
    )
    if ([regex]::Matches(
        ($Output -join "`n"),
        "(?m)^tag_write_pause_disposable_writer_ready\r?$"
      ).Count -eq 1) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Controlled writer RowExclusive lock was not observed within the bounded poll"
}

function Stop-ControlledWriter([object]$Writer, [string]$EvidenceName) {
  $WasRunning = $false
  if (-not $Writer.Reaped) {
    $WasRunning = -not $Writer.Process.HasExited
    if ($WasRunning) {
      Invoke-PsqlFile "$EvidenceName-backend" $Files.WriterRelease 0 @(
        "(?m)^tag_write_pause_disposable_writer_backend_terminated\r?$"
      ) | Out-Null
      if (-not $Writer.Process.WaitForExit(5000)) {
        try {
          $Writer.Process.Kill($true)
        } catch {
          # The bounded reap below remains authoritative and preserves the handle on failure.
        }
        throw "Controlled writer client did not exit after its backend was terminated"
      }
    }
  }
  $Result = Complete-PsqlProcess $Writer 5
  $Output = @(
    "tag_write_pause_disposable_writer_release_requested"
    "writer_was_running=$($WasRunning.ToString().ToLowerInvariant())"
    "writer_exit_code=$($Result.ExitCode)"
  ) + @($Result.Output)
  Write-Evidence "$EvidenceName.txt" $Output
  if ($Result.TimedOut) {
    throw "Controlled writer required timeout termination"
  }
  if ($WasRunning -and $Result.ExitCode -notin @(1, 2, 3)) {
    throw "Controlled writer client exit was unexpected after backend termination"
  }
}

function Wait-ControlledWriterAbsent([string]$EvidencePrefix) {
  foreach ($Attempt in 1..20) {
    $EvidenceName = "$EvidencePrefix-{0:d2}" -f $Attempt
    $Output = Invoke-PsqlFile $EvidenceName $Files.WriterAbsent 0 @(
      "(?m)^tag_write_pause_disposable_writer_(?:absent|still_present)\r?$"
    )
    if ([regex]::Matches(
        ($Output -join "`n"),
        "(?m)^tag_write_pause_disposable_writer_absent\r?$"
      ).Count -eq 1) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Controlled writer remained visible after bounded release polling"
}

$PsqlVersionResult = Complete-PsqlProcess (Start-PsqlProcess @("--version")) $CommandTimeoutSeconds
$PsqlVersion = @($PsqlVersionResult.Output)
if ($PsqlVersionResult.TimedOut -or $PsqlVersionResult.ExitCode -ne 0 -or $PsqlVersion.Count -ne 1) {
  throw "Cannot verify psql"
}
Write-Evidence "psql-version.txt" $PsqlVersion
$Manifest = @($Files.GetEnumerator() | ForEach-Object {
  $Hash = Get-FileHash -LiteralPath $_.Value -Algorithm SHA256
  "$($_.Key) $($Hash.Hash)"
})
Write-Evidence "reviewed-files-sha256.txt" $Manifest
Write-Evidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

$FixtureMayExist = $false
$GateMayBeActive = $false
$CommentDriftApplied = $false
$Completed = $false
$InitialState = $null
$WriterRunning = $null
$WriterAbsentConfirmed = $true

try {
  Invoke-PsqlFile "baseline-initial" $Files.Baseline 0 @("tag_write_pause_disposable_baseline_passed") | Out-Null
  $InitialResidue = Invoke-PsqlFile "residue-initial" $Files.Residue 0 @("tag_write_pause_disposable_residue_zero")
  Assert-ResidueZero $InitialResidue "Initial residue"

  $ContentionInitialState = Invoke-GateState "state-before-writer"
  Assert-GateAbsent $ContentionInitialState "Before writer"
  $WriterRunning = Start-ControlledWriter
  $WriterAbsentConfirmed = $false
  Wait-ControlledWriterReady $WriterRunning

  # The enable transaction must fail at the first NOWAIT relation lock. Setting
  # this flag before the attempt makes recovery conservative if it ever succeeds.
  $GateMayBeActive = $true
  Invoke-PsqlFile "enable-rejected-by-writer" $Files.Enable 3 @(
    "55P03",
    "could not obtain lock"
  ) | Out-Null
  $AfterContentionState = Invoke-GateState "state-after-writer-rejection"
  Assert-GateAbsent $AfterContentionState "After writer rejection"
  if (-not [StringComparer]::Ordinal.Equals(
      $AfterContentionState.Line,
      $ContentionInitialState.Line
    )) {
    throw "Rejected enable did not preserve the exact absent catalog state"
  }
  $GateMayBeActive = $false
  $AfterContentionResidue = Invoke-PsqlFile "residue-after-writer-rejection" $Files.Residue 0 @(
    "tag_write_pause_disposable_residue_zero"
  )
  Assert-ResidueZero $AfterContentionResidue "After writer rejection"
  Invoke-PsqlFile "writer-state-after-rejection" $Files.WriterState 0 @(
    "(?m)^tag_write_pause_disposable_writer_ready\r?$"
  ) | Out-Null

  Stop-ControlledWriter $WriterRunning "writer-controlled-release"
  $WriterRunning = $null
  Wait-ControlledWriterAbsent "writer-absent-poll"
  $WriterAbsentConfirmed = $true

  Invoke-PsqlFile "fixture-setup" $Files.Setup 0 @("tag_write_pause_disposable_setup_passed") | Out-Null
  $FixtureMayExist = $true
  $InitialState = Invoke-GateState "state-absent"
  Assert-GateAbsent $InitialState "Initial"
  if (-not [StringComparer]::Ordinal.Equals($InitialState.Line, $ContentionInitialState.Line)) {
    throw "Fixture setup changed the protected gate/catalog baseline"
  }

  $GateMayBeActive = $true
  Invoke-PsqlFile "gate-enable" $Files.Enable 0 @("tag_write_pause_enabled") | Out-Null
  $ActiveState = Invoke-GateState "state-active"
  Assert-GateActive $ActiveState $InitialState "Active"

  Invoke-PsqlFile "behavior-24" $Files.Behavior 0 @(
    "tag_write_pause_behavior_passed",
    "tag_write_pause_behavior_counts",
    "(?:^|,)4(?:,|$)",
    "(?:^|,)24(?:,|$)",
    "55000",
    "42501"
  ) | Out-Null

  Invoke-PsqlFile "extended-matrix" $Files.Extended 0 @(
    "tag_write_pause_disposable_extended_passed",
    "(?:^|,)6(?:,|$)"
  ) -ConnectionUrl $script:SuperuserDbUrl | Out-Null

  Invoke-PsqlFile "copy-from" $Files.CopyFrom 3 @(
    "55000",
    "wouldkeep_tag_writes_paused"
  ) | Out-Null

  $AfterCoverageState = Invoke-GateState "state-active-after-coverage"
  Assert-GateActive $AfterCoverageState $InitialState "After coverage"

  Invoke-PsqlFile "comment-drift" $Files.CommentDrift 0 @(
    "tag_write_pause_disposable_comment_drift_applied"
  ) | Out-Null
  $CommentDriftApplied = $true

  Invoke-PsqlFile "state-rejected-on-drift" $Files.State 3 @(
    "55000",
    "wouldkeep_tag_write_pause_object_drift"
  ) | Out-Null
  Invoke-PsqlFile "disable-rejected-on-drift" $Files.Disable 3 @(
    "55000",
    "wouldkeep_tag_write_pause_object_drift"
  ) | Out-Null
  Invoke-PsqlFile "active-after-failed-disable" $Files.ActivePresence 0 @(
    "tag_write_pause_disposable_active_after_failed_disable"
  ) | Out-Null
  Invoke-PsqlFile "behavior-24-after-failed-disable" $Files.Behavior 0 @(
    "tag_write_pause_behavior_passed",
    "tag_write_pause_behavior_counts",
    "(?:^|,)24(?:,|$)",
    "55000",
    "42501"
  ) | Out-Null

  Invoke-PsqlFile "comment-restore" $Files.CommentRestore 0 @(
    "tag_write_pause_disposable_comment_restored"
  ) | Out-Null
  $CommentDriftApplied = $false
  $RestoredActiveState = Invoke-GateState "state-active-after-comment-restore"
  Assert-GateActive $RestoredActiveState $InitialState "Restored active"

  Invoke-PsqlFile "gate-disable" $Files.Disable 0 @("tag_write_pause_disabled") | Out-Null
  $GateMayBeActive = $false
  $ReleasedState = Invoke-GateState "state-released"
  Assert-GateAbsent $ReleasedState "Released"
  if (-not [StringComparer]::Ordinal.Equals($ReleasedState.Line, $InitialState.Line)) {
    throw "Released state does not exactly equal the initial same-database state"
  }

  Invoke-PsqlFile "fixture-cleanup" $Files.Cleanup 0 @("tag_write_pause_disposable_cleanup_passed") | Out-Null
  $FixtureMayExist = $false
  $FinalResidue = Invoke-PsqlFile "residue-final" $Files.Residue 0 @(
    "tag_write_pause_disposable_residue_zero"
  )
  Assert-ResidueZero $FinalResidue "Final residue"
  Invoke-PsqlFile "baseline-final" $Files.Baseline 0 @("tag_write_pause_disposable_baseline_passed") | Out-Null

  Write-Evidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))
  $Completed = $true
} finally {
  $WriterCleanupFailure = $null
  if ($null -ne $WriterRunning) {
    try {
      Stop-ControlledWriter $WriterRunning "writer-emergency-release"
      $WriterRunning = $null
    } catch {
      $WriterCleanupFailure = $_.Exception.Message
    }
  }
  if ($null -eq $WriterRunning -and -not $WriterAbsentConfirmed) {
    try {
      Wait-ControlledWriterAbsent "writer-emergency-absent-poll"
      $WriterAbsentConfirmed = $true
    } catch {
      $WriterCleanupFailure = $_.Exception.Message
    }
  }

  if (-not $Completed) {
    $Recovery = [Collections.Generic.List[string]]::new()
    $Recovery.Add("Disposable harness failed; recovery is best-effort and the database remains throwaway.")
    if ($null -ne $WriterCleanupFailure) {
      $Recovery.Add("Controlled writer cleanup failed: $WriterCleanupFailure. Discard the throwaway database.")
    } else {
      $Recovery.Add("Controlled writer is absent or was never started.")
    }

    if ($CommentDriftApplied) {
      try {
        Invoke-PsqlFile "recovery-active-presence" $Files.ActivePresence 0 @(
          "tag_write_pause_disposable_active_after_failed_disable"
        ) | Out-Null
        Invoke-PsqlFile "recovery-comment-restore" $Files.CommentRestore 0 @(
          "tag_write_pause_disposable_comment_restored"
        ) | Out-Null
        $CommentDriftApplied = $false
        $Recovery.Add("Restored the one exact disposable trigger comment.")
      } catch {
        $Recovery.Add("Comment recovery failed; leave the throwaway database paused and discard it.")
      }
    }

    if ($GateMayBeActive -and -not $CommentDriftApplied) {
      try {
        $RecoveryState = Invoke-GateState "recovery-state"
        if ($RecoveryState.Gate -ceq "active") {
          Invoke-PsqlFile "recovery-disable" $Files.Disable 0 @("tag_write_pause_disabled") | Out-Null
        }
        $GateMayBeActive = $false
        $Recovery.Add("Recovered the exact active or absent gate state.")
      } catch {
        $Recovery.Add("Gate recovery failed or drifted; leave the throwaway database paused and discard it.")
      }
    }

    if ($FixtureMayExist -and -not $GateMayBeActive -and -not $CommentDriftApplied) {
      try {
        Invoke-PsqlFile "recovery-cleanup" $Files.Cleanup 0 @(
          "tag_write_pause_disposable_cleanup_passed"
        ) | Out-Null
        $FixtureMayExist = $false
        $RecoveryResidue = Invoke-PsqlFile "recovery-residue" $Files.Residue 0 @(
          "tag_write_pause_disposable_residue_zero"
        )
        Assert-ResidueZero $RecoveryResidue "Recovery residue"
        $Recovery.Add("Removed fixed disposable fixtures and proved zero residue.")
      } catch {
        $Recovery.Add("Fixture cleanup failed; discard the explicitly throwaway database.")
      }
    }

    try {
      Write-Evidence "recovery-status.txt" $Recovery
    } catch {
      # Preserve the original failure. The database-name contract still makes this throwaway.
    }
  }
}

if (-not $Completed) {
  throw "Disposable matrix did not complete"
}

Write-Output "tag_write_pause_disposable_matrix_passed"
