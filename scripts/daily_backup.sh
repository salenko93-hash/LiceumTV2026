#!/usr/bin/env bash
set -Eeuo pipefail
INSTALL_DIR="/opt/lyceumtv"
CFG="$INSTALL_DIR/data/config.json"
BACKUP_DIR="$INSTALL_DIR/data/backups"
MARKER="$INSTALL_DIR/data/last_daily_backup"
KEEP="${LYCEUMTV_BACKUP_KEEP:-14}"

readarray -t VALUES < <(python3 - "$CFG" <<'PY'
import json, sys
try: cfg=json.load(open(sys.argv[1],encoding="utf-8"))
except Exception: cfg={}
print("1" if cfg.get("daily_backup_enabled",True) else "0")
print(int(cfg.get("daily_backup_hour",3) or 3))
PY
)
[[ "${VALUES[0]:-1}" == "1" ]] || exit 0
WANTED_HOUR="${VALUES[1]:-3}"
NOW_HOUR="$(date +%H)"; NOW_HOUR=$((10#$NOW_HOUR))
[[ "$NOW_HOUR" -eq "$WANTED_HOUR" ]] || exit 0
TODAY="$(date +%F)"
[[ "$(cat "$MARKER" 2>/dev/null || true)" != "$TODAY" ]] || exit 0

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/daily-$STAMP.tar.gz"
"$INSTALL_DIR/scripts/backup.sh" "$OUT" >/dev/null
echo "$TODAY" >"$MARKER"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'daily-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr | awk -v keep="$KEEP" 'NR>keep {$1=""; sub(/^ /,""); print}' \
  | while IFS= read -r f; do [[ -n "$f" ]] && rm -f -- "$f"; done
echo "$OUT"
