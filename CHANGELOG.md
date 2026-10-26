# Pi 4 adaptation (3.4.1)

- Target Raspberry Pi 4 Model B, Raspberry Pi OS 64-bit Bookworm/Trixie.
- Default SSH admin@192.168.2.193; update Mobile/QR defaults.
- Full HD primary HDMI boot profile with backup and repeatability tests.
- Headless audio prerequisites, slower Chromium watchdog grace period.
- Installer readiness, privileged data migration, unique upload staging.
- See docs/RPI4_ADAPTATION.md for tested capabilities and hardware limits.

# 3.4.1

- After-school slideshow now displays only the configured slideshow title and photos.
- Removed after-school announcement panel from slideshow view.
- Removed photo filename/title overlay and photo counter.
- Added `slideshow_title` setting in `/admin`.
- Public `/api/slideshow` no longer exposes per-photo titles.
- Preview page matches production slideshow layout.

# LyceumTV 3.4.0

- Separate after-school info mode until 17:00; emergency modes override it.
- Exclude expired events and label upcoming events with a start time.
- Dynamic lesson duration for progress indicator.
- Pure time and content policy unit tests.
- Live admin preview; watchdog HTML/JS probes.
- Preserves deployment config, schedules, logs, media and runtime state.
- Extracted time display policy into `server/announcement_policy.py`; HTTP router remains in `app.py` (partial architecture refactor).
