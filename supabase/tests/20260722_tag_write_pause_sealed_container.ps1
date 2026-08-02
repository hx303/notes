# Ephemeral runner sharing only the sealed PG17 container's network namespace.

[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("VerifyInput", "Run")]
  [string]$Mode,

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$InputRoot = "/opt/wouldkeep/input",

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$ManifestPath = "/opt/wouldkeep/input-manifest.sha256",

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$EvidenceDirectory = "/evidence"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ne 7 -or $PSVersionTable.PSVersion.Minor -ne 5) {
  throw "Exact PowerShell 7.5 is required"
}

$script:RunnerStage = "input-initial"
trap {
  $FailureRecord = $_
  if ($Mode -ceq "Run" -and
      (Test-Path -LiteralPath $EvidenceDirectory -PathType Container)) {
    $ExceptionText = $FailureRecord.Exception.ToString()
    $ExceptionType = $FailureRecord.Exception.GetType().FullName
    if ($ExceptionType -notmatch '^[A-Za-z0-9.]+Exception$') {
      $ExceptionType = "unknown"
    }
    $Bytes = [Text.UTF8Encoding]::new($false).GetBytes($ExceptionText)
    $Sha = [Security.Cryptography.SHA256]::Create()
    try {
      $ExceptionHash = ([BitConverter]::ToString($Sha.ComputeHash($Bytes))).Replace('-', '').
        ToLowerInvariant()
    } finally {
      $Sha.Dispose()
    }
    $Signals = [ordered]@{
      subprocess_failed = "subprocess failed or timed out"
      postgres_not_ready = "PostgreSQL did not become ready"
      evidence_write = "Sealed evidence"
      permission_denied = "Permission denied"
      operation_not_permitted = "Operation not permitted"
      no_such_file = "No such file or directory"
      read_only_file_system = "Read-only file system"
      attestation = "attestation"
      matrix = "matrix"
    }
    $FailureEvidence = [Collections.Generic.List[string]]::new()
    $null = $FailureEvidence.Add("tag_write_pause_sealed_runner_failed")
    $null = $FailureEvidence.Add("stage=$($script:RunnerStage)")
    $null = $FailureEvidence.Add("exception_type=$ExceptionType")
    $null = $FailureEvidence.Add("exception_sha256=$ExceptionHash")
    $null = $FailureEvidence.Add("exception_chars=$($ExceptionText.Length)")
    $null = $FailureEvidence.Add(
      "exception_lines=$([regex]::Matches($ExceptionText, '\r\n|\r|\n').Count + 1)"
    )
    foreach ($Signal in $Signals.GetEnumerator()) {
      $Present = $ExceptionText.IndexOf(
        $Signal.Value, [StringComparison]::OrdinalIgnoreCase
      ) -ge 0
      $null = $FailureEvidence.Add("signal_$($Signal.Key)=$Present")
    }
    try {
      $FailurePath = Join-Path $EvidenceDirectory "runner-failure.txt"
      [IO.File]::WriteAllLines(
        $FailurePath,
        $FailureEvidence.ToArray(),
        [Text.UTF8Encoding]::new($false)
      )
      $FailureManifestPath = Join-Path $EvidenceDirectory `
        "failure-evidence-sha256.txt"
      $FailureManifestTemporaryPath = Join-Path $EvidenceDirectory `
        ".failure-evidence-sha256.tmp"
      $FailureEvidenceRoot = [IO.Path]::GetFullPath($EvidenceDirectory)
      $FailureEvidencePaths = @(Get-ChildItem -LiteralPath $FailureEvidenceRoot `
        -File -Recurse -Force | Where-Object {
          $_.Name -notin @(
            "failure-evidence-sha256.txt",
            ".failure-evidence-sha256.tmp"
          )
        } | ForEach-Object {
          [IO.Path]::GetRelativePath($FailureEvidenceRoot, $_.FullName).Replace('\', '/')
        })
      $FailureEvidencePaths = Get-OrdinalSorted $FailureEvidencePaths
      if ($FailureEvidencePaths.Count -lt 1 -or
          $FailureEvidencePaths -cnotcontains "runner-failure.txt" -or
          @($FailureEvidencePaths | Where-Object {
              $_ -notmatch
                '^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$'
            }).Count -ne 0) {
        throw "Failure evidence path inventory is invalid"
      }
      $FailureManifestLines = @($FailureEvidencePaths | ForEach-Object {
          $FailureEvidenceFullPath = Join-Path $FailureEvidenceRoot $_
          $FailureEvidenceHash = (Get-FileHash -LiteralPath $FailureEvidenceFullPath `
            -Algorithm SHA256).Hash.ToLowerInvariant()
          "$FailureEvidenceHash  $_"
        })
      [IO.File]::WriteAllLines(
        $FailureManifestTemporaryPath,
        $FailureManifestLines,
        [Text.UTF8Encoding]::new($false)
      )
      [IO.File]::Move(
        $FailureManifestTemporaryPath,
        $FailureManifestPath,
        $false
      )
    } catch { }
    foreach ($Attempt in 1..1200) {
      if (Test-Path -LiteralPath "/tmp/wouldkeep_sealed_evidence_copied") { break }
      Start-Sleep -Milliseconds 250
    }
  }
  exit 1
}

