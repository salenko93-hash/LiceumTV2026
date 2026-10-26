#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/opt/lyceumtv"
OUTDIR="$ROOT/data/release_backups"
mkdir -p "$OUTDIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUTDIR/release-$STAMP.tar.gz"
cd "$ROOT"
ITEMS=()
for p in server public scripts systemd tools tests data/config.example.json data/default; do
  [[ -e "$p" ]] && ITEMS+=("$p")
done
tar -czf "$OUT" "${ITEMS[@]}"
find "$OUTDIR" -maxdepth 1 -type f -name 'release-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr | awk 'NR>3 {$1=""; sub(/^ /,""); print}' \
  | while IFS= read -r f; do [[ -n "$f" ]] && rm -f -- "$f"; done
echo "$OUT"
