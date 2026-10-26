#!/usr/bin/env bash
set -u

APP_URL="${LYCEUMTV_URL:-http://127.0.0.1:8080/api/health}"
DEVTOOLS_URL="http://127.0.0.1:9222/json/version"
ROOT="/opt/lyceumtv"
COUNT_FILE="/run/lyceumtv-watchdog-failcount"
OTA_PENDING="$ROOT/data/ota_pending"

if curl -fsS --max-time 5 "$APP_URL" >/dev/null; then
  echo 0 >"$COUNT_FILE" 2>/dev/null || true
  if [[ -f "$OTA_PENDING" ]]; then
    logger -t lyceumtv-watchdog "OTA health check passed; accepting new release"
    rm -f "$OTA_PENDING" || true
  fi
else
  count="$(cat "$COUNT_FILE" 2>/dev/null || echo 0)"
  count=$((count+1))
  echo "$count" >"$COUNT_FILE" 2>/dev/null || true
  logger -t lyceumtv-watchdog "HTTP health failed ($count); restarting lyceumtv.service"
  systemctl restart lyceumtv.service || true

  if [[ "$count" -ge 3 && -f "$OTA_PENDING" && -x "$ROOT/scripts/release_rollback.sh" ]]; then
    logger -t lyceumtv-watchdog "OTA failed health 3 times; automatic release rollback"
    "$ROOT/scripts/release_rollback.sh" || true
    rm -f "$OTA_PENDING" || true
    echo 0 >"$COUNT_FILE" 2>/dev/null || true
    systemctl restart lyceumtv.service || true
  fi
fi

# Pi 4 can need time for a cold Chromium profile. Allow 120 seconds after
# each service start before probing DevTools, avoiding a restart loop.
started="$(systemctl show lyceumtv-kiosk.service -p ExecMainStartTimestampMonotonic --value 2>/dev/null || echo 0)"
started="${started:-0}"
uptime_us="$(awk '{printf "%.0f", $1 * 1000000}' /proc/uptime)"
if [[ "$started" =~ ^[0-9]+$ ]] && (( started > 0 && uptime_us - started < 120000000 )); then
  exit 0
fi
if ! curl -fsS --max-time 5 "$DEVTOOLS_URL" >/dev/null; then
  logger -t lyceumtv-watchdog "Chromium check failed; restarting lyceumtv-kiosk.service"
  systemctl restart lyceumtv-kiosk.service || true
fi

# 3.4.0 startup/display probe; never restart a healthy application solely for display failure.
if command -v curl >/dev/null 2>&1; then
  curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/ >/dev/null 2>&1 || logger -t lyceumtv-watchdog 'Display HTML unavailable'
  curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/js/app.js >/dev/null 2>&1 || logger -t lyceumtv-watchdog 'Display JavaScript unavailable'
fi
