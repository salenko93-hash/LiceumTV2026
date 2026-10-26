#!/usr/bin/env bash
set -Eeuo pipefail

SCREEN_ID="${LYCEUMTV_SCREEN_ID:-main-hall}"
URL="${LYCEUMTV_URL:-http://127.0.0.1:8080/?screen=$SCREEN_ID}"

# IMPORTANT: this profile is intentionally separate from old Chromium/Desktop
# profiles that may have been encrypted using GNOME/Default Keyring.
PROFILE_DIR="${HOME}/.config/lyceumtv-kiosk-chromium"
mkdir -p "$PROFILE_DIR"
chmod 700 "$PROFILE_DIR" 2>/dev/null || true

# A hard power-off can leave Chromium singleton locks. They are safe to
# remove before this dedicated single-browser kiosk starts.
rm -f \
  "$PROFILE_DIR/SingletonLock" \
  "$PROFILE_DIR/SingletonCookie" \
  "$PROFILE_DIR/SingletonSocket" 2>/dev/null || true

healthy=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 1 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" != 1 ]]; then
  echo "Backend not ready after 90 attempts" >&2
  exit 1
fi

# Check the primary display connection and report cable issues.
# The installer sets the primary HDMI kernel mode to Full HD for Pi 4.
CONNECTOR="${LYCEUMTV_HDMI_CONNECTOR:-HDMI-A-1}"
for status in /sys/class/drm/*-"$CONNECTOR"/status; do
  [[ -f "$status" ]] || continue
  if [[ "$(cat "$status")" != connected ]]; then
    echo "Warning: $CONNECTOR is not connected; check the micro-HDMI cable." >&2
  fi
done

BROWSER=""
for b in chromium chromium-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    BROWSER="$(command -v "$b")"
    break
  fi
done

if [[ -z "$BROWSER" ]]; then
  echo "Chromium not found" >&2
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export LIBSEAT_BACKEND=logind

# --password-store=basic is the key setting: Chromium does not request
# GNOME/Default Keyring for password encryption. LyceumTV does not save
# browser passwords, so the basic store has no useful secrets to protect.
exec /usr/bin/cage -s -- "$BROWSER" \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  --force-device-scale-factor=1 \
  --force-color-profile=srgb \
  --kiosk \
  --window-size=1920,1080 \
  --start-fullscreen \
  --no-first-run \
  --no-default-browser-check \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --password-store=basic \
  --disable-sync \
  --disable-save-password-bubble \
  --disable-features=Translate,TranslateUI,MediaRouter,PasswordManagerOnboarding,AutofillServerCommunication \
  --disable-translate \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --lang=uk-UA \
  "$URL"
