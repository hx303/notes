# Host orchestrator for a disposable, content-addressed Supabase PG17 matrix.
# It never links a project and never accepts a database URL or access token.

[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$SupabaseCli,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$EvidenceDirectory,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Confirmation,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$FirewallConfirmation,

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$Docker = "docker"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "PowerShell 7 or newer is required"
}
if ($Confirmation -cne "I_UNDERSTAND_THIS_BUILDS_AND_DESTROYS_A_SEALED_LOCAL_PG17_ENVIRONMENT") {
  throw "Exact sealed-environment confirmation is required"
}
if ($FirewallConfirmation -cne
    "I_AUTHORIZE_TEMPORARY_NON_LOOPBACK_FIREWALL_BLOCK_FOR_SEALED_LOCAL_PG17") {
  throw "Independent exact temporary-firewall confirmation is required"
}
if (($SupabaseCli, $EvidenceDirectory, $Docker) -match '(?i)--linked') {
  throw "Supabase --linked mode is forbidden"
}
foreach ($Name in @(
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "DATABASE_URL",
    "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
    "DOCKER_CONFIG", "SUPABASE_INTERNAL_IMAGE_REGISTRY", "INTERNAL_IMAGE_REGISTRY",
    "BITBUCKET_CLONE_DIR"
  )) {
  if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($Name))) {
    throw "Remove external credentials from the host environment before sealed verification"
  }
}

$SupabasePostgresImage =
  "public.ecr.aws/supabase/postgres:17.6.1.143@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8"
$SupabaseCliSha256 = "22c0f28f013411c7a7b880116cd33636edb955a64278914692eea010bcc98dc7"
$SupabaseMutableTag = "public.ecr.aws/supabase/postgres:17.6.1.143"
$PostgresRunnerImage =
  "public.ecr.aws/docker/library/postgres:17.6-bookworm@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3"
$PowerShellImage =
  "mcr.microsoft.com/powershell:7.5-debian-12@sha256:7ab5bd5ca6f95a3351fa0c6a1205237d57048c94542355aab55519a0861a9b25"
$PinnedCliImages = @(
  [pscustomobject]@{
    Service = "db"
    Tag = $SupabaseMutableTag
    Exact = $SupabasePostgresImage
  },
  [pscustomobject]@{
    Service = "auth"
    Tag = "public.ecr.aws/supabase/gotrue:v2.192.0"
    Exact = "public.ecr.aws/supabase/gotrue:v2.192.0@sha256:288d880ebc80a1cb5ad52dc7d12328f76e9c90127003306864a270118bba00a8"
  },
  [pscustomobject]@{
    Service = "storage"
    Tag = "public.ecr.aws/supabase/storage-api:v1.62.5"
    Exact = "public.ecr.aws/supabase/storage-api:v1.62.5@sha256:28f8a3cc5dd81b1b13098ca12460883ecb911d017a371b4b5efcb3ec432c1f1e"
  },
  [pscustomobject]@{
    Service = "realtime-disabled"
    Tag = "public.ecr.aws/supabase/realtime:v2.112.6"
    Exact = "public.ecr.aws/supabase/realtime:v2.112.6@sha256:5f5377bf9d1f0e6b59fe6a0cb57e9ff65f9960eed5b43e93862969f81c44acae"
  }
)
$ExpectedCliImageAliases = [ordered]@{
  db = "public.ecr.aws/supabase/postgres:17.6.1.143"
  auth = "public.ecr.aws/supabase/gotrue:v2.192.0"
  storage = "public.ecr.aws/supabase/storage-api:v1.62.5"
  "realtime-disabled" = "public.ecr.aws/supabase/realtime:v2.112.6"
}
if ($PinnedCliImages.Count -ne $ExpectedCliImageAliases.Count -or
    @($PinnedCliImages | ForEach-Object { $_.Tag } | Sort-Object -Unique).Count -ne 4) {
  throw "The reviewed Supabase CLI image alias set is not exact"
}
foreach ($PinnedCliImage in $PinnedCliImages) {
  $ExpectedExactPrefix = "$($PinnedCliImage.Tag)@sha256:"
  if (-not $ExpectedCliImageAliases.Contains($PinnedCliImage.Service) -or
      $PinnedCliImage.Tag -cne $ExpectedCliImageAliases[$PinnedCliImage.Service] -or
      -not $PinnedCliImage.Tag.StartsWith(
        "public.ecr.aws/supabase/",
        [StringComparison]::Ordinal
      ) -or
      -not $PinnedCliImage.Exact.StartsWith(
        $ExpectedExactPrefix,
        [StringComparison]::Ordinal
      ) -or
      $PinnedCliImage.Exact.Substring($ExpectedExactPrefix.Length) -notmatch '^[a-f0-9]{64}$') {
    throw "A Supabase CLI alias is not paired with one reviewed source digest"
  }
}
$script:DockerEndpoint = $null
$script:DockerEngineId = $null
$script:IsolatedDockerConfig = $null
$script:NativeProcessReapFailure = $false

function Resolve-Application(
  [string]$Command,
  [string]$ExpectedBaseName,
  [switch]$RequireExplicitPath
) {
  $ExplicitPath = $null
  if ($RequireExplicitPath) {
    if (-not [IO.Path]::IsPathFullyQualified($Command) -or
        -not [IO.File]::Exists($Command) -or
        -not [StringComparer]::OrdinalIgnoreCase.Equals(
          [IO.Path]::GetExtension($Command), ".exe"
        ) -or
        -not [StringComparer]::Ordinal.Equals(
          [IO.Path]::GetFileNameWithoutExtension($Command), $ExpectedBaseName
        )) {
      throw "Explicit application path must be one absolute existing Windows .exe for $ExpectedBaseName"
    }
    $ExplicitPath = [IO.Path]::GetFullPath($Command)
  }
  $ResolvedCommands = @(Get-Command $Command -CommandType Application -All -ErrorAction Stop)
  $CandidatePaths = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  foreach ($Resolved in $ResolvedCommands) {
    $Source = [string]$Resolved.Source
    if ([string]::IsNullOrWhiteSpace($Source) -or
        -not [IO.Path]::IsPathFullyQualified($Source) -or
        -not [IO.File]::Exists($Source)) {
      continue
    }
    $FullPath = [IO.Path]::GetFullPath($Source)
    if ($RequireExplicitPath -and
        -not [StringComparer]::OrdinalIgnoreCase.Equals($FullPath, $ExplicitPath)) {
      continue
    }
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals(
        [IO.Path]::GetExtension($FullPath), ".exe"
      ) -or
      -not [StringComparer]::Ordinal.Equals(
        [IO.Path]::GetFileNameWithoutExtension($FullPath), $ExpectedBaseName
      )) {
      continue
    }
    $null = $CandidatePaths.Add($FullPath)
  }
  if ($CandidatePaths.Count -ne 1) {
    throw "Expected exactly one absolute existing Windows .exe for $ExpectedBaseName"
  }
  return @($CandidatePaths)[0]
}

$SupabasePath = Resolve-Application $SupabaseCli "supabase" -RequireExplicitPath
$DockerPath = Resolve-Application $Docker "docker"
$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
$EvidenceParent = Resolve-Path -LiteralPath (Split-Path -Parent $EvidenceDirectory) -ErrorAction Stop
$EvidenceFull = [IO.Path]::GetFullPath((Join-Path $EvidenceParent.Path (Split-Path -Leaf $EvidenceDirectory)))
$RepositoryPrefix = $RepositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) +
  [IO.Path]::DirectorySeparatorChar