function Get-OrdinalSorted([string[]]$Values) {
  $Copy = [string[]]@($Values)
  [Array]::Sort($Copy, [StringComparer]::Ordinal)
  return ,$Copy
}

function Assert-SealedInput() {
  $Root = [IO.Path]::GetFullPath($InputRoot)
  $Manifest = [IO.Path]::GetFullPath($ManifestPath)
  if (-not (Test-Path -LiteralPath $Root -PathType Container) -or
      -not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    throw "Sealed input root or manifest is missing"
  }

  $Lines = @(Get-Content -LiteralPath $Manifest -Encoding utf8)
  if ($Lines.Count -lt 30 -or $Lines -contains "") {
    throw "Sealed input manifest is empty, truncated, or contains blank lines"
  }

  $ManifestPaths = [Collections.Generic.List[string]]::new()
  $PriorPath = ""
  $RootPrefix = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar) +
    [IO.Path]::DirectorySeparatorChar
  foreach ($Line in $Lines) {
    if ($Line -notmatch '^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)$') {
      throw "Invalid sealed manifest line"
    }
    $ExpectedHash = $Matches[1]
    $RelativePath = $Matches[2]
    if ([IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath -match '(^|/)\.\.(/|$)' -or
        $RelativePath -match '(^|/)(?:\.env|project-ref)(?:$|\.)' -or
        $RelativePath -match '20260722000(?:150|200)') {
      throw "Forbidden sealed manifest path: $RelativePath"
    }
    if ($PriorPath.Length -gt 0 -and
        [StringComparer]::Ordinal.Compare($PriorPath, $RelativePath) -ge 0) {
      throw "Sealed manifest paths must be unique and ordinally sorted"
    }
    $PriorPath = $RelativePath

    $FullPath = [IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
    if (-not $FullPath.StartsWith($RootPrefix, [StringComparison]::Ordinal) -or
        -not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
      throw "Manifest input is missing or escaped the sealed root: $RelativePath"
    }
    $Item = Get-Item -LiteralPath $FullPath -Force
    if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Links are forbidden in sealed input: $RelativePath"
    }
    $ActualHash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not [StringComparer]::Ordinal.Equals($ActualHash, $ExpectedHash)) {
      throw "Sealed input hash mismatch: $RelativePath"
    }
    $ManifestPaths.Add($RelativePath)
  }

  $ActualPaths = @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | ForEach-Object {
    [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
  })
  $ActualPaths = Get-OrdinalSorted $ActualPaths
  if (($ActualPaths -join "`n") -cne ($ManifestPaths.ToArray() -join "`n")) {
    throw "Sealed input contains an unreviewed or missing file"
  }

  $ExpectedMigrationNames = @(
    "20260712_legacy_history_marker.sql",
    "20260714_legacy_history_marker.sql",
    "20260715_legacy_history_marker.sql",
    "20260716_legacy_history_marker.sql",
    "20260717_legacy_history_marker.sql",
    "20260718000100_knowledge_workspace_foundation.sql",
    "20260718000200_document_versions.sql",
    "20260718000300_document_organization.sql",
    "20260718000400_document_sources.sql",
    "20260718000500_publication_flow.sql",
    "20260718000600_site_owner_permissions.sql",
    "20260718000700_profile_avatars.sql",
    "20260718000800_profile_personalization.sql",
    "20260718000900_ai_assistant_foundation.sql",
    "20260718001000_ai_runtime_safety.sql",
    "20260718001100_publication_soft_delete_guard.sql",
    "20260718001200_publication_write_acl_hardening.sql",
    "20260721000100_document_links_integrity.sql",
    "20260722000100_site_owner_role_invariant.sql"
  )
  $ActualMigrationNames = @(Get-ChildItem -LiteralPath (Join-Path $Root "supabase/migrations") `
    -File -Filter "*.sql" | Select-Object -ExpandProperty Name)
  $ActualMigrationNames = Get-OrdinalSorted $ActualMigrationNames
  $ExpectedMigrationNames = Get-OrdinalSorted $ExpectedMigrationNames
  if (($ActualMigrationNames -join "`n") -cne ($ExpectedMigrationNames -join "`n") -or
      $ActualMigrationNames.Count -ne 19) {
    throw "Sealed input is not the exact 19-migration 20260722000100 baseline"
  }

  return $Lines
}

function Start-BoundedProcess([string]$FilePath, [string[]]$Arguments) {
  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $FilePath
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
    throw "Could not start sealed subprocess"
  }
  return [pscustomobject]@{
    Process = $Process
    StandardOutput = $Process.StandardOutput.ReadToEndAsync()
    StandardError = $Process.StandardError.ReadToEndAsync()
  }
}

function Complete-BoundedProcess([object]$Running, [int]$TimeoutSeconds) {
  $TimedOut = -not $Running.Process.WaitForExit($TimeoutSeconds * 1000)
  if ($TimedOut) {
    try { $Running.Process.Kill($true) } catch { }
    if (-not $Running.Process.WaitForExit(5000)) {
      throw "Timed-out sealed subprocess could not be reaped"
    }
  }
  $Running.Process.WaitForExit()
  $StandardOutputText = $Running.StandardOutput.GetAwaiter().GetResult()
  $StandardErrorText = $Running.StandardError.GetAwaiter().GetResult()
  $Result = [pscustomobject]@{
    ExitCode = $Running.Process.ExitCode
    TimedOut = $TimedOut
    StandardOutputText = $StandardOutputText
    StandardErrorText = $StandardErrorText
    Output = @(
      @($StandardOutputText -split "\r?\n" |
        Where-Object { $_.Length -gt 0 })
      @($StandardErrorText -split "\r?\n" |
        Where-Object { $_.Length -gt 0 })
    )
  }
  $Running.Process.Dispose()
  return $Result
}

function Get-SealedTextMetrics([string]$Text) {
  if ($null -eq $Text) { $Text = "" }
  $Bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
  $HashBytes = [Security.Cryptography.SHA256]::HashData($Bytes)
  return [pscustomobject]@{
    Sha256 = ([BitConverter]::ToString($HashBytes)).Replace('-', '').ToLowerInvariant()
    Characters = $Text.Length
    Utf8Bytes = $Bytes.Length
    Lines = if ($Text.Length -eq 0) {
      0
    } else {
      [regex]::Matches($Text, '\r\n|\r|\n').Count + 1
    }
  }
}

function Write-SealedSubprocessFailureDiagnostic(
  [string]$FilePath,
  [object]$Result
) {
  $ExecutableName = [IO.Path]::GetFileName($FilePath)
  if ($ExecutableName -cnotin @("psql", "pwsh") -or
      $Result.ExitCode -lt 0 -or $Result.ExitCode -gt 255) {
    throw "Sealed subprocess diagnostic input is invalid"
  }
  $Stdout = Get-SealedTextMetrics $Result.StandardOutputText
  $Stderr = Get-SealedTextMetrics $Result.StandardErrorText
  $Combined = $Result.StandardOutputText + "`n" + $Result.StandardErrorText
  $Signals = [ordered]@{
    powershell_version = "PowerShell 7 or newer is required"
    confirmation = "Exact disposable confirmation is required"
    linked = "--linked"
    database_url = "Disposable database URL"
    literal_loopback = "literal loopback IP address"
    database_name = "database name must use"
    psql_selection = "selected executable must be psql"
    evidence_outside = "Evidence directory must remain outside"
    evidence_exists = "Evidence directory must not already exist"
    required_file = "Required reviewed file is missing"
    cannot_verify_psql = "Cannot verify psql"
    matrix_incomplete = "Disposable matrix did not complete"
    permission_denied = "Permission denied"
    parameter_not_found = "A parameter cannot be found that matches parameter name"
    argument_error = "The argument"
    script_file_unrecognized = "is not recognized as the name of a script file"
    cannot_bind_argument = "Cannot bind argument to parameter"
    argument_transformation = "Cannot process argument transformation on parameter"
    get_command = "Get-Command"
    resolve_path = "Resolve-Path"
    new_item = "New-Item"
    command_not_found = "CommandNotFoundException"
    parameter_binding = "ParameterBindingException"
    item_not_found = "ItemNotFoundException"
    unauthorized_access = "UnauthorizedAccessException"
    parser_error = "ParserError"
    term_not_recognized = "The term"
    cmdlet_not_recognized = "not recognized as a name of a cmdlet"
    cannot_find_path = "Cannot find path"
    path_not_found = "PathNotFound"
    access_to_path = "Access to the path"
    strict_mode_variable = "cannot be retrieved because it has not been set"
    args_variable = "variable '$args'"
    pwsh_prefix = "pwsh:"
    marker_entry = "tag_write_pause_disposable_preflight=entry"
    marker_version = "tag_write_pause_disposable_preflight=version"
    marker_confirmation = "tag_write_pause_disposable_preflight=confirmation"
    marker_linked = "tag_write_pause_disposable_preflight=linked"
    marker_uri = "tag_write_pause_disposable_preflight=uri"
    marker_loopback = "tag_write_pause_disposable_preflight=loopback"
    marker_database_name = "tag_write_pause_disposable_preflight=database-name"
    marker_psql = "tag_write_pause_disposable_preflight=psql"
    marker_evidence_parent = "tag_write_pause_disposable_preflight=evidence-parent"
    marker_evidence_created = "tag_write_pause_disposable_preflight=evidence-created"
  }
  $Evidence = [Collections.Generic.List[string]]::new()
  foreach ($Line in @(
      "tag_write_pause_sealed_subprocess_failed",
      "executable=$ExecutableName",
      "exit_code=$($Result.ExitCode)",
      "timed_out=$($Result.TimedOut)",
      "stdout_sha256=$($Stdout.Sha256)",
      "stdout_chars=$($Stdout.Characters)",
      "stdout_utf8_bytes=$($Stdout.Utf8Bytes)",
      "stdout_lines=$($Stdout.Lines)",
      "stderr_sha256=$($Stderr.Sha256)",
      "stderr_chars=$($Stderr.Characters)",
      "stderr_utf8_bytes=$($Stderr.Utf8Bytes)",
      "stderr_lines=$($Stderr.Lines)"
    )) {
    $null = $Evidence.Add($Line)
  }
  foreach ($Signal in $Signals.GetEnumerator()) {
    $Present = $Combined.IndexOf(
      $Signal.Value,
      [StringComparison]::OrdinalIgnoreCase
    ) -ge 0
    $null = $Evidence.Add("signal_$($Signal.Key)=$Present")
  }
  Write-SealedEvidence "subprocess-failure.txt" $Evidence.ToArray()
  return "subprocess-failure.txt"
}

