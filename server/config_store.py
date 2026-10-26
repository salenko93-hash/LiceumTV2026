from __future__ import annotations
import json
import os
import secrets
import threading
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CONFIG_PATH = DATA / "config.json"
EXAMPLE_PATH = DATA / "config.example.json"
RUNTIME_PATH = DATA / "runtime.json"

class ConfigStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        DATA.mkdir(parents=True, exist_ok=True)
        if not CONFIG_PATH.exists():
            initial = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
            for role in ("admin_key", "dispatcher_key", "teacher_key"):
                initial[role] = secrets.token_urlsafe(32)
            self._atomic_json(CONFIG_PATH, initial, mode=0o600)
            try:
                os.chmod(CONFIG_PATH, 0o600)
            except OSError:
                pass

    def load(self) -> dict[str, Any]:
        with self._lock:
            defaults = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
            release_version = str(defaults.get("version", ""))
            try:
                saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            except Exception:
                saved = {}
            defaults.update(saved if isinstance(saved, dict) else {})
            # The running software version belongs to the release, not to persisted admin settings.
            if release_version:
                defaults["version"] = release_version
            return defaults

    def save(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self.load()
            allowed = set(current.keys()) - {"version"}
            for key, value in patch.items():
                if key in allowed:
                    current[key] = value
            release_version = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8")).get("version")
            if release_version:
                current["version"] = release_version
            self._atomic_json(CONFIG_PATH, current, mode=0o600)
            return current

    def public(self) -> dict[str, Any]:
        cfg = self.load()
        out = dict(cfg)
        out.pop("alerts_token", None)
        out["alerts_token_set"] = bool(str(cfg.get("alerts_token", "")).strip())
        out.pop("telegram_bot_token", None)
        out["telegram_bot_token_set"] = bool(str(cfg.get("telegram_bot_token", "")).strip())
        out.pop("admin_key", None)
        out.pop("dispatcher_key", None)
        out["dispatcher_key_set"] = bool(str(cfg.get("dispatcher_key", "")).strip())
        out.pop("teacher_key", None)
        out["teacher_key_set"] = bool(str(cfg.get("teacher_key", "")).strip())
        out.pop("cloud_mirror_token", None)
        out["cloud_mirror_token_set"] = bool(str(cfg.get("cloud_mirror_token", "")).strip())
        return out

    @staticmethod
    def _atomic_json(path: Path, payload: dict[str, Any], mode: int | None = None) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)
        if mode is not None:
            try:
                os.chmod(path, mode)
            except OSError:
                pass

class RuntimeStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()

    def load(self) -> dict[str, Any]:
        with self._lock:
            try:
                data = json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}

    def save(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self.load()
            current.update(patch)
            ConfigStore._atomic_json(RUNTIME_PATH, current, mode=0o600)
            return current
