#!/usr/bin/env bash
set -euo pipefail
echo "LyceumTV 3.4.1 uses signed-by-hash OTA packages from Control Center."
echo "Open: http://$(hostname -I | awk '{print $1}'):8080/admin"
echo "System -> OTA update"
