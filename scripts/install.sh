#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Запускайте install.sh звичайним користувачем із sudo доступом."
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="$(id -un)"
GROUP_NAME="$(id -gn)"
USER_UID="$(id -u)"
INSTALL_DIR="/opt/lyceumtv"

# Refuse an unsupported target before changing packages or boot configuration.
MODEL="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || true)"
if [[ "$MODEL" != *"Raspberry Pi 4 Model B"* || "$(uname -m)" != aarch64 ]]; then
  echo "This package requires Raspberry Pi 4 Model B with Raspberry Pi OS 64-bit." >&2
  exit 1
fi
. /etc/os-release
if [[ "${VERSION_CODENAME:-}" != bookworm && "${VERSION_CODENAME:-}" != trixie ]]; then
  echo "Use Raspberry Pi OS Bookworm or Trixie (64-bit)." >&2
  exit 1
fi
if [[ "$ROOT" == "$INSTALL_DIR" ]]; then
  echo "Run installer from an extracted staging folder, not /opt/lyceumtv." >&2
  exit 1
fi
sudo -v

echo "[1/8] Installing packages..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  python3 python3-openpyxl python3-qrcode rsync curl cage dbus-user-session libpam-systemd \
  pipewire pipewire-pulse wireplumber \
  fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji

if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium \
    || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser
fi

echo "[2/8] Preserving live settings..."
sudo mkdir -p "$INSTALL_DIR"
TMP_CFG="$(mktemp -d)"
trap 'rm -rf "$TMP_CFG"' EXIT
if [[ -f "$INSTALL_DIR/data/config.json" ]]; then
  sudo cp "$INSTALL_DIR/data/config.json" "$TMP_CFG/config.json"
fi
if [[ -f "$INSTALL_DIR/data/runtime.json" ]]; then
  sudo cp "$INSTALL_DIR/data/runtime.json" "$TMP_CFG/runtime.json"
fi
for f in control.json calendar_override.json bells_override.json screens.json; do
  if [[ -f "$INSTALL_DIR/data/$f" ]]; then
    sudo cp "$INSTALL_DIR/data/$f" "$TMP_CFG/$f"
  fi
done

echo "[3/8] Installing LyceumTV files..."
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv/' \
  --exclude '__pycache__/' \
  --exclude 'data/config.json' \
  --exclude 'data/runtime.json' \
  --exclude 'data/control.json' \
  --exclude 'data/calendar_override.json' \
  --exclude 'data/bells_override.json' \
  --exclude 'data/screens.json' \
  --exclude 'data/smart_ops.json' \
  --exclude 'public/media/' \
  --exclude 'data/imports/' \
  --exclude 'data/current/' \
  --exclude 'data/previous/' \
  --exclude 'data/backups/' \
  --exclude 'data/logs/' \
  --exclude 'data/release_backups/' \
  --exclude 'docs/' \
  --exclude 'tests/' \
  --exclude 'tools/' \
  --exclude 'cloud/' \
  "$ROOT/" "$INSTALL_DIR/"

if [[ -f "$TMP_CFG/config.json" ]]; then
  sudo cp "$TMP_CFG/config.json" "$INSTALL_DIR/data/config.json"
fi
if [[ -f "$TMP_CFG/runtime.json" ]]; then
  sudo cp "$TMP_CFG/runtime.json" "$INSTALL_DIR/data/runtime.json"
fi
for f in control.json calendar_override.json bells_override.json screens.json; do
  if [[ -f "$TMP_CFG/$f" ]]; then
    sudo cp "$TMP_CFG/$f" "$INSTALL_DIR/data/$f"
  fi
done


# Ensure required Smart Operations settings exist in persisted config.
sudo python3 - "$INSTALL_DIR/data/config.json" "$INSTALL_DIR/data/config.example.json" <<'PYCFG'
import json, os, sys, secrets
live, example = sys.argv[1], sys.argv[2]
with open(example, "r", encoding="utf-8") as f:
    defaults = json.load(f)
