param(
  [string]$Container = "supabase_db_wouldkeep-p1-local",
  [string]$OwnerId = "b154d7e9-07c9-4412-8673-86239bbbe367"
)

# Disposable local/non-production harness. It intentionally creates fixture rows and
# rollback-independent local grants so two real psql sessions can exercise RLS paths.

$ErrorActionPreference = "Stop"
$testRoot = Join-Path $PSScriptRoot "concurrency"

function Invoke-PsqlFile([string]$Path) {
  Get-Content -Raw -LiteralPath $Path |
    docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "owner_id=$OwnerId"
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed for $Path with exit code $LASTEXITCODE"
  }
}

function Start-PsqlFile([string]$Path) {
  Start-Job -ScriptBlock {
    param($InputFile, $DatabaseContainer, $FixtureOwner)
    Get-Content -Raw -LiteralPath $InputFile |
      docker exec -i $DatabaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "owner_id=$FixtureOwner"
    "__EXIT__=$LASTEXITCODE"
  } -ArgumentList $Path, $Container, $OwnerId
}

function Invoke-Pair([string]$Holder, [string]$Contender) {
  $holderJob = Start-PsqlFile (Join-Path $testRoot $Holder)
  Start-Sleep -Milliseconds 500
  $contenderJob = Start-PsqlFile (Join-Path $testRoot $Contender)
  Wait-Job -Job $holderJob, $contenderJob | Out-Null

  foreach ($job in @($holderJob, $contenderJob)) {
    $output = Receive-Job $job 2>&1 | Out-String
    Remove-Job $job
    if ($output -notmatch "__EXIT__=0") {
      throw "Concurrent psql session failed:`n$output"
    }
  }
}

Invoke-PsqlFile (Join-Path $testRoot "publication-update-setup.sql")
Invoke-Pair "publication-update-first.sql" "publication-update-first-delete.sql"
Invoke-Pair "publication-delete-first.sql" "publication-delete-first-update.sql"
Invoke-PsqlFile (Join-Path $testRoot "publication-update-verify.sql")
