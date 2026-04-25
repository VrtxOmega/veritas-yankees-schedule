# ─────────────────────────────────────────────────────────────────────
#  VERITAS Yankees 2026 — deploy script
#  • git add + commit (and optional push)
#  • Backup whole project to G:\My Drive\Desktop\<timestamp>\
#  • Create launcher shortcuts on local Desktop AND G:\My Drive\Desktop
# ─────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
  [string]$Message = "feat: news ticker, ZIP-based home location, fullscreen map modal",
  [switch]$NoCommit,
  [switch]$NoBackup,
  [switch]$NoShortcut,
  [switch]$Push
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp   = Get-Date -Format 'yyyy-MM-dd_HHmm'

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  VERITAS YANKEES 2026 - DEPLOY" -ForegroundColor Yellow
Write-Host "  Project: $ProjectRoot" -ForegroundColor DarkGray
Write-Host "  Stamp:   $Timestamp" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""

# ─── 1. GIT COMMIT ──────────────────────────────────────────────────
if (-not $NoCommit) {
  Push-Location $ProjectRoot
  try {
    if (-not (Test-Path .git)) {
      Write-Host "> Initializing git repo (no .git found)..." -ForegroundColor Cyan
      git init | Out-Null
      git branch -M main 2>$null
    }
    Write-Host "> git add ." -ForegroundColor Cyan
    git add . | Out-Null

    $staged = git diff --cached --name-only
    if (-not $staged) {
      Write-Host "  (nothing to commit - working tree clean)" -ForegroundColor DarkGray
    } else {
      Write-Host "> git commit -m `"$Message`"" -ForegroundColor Cyan
      git commit -m $Message | Out-Null
      Write-Host "  [OK] committed:" -ForegroundColor Green
      $staged | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }

    if ($Push) {
      Write-Host "> git push" -ForegroundColor Cyan
      git push
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "> Skipping git (-NoCommit)" -ForegroundColor DarkGray
}
Write-Host ""

# ─── 2. BACKUP TO G:\My Drive\Desktop ───────────────────────────────
if (-not $NoBackup) {
  $BackupRoot = 'G:\My Drive\Desktop'
  $BackupDir  = Join-Path $BackupRoot "veritas-yankees-schedule-backup-$Timestamp"

  if (-not (Test-Path $BackupRoot)) {
    Write-Host "> G:\My Drive\Desktop not available - skipping backup" -ForegroundColor Yellow
  } else {
    Write-Host "> Backing up to: $BackupDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    # robocopy: /E recurses (incl. empty dirs), /XD excludes dirs, /XF excludes files
    robocopy $ProjectRoot $BackupDir `
      /E `
      /XD node_modules dist .git `
      /XF *.log `
      /NFL /NDL /NJH /NJS /NP /NS /NC | Out-Null
    # robocopy exit codes 0–7 are success; 8+ indicate errors
    if ($LASTEXITCODE -lt 8) {
      $size = (Get-ChildItem -Path $BackupDir -Recurse -File -ErrorAction SilentlyContinue |
               Measure-Object Length -Sum).Sum
      $sizeMB = [math]::Round($size / 1MB, 2)
      Write-Host "  [OK] backed up ($sizeMB MB)" -ForegroundColor Green
    } else {
      Write-Host "  [FAIL] robocopy exit $LASTEXITCODE" -ForegroundColor Red
    }
    # robocopy sets $LASTEXITCODE in a way that confuses subsequent error checks; reset.
    $global:LASTEXITCODE = 0
  }
} else {
  Write-Host "> Skipping backup (-NoBackup)" -ForegroundColor DarkGray
}
Write-Host ""

# ─── 3. DESKTOP SHORTCUT(S) ─────────────────────────────────────────
# Creates the launcher .lnk on BOTH:
#   • The local Windows desktop
#   • G:\My Drive\Desktop  (so it follows your Drive sync)
# Each one points at the launch-veritas-yankees.cmd in the project root,
# uses build\icon.ico as the icon if available, and runs minimized so the
# console doesn't flash when launched.
if (-not $NoShortcut) {
  $LauncherCmd = Join-Path $ProjectRoot 'launch-veritas-yankees.cmd'
  $IconPath    = Join-Path $ProjectRoot 'build\icon.ico'

  if (-not (Test-Path $LauncherCmd)) {
    Write-Host "> launch-veritas-yankees.cmd missing - skipping shortcut" -ForegroundColor Yellow
  } else {
    $targets = @(
      [Environment]::GetFolderPath('Desktop'),
      'G:\My Drive\Desktop'
    )

    $WSH = New-Object -ComObject WScript.Shell
    foreach ($desktop in $targets) {
      if (-not (Test-Path $desktop)) {
        Write-Host "> $desktop not available - skipping" -ForegroundColor Yellow
        continue
      }
      $ShortcutPath = Join-Path $desktop 'VERITAS Yankees 2026.lnk'
      Write-Host "> Creating shortcut: $ShortcutPath" -ForegroundColor Cyan
      $sc = $WSH.CreateShortcut($ShortcutPath)
      $sc.TargetPath       = $LauncherCmd
      $sc.WorkingDirectory = $ProjectRoot
      $sc.Description      = 'VERITAS Yankees 2026 - Schedule & Live Scores'
      $sc.WindowStyle      = 7  # minimized - no flash of console window
      if (Test-Path $IconPath) { $sc.IconLocation = $IconPath }
      $sc.Save()
      Write-Host "  [OK] shortcut created" -ForegroundColor Green
    }
  }
} else {
  Write-Host "> Skipping shortcut (-NoShortcut)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  DONE" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