if ($EvidenceFull.Equals($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $EvidenceFull.StartsWith($RepositoryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $EvidenceFull)) {
  throw "Evidence directory must be new and outside the repository"
}
New-Item -ItemType Directory -Path $EvidenceFull -ErrorAction Stop | Out-Null

function Write-HostEvidence([string]$Name, [object[]]$Value) {
  if ($Name -notmatch '^[a-z0-9-]+\.txt$') {
    throw "Invalid host evidence filename"
  }
  $Path = Join-Path $EvidenceFull $Name
  @($Value) | Set-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop
  if ((Get-Item -LiteralPath $Path).Length -le 0) {
    throw "Host evidence is empty: $Name"
  }
}

function Get-ReviewedNativeBaseEnvironment() {
  $WindowsRoot = [Environment]::GetEnvironmentVariable("SystemRoot", "Process")
  if ([string]::IsNullOrWhiteSpace($WindowsRoot) -or
      -not [IO.Path]::IsPathFullyQualified($WindowsRoot) -or
      -not [IO.Directory]::Exists($WindowsRoot)) {
    throw "A reviewed Windows system root is required for native processes"
  }
  $WindowsRoot = [IO.Path]::GetFullPath($WindowsRoot)
  $ComSpec = Join-Path $WindowsRoot "System32/cmd.exe"
  if (-not [IO.File]::Exists($ComSpec)) {
    throw "The reviewed Windows command processor is missing"
  }
  return @{
    SystemRoot = $WindowsRoot
    WINDIR = $WindowsRoot
    ComSpec = $ComSpec
    PATHEXT = ".COM;.EXE;.BAT;.CMD"
    OS = "Windows_NT"
    NO_COLOR = "1"
  }
}

function Get-Utf8NativeTextMetrics([string]$Text) {
  if ($null -eq $Text) { $Text = "" }
  $Bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
  $SplitLines = if ($Text.Length -eq 0) {
    @()
  } else {
    @($Text -split "\r\n|\r|\n")
  }
  $TerminatorCount = [regex]::Matches($Text, "\r\n|\r|\n").Count
  $EndsWithTerminator = $Text.EndsWith("`n") -or $Text.EndsWith("`r")
  $TotalLineCount = if ($Text.Length -eq 0) {
    0
  } else {
    $TerminatorCount + $(if ($EndsWithTerminator) { 0 } else { 1 })
  }
  $NonemptyLineCount = @($SplitLines | Where-Object { $_.Length -gt 0 }).Count
  $Sha = [Security.Cryptography.SHA256]::Create()
  try {
    $Hash = ([BitConverter]::ToString($Sha.ComputeHash($Bytes))).Replace('-', '').
      ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
  return [pscustomobject]@{
    CharacterCount = [long]$Text.Length
    Utf8ByteCount = [long]$Bytes.Length
    Sha256 = $Hash
    TotalLineCount = [long]$TotalLineCount
    NonemptyLineCount = [long]$NonemptyLineCount
  }
}

function Read-StrictUtf8NoBom([string]$Path) {
  $Bytes = [IO.File]::ReadAllBytes($Path)
  if ($Bytes.Length -eq 0) {
    throw "A rendered bootstrap source is empty"
  }
  if ($Bytes.Length -ge 3 -and
      $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
    throw "Rendered bootstrap sources must be UTF-8 without a BOM"
  }
  return [Text.UTF8Encoding]::new($false, $true).GetString($Bytes)
}

function Get-RenderedBootstrapRolesArtifact(
  [string]$SchemaPath,
  [string]$RolesTemplatePath
) {
  $SchemaText = Read-StrictUtf8NoBom $SchemaPath
  $RolesTemplate = Read-StrictUtf8NoBom $RolesTemplatePath
  $MetaCommandPattern = '(?m)^[\t ]*\\'
  $SetPattern = '(?m)^[\t ]*\\set[\t ]+ON_ERROR_STOP[\t ]+on[\t ]*(?:\r\n|\r|\n|\z)'
  $IncludePattern = '(?m)^[\t ]*\\ir[\t ]+schema\.sql[\t ]*(?<newline>\r\n|\r|\n|\z)'
  $SetRegex = [regex]::new($SetPattern, [Text.RegularExpressions.RegexOptions]::CultureInvariant)
  $IncludeRegex = [regex]::new(
    $IncludePattern,
    [Text.RegularExpressions.RegexOptions]::CultureInvariant
  )
  if ($SetRegex.Matches($RolesTemplate).Count -ne 1 -or
      $IncludeRegex.Matches($RolesTemplate).Count -ne 1 -or
      [regex]::Matches($RolesTemplate, $MetaCommandPattern).Count -ne 2 -or
      [regex]::IsMatch($SchemaText, $MetaCommandPattern)) {
    throw "Bootstrap roles sources do not have the exact reviewed psql meta-command shape"
  }

  $RolesWithoutSet = $SetRegex.Replace($RolesTemplate, "", 1)
  $IncludeMatches = $IncludeRegex.Matches($RolesWithoutSet)
  if ($IncludeMatches.Count -ne 1) {
    throw "Bootstrap roles include changed after removing the reviewed set command"
  }
  $IncludeMatch = $IncludeMatches[0]
  $Separator = if ($SchemaText.EndsWith("`n") -or $SchemaText.EndsWith("`r")) {
    ""
  } elseif ($IncludeMatch.Groups["newline"].Value.Length -gt 0) {
    $IncludeMatch.Groups["newline"].Value
  } else {
    "`n"
  }
  $RenderedRoles = $RolesWithoutSet.Substring(0, $IncludeMatch.Index) +
    $SchemaText + $Separator +
    $RolesWithoutSet.Substring($IncludeMatch.Index + $IncludeMatch.Length)
  if ([regex]::IsMatch($RenderedRoles, $MetaCommandPattern) -or
      -not $RenderedRoles.Contains(
        "tag_write_pause_sealed_schema_and_owner_fixture_loaded",
        [StringComparison]::Ordinal
      )) {
    throw "Rendered bootstrap roles are not one pure-SQL schema and owner fixture"
  }

  return [pscustomobject]@{
    Text = $RenderedRoles
    SchemaSha256 = (Get-Utf8NativeTextMetrics $SchemaText).Sha256
    RolesTemplateSha256 = (Get-Utf8NativeTextMetrics $RolesTemplate).Sha256
    RenderedRolesSha256 = (Get-Utf8NativeTextMetrics $RenderedRoles).Sha256
  }
}

function Start-NativeProcess(
  [string]$FilePath,
  [string[]]$Arguments,
  [hashtable]$EnvironmentOverrides = @{},
  [string[]]$RemoveEnvironment = @()
) {
  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $FilePath
  $StartInfo.UseShellExecute = $false
  $StartInfo.CreateNoWindow = $true
  $StartInfo.RedirectStandardInput = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $StartInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
  $StartInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
  $StartInfo.Environment.Clear()
  foreach ($Entry in (Get-ReviewedNativeBaseEnvironment).GetEnumerator()) {
    $StartInfo.Environment[$Entry.Key] = $Entry.Value
  }
  foreach ($Argument in $Arguments) {
    $null = $StartInfo.ArgumentList.Add($Argument)
  }
  foreach ($Name in $RemoveEnvironment) {
    $null = $StartInfo.Environment.Remove($Name)
  }
  $AllowedOverrideNames = @(
    "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA", "LOCALAPPDATA",
    "DOCKER_CONFIG", "DOCKER_HOST", "PATH", "TEMP", "TMP"
  )
  foreach ($Entry in $EnvironmentOverrides.GetEnumerator()) {
    if ($Entry.Key -cnotin $AllowedOverrideNames -or
        $Entry.Value -isnot [string] -or
        [string]::IsNullOrWhiteSpace($Entry.Value)) {
      throw "Native process environment override is not reviewed: $($Entry.Key)"
    }
    $StartInfo.Environment[$Entry.Key] = $Entry.Value
  }
  foreach ($RequiredName in @("PATH", "TEMP", "TMP")) {
    if (-not $StartInfo.Environment.ContainsKey($RequiredName)) {
      throw "Native process environment is missing a required sealed value: $RequiredName"
    }
  }
  $Process = [Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  if (-not $Process.Start()) {
    $Process.Dispose()
    throw "Could not start bounded native process"
  }
  $Process.StandardInput.Close()
  $Stopwatch = [Diagnostics.Stopwatch]::StartNew()
  return [pscustomobject]@{
    Process = $Process
    StandardOutput = $Process.StandardOutput.ReadToEndAsync()
    StandardError = $Process.StandardError.ReadToEndAsync()
    Stopwatch = $Stopwatch
  }
}

function Complete-NativeProcess([object]$Running, [int]$TimeoutSeconds) {
  $TimedOut = -not $Running.Process.WaitForExit($TimeoutSeconds * 1000)
  if ($TimedOut) {
    try { $Running.Process.Kill($true) } catch { }
    if (-not $Running.Process.WaitForExit(5000)) {
      $script:NativeProcessReapFailure = $true
      throw "Timed-out native process could not be reaped"
    }
  }
  $Running.Process.WaitForExit()
  $Running.Stopwatch.Stop()
  $StandardOutputText = $Running.StandardOutput.GetAwaiter().GetResult()
  $StandardErrorText = $Running.StandardError.GetAwaiter().GetResult()
  $StandardOutput = @(
    $StandardOutputText -split "\r\n|\r|\n" |
      Where-Object { $_.Length -gt 0 }
  )
  $StandardError = @(
    $StandardErrorText -split "\r\n|\r|\n" |
      Where-Object { $_.Length -gt 0 }
  )
  $StandardOutputMetrics = Get-Utf8NativeTextMetrics $StandardOutputText
  $StandardErrorMetrics = Get-Utf8NativeTextMetrics $StandardErrorText
  $Result = [pscustomobject]@{
    ExitCode = $Running.Process.ExitCode
    TimedOut = $TimedOut
    DurationMilliseconds = [long]$Running.Stopwatch.ElapsedMilliseconds
    StandardOutput = @($StandardOutput)
    StandardError = @($StandardError)
    StandardOutputCharacterCount = $StandardOutputMetrics.CharacterCount
    StandardOutputUtf8ByteCount = $StandardOutputMetrics.Utf8ByteCount
    StandardOutputSha256 = $StandardOutputMetrics.Sha256
    StandardOutputTotalLineCount = $StandardOutputMetrics.TotalLineCount
    StandardOutputNonemptyLineCount = $StandardOutputMetrics.NonemptyLineCount
    StandardOutputText = $StandardOutputText
    StandardErrorCharacterCount = $StandardErrorMetrics.CharacterCount
    StandardErrorUtf8ByteCount = $StandardErrorMetrics.Utf8ByteCount
    StandardErrorSha256 = $StandardErrorMetrics.Sha256
    StandardErrorTotalLineCount = $StandardErrorMetrics.TotalLineCount
    StandardErrorNonemptyLineCount = $StandardErrorMetrics.NonemptyLineCount
    StandardErrorText = $StandardErrorText
    Output = @($StandardOutput) + @($StandardError)
  }
  $Running.Process.Dispose()
  return $Result
}

function ConvertTo-SafeNativeDiagnosticLine([object]$Value) {
  if ($null -eq $Value) { return "<redacted-unclassified>" }
  $Line = $Value.ToString()
  $Line = [regex]::Replace($Line, '\x1B\[[0-?]*[ -/]*[@-~]', '')
  $Line = [regex]::Replace(
    $Line,
    '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]',
    '?'
  )
  $Candidate = $Line.Trim()
  if ($Candidate -cmatch '^(?:2\.109\.1|desktop-linux)$' -or
      $Candidate -cmatch '^(?:pull|manifest unknown|not found|unauthorized|access denied|connect|timeout)$') {
    return $Candidate
  }
  return "<redacted-unclassified>"
}

function Test-NativeDiagnosticSignal([string]$Text, [string]$Needle) {
  if ($null -eq $Text) { $Text = "" }
  return $Text.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function New-NativeFailureDiagnostic(
  [string]$CallLabel,
  [object]$Result,
  [int]$ExpectedExit
) {
  $MaximumLinesPerStream = 20
  $EvidenceLines = [Collections.Generic.List[string]]::new()
  foreach ($Line in @(
      "native_call_failure",
      "call_label=$CallLabel",
      "exit_code=$($Result.ExitCode)",
      "expected_exit=$ExpectedExit",
      "timed_out=$($Result.TimedOut)",
      "duration_ms=$($Result.DurationMilliseconds)",
      "stream_max_lines=$MaximumLinesPerStream",
      "stream_max_chars_per_line=320"
    )) {
    $null = $EvidenceLines.Add($Line)
  }
  $SafeStreams = @{}
  foreach ($Stream in @(
      [pscustomobject]@{
        Name = "stdout"
        Lines = @($Result.StandardOutput)
        CharacterCount = $Result.StandardOutputCharacterCount
        Utf8ByteCount = $Result.StandardOutputUtf8ByteCount
        Sha256 = $Result.StandardOutputSha256
        TotalLineCount = $Result.StandardOutputTotalLineCount
        NonemptyLineCount = $Result.StandardOutputNonemptyLineCount
      },
      [pscustomobject]@{
        Name = "stderr"
        Lines = @($Result.StandardError)
        CharacterCount = $Result.StandardErrorCharacterCount
        Utf8ByteCount = $Result.StandardErrorUtf8ByteCount
        Sha256 = $Result.StandardErrorSha256
        TotalLineCount = $Result.StandardErrorTotalLineCount
        NonemptyLineCount = $Result.StandardErrorNonemptyLineCount
      }
    )) {
    $StreamLines = @($Stream.Lines)
    $CapturedCount = [Math]::Min($StreamLines.Count, $MaximumLinesPerStream)
    $SafeLines = [Collections.Generic.List[string]]::new()
    for ($Index = 0; $Index -lt $CapturedCount; $Index++) {
      $null = $SafeLines.Add((ConvertTo-SafeNativeDiagnosticLine $StreamLines[$Index]))
    }
    $SafeStreams[$Stream.Name] = $SafeLines.ToArray()
    foreach ($Line in @(
        "$($Stream.Name)_sha256=$($Stream.Sha256)",
        "$($Stream.Name)_total_chars=$($Stream.CharacterCount)",
        "$($Stream.Name)_total_utf8_bytes=$($Stream.Utf8ByteCount)",
        "$($Stream.Name)_total_lines=$($Stream.TotalLineCount)",
        "$($Stream.Name)_nonempty_lines=$($Stream.NonemptyLineCount)",
        "$($Stream.Name)_captured_lines=$CapturedCount",
        "$($Stream.Name)_truncated=$($Stream.NonemptyLineCount -gt $MaximumLinesPerStream)"
      )) {
      $null = $EvidenceLines.Add($Line)
    }
    if ($SafeLines.Count -eq 0) {
      $null = $EvidenceLines.Add("$($Stream.Name)=<empty>")
    } else {
      for ($Index = 0; $Index -lt $SafeLines.Count; $Index++) {
        $null = $EvidenceLines.Add((
            "{0}[{1:D2}]={2}" -f $Stream.Name, $Index, $SafeLines[$Index]
          ))
      }
    }
  }
  $RawText = "$($Result.StandardOutputText)`n$($Result.StandardErrorText)"
  $Signals = [ordered]@{
    cli_alias_db = "public.ecr.aws/supabase/postgres:17.6.1.143"
    cli_alias_auth = "public.ecr.aws/supabase/gotrue:v2.192.0"
    cli_alias_storage = "public.ecr.aws/supabase/storage-api:v1.62.5"
    cli_alias_realtime = "public.ecr.aws/supabase/realtime:v2.112.6"
    source_ref_db = "public.ecr.aws/supabase/postgres:17.6.1.143@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8"
    source_ref_auth = "public.ecr.aws/supabase/gotrue:v2.192.0@sha256:288d880ebc80a1cb5ad52dc7d12328f76e9c90127003306864a270118bba00a8"
    source_ref_storage = "public.ecr.aws/supabase/storage-api:v1.62.5@sha256:28f8a3cc5dd81b1b13098ca12460883ecb911d017a371b4b5efcb3ec432c1f1e"
    source_ref_realtime = "public.ecr.aws/supabase/realtime:v2.112.6@sha256:5f5377bf9d1f0e6b59fe6a0cb57e9ff65f9960eed5b43e93862969f81c44acae"
    keyword_pull = "pull"
    keyword_manifest_unknown = "manifest unknown"
    keyword_not_found = "not found"
    keyword_unauthorized = "unauthorized"
    keyword_access_denied = "access denied"
    keyword_connect = "connect"
    keyword_timeout = "timeout"
    keyword_syntax_error = "syntax error"
    keyword_sqlstate = "SQLSTATE"
    keyword_applying_migration = "Applying migration"
    keyword_roles_sql = "roles.sql"
    keyword_schema_sql = "schema.sql"
    keyword_psql_set = "\set"
    keyword_psql_include = "\ir"
    keyword_rename_preflight = "wouldkeep_tag_write_pause_sealed_rename_preflight_failed"
    keyword_sanitize_failure = "wouldkeep_tag_write_pause_sealed_secret_sanitization_failed"
    keyword_accessed_by_other_users = "is being accessed by other users"
    keyword_other_session = "other session using the database"
    keyword_permission_denied = "permission denied"
    keyword_must_be_owner = "must be owner of database"
    keyword_alter_database = "ALTER DATABASE"
    keyword_cannot_run_in_transaction = "cannot run inside a transaction block"
    keyword_pg_ctl = "pg_ctl"
    keyword_pid_file = "PID file"
    keyword_cluster_directory = "database cluster directory"
    keyword_server_does_not_shut_down = "server does not shut down"
    keyword_no_operation_specified = "no operation specified"
    keyword_unrecognized_option = "unrecognized option"
    sqlstate_object_in_use = "55006:"
    sqlstate_object_not_in_prerequisite_state = "55000:"
    sqlstate_insufficient_privilege = "42501:"
    sqlstate_active_sql_transaction = "25001:"
  }
  foreach ($Signal in $Signals.GetEnumerator()) {
    $Present = Test-NativeDiagnosticSignal $RawText $Signal.Value
    $null = $EvidenceLines.Add("signal_$($Signal.Key)=$Present")
  }
  return [pscustomobject]@{
    EvidenceLines = $EvidenceLines.ToArray()
  }
}

function Invoke-Native(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
  [string]$CallLabel,
  [string]$FilePath,
  [string[]]$Arguments,
  [int]$TimeoutSeconds,
  [int]$ExpectedExit = 0,
  [hashtable]$EnvironmentOverrides = @{},
  [string[]]$RemoveEnvironment = @()
) {
  $Running = Start-NativeProcess $FilePath $Arguments $EnvironmentOverrides $RemoveEnvironment
  $Result = Complete-NativeProcess $Running $TimeoutSeconds
  if ($Result.TimedOut -or $Result.ExitCode -ne $ExpectedExit) {
    $Diagnostic = New-NativeFailureDiagnostic $CallLabel $Result $ExpectedExit
    $DiagnosticEvidence = "native-failure.txt"
    $EvidenceWriteFailure = $null
    try {
      Write-HostEvidence $DiagnosticEvidence $Diagnostic.EvidenceLines
    } catch {
      $DiagnosticEvidence = "<unavailable>"
      $EvidenceWriteFailure = $_.Exception
    }
    $FailureMessage = "Native call failed: call_label=$CallLabel; " +
      "exit_code=$($Result.ExitCode); expected_exit=$ExpectedExit; " +
      "timed_out=$($Result.TimedOut); duration_ms=$($Result.DurationMilliseconds); " +
      "diagnostic_evidence=$DiagnosticEvidence"
    if ($null -ne $EvidenceWriteFailure) {
      throw [InvalidOperationException]::new($FailureMessage, $EvidenceWriteFailure)
    }
    throw [InvalidOperationException]::new($FailureMessage)
  }
  return $Result
}

function Start-DockerProcess([string[]]$Arguments) {
  if ([string]::IsNullOrEmpty($script:DockerEndpoint) -or
      [string]::IsNullOrEmpty($script:IsolatedDockerConfig)) {
    throw "Pinned Docker endpoint and isolated config are required"
  }
  $EffectiveArguments = @("--host=$($script:DockerEndpoint)") + $Arguments
  $DockerEnvironment = @{}
  $DockerEnvironment.DOCKER_HOST = $script:DockerEndpoint
  $DockerEnvironment.DOCKER_CONFIG = $script:IsolatedDockerConfig
  $DockerEnvironment.PATH = $ReviewedNativePath
  $DockerEnvironment.TEMP = $NativeTemp
  $DockerEnvironment.TMP = $NativeTemp
  return Start-NativeProcess $DockerPath $EffectiveArguments $DockerEnvironment @(
      "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
      "DOCKER_CONFIG"
    )
}

function Invoke-Docker([string[]]$Arguments, [int]$TimeoutSeconds = 120) {
  $Result = Complete-NativeProcess (Start-DockerProcess $Arguments) $TimeoutSeconds
  if ($Result.TimedOut -or $Result.ExitCode -ne 0) {
    throw "Pinned Docker process failed or timed out"
  }
  return $Result
}

function Invoke-DockerSql(
  [ValidateSet("bootstrap-attestation", "bootstrap-rename", "bootstrap-sanitize")]
  [string]$CallLabel,
  [string[]]$Arguments,
  [int]$TimeoutSeconds
) {
  $Result = Complete-NativeProcess (Start-DockerProcess $Arguments) $TimeoutSeconds
  if ($Result.TimedOut -or $Result.ExitCode -ne 0) {
    $Diagnostic = New-NativeFailureDiagnostic $CallLabel $Result 0
    $DiagnosticEvidence = "docker-sql-failure-$CallLabel.txt"
    $EvidenceWriteFailure = $null
    try {
      Write-HostEvidence $DiagnosticEvidence $Diagnostic.EvidenceLines
    } catch {
      $DiagnosticEvidence = "<unavailable>"
      $EvidenceWriteFailure = $_.Exception
    }
    $FailureMessage = "Docker SQL call failed: call_label=$CallLabel; " +
      "exit_code=$($Result.ExitCode); expected_exit=0; " +
      "timed_out=$($Result.TimedOut); duration_ms=$($Result.DurationMilliseconds); " +
      "diagnostic_evidence=$DiagnosticEvidence"
    if ($null -ne $EvidenceWriteFailure) {
      throw [InvalidOperationException]::new($FailureMessage, $EvidenceWriteFailure)
    }
    throw [InvalidOperationException]::new($FailureMessage)
  }
  return $Result
}

function Invoke-DockerControl(
  [ValidateSet(
    "bootstrap-restart-disable", "bootstrap-pgctl-version", "bootstrap-pgctl-stop"
  )]
  [string]$CallLabel,
  [string[]]$Arguments,
  [int]$TimeoutSeconds
) {
  $Result = Complete-NativeProcess (Start-DockerProcess $Arguments) $TimeoutSeconds
  $ExpectedExitCodes = if ($CallLabel -ceq "bootstrap-pgctl-stop") {
    @(0, 137)
  } else {
    @(0)
  }
  if ($Result.TimedOut -or $Result.ExitCode -notin $ExpectedExitCodes) {
    $Diagnostic = New-NativeFailureDiagnostic $CallLabel $Result 0
    $DiagnosticEvidence = "docker-control-failure-$CallLabel.txt"
    $EvidenceWriteFailure = $null
    try {
      Write-HostEvidence $DiagnosticEvidence $Diagnostic.EvidenceLines
    } catch {
      $DiagnosticEvidence = "<unavailable>"
      $EvidenceWriteFailure = $_.Exception
    }
    $FailureMessage = "Docker control call failed: call_label=$CallLabel; " +
      "exit_code=$($Result.ExitCode); expected_exit=$($ExpectedExitCodes -join ','); " +
      "timed_out=$($Result.TimedOut); duration_ms=$($Result.DurationMilliseconds); " +
      "diagnostic_evidence=$DiagnosticEvidence"
    if ($null -ne $EvidenceWriteFailure) {
      throw [InvalidOperationException]::new($FailureMessage, $EvidenceWriteFailure)
    }
    throw [InvalidOperationException]::new($FailureMessage)
  }
  return $Result
}

function Write-DockerHelperExitDiagnostic(
  [ValidateSet("quiesce", "archive", "restore")]
  [string]$HelperLabel,
  [string]$ContainerId,
  [int]$HelperExitCode
) {
  if ($ContainerId -notmatch '^[a-f0-9]{64}$' -or
      $HelperExitCode -lt 1 -or $HelperExitCode -gt 255) {
    throw "Docker helper diagnostic input is invalid"
  }
  $Logs = Complete-NativeProcess (Start-DockerProcess @("logs", $ContainerId)) 30
  if ($Logs.TimedOut -or $Logs.ExitCode -ne 0) {
    throw "Docker helper failure logs could not be read safely"
  }
  $Combined = $Logs.StandardOutputText + "`n" + $Logs.StandardErrorText
  $Signals = [ordered]@{
    pg_controldata = "pg_controldata"
    cluster_state = "Database cluster state"
    shut_down = "shut down"
    shut_down_in_recovery = "shut down in recovery"
    in_production = "in production"
    recovery_required = "recovery_required"
    final_state = "final_state"
    no_such_file = "No such file or directory"
    permission_denied = "Permission denied"
    not_found = "not found"
    tar = "tar:"
    sha256sum = "sha256sum"
  }
  $Evidence = [Collections.Generic.List[string]]::new()
  $null = $Evidence.Add("docker_helper_failure")
  $null = $Evidence.Add("helper_label=$HelperLabel")
  $null = $Evidence.Add("helper_exit_code=$HelperExitCode")
  $null = $Evidence.Add("logs_stdout_sha256=$($Logs.StandardOutputSha256)")
  $null = $Evidence.Add("logs_stdout_chars=$($Logs.StandardOutputCharacterCount)")
  $null = $Evidence.Add("logs_stdout_lines=$($Logs.StandardOutputTotalLineCount)")
  $null = $Evidence.Add("logs_stderr_sha256=$($Logs.StandardErrorSha256)")
  $null = $Evidence.Add("logs_stderr_chars=$($Logs.StandardErrorCharacterCount)")
  $null = $Evidence.Add("logs_stderr_lines=$($Logs.StandardErrorTotalLineCount)")
  foreach ($Signal in $Signals.GetEnumerator()) {
    $null = $Evidence.Add(
      "signal_$($Signal.Key)=$(Test-NativeDiagnosticSignal $Combined $Signal.Value)"
    )
  }
  $EvidenceName = "docker-helper-failure-$HelperLabel.txt"
  Write-HostEvidence $EvidenceName $Evidence.ToArray()
  return $EvidenceName
}

function Write-DockerDatabaseReadinessDiagnostic([string]$ContainerId) {
  if ($ContainerId -notmatch '^[a-f0-9]{64}$') {
    throw "Docker database readiness diagnostic input is invalid"
  }
  $Inspect = Get-DockerInspect "container" $ContainerId
  $State = Get-DockerRequiredObject $Inspect "State"
  $Logs = Complete-NativeProcess (Start-DockerProcess @("logs", $ContainerId)) 30
  if ($Logs.TimedOut -or $Logs.ExitCode -ne 0) {
    throw "Docker database readiness logs could not be read safely"
  }
  $Combined = $Logs.StandardOutputText + "`n" + $Logs.StandardErrorText
  $Signals = [ordered]@{
    fatal = "FATAL"
    panic = "PANIC"
    permission_denied = "Permission denied"
    operation_not_permitted = "Operation not permitted"
    wrong_ownership = "wrong ownership"
    invalid_permissions = "invalid permissions"
    data_directory = "data directory"
    postmaster_pid = "postmaster.pid"
    no_such_file = "No such file or directory"
    read_only_file_system = "Read-only file system"
    no_space_left = "No space left on device"
    address_in_use = "Address already in use"
    incompatible = "incompatible"
  }
  $EngineError = Get-DockerRequiredString $State "Error"
  $Evidence = [Collections.Generic.List[string]]::new()
  $null = $Evidence.Add("docker_database_readiness_failure")
  $null = $Evidence.Add("status=$(Get-DockerRequiredString $State 'Status')")
  $null = $Evidence.Add("running=$(Get-DockerRequiredBoolean $State 'Running')")
  $null = $Evidence.Add("paused=$(Get-DockerRequiredBoolean $State 'Paused')")
  $null = $Evidence.Add("restarting=$(Get-DockerRequiredBoolean $State 'Restarting')")
  $null = $Evidence.Add("oom_killed=$(Get-DockerRequiredBoolean $State 'OOMKilled')")
  $null = $Evidence.Add("dead=$(Get-DockerRequiredBoolean $State 'Dead')")
  $null = $Evidence.Add("exit_code=$(Get-DockerRequiredInteger $State 'ExitCode')")
  $null = $Evidence.Add("engine_error_empty=$([string]::IsNullOrEmpty($EngineError))")
  $null = $Evidence.Add("logs_stdout_sha256=$($Logs.StandardOutputSha256)")
  $null = $Evidence.Add("logs_stdout_chars=$($Logs.StandardOutputCharacterCount)")
  $null = $Evidence.Add("logs_stdout_lines=$($Logs.StandardOutputTotalLineCount)")
  $null = $Evidence.Add("logs_stderr_sha256=$($Logs.StandardErrorSha256)")
  $null = $Evidence.Add("logs_stderr_chars=$($Logs.StandardErrorCharacterCount)")
  $null = $Evidence.Add("logs_stderr_lines=$($Logs.StandardErrorTotalLineCount)")
  foreach ($Signal in $Signals.GetEnumerator()) {
    $null = $Evidence.Add(
      "signal_$($Signal.Key)=$(Test-NativeDiagnosticSignal $Combined $Signal.Value)"
    )
  }
  $EvidenceName = "docker-database-readiness-failure.txt"
  Write-HostEvidence $EvidenceName $Evidence.ToArray()
  return $EvidenceName
}

function Write-DockerRunnerStateDiagnostic([string]$ContainerId) {
  if ($ContainerId -notmatch '^[a-f0-9]{64}$') {
    throw "Docker runner state diagnostic input is invalid"
  }
  $Inspect = Get-DockerInspect "container" $ContainerId
  $State = Get-DockerRequiredObject $Inspect "State"
  $Logs = Complete-NativeProcess (Start-DockerProcess @("logs", $ContainerId)) 30
  if ($Logs.TimedOut -or $Logs.ExitCode -ne 0) {
    throw "Docker runner logs could not be read safely"
  }
  $Combined = $Logs.StandardOutputText + "`n" + $Logs.StandardErrorText
  $Signals = [ordered]@{
    forbidden_credential = "forbidden external credential"
    invalid_identity = "identity environment is invalid"
    credential_path = "credentials are forbidden"
    evidence_tmpfs = "evidence tmpfs"
    executable_missing = "executable is missing"
    postgres_version = "PostgreSQL 17.6"
    postgres_not_ready = "PostgreSQL did not become ready"
    subprocess_failed = "subprocess failed or timed out"
    attestation = "attestation"
    matrix = "matrix"
    host_acknowledgement = "Host did not acknowledge"
    permission_denied = "Permission denied"
    operation_not_permitted = "Operation not permitted"
    connection_refused = "Connection refused"
    authentication = "authentication"
  }
  $EngineError = Get-DockerRequiredString $State "Error"
  $Evidence = [Collections.Generic.List[string]]::new()
  $null = $Evidence.Add("docker_runner_state_diagnostic")
  $null = $Evidence.Add("status=$(Get-DockerRequiredString $State 'Status')")
  $null = $Evidence.Add("running=$(Get-DockerRequiredBoolean $State 'Running')")
  $null = $Evidence.Add("paused=$(Get-DockerRequiredBoolean $State 'Paused')")
  $null = $Evidence.Add("restarting=$(Get-DockerRequiredBoolean $State 'Restarting')")
  $null = $Evidence.Add("oom_killed=$(Get-DockerRequiredBoolean $State 'OOMKilled')")
  $null = $Evidence.Add("dead=$(Get-DockerRequiredBoolean $State 'Dead')")
  $null = $Evidence.Add("exit_code=$(Get-DockerRequiredInteger $State 'ExitCode')")
  $null = $Evidence.Add("engine_error_empty=$([string]::IsNullOrEmpty($EngineError))")
  $null = $Evidence.Add("logs_stdout_sha256=$($Logs.StandardOutputSha256)")
  $null = $Evidence.Add("logs_stdout_chars=$($Logs.StandardOutputCharacterCount)")
  $null = $Evidence.Add("logs_stdout_lines=$($Logs.StandardOutputTotalLineCount)")
  $null = $Evidence.Add("logs_stderr_sha256=$($Logs.StandardErrorSha256)")
  $null = $Evidence.Add("logs_stderr_chars=$($Logs.StandardErrorCharacterCount)")
  $null = $Evidence.Add("logs_stderr_lines=$($Logs.StandardErrorTotalLineCount)")
  foreach ($Signal in $Signals.GetEnumerator()) {
    $null = $Evidence.Add(
      "signal_$($Signal.Key)=$(Test-NativeDiagnosticSignal $Combined $Signal.Value)"
    )
  }
  $EvidenceName = "docker-runner-state-diagnostic.txt"
  Write-HostEvidence $EvidenceName $Evidence.ToArray()
  return $EvidenceName
}

function Invoke-DockerTopology(
  [ValidateSet(
    "database-start", "runner-start", "database-netns", "runner-netns",
    "runner-net-dev", "runner-ipv4-routes", "runner-ipv6-routes",
    "database-ports", "runner-ports", "runner-evidence-stat",
    "runner-evidence-read", "runner-evidence-inventory",
    "runner-evidence-ack"
  )]
  [string]$CallLabel,
  [string[]]$Arguments,
  [int]$TimeoutSeconds,
  [string]$RunnerId = ""
) {
  $Result = Complete-NativeProcess (Start-DockerProcess $Arguments) $TimeoutSeconds
  if ($Result.TimedOut -or $Result.ExitCode -ne 0) {
    $Diagnostic = New-NativeFailureDiagnostic $CallLabel $Result 0
    $DiagnosticEvidence = "docker-topology-failure-$CallLabel.txt"
    Write-HostEvidence $DiagnosticEvidence $Diagnostic.EvidenceLines
    $RunnerEvidence = "<not-requested>"
    if ($RunnerId -match '^[a-f0-9]{64}$') {
      try {
        $RunnerEvidence = Write-DockerRunnerStateDiagnostic $RunnerId
      } catch {
        $RunnerEvidence = "<unavailable>"
      }
    }
    throw "Docker topology call failed: call_label=$CallLabel; " +
      "exit_code=$($Result.ExitCode); timed_out=$($Result.TimedOut); " +
      "diagnostic_evidence=$DiagnosticEvidence; runner_evidence=$RunnerEvidence"
  }
  return $Result
}

function Copy-DockerTextEvidenceFile(
  [string]$ContainerId,
  [string]$RelativePath,
  [string]$DestinationRoot,
  [long]$MaximumUtf8Bytes
) {
  if ($ContainerId -notmatch '^[a-f0-9]{64}$' -or
      $RelativePath -notmatch
        '^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*$' -or
      $RelativePath -match '(^|/)\.\.(/|$)' -or
      $MaximumUtf8Bytes -lt 1 -or $MaximumUtf8Bytes -gt 8388608) {
    throw "Docker text evidence transfer input is invalid"
  }
  $DestinationRootFull = [IO.Path]::GetFullPath($DestinationRoot)
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals(
      $DestinationRootFull,
      $ContainerEvidence
    )) {
    throw "Docker text evidence destination root is not exact"
  }
  $ContainerPath = "/evidence/$RelativePath"
  $Stat = Invoke-DockerTopology "runner-evidence-stat" @(
    "exec", $ContainerId, "/usr/bin/stat", "--format=%F|%s", "--", $ContainerPath
  ) 30 $ContainerId
  if ($Stat.StandardErrorUtf8ByteCount -ne 0 -or
      $Stat.StandardOutput.Count -ne 1 -or
      $Stat.StandardOutput[0] -notmatch '^regular file\|([0-9]{1,10})$') {
    throw "Docker text evidence is not one regular file"
  }
  $SourceSize = [long]$Matches[1]
  if ($SourceSize -lt 1 -or $SourceSize -gt $MaximumUtf8Bytes) {
    throw "Docker text evidence size is outside the reviewed bound"
  }
  $Read = Invoke-DockerTopology "runner-evidence-read" @(
    "exec", $ContainerId, "/usr/bin/cat", "--", $ContainerPath
  ) 60 $ContainerId
  if ($Read.StandardErrorUtf8ByteCount -ne 0 -or
      $Read.StandardOutputUtf8ByteCount -ne $SourceSize) {
    throw "Docker text evidence transfer changed the byte count"
  }
  $DestinationFull = [IO.Path]::GetFullPath((Join-Path $DestinationRootFull $RelativePath))
  $DestinationPrefix = $DestinationRootFull.TrimEnd(
    [IO.Path]::DirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  if (-not $DestinationFull.StartsWith(
      $DestinationPrefix,
      [StringComparison]::OrdinalIgnoreCase
    ) -or (Test-Path -LiteralPath $DestinationFull)) {
    throw "Docker text evidence destination escaped or already exists"
  }
  $DestinationParent = Split-Path -Parent $DestinationFull
  New-Item -ItemType Directory -Path $DestinationParent -Force -ErrorAction Stop |
    Out-Null
  $Utf8Bytes = [Text.UTF8Encoding]::new($false, $true).GetBytes(
    $Read.StandardOutputText
  )
  if ($Utf8Bytes.Length -ne $SourceSize) {
    throw "Docker text evidence UTF-8 reconstruction changed the byte count"
  }
  [IO.File]::WriteAllBytes($DestinationFull, $Utf8Bytes)
  $DestinationItem = Get-Item -LiteralPath $DestinationFull -Force -ErrorAction Stop
  if ($DestinationItem.Length -ne $SourceSize -or
      ($DestinationItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Docker text evidence destination is linked or truncated"
  }
  return $SourceSize
}

function Get-OptionalDockerImageId([string]$Reference) {
  if ($Reference -cnotin @($PinnedCliImages | ForEach-Object { $_.Tag })) {
    throw "Optional Docker image inspection is limited to reviewed CLI aliases"
  }
  $Result = Complete-NativeProcess (Start-DockerProcess @(
      "image", "inspect", "--format", "{{.Id}}", $Reference
    )) 30
  if ($Result.TimedOut) {
    throw "Optional Docker image inspection timed out"
  }
  if ($Result.ExitCode -eq 0) {
    if ($Result.StandardOutput.Count -ne 1 -or
        $Result.StandardError.Count -ne 0 -or
        $Result.StandardOutput[0].Trim() -notmatch '^sha256:[a-f0-9]{64}$') {
      throw "Optional Docker image inspection returned an invalid image ID"
    }
    return $Result.StandardOutput[0].Trim()
  }
  $ExpectedNotFound = "Error response from daemon: No such image: $Reference"
  if ($Result.ExitCode -ne 1 -or
      $Result.StandardOutput.Count -ne 0 -or
      $Result.StandardError.Count -ne 1 -or
      $Result.StandardError[0] -cne $ExpectedNotFound) {
    throw "Optional Docker image inspection failed ambiguously"
  }
  return $null
}

function Get-DockerInspect(
  [ValidateSet("container", "volume", "network", "image")]
  [string]$ObjectType,
  [string]$ObjectId
) {
  $Output = Invoke-Docker @($ObjectType, "inspect", $ObjectId) 30
  $Parsed = @(ConvertFrom-Json -InputObject ($Output.Output -join "`n"))
  if ($Parsed.Count -ne 1) {
    throw "Docker inspect did not return exactly one object"
  }
  return $Parsed[0]
}

function Get-DockerPropertyState([object]$Object, [string]$Name) {
  if ($null -eq $Object) {
    throw "Docker inspect parent object is null while reading $Name"
  }
  $Properties = @($Object.PSObject.Properties | Where-Object { $_.Name -ceq $Name })
  if ($Properties.Count -gt 1) {
    throw "Docker inspect property is ambiguous: $Name"
  }
  if ($Properties.Count -eq 0) {
    return [pscustomobject]@{ Present = $false; IsNull = $true; Value = $null }
  }
  return [pscustomobject]@{
    Present = $true
    IsNull = $null -eq $Properties[0].Value
    Value = $Properties[0].Value
  }
}

function Get-DockerRequiredProperty([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present -or $State.IsNull) {
    throw "Required Docker inspect property is missing or null: $Name"
  }
  return $State.Value
}

function Get-DockerRequiredObject([object]$Object, [string]$Name) {
  $Value = Get-DockerRequiredProperty $Object $Name
  if ($Value -isnot [System.Management.Automation.PSCustomObject]) {
    throw "Required Docker inspect property is not an object: $Name"
  }
  return $Value
}

function Get-DockerRequiredString([object]$Object, [string]$Name) {
  $Value = Get-DockerRequiredProperty $Object $Name
  if ($Value -isnot [string]) {
    throw "Required Docker inspect property is not a string: $Name"
  }
  return [string]$Value
}

function Get-DockerRequiredBoolean([object]$Object, [string]$Name) {
  $Value = Get-DockerRequiredProperty $Object $Name
  if ($Value -isnot [bool]) {
    throw "Required Docker inspect property is not boolean: $Name"
  }
  return [bool]$Value
}

function Get-DockerRequiredInteger([object]$Object, [string]$Name) {
  $Value = Get-DockerRequiredProperty $Object $Name
  if ($Value -isnot [int] -and $Value -isnot [long]) {
    throw "Required Docker inspect property is not an integer: $Name"
  }
  return [long]$Value
}

function Get-DockerOptionalProperty([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present -or $State.IsNull) { return $null }
  return $State.Value
}

function Get-DockerOptionalInteger(
  [object]$Object,
  [string]$Name,
  [long]$DefaultValue = 0
) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present -or $State.IsNull) { return $DefaultValue }
  if ($State.Value -isnot [int] -and $State.Value -isnot [long]) {
    throw "Optional Docker inspect property is not an integer: $Name"
  }
  return [long]$State.Value
}

function Get-DockerOptionalMapProperties([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present -or $State.IsNull) { return @() }
  if ($State.Value -isnot [Management.Automation.PSCustomObject]) {
    throw "Optional Docker inspect map has an invalid type: $Name"
  }
  return @($State.Value.PSObject.Properties)
}

function Get-DockerRequiredNullableMapProperties([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present) {
    throw "Required nullable Docker inspect map is missing: $Name"
  }
  if ($State.IsNull) { return @() }
  if ($State.Value -isnot [System.Management.Automation.PSCustomObject]) {
    throw "Required nullable Docker inspect map has an invalid type: $Name"
  }
  return @($State.Value.PSObject.Properties)
}

function Get-DockerOptionalList([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present -or $State.IsNull) { return @() }
  if ($State.Value -is [string] -or
      $State.Value -isnot [Collections.IEnumerable] -or
      $State.Value -is [Management.Automation.PSCustomObject]) {
    throw "Optional Docker inspect list has an invalid type: $Name"
  }
  return @($State.Value)
}

function Get-DockerRequiredNullableList([object]$Object, [string]$Name) {
  $State = Get-DockerPropertyState $Object $Name
  if (-not $State.Present) {
    throw "Required nullable Docker inspect list is missing: $Name"
  }
  if ($State.IsNull) { return @() }
  if ($State.Value -is [string] -or
      $State.Value -isnot [Collections.IEnumerable] -or
      $State.Value -is [System.Management.Automation.PSCustomObject]) {
    throw "Required nullable Docker inspect list has an invalid type: $Name"
  }
  return @($State.Value)
}

function Get-DockerNullableListValue([object]$Value, [string]$Name) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [string] -or
      $Value -isnot [Collections.IEnumerable] -or
      $Value -is [System.Management.Automation.PSCustomObject]) {
    throw "Docker inspect map value is not a nullable list: $Name"
  }
  return @($Value)
}

function Get-DockerLabel([object]$Labels, [string]$Name) {
  if ($null -eq $Labels) { return $null }
  if ($Labels -isnot [System.Management.Automation.PSCustomObject]) {
    throw "Docker inspect Labels has an invalid type"
  }
  $ExactProperties = @($Labels.PSObject.Properties | Where-Object { $_.Name -ceq $Name })
  $CaseInsensitiveProperties = @($Labels.PSObject.Properties | Where-Object {
      [StringComparer]::OrdinalIgnoreCase.Equals($_.Name, $Name)
    })
  if ($ExactProperties.Count -gt 1 -or
      $CaseInsensitiveProperties.Count -ne $ExactProperties.Count) {
    throw "Docker inspect label key is ambiguous or has a case-variant collision: $Name"
  }
  if ($ExactProperties.Count -eq 0) { return $null }
  if ($null -eq $ExactProperties[0].Value -or
      $ExactProperties[0].Value -isnot [string]) {
    throw "Docker inspect label value is null or has an invalid type: $Name"
  }
  return [string]$ExactProperties[0].Value
}

function New-RuntimeCleanupProofState() {
  return [pscustomobject]@{
    SameEngineVerified = $false
    OwnershipAmbiguityCount = [int]-1
    OwnedResourceCleanupCompleted = $false
    FinalOwnershipAmbiguityCount = [int]-1
    HostListenerCount = [int]-1
    FinalContainerCount = [int]-1
    FinalVolumeCount = [int]-1
    FinalNetworkCount = [int]-1
    Proven = $false
  }
}

function Reset-RuntimeCleanupProofState([object]$State) {
  $State.SameEngineVerified = $false
  $State.OwnershipAmbiguityCount = [int]-1
  $State.OwnedResourceCleanupCompleted = $false
  $State.FinalOwnershipAmbiguityCount = [int]-1
  $State.HostListenerCount = [int]-1
  $State.FinalContainerCount = [int]-1
  $State.FinalVolumeCount = [int]-1
  $State.FinalNetworkCount = [int]-1
  $State.Proven = $false
}

function Complete-RuntimeCleanupProof([object]$State) {
  $State.Proven = $false
  if ($State.SameEngineVerified -isnot [bool] -or
      $State.OwnedResourceCleanupCompleted -isnot [bool] -or
      $State.SameEngineVerified -cne $true -or
      $State.OwnedResourceCleanupCompleted -cne $true) {
    throw "Runtime cleanup proof has not completed on the same Docker engine"
  }
  foreach ($CountName in @(
      "OwnershipAmbiguityCount",
      "FinalOwnershipAmbiguityCount",
      "HostListenerCount",
      "FinalContainerCount",
      "FinalVolumeCount",
      "FinalNetworkCount"
    )) {
    $Count = $State.$CountName
    if (($Count -isnot [int] -and $Count -isnot [long]) -or $Count -ne 0) {
      throw "Runtime cleanup proof is not exact zero: $CountName"
    }
  }
  $State.Proven = $true
  return $true
}

function Assert-DockerEngineIdentity() {
  if ([string]::IsNullOrEmpty($script:DockerEndpoint) -or
      [string]::IsNullOrEmpty($script:DockerEngineId)) {
    throw "Docker endpoint identity has not been established"
  }
  $InfoResult = Invoke-Docker @("info", "--format", "{{json .}}") 30
  $Info = ConvertFrom-Json -InputObject ($InfoResult.Output -join "`n")
  if ($Info.ID -cne $script:DockerEngineId -or $Info.OSType -cne "linux") {
    throw "Docker daemon identity or OS type drifted"
  }
  return $Info
}

function Get-SealedRuntimeInventory(
  [string[]]$AllowedContainerNames,
  [string[]]$AllowedVolumeNames,
  [string[]]$AllowedNetworkNames,
  [string[]]$BaselineContainerIds,
  [string[]]$BaselineVolumeNames,
  [string[]]$BaselineNetworkIds,
  [bool]$IncludePostBaselineDelta,
  [string]$ProjectId,
  [string]$Nonce
) {
  $CurrentContainerIds = @((Invoke-Docker @(
        "ps", "-aq", "--no-trunc"
      ) 30).Output)
  $CurrentVolumeNames = @((Invoke-Docker @("volume", "ls", "--quiet") 30).Output)
  $CurrentNetworkIds = @((Invoke-Docker @(
        "network", "ls", "--no-trunc", "--quiet"
      ) 30).Output)
  if (@($CurrentContainerIds | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count -ne 0 -or
      @($CurrentNetworkIds | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count -ne 0 -or
      @($CurrentVolumeNames | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -ne 0) {
    throw "Docker cleanup inventory contains an unsafe identifier"
  }

  $AmbiguousOwnership = [Collections.Generic.List[string]]::new()
  $OwnedContainers = @()
  foreach ($ContainerId in $CurrentContainerIds) {
    if ($IncludePostBaselineDelta -and $ContainerId -cin $BaselineContainerIds) {
      continue
    }
    $Inspect = Get-DockerInspect "container" $ContainerId
    $Name = (Get-DockerRequiredString $Inspect "Name").TrimStart('/')
    $InspectConfig = Get-DockerRequiredObject $Inspect "Config"
    $InspectLabels = Get-DockerOptionalProperty $InspectConfig "Labels"
    $ProjectLabel = Get-DockerLabel $InspectLabels "com.supabase.cli.project"
    $SealedLabel = Get-DockerLabel $InspectLabels "wouldkeep.sealed"
    $NameExpected = $Name -cin $AllowedContainerNames
    $LabelExact = $ProjectLabel -ceq $ProjectId -or $SealedLabel -ceq $Nonce
    $LabelConflicts = (-not [string]::IsNullOrEmpty($ProjectLabel) -and
        $ProjectLabel -cne $ProjectId) -or
      (-not [string]::IsNullOrEmpty($SealedLabel) -and $SealedLabel -cne $Nonce)
    if (-not $IncludePostBaselineDelta) {
      if ($NameExpected -or $LabelExact) {
        $null = $AmbiguousOwnership.Add(("container|{0}|{1}" -f $ContainerId, $Name))
      }
      continue
    }
    if (-not $NameExpected -or -not $LabelExact -or $LabelConflicts) {
      $null = $AmbiguousOwnership.Add(("container|{0}|{1}" -f $ContainerId, $Name))
    } else {
      $OwnedContainers += [pscustomobject]@{ Id = $ContainerId; Inspect = $Inspect }
    }
  }

  $OwnedVolumes = @()
  foreach ($VolumeName in $CurrentVolumeNames) {
    if ($IncludePostBaselineDelta -and $VolumeName -cin $BaselineVolumeNames) {
      continue
    }
    $Inspect = Get-DockerInspect "volume" $VolumeName
    $InspectLabels = Get-DockerOptionalProperty $Inspect "Labels"
    $ProjectLabel = Get-DockerLabel $InspectLabels "com.supabase.cli.project"
    $SealedLabel = Get-DockerLabel $InspectLabels "wouldkeep.sealed"
    $InspectName = Get-DockerRequiredString $Inspect "Name"
    $NameExpected = $InspectName -cin $AllowedVolumeNames
    $LabelExact = $ProjectLabel -ceq $ProjectId -or $SealedLabel -ceq $Nonce
    $LabelConflicts = (-not [string]::IsNullOrEmpty($ProjectLabel) -and
        $ProjectLabel -cne $ProjectId) -or
      (-not [string]::IsNullOrEmpty($SealedLabel) -and $SealedLabel -cne $Nonce)
    if (-not $IncludePostBaselineDelta) {
      if ($NameExpected -or $LabelExact) {
        $null = $AmbiguousOwnership.Add(("volume|{0}" -f $InspectName))
      }
      continue
    }
    if ($InspectName -cne $VolumeName -or
        -not $NameExpected -or -not $LabelExact -or $LabelConflicts) {
      $null = $AmbiguousOwnership.Add(("volume|{0}" -f $InspectName))
    } else {
      $OwnedVolumes += $InspectName
    }
  }

  $OwnedNetworks = @()
  foreach ($NetworkId in $CurrentNetworkIds) {
    if ($IncludePostBaselineDelta -and $NetworkId -cin $BaselineNetworkIds) {
      continue
    }
    $Inspect = Get-DockerInspect "network" $NetworkId
    $InspectLabels = Get-DockerOptionalProperty $Inspect "Labels"
    $ProjectLabel = Get-DockerLabel $InspectLabels "com.supabase.cli.project"
    $SealedLabel = Get-DockerLabel $InspectLabels "wouldkeep.sealed"
    $InspectName = Get-DockerRequiredString $Inspect "Name"
    $NameExpected = $InspectName -cin $AllowedNetworkNames
    $LabelExact = $ProjectLabel -ceq $ProjectId -or $SealedLabel -ceq $Nonce
    $LabelConflicts = (-not [string]::IsNullOrEmpty($ProjectLabel) -and
        $ProjectLabel -cne $ProjectId) -or
      (-not [string]::IsNullOrEmpty($SealedLabel) -and $SealedLabel -cne $Nonce)
    if (-not $IncludePostBaselineDelta) {
      if ($NameExpected -or $LabelExact) {
        $null = $AmbiguousOwnership.Add(("network|{0}|{1}" -f $NetworkId, $InspectName))
      }
      continue
    }
    if (-not $NameExpected -or -not $LabelExact -or $LabelConflicts) {
      $null = $AmbiguousOwnership.Add(("network|{0}|{1}" -f $NetworkId, $InspectName))
    } else {
      $OwnedNetworks += [pscustomobject]@{ Id = $NetworkId; Name = $InspectName }
    }
  }

  return [pscustomobject]@{
    Containers = @($OwnedContainers)
    Volumes = @($OwnedVolumes)
    Networks = @($OwnedNetworks)
    AmbiguousOwnership = @($AmbiguousOwnership.ToArray())
  }
}

function Get-FreeLoopbackPort() {
  $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $Listener.Start()
    return ([Net.IPEndPoint]$Listener.LocalEndpoint).Port
  } finally {
    $Listener.Stop()
  }
}

function Get-OrdinalSorted([string[]]$Values) {
  $Copy = [string[]]@($Values)
  [Array]::Sort($Copy, [StringComparer]::Ordinal)
  return ,$Copy
}

function Get-HostListenersOnPort([int]$LocalPort) {
  $Listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  return @($Listeners | Where-Object {
      $PortValue = $_.LocalPort
      if ($PortValue -isnot [byte] -and
          $PortValue -isnot [sbyte] -and
          $PortValue -isnot [short] -and
          $PortValue -isnot [ushort] -and
          $PortValue -isnot [int] -and
          $PortValue -isnot [uint] -and
          $PortValue -isnot [long] -and
          $PortValue -isnot [ulong]) {
        throw "Listening TCP connection has a non-numeric local port"
      }
      [long]$PortValue -eq $LocalPort
    })
}

function Assert-FrozenInput(
  [string]$Root,
  [string[]]$ExpectedPaths,
  [hashtable]$ExpectedHashes
) {
  $RootFull = [IO.Path]::GetFullPath($Root)
  $RootPrefix = $RootFull.TrimEnd([IO.Path]::DirectorySeparatorChar) +
    [IO.Path]::DirectorySeparatorChar
  $ActualPaths = @(Get-ChildItem -LiteralPath $RootFull -File -Recurse -Force |
    ForEach-Object {
      if (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Frozen input contains a link"
      }
      [IO.Path]::GetRelativePath($RootFull, $_.FullName).Replace('\', '/')
    })
  $ActualPaths = Get-OrdinalSorted $ActualPaths
  if (($ActualPaths -join "`n") -cne ($ExpectedPaths -join "`n")) {
    throw "Frozen input contains an unreviewed or missing file"
  }
  foreach ($RelativePath in $ExpectedPaths) {
    $FullPath = [IO.Path]::GetFullPath((Join-Path $RootFull $RelativePath))
    if (-not $FullPath.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Frozen input path escaped its root"
    }
    $ActualHash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).
      Hash.ToLowerInvariant()
    if (-not [StringComparer]::Ordinal.Equals($ActualHash, $ExpectedHashes[$RelativePath])) {
      throw "Frozen input hash mismatch: $RelativePath"
    }
  }
}

function Get-ExactFirewallRule([string]$RuleName, [string]$PolicyStore) {
  $Rules = @(Get-NetFirewallRule -PolicyStore $PolicyStore -ErrorAction Stop |
    Where-Object { [StringComparer]::OrdinalIgnoreCase.Equals($_.Name, $RuleName) })
  if (@($Rules | Where-Object { $_.Name -cne $RuleName }).Count -ne 0) {
    throw "A firewall rule has a case-variant collision in $PolicyStore"
  }
  if ($Rules.Count -gt 1) {
    throw "More than one firewall rule has the sealed nonce name in $PolicyStore"
  }
  if ($Rules.Count -eq 1) {
    return $Rules[0]
  }
}

function Test-AnyOrEmptyFirewallValue([object[]]$Value) {
  $Values = @($Value | ForEach-Object { $_.ToString() })
  return $Values.Count -eq 0 -or
    ($Values.Count -eq 1 -and $Values[0] -in @("", "Any"))
}

function Assert-SealedFirewallRule(
  [object]$Rule,
  [string]$RuleName,
  [string]$DisplayName,
  [string]$Group,
  [string]$Description,
  [object]$ExpectedInstanceId,
  [int]$LocalPort,
  [string[]]$RemoteAddresses
) {
  if ($null -eq $Rule -or
      $ExpectedInstanceId -isnot [string] -or
      [string]::IsNullOrWhiteSpace($ExpectedInstanceId) -or
      $Rule.InstanceID -isnot [string] -or
      [string]::IsNullOrWhiteSpace($Rule.InstanceID) -or
      $Rule.Name -cne $RuleName -or
      $Rule.DisplayName -cne $DisplayName -or
      $Rule.Group -cne $Group -or
      $Rule.Description -cne $Description -or
      $Rule.InstanceID -cne $ExpectedInstanceId -or
      $Rule.Direction.ToString() -cne "Inbound" -or
      $Rule.Action.ToString() -cne "Block" -or
      $Rule.Enabled.ToString() -cne "True" -or
      $Rule.Profile.ToString() -cne "Any" -or
      $Rule.PolicyStoreSourceType.ToString() -cne "Local") {
    throw "Temporary firewall rule identity or policy contract failed"
  }
  $PortFilters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $Rule `
      -ErrorAction Stop)
  $LocalPorts = @($PortFilters[0].LocalPort | ForEach-Object { $_.ToString() })
  $RemotePorts = @($PortFilters[0].RemotePort | ForEach-Object { $_.ToString() })
  if ($PortFilters.Count -ne 1 -or
      $PortFilters[0].Protocol.ToString() -notin @("TCP", "6") -or
      $LocalPorts.Count -ne 1 -or $LocalPorts[0] -cne $LocalPort.ToString() -or
      $RemotePorts.Count -ne 1 -or $RemotePorts[0] -cne "Any") {
    throw "Temporary firewall TCP port scope is not exact"
  }
  $AddressFilters = @(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $Rule `
      -ErrorAction Stop)
  $LocalAddresses = @(
    $AddressFilters[0].LocalAddress | ForEach-Object { $_.ToString() }
  )
  if ($AddressFilters.Count -ne 1 -or
      $LocalAddresses.Count -ne 1 -or $LocalAddresses[0] -cne "Any") {
    throw "Temporary firewall local-address scope is not exact"
  }
  $ActualRemoteAddresses = Get-OrdinalSorted @(
    $AddressFilters[0].RemoteAddress | ForEach-Object { $_.ToString() }
  )
  $ExpectedRemoteAddresses = Get-OrdinalSorted $RemoteAddresses
  if (($ActualRemoteAddresses -join "`n") -cne ($ExpectedRemoteAddresses -join "`n")) {
    throw "Temporary firewall non-loopback remote-address scope is not exact"
  }
  $ApplicationFilters = @(
    Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  )
  $ServiceFilters = @(
    Get-NetFirewallServiceFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  )
  $InterfaceFilters = @(
    Get-NetFirewallInterfaceFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  )
  $InterfaceTypeFilters = @(
    Get-NetFirewallInterfaceTypeFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  )
  if ($ApplicationFilters.Count -ne 1 -or
      -not (Test-AnyOrEmptyFirewallValue @($ApplicationFilters[0].Program)) -or
      $ServiceFilters.Count -ne 1 -or
      -not (Test-AnyOrEmptyFirewallValue @($ServiceFilters[0].Service)) -or
      $InterfaceFilters.Count -ne 1 -or
      -not (Test-AnyOrEmptyFirewallValue @($InterfaceFilters[0].InterfaceAlias)) -or
      $InterfaceTypeFilters.Count -ne 1 -or
      -not (Test-AnyOrEmptyFirewallValue @($InterfaceTypeFilters[0].InterfaceType))) {
    throw "Temporary firewall application, service, or interface scope is not default-any"
  }
  return [pscustomobject]@{
    Rule = $Rule
    PortFilter = $PortFilters[0]
    AddressFilter = $AddressFilters[0]
    RemoteAddresses = $ActualRemoteAddresses
  }
}

function Assert-FirewallProfilesEnabled() {
  $Profiles = @(Get-NetFirewallProfile -PolicyStore "ActiveStore" -ErrorAction Stop)
  $ProfileNames = Get-OrdinalSorted @($Profiles | ForEach-Object { $_.Name.ToString() })
  if ($Profiles.Count -ne 3 -or
      ($ProfileNames -join "`n") -cne "Domain`nPrivate`nPublic" -or
      @($Profiles | Where-Object { $_.Enabled.ToString() -cne "True" }).Count -ne 0) {
    throw "All three active Windows Firewall profiles must be enabled"
  }
  return ,$Profiles
}

$ExpectedInputPaths = @(
  "supabase/schema.sql",
  "supabase/migrations/20260712_legacy_history_marker.sql",
  "supabase/migrations/20260714_legacy_history_marker.sql",
  "supabase/migrations/20260715_legacy_history_marker.sql",
  "supabase/migrations/20260716_legacy_history_marker.sql",
  "supabase/migrations/20260717_legacy_history_marker.sql",
  "supabase/migrations/20260718000100_knowledge_workspace_foundation.sql",
  "supabase/migrations/20260718000200_document_versions.sql",
  "supabase/migrations/20260718000300_document_organization.sql",
  "supabase/migrations/20260718000400_document_sources.sql",
  "supabase/migrations/20260718000500_publication_flow.sql",
  "supabase/migrations/20260718000600_site_owner_permissions.sql",
  "supabase/migrations/20260718000700_profile_avatars.sql",
  "supabase/migrations/20260718000800_profile_personalization.sql",
  "supabase/migrations/20260718000900_ai_assistant_foundation.sql",
  "supabase/migrations/20260718001000_ai_runtime_safety.sql",
  "supabase/migrations/20260718001100_publication_soft_delete_guard.sql",
  "supabase/migrations/20260718001200_publication_write_acl_hardening.sql",
  "supabase/migrations/20260721000100_document_links_integrity.sql",
  "supabase/migrations/20260722000100_site_owner_role_invariant.sql",
  "supabase/operations/20260722_tag_write_pause_disable.sql",
  "supabase/operations/20260722_tag_write_pause_enable.sql",
  "supabase/tests/20260722_tag_write_pause_behavior.sql",
  "supabase/tests/20260722_tag_write_pause_disposable.ps1",
  "supabase/tests/20260722_tag_write_pause_disposable_active_presence.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_baseline.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_cleanup.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_comment_drift.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_comment_restore.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_copy_from.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_deployment_permit.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_extended.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_residue.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_setup.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_writer.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_writer_absent.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_writer_release.sql",
  "supabase/tests/20260722_tag_write_pause_disposable_writer_state.sql",
  "supabase/tests/20260722_tag_write_pause_sealed.Dockerfile",
  "supabase/tests/20260722_tag_write_pause_sealed.ps1",
  "supabase/tests/20260722_tag_write_pause_sealed_attestation.sql",
  "supabase/tests/20260722_tag_write_pause_sealed_bootstrap.sql",
  "supabase/tests/20260722_tag_write_pause_sealed_config.toml",
  "supabase/tests/20260722_tag_write_pause_sealed_container.ps1",
  "supabase/tests/20260722_tag_write_pause_sealed_db.Dockerfile",
  "supabase/tests/20260722_tag_write_pause_sealed_pg_hba.conf",
  "supabase/tests/20260722_tag_write_pause_sealed_postgresql.conf",
  "supabase/tests/20260722_tag_write_pause_sealed_rename.sql",
  "supabase/tests/20260722_tag_write_pause_sealed_roles.sql",
  "supabase/tests/20260722_tag_write_pause_sealed_sanitize.sql",
  "supabase/tests/20260722_tag_write_pause_state.sql"
)
$ExpectedInputPaths = Get-OrdinalSorted $ExpectedInputPaths
$ManifestSource = Join-Path $PSScriptRoot "20260722_tag_write_pause_sealed_manifest.sha256"
if (-not (Test-Path -LiteralPath $ManifestSource -PathType Leaf)) {
  throw "Reviewed sealed input manifest is missing"
}
$ManifestLines = @(Get-Content -LiteralPath $ManifestSource -Encoding utf8)
$ManifestPaths = [Collections.Generic.List[string]]::new()
$ManifestHashes = @{}
$PriorPath = ""
foreach ($Line in $ManifestLines) {
  if ($Line -notmatch '^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)$') {
    throw "Invalid reviewed manifest line"
  }
  $Hash = $Matches[1]
  $RelativePath = $Matches[2]
  if ($PriorPath.Length -gt 0 -and
      [StringComparer]::Ordinal.Compare($PriorPath, $RelativePath) -ge 0) {
    throw "Reviewed manifest is not unique and ordinally sorted"
  }
  $PriorPath = $RelativePath
  $ManifestPaths.Add($RelativePath)
  $ManifestHashes[$RelativePath] = $Hash
}
if (($ManifestPaths.ToArray() -join "`n") -cne ($ExpectedInputPaths -join "`n")) {
  throw "Reviewed manifest does not contain the exact sealed allowlist"
}
foreach ($RelativePath in $ExpectedInputPaths) {
  $Source = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot $RelativePath))
  if (-not $Source.StartsWith($RepositoryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      -not (Test-Path -LiteralPath $Source -PathType Leaf) -or
      ((Get-Item -LiteralPath $Source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Reviewed source is missing, linked, or escaped the repository: $RelativePath"
  }
  $ActualHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals($ActualHash, $ManifestHashes[$RelativePath])) {
    throw "Reviewed source hash mismatch: $RelativePath"
  }
}
if ($ExpectedInputPaths -match '20260722000(?:150|200)' -or
    $ExpectedInputPaths -match '(^|/)(?:\.env|project-ref)(?:$|\.)') {
  throw "A pending migration or credential file entered the sealed allowlist"
}

$NonceBytes = [byte[]]::new(8)
[Security.Cryptography.RandomNumberGenerator]::Fill($NonceBytes)
$Nonce = [Convert]::ToHexString($NonceBytes).ToLowerInvariant()
$DatabaseName = "wouldkeep_p1b_tag_write_pause_$Nonce"
$ProjectId = "wouldkeep-p1b-sealed-$Nonce"
$CliNetworkName = "supabase_network_$ProjectId"
$FirewallRuleName = "wouldkeep-p1b-sealed-$Nonce"
$FirewallRuleDisplayName = "Wouldkeep sealed PG17 non-loopback block ($Nonce)"
$FirewallRuleGroup = "Wouldkeep sealed local PG17 acceptance"
$FirewallRuleDescription = "Temporary non-loopback block for one sealed local PG17 port"
$FirewallRemoteAddresses = @(
  "0.0.0.0-126.255.255.255",
  "128.0.0.0-255.255.255.255",
  "::",
  "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"
)
$RunnerTag = "wouldkeep-p1b-tag-write-pause-runner:$Nonce"
$DatabaseImageTag = "wouldkeep-p1b-tag-write-pause-db:$Nonce"
$BootstrapContainerName = "supabase_db_$ProjectId"
$DatabaseContainerName = "wouldkeep-p1b-sealed-db-$Nonce"
$RunnerContainerName = "wouldkeep-p1b-sealed-runner-$Nonce"
$WorkingRoot = Join-Path ([IO.Path]::GetTempPath()) "wouldkeep-p1b-sealed-$Nonce"
$TempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
  [IO.Path]::DirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
$WorkingFull = [IO.Path]::GetFullPath($WorkingRoot)
if (-not $WorkingFull.StartsWith($TempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $WorkingFull)) {
  throw "Sealed working path is unsafe or already exists"
}
$WorkingPrefix = $WorkingFull.TrimEnd([IO.Path]::DirectorySeparatorChar) +
  [IO.Path]::DirectorySeparatorChar
$NativeTemp = [IO.Path]::GetFullPath((Join-Path $WorkingFull "native-tmp"))
if (-not $NativeTemp.StartsWith($WorkingPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Sealed native-process temporary directory escaped the working root"
}
$ReviewedNativeBase = Get-ReviewedNativeBaseEnvironment
$DockerExecutableDirectory = [IO.Path]::GetFullPath((Split-Path -Parent $DockerPath))
$WindowsSystem32 = [IO.Path]::GetFullPath((Join-Path $ReviewedNativeBase.SystemRoot "System32"))
if (-not [IO.Directory]::Exists($DockerExecutableDirectory) -or
    -not [IO.Directory]::Exists($WindowsSystem32) -or
    $DockerExecutableDirectory.Contains([IO.Path]::PathSeparator) -or
    $WindowsSystem32.Contains([IO.Path]::PathSeparator)) {
  throw "Reviewed native executable directories are invalid"
}
$ReviewedPathEntries = [Collections.Generic.List[string]]::new()
foreach ($PathEntry in @($WindowsSystem32, $DockerExecutableDirectory)) {
  if (@($ReviewedPathEntries.ToArray() | Where-Object {
        [StringComparer]::OrdinalIgnoreCase.Equals($_, $PathEntry)
      }).Count -eq 0) {
    $null = $ReviewedPathEntries.Add($PathEntry)
  }
}
$ReviewedNativePath = $ReviewedPathEntries.ToArray() -join [IO.Path]::PathSeparator
$HostUserProfile = [Environment]::GetFolderPath(
  [Environment+SpecialFolder]::UserProfile
)
if ([string]::IsNullOrWhiteSpace($HostUserProfile) -or
    -not [IO.Path]::IsPathFullyQualified($HostUserProfile) -or
    -not (Test-Path -LiteralPath $HostUserProfile -PathType Container) -or
    ((Get-Item -LiteralPath $HostUserProfile -Force).Attributes -band
      [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "The reviewed host user profile is missing, linked, or invalid"
}
$HostUserProfile = [IO.Path]::GetFullPath($HostUserProfile)
$HostDockerConfig = [IO.Path]::GetFullPath((Join-Path $HostUserProfile ".docker"))
if (-not $HostDockerConfig.StartsWith(
      $HostUserProfile.TrimEnd([IO.Path]::DirectorySeparatorChar) +
        [IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not (Test-Path -LiteralPath $HostDockerConfig -PathType Container) -or
    ((Get-Item -LiteralPath $HostDockerConfig -Force).Attributes -band
      [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "The reviewed host Docker config is missing, linked, or escaped the user profile"
}
$ContextRoot = Join-Path $WorkingFull "context"
$InputRoot = Join-Path $ContextRoot "input"
$BootstrapRoot = Join-Path $WorkingFull "bootstrap"
$BootstrapSupabase = Join-Path $BootstrapRoot "supabase"
$IsolatedHome = Join-Path $WorkingFull "home"
$ContainerEvidence = Join-Path $EvidenceFull "container"

$BootstrapContainerId = $null
$DatabaseContainerId = $null
$RunnerContainerId = $null
$DataVolumeName = $null
$FinalDataVolumeName = "wouldkeep_p1b_sealed_pgdata_$Nonce"
$ArchiveVolumeName = "wouldkeep_p1b_sealed_archive_$Nonce"
$FinalDataVolumeCreated = $false
$ArchiveVolumeCreated = $false
$QuiesceHelperId = $null
$ArchiveHelperId = $null
$RestoreHelperId = $null
$CliNetworkIds = @()
$FirewallRuleInstanceId = $null
$FirewallRuleOwnershipEstablished = $false
$FirewallRuleCreated = $false
$RunnerImageBuilt = $false
$RunnerImageId = $null
$DatabaseImageBuilt = $false
$DatabaseImageId = $null
$ChangedMutableTags = [Collections.Generic.List[string]]::new()
$OriginalMutableTagIds = @{}
$PinnedImageIds = @{}
$SystemIdentifier = $null
$ContainersBefore = @()
$VolumesBefore = @()
$NetworksBefore = @()
$CliBaselineCaptured = $false
$MainFailure = $null
$CleanupFailures = [Collections.Generic.List[string]]::new()
$CleanupExceptions = [Collections.Generic.List[Exception]]::new()
$Succeeded = $false

try {
foreach ($Directory in @(
    $InputRoot,
    (Join-Path $BootstrapSupabase "migrations"),
    $IsolatedHome,
    (Join-Path $IsolatedHome ".config"),
    (Join-Path $IsolatedHome ".docker"),
    (Join-Path $IsolatedHome "AppData/Roaming"),
    (Join-Path $IsolatedHome "AppData/Local"),
    $NativeTemp
  )) {
  New-Item -ItemType Directory -Path $Directory -Force -ErrorAction Stop | Out-Null
}

foreach ($RelativePath in $ExpectedInputPaths) {
  $Source = Join-Path $RepositoryRoot $RelativePath
  $Destination = Join-Path $InputRoot $RelativePath
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force |
    Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
  $CopiedHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).
    Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals($CopiedHash, $ManifestHashes[$RelativePath])) {
    throw "Source changed while freezing sealed input: $RelativePath"
  }
}
$null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
$ContextManifestPath = Join-Path $ContextRoot "input-manifest.sha256"
$ContextDockerfilePath = Join-Path $ContextRoot "Dockerfile"
$ManifestLines | Set-Content -LiteralPath $ContextManifestPath `
  -Encoding utf8
Copy-Item -LiteralPath (Join-Path $InputRoot `
  "supabase/tests/20260722_tag_write_pause_sealed.Dockerfile") `
  -Destination $ContextDockerfilePath

function Assert-FrozenBuildContextMetadata() {
  $ActualDockerfileHash = (Get-FileHash -LiteralPath $ContextDockerfilePath -Algorithm SHA256).
    Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals(
      $ActualDockerfileHash,
      $ManifestHashes["supabase/tests/20260722_tag_write_pause_sealed.Dockerfile"]
    ) -or
      ((Get-Content -LiteralPath $ContextManifestPath -Encoding utf8) -join "`n") -cne
        ($ManifestLines -join "`n")) {
    throw "Frozen runner build metadata changed after review"
  }
}
$null = Assert-FrozenBuildContextMetadata

$BootstrapSchemaSource = Join-Path $InputRoot "supabase/schema.sql"
$BootstrapRolesSource = Join-Path $InputRoot `
  "supabase/tests/20260722_tag_write_pause_sealed_roles.sql"
$RenderedRolesArtifact = Get-RenderedBootstrapRolesArtifact `
  $BootstrapSchemaSource $BootstrapRolesSource
if (-not [StringComparer]::Ordinal.Equals(
    $RenderedRolesArtifact.SchemaSha256,
    $ManifestHashes["supabase/schema.sql"]
  ) -or
    -not [StringComparer]::Ordinal.Equals(
      $RenderedRolesArtifact.RolesTemplateSha256,
      $ManifestHashes["supabase/tests/20260722_tag_write_pause_sealed_roles.sql"]
    )) {
  throw "Rendered bootstrap roles sources do not match the sealed manifest"
}
$RenderedRolesPath = Join-Path $BootstrapSupabase "roles.sql"
[IO.File]::WriteAllText(
  $RenderedRolesPath,
  $RenderedRolesArtifact.Text,
  [Text.UTF8Encoding]::new($false)
)
if ((Get-FileHash -LiteralPath $RenderedRolesPath -Algorithm SHA256).
    Hash.ToLowerInvariant() -cne $RenderedRolesArtifact.RenderedRolesSha256) {
  throw "Rendered bootstrap roles changed while being written"
}
Write-HostEvidence "bootstrap-rendered-inputs.txt" @(
  "tag_write_pause_sealed_bootstrap_roles_rendered",
  "schema_source_sha256=$($RenderedRolesArtifact.SchemaSha256)",
  "roles_template_sha256=$($RenderedRolesArtifact.RolesTemplateSha256)",
  "rendered_roles_sha256=$($RenderedRolesArtifact.RenderedRolesSha256)",
  "psql_meta_commands=0",
  "ledger_mutations=0"
)
foreach ($Migration in $ExpectedInputPaths | Where-Object { $_ -match '^supabase/migrations/' }) {
  Copy-Item -LiteralPath (Join-Path $InputRoot $Migration) `
    -Destination (Join-Path $BootstrapSupabase "migrations/$(Split-Path -Leaf $Migration)")
}
$MigrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $BootstrapSupabase "migrations") `
  -File -Filter "*.sql")
if ($MigrationFiles.Count -ne 19 -or
    $MigrationFiles.Name -match '20260722000(?:150|200)') {
  throw "Bootstrap snapshot is not the exact pre-00150 migration set"
}
$DbPort = Get-FreeLoopbackPort
do { $ShadowPort = Get-FreeLoopbackPort } while ($ShadowPort -eq $DbPort)
$ConfigTemplate = Get-Content -LiteralPath (Join-Path $InputRoot `
  "supabase/tests/20260722_tag_write_pause_sealed_config.toml") -Raw
$RenderedConfig = $ConfigTemplate.Replace("__PROJECT_ID__", $ProjectId).
  Replace("__DB_PORT__", $DbPort.ToString()).
  Replace("__SHADOW_PORT__", $ShadowPort.ToString())
if ($RenderedConfig -match '__[A-Z_]+__' -or
    $RenderedConfig -notmatch '(?m)^enabled = false$' -or
    $RenderedConfig -notmatch '(?m)^major_version = 17$' -or
    $RenderedConfig -notmatch '\[realtime\][\s\S]*?enabled = false' -or
    $RenderedConfig -notmatch '\[auth\][\s\S]*?enabled = true' -or
    $RenderedConfig -notmatch '\[storage\][\s\S]*?enabled = true') {
  throw "Rendered sealed Supabase config is invalid"
}
$RenderedConfig | Set-Content -LiteralPath (Join-Path $BootstrapSupabase "config.toml") `
  -Encoding utf8 -NoNewline
$RenderedConfigHash = (Get-FileHash -LiteralPath (Join-Path $BootstrapSupabase "config.toml") `
  -Algorithm SHA256).Hash.ToLowerInvariant()
if (Test-Path -LiteralPath (Join-Path $BootstrapSupabase "seed.sql")) {
  throw "Seeding is forbidden in the sealed bootstrap"
}

function Assert-BootstrapFrozenInput() {
  $ExpectedBootstrapFiles = @("config.toml", "roles.sql") + @(
    $ExpectedInputPaths | Where-Object { $_ -match '^supabase/migrations/' } |
      ForEach-Object { "migrations/$(Split-Path -Leaf $_)" }
  )
  $ExpectedBootstrapFiles = Get-OrdinalSorted $ExpectedBootstrapFiles
  $ActualBootstrapFiles = @(Get-ChildItem -LiteralPath $BootstrapSupabase -File -Recurse -Force |
    ForEach-Object {
      if (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Bootstrap snapshot contains a link"
      }
      [IO.Path]::GetRelativePath($BootstrapSupabase, $_.FullName).Replace('\', '/')
    })
  $ActualBootstrapFiles = Get-OrdinalSorted $ActualBootstrapFiles
  if (($ActualBootstrapFiles -join "`n") -cne ($ExpectedBootstrapFiles -join "`n")) {
    throw "Bootstrap snapshot contains an unreviewed or missing file"
  }
  $ActualRenderedRolesHash = (Get-FileHash -LiteralPath $RenderedRolesPath `
    -Algorithm SHA256).Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals(
      $ActualRenderedRolesHash,
      $RenderedRolesArtifact.RenderedRolesSha256
    ) -or
      (Read-StrictUtf8NoBom $RenderedRolesPath) -cne $RenderedRolesArtifact.Text) {
    throw "Rendered bootstrap roles changed after review"
  }
  foreach ($MigrationPath in $ExpectedInputPaths | Where-Object {
      $_ -match '^supabase/migrations/'
    }) {
    $Destination = Join-Path $BootstrapSupabase "migrations/$(Split-Path -Leaf $MigrationPath)"
    $ActualHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).
      Hash.ToLowerInvariant()
    if (-not [StringComparer]::Ordinal.Equals($ActualHash, $ManifestHashes[$MigrationPath])) {
      throw "Bootstrap frozen migration hash mismatch: $MigrationPath"
    }
  }
  $ActualConfigHash = (Get-FileHash -LiteralPath (Join-Path $BootstrapSupabase "config.toml") `
    -Algorithm SHA256).Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals($ActualConfigHash, $RenderedConfigHash)) {
    throw "Rendered bootstrap config changed after review"
  }
}
$null = Assert-BootstrapFrozenInput

$CliEnvironment = @{
  HOME = $IsolatedHome
  USERPROFILE = $IsolatedHome
  XDG_CONFIG_HOME = (Join-Path $IsolatedHome ".config")
  APPDATA = (Join-Path $IsolatedHome "AppData/Roaming")
  LOCALAPPDATA = (Join-Path $IsolatedHome "AppData/Local")
  DOCKER_CONFIG = (Join-Path $IsolatedHome ".docker")
  PATH = $ReviewedNativePath
  TEMP = $NativeTemp
  TMP = $NativeTemp
}
$DockerContextEnvironment = @{
  HOME = $HostUserProfile
  USERPROFILE = $HostUserProfile
  DOCKER_CONFIG = $HostDockerConfig
  PATH = $ReviewedNativePath
  TEMP = $NativeTemp
  TMP = $NativeTemp
}
$RemovedCredentialEnvironment = @(
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "DATABASE_URL",
  "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
  "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
  "DOCKER_CONFIG", "SUPABASE_INTERNAL_IMAGE_REGISTRY", "INTERNAL_IMAGE_REGISTRY",
  "BITBUCKET_CLONE_DIR"
)

  $ActualCliSha256 = (Get-FileHash -LiteralPath $SupabasePath -Algorithm SHA256).
    Hash.ToLowerInvariant()
  if (-not [StringComparer]::Ordinal.Equals($ActualCliSha256, $SupabaseCliSha256)) {
    throw "Supabase CLI SHA-256 does not match the reviewed 2.109.1 binary"
  }
  $CliVersion = Invoke-Native "supabase-version" $SupabasePath @("--version") 30 0 `
    $CliEnvironment $RemovedCredentialEnvironment
  if (($CliVersion.Output -join "`n").Trim() -cne "2.109.1") {
    throw "Supabase CLI must be exactly 2.109.1"
  }
  Write-HostEvidence "toolchain.txt" @(
    "supabase_cli=2.109.1",
    "supabase_cli_sha256=$SupabaseCliSha256",
    "supabase_postgres=$SupabasePostgresImage",
    "postgres_runner=$PostgresRunnerImage",
    "powershell=$PowerShellImage"
  )
  Write-HostEvidence "cli-helper-images.txt" @(
    "auth=required-and-pinned",
    "storage=required-and-pinned",
    "realtime=disabled-and-pinned",
    @($PinnedCliImages | ForEach-Object { "$($_.Service)=$($_.Exact)" })
  )
  Write-HostEvidence "input-manifest.txt" $ManifestLines
  Write-HostEvidence "started-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))

  if (-not $IsWindows) {
    throw "The temporary host-firewall gate requires Windows"
  }
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "An elevated PowerShell session is required for the temporary firewall gate"
  }
  foreach ($FirewallCommandName in @(
      "Get-NetFirewallRule", "New-NetFirewallRule", "Remove-NetFirewallRule",
      "Get-NetFirewallProfile",
      "Get-NetFirewallPortFilter", "Get-NetFirewallAddressFilter",
      "Get-NetFirewallApplicationFilter", "Get-NetFirewallServiceFilter",
      "Get-NetFirewallInterfaceFilter", "Get-NetFirewallInterfaceTypeFilter"
    )) {
    $FirewallCommand = Get-Command -Name $FirewallCommandName -ErrorAction Stop
    if ($FirewallCommand.Source -cne "NetSecurity") {
      throw "Unexpected command selected for $FirewallCommandName"
    }
  }
  $TcpConnectionCommand = Get-Command -Name "Get-NetTCPConnection" -ErrorAction Stop
  if ($TcpConnectionCommand.Source -cne "NetTCPIP") {
    throw "Unexpected command selected for Get-NetTCPConnection"
  }
  $FirewallService = Get-Service -Name "MpsSvc" -ErrorAction Stop
  if ($FirewallService.Status.ToString() -cne "Running") {
    throw "Windows Defender Firewall service must be running"
  }
  if (@(Get-ExactFirewallRule $FirewallRuleName "PersistentStore").Count -ne 0 -or
      @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore").Count -ne 0) {
    throw "The exact sealed nonce firewall rule already exists"
  }
  $FirewallProfiles = Assert-FirewallProfilesEnabled

  $ContextShow = Invoke-Native "docker-context-show" $DockerPath @("context", "show") `
    30 0 $DockerContextEnvironment $RemovedCredentialEnvironment
  if (($ContextShow.Output -join "`n").Trim() -cne "desktop-linux") {
    throw "Docker context must be exactly desktop-linux"
  }
  $ContextInspectResult = Invoke-Native "docker-context-inspect" $DockerPath @(
    "context", "inspect", "desktop-linux"
  ) 30 0 $DockerContextEnvironment $RemovedCredentialEnvironment
  $ContextInspect = @(ConvertFrom-Json -InputObject ($ContextInspectResult.Output -join "`n"))
  if ($ContextInspect.Count -ne 1) {
    throw "Docker desktop-linux context inspection was not unique"
  }
  $ContextEndpoint = $ContextInspect[0].Endpoints.docker.Host
  if ($ContextEndpoint -cne "npipe:////./pipe/dockerDesktopLinuxEngine") {
    throw "Docker desktop-linux context endpoint is not the reviewed local named pipe"
  }
  $script:DockerEndpoint = $ContextEndpoint
  $script:IsolatedDockerConfig = $CliEnvironment.DOCKER_CONFIG
  if (@(Get-ChildItem -LiteralPath $script:IsolatedDockerConfig -Force).Count -ne 0) {
    throw "Isolated Docker config must be empty before any Docker mutation"
  }
  $InitialEngineResult = Invoke-Docker @("info", "--format", "{{json .}}") 30
  $InitialEngine = ConvertFrom-Json -InputObject ($InitialEngineResult.Output -join "`n")
  if ([string]::IsNullOrWhiteSpace($InitialEngine.ID) -or
      $InitialEngine.OSType -cne "linux") {
    throw "Reviewed Docker endpoint is not one identifiable Linux engine"
  }
  $script:DockerEngineId = $InitialEngine.ID
  $CliEnvironment.DOCKER_HOST = $script:DockerEndpoint
  $null = Assert-DockerEngineIdentity
  Write-HostEvidence "docker-engine.txt" @(
    "context=desktop-linux",
    "endpoint=$($script:DockerEndpoint)",
    "engine_id=$($script:DockerEngineId)",
    "os_type=linux"
  )

  $null = Invoke-Docker @("version", "--format", "{{.Server.Version}}") 30
  $LocalImageProof = [Collections.Generic.List[string]]::new()
  foreach ($Image in @(
      @($PinnedCliImages | ForEach-Object { $_.Exact }) +
      @($PostgresRunnerImage, $PowerShellImage)
    )) {
    $LocalImageId = (Invoke-Docker @(
      "image", "inspect", "--format", "{{.Id}}", $Image
    ) 30).Output
    if ($LocalImageId.Count -ne 1 -or $LocalImageId[0].Trim() -notmatch '^sha256:[a-f0-9]{64}$') {
      throw "A required exact digest image is not available in the local Docker engine"
    }
    $null = $LocalImageProof.Add("$Image=$($LocalImageId[0].Trim())")
  }
  Write-HostEvidence "local-image-preflight.txt" @(
    "tag_write_pause_sealed_local_images_verified",
    $LocalImageProof.ToArray()
  )
  foreach ($PinnedImage in $PinnedCliImages) {
    $ExactId = (Invoke-Docker @(
      "image", "inspect", "--format", "{{.Id}}", $PinnedImage.Exact
    ) 30).Output[0].Trim()
    if ($ExactId -notmatch '^sha256:[a-f0-9]{64}$') {
      throw "Cannot resolve an immutable CLI image ID: $($PinnedImage.Service)"
    }
    $PinnedImageIds[$PinnedImage.Service] = $ExactId

    $OriginalMutableId = Get-OptionalDockerImageId $PinnedImage.Tag
    $OriginalMutableTagIds[$PinnedImage.Tag] = if ($null -eq $OriginalMutableId) {
      "<absent>"
    } else {
      $OriginalMutableId
    }
    $null = Invoke-Docker @("tag", $PinnedImage.Exact, $PinnedImage.Tag) 30
    $null = $ChangedMutableTags.Add($PinnedImage.Tag)
    $TaggedId = (Invoke-Docker @(
      "image", "inspect", "--format", "{{.Id}}", $PinnedImage.Tag
    ) 30).Output[0].Trim()
    if ($TaggedId -cne $ExactId) {
      throw "Pinned CLI image tag did not resolve to its exact image ID"
    }
  }
  $SupabaseImageId = $PinnedImageIds["db"]

  $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
  $null = Assert-FrozenBuildContextMetadata
  $null = Invoke-Docker @(
    "build", "--pull=false", "--no-cache",
    "--build-arg", "POWERSHELL_IMAGE=$PowerShellImage",
    "--build-arg", "POSTGRES_RUNNER_IMAGE=$PostgresRunnerImage",
    "--tag", $RunnerTag,
    "--file", (Join-Path $ContextRoot "Dockerfile"),
    $ContextRoot
  ) 1200
  $RunnerImageBuilt = $true
  $RunnerImageInspect = Get-DockerInspect "image" $RunnerTag
  $RunnerImageConfig = Get-DockerRequiredObject $RunnerImageInspect "Config"
  $RunnerImageId = Get-DockerRequiredString $RunnerImageInspect "Id"
  $RunnerImageVolumes = @(Get-DockerOptionalMapProperties $RunnerImageConfig "Volumes")
  if ($RunnerImageVolumes.Count -ne 0 -or
      (Get-DockerRequiredString $RunnerImageConfig "User") -cne "65534:65534" -or
      $RunnerImageId -notmatch '^sha256:[a-f0-9]{64}$') {
    throw "Runner image must declare no volume and use the fixed unprivileged uid/gid"
  }
  $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
  $null = Assert-FrozenBuildContextMetadata
  $null = Invoke-Docker @(
    "build", "--pull=false", "--no-cache",
    "--build-arg", "SUPABASE_POSTGRES_IMAGE=$SupabasePostgresImage",
    "--tag", $DatabaseImageTag,
    "--file", (Join-Path $InputRoot `
      "supabase/tests/20260722_tag_write_pause_sealed_db.Dockerfile"),
    $ContextRoot
  ) 900
  $DatabaseImageBuilt = $true
  $DatabaseImageInspect = Get-DockerInspect "image" $DatabaseImageTag
  $DatabaseImageConfig = Get-DockerRequiredObject $DatabaseImageInspect "Config"
  $DatabaseImageId = Get-DockerRequiredString $DatabaseImageInspect "Id"
  $DatabaseImageVolumes = @(Get-DockerOptionalMapProperties $DatabaseImageConfig "Volumes")
  if ($DatabaseImageVolumes.Count -ne 0 -or
      (Get-DockerRequiredString $DatabaseImageConfig "User") -cne "postgres" -or
      $DatabaseImageId -notmatch '^sha256:[a-f0-9]{64}$') {
    throw "Derived database image must declare no volume and run as postgres"
  }

  $null = Assert-DockerEngineIdentity
  $ContainersBefore = @((Invoke-Docker @("ps", "-aq", "--no-trunc") 30).Output)
  $VolumesBefore = @((Invoke-Docker @("volume", "ls", "--quiet") 30).Output)
  $NetworksBefore = @((Invoke-Docker @(
    "network", "ls", "--no-trunc", "--quiet"
  ) 30).Output)
  if (@($ContainersBefore | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count -ne 0 -or
      @($NetworksBefore | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count -ne 0 -or
      @($VolumesBefore | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -ne 0) {
    throw "Docker object baseline contains an unsafe identifier"
  }
  $CliBaselineCaptured = $true

  $ExpectedFreshContainerNames = @(
    "supabase_db_$ProjectId",
    "supabase_auth_$ProjectId",
    "supabase_storage_$ProjectId",
    "supabase_realtime_$ProjectId",
    "wouldkeep-p1b-sealed-quiesce-$Nonce",
    "wouldkeep-p1b-sealed-archive-$Nonce",
    "wouldkeep-p1b-sealed-restore-$Nonce",
    $DatabaseContainerName,
    $RunnerContainerName
  )
  $ExpectedFreshVolumeNames = @(
    "supabase_db_$ProjectId",
    $FinalDataVolumeName,
    $ArchiveVolumeName
  )
  $ExpectedFreshNetworkNames = @($CliNetworkName)
  $ExistingContainerNames = @((Invoke-Docker @(
    "ps", "-a", "--format", "{{.Names}}"
  ) 30).Output)
  $ExistingNetworkNames = @((Invoke-Docker @(
    "network", "ls", "--format", "{{.Name}}"
  ) 30).Output)
  $ExistingScopedResources = @(
    @((Invoke-Docker @(
      "ps", "-aq", "--no-trunc", "--filter", "label=com.supabase.cli.project=$ProjectId"
    ) 30).Output)
    @((Invoke-Docker @(
      "ps", "-aq", "--no-trunc", "--filter", "label=wouldkeep.sealed=$Nonce"
    ) 30).Output)
    @((Invoke-Docker @(
      "volume", "ls", "--quiet", "--filter", "label=com.supabase.cli.project=$ProjectId"
    ) 30).Output)
    @((Invoke-Docker @(
      "volume", "ls", "--quiet", "--filter", "label=wouldkeep.sealed=$Nonce"
    ) 30).Output)
    @((Invoke-Docker @(
      "network", "ls", "--no-trunc", "--quiet", "--filter",
      "label=com.supabase.cli.project=$ProjectId"
    ) 30).Output)
    @((Invoke-Docker @(
      "network", "ls", "--no-trunc", "--quiet", "--filter", "label=wouldkeep.sealed=$Nonce"
    ) 30).Output)
  )
  if (@($ExistingContainerNames | Where-Object { $_ -cin $ExpectedFreshContainerNames }).Count -ne 0 -or
      @($VolumesBefore | Where-Object { $_ -cin $ExpectedFreshVolumeNames }).Count -ne 0 -or
      @($ExistingNetworkNames | Where-Object { $_ -cin $ExpectedFreshNetworkNames }).Count -ne 0 -or
      @($ExistingScopedResources).Count -ne 0) {
    throw "Nonce-scoped Docker names or labels are not fresh"
  }

  $ExistingCliNetworkIds = @((Invoke-Docker @(
    "network", "ls", "--no-trunc", "--filter", "label=com.supabase.cli.project=$ProjectId",
    "--quiet"
  ) 30).Output)
  $NamedNetworkMatches = @((Invoke-Docker @(
    "network", "ls", "--filter", "name=^$CliNetworkName$", "--format", "{{.Name}}"
  ) 30).Output | Where-Object { $_ -ceq $CliNetworkName })
  if ($ExistingCliNetworkIds.Count -ne 0 -or $NamedNetworkMatches.Count -ne 0) {
    throw "The nonce-scoped CLI network already exists"
  }

  $FirewallRuleOwnershipEstablished = $true
  $null = New-NetFirewallRule -PolicyStore "PersistentStore" `
    -Name $FirewallRuleName -DisplayName $FirewallRuleDisplayName `
    -Group $FirewallRuleGroup `
    -Description $FirewallRuleDescription `
    -Direction Inbound -Action Block -Enabled True -Profile Any `
    -Protocol TCP -LocalPort $DbPort -LocalAddress Any `
    -RemoteAddress $FirewallRemoteAddresses -ErrorAction Stop
  $FirewallRuleCreated = $true
  $PersistentFirewallRules = @(Get-ExactFirewallRule $FirewallRuleName "PersistentStore")
  if ($PersistentFirewallRules.Count -ne 1) {
    throw "Temporary firewall rule was not created exactly once"
  }
  $FirewallRuleInstanceIdCandidate = $PersistentFirewallRules[0].InstanceID
  if ($FirewallRuleInstanceIdCandidate -isnot [string] -or
      [string]::IsNullOrWhiteSpace($FirewallRuleInstanceIdCandidate)) {
    throw "Temporary firewall rule has no stable InstanceID"
  }
  $FirewallRuleInstanceId = [string]$FirewallRuleInstanceIdCandidate
  $PersistentFirewall = Assert-SealedFirewallRule $PersistentFirewallRules[0] `
    $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
    $FirewallRuleDescription $FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
  $ActiveFirewallRules = @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore")
  if ($ActiveFirewallRules.Count -ne 1) {
    throw "Temporary firewall rule is not active"
  }
  $ActiveFirewall = Assert-SealedFirewallRule $ActiveFirewallRules[0] `
    $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
    $FirewallRuleDescription $FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
  Write-HostEvidence "firewall-gate.txt" @(
    "tag_write_pause_sealed_firewall_gate_active",
    "name=$FirewallRuleName",
    "instance_id=$FirewallRuleInstanceId",
    "policy_store=PersistentStore",
    "policy_store_source=$($PersistentFirewall.Rule.PolicyStoreSource)",
    "policy_store_source_type=$($PersistentFirewall.Rule.PolicyStoreSourceType)",
    "direction=Inbound",
    "action=Block",
    "enabled=True",
    "profile=Any",
    "protocol=TCP",
    "local_port=$DbPort",
    "local_address=Any",
    "remote_addresses=$($ActiveFirewall.RemoteAddresses -join ',')"
    "active_profiles=$((Get-OrdinalSorted @($FirewallProfiles | ForEach-Object { $_.Name })) -join ',')",
    "all_active_profiles_enabled=True"
  )

  if (Test-Path -LiteralPath (Join-Path $BootstrapSupabase ".temp")) {
    $ForbiddenTempOverrides = @(Get-ChildItem -LiteralPath (Join-Path $BootstrapSupabase ".temp") `
      -File -Force | Where-Object { $_.Name -like "*-version" -or $_.Name -ceq "project-ref" })
    if ($ForbiddenTempOverrides.Count -ne 0) {
      throw "Bootstrap contains a forbidden CLI image-version or project-ref override"
    }
  }
  $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
  $null = Assert-BootstrapFrozenInput
  $CliStart = Invoke-Native "supabase-db-start" $SupabasePath @(
    "db", "start", "--workdir", $BootstrapRoot,
    "--agent", "no", "--yes", "--output-format", "text"
  ) 1200 0 $CliEnvironment $RemovedCredentialEnvironment
  $null = Assert-DockerEngineIdentity
  $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
  if (($CliStart.Output -join "`n") -match '(?i)linked|project[_ -]?ref') {
    throw "CLI bootstrap emitted linked-project state"
  }
  if (Test-Path -LiteralPath (Join-Path $BootstrapSupabase ".temp/project-ref")) {
    throw "CLI bootstrap created a forbidden linked project ref"
  }

  $ContainersAfter = @((Invoke-Docker @("ps", "-aq", "--no-trunc") 30).Output)
  $NewContainers = @($ContainersAfter | Where-Object { $_ -notin $ContainersBefore })
  if ($NewContainers.Count -ne 1) {
    throw "supabase db start must leave exactly one persistent database container"
  }
  $BootstrapContainerId = $NewContainers[0].Trim()
  if ($BootstrapContainerId -notmatch '^[a-f0-9]{64}$') {
    throw "Bootstrap container ID is not exact"
  }
  $BootstrapInspect = Get-DockerInspect "container" $BootstrapContainerId
  $BootstrapConfig = Get-DockerRequiredObject $BootstrapInspect "Config"
  $BootstrapHostConfig = Get-DockerRequiredObject $BootstrapInspect "HostConfig"
  $BootstrapRestartPolicy = Get-DockerRequiredObject $BootstrapHostConfig "RestartPolicy"
  $BootstrapNetworkSettings = Get-DockerRequiredObject $BootstrapInspect "NetworkSettings"
  $BootstrapState = Get-DockerRequiredObject $BootstrapInspect "State"
  $ActualBootstrapName = Get-DockerRequiredString $BootstrapInspect "Name"
  $ActualBootstrapImage = Get-DockerRequiredString $BootstrapInspect "Image"
  $ActualBootstrapRunning = Get-DockerRequiredBoolean $BootstrapState "Running"
  $ActualBootstrapNetworkMode = Get-DockerRequiredString $BootstrapHostConfig "NetworkMode"
  $ActualBootstrapStopSignal = Get-DockerRequiredString $BootstrapConfig "StopSignal"
  $ActualBootstrapRestartPolicy = Get-DockerRequiredString $BootstrapRestartPolicy "Name"
  $ActualBootstrapMaximumRetryCount = Get-DockerRequiredInteger `
    $BootstrapRestartPolicy "MaximumRetryCount"
  Write-HostEvidence "bootstrap-container-identity.txt" @(
    "tag_write_pause_sealed_bootstrap_container_identity",
    "expected_name=/$BootstrapContainerName",
    "actual_name=$ActualBootstrapName",
    "expected_image_id=$SupabaseImageId",
    "actual_image_id=$ActualBootstrapImage",
    "expected_running=True",
    "actual_running=$ActualBootstrapRunning",
    "expected_network_mode=$CliNetworkName",
    "actual_network_mode=$ActualBootstrapNetworkMode",
    "expected_stop_signal=SIGINT",
    "actual_stop_signal=$ActualBootstrapStopSignal",
    "expected_restart_policy=unless-stopped",
    "actual_restart_policy=$ActualBootstrapRestartPolicy",
    "actual_maximum_retry_count=$ActualBootstrapMaximumRetryCount"
  )
  if ($ActualBootstrapName -cne "/$BootstrapContainerName") {
    throw "Bootstrap container name is wrong"
  }
  if ($ActualBootstrapImage -cne $SupabaseImageId) {
    throw "Bootstrap container immutable image ID is wrong"
  }
  if ($ActualBootstrapRunning -cne $true) {
    throw "Bootstrap container is not running"
  }
  if ($ActualBootstrapNetworkMode -cne $CliNetworkName) {
    throw "Bootstrap container network mode is wrong"
  }
  if ($ActualBootstrapStopSignal -cne "SIGINT") {
    throw "Bootstrap container stop signal is wrong"
  }
  if ($ActualBootstrapRestartPolicy -cne "unless-stopped" -or
      $ActualBootstrapMaximumRetryCount -ne 0) {
    throw "Bootstrap container restart policy is wrong"
  }
  $CliNetworkIds = @((Invoke-Docker @(
    "network", "ls", "--no-trunc", "--filter", "label=com.supabase.cli.project=$ProjectId",
    "--quiet"
  ) 30).Output)
  if ($CliNetworkIds.Count -ne 1 -or $CliNetworkIds[0] -notmatch '^[a-f0-9]{64}$') {
    throw "Supabase CLI did not create exactly one nonce-scoped network"
  }
  $CliNetwork = Get-DockerInspect "network" $CliNetworkName
  $CliNetworkLabels = Get-DockerOptionalProperty $CliNetwork "Labels"
  if ((Get-DockerRequiredString $CliNetwork "Id") -cne $CliNetworkIds[0] -or
      (Get-DockerRequiredString $CliNetwork "Name") -cne $CliNetworkName -or
      (Get-DockerRequiredString $CliNetwork "Driver") -cne "bridge" -or
      (Get-DockerRequiredBoolean $CliNetwork "Internal") -cne $false -or
      (Get-DockerLabel $CliNetworkLabels "com.supabase.cli.project") -cne $ProjectId) {
    throw "Supabase CLI network identity is wrong"
  }
  $BootstrapPortProperties = @(
    Get-DockerRequiredNullableMapProperties $BootstrapHostConfig "PortBindings"
  )
  $BootstrapPortBinding = if ($BootstrapPortProperties.Count -eq 1 -and
    $BootstrapPortProperties[0].Name -ceq "5432/tcp") {
    @(Get-DockerNullableListValue $BootstrapPortProperties[0].Value "PortBindings.5432/tcp")
  } else {
    @()
  }
  $BootstrapRequestedHostIp = $null
  $BootstrapRequestedHostPort = $null
  if ($BootstrapPortBinding.Count -eq 1) {
    $BootstrapRequestedHostIp = Get-DockerRequiredString $BootstrapPortBinding[0] "HostIp"
    $BootstrapRequestedHostPort = Get-DockerRequiredString $BootstrapPortBinding[0] "HostPort"
  }
  if ($BootstrapPortProperties.Count -ne 1 -or
      $BootstrapPortBinding.Count -ne 1 -or
      $BootstrapRequestedHostIp -cne "" -or
      $BootstrapRequestedHostPort -cne $DbPort.ToString()) {
    throw "CLI bootstrap database did not retain the one expected publish request"
  }
  $RuntimePortProperties = @()
  foreach ($RuntimePortProperty in @(
      Get-DockerRequiredNullableMapProperties $BootstrapNetworkSettings "Ports"
    )) {
    $Bindings = @(
      Get-DockerNullableListValue $RuntimePortProperty.Value "Ports.$($RuntimePortProperty.Name)"
    )
    if ($Bindings.Count -gt 0) {
      $RuntimePortProperties += [pscustomobject]@{
        Name = $RuntimePortProperty.Name
        Bindings = $Bindings
      }
    }
  }
  if ($RuntimePortProperties.Count -ne 1 -or
      $RuntimePortProperties[0].Name -cne "5432/tcp") {
    throw "Bootstrap PostgreSQL runtime publication set is not exact"
  }
  $RuntimePortBindings = @($RuntimePortProperties[0].Bindings)
  $RuntimeHostAddresses = Get-OrdinalSorted @(
    $RuntimePortBindings | ForEach-Object { Get-DockerRequiredString $_ "HostIp" }
  )
  if ($RuntimePortBindings.Count -eq 0 -or
      @($RuntimePortBindings | Where-Object {
        (Get-DockerRequiredString $_ "HostPort") -cne $DbPort.ToString() -or
        (Get-DockerRequiredString $_ "HostIp") -notin @("0.0.0.0", "::")
      }).Count -ne 0) {
    throw "Bootstrap PostgreSQL is not published solely on wildcard host listeners"
  }
  $DockerPort = Invoke-Docker @("port", $BootstrapContainerId) 30
  $PortClient = [Net.Sockets.TcpClient]::new()
  try {
    $ConnectTask = $PortClient.ConnectAsync([Net.IPAddress]::Loopback, $DbPort)
    $HostPortConnected = $ConnectTask.Wait(2000) -and $PortClient.Connected
  } catch {
    $HostPortConnected = $false
  } finally {
    $PortClient.Dispose()
  }
  if (-not $HostPortConnected -or $DockerPort.Output.Count -eq 0) {
    throw "Loopback cannot reach the temporary CLI PostgreSQL publication"
  }
  $HostListeners = @()
  foreach ($Attempt in 1..20) {
    $HostListeners = @(Get-HostListenersOnPort $DbPort)
    if ($HostListeners.Count -gt 0) { break }
    Start-Sleep -Milliseconds 100
  }
  $HostListenerAddresses = Get-OrdinalSorted @(
    $HostListeners | ForEach-Object { $_.LocalAddress.ToString() } | Select-Object -Unique
  )
  Write-HostEvidence "bootstrap-port-observation.txt" @(
    "tag_write_pause_sealed_bootstrap_port_observed",
    "runtime_host_addresses=$($RuntimeHostAddresses -join ',')",
    "host_listener_addresses=$($HostListenerAddresses -join ',')",
    "host_listener_count=$($HostListeners.Count)",
    "loopback_connection=passed"
  )
  if ($HostListeners.Count -eq 0 -or
      @($HostListenerAddresses | Where-Object {
          $_ -notin @("0.0.0.0", "::", "127.0.0.1", "::1")
        }).Count -ne 0) {
    throw "Published PostgreSQL host listener is neither wildcard nor loopback-only"
  }
  $ActiveFirewallRules = @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore")
  if ($ActiveFirewallRules.Count -ne 1) {
    throw "Temporary firewall rule disappeared after CLI bootstrap"
  }
  $FirewallProfiles = Assert-FirewallProfilesEnabled
  $ActiveFirewall = Assert-SealedFirewallRule $ActiveFirewallRules[0] `
    $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
    $FirewallRuleDescription $FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
  Write-HostEvidence "bootstrap-port-firewall.txt" @(
    "tag_write_pause_sealed_bootstrap_port_firewall_passed",
    "publish_request=5432/tcp:$DbPort",
    "runtime_host_addresses=$($RuntimeHostAddresses -join ',')",
    "host_listener_addresses=$($HostListenerAddresses -join ',')",
    "loopback_connection=passed",
    "non_loopback_firewall_block=active",
    "firewall_instance_id=$FirewallRuleInstanceId"
    "active_profiles=$((Get-OrdinalSorted @($FirewallProfiles | ForEach-Object { $_.Name })) -join ',')",
    "all_active_profiles_enabled=True"
  )
  $ResidualHelperContainers = @($ContainersAfter | ForEach-Object {
    $ResidualInspect = Get-DockerInspect "container" $_
    Get-DockerRequiredString $ResidualInspect "Name"
  } | Where-Object {
    $_ -in @(
      "/supabase_auth_$ProjectId",
      "/supabase_storage_$ProjectId",
      "/supabase_realtime_$ProjectId"
    )
  })
  if ($ResidualHelperContainers.Count -ne 0) {
    throw "One-shot auth/storage or disabled Realtime helper left container residue"
  }
  foreach ($PinnedImage in $PinnedCliImages) {
    $PostStartTagId = (Invoke-Docker @(
      "image", "inspect", "--format", "{{.Id}}", $PinnedImage.Tag
    ) 30).Output[0].Trim()
    if ($PostStartTagId -cne $PinnedImageIds[$PinnedImage.Service]) {
      throw "CLI image tag drifted during bootstrap"
    }
  }

  $BootstrapEnvironment = @(Get-DockerRequiredNullableList $BootstrapConfig "Env")
  $PgDataEntries = @($BootstrapEnvironment | Where-Object { $_ -like "PGDATA=*" })
  $PgData = if ($PgDataEntries.Count -eq 0) {
    "/var/lib/postgresql/data"
  } elseif ($PgDataEntries.Count -eq 1) {
    $PgDataEntries[0].Substring(7)
  } else {
    throw "Bootstrap container has ambiguous PGDATA"
  }
  if ($PgData -notmatch '^/var/lib/postgresql/data(?:/[^/]+)*$') {
    throw "Bootstrap PGDATA is outside the expected data root"
  }
  $BootstrapMounts = @(Get-DockerRequiredNullableList $BootstrapInspect "Mounts")
  $DataMounts = @($BootstrapMounts | Where-Object {
    $MountDestination = Get-DockerRequiredString $_ "Destination"
    (Get-DockerRequiredString $_ "Type") -ceq "volume" -and
    ($PgData -ceq $MountDestination -or $PgData.StartsWith($MountDestination + "/"))
  })
  $DataVolumeName = if ($DataMounts.Count -eq 1) {
    Get-DockerRequiredString $DataMounts[0] "Name"
  } else { $null }
  $DataMountDestination = if ($DataMounts.Count -eq 1) {
    Get-DockerRequiredString $DataMounts[0] "Destination"
  } else { $null }
  if ($DataMounts.Count -ne 1 -or $DataVolumeName -notmatch '^[a-zA-Z0-9_.-]+$') {
    throw "Bootstrap data is not on one exact named volume"
  }

  $BootstrapUser = (Invoke-Docker @("exec", $BootstrapContainerId, "id", "-u", "postgres") 30).
    Output[0].Trim()
  $BootstrapGroup = (Invoke-Docker @("exec", $BootstrapContainerId, "id", "-g", "postgres") 30).
    Output[0].Trim()
  if ($BootstrapUser -notmatch '^[0-9]+$' -or $BootstrapGroup -notmatch '^[0-9]+$') {
    throw "Cannot resolve the official postgres uid/gid"
  }

  foreach ($SqlName in @(
      "20260722_tag_write_pause_sealed_bootstrap.sql",
      "20260722_tag_write_pause_sealed_rename.sql",
      "20260722_tag_write_pause_sealed_sanitize.sql"
    )) {
    $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes
    $null = Invoke-Docker @(
      "cp", (Join-Path $InputRoot "supabase/tests/$SqlName"),
      "${BootstrapContainerId}:/tmp/$SqlName"
    ) 30
    $ContainerHash = (Invoke-Docker @(
      "exec", $BootstrapContainerId, "sha256sum", "/tmp/$SqlName"
    ) 30).Output[0].Split(' ', [StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
    $ManifestSqlPath = "supabase/tests/$SqlName"
    if (-not [StringComparer]::Ordinal.Equals(
        $ContainerHash, $ManifestHashes[$ManifestSqlPath]
      )) {
      throw "Bootstrap container SQL hash mismatch: $SqlName"
    }
  }
  $BootstrapProof = Invoke-DockerSql "bootstrap-attestation" @(
    "exec", "--env", "PGPASSWORD=postgres", $BootstrapContainerId,
    "psql", "-X", "--csv", "--host=127.0.0.1", "--username=postgres",
    "--dbname=postgres", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
    "--file=/tmp/20260722_tag_write_pause_sealed_bootstrap.sql"
  ) 60
  $BootstrapText = $BootstrapProof.Output -join "`n"
  $BootstrapMatch = [regex]::Match(
    $BootstrapText,
    '(?m)^tag_write_pause_sealed_bootstrap_passed,([0-9]+),19,([a-z_][a-z0-9_]*),(t|f),(t|f)\r?$'
  )
  if (-not $BootstrapMatch.Success -or
      [regex]::Matches($BootstrapText, 'tag_write_pause_sealed_bootstrap_passed').Count -ne 1) {
    throw "Exact CLI bootstrap attestation failed"
  }
  $SystemIdentifier = $BootstrapMatch.Groups[1].Value
  $BootstrapDatabaseOwner = $BootstrapMatch.Groups[2].Value
  $BootstrapAdminSuperuser = $BootstrapMatch.Groups[3].Value
  $BootstrapAdminLogin = $BootstrapMatch.Groups[4].Value
  Write-HostEvidence "bootstrap-admin-observation.txt" @(
    "tag_write_pause_sealed_bootstrap_admin_observed",
    "database_owner=$BootstrapDatabaseOwner",
    "admin_role=supabase_admin",
    "admin_superuser=$BootstrapAdminSuperuser",
    "admin_login=$BootstrapAdminLogin"
  )
  if ($BootstrapDatabaseOwner -notin @("postgres", "supabase_admin") -or
      $BootstrapAdminSuperuser -cne "t" -or
      $BootstrapAdminLogin -cne "t") {
    throw "Bootstrap administrative role contract failed"
  }
  Write-HostEvidence "bootstrap-attestation.txt" @(
    "tag_write_pause_sealed_bootstrap_passed",
    "postgres_major=17",
    "ledger_versions=19",
    "database_owner=$BootstrapDatabaseOwner",
    "admin_superuser=True",
    "admin_login=True",
    "pending_00150=absent",
    "pending_00200=absent",
    "helpers=auth-and-storage-run-once-pinned",
    "helper_container_residue=0",
    "realtime=disabled-and-absent"
  )

  $Rename = Invoke-DockerSql "bootstrap-rename" @(
    "exec", "--env", "PGPASSWORD=postgres", $BootstrapContainerId,
    "psql", "-X", "--host=127.0.0.1", "--username=supabase_admin",
    "--dbname=template1", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
    "--set=sealed_database_name=$DatabaseName",
    "--file=/tmp/20260722_tag_write_pause_sealed_rename.sql"
  ) 60
  if ([regex]::Matches(
      ($Rename.Output -join "`n"),
      'tag_write_pause_sealed_database_renamed'
    ).Count -ne 1) {
    throw "Bootstrap database rename did not complete exactly once"
  }

  $Sanitize = Invoke-DockerSql "bootstrap-sanitize" @(
    "exec", "--env", "PGPASSWORD=postgres", $BootstrapContainerId,
    "psql", "-X", "--host=127.0.0.1", "--username=supabase_admin",
    "--dbname=$DatabaseName", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
    "--file=/tmp/20260722_tag_write_pause_sealed_sanitize.sql"
  ) 60
  if ([regex]::Matches(
      ($Sanitize.Output -join "`n"),
      'tag_write_pause_sealed_secrets_removed'
    ).Count -ne 1) {
    throw "Bootstrap login-role and JWT setting sanitization did not pass exactly once"
  }
  Write-HostEvidence "bootstrap-sanitization.txt" @(
    "tag_write_pause_sealed_secrets_removed",
    "login_role_passwords=null",
    "jwt_secret_settings=absent"
  )

  $null = Invoke-DockerControl "bootstrap-restart-disable" @(
    "update", "--restart=no", $BootstrapContainerId
  ) 30
  $BootstrapAfterRestartDisable = Get-DockerInspect "container" $BootstrapContainerId
  $BootstrapAfterRestartDisableConfig = Get-DockerRequiredObject `
    $BootstrapAfterRestartDisable "Config"
  $BootstrapAfterRestartDisableHostConfig = Get-DockerRequiredObject `
    $BootstrapAfterRestartDisable "HostConfig"
  $BootstrapAfterRestartDisableState = Get-DockerRequiredObject `
    $BootstrapAfterRestartDisable "State"
  $BootstrapAfterRestartDisablePolicy = Get-DockerRequiredObject `
    $BootstrapAfterRestartDisableHostConfig "RestartPolicy"
  if ((Get-DockerRequiredString $BootstrapAfterRestartDisable "Name") -cne
        "/$BootstrapContainerName" -or
      (Get-DockerRequiredString $BootstrapAfterRestartDisable "Image") -cne
        $SupabaseImageId -or
      (Get-DockerRequiredString $BootstrapAfterRestartDisableConfig "StopSignal") -cne
        "SIGINT" -or
      (Get-DockerRequiredString $BootstrapAfterRestartDisableHostConfig "NetworkMode") -cne
        $CliNetworkName -or
      (Get-DockerRequiredBoolean $BootstrapAfterRestartDisableState "Running") -cne $true -or
      (Get-DockerRequiredString $BootstrapAfterRestartDisablePolicy "Name") -cne "no" -or
      (Get-DockerRequiredInteger `
        $BootstrapAfterRestartDisablePolicy "MaximumRetryCount") -ne 0) {
    throw "Bootstrap restart policy disablement changed container identity"
  }
  Write-HostEvidence "bootstrap-restart-policy.txt" @(
    "tag_write_pause_sealed_bootstrap_restart_disabled",
    "original_restart_policy=unless-stopped",
    "current_restart_policy=no",
    "maximum_retry_count=0",
    "container_identity=unchanged",
    "container_running=True"
  )

  $BootstrapPgCtlPath = "/nix/var/nix/profiles/default/bin/pg_ctl"
  $BootstrapPgCtlVersion = (Invoke-DockerControl "bootstrap-pgctl-version" @(
    "exec", $BootstrapContainerId, $BootstrapPgCtlPath, "--version"
  ) 30).Output[0].Trim()
  if ($BootstrapPgCtlVersion -cne "pg_ctl (PostgreSQL) 17.6") {
    throw "Bootstrap pg_ctl version is not exact"
  }
  $BootstrapPgCtlStop = Invoke-DockerControl "bootstrap-pgctl-stop" @(
    "exec", "--user", "${BootstrapUser}:$BootstrapGroup", $BootstrapContainerId,
    $BootstrapPgCtlPath, "-D", $PgData, "-m", "fast", "-w", "-t", "30", "stop"
  ) 60
  $BootstrapPgCtlStopText = $BootstrapPgCtlStop.Output -join "`n"
  $BootstrapPgCtlStopOutput = Get-Utf8NativeTextMetrics $BootstrapPgCtlStopText
  $BootstrapPgCtlInterruptedMatch = [regex]::Match(
    $BootstrapPgCtlStopText,
    '^waiting for server to shut down(?<dots>\.{1,30})$'
  )
  $BootstrapPgCtlCompletedMatch = [regex]::Match(
    $BootstrapPgCtlStopText,
    '^waiting for server to shut down(?<dots>\.{1,30}) done\nserver stopped$'
  )
  $BootstrapPgCtlProgressDots = if ($BootstrapPgCtlInterruptedMatch.Success) {
    $BootstrapPgCtlInterruptedMatch.Groups["dots"].Value.Length
  } elseif ($BootstrapPgCtlCompletedMatch.Success) {
    $BootstrapPgCtlCompletedMatch.Groups["dots"].Value.Length
  } else {
    0
  }
  Write-HostEvidence "bootstrap-pgctl-stop.txt" @(
    "tag_write_pause_sealed_bootstrap_pgctl_stop_returned",
    "allowed_exec_exit_codes=0,137",
    "exec_exit_code=$($BootstrapPgCtlStop.ExitCode)",
    "timed_out=False",
    "stdout_sha256=$($BootstrapPgCtlStopOutput.Sha256)",
    "stdout_chars=$($BootstrapPgCtlStopOutput.CharacterCount)",
    "stdout_lines=$($BootstrapPgCtlStopOutput.TotalLineCount)",
    "interrupted_shape_standard=$($BootstrapPgCtlInterruptedMatch.Success)",
    "completed_shape_standard=$($BootstrapPgCtlCompletedMatch.Success)",
    "progress_dot_count=$BootstrapPgCtlProgressDots"
  )
  $BootstrapPgCtlInterrupted =
    $BootstrapPgCtlStop.ExitCode -eq 137 -and
    $BootstrapPgCtlInterruptedMatch.Success -and
    $BootstrapPgCtlStopOutput.CharacterCount -eq (31 + $BootstrapPgCtlProgressDots) -and
    $BootstrapPgCtlStopOutput.TotalLineCount -eq 1
  $BootstrapPgCtlCompleted =
    $BootstrapPgCtlStop.ExitCode -eq 0 -and
    $BootstrapPgCtlCompletedMatch.Success -and
    $BootstrapPgCtlStopOutput.CharacterCount -eq (51 + $BootstrapPgCtlProgressDots) -and
    $BootstrapPgCtlStopOutput.TotalLineCount -eq 2
  if (-not $BootstrapPgCtlInterrupted -and -not $BootstrapPgCtlCompleted) {
    throw "Bootstrap pg_ctl fast-stop transport proof changed"
  }
  $StoppedBootstrap = Get-DockerInspect "container" $BootstrapContainerId
  $StoppedBootstrapState = Get-DockerRequiredObject $StoppedBootstrap "State"
  $StoppedBootstrapStatus = Get-DockerRequiredString $StoppedBootstrapState "Status"
  $StoppedBootstrapRunning = Get-DockerRequiredBoolean $StoppedBootstrapState "Running"
  $StoppedBootstrapPaused = Get-DockerRequiredBoolean $StoppedBootstrapState "Paused"
  $StoppedBootstrapRestarting = Get-DockerRequiredBoolean $StoppedBootstrapState "Restarting"
  $StoppedBootstrapOomKilled = Get-DockerRequiredBoolean $StoppedBootstrapState "OOMKilled"
  $StoppedBootstrapDead = Get-DockerRequiredBoolean $StoppedBootstrapState "Dead"
  $StoppedBootstrapExitCode = Get-DockerRequiredInteger $StoppedBootstrapState "ExitCode"
  $StoppedBootstrapError = Get-DockerRequiredString $StoppedBootstrapState "Error"
  Write-HostEvidence "bootstrap-stop-observation.txt" @(
    "tag_write_pause_sealed_bootstrap_stop_observed",
    "requested_method=pg_ctl-fast",
    "pg_ctl_version=17.6",
    "status=$StoppedBootstrapStatus",
    "running=$StoppedBootstrapRunning",
    "paused=$StoppedBootstrapPaused",
    "restarting=$StoppedBootstrapRestarting",
    "oom_killed=$StoppedBootstrapOomKilled",
    "dead=$StoppedBootstrapDead",
    "exit_code=$StoppedBootstrapExitCode",
    "engine_error_empty=$([string]::IsNullOrEmpty($StoppedBootstrapError))"
  )
  if ($StoppedBootstrapStatus -cne "exited" -or
      $StoppedBootstrapRunning -cne $false -or
      $StoppedBootstrapPaused -cne $false -or
      $StoppedBootstrapRestarting -cne $false -or
      $StoppedBootstrapOomKilled -cne $false -or
      $StoppedBootstrapDead -cne $false -or
      -not [string]::IsNullOrEmpty($StoppedBootstrapError) -or
      $StoppedBootstrapExitCode -notin @(0, 1)) {
    throw "Bootstrap container stop observation changed"
  }
  $RemainingHostListeners = @()
  foreach ($Attempt in 1..50) {
    $RemainingHostListeners = @(Get-HostListenersOnPort $DbPort)
    if ($RemainingHostListeners.Count -eq 0) { break }
    Start-Sleep -Milliseconds 100
  }
  if ($RemainingHostListeners.Count -ne 0) {
    throw "Bootstrap host listener remained after the database container stopped"
  }
  $RemovedBootstrapId = $BootstrapContainerId
  $null = Invoke-Docker @("rm", $RemovedBootstrapId) 60
  $RemovedBootstrapProbe = Complete-NativeProcess (Start-DockerProcess @(
    "container", "inspect", $RemovedBootstrapId
  )) 30
  if ($RemovedBootstrapProbe.TimedOut -or $RemovedBootstrapProbe.ExitCode -eq 0) {
    throw "Bootstrap container remains before temporary firewall release"
  }
  $BootstrapContainerId = $null
  $FirewallProfiles = Assert-FirewallProfilesEnabled
  $ReleasePersistentRules = @(Get-ExactFirewallRule $FirewallRuleName "PersistentStore")
  $ReleaseActiveRules = @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore")
  if ($ReleasePersistentRules.Count -ne 1 -or $ReleaseActiveRules.Count -ne 1) {
    throw "Temporary firewall rule is not exact immediately before release"
  }
  $ReleasePersistentRule = Assert-SealedFirewallRule $ReleasePersistentRules[0] `
    $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
    $FirewallRuleDescription $FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
  $null = Assert-SealedFirewallRule $ReleaseActiveRules[0] $FirewallRuleName `
    $FirewallRuleDisplayName $FirewallRuleGroup $FirewallRuleDescription `
    $FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
  $NormalReleaseInventory = Get-SealedRuntimeInventory `
    $ExpectedFreshContainerNames $ExpectedFreshVolumeNames $ExpectedFreshNetworkNames `
    $ContainersBefore $VolumesBefore $NetworksBefore $true $ProjectId $Nonce
  if ($NormalReleaseInventory.AmbiguousOwnership.Count -ne 0 -or
      $NormalReleaseInventory.Containers.Count -ne 0) {
    throw "Container or ownership delta appeared immediately before firewall release"
  }
  $null = Assert-DockerEngineIdentity
  if (@(Get-HostListenersOnPort $DbPort).Count -ne 0) {
    throw "Host listener appeared immediately before firewall release"
  }
  $FreshReleasePersistentRules = @(Get-ExactFirewallRule $FirewallRuleName "PersistentStore")
  if ($FreshReleasePersistentRules.Count -ne 1) {
    throw "Persistent firewall rule changed during normal-path release proof"
  }
  $FreshReleasePersistentRule = Assert-SealedFirewallRule `
    $FreshReleasePersistentRules[0] $FirewallRuleName $FirewallRuleDisplayName `
    $FirewallRuleGroup $FirewallRuleDescription $FirewallRuleInstanceId `
    $DbPort $FirewallRemoteAddresses
  if (@(Get-HostListenersOnPort $DbPort).Count -ne 0) {
    throw "Host listener appeared after final firewall identity proof"
  }
  Remove-NetFirewallRule -InputObject $FreshReleasePersistentRule.Rule -ErrorAction Stop
  $FirewallRuleCreated = $false
  if (@(Get-ExactFirewallRule $FirewallRuleName "PersistentStore").Count -ne 0 -or
      @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore").Count -ne 0) {
    throw "Temporary firewall rule residue remains after normal-path release"
  }
  $FirewallRuleOwnershipEstablished = $false
  Write-HostEvidence "firewall-release.txt" @(
    "tag_write_pause_sealed_firewall_released",
    "instance_id=$FirewallRuleInstanceId",
    "bootstrap_container=stopped",
    "host_listener_count=0",
    "all_active_profiles_enabled=True",
    "persistent_rule_residue=0",
    "active_rule_residue=0"
  )

  $PgDataRelative = if ($PgData -ceq $DataMountDestination) {
    ""
  } elseif ($PgData.StartsWith($DataMountDestination + "/", [StringComparison]::Ordinal)) {
    $PgData.Substring($DataMountDestination.Length + 1)
  } else {
    throw "PGDATA is not inside the captured bootstrap data volume"
  }
  if ($PgDataRelative -match '(^|/)\.\.(/|$)') {
    throw "PGDATA relative path is unsafe"
  }
  $ArchivePgData = if ($PgDataRelative.Length -eq 0) {
    "/source"
  } else {
    "/source/$PgDataRelative"
  }

  $QuiesceCommand = @"
set -eu
initial_state="`$(pg_controldata '$ArchivePgData' | sed -n 's/^Database cluster state:[[:space:]]*//p')"
printf 'Database cluster state: %s\n' "`$initial_state"
case "`$initial_state" in
  "shut down")
    recovery_required=false
    ;;
  "in production")
    recovery_required=true
    ;;
  *)
    exit 41
    ;;
esac
if [ "`$recovery_required" = "true" ]; then
  '$BootstrapPgCtlPath' -D '$ArchivePgData' \
    -o "-c config_file=/opt/wouldkeep-db/postgresql.conf -c hba_file=/opt/wouldkeep-db/pg_hba.conf -c listen_addresses= -c unix_socket_directories=/tmp -c port=5432" \
    -w -t 60 start
  '$BootstrapPgCtlPath' -D '$ArchivePgData' -m fast -w -t 60 stop
fi
final_state="`$(pg_controldata '$ArchivePgData' | sed -n 's/^Database cluster state:[[:space:]]*//p')"
test "`$final_state" = "shut down"
echo "tag_write_pause_sealed_quiesce_passed|initial_state=`$initial_state|recovery_required=`$recovery_required|final_state=`$final_state"
"@
  $CreateQuiesce = Invoke-Docker @(
    "create", "--pull=never", "--name", "wouldkeep-p1b-sealed-quiesce-$Nonce",
    "--label", "wouldkeep.sealed=$Nonce",
    "--network", "none", "--read-only", "--no-healthcheck",
    "--user", "${BootstrapUser}:$BootstrapGroup",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--pids-limit", "256", "--memory", "1g", "--cpus", "2",
    "--mount", "type=volume,src=$DataVolumeName,dst=/source",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=67108864",
    "--entrypoint", "/bin/sh", $DatabaseImageId, "-c", $QuiesceCommand
  ) 60
  $QuiesceHelperId = $CreateQuiesce.Output[0].Trim()
  if ($QuiesceHelperId -notmatch '^[a-f0-9]{64}$') {
    throw "Offline PGDATA quiesce helper ID is not exact"
  }
  $QuiesceInspect = Get-DockerInspect "container" $QuiesceHelperId
  $QuiesceConfig = Get-DockerRequiredObject $QuiesceInspect "Config"
  $QuiesceHostConfig = Get-DockerRequiredObject $QuiesceInspect "HostConfig"
  $QuiesceCapAdd = @(Get-DockerRequiredNullableList $QuiesceHostConfig "CapAdd")
  $QuiesceCapDrop = @(Get-DockerRequiredNullableList $QuiesceHostConfig "CapDrop")
  $QuiesceSecurityOpt = @(
    Get-DockerRequiredNullableList $QuiesceHostConfig "SecurityOpt"
  )
  $QuiescePortBindings = @(
    Get-DockerRequiredNullableMapProperties $QuiesceHostConfig "PortBindings"
  )
  $QuiesceMounts = @(Get-DockerRequiredNullableList $QuiesceInspect "Mounts")
  if ((Get-DockerRequiredString $QuiesceInspect "Image") -cne $DatabaseImageId -or
      (Get-DockerRequiredString $QuiesceConfig "User") -cne
        "${BootstrapUser}:$BootstrapGroup" -or
      (Get-DockerRequiredString $QuiesceHostConfig "NetworkMode") -cne "none" -or
      $QuiescePortBindings.Count -ne 0 -or
      (Get-DockerRequiredBoolean $QuiesceHostConfig "PublishAllPorts") -cne $false -or
      (Get-DockerRequiredBoolean $QuiesceHostConfig "ReadonlyRootfs") -cne $true -or
      (Get-DockerRequiredBoolean $QuiesceHostConfig "Privileged") -cne $false -or
      $QuiesceCapAdd.Count -ne 0 -or
      $QuiesceCapDrop.Count -ne 1 -or
      $QuiesceCapDrop[0] -cne "ALL" -or
      $QuiesceSecurityOpt.Count -ne 1 -or
      $QuiesceSecurityOpt[0] -cne "no-new-privileges" -or
      $QuiesceMounts.Count -ne 1 -or
      (Get-DockerRequiredString $QuiesceMounts[0] "Name") -cne $DataVolumeName -or
      (Get-DockerRequiredString $QuiesceMounts[0] "Destination") -cne "/source" -or
      (Get-DockerRequiredBoolean $QuiesceMounts[0] "RW") -cne $true) {
    throw "Offline PGDATA quiesce helper isolation contract failed"
  }
  $null = Invoke-Docker @("start", $QuiesceHelperId) 30
  $QuiesceWait = Invoke-Docker @("wait", $QuiesceHelperId) 300
  $QuiesceExitCodeText = $QuiesceWait.Output[0].Trim()
  if ($QuiesceExitCodeText -notmatch '^[0-9]{1,3}$' -or
      [int]$QuiesceExitCodeText -gt 255) {
    throw "Offline PGDATA quiesce returned an invalid exit code"
  }
  if ($QuiesceExitCodeText -cne "0") {
    $QuiesceDiagnostic = Write-DockerHelperExitDiagnostic `
      "quiesce" $QuiesceHelperId ([int]$QuiesceExitCodeText)
    throw "Offline PGDATA quiesce failed; diagnostic_evidence=$QuiesceDiagnostic"
  }
  $QuiesceLogs = Invoke-Docker @("logs", $QuiesceHelperId) 30
  $QuiesceMatch = [regex]::Match(
    ($QuiesceLogs.Output -join "`n"),
    '(?m)^tag_write_pause_sealed_quiesce_passed\|initial_state=(shut down|in production)\|recovery_required=(false|true)\|final_state=shut down\r?$'
  )
  if (-not $QuiesceMatch.Success -or
      (($QuiesceMatch.Groups[1].Value -ceq "shut down") -ne
        ($QuiesceMatch.Groups[2].Value -ceq "false"))) {
    throw "Offline PGDATA quiesce proof is missing or inconsistent"
  }
  Write-HostEvidence "bootstrap-quiesce-recovery.txt" @(
    "tag_write_pause_sealed_bootstrap_quiesced",
    "initial_state=$($QuiesceMatch.Groups[1].Value)",
    "recovery_required=$($QuiesceMatch.Groups[2].Value)",
    "final_state=shut down",
    "helper_exit_code=0",
    "network=none",
    "published_ports=0",
    "root_filesystem=read-only",
    "pgdata_mount=read-write-only"
  )
  $null = Invoke-Docker @("rm", $QuiesceHelperId) 60
  $QuiesceHelperId = $null

  $null = Invoke-Docker @(
    "volume", "create", "--label", "wouldkeep.sealed=$Nonce", $ArchiveVolumeName
  ) 30
  $ArchiveVolumeCreated = $true
  $null = Invoke-Docker @(
    "volume", "create", "--label", "wouldkeep.sealed=$Nonce", $FinalDataVolumeName
  ) 30
  $FinalDataVolumeCreated = $true

  $ArchiveCommand = @"
set -eu
state="`$(pg_controldata '$ArchivePgData' | sed -n 's/^Database cluster state:[[:space:]]*//p')"
test "`$state" = "shut down"
tar -C /source -cf /archive/pgdata.tar .
sum="`$(sha256sum /archive/pgdata.tar | cut -d ' ' -f 1)"
echo "tag_write_pause_sealed_archive_passed|state=`$state|sha256=`$sum"
"@
  $CreateArchive = Invoke-Docker @(
    "create", "--pull=never", "--name", "wouldkeep-p1b-sealed-archive-$Nonce",
    "--label", "wouldkeep.sealed=$Nonce",
    "--network", "none", "--read-only", "--no-healthcheck", "--user", "0:0",
    "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH",
    "--security-opt", "no-new-privileges",
    "--mount", "type=volume,src=$DataVolumeName,dst=/source,readonly",
    "--mount", "type=volume,src=$ArchiveVolumeName,dst=/archive",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16777216",
    "--entrypoint", "/bin/sh", $SupabasePostgresImage, "-c", $ArchiveCommand
  ) 60
  $ArchiveHelperId = $CreateArchive.Output[0].Trim()
  $ArchiveInspect = Get-DockerInspect "container" $ArchiveHelperId
  $ArchiveConfig = Get-DockerRequiredObject $ArchiveInspect "Config"
  $ArchiveHostConfig = Get-DockerRequiredObject $ArchiveInspect "HostConfig"
  $ArchiveCapAdd = @(Get-DockerRequiredNullableList $ArchiveHostConfig "CapAdd")
  $ArchiveCapDrop = @(Get-DockerRequiredNullableList $ArchiveHostConfig "CapDrop")
  $ArchiveSecurityOpt = @(
    Get-DockerRequiredNullableList $ArchiveHostConfig "SecurityOpt"
  )
  $ArchivePortBindings = @(
    Get-DockerRequiredNullableMapProperties $ArchiveHostConfig "PortBindings"
  )
  $ArchiveMounts = @(Get-DockerRequiredNullableList $ArchiveInspect "Mounts")
  if ((Get-DockerRequiredString $ArchiveInspect "Image") -cne $SupabaseImageId -or
      (Get-DockerRequiredString $ArchiveConfig "User") -cne "0:0" -or
      (Get-DockerRequiredString $ArchiveHostConfig "NetworkMode") -cne "none" -or
      $ArchivePortBindings.Count -ne 0 -or
      (Get-DockerRequiredBoolean $ArchiveHostConfig "PublishAllPorts") -cne $false -or
      (Get-DockerRequiredBoolean $ArchiveHostConfig "ReadonlyRootfs") -cne $true -or
      (Get-DockerRequiredBoolean $ArchiveHostConfig "Privileged") -cne $false -or
      $ArchiveCapAdd.Count -ne 1 -or
      $ArchiveCapAdd[0] -cne "CAP_DAC_READ_SEARCH" -or
      $ArchiveCapDrop.Count -ne 1 -or
      $ArchiveCapDrop[0] -cne "ALL" -or
      $ArchiveSecurityOpt.Count -ne 1 -or
      $ArchiveSecurityOpt[0] -cne "no-new-privileges" -or
      $ArchiveMounts.Count -ne 2 -or
      @($ArchiveMounts | Where-Object {
          (Get-DockerRequiredString $_ "Name") -ceq $DataVolumeName -and
          (Get-DockerRequiredBoolean $_ "RW") -ceq $false
        }).Count -ne 1 -or
      @($ArchiveMounts | Where-Object {
          (Get-DockerRequiredString $_ "Name") -ceq $ArchiveVolumeName -and
          (Get-DockerRequiredBoolean $_ "RW") -ceq $true
        }).Count -ne 1) {
    throw "Offline archive helper isolation contract failed"
  }
  $null = Invoke-Docker @("start", $ArchiveHelperId) 30
  $ArchiveWait = Invoke-Docker @("wait", $ArchiveHelperId) 300
  $ArchiveExitCodeText = $ArchiveWait.Output[0].Trim()
  if ($ArchiveExitCodeText -notmatch '^[0-9]{1,3}$' -or
      [int]$ArchiveExitCodeText -gt 255) {
    throw "Offline PGDATA archive returned an invalid exit code"
  }
  if ($ArchiveExitCodeText -cne "0") {
    $ArchiveDiagnostic = Write-DockerHelperExitDiagnostic `
      "archive" $ArchiveHelperId ([int]$ArchiveExitCodeText)
    throw "Offline PGDATA archive failed; diagnostic_evidence=$ArchiveDiagnostic"
  }
  $ArchiveLogs = Invoke-Docker @("logs", $ArchiveHelperId) 30
  $ArchiveMatch = [regex]::Match(
    ($ArchiveLogs.Output -join "`n"),
    '(?m)^tag_write_pause_sealed_archive_passed\|state=shut down\|sha256=([a-f0-9]{64})\r?$'
  )
  if (-not $ArchiveMatch.Success) { throw "Offline PGDATA archive proof is missing" }
  $ArchiveSha256 = $ArchiveMatch.Groups[1].Value
  Write-HostEvidence "bootstrap-clean-shutdown.txt" @(
    "tag_write_pause_sealed_bootstrap_clean_shutdown",
    "stop_method=pg_ctl-fast",
    "pg_ctl_version=17.6",
    "pg_ctl_exec_exit_code=$($BootstrapPgCtlStop.ExitCode)",
    "container_entrypoint_exit_code=$StoppedBootstrapExitCode",
    "pg_ctl_stdout_sha256=$($BootstrapPgCtlStopOutput.Sha256)",
    "pg_ctl_progress_dot_count=$BootstrapPgCtlProgressDots",
    "recovery_helper_exit_code=0",
    "oom_killed=False",
    "engine_error=empty",
    "offline_pg_controldata=shut down"
  )

  $RestoreCommand = @"
set -eu
test "`$(sha256sum /archive/pgdata.tar | cut -d ' ' -f 1)" = '$ArchiveSha256'
tar --no-same-owner -C /target -xf /archive/pgdata.tar
chown -R '$BootstrapUser`:$BootstrapGroup' /target
test -z "`$(find /target -xdev \( ! -user '$BootstrapUser' -o ! -group '$BootstrapGroup' \) -print -quit)"
state="`$(pg_controldata '/target$(if ($PgDataRelative.Length -eq 0) { '' } else { "/$PgDataRelative" })' | sed -n 's/^Database cluster state:[[:space:]]*//p')"
system_id="`$(pg_controldata '/target$(if ($PgDataRelative.Length -eq 0) { '' } else { "/$PgDataRelative" })' | sed -n 's/^Database system identifier:[[:space:]]*//p')"
test "`$state" = "shut down"
test "`$system_id" = '$SystemIdentifier'
echo "tag_write_pause_sealed_restore_passed|state=`$state|system_identifier=`$system_id|ownership=$BootstrapUser`:$BootstrapGroup|sha256=$ArchiveSha256"
"@
  $CreateRestore = Invoke-Docker @(
    "create", "--pull=never", "--name", "wouldkeep-p1b-sealed-restore-$Nonce",
    "--label", "wouldkeep.sealed=$Nonce",
    "--network", "none", "--read-only", "--no-healthcheck", "--user", "0:0",
    "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "DAC_READ_SEARCH",
    "--security-opt", "no-new-privileges",
    "--mount", "type=volume,src=$ArchiveVolumeName,dst=/archive,readonly",
    "--mount", "type=volume,src=$FinalDataVolumeName,dst=/target",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16777216",
    "--entrypoint", "/bin/sh", $SupabasePostgresImage, "-c", $RestoreCommand
  ) 60
  $RestoreHelperId = $CreateRestore.Output[0].Trim()
  $RestoreInspect = Get-DockerInspect "container" $RestoreHelperId
  $RestoreConfig = Get-DockerRequiredObject $RestoreInspect "Config"
  $RestoreHostConfig = Get-DockerRequiredObject $RestoreInspect "HostConfig"
  $RestoreCapAdd = @(Get-DockerRequiredNullableList $RestoreHostConfig "CapAdd")
  $RestoreCapAddSorted = Get-OrdinalSorted $RestoreCapAdd
  $RestoreCapDrop = @(Get-DockerRequiredNullableList $RestoreHostConfig "CapDrop")
  $RestoreSecurityOpt = @(
    Get-DockerRequiredNullableList $RestoreHostConfig "SecurityOpt"
  )
  $RestorePortBindings = @(
    Get-DockerRequiredNullableMapProperties $RestoreHostConfig "PortBindings"
  )
  $RestoreMounts = @(Get-DockerRequiredNullableList $RestoreInspect "Mounts")
  if ((Get-DockerRequiredString $RestoreInspect "Image") -cne $SupabaseImageId -or
      (Get-DockerRequiredString $RestoreConfig "User") -cne "0:0" -or
      (Get-DockerRequiredString $RestoreHostConfig "NetworkMode") -cne "none" -or
      $RestorePortBindings.Count -ne 0 -or
      (Get-DockerRequiredBoolean $RestoreHostConfig "PublishAllPorts") -cne $false -or
      (Get-DockerRequiredBoolean $RestoreHostConfig "ReadonlyRootfs") -cne $true -or
      (Get-DockerRequiredBoolean $RestoreHostConfig "Privileged") -cne $false -or
      $RestoreCapAddSorted.Count -ne 2 -or
      $RestoreCapAddSorted[0] -cne "CAP_CHOWN" -or
      $RestoreCapAddSorted[1] -cne "CAP_DAC_READ_SEARCH" -or
      $RestoreCapDrop.Count -ne 1 -or
      $RestoreCapDrop[0] -cne "ALL" -or
      $RestoreSecurityOpt.Count -ne 1 -or
      $RestoreSecurityOpt[0] -cne "no-new-privileges" -or
      $RestoreMounts.Count -ne 2) {
    throw "Offline restore helper isolation contract failed"
  }
  $null = Invoke-Docker @("start", $RestoreHelperId) 30
  $RestoreWait = Invoke-Docker @("wait", $RestoreHelperId) 300
  $RestoreExitCodeText = $RestoreWait.Output[0].Trim()
  if ($RestoreExitCodeText -notmatch '^[0-9]{1,3}$' -or
      [int]$RestoreExitCodeText -gt 255) {
    throw "Fresh PGDATA restore returned an invalid exit code"
  }
  if ($RestoreExitCodeText -cne "0") {
    $RestoreDiagnostic = Write-DockerHelperExitDiagnostic `
      "restore" $RestoreHelperId ([int]$RestoreExitCodeText)
    throw "Fresh PGDATA restore failed; diagnostic_evidence=$RestoreDiagnostic"
  }
  $RestoreLogs = Invoke-Docker @("logs", $RestoreHelperId) 30
  if ([regex]::Matches(
      ($RestoreLogs.Output -join "`n"),
      'tag_write_pause_sealed_restore_passed\|state=shut down\|system_identifier=' +
        [regex]::Escape($SystemIdentifier) + '\|ownership=' +
        [regex]::Escape("${BootstrapUser}:$BootstrapGroup") + '\|sha256=' +
        [regex]::Escape($ArchiveSha256)
    ).Count -ne 1) {
    throw "Fresh PGDATA restore proof is missing or repeated"
  }
  Write-HostEvidence "physical-archive.txt" @(
    "tag_write_pause_sealed_physical_archive_passed",
    "cluster_state=shut down",
    "system_identifier_preserved=true",
    "archive_sha256=$ArchiveSha256",
    "fresh_final_volume=true"
  )

  $null = Invoke-Docker @("rm", $ArchiveHelperId) 60
  $ArchiveHelperId = $null
  $null = Invoke-Docker @("rm", $RestoreHelperId) 60
  $RestoreHelperId = $null
  $null = Invoke-Docker @("volume", "rm", $DataVolumeName) 60
  $DataVolumeName = $null
  $null = Invoke-Docker @("volume", "rm", $ArchiveVolumeName) 60
  $ArchiveVolumeCreated = $false

  $CreateDatabase = Invoke-Docker @(
    "create", "--pull=never", "--name", $DatabaseContainerName,
    "--label", "wouldkeep.sealed=$Nonce",
    "--network", "none", "--read-only", "--no-healthcheck",
    "--user", "${BootstrapUser}:$BootstrapGroup",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--pids-limit", "256", "--memory", "1g", "--cpus", "2",
    "--mount", "type=volume,src=$FinalDataVolumeName,dst=$DataMountDestination",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=67108864",
    "--env", "PGDATA=$PgData",
    $DatabaseImageId,
    "-D", $PgData,
    "-c", "config_file=/opt/wouldkeep-db/postgresql.conf",
    "-c", "hba_file=/opt/wouldkeep-db/pg_hba.conf"
  ) 60
  $DatabaseContainerId = $CreateDatabase.Output[0].Trim()
  if ($DatabaseContainerId -notmatch '^[a-f0-9]{64}$') {
    throw "Sealed database container ID is not exact"
  }
  $DatabaseInspect = Get-DockerInspect "container" $DatabaseContainerId
  $DatabaseConfig = Get-DockerRequiredObject $DatabaseInspect "Config"
  $DatabaseHostConfig = Get-DockerRequiredObject $DatabaseInspect "HostConfig"
  $DatabaseNetworkSettings = Get-DockerRequiredObject $DatabaseInspect "NetworkSettings"
  $DatabaseRestartPolicy = Get-DockerRequiredObject $DatabaseHostConfig "RestartPolicy"
  $DatabaseTmpfs = @(Get-DockerOptionalMapProperties $DatabaseHostConfig "Tmpfs")
  $DatabaseNetworks = @(
    Get-DockerRequiredNullableMapProperties $DatabaseNetworkSettings "Networks"
  )
  $DatabasePortBindings = @(
    Get-DockerRequiredNullableMapProperties $DatabaseHostConfig "PortBindings"
  )
  $DatabaseCapAdd = @(Get-DockerRequiredNullableList $DatabaseHostConfig "CapAdd")
  $DatabaseDevices = @(Get-DockerRequiredNullableList $DatabaseHostConfig "Devices")
  $DatabaseBinds = @(Get-DockerRequiredNullableList $DatabaseHostConfig "Binds")
  $DatabaseExtraHosts = @(Get-DockerRequiredNullableList $DatabaseHostConfig "ExtraHosts")
  $DatabaseDns = @(Get-DockerRequiredNullableList $DatabaseHostConfig "Dns")
  $DatabaseMounts = @(Get-DockerRequiredNullableList $DatabaseInspect "Mounts")
  $DatabaseEnvironment = @(Get-DockerRequiredNullableList $DatabaseConfig "Env")
  $DatabaseCommand = @(Get-DockerRequiredNullableList $DatabaseConfig "Cmd")
  $DatabasePidMode = Get-DockerRequiredString $DatabaseHostConfig "PidMode"
  $DatabaseIpcMode = Get-DockerRequiredString $DatabaseHostConfig "IpcMode"
  $DatabaseNoneNetwork = if ($DatabaseNetworks.Count -eq 1 -and
    $DatabaseNetworks[0].Name -ceq "none") {
    if ($DatabaseNetworks[0].Value -isnot [System.Management.Automation.PSCustomObject]) {
      throw "Docker none-network endpoint has an invalid type"
    }
    $DatabaseNetworks[0].Value
  } else {
    $null
  }
  $DatabaseNoneLinks = @()
  $DatabaseNoneAliases = @()
  $DatabaseNoneDriverOpts = @()
  $DatabaseNoneDnsNames = @()
  $DatabaseNoneNetworkId = $null
  $DatabaseNoneEndpointId = $null
  $DatabaseNoneGateway = $null
  $DatabaseNoneIpAddress = $null
  $DatabaseNoneIpPrefixLen = 0
  $DatabaseNoneIpv6Gateway = $null
  $DatabaseNoneGlobalIpv6Address = $null
  $DatabaseNoneGlobalIpv6PrefixLen = 0
  $DatabaseNoneMacAddress = $null
  $DatabaseNoneGwPriority = 0
  if ($null -ne $DatabaseNoneNetwork) {
    $DatabaseNoneLinks = @(Get-DockerOptionalList $DatabaseNoneNetwork "Links")
    $DatabaseNoneAliases = @(Get-DockerOptionalList $DatabaseNoneNetwork "Aliases")
    $DatabaseNoneDriverOpts = @(
      Get-DockerOptionalMapProperties $DatabaseNoneNetwork "DriverOpts"
    )
    $DatabaseNoneDnsNames = @(Get-DockerOptionalList $DatabaseNoneNetwork "DNSNames")
    $DatabaseNoneNetworkId = Get-DockerRequiredString $DatabaseNoneNetwork "NetworkID"
    $DatabaseNoneEndpointId = Get-DockerRequiredString $DatabaseNoneNetwork "EndpointID"
    $DatabaseNoneGateway = Get-DockerRequiredString $DatabaseNoneNetwork "Gateway"
    $DatabaseNoneIpAddress = Get-DockerRequiredString $DatabaseNoneNetwork "IPAddress"
    $DatabaseNoneIpPrefixLen = Get-DockerRequiredInteger $DatabaseNoneNetwork "IPPrefixLen"
    $DatabaseNoneIpv6Gateway = Get-DockerRequiredString $DatabaseNoneNetwork "IPv6Gateway"
    $DatabaseNoneGlobalIpv6Address = Get-DockerRequiredString `
      $DatabaseNoneNetwork "GlobalIPv6Address"
    $DatabaseNoneGlobalIpv6PrefixLen = Get-DockerRequiredInteger `
      $DatabaseNoneNetwork "GlobalIPv6PrefixLen"
    $DatabaseNoneMacAddress = Get-DockerRequiredString $DatabaseNoneNetwork "MacAddress"
    $DatabaseNoneGwPriority = Get-DockerOptionalInteger $DatabaseNoneNetwork "GwPriority" 0
  }
  if ((Get-DockerRequiredString $DatabaseInspect "Image") -cne $DatabaseImageId -or
      (Get-DockerRequiredString $DatabaseConfig "User") -cne
        "${BootstrapUser}:$BootstrapGroup" -or
      (Get-DockerRequiredString $DatabaseConfig "StopSignal") -cne "SIGINT" -or
      (Get-DockerRequiredString $DatabaseHostConfig "NetworkMode") -cne "none" -or
      (Get-DockerRequiredBoolean $DatabaseHostConfig "ReadonlyRootfs") -cne $true -or
      $DatabasePortBindings.Count -ne 0 -or
      (Get-DockerRequiredBoolean $DatabaseHostConfig "PublishAllPorts") -cne $false -or
      $DatabaseTmpfs.Count -ne 1 -or
      $DatabaseTmpfs[0].Name -cne "/tmp" -or
      $DatabaseTmpfs[0].Value -cne "rw,nosuid,nodev,noexec,size=67108864" -or
      (Get-DockerRequiredString $DatabaseRestartPolicy "Name") -cne "no" -or
      (Get-DockerRequiredInteger $DatabaseRestartPolicy "MaximumRetryCount") -ne 0 -or
      (Get-DockerRequiredBoolean $DatabaseHostConfig "Privileged") -cne $false -or
      $DatabaseCapAdd.Count -ne 0 -or
      $DatabaseDevices.Count -ne 0 -or
      $DatabaseBinds.Count -ne 0 -or
      $DatabaseExtraHosts.Count -ne 0 -or
      $DatabaseDns.Count -ne 0 -or
      -not [string]::IsNullOrEmpty($DatabasePidMode) -or
      $DatabaseIpcMode -notin @("", "private") -or
      $null -eq $DatabaseNoneNetwork -or
      -not [string]::IsNullOrEmpty($DatabaseNoneNetworkId) -or
      -not [string]::IsNullOrEmpty($DatabaseNoneEndpointId) -or
      -not [string]::IsNullOrEmpty($DatabaseNoneGateway) -or
      -not [string]::IsNullOrEmpty($DatabaseNoneIpAddress) -or
      $DatabaseNoneIpPrefixLen -ne 0 -or
      -not [string]::IsNullOrEmpty($DatabaseNoneIpv6Gateway) -or
      -not [string]::IsNullOrEmpty($DatabaseNoneGlobalIpv6Address) -or
      $DatabaseNoneGlobalIpv6PrefixLen -ne 0 -or
      -not [string]::IsNullOrEmpty($DatabaseNoneMacAddress) -or
      $DatabaseNoneLinks.Count -ne 0 -or
      $DatabaseNoneAliases.Count -ne 0 -or
      $DatabaseNoneDriverOpts.Count -ne 0 -or
      $DatabaseNoneDnsNames.Count -ne 0 -or
      $DatabaseNoneGwPriority -ne 0 -or
      $DatabaseMounts.Count -ne 1 -or
      (Get-DockerRequiredString $DatabaseMounts[0] "Name") -cne $FinalDataVolumeName -or
      (Get-DockerRequiredString $DatabaseMounts[0] "Destination") -cne $DataMountDestination -or
      ($DatabaseEnvironment -join "`n") -match
        '(?i)PGPASSWORD|PGPASSFILE|JWT|SECRET|TOKEN|SUPABASE_ACCESS_TOKEN|DATABASE_URL' -or
      ($DatabaseCommand -join "`n") -notmatch
        'config_file=/opt/wouldkeep-db/postgresql\.conf') {
    throw "Sealed database container isolation contract failed"
  }
  $null = Invoke-DockerTopology "database-start" @("start", $DatabaseContainerId) 30

  $DatabaseReady = $false
  foreach ($Attempt in 1..60) {
    $Probe = Complete-NativeProcess (Start-DockerProcess @(
      "exec", $DatabaseContainerId,
      "/nix/var/nix/profiles/default/bin/pg_isready",
      "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=$DatabaseName"
    )) 5
    if (-not $Probe.TimedOut -and $Probe.ExitCode -eq 0) {
      $DatabaseReady = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $DatabaseReady) {
    $DatabaseDiagnostic = Write-DockerDatabaseReadinessDiagnostic $DatabaseContainerId
    throw "Sealed database did not become ready; diagnostic_evidence=$DatabaseDiagnostic"
  }

  $CreateRunner = Invoke-Docker @(
    "create", "--pull=never", "--name", $RunnerContainerName,
    "--label", "wouldkeep.sealed=$Nonce",
    "--network", "container:$DatabaseContainerId", "--no-healthcheck",
    "--read-only",
    "--user", "65534:65534", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--pids-limit", "256",
    "--memory", "1g", "--cpus", "2",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=67108864,uid=65534,gid=65534,mode=1777",
    "--tmpfs", "/evidence:rw,nosuid,nodev,noexec,size=268435456,uid=65534,gid=65534,mode=0700",
    "--env", "HOME=/tmp/wouldkeep-home",
    "--env", "XDG_CONFIG_HOME=/tmp/wouldkeep-home/.config",
    "--env", "XDG_CACHE_HOME=/tmp/wouldkeep-home/.cache",
    "--env", "WOULDKEEP_SEALED_DATABASE_NAME=$DatabaseName",
    "--env", "WOULDKEEP_SEALED_SYSTEM_IDENTIFIER=$SystemIdentifier",
    "--env", "WOULDKEEP_SEALED_DB_CONTAINER_ID=$DatabaseContainerId",
    $RunnerImageId
  ) 60
  $RunnerContainerId = $CreateRunner.Output[0].Trim()
  if ($RunnerContainerId -notmatch '^[a-f0-9]{64}$') {
    throw "Sealed runner container ID is not exact"
  }
  $RunnerInspect = Get-DockerInspect "container" $RunnerContainerId
  $RunnerConfig = Get-DockerRequiredObject $RunnerInspect "Config"
  $RunnerHostConfig = Get-DockerRequiredObject $RunnerInspect "HostConfig"
  $RunnerNetworkSettings = Get-DockerRequiredObject $RunnerInspect "NetworkSettings"
  $RunnerRestartPolicy = Get-DockerRequiredObject $RunnerHostConfig "RestartPolicy"
  $RunnerTmpfs = @(Get-DockerOptionalMapProperties $RunnerHostConfig "Tmpfs")
  $RunnerTmpfsNames = Get-OrdinalSorted @($RunnerTmpfs | ForEach-Object { $_.Name })
  $RunnerTmp = @($RunnerTmpfs | Where-Object { $_.Name -ceq "/tmp" })
  $RunnerEvidenceTmpfs = @($RunnerTmpfs | Where-Object { $_.Name -ceq "/evidence" })
  $RunnerPortBindings = @(
    Get-DockerRequiredNullableMapProperties $RunnerHostConfig "PortBindings"
  )
  $RunnerCapAdd = @(Get-DockerRequiredNullableList $RunnerHostConfig "CapAdd")
  $RunnerDevices = @(Get-DockerRequiredNullableList $RunnerHostConfig "Devices")
  $RunnerBinds = @(Get-DockerRequiredNullableList $RunnerHostConfig "Binds")
  $RunnerExtraHosts = @(Get-DockerRequiredNullableList $RunnerHostConfig "ExtraHosts")
  $RunnerDns = @(Get-DockerRequiredNullableList $RunnerHostConfig "Dns")
  $RunnerNetworks = @(
    Get-DockerRequiredNullableMapProperties $RunnerNetworkSettings "Networks"
  )
  $RunnerMounts = @(Get-DockerRequiredNullableList $RunnerInspect "Mounts")
  $RunnerExternalMounts = @($RunnerMounts | Where-Object {
      (Get-DockerRequiredString $_ "Type") -in @("bind", "volume")
    })
  $RunnerEnvironment = @(Get-DockerRequiredNullableList $RunnerConfig "Env")
  $RunnerHome = @($RunnerEnvironment | Where-Object { $_ -cmatch '^HOME=' })
  $RunnerXdgConfig = @($RunnerEnvironment | Where-Object { $_ -cmatch '^XDG_CONFIG_HOME=' })
  $RunnerXdgCache = @($RunnerEnvironment | Where-Object { $_ -cmatch '^XDG_CACHE_HOME=' })
  $RunnerPidMode = Get-DockerRequiredString $RunnerHostConfig "PidMode"
  $RunnerIpcMode = Get-DockerRequiredString $RunnerHostConfig "IpcMode"
  if ((Get-DockerRequiredString $RunnerInspect "Image") -cne $RunnerImageId -or
      (Get-DockerRequiredString $RunnerConfig "User") -cne "65534:65534" -or
      (Get-DockerRequiredString $RunnerHostConfig "NetworkMode") -cne
        "container:$DatabaseContainerId" -or
      (Get-DockerRequiredBoolean $RunnerHostConfig "ReadonlyRootfs") -cne $true -or
      $RunnerPortBindings.Count -ne 0 -or
      (Get-DockerRequiredBoolean $RunnerHostConfig "PublishAllPorts") -cne $false -or
      $RunnerTmpfs.Count -ne 2 -or
      ($RunnerTmpfsNames -join "`n") -cne "/evidence`n/tmp" -or
      $RunnerTmp.Count -ne 1 -or
      $RunnerTmp[0].Value -cne
        "rw,nosuid,nodev,noexec,size=67108864,uid=65534,gid=65534,mode=1777" -or
      $RunnerEvidenceTmpfs.Count -ne 1 -or
      $RunnerEvidenceTmpfs[0].Value -cne
        "rw,nosuid,nodev,noexec,size=268435456,uid=65534,gid=65534,mode=0700" -or
      (Get-DockerRequiredString $RunnerRestartPolicy "Name") -cne "no" -or
      (Get-DockerRequiredInteger $RunnerRestartPolicy "MaximumRetryCount") -ne 0 -or
      (Get-DockerRequiredBoolean $RunnerHostConfig "Privileged") -cne $false -or
      $RunnerCapAdd.Count -ne 0 -or
      $RunnerDevices.Count -ne 0 -or
      $RunnerBinds.Count -ne 0 -or
      $RunnerExtraHosts.Count -ne 0 -or
      $RunnerDns.Count -ne 0 -or
      -not [string]::IsNullOrEmpty($RunnerPidMode) -or
      $RunnerIpcMode -notin @("", "private") -or
      $RunnerNetworks.Count -ne 0 -or
      $RunnerExternalMounts.Count -ne 0 -or
      $RunnerHome.Count -ne 1 -or
      $RunnerHome[0] -cne "HOME=/tmp/wouldkeep-home" -or
      $RunnerXdgConfig.Count -ne 1 -or
      $RunnerXdgConfig[0] -cne "XDG_CONFIG_HOME=/tmp/wouldkeep-home/.config" -or
      $RunnerXdgCache.Count -ne 1 -or
      $RunnerXdgCache[0] -cne "XDG_CACHE_HOME=/tmp/wouldkeep-home/.cache" -or
      ($RunnerEnvironment -join "`n") -match
        '(?i)PGPASSWORD|PGPASSFILE|JWT|SECRET|TOKEN|PROJECT_REF|DATABASE_URL|DEEPSEEK|OPENAI|ANTHROPIC|DOCKER_HOST') {
    throw "Sealed runner network, mount, or credential contract failed"
  }
  $null = Invoke-DockerTopology "runner-start" @("start", $RunnerContainerId) `
    30 $RunnerContainerId

  $DatabaseNetns = (Invoke-DockerTopology "database-netns" @(
    "exec", $DatabaseContainerId, "readlink", "/proc/1/ns/net"
  ) 30).Output[0].Trim()
  $RunnerNetns = (Invoke-DockerTopology "runner-netns" @(
    "exec", $RunnerContainerId, "readlink", "/proc/1/ns/net"
  ) 30 $RunnerContainerId).Output[0].Trim()
  if ($DatabaseNetns -notmatch '^net:\[[0-9]+\]$' -or $RunnerNetns -cne $DatabaseNetns) {
    throw "Runner does not share the exact sealed database network namespace"
  }
  $NetworkDevices = Invoke-DockerTopology "runner-net-dev" @(
    "exec", $RunnerContainerId, "/usr/bin/cat", "/proc/net/dev"
  ) 30 $RunnerContainerId
  $InterfaceNames = @($NetworkDevices.Output | Where-Object { $_ -match ':' } |
    ForEach-Object { ($_ -split ':', 2)[0].Trim() })
  if ($InterfaceNames.Count -ne 1 -or $InterfaceNames[0] -cne "lo") {
    throw "Shared sealed network namespace has a non-loopback interface"
  }
  $Ipv4Routes = Invoke-DockerTopology "runner-ipv4-routes" @(
    "exec", $RunnerContainerId, "/usr/bin/cat", "/proc/net/route"
  ) 30 $RunnerContainerId
  if ($Ipv4Routes.Output.Count -ne 1 -or
      $Ipv4Routes.Output[0] -notmatch '^Iface\s+Destination\s+Gateway') {
    throw "Shared sealed network namespace has an IPv4 route"
  }
  $Ipv6Routes = Invoke-DockerTopology "runner-ipv6-routes" @(
    "exec", $RunnerContainerId, "/usr/bin/cat", "/proc/net/ipv6_route"
  ) 30 $RunnerContainerId
  $NonLoopbackIpv6DefaultRoutes = @($Ipv6Routes.Output | Where-Object {
      $Fields = @($_ -split '\s+' | Where-Object { $_.Length -gt 0 })
      if ($Fields.Count -lt 10) {
        throw "Shared sealed network namespace has a malformed IPv6 route"
      }
      $Fields[0] -ceq "00000000000000000000000000000000" -and
        $Fields[1] -ceq "00" -and
        $Fields[-1] -cne "lo"
    })
  if ($NonLoopbackIpv6DefaultRoutes.Count -ne 0) {
    throw "Shared sealed network namespace has a non-loopback IPv6 default route"
  }
  $DnsProbe = Complete-NativeProcess (Start-DockerProcess @(
    "exec", $RunnerContainerId,
    "/usr/bin/timeout", "3", "/usr/bin/getent", "ahosts", "example.com"
  )) 10
  if ($DnsProbe.TimedOut -or $DnsProbe.ExitCode -eq 0) {
    throw "Shared sealed network namespace unexpectedly resolved external DNS"
  }
  $DatabasePublishedPorts = Invoke-DockerTopology "database-ports" `
    @("port", $DatabaseContainerId) 30
  $RunnerPublishedPorts = Invoke-DockerTopology "runner-ports" `
    @("port", $RunnerContainerId) 30 $RunnerContainerId
  if ($DatabasePublishedPorts.Output.Count -ne 0 -or
      $RunnerPublishedPorts.Output.Count -ne 0) {
    throw "A final sealed container unexpectedly publishes a host port"
  }
  Write-HostEvidence "container-isolation.txt" @(
    "database_network_mode=none",
    "database_ports=none",
    "database_rootfs=read-only",
    "database_mounts=pgdata-only",
    "runner_network_mode=container:<exact-database-id>",
    "runner_external_mounts=none",
    "runner_writable_paths=tmpfs-only",
    "runner_home=tmpfs-only",
    "runner_credentials=none",
    "network_interfaces=lo-only",
    "ipv4_routes=none",
    "ipv6_default_route=none",
    "external_dns_resolution=failed-within-3s",
    "database_and_runner_ports=none",
    "network_namespace=$DatabaseNetns"
  )

  $RunnerEvidenceReady = $false
  $RunnerFailureReady = $false
  foreach ($Attempt in 1..1200) {
    $RunnerState = Get-DockerInspect "container" $RunnerContainerId
    $RunnerContainerState = Get-DockerRequiredObject $RunnerState "State"
    if ((Get-DockerRequiredBoolean $RunnerContainerState "Running") -cne $true) {
      $RunnerDiagnostic = Write-DockerRunnerStateDiagnostic $RunnerContainerId
      throw "Sealed runner exited before host evidence collection; " +
        "diagnostic_evidence=$RunnerDiagnostic"
    }
    $FailureProbe = Complete-NativeProcess (Start-DockerProcess @(
      "exec", $RunnerContainerId, "/usr/bin/test", "-f",
      "/evidence/failure-evidence-sha256.txt"
    )) 5
    if (-not $FailureProbe.TimedOut -and $FailureProbe.ExitCode -eq 0) {
      $RunnerFailureReady = $true
      break
    }
    $EvidenceProbe = Complete-NativeProcess (Start-DockerProcess @(
      "exec", $RunnerContainerId, "/usr/bin/test", "-f", "/evidence/completed-utc.txt"
    )) 5
    if (-not $EvidenceProbe.TimedOut -and $EvidenceProbe.ExitCode -eq 0) {
      $RunnerEvidenceReady = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if ($RunnerFailureReady) {
    if (Test-Path -LiteralPath $ContainerEvidence) {
      throw "Sealed runner evidence destination already exists"
    }
    $FailureManifestName = "failure-evidence-sha256.txt"
    $TotalFailureEvidenceBytes = [long](Copy-DockerTextEvidenceFile `
        $RunnerContainerId $FailureManifestName $ContainerEvidence 1048576)
    $FailureManifestLines = @(Get-Content -LiteralPath (
        Join-Path $ContainerEvidence $FailureManifestName
      ) -Encoding utf8)
    $FailureEvidencePaths = [Collections.Generic.List[string]]::new()
    $FailureEvidenceHashes = @{}
    $PriorFailureEvidencePath = ""
    foreach ($Line in $FailureManifestLines) {
      if ($Line -notmatch '^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)$') {
        throw "Runner failure evidence manifest line is invalid"
      }
      $FailureEvidenceHash = $Matches[1]
      $FailureEvidencePath = $Matches[2]
      if ($FailureEvidencePath -match '(^|/)\.\.(/|$)' -or
          ($PriorFailureEvidencePath.Length -gt 0 -and
            [StringComparer]::Ordinal.Compare(
              $PriorFailureEvidencePath,
              $FailureEvidencePath
            ) -ge 0)) {
        throw "Runner failure evidence manifest is unsafe or repeated"
      }
      $PriorFailureEvidencePath = $FailureEvidencePath
      $null = $FailureEvidencePaths.Add($FailureEvidencePath)
      $FailureEvidenceHashes[$FailureEvidencePath] = $FailureEvidenceHash
    }
    if ($FailureEvidencePaths.Count -lt 1 -or
        $FailureEvidencePaths.Count -gt 256 -or
        $FailureEvidencePaths.ToArray() -cnotcontains "runner-failure.txt") {
      throw "Runner failure evidence manifest is unexpectedly small or large"
    }
    $ExpectedFailureFiles = Get-OrdinalSorted @(
      $FailureEvidencePaths.ToArray() + @($FailureManifestName)
    )
    $ExpectedFailureDirectories = [Collections.Generic.List[string]]::new()
    foreach ($EvidencePath in $ExpectedFailureFiles) {
      $Segments = @($EvidencePath.Split('/'))
      if ($Segments.Count -gt 1) {
        foreach ($Depth in 1..($Segments.Count - 1)) {
          $DirectoryPath = $Segments[0..($Depth - 1)] -join '/'
          if ($DirectoryPath -cnotin $ExpectedFailureDirectories.ToArray()) {
            $null = $ExpectedFailureDirectories.Add($DirectoryPath)
          }
        }
      }
    }
    $ExpectedFailureDirectoryPaths = Get-OrdinalSorted `
      $ExpectedFailureDirectories.ToArray()
    $FailureInventory = Invoke-DockerTopology "runner-evidence-inventory" @(
      "exec", $RunnerContainerId, "/usr/bin/find", "/evidence",
      "-mindepth", "1", "-printf", "%y|%P\n"
    ) 60 $RunnerContainerId
    if ($FailureInventory.StandardErrorUtf8ByteCount -ne 0 -or
        $FailureInventory.StandardOutputUtf8ByteCount -gt 1048576) {
      throw "Runner failure evidence inventory is invalid or oversized"
    }
    $ActualFailureFiles = [Collections.Generic.List[string]]::new()
    $ActualFailureDirectories = [Collections.Generic.List[string]]::new()
    $SeenFailureItems = [Collections.Generic.HashSet[string]]::new(
      [StringComparer]::Ordinal
    )
    foreach ($Line in $FailureInventory.StandardOutput) {
      if ($Line -notmatch
          '^([fd])\|([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*)$' -or
          -not $SeenFailureItems.Add($Matches[2])) {
        throw "Runner failure evidence inventory contains an unsafe or repeated item"
      }
      if ($Matches[1] -ceq "f") {
        $null = $ActualFailureFiles.Add($Matches[2])
      } else {
        $null = $ActualFailureDirectories.Add($Matches[2])
      }
    }
    if (((Get-OrdinalSorted $ActualFailureFiles.ToArray()) -join "`n") -cne
          ($ExpectedFailureFiles -join "`n") -or
        ((Get-OrdinalSorted $ActualFailureDirectories.ToArray()) -join "`n") -cne
          ($ExpectedFailureDirectoryPaths -join "`n")) {
      throw "Runner failure evidence inventory differs from its manifest"
    }
    foreach ($EvidencePath in $FailureEvidencePaths) {
      $RemainingFailureEvidenceBytes = 67108864 - $TotalFailureEvidenceBytes
      if ($RemainingFailureEvidenceBytes -lt 1) {
        throw "Runner failure evidence exceeds the reviewed total size"
      }
      $FileLimit = [Math]::Min([long]8388608, $RemainingFailureEvidenceBytes)
      $TotalFailureEvidenceBytes += [long](Copy-DockerTextEvidenceFile `
          $RunnerContainerId $EvidencePath $ContainerEvidence $FileLimit)
    }
    $CopiedFailureItems = @(
      Get-ChildItem -LiteralPath $ContainerEvidence -Recurse -Force
    )
    if (@($CopiedFailureItems | Where-Object {
          ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
        }).Count -ne 0) {
      throw "Copied runner failure evidence contains a link"
    }
    $ActualCopiedFailureFiles = Get-OrdinalSorted @(
      $CopiedFailureItems | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        [IO.Path]::GetRelativePath($ContainerEvidence, $_.FullName).Replace('\', '/')
      }
    )
    if (($ActualCopiedFailureFiles -join "`n") -cne
        ($ExpectedFailureFiles -join "`n")) {
      throw "Copied runner failure evidence set differs from its manifest"
    }
    foreach ($EvidencePath in $FailureEvidencePaths) {
      $ActualFailureHash = (Get-FileHash -LiteralPath (
          Join-Path $ContainerEvidence $EvidencePath
        ) -Algorithm SHA256).Hash.ToLowerInvariant()
      if (-not [StringComparer]::Ordinal.Equals(
          $ActualFailureHash,
          $FailureEvidenceHashes[$EvidencePath]
        )) {
        throw "Copied runner failure evidence hash mismatch: $EvidencePath"
      }
    }
    Write-HostEvidence "runner-failure-transfer.txt" @(
      "tag_write_pause_sealed_runner_failure_transferred",
      "method=bounded-utf8-files",
      "file_count=$($ExpectedFailureFiles.Count)",
      "total_utf8_bytes=$TotalFailureEvidenceBytes",
      "manifest_hashes=passed",
      "inventory=exact"
    )
    $RunnerFailurePath = Join-Path $ContainerEvidence "runner-failure.txt"
    if (-not (Test-Path -LiteralPath $RunnerFailurePath -PathType Leaf) -or
        ((Get-Item -LiteralPath $RunnerFailurePath -Force).Attributes -band
          [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Sealed runner failure evidence is missing or linked"
    }
    $RunnerFailureLines = @(Get-Content -LiteralPath $RunnerFailurePath -Encoding utf8)
    $RunnerFailureStages = @($RunnerFailureLines | Where-Object {
        $_ -cmatch '^stage=(input-initial|environment|evidence-initialization|toolchain|' +
          'psql-version|database-ready|attestation-before|matrix|attestation-after|' +
          'input-reverify|evidence-manifest|host-acknowledgement)$'
      })
    if ($RunnerFailureLines.Count -ne 15 -or
        $RunnerFailureLines[0] -cne "tag_write_pause_sealed_runner_failed" -or
        $RunnerFailureStages.Count -ne 1 -or
        @($RunnerFailureLines | Where-Object {
            $_ -notmatch '^(tag_write_pause_sealed_runner_failed|' +
              'stage=[a-z-]+|exception_type=(unknown|[A-Za-z0-9.]+Exception)|' +
              'exception_sha256=[a-f0-9]{64}|exception_(chars|lines)=[0-9]+|' +
              'signal_[a-z_]+=(True|False))$'
          }).Count -ne 0) {
      throw "Sealed runner failure evidence contract failed"
    }
    $null = Invoke-DockerTopology "runner-evidence-ack" @(
      "exec", $RunnerContainerId, "/usr/bin/touch", "/tmp/wouldkeep_sealed_evidence_copied"
    ) 30 $RunnerContainerId
    $FailedRunnerWait = Invoke-Docker @("wait", $RunnerContainerId) 60
    if ($FailedRunnerWait.Output.Count -ne 1 -or
        $FailedRunnerWait.Output[0].Trim() -cne "1") {
      throw "Sealed runner failure hold did not exit exactly once"
    }
    throw "Sealed runner reported a bounded failure; $($RunnerFailureStages[0]); " +
      "diagnostic_evidence=container/runner-failure.txt"
  }
  if (-not $RunnerEvidenceReady) {
    throw "Sealed runner evidence did not become ready within the bounded poll"
  }
  if (Test-Path -LiteralPath $ContainerEvidence) {
    throw "Sealed runner evidence destination already exists"
  }
  $TotalEvidenceBytes = [long](Copy-DockerTextEvidenceFile $RunnerContainerId `
      "evidence-sha256.txt" $ContainerEvidence 1048576)
  $CopiedEvidenceManifestLines = @(Get-Content -LiteralPath (
      Join-Path $ContainerEvidence "evidence-sha256.txt"
    ) -Encoding utf8)
  $CopiedEvidencePaths = [Collections.Generic.List[string]]::new()
  $CopiedEvidenceHashes = @{}
  $PriorEvidencePath = ""
  foreach ($Line in $CopiedEvidenceManifestLines) {
    if ($Line -notmatch '^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)$') {
      throw "Copied sealed evidence manifest line is invalid"
    }
    $EvidenceHash = $Matches[1]
    $EvidencePath = $Matches[2]
    if ($PriorEvidencePath.Length -gt 0 -and
        [StringComparer]::Ordinal.Compare($PriorEvidencePath, $EvidencePath) -ge 0) {
      throw "Copied sealed evidence manifest is not unique and ordinally sorted"
    }
    $PriorEvidencePath = $EvidencePath
    $CopiedEvidencePaths.Add($EvidencePath)
    $CopiedEvidenceHashes[$EvidencePath] = $EvidenceHash
  }
  $ExpectedCopiedEvidencePaths = Get-OrdinalSorted @(
    $CopiedEvidencePaths.ToArray() + @("completed-utc.txt", "evidence-sha256.txt")
  )
  if ($ExpectedCopiedEvidencePaths.Count -lt 10 -or
      @($ExpectedCopiedEvidencePaths | Select-Object -Unique).Count -ne
        $ExpectedCopiedEvidencePaths.Count) {
    throw "Copied sealed evidence manifest is unexpectedly small or repeated"
  }
  $ExpectedEvidenceDirectories = [Collections.Generic.List[string]]::new()
  foreach ($EvidencePath in $ExpectedCopiedEvidencePaths) {
    $Segments = @($EvidencePath.Split('/'))
    if ($Segments.Count -gt 1) {
      foreach ($Depth in 1..($Segments.Count - 1)) {
        $DirectoryPath = $Segments[0..($Depth - 1)] -join '/'
        if ($DirectoryPath -cnotin $ExpectedEvidenceDirectories.ToArray()) {
          $null = $ExpectedEvidenceDirectories.Add($DirectoryPath)
        }
      }
    }
  }
  $ExpectedEvidenceDirectoryPaths = Get-OrdinalSorted `
    $ExpectedEvidenceDirectories.ToArray()
  $Inventory = Invoke-DockerTopology "runner-evidence-inventory" @(
    "exec", $RunnerContainerId, "/usr/bin/find", "/evidence",
    "-mindepth", "1", "-printf", "%y|%P\n"
  ) 60 $RunnerContainerId
  if ($Inventory.StandardErrorUtf8ByteCount -ne 0 -or
      $Inventory.StandardOutputUtf8ByteCount -gt 1048576) {
    throw "Sealed runner evidence inventory is invalid or oversized"
  }
  $ActualContainerFiles = [Collections.Generic.List[string]]::new()
  $ActualContainerDirectories = [Collections.Generic.List[string]]::new()
  $SeenContainerItems = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($Line in $Inventory.StandardOutput) {
    if ($Line -notmatch
        '^([fd])\|([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)*)$' -or
        -not $SeenContainerItems.Add($Matches[2])) {
      throw "Sealed runner evidence inventory contains an unsafe or repeated item"
    }
    if ($Matches[1] -ceq "f") {
      $null = $ActualContainerFiles.Add($Matches[2])
    } else {
      $null = $ActualContainerDirectories.Add($Matches[2])
    }
  }
  if (((Get-OrdinalSorted $ActualContainerFiles.ToArray()) -join "`n") -cne
        ($ExpectedCopiedEvidencePaths -join "`n") -or
      ((Get-OrdinalSorted $ActualContainerDirectories.ToArray()) -join "`n") -cne
        ($ExpectedEvidenceDirectoryPaths -join "`n")) {
    throw "Sealed runner evidence inventory differs from its manifest"
  }
  foreach ($EvidencePath in $ExpectedCopiedEvidencePaths | Where-Object {
      $_ -cne "evidence-sha256.txt"
    }) {
    $RemainingEvidenceBytes = 67108864 - $TotalEvidenceBytes
    if ($RemainingEvidenceBytes -lt 1) {
      throw "Sealed runner evidence exceeds the reviewed total size"
    }
    $FileLimit = [Math]::Min([long]8388608, $RemainingEvidenceBytes)
    $TotalEvidenceBytes += [long](Copy-DockerTextEvidenceFile $RunnerContainerId `
        $EvidencePath $ContainerEvidence $FileLimit)
  }
  if ($TotalEvidenceBytes -gt 67108864) {
    throw "Sealed runner evidence exceeds the reviewed total size"
  }
  $CopiedEvidenceItems = @(Get-ChildItem -LiteralPath $ContainerEvidence -Recurse -Force)
  if (@($CopiedEvidenceItems | Where-Object {
        ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      }).Count -ne 0) {
    throw "Copied sealed evidence contains a link"
  }
  $ActualCopiedEvidencePaths = @($CopiedEvidenceItems | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object {
      [IO.Path]::GetRelativePath($ContainerEvidence, $_.FullName).Replace('\', '/')
  })
  $ActualCopiedEvidencePaths = Get-OrdinalSorted $ActualCopiedEvidencePaths
  if (($ActualCopiedEvidencePaths -join "`n") -cne
      ($ExpectedCopiedEvidencePaths -join "`n")) {
    throw "Copied sealed evidence set differs from its manifest"
  }
  foreach ($EvidencePath in $CopiedEvidencePaths) {
    $EvidenceFullPath = [IO.Path]::GetFullPath((Join-Path $ContainerEvidence $EvidencePath))
    $EvidenceRootPrefix = $ContainerEvidence.TrimEnd([IO.Path]::DirectorySeparatorChar) +
      [IO.Path]::DirectorySeparatorChar
    if (-not $EvidenceFullPath.StartsWith(
        $EvidenceRootPrefix, [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "Copied sealed evidence path escaped its root"
    }
    $ActualEvidenceHash = (Get-FileHash -LiteralPath $EvidenceFullPath -Algorithm SHA256).
      Hash.ToLowerInvariant()
    if (-not [StringComparer]::Ordinal.Equals(
        $ActualEvidenceHash, $CopiedEvidenceHashes[$EvidencePath]
      )) {
      throw "Copied sealed evidence hash mismatch: $EvidencePath"
    }
  }
  Write-HostEvidence "runner-evidence-transfer.txt" @(
    "tag_write_pause_sealed_runner_evidence_transferred",
    "method=bounded-utf8-files",
    "file_count=$($ExpectedCopiedEvidencePaths.Count)",
    "total_utf8_bytes=$TotalEvidenceBytes",
    "per_file_max_bytes=8388608",
    "total_max_bytes=67108864",
    "manifest_hashes=passed",
    "inventory=exact"
  )
  $null = Invoke-DockerTopology "runner-evidence-ack" @(
    "exec", $RunnerContainerId, "/usr/bin/touch", "/tmp/wouldkeep_sealed_evidence_copied"
  ) 30 $RunnerContainerId
  $WaitRunner = Invoke-Docker @("wait", $RunnerContainerId) 60
  if ($WaitRunner.Output.Count -ne 1 -or $WaitRunner.Output[0].Trim() -cne "0") {
    $RunnerDiagnostic = Write-DockerRunnerStateDiagnostic $RunnerContainerId
    throw "Sealed runner exited nonzero; diagnostic_evidence=$RunnerDiagnostic"
  }
  $RunnerLogs = Invoke-Docker @("logs", $RunnerContainerId) 60
  if ([regex]::Matches(
      ($RunnerLogs.Output -join "`n"),
      '(?m)^tag_write_pause_sealed_matrix_passed\r?$'
    ).Count -ne 1) {
    throw "Sealed runner pass marker is missing or repeated"
  }
  $null = Assert-FrozenInput $InputRoot $ExpectedInputPaths $ManifestHashes

  $null = Invoke-Docker @(
    "stop", "--signal", "SIGINT", "--time", "30", $DatabaseContainerId
  ) 60
  $StoppedDatabase = Get-DockerInspect "container" $DatabaseContainerId
  $StoppedDatabaseState = Get-DockerRequiredObject $StoppedDatabase "State"
  $StoppedDatabaseStatus = Get-DockerRequiredString $StoppedDatabaseState "Status"
  $StoppedDatabaseRunning = Get-DockerRequiredBoolean $StoppedDatabaseState "Running"
  $StoppedDatabasePaused = Get-DockerRequiredBoolean $StoppedDatabaseState "Paused"
  $StoppedDatabaseRestarting = Get-DockerRequiredBoolean $StoppedDatabaseState "Restarting"
  $StoppedDatabaseOomKilled = Get-DockerRequiredBoolean $StoppedDatabaseState "OOMKilled"
  $StoppedDatabaseDead = Get-DockerRequiredBoolean $StoppedDatabaseState "Dead"
  $StoppedDatabaseExitCode = Get-DockerRequiredInteger $StoppedDatabaseState "ExitCode"
  $StoppedDatabaseError = Get-DockerRequiredString $StoppedDatabaseState "Error"
  Write-HostEvidence "database-stop-observation.txt" @(
    "tag_write_pause_sealed_database_stop_observed",
    "requested_signal=SIGINT",
    "status=$StoppedDatabaseStatus",
    "running=$StoppedDatabaseRunning",
    "paused=$StoppedDatabasePaused",
    "restarting=$StoppedDatabaseRestarting",
    "oom_killed=$StoppedDatabaseOomKilled",
    "dead=$StoppedDatabaseDead",
    "exit_code=$StoppedDatabaseExitCode",
    "engine_error_empty=$([string]::IsNullOrEmpty($StoppedDatabaseError))"
  )
  if ($StoppedDatabaseStatus -cne "exited" -or
      $StoppedDatabaseRunning -cne $false -or
      $StoppedDatabasePaused -cne $false -or
      $StoppedDatabaseRestarting -cne $false -or
      $StoppedDatabaseOomKilled -cne $false -or
      $StoppedDatabaseDead -cne $false -or
      -not [string]::IsNullOrEmpty($StoppedDatabaseError) -or
      $StoppedDatabaseExitCode -notin @(0, 130)) {
    throw "Sealed database did not stop cleanly"
  }
  Write-HostEvidence "database-clean-shutdown.txt" @(
    "tag_write_pause_sealed_database_clean_shutdown",
    "stop_signal=SIGINT",
    "exit_code=$StoppedDatabaseExitCode",
    "oom_killed=False",
    "engine_error=empty"
  )
  $Succeeded = $true
} catch {
  $MainFailure = $_.Exception
  try {
    Write-HostEvidence "failure.txt" @("tag_write_pause_sealed_host_failed", $MainFailure.Message)
  } catch { }
} finally {
  $CleanupState = [pscustomobject]@{
    RuntimeProof = New-RuntimeCleanupProofState
    BootstrapContainerId = $BootstrapContainerId
    DatabaseContainerId = $DatabaseContainerId
    RunnerContainerId = $RunnerContainerId
    QuiesceHelperId = $QuiesceHelperId
    ArchiveHelperId = $ArchiveHelperId
    RestoreHelperId = $RestoreHelperId
    DataVolumeName = $DataVolumeName
    FinalDataVolumeCreated = $FinalDataVolumeCreated
    ArchiveVolumeCreated = $ArchiveVolumeCreated
    CliNetworkIds = @($CliNetworkIds)
    FirewallRuleInstanceId = $FirewallRuleInstanceId
    FirewallRuleOwnershipEstablished = $FirewallRuleOwnershipEstablished
    FirewallRuleCreated = $FirewallRuleCreated
    RunnerImageBuilt = $RunnerImageBuilt
    DatabaseImageBuilt = $DatabaseImageBuilt
  }
  $AllowedContainerNames = @(
    "supabase_db_$ProjectId",
    "supabase_auth_$ProjectId",
    "supabase_storage_$ProjectId",
    "supabase_realtime_$ProjectId",
    "wouldkeep-p1b-sealed-quiesce-$Nonce",
    "wouldkeep-p1b-sealed-archive-$Nonce",
    "wouldkeep-p1b-sealed-restore-$Nonce",
    $DatabaseContainerName,
    $RunnerContainerName
  )
  $AllowedVolumeNames = @(
    "supabase_db_$ProjectId",
    $FinalDataVolumeName,
    $ArchiveVolumeName
  )
  $AllowedNetworkNames = @($CliNetworkName)
  $InventoryParameters = @{
    AllowedContainerNames = $AllowedContainerNames
    AllowedVolumeNames = $AllowedVolumeNames
    AllowedNetworkNames = $AllowedNetworkNames
    BaselineContainerIds = $ContainersBefore
    BaselineVolumeNames = $VolumesBefore
    BaselineNetworkIds = $NetworksBefore
    IncludePostBaselineDelta = $CliBaselineCaptured
    ProjectId = $ProjectId
    Nonce = $Nonce
  }
  $CleanupSteps = @(
    [pscustomobject]@{ Name = "nonce-runtime-reconciliation"; Action = {
      $Proof = $CleanupState.RuntimeProof
      $null = Reset-RuntimeCleanupProofState $Proof
      if ($script:NativeProcessReapFailure) {
        throw "An unreaped native process prevents runtime cleanup proof"
      }
      $null = Assert-DockerEngineIdentity
      $InitialInventory = Get-SealedRuntimeInventory @InventoryParameters
      $Proof.OwnershipAmbiguityCount = [int]$InitialInventory.AmbiguousOwnership.Count
      if ($Proof.OwnershipAmbiguityCount -ne 0) {
        Write-HostEvidence "cleanup-ownership-block.txt" @(
          "tag_write_pause_sealed_cleanup_ownership_blocked",
          $InitialInventory.AmbiguousOwnership
        )
        throw "Nonce-scoped Docker resource ownership is ambiguous"
      }

      Write-HostEvidence "cleanup-owned-resources.txt" @(
        "tag_write_pause_sealed_cleanup_owned_resources",
        @($InitialInventory.Containers | ForEach-Object { "container=$($_.Id)" }),
        @($InitialInventory.Volumes | ForEach-Object { "volume=$_" }),
        @($InitialInventory.Networks | ForEach-Object { "network=$($_.Id)" })
      )

      foreach ($OwnedContainer in $InitialInventory.Containers) {
        $OwnedContainerState = Get-DockerRequiredObject $OwnedContainer.Inspect "State"
        if ((Get-DockerRequiredBoolean $OwnedContainerState "Running") -ceq $true) {
          $null = Invoke-Docker @("stop", "--time", "30", $OwnedContainer.Id) 60
        }
        $null = Invoke-Docker @("rm", $OwnedContainer.Id) 60
      }
      foreach ($VolumeName in $InitialInventory.Volumes) {
        $null = Invoke-Docker @("volume", "rm", $VolumeName) 60
      }
      foreach ($OwnedNetwork in $InitialInventory.Networks) {
        $null = Invoke-Docker @("network", "rm", $OwnedNetwork.Id) 60
      }
      $Proof.OwnedResourceCleanupCompleted = $true

      $FinalInventory = Get-SealedRuntimeInventory @InventoryParameters
      $Proof.FinalOwnershipAmbiguityCount = [int]$FinalInventory.AmbiguousOwnership.Count
      $Proof.FinalContainerCount = [int]$FinalInventory.Containers.Count
      $Proof.FinalVolumeCount = [int]$FinalInventory.Volumes.Count
      $Proof.FinalNetworkCount = [int]$FinalInventory.Networks.Count
      $RemainingHostListeners = @()
      foreach ($Attempt in 1..50) {
        $RemainingHostListeners = @(Get-HostListenersOnPort $DbPort)
        if ($RemainingHostListeners.Count -eq 0) { break }
        Start-Sleep -Milliseconds 100
      }
      $Proof.HostListenerCount = [int]$RemainingHostListeners.Count
      if ($Proof.FinalOwnershipAmbiguityCount -ne 0 -or
          $Proof.FinalContainerCount -ne 0 -or
          $Proof.FinalVolumeCount -ne 0 -or
          $Proof.FinalNetworkCount -ne 0 -or
          $Proof.HostListenerCount -ne 0) {
        throw "Docker resource, ownership, or listener residue remains after reconciliation"
      }
      $null = Assert-DockerEngineIdentity
      $Proof.SameEngineVerified = $true
      $null = Complete-RuntimeCleanupProof $Proof
      $CleanupState.BootstrapContainerId = $null
      $CleanupState.DatabaseContainerId = $null
      $CleanupState.RunnerContainerId = $null
      $CleanupState.QuiesceHelperId = $null
      $CleanupState.ArchiveHelperId = $null
      $CleanupState.RestoreHelperId = $null
      $CleanupState.DataVolumeName = $null
      $CleanupState.FinalDataVolumeCreated = $false
      $CleanupState.ArchiveVolumeCreated = $false
      $CleanupState.CliNetworkIds = @()
      Write-HostEvidence "runtime-reconciliation.txt" @(
        "tag_write_pause_sealed_runtime_reconciliation_passed",
        "containers_removed=$($InitialInventory.Containers.Count)",
        "volumes_removed=$($InitialInventory.Volumes.Count)",
        "networks_removed=$($InitialInventory.Networks.Count)",
        "host_listener_count=0",
        "docker_engine_id=$($script:DockerEngineId)"
      )
    }},
    [pscustomobject]@{ Name = "quiesce-archive-restore-helpers"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      foreach ($HelperId in @(
          $CleanupState.QuiesceHelperId,
          $CleanupState.ArchiveHelperId,
          $CleanupState.RestoreHelperId
        )) {
        if ($null -ne $HelperId) {
          $State = Get-DockerInspect "container" $HelperId
          $HelperState = Get-DockerRequiredObject $State "State"
          if ((Get-DockerRequiredBoolean $HelperState "Running") -ceq $true) {
            $null = Invoke-Docker @("stop", "--time", "10", $HelperId) 30
          }
          $null = Invoke-Docker @("rm", $HelperId) 60
        }
      }
      $CleanupState.QuiesceHelperId = $null
      $CleanupState.ArchiveHelperId = $null
      $CleanupState.RestoreHelperId = $null
    }},
    [pscustomobject]@{ Name = "runner-container"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($null -ne $CleanupState.RunnerContainerId) {
        $null = Invoke-Docker @("rm", "--force", $CleanupState.RunnerContainerId) 60
        $CleanupState.RunnerContainerId = $null
      }
    }},
    [pscustomobject]@{ Name = "database-container"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($null -ne $CleanupState.DatabaseContainerId) {
        $State = Get-DockerInspect "container" $CleanupState.DatabaseContainerId
        $DatabaseCleanupState = Get-DockerRequiredObject $State "State"
        if ((Get-DockerRequiredBoolean $DatabaseCleanupState "Running") -ceq $true) {
          $null = Invoke-Docker @(
            "stop", "--time", "30", $CleanupState.DatabaseContainerId
          ) 60
        }
        $null = Invoke-Docker @("rm", $CleanupState.DatabaseContainerId) 60
        $CleanupState.DatabaseContainerId = $null
      }
    }},
    [pscustomobject]@{ Name = "bootstrap-container"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($null -ne $CleanupState.BootstrapContainerId) {
        $State = Get-DockerInspect "container" $CleanupState.BootstrapContainerId
        $BootstrapCleanupState = Get-DockerRequiredObject $State "State"
        if ((Get-DockerRequiredBoolean $BootstrapCleanupState "Running") -ceq $true) {
          $null = Invoke-Docker @(
            "stop", "--time", "30", $CleanupState.BootstrapContainerId
          ) 60
        }
        $null = Invoke-Docker @("rm", $CleanupState.BootstrapContainerId) 60
        $CleanupState.BootstrapContainerId = $null
      }
    }},
    [pscustomobject]@{ Name = "temporary-firewall-rule"; Action = {
      if ($CleanupState.FirewallRuleOwnershipEstablished) {
        if (-not $CleanupState.RuntimeProof.Proven) {
          throw "Temporary firewall rule retained because runtime cleanup was not proven"
        }
        $ProfileFailure = $null
        $ActiveFailure = $null
        $PersistentRules = @(Get-ExactFirewallRule $FirewallRuleName "PersistentStore")
        if ($PersistentRules.Count -eq 0) {
          if ($CleanupState.FirewallRuleCreated) {
            throw "Owned temporary firewall rule disappeared before exact cleanup"
          }
        } else {
          if (-not $CleanupState.FirewallRuleCreated -or
              $CleanupState.FirewallRuleInstanceId -isnot [string] -or
              [string]::IsNullOrWhiteSpace($CleanupState.FirewallRuleInstanceId)) {
            throw "Partial firewall creation has no recorded exact rule identity"
          }
          $PersistentRule = Assert-SealedFirewallRule $PersistentRules[0] `
            $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
            $FirewallRuleDescription $CleanupState.FirewallRuleInstanceId `
            $DbPort $FirewallRemoteAddresses
          try {
            $null = Assert-FirewallProfilesEnabled
          } catch {
            $ProfileFailure = $_.Exception
          }
          try {
            $ActiveRules = @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore")
            if ($ActiveRules.Count -ne 1) {
              throw "Owned temporary firewall rule is not active during cleanup"
            }
            $null = Assert-SealedFirewallRule $ActiveRules[0] $FirewallRuleName `
              $FirewallRuleDisplayName $FirewallRuleGroup $FirewallRuleDescription `
              $CleanupState.FirewallRuleInstanceId $DbPort $FirewallRemoteAddresses
          } catch {
            $ActiveFailure = $_.Exception
          }

          if (-not $CliBaselineCaptured) {
            throw "Cannot release the temporary firewall rule without a Docker baseline"
          }
          $ReleaseProof = $CleanupState.RuntimeProof
          $null = Reset-RuntimeCleanupProofState $ReleaseProof
          $ReleaseProof.OwnedResourceCleanupCompleted = $true
          $ReleaseInventory = Get-SealedRuntimeInventory @InventoryParameters
          $ReleaseProof.OwnershipAmbiguityCount = [int](
            $ReleaseInventory.AmbiguousOwnership.Count
          )
          $ReleaseProof.FinalOwnershipAmbiguityCount = [int](
            $ReleaseInventory.AmbiguousOwnership.Count
          )
          $ReleaseProof.FinalContainerCount = [int]$ReleaseInventory.Containers.Count
          $ReleaseProof.FinalVolumeCount = [int]$ReleaseInventory.Volumes.Count
          $ReleaseProof.FinalNetworkCount = [int]$ReleaseInventory.Networks.Count
          if ($ReleaseProof.OwnershipAmbiguityCount -ne 0 -or
              $ReleaseProof.FinalContainerCount -ne 0 -or
              $ReleaseProof.FinalVolumeCount -ne 0 -or
              $ReleaseProof.FinalNetworkCount -ne 0) {
            throw "Runtime exposure changed immediately before firewall removal"
          }
          $null = Assert-DockerEngineIdentity
          $ReleaseProof.SameEngineVerified = $true
          if (@(Get-HostListenersOnPort $DbPort).Count -ne 0) {
            throw "Host listener appeared during cleanup firewall release proof"
          }
          $FreshPersistentRules = @(
            Get-ExactFirewallRule $FirewallRuleName "PersistentStore"
          )
          if ($FreshPersistentRules.Count -ne 1) {
            throw "Persistent firewall rule changed during cleanup release proof"
          }
          $FreshPersistentRule = Assert-SealedFirewallRule $FreshPersistentRules[0] `
            $FirewallRuleName $FirewallRuleDisplayName $FirewallRuleGroup `
            $FirewallRuleDescription $CleanupState.FirewallRuleInstanceId `
            $DbPort $FirewallRemoteAddresses
          $ReleaseProof.HostListenerCount = [int]@(
            Get-HostListenersOnPort $DbPort
          ).Count
          if ($ReleaseProof.HostListenerCount -ne 0) {
            throw "Host listener appeared after final cleanup firewall identity proof"
          }
          $null = Complete-RuntimeCleanupProof $ReleaseProof
          Remove-NetFirewallRule -InputObject $FreshPersistentRule.Rule -ErrorAction Stop
          $CleanupState.FirewallRuleCreated = $false
        }
        if (@(Get-ExactFirewallRule $FirewallRuleName "PersistentStore").Count -ne 0 -or
            @(Get-ExactFirewallRule $FirewallRuleName "ActiveStore").Count -ne 0) {
          throw "Temporary firewall rule residue remains after exact-object removal"
        }
        $CleanupState.FirewallRuleCreated = $false
        $CleanupState.FirewallRuleOwnershipEstablished = $false
        if ($null -ne $ProfileFailure) {
          throw $ProfileFailure
        }
        if ($null -ne $ActiveFailure) {
          throw $ActiveFailure
        }
      }
    }},
    [pscustomobject]@{ Name = "data-volume"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($null -ne $CleanupState.DataVolumeName) {
        $null = Invoke-Docker @("volume", "rm", $CleanupState.DataVolumeName) 60
        $CleanupState.DataVolumeName = $null
      }
    }},
    [pscustomobject]@{ Name = "final-data-volume"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($CleanupState.FinalDataVolumeCreated) {
        $null = Invoke-Docker @("volume", "rm", $FinalDataVolumeName) 60
        $CleanupState.FinalDataVolumeCreated = $false
      }
    }},
    [pscustomobject]@{ Name = "archive-volume"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      if ($CleanupState.ArchiveVolumeCreated) {
        $null = Invoke-Docker @("volume", "rm", $ArchiveVolumeName) 60
        $CleanupState.ArchiveVolumeCreated = $false
      }
    }},
    [pscustomobject]@{ Name = "cli-networks"; Action = {
      if (-not $CleanupState.RuntimeProof.Proven) { return }
      $CleanupState.CliNetworkIds = @((Invoke-Docker @(
        "network", "ls", "--filter", "label=com.supabase.cli.project=$ProjectId", "--quiet"
      ) 30).Output)
      foreach ($NetworkId in $CleanupState.CliNetworkIds) {
        if ($NetworkId -notmatch '^[a-f0-9]+$') { throw "Unsafe CLI network ID" }
        $Network = Get-DockerInspect "network" $NetworkId
        $NetworkLabels = Get-DockerOptionalProperty $Network "Labels"
        if ((Get-DockerLabel $NetworkLabels "com.supabase.cli.project") -cne $ProjectId) {
          throw "Refusing to remove a network outside the sealed project"
        }
        $null = Invoke-Docker @("network", "rm", $NetworkId) 60
      }
    }},
    [pscustomobject]@{ Name = "runner-image"; Action = {
      if ($CleanupState.RunnerImageBuilt) {
        if (-not $CleanupState.RuntimeProof.Proven) { return }
        $null = Assert-DockerEngineIdentity
        $null = Invoke-Docker @("image", "rm", $RunnerTag) 120
        $CleanupState.RunnerImageBuilt = $false
      }
    }},
    [pscustomobject]@{ Name = "database-image"; Action = {
      if ($CleanupState.DatabaseImageBuilt) {
        if (-not $CleanupState.RuntimeProof.Proven) { return }
        $null = Assert-DockerEngineIdentity
        $null = Invoke-Docker @("image", "rm", $DatabaseImageTag) 120
        $CleanupState.DatabaseImageBuilt = $false
      }
    }},
    [pscustomobject]@{ Name = "mutable-tags"; Action = {
      if ($ChangedMutableTags.Count -gt 0) {
        $null = Assert-DockerEngineIdentity
      }
      foreach ($MutableTag in $ChangedMutableTags.ToArray()) {
        $OriginalId = $OriginalMutableTagIds[$MutableTag]
        if ($OriginalId -ceq "<absent>") {
          $null = Invoke-Docker @("image", "rm", $MutableTag) 60
          $AbsentId = Get-OptionalDockerImageId $MutableTag
          if ($null -ne $AbsentId) {
            throw "A temporary Supabase CLI image alias was not removed"
          }
        } elseif ($OriginalId -match '^sha256:[a-f0-9]{64}$') {
          $null = Invoke-Docker @("tag", $OriginalId, $MutableTag) 30
          $RestoredId = (Invoke-Docker @(
            "image", "inspect", "--format", "{{.Id}}", $MutableTag
          ) 30).Output[0].Trim()
          if ($RestoredId -cne $OriginalId) {
            throw "A pre-existing Supabase CLI image alias was not restored"
          }
        } else {
          throw "Cannot safely restore a mutable CLI image tag"
        }
      }
      $ChangedMutableTags.Clear()
    }},
    [pscustomobject]@{ Name = "working-directory"; Action = {
      if ($script:NativeProcessReapFailure) {
        throw "The sealed working directory is retained for an unreaped native process"
      }
      $ResolvedWorking = [IO.Path]::GetFullPath($WorkingFull)
      if (-not $ResolvedWorking.StartsWith($TempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
          (Split-Path -Leaf $ResolvedWorking) -cne "wouldkeep-p1b-sealed-$Nonce") {
        throw "Refusing unsafe working-directory cleanup"
      }
      if (Test-Path -LiteralPath $ResolvedWorking) {
        Remove-Item -LiteralPath $ResolvedWorking -Recurse -Force -ErrorAction Stop
      }
    }}
  )
  foreach ($Step in $CleanupSteps) {
    try {
      & $Step.Action
    } catch {
      $CleanupStepFailure = $_.Exception
      if ($Step.Name -ceq "temporary-firewall-rule" -and
          $CleanupState.FirewallRuleOwnershipEstablished) {
        $RecordedInstanceId = if (
          $CleanupState.FirewallRuleInstanceId -is [string] -and
          -not [string]::IsNullOrWhiteSpace($CleanupState.FirewallRuleInstanceId)
        ) { $CleanupState.FirewallRuleInstanceId } else { "<unrecorded>" }
        try {
          Write-HostEvidence "firewall-retained.txt" @(
            "tag_write_pause_sealed_firewall_retained",
            "name=$FirewallRuleName",
            "instance_id=$RecordedInstanceId",
            "creation_returned_success=$($CleanupState.FirewallRuleCreated)",
            "runtime_cleanup_proven=$($CleanupState.RuntimeProof.Proven)",
            "local_port=$DbPort",
            "reason=$($CleanupStepFailure.Message)",
            "automatic_name_based_removal=forbidden",
            "partial_create_without_recorded_instance=manual_review_only",
            "removal_requires=separate authorization; recorded engine identity; zero scoped resources; zero host listeners; full PersistentStore identity and filters; exact InputObject removal; PersistentStore and ActiveStore zero residue"
          )
        } catch { }
      }
      $null = $CleanupFailures.Add("$($Step.Name): $($CleanupStepFailure.Message)")
      $null = $CleanupExceptions.Add($CleanupStepFailure)
    }
  }
}

if ($CleanupFailures.Count -gt 0) {
  Write-HostEvidence "cleanup-failure.txt" $CleanupFailures.ToArray()
  $DeferredFailures = [Collections.Generic.List[Exception]]::new()
  if ($null -ne $MainFailure) {
    $null = $DeferredFailures.Add($MainFailure)
  }
  foreach ($CleanupException in $CleanupExceptions) {
    $null = $DeferredFailures.Add($CleanupException)
  }
  if ($DeferredFailures.Count -eq 1) {
    throw $DeferredFailures[0]
  }
  throw [AggregateException]::new(
    "Sealed environment failed and cleanup was incomplete",
    [Exception[]]$DeferredFailures.ToArray()
  )
}
Write-HostEvidence "cleanup.txt" @(
  "tag_write_pause_sealed_cleanup_passed",
  "containers=0",
  "project_networks=0",
  "data_volumes=0",
  "temporary_firewall_rules=0",
  "runner_image=removed",
  "working_directory=removed"
)
if ($null -ne $MainFailure) {
  throw $MainFailure
}
if (-not $Succeeded) {
  throw "Sealed environment did not complete"
}

Write-HostEvidence "completed-utc.txt" @((Get-Date).ToUniversalTime().ToString("o"))
Write-Output "tag_write_pause_sealed_host_passed"
