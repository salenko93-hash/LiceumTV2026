param(
    [string]$PiHost = "192.168.2.193",
    [string]$PiUser = "admin"
)

$ErrorActionPreference = "Stop"
$target = "${PiUser}@${PiHost}"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw "ssh not found. Install Windows OpenSSH Client."
}

Write-Host "Checking Raspberry Pi: $target"
Write-Host ""

& ssh $target @'
set +e
failed=0
echo "=== MODEL / ARCH ==="
tr -d '\0' </proc/device-tree/model; echo
uname -m
echo "=== API ==="
curl -fsS --max-time 5 http://127.0.0.1:8080/api/health || failed=1
echo
echo
echo "=== SERVICES ==="
for s in lyceumtv.service lyceumtv-kiosk.service lyceumtv-watchdog.timer; do
  printf "%-28s " "$s"
  systemctl is-active "$s" || failed=1
done
echo
echo "=== BOOT TARGET ==="
systemctl get-default
echo
echo "=== DISPLAY MODES ==="
for f in /sys/class/drm/*HDMI*/modes; do
  [ -f "$f" ] || continue
  echo "-- $f"
  head -n 8 "$f"
done
echo
echo "=== AUDIO ==="
wpctl status || true
command -v vcgencmd >/dev/null && vcgencmd get_throttled
echo "=== KIOSK LOG TAIL ==="
journalctl -u lyceumtv-kiosk.service -n 20 --no-pager || true
exit $failed
'@

if ($LASTEXITCODE -ne 0) {
    throw "One or more required remote checks failed."
}

Write-Host ""
Write-Host "TV:       http://${PiHost}:8080/"
Write-Host "Admin:    http://${PiHost}:8080/admin"
Write-Host "Ops:      http://${PiHost}:8080/ops"
Write-Host "UI debug: http://${PiHost}:8080/?debug=1"
Write-Host "Mobile:   http://${PiHost}:8080/mobile/"
