$ErrorActionPreference = "Stop"
$RepoUrl = if ($env:DEPLOYPILOT_REPO_URL) { $env:DEPLOYPILOT_REPO_URL } else { "https://github.com/MrInfinityboss/deploypilot.git" }
$Version = if ($env:DEPLOYPILOT_VERSION) { $env:DEPLOYPILOT_VERSION } else { "v1.0.12" }
$InstallDir = if ($env:DEPLOYPILOT_WORKER_DIR) { $env:DEPLOYPILOT_WORKER_DIR } else { Join-Path $env:USERPROFILE ".deploypilot-worker" }
$TaskName = "DeployPilot Worker"

foreach ($command in @("git", "node", "pnpm", "docker")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required. Install it before continuing." }
}

function Read-ClipboardValue([string]$Label, [switch]$Secret) {
  Write-Host "Copy $Label to the Windows clipboard, then press Enter here."
  [void](Read-Host)
  $value = (Get-Clipboard -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Label was not found in the clipboard." }
  if ($Secret) { Write-Host "$Label received securely from the clipboard." } else { Write-Host "$Label received from the clipboard." }
  return $value
}

Write-Host "DeployPilot Worker setup" -ForegroundColor Cyan
$ApiUrl = Read-ClipboardValue "the DeployPilot API URL"
$WorkerId = Read-ClipboardValue "the Worker ID"
$WorkerToken = Read-ClipboardValue "the Worker token" -Secret
$RedisUrl = Read-ClipboardValue "the shared Redis URL" -Secret
$DatabaseUrl = Read-ClipboardValue "the Supabase DATABASE_URL" -Secret
$DatabaseUrl = $DatabaseUrl -replace '^DATABASE_URL\s*=\s*', "";
$DatabaseUrl = $DatabaseUrl.Trim().Trim('"').Trim("'")

try { $parsedApiUrl = [Uri]$ApiUrl; if (-not $parsedApiUrl.IsAbsoluteUri) { throw "invalid" } } catch { throw "The API URL is not a valid URL." }
if ([string]::IsNullOrWhiteSpace($WorkerId) -or [string]::IsNullOrWhiteSpace($WorkerToken) -or [string]::IsNullOrWhiteSpace($RedisUrl) -or [string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "All worker values are required." }
if (-not ($DatabaseUrl.StartsWith("postgresql://") -or $DatabaseUrl.StartsWith("postgres://"))) { throw "DATABASE_URL must start with postgresql:// or postgres://. Copy the full Supabase connection string, not the variable name or a masked value." }

if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
  if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
  git clone --depth 1 --branch $Version $RepoUrl $InstallDir
} else {
  git -C $InstallDir fetch --tags --depth 1 origin $Version
  git -C $InstallDir checkout $Version
}

@"
WORKER_API_URL=$ApiUrl
WORKER_ID=$WorkerId
WORKER_TOKEN=$WorkerToken
REDIS_URL=$RedisUrl
DATABASE_URL=$DatabaseUrl
WORKER_VERSION=1.0.12
"@ | Set-Content (Join-Path $InstallDir ".env") -NoNewline

Push-Location $InstallDir
pnpm install --frozen-lockfile
$WorkerCommand = "Set-Location '$InstallDir'; pnpm --filter @deploypilot/worker exec tsx src/main.ts"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$WorkerCommand`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "DeployPilot Docker worker" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Pop-Location
Write-Host "DeployPilot worker installed and started." -ForegroundColor Green
Write-Host "It will start automatically when this Windows user logs in."
Write-Host "Check it in Task Scheduler: $TaskName"
