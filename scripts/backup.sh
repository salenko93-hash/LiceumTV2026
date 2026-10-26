#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-$HOME/lyceumtv-backup-$(date +%Y%m%d-%H%M%S).tar.gz}"
cd /opt/lyceumtv
ARGS=(data/current data/default)
for f in \
  data/config.json data/runtime.json data/control.json \
  data/calendar_override.json data/bells_override.json data/screens.json \
  data/smart_ops.json; do
  [[ -e "$f" ]] && ARGS+=("$f")
done
[[ -d public/media ]] && ARGS+=(public/media)
tar -czf "$OUT" "${ARGS[@]}"
echo "$OUT"
