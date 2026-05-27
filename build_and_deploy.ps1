# One-click build + deploy script for wouldkeep.com
# Usage: .\build_and_deploy.ps1
# Requires: Vercel CLI logged in, Obsidian vault accessible at D:\Obsidian\notes\覆水知识库\notes

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$OBSIDIAN_VAULT = "D:\Obsidian\notes\覆水知识库\notes"
$CONTENT_DIR = "$root\content"

# ============================================================
# Step 0: Sync content from Obsidian vault
# ============================================================
Write-Host "=== 0/5 Syncing from Obsidian vault ===" -ForegroundColor Cyan
if (Test-Path $OBSIDIAN_VAULT) {
    # Mirror .md files from Obsidian to content/
    # Exclude: _backups, _backup, .obsidian, templates, private
    robocopy $OBSIDIAN_VAULT $CONTENT_DIR *.md /MIR /NJH /NJS /NP /NDL /XF *.mp4 *.webm *.mov *.avi /XD "_backups" "_backup" ".obsidian" "templates" "private"
    if ($LASTEXITCODE -ge 8) { throw "Robocopy failed (exit code: $LASTEXITCODE)" }
    Write-Host "  Synced .md files from Obsidian vault." -ForegroundColor Green
} else {
    Write-Host "  WARNING: Obsidian vault not found at $OBSIDIAN_VAULT - skipping sync" -ForegroundColor Yellow
}

# ============================================================
# Step 0.5: Remove video files from content
# ============================================================
Write-Host "`n=== 0.5/5 Removing video files ===" -ForegroundColor Cyan
$videos = Get-ChildItem -Path $CONTENT_DIR -Recurse -Include *.mp4,*.webm,*.mov,*.avi -ErrorAction SilentlyContinue
if ($videos) {
    $videos | ForEach-Object {
        Write-Host "  Removing: $($_.Name) ($([math]::Round($_.Length/1MB, 1)) MB)"
        Remove-Item $_.FullName -Force
    }
    Write-Host "  Removed $($videos.Count) video files." -ForegroundColor Green
} else {
    Write-Host "  No video files found." -ForegroundColor Green
}

# ============================================================
# Step 1: Clean + Build Quartz
# ============================================================
Write-Host "`n=== 1/5 Building Quartz ===" -ForegroundColor Cyan
# Full rebuild (clean public/ first to avoid incremental build issues)
if (Test-Path "$root\public") {
    Remove-Item "$root\public" -Recurse -Force
    Write-Host "  Cleaned public/ directory."
}
npx quartz build
if ($LASTEXITCODE -ne 0) { throw "Quartz build failed" }
Write-Host "  Quartz build complete." -ForegroundColor Green

# ============================================================
# Step 2: Copy image attachments
# ============================================================
Write-Host "`n=== 2/5 Copying image attachments ===" -ForegroundColor Cyan
node build_images.mjs

# ============================================================
# Step 3: Copy admin editor + vercel.json
# ============================================================
Write-Host "`n=== 3/5 Copying admin + config ===" -ForegroundColor Cyan
Copy-Item "$root\static\vercel.json" "$root\public\vercel.json" -Force
Copy-Item "$root\static\admin" "$root\public\admin" -Recurse -Force
Write-Host "  Copied vercel.json + admin editor." -ForegroundColor Green

# ============================================================
# Step 4: Post-build verification
# ============================================================
Write-Host "`n=== 4/5 Verifying build output ===" -ForegroundColor Cyan
$errors = @()

# Check index.html exists
if (-not (Test-Path "$root\public\index.html")) {
    $errors += "public/index.html MISSING"
}

# Check sitemap exists
if (-not (Test-Path "$root\public\sitemap.xml")) {
    $errors += "public/sitemap.xml MISSING"
}

# Count HTML files vs content MD files
$htmlCount = (Get-ChildItem -Path "$root\public" -Recurse -Filter "*.html" -ErrorAction SilentlyContinue).Count
$mdCount = (Get-ChildItem -Path $CONTENT_DIR -Recurse -Filter "*.md" -ErrorAction SilentlyContinue).Count
Write-Host "  Content .md files: $mdCount" -ForegroundColor Gray
Write-Host "  Public .html files: $htmlCount" -ForegroundColor Gray

if ($htmlCount -lt ($mdCount * 0.8)) {
    $errors += "HTML count ($htmlCount) much less than MD count ($mdCount) - possible build issue"
}

# Check admin editor
if (-not (Test-Path "$root\public\admin\index.html")) {
    $errors += "public/admin/index.html MISSING"
}

# Check for large files (>10MB, except images in attachments)
$largeFiles = Get-ChildItem -Path "$root\public" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 10MB -and $_.Name -notmatch '\.(jpg|jpeg|png|gif|webp)$' }
if ($largeFiles) {
    $largeFiles | ForEach-Object { $errors += "Large file (>10MB): $($_.FullName.Replace($root,''))" }
}

if ($errors.Count -gt 0) {
    Write-Host "  VERIFICATION FAILED:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    throw "Post-build verification failed"
}
Write-Host "  All checks passed!" -ForegroundColor Green

# ============================================================
# Step 5: Deploy to Vercel
# ============================================================
Write-Host "`n=== 5/5 Deploying to Vercel ===" -ForegroundColor Cyan
$env:VERCEL_ORG_ID = "team_vSFadBJ2sMBFZzDYrfPY7L58"
$env:VERCEL_PROJECT_ID = "prj_IXBqWXga4KNfdlRMSR3MQO6a0hup"
vercel --prod --yes --cwd "$root\public"

Write-Host "`n=== Done! https://wouldkeep.com ===" -ForegroundColor Green
