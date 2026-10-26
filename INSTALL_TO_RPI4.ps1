param(
    [string]$PiHost = "192.168.2.193",
    [string]$PiUser = "admin",
    [switch]$NoReboot
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = "${PiUser}@${PiHost}"
if ($PiHost -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$' -or $PiUser -notmatch '^[a-z_][a-z0-9_-]*$') {
    throw "Invalid PiHost or PiUser."
}
$remote = $null

Write-Host "================================================="
Write-Host " LyceumTV 3.4.1 RASPBERRY PI 4 PRODUCTION"
Write-Host " Raspberry Pi: $target"
Write-Host "================================================="

foreach ($cmd in @("ssh", "scp")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd not found. Install Windows OpenSSH Client."
    }
}

Write-Host "[1/5] Checking SSH and preparing remote folder..."
$remoteResult = & ssh $target "mktemp -d /tmp/lyceumtv-rpi4.XXXXXXXX"
$remoteExit = $LASTEXITCODE
$remote = ($remoteResult -join "").Trim()
if ($remoteExit -ne 0 -or $remote -notmatch '^/tmp/lyceumtv-rpi4\.[A-Za-z0-9]+$') {
    throw "SSH connection failed. Check Pi IP, username, password/key, and SSH service."
}

$required = @(
    "server",
    "public",
    "data",
    "scripts",
    "README.md"
)
foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $root $item))) {
        throw "Missing required project item: $item"
    }
}

Write-Host "[2/5] Uploading project..."
$uploadItems = @(
    (Join-Path $root "server"),
    (Join-Path $root "public"),
    (Join-Path $root "data"),
    (Join-Path $root "scripts"),
    (Join-Path $root "README.md")
)
$gitignore = Join-Path $root ".gitignore"
if (Test-Path $gitignore) {
    $uploadItems += $gitignore
}

& scp -r @uploadItems "${target}:$remote/"
if ($LASTEXITCODE -ne 0) {
    throw "Upload failed."
}

Write-Host "[3/5] Running Raspberry Pi installer..."
& ssh -t $target "cd '$remote' && chmod +x scripts/*.sh && ./scripts/install.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Remote install failed."
}

Write-Host "[4/5] Checking LyceumTV health..."
$health = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod `
            -Uri "http://${PiHost}:8080/api/health" `
            -TimeoutSec 3 `
            -ErrorAction Stop
        break
    }
    catch {
        Write-Host "Waiting for LyceumTV ($attempt/30)..."
        Start-Sleep -Seconds 2
    }
}

if ($null -eq $health) {
    Write-Warning "Server is not responding. Remote diagnostics:"
    & ssh $target "sudo systemctl status lyceumtv --no-pager -l || true; sudo journalctl -u lyceumtv -n 60 --no-pager || true"
    throw "LyceumTV health endpoint is not responding on ${PiHost}:8080"
}

$health | ConvertTo-Json -Depth 6 | Out-Host

if ($health.version -and $health.version -ne "3.4.1") {
    Write-Warning "Server reports version $($health.version), expected 3.4.1."
}

try {
    $state = Invoke-RestMethod `
        -Uri "http://${PiHost}:8080/api/state" `
        -TimeoutSec 8 `
        -ErrorAction Stop

    if ($state.config_public.mobile_public_url) {
        Write-Host "Mobile public URL: $($state.config_public.mobile_public_url)"
    }
}
catch {
    Write-Warning "API state check failed, but health endpoint is OK."
}

if (-not $NoReboot) {
    Write-Host "[5/5] Rebooting Raspberry Pi..."
    & ssh $target "sudo reboot"
    Write-Host "Reboot command sent."
}
else {
    Write-Host "[5/5] Reboot skipped."
}

Write-Host ""
Write-Host "Installation complete. Staging folder retained at $remote for diagnostics."
Write-Host "TV:      http://${PiHost}:8080/"
Write-Host "Admin:   http://${PiHost}:8080/admin"
Write-Host "Mobile:  http://${PiHost}:8080/mobile/"
Write-Host "Ops:     http://${PiHost}:8080/ops"
Write-Host "Health:  http://${PiHost}:8080/api/health"
Write-Host "Kiosk:   Chromium + Cage, password-store=basic"