function Invoke-BoundedProcess(
  [string]$FilePath,
  [string[]]$Arguments,
  [int]$TimeoutSeconds,
  [int]$ExpectedExit = 0
) {
  $Result = Complete-BoundedProcess (Start-BoundedProcess $FilePath $Arguments) $TimeoutSeconds
  if ($Result.TimedOut -or $Result.ExitCode -ne $ExpectedExit) {
    $Diagnostic = Write-SealedSubprocessFailureDiagnostic $FilePath $Result
    throw "Sealed subprocess failed or timed out: $([IO.Path]::GetFileName($FilePath)); " +
      "diagnostic_evidence=$Diagnostic"
  }
  return $Result
}

$null = Assert-SealedInput
if ($Mode -ceq "VerifyInput") {
  Write-Output "tag_write_pause_sealed_input_verified"
  exit 0
}

$script:RunnerStage = "environment"
foreach ($Name in @(
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "DATABASE_URL",
    "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"
  )) {
  if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($Name))) {
    throw "A forbidden external credential is present in the sealed runner"
  }
}

$DatabaseName = [Environment]::GetEnvironmentVariable("WOULDKEEP_SEALED_DATABASE_NAME")
$SystemIdentifier = [Environment]::GetEnvironmentVariable("WOULDKEEP_SEALED_SYSTEM_IDENTIFIER")
$DatabaseContainerId = [Environment]::GetEnvironmentVariable("WOULDKEEP_SEALED_DB_CONTAINER_ID")
if ($DatabaseName -notmatch '^wouldkeep_p1b_tag_write_pause_[a-f0-9]{16}$' -or
    $SystemIdentifier -notmatch '^[0-9]+$' -or
    $DatabaseContainerId -notmatch '^[a-f0-9]{64}$') {
  throw "Sealed database identity environment is invalid"
}

