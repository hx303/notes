param(
  [Parameter(Mandatory = $true)]
  [string]$Container
)

# Disposable local/non-production harness. Every pair is two distinct psql
# processes connected to the same PostgreSQL database.
$ErrorActionPreference = "Stop"
$testRoot = Join-Path $PSScriptRoot "concurrency"

function Invoke-PsqlFile([string]$Name) {
  $path = Join-Path $testRoot $Name
  Get-Content -Raw -LiteralPath $path |
    docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed for $Name with exit code $LASTEXITCODE"
  }
}

function Start-PsqlFile([string]$Name) {
  $path = Join-Path $testRoot $Name
  $identity = [Guid]::NewGuid().ToString("N")
  $stdout = Join-Path ([IO.Path]::GetTempPath()) "wouldkeep-atomic-$identity.out"
  $stderr = Join-Path ([IO.Path]::GetTempPath()) "wouldkeep-atomic-$identity.err"
  $process = Start-Process `
    -FilePath "docker" `
    -ArgumentList @(
      "exec", "-i", $Container, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1"
    ) `
    -RedirectStandardInput $path `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru

  [PSCustomObject]@{
    Name = $Name
    Process = $process
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Complete-PsqlFile($Handle) {
  if (-not $Handle.Process.WaitForExit(30000)) {
    $Handle.Process.Kill()
    $Handle.Process.WaitForExit()
    throw "psql process timed out for $($Handle.Name)"
  }
  $Handle.Process.WaitForExit()
  $Handle.Process.Refresh()
  $output = Get-Content -Raw -LiteralPath $Handle.Stdout -ErrorAction SilentlyContinue
  $errorOutput = Get-Content -Raw -LiteralPath $Handle.Stderr -ErrorAction SilentlyContinue
  $exitCode = $Handle.Process.ExitCode
  $explicitFailure = $errorOutput -match '(?im)\b(?:ERROR|FATAL):|error during connect|no such container'
  $hasSentinel = $output -match 'atomic-save-session-complete'
  if (($null -ne $exitCode -and $exitCode -ne 0) -or $explicitFailure -or -not $hasSentinel) {
    throw "psql failed for $($Handle.Name) (exit=$exitCode):`n$output`n$errorOutput"
  }
}

function Remove-PsqlHandle($Handle) {
  if ($null -eq $Handle) {
    return
  }
  if (-not $Handle.Process.HasExited) {
    $Handle.Process.Kill()
    $Handle.Process.WaitForExit()
  }
  Remove-Item -LiteralPath $Handle.Stdout, $Handle.Stderr -Force -ErrorAction SilentlyContinue
}

function Wait-HolderLock([string]$ApplicationName, $HolderHandle) {
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    if ($HolderHandle.Process.HasExited) {
      Complete-PsqlFile $HolderHandle
      throw "holder $ApplicationName exited before reaching its lock barrier"
    }
    $count = docker exec $Container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c @"
SELECT count(*)
FROM pg_catalog.pg_stat_activity activity
WHERE activity.application_name = '$ApplicationName'
  AND activity.state = 'active'
  AND activity.query LIKE '%pg_sleep%'
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_locks lock
    WHERE lock.pid = activity.pid
      AND lock.locktype = 'advisory'
      AND lock.granted
  );
"@
    if ($LASTEXITCODE -ne 0) {
      throw "could not inspect the holder lock for $ApplicationName"
    }
    if (($count | Out-String).Trim() -eq "1") {
      return
    }
    Start-Sleep -Milliseconds 100
  }
  throw "holder $ApplicationName did not reach the post-RPC lock-holding state"
}

function Invoke-Pair(
  [string]$Holder,
  [string]$Contender,
  [string]$ApplicationName
) {
  $holderHandle = $null
  $contenderHandle = $null
  try {
    $holderHandle = Start-PsqlFile $Holder
    Wait-HolderLock $ApplicationName $holderHandle
    $contenderHandle = Start-PsqlFile $Contender
    Complete-PsqlFile $holderHandle
    Complete-PsqlFile $contenderHandle
  }
  finally {
    Remove-PsqlHandle $holderHandle
    Remove-PsqlHandle $contenderHandle
  }
}

try {
  Invoke-PsqlFile "atomic-save-concurrency-setup.sql"
  Invoke-Pair `
    "atomic-save-same-op-holder.sql" `
    "atomic-save-same-op-contender.sql" `
    "atomic-save-same-op-holder"
  Invoke-Pair `
    "atomic-save-cas-holder.sql" `
    "atomic-save-cas-contender.sql" `
    "atomic-save-cas-holder"
  Invoke-Pair `
    "atomic-save-kb-holder.sql" `
    "atomic-save-kb-delete.sql" `
    "atomic-save-kb-holder"
  Invoke-PsqlFile "atomic-save-concurrency-verify.sql"
}
finally {
  Invoke-PsqlFile "atomic-save-concurrency-cleanup.sql"
}
