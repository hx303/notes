# One-click build + deploy script for wouldkeep.com
# Usage: .\build_and_deploy.ps1
# Requires: Vercel CLI logged in (run `vercel login` first)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== 1/4 Building Quartz ===" -ForegroundColor Cyan
npx quartz build
if ($LASTEXITCODE -ne 0) { throw "Quartz build failed" }

Write-Host "`n=== 2/4 Copying image attachments ===" -ForegroundColor Cyan
node build_images.mjs

Write-Host "`n=== 3/4 Copying admin editor + vercel.json ===" -ForegroundColor Cyan
Copy-Item "$root\vercel.json" "$root\public\vercel.json" -Force
Copy-Item "$root\static\admin" "$root\public\admin" -Recurse -Force

Write-Host "`n=== 4/4 Deploying to Vercel ===" -ForegroundColor Cyan
$env:VERCEL_ORG_ID = "team_vSFadBJ2sMBFZzDYrfPY7L58"
$env:VERCEL_PROJECT_ID = "prj_IXBqWXga4KNfdlRMSR3MQO6a0hup"
vercel --prod --yes --cwd "$root\public"

Write-Host "`n=== Done! https://wouldkeep.com ===" -ForegroundColor Green
