#!/usr/bin/env python3
"""Set primary HDMI to Full HD; preserve all other kernel arguments."""
from pathlib import Path
import sys

MODE = "video=HDMI-A-1:1920x1080@60"


def configure(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    lines = original.strip().splitlines()
    if len(lines) != 1 or not lines[0].strip():
        raise ValueError("Expected a nonempty single-line Raspberry Pi kernel cmdline")
    tokens = lines[0].split()
    updated = [t for t in tokens if not t.startswith("video=HDMI-A-1:")]
    updated.append(MODE)
    text = " ".join(updated) + "\n"
    if original == text:
        return False
    backup = path.with_name(path.name + ".lyceumtv-rpi4.bak")
    if not backup.exists():
        # Exclusive creation: preserve the first pre-install boot configuration.
        with backup.open("x", encoding="utf-8") as f:
            f.write(original)
    # Boot files can be on FAT. Avoid POSIX permission changes.
    temporary = path.with_name(path.name + ".lyceumtv.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2 or not sys.argv[1]:
        raise SystemExit("Cannot locate cmdline.txt; no display changes were applied")
    changed = configure(Path(sys.argv[1]))
    print("Pi 4 primary HDMI: 1920x1080@60; " + ("reboot required" if changed else "already configured"))