foreach ($CredentialPath in @(
    "/tmp/wouldkeep-home/.supabase/access-token",
    "/tmp/wouldkeep-home/.config/supabase/access-token"
  )) {
  if (Test-Path -LiteralPath $CredentialPath) {
    throw "Supabase credentials are forbidden in the sealed runner"
  }
}

$script:RunnerStage = "evidence-initialization"
$EvidenceFull = [IO.Path]::GetFullPath($EvidenceDirectory)
$InputFull = [IO.Path]::GetFullPath($InputRoot)
if ($EvidenceFull.Equals($InputFull, [StringComparison]::Ordinal) -or
    $EvidenceFull.StartsWith(
      $InputFull.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar,
      [StringComparison]::Ordinal
    ) -or -not (Test-Path -LiteralPath $EvidenceFull -PathType Container)) {
  throw "Runner evidence path must be an existing tmpfs directory outside sealed input"
}
$EvidenceItem = Get-Item -LiteralPath $EvidenceFull -Force -ErrorAction Stop
if (($EvidenceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    @(Get-ChildItem -LiteralPath $EvidenceFull -Force -ErrorAction Stop).Count -ne 0) {
  throw "Runner evidence tmpfs must be empty and must not be a link"
}

function Write-SealedEvidence([string]$Name, [object[]]$Value) {
  if ($Name -notmatch '^[a-z0-9-]+\.txt$') {
    throw "Invalid sealed evidence filename"
  }
  $Path = Join-Path $EvidenceFull $Name
  @($Value) | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path).Length -le 0) {
    throw "Sealed evidence is empty: $Name"
  }
}

