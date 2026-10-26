#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/opt/lyceumtv"
OUTDIR="$ROOT/data/release_backups"
LATEST="$(find "$OUTDIR" -maxdepth 1 -type f -name 'release-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
[[ -n "$LATEST" && -f "$LATEST" ]] || { echo "No release snapshot found" >&2; exit 1; }
cd "$ROOT"
tar -xzf "$LATEST"
chmod +x scripts/*.sh 2>/dev/null || true
echo "Restored $LATEST"