try:
    with open(live, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        cfg = {}
except Exception:
    cfg = {}
changed = False
required_keys = (
    "mobile_public_url","mobile_enabled","mobile_title","main_screen_id",
    "campus_name","dispatcher_key","teacher_key","notifications_enabled",
    "auto_notify_substitutions","auto_notify_announcements",
    "health_alerts_enabled","health_cpu_warn_c","health_disk_warn_percent",
    "health_memory_warn_percent","daily_backup_enabled","daily_backup_hour",
    "signage_enabled","audio_events_enabled","cloud_mirror_enabled",
    "cloud_mirror_url","cloud_mirror_token","cloud_mirror_interval_minutes",
    "public_service_enabled","teacher_view_enabled","operations_view_enabled",
    "room_catalog","main_building","main_floor",
    "music_enabled","music_breaks_enabled","music_after_school_enabled",
    "music_after_school_until","music_volume_percent","music_shuffle",
    "music_fade_seconds","music_break_fade_before_end_seconds","music_main_screen_id",
    "duty_class_enabled","duty_rotation_start_date","duty_rotation_start_class",
    "duty_rotation_order","duty_skip_full_holiday_weeks","duty_manual_class",
    "duty_class_label"
)
for key in required_keys:
    if key not in cfg and key in defaults:
        cfg[key] = defaults[key]
        changed = True
# New installation: generate per-role random secrets; upgrade: keep existing credentials.
for role in ("admin_key", "dispatcher_key", "teacher_key"):
    if not cfg.get(role):
        cfg[role] = secrets.token_urlsafe(32)
        changed = True
# Version is release-owned and config_store will override it anyway.
if not os.path.exists(live) or changed:
    os.makedirs(os.path.dirname(live), exist_ok=True)
    tmp = live + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({**defaults, **cfg}, f, ensure_ascii=False, indent=2)
    os.replace(tmp, live)
    try:
        os.chmod(live, 0o600)
    except OSError:
        pass
PYCFG

sudo mkdir -p "$INSTALL_DIR/data/current" "$INSTALL_DIR/data/backups" "$INSTALL_DIR/data/logs"
if [[ -z "$(sudo find "$INSTALL_DIR/data/current" -maxdepth 1 -type f -print -quit 2>/dev/null)" ]]; then
  sudo cp "$INSTALL_DIR/data/default/"*.json "$INSTALL_DIR/data/current/"
fi

# Migrate only the built-in academic calendar to the corrected
# learning-process structure. Custom/imported calendars and local overrides
# are preserved.
sudo python3 - "$INSTALL_DIR/data/current/calendar.json" "$INSTALL_DIR/data/default/calendar.json" <<'PYCAL'
import json, os, shutil, sys
live, corrected = sys.argv[1], sys.argv[2]
should_replace = not os.path.exists(live)
if os.path.exists(live):
    try:
        with open(live, "r", encoding="utf-8") as f:
            obj = json.load(f)
        source = str(obj.get("source", ""))
        should_replace = (
            not source
            or "структура навчального року" in source
            or "нова структура навчального року з чергуванням" in source
        )
    except Exception:
        should_replace = True
if should_replace and os.path.exists(corrected):
    os.makedirs(os.path.dirname(live), exist_ok=True)
    shutil.copy2(corrected, live)
PYCAL
if [[ ! -f "$INSTALL_DIR/data/smart_ops.json" && -f "$INSTALL_DIR/data/default/smart_ops.json" ]]; then
  sudo cp "$INSTALL_DIR/data/default/smart_ops.json" "$INSTALL_DIR/data/smart_ops.json"
fi
sudo mkdir -p "$INSTALL_DIR/public/media"

# Preserve all four live schedules across updates.
# The initial install already populates missing schedules from data/default.
# Never replace teacher-edited live schedules in a maintenance release.

rm -rf "$TMP_CFG"

sudo chown -R "$USER_NAME:$GROUP_NAME" "$INSTALL_DIR"
sudo chmod 600 "$INSTALL_DIR/data/config.json"
sudo chmod +x "$INSTALL_DIR/scripts/"*.sh

echo "[4/8] Preparing kiosk user..."
for grp in video render input audio; do
  if getent group "$grp" >/dev/null 2>&1; then
    sudo usermod -aG "$grp" "$USER_NAME"
  fi
done
mkdir -p "$HOME/.config/lyceumtv-kiosk-chromium"
chmod 700 "$HOME/.config/lyceumtv-kiosk-chromium" 2>/dev/null || true
sudo "$INSTALL_DIR/scripts/prepare-keyring-free-kiosk.sh" "$USER_NAME"

# PipeWire supplies Chromium audio in the dedicated headless login session.
# Do not start a second, conflicting per-system audio daemon.
systemctl --user enable pipewire.socket pipewire-pulse.socket wireplumber.service

echo "[5/8] Installing systemd services..."
sudo tee /etc/systemd/system/lyceumtv.service >/dev/null <<EOF
[Unit]
Description=LyceumTV 3.4.1
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Group=$GROUP_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/server/app.py
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/lyceumtv-kiosk.service >/dev/null <<EOF
[Unit]
Description=LyceumTV Adaptive TV Kiosk
After=network-online.target systemd-user-sessions.service user@$USER_UID.service lyceumtv.service
Wants=user@$USER_UID.service
Wants=network-online.target lyceumtv.service
StartLimitIntervalSec=0
Conflicts=getty@tty1.service

[Service]
Type=simple
User=$USER_NAME
Group=$GROUP_NAME
PAMName=lyceumtv-kiosk
TTYPath=/dev/tty1
StandardInput=tty-force
StandardOutput=journal
StandardError=journal
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
UtmpIdentifier=tty1
UtmpMode=user
Environment=XDG_RUNTIME_DIR=/run/user/$USER_UID
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$USER_UID/bus
Environment=LYCEUMTV_HDMI_CONNECTOR=HDMI-A-1
ExecStart=$INSTALL_DIR/scripts/launch-kiosk.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/lyceumtv-watchdog.service >/dev/null <<EOF
[Unit]
Description=LyceumTV watchdog

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/scripts/watchdog.sh
EOF

sudo tee /etc/systemd/system/lyceumtv-watchdog.timer >/dev/null <<'EOF'
[Unit]
Description=Run LyceumTV watchdog every 20 seconds

[Timer]
OnBootSec=45
OnUnitActiveSec=20
AccuracySec=3
Unit=lyceumtv-watchdog.service

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/lyceumtv-backup.service >/dev/null <<EOF
[Unit]
Description=LyceumTV daily Smart Campus backup
After=lyceumtv.service

[Service]
Type=oneshot
User=$USER_NAME
Group=$GROUP_NAME
Environment=LYCEUMTV_BACKUP_KEEP=14
ExecStart=$INSTALL_DIR/scripts/daily_backup.sh
EOF

sudo tee /etc/systemd/system/lyceumtv-backup.timer >/dev/null <<'EOF'
[Unit]
Description=LyceumTV daily backup timer

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=300
Unit=lyceumtv-backup.service

[Install]
WantedBy=timers.target
EOF

sudo tee /etc/systemd/system/lyceumtv-mirror.service >/dev/null <<EOF
[Unit]
Description=LyceumTV Cloud Mirror sync
After=network-online.target lyceumtv.service
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
Group=$GROUP_NAME
ExecStart=$INSTALL_DIR/scripts/cloud_mirror.sh
EOF

sudo tee /etc/systemd/system/lyceumtv-mirror.timer >/dev/null <<'EOF'
[Unit]
Description=LyceumTV Cloud Mirror timer

[Timer]
OnBootSec=120
OnUnitActiveSec=60
Persistent=true
Unit=lyceumtv-mirror.service

[Install]
WantedBy=timers.target
EOF

echo "[6/8] Confirming keyring-free headless kiosk boot..."
# prepare-keyring-free-kiosk.sh already masks Desktop/Login Manager and sets
# multi-user.target. Do not stop the current desktop session mid-install;
# the next reboot enters Cage + Chromium directly.
CMDLINE=""
if [[ -f /boot/firmware/cmdline.txt ]]; then
  CMDLINE=/boot/firmware/cmdline.txt
elif [[ -f /boot/cmdline.txt ]]; then
  CMDLINE=/boot/cmdline.txt
fi
if [[ -n "$CMDLINE" ]]; then
  sudo grep -q 'consoleblank=0' "$CMDLINE" || sudo sed -i '1 s/$/ consoleblank=0/' "$CMDLINE"
  sudo grep -q 'vt.global_cursor_default=0' "$CMDLINE" || sudo sed -i '1 s/$/ vt.global_cursor_default=0/' "$CMDLINE"
fi

# Pi 4: keep KMS acceleration and cap the primary HDMI output at Full HD.
# No gpu_mem/overclock/legacy FKMS tweaks are needed.
sudo python3 "$INSTALL_DIR/scripts/configure-rpi4-display.py" "$CMDLINE"

echo "[7/8] Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable lyceumtv.service
sudo systemctl restart lyceumtv.service
sudo systemctl enable lyceumtv-kiosk.service
sudo systemctl enable --now lyceumtv-watchdog.timer
sudo systemctl enable --now lyceumtv-backup.timer
sudo systemctl enable --now lyceumtv-mirror.timer

echo "[8/8] Health check..."
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8080/api/health; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" != 1 ]]; then
  sudo journalctl -u lyceumtv -n 60 --no-pager
  echo "Backend failed readiness check; installation is incomplete." >&2
  exit 1
fi

echo
echo "LyceumTV 3.4.1 installed."
echo "TV:    http://127.0.0.1:8080/"
echo "Admin:   http://$(hostname -I | awk '{print $1}'):8080/admin"
echo "Ops:     http://$(hostname -I | awk '{print $1}'):8080/ops"
echo "Teacher: http://$(hostname -I | awk '{print $1}'):8080/teacher"
echo "Campus:  http://$(hostname -I | awk '{print $1}'):8080/campus/"
echo "The next reboot starts directly into Cage + Chromium, without Desktop or Default Keyring prompt."
echo
echo "Reboot:"
echo "  sudo reboot"
echo
echo "Status after reboot:"
echo "  systemctl status lyceumtv --no-pager"
echo "  systemctl status lyceumtv-kiosk --no-pager"
echo "  systemctl status lyceumtv-watchdog.timer --no-pager"