$script:RunnerStage = "toolchain"
$PsqlPath = "/opt/pg17/bin/psql"
$PgIsReadyPath = "/opt/pg17/bin/pg_isready"
$PwshPath = "/opt/microsoft/powershell/7/pwsh"
foreach ($Path in @(
    $PsqlPath,
    $PgIsReadyPath,
    $PwshPath,
    "/usr/bin/cat",
    "/usr/bin/find",
    "/usr/bin/stat"
  )) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required sealed runner executable is missing: $Path"
  }
}

$script:RunnerStage = "psql-version"
$PsqlVersion = Invoke-BoundedProcess $PsqlPath @("--version") 10
if (($PsqlVersion.Output -join "`n") -notmatch '^psql \(PostgreSQL\) 17\.6(?:[ .]|$)') {
  throw "Exact PostgreSQL 17.6 client is required"
}
Write-SealedEvidence "psql-version.txt" $PsqlVersion.Output
Write-SealedEvidence "runner-identity.txt" @(
  "database_container_id=$DatabaseContainerId",
  "database_name=$DatabaseName",
  "network_namespace=$((Get-Item -LiteralPath '/proc/1/ns/net').Target)"
)
Write-SealedEvidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
$script:RunnerStage = "database-ready"
$Ready = $false
foreach ($Attempt in 1..60) {
  $Probe = Complete-BoundedProcess (Start-BoundedProcess $PgIsReadyPath @(
    "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=$DatabaseName"
  )) 5
  if (-not $Probe.TimedOut -and $Probe.ExitCode -eq 0) {
    $Ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}
if (-not $Ready) {
  throw "Sealed PostgreSQL did not become ready within the bounded poll"
}

$AttestationFile = Join-Path $InputFull `
  "supabase/tests/20260722_tag_write_pause_sealed_attestation.sql"
$AttestationArguments = @(
  "-X", "--csv", "--host=127.0.0.1", "--port=5432", "--username=postgres",
  "--dbname=$DatabaseName", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
  "--set=wouldkeep_p1b_tag_write_pause_sealed=true",
  "--set=sealed_database_name=$DatabaseName",
  "--set=sealed_system_identifier=$SystemIdentifier",
  "--file=$AttestationFile"
)

$script:RunnerStage = "attestation-before"
$Before = Invoke-BoundedProcess $PsqlPath $AttestationArguments 30
if ([regex]::Matches(
    ($Before.Output -join "`n"),
    "tag_write_pause_sealed_attestation_passed"
  ).Count -ne 1) {
  throw "Pre-matrix sealed attestation marker is missing or repeated"
}
Write-SealedEvidence "attestation-before.txt" $Before.Output

