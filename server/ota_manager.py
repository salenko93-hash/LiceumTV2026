from __future__ import annotations
import hashlib
import json
import os
import shutil
import ssl
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

PRESERVE_PREFIXES = (
    "data/config.json",
    "data/runtime.json",
    "data/control.json",
    "data/calendar_override.json",
    "data/bells_override.json",
    "data/screens.json",
    "data/smart_ops.json",
    "public/media/",
    "data/imports/",
    "data/current/",
    "data/previous/",
    "data/backups/",
    "data/logs/",
    "data/release_backups/",
)

def _https(url: str) -> str:
    url = str(url or "").strip()
    if not url.startswith("https://"):
        raise ValueError("OTA URL має бути HTTPS")
    return url

def _download(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(_https(url), headers={"User-Agent":"LyceumTV-RPi/3.3"})
    with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
        code = getattr(r, "status", 200)
        if code < 200 or code >= 300:
            raise RuntimeError(f"HTTP {code}")
        return r.read()

def current_version() -> str:
    try:
        return str(json.loads((DATA/"config.example.json").read_text(encoding="utf-8")).get("version",""))
    except Exception:
        return ""

def version_tuple(value: str) -> tuple[int, ...]:
    parts = []
    for p in str(value or "").split("."):
        try:
            parts.append(int(p))
        except Exception:
            break
    return tuple(parts)

def check_manifest(url: str) -> dict[str, Any]:
    if not str(url or "").strip():
        return {"ok":False,"configured":False,"message":"OTA manifest URL не налаштовано","current":current_version()}
    raw = _download(url)
    obj = json.loads(raw.decode("utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("OTA manifest має бути JSON object")
    version = str(obj.get("version","")).strip()
    package_url = str(obj.get("package_url","")).strip()
    sha256 = str(obj.get("sha256","")).strip().lower()
    if not version or not package_url or len(sha256) != 64:
        raise ValueError("OTA manifest: потрібні version, package_url, sha256")
    _https(package_url)
    available = version_tuple(version) > version_tuple(current_version())
    return {
        "ok":True,
        "configured":True,
        "current":current_version(),
        "version":version,
        "available":available,
        "package_url":package_url,
        "sha256":sha256,
        "notes":str(obj.get("notes","")),
    }

def _safe_zip_member(name: str) -> bool:
    p = Path(name)
    return not p.is_absolute() and ".." not in p.parts

def apply_package(package_url: str, expected_sha256: str) -> dict[str, Any]:
    raw = _download(package_url, timeout=90)
    digest = hashlib.sha256(raw).hexdigest()
    if digest.lower() != str(expected_sha256 or "").strip().lower():
        raise ValueError("OTA SHA-256 mismatch")

    with tempfile.TemporaryDirectory(prefix="lyceumtv-ota-") as td:
        td_path = Path(td)
        archive = td_path / "update.zip"
        archive.write_bytes(raw)
        extract = td_path / "extract"
        extract.mkdir()
        with zipfile.ZipFile(archive) as zf:
            for info in zf.infolist():
                if not _safe_zip_member(info.filename):
                    raise ValueError("Небезпечний шлях у OTA ZIP")
            zf.extractall(extract)

        candidates = []
        if (extract/"server/app.py").is_file():
            candidates.append(extract)
        for child in extract.iterdir():
            if child.is_dir() and (child/"server/app.py").is_file():
                candidates.append(child)
        if len(candidates) != 1:
            raise ValueError("OTA ZIP повинен містити один LyceumTV project")
        source = candidates[0]

        # Copy release files while preserving live settings/content/logs/backups.
        for p in source.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(source).as_posix()
            if any(rel == x.rstrip("/") or rel.startswith(x) for x in PRESERVE_PREFIXES):
                continue
            if rel.startswith(".git/") or rel == ".git":
                continue
            dest = ROOT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            stage = dest.with_suffix(dest.suffix + ".ota")
            shutil.copy2(p, stage)
            os.replace(stage, dest)

        scripts_dir = ROOT / "scripts"
        if scripts_dir.is_dir():
            for sh in scripts_dir.glob("*.sh"):
                try:
                    sh.chmod(sh.stat().st_mode | 0o111)
                except OSError:
                    pass

    return {"ok":True,"message":"OTA package застосовано; LyceumTV перезапуститься","sha256":digest}