$MatrixEvidence = Join-Path $EvidenceFull "matrix"
$Harness = Join-Path $InputFull "supabase/tests/20260722_tag_write_pause_disposable.ps1"
$DatabaseUrl = "postgresql://postgres@127.0.0.1:5432/$DatabaseName"
$script:RunnerStage = "matrix"
$Matrix = Invoke-BoundedProcess $PwshPath @(
  "-NoLogo", "-NoProfile", "-File", $Harness,
  "-DisposableDbUrl", $DatabaseUrl,
  "-Confirmation", "I_UNDERSTAND_THIS_IS_A_THROWAWAY_LOOPBACK_DATABASE",
  "-EvidenceDirectory", $MatrixEvidence,
  "-Psql", $PsqlPath,
  "-CommandTimeoutSeconds", "30"
) 600
if ([regex]::Matches(
    ($Matrix.Output -join "`n"),
    "(?m)^tag_write_pause_disposable_matrix_passed\r?$"
  ).Count -ne 1) {
  throw "Reviewed disposable matrix marker is missing or repeated"
}
Write-SealedEvidence "matrix-result.txt" $Matrix.Output

$script:RunnerStage = "attestation-after"
$After = Invoke-BoundedProcess $PsqlPath $AttestationArguments 30
if ([regex]::Matches(
    ($After.Output -join "`n"),
    "tag_write_pause_sealed_attestation_passed"
  ).Count -ne 1) {
  throw "Post-matrix sealed attestation marker is missing or repeated"
}
Write-SealedEvidence "attestation-after.txt" $After.Output

$script:RunnerStage = "input-reverify"
$null = Assert-SealedInput
Write-SealedEvidence "input-reverified.txt" @("tag_write_pause_sealed_input_reverified")

$script:RunnerStage = "evidence-manifest"
$EvidenceRelativePaths = @(Get-ChildItem -LiteralPath $EvidenceFull -File -Recurse |
  ForEach-Object {
    [IO.Path]::GetRelativePath($EvidenceFull, $_.FullName).Replace('\', '/')
  } | Where-Object {
    $_ -cne "evidence-sha256.txt" -and $_ -cne "completed-utc.txt"
  })
$EvidenceRelativePaths = Get-OrdinalSorted $EvidenceRelativePaths
$EvidenceFiles = @($EvidenceRelativePaths | ForEach-Object {
  $FullPath = Join-Path $EvidenceFull $_
  $Hash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$Hash  $_"
})
Write-SealedEvidence "evidence-sha256.txt" $EvidenceFiles
Write-SealedEvidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))
Write-Output "tag_write_pause_sealed_matrix_passed"
[Console]::Out.Flush()

# Keep the tmpfs evidence alive until the host copies and acknowledges it.
$script:RunnerStage = "host-acknowledgement"
$EvidenceCopied = $false
foreach ($Attempt in 1..1200) {
  if (Test-Path -LiteralPath "/tmp/wouldkeep_sealed_evidence_copied") {
    $EvidenceCopied = $true
    break
  }
  Start-Sleep -Milliseconds 250
}
if (-not $EvidenceCopied) {
  throw "Host did not acknowledge sealed evidence within the bounded hold"
}
