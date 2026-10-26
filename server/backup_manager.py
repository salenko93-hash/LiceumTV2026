from __future__ import annotations
import json
import os
import shutil
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BACKUP_DIR = DATA / "backups"
INCLUDE = [
    "data/config.json",
    "data/runtime.json",
    "data/control.json",
    "data/calendar_override.json",
    "data/bells_override.json",
    "data/screens.json",
    "data/smart_ops.json",
    "data/imports/history",
    "data/current",
    "data/default",
    "public/media",
]

def list_backups() -> list[dict[str, Any]]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for p in sorted(BACKUP_DIR.glob("lyceumtv-backup-*.tar.gz"), reverse=True):
        try:
            st = p.stat()
            out.append({"name":p.name,"size":st.st_size,"mtime":int(st.st_mtime)})
        except OSError:
            pass
    return out

def create_backup(label: str = "", keep_count: int = 14) -> dict[str, Any]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_label = "".join(c for c in str(label or "") if c.isalnum() or c in "-_")[:32]
    suffix = f"-{safe_label}" if safe_label else ""
    path = BACKUP_DIR / f"lyceumtv-backup-{stamp}{suffix}.tar.gz"
    with tarfile.open(path, "w:gz") as tf:
        for rel in INCLUDE:
            p = ROOT / rel
            if p.exists():
                tf.add(p, arcname=rel, recursive=True)
        meta = {
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "version": _version(),
        }
        raw = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")
        info = tarfile.TarInfo("backup_meta.json")
        info.size = len(raw)
        info.mtime = int(datetime.now().timestamp())
        import io
        tf.addfile(info, io.BytesIO(raw))
    st = path.stat()
    keep_count = max(1, min(100, int(keep_count or 14)))
    items = list_backups()
    for old in items[keep_count:]:
        try:
            (BACKUP_DIR / old["name"]).unlink()
        except OSError:
            pass
    return {"name":path.name,"size":st.st_size,"mtime":int(st.st_mtime)}

def _version() -> str:
    try:
        return str(json.loads((DATA/"config.example.json").read_text(encoding="utf-8")).get("version",""))
    except Exception:
        return ""

def _safe_member(name: str) -> bool:
    p = Path(name)
    return not p.is_absolute() and ".." not in p.parts

def restore_backup(name: str) -> dict[str, Any]:
    name = Path(str(name or "")).name
    path = BACKUP_DIR / name
    if not path.is_file():
        raise FileNotFoundError("Backup не знайдено")
    with tempfile.TemporaryDirectory(prefix="lyceumtv-restore-") as tmp:
        tmp_path = Path(tmp)
        with tarfile.open(path, "r:gz") as tf:
            members = tf.getmembers()
            for m in members:
                if not _safe_member(m.name):
                    raise ValueError("Небезпечний шлях у backup")
            tf.extractall(tmp_path, members=members)
        # Restore only known locations. Backups/logs are intentionally not replaced.
        for rel in INCLUDE:
            src = tmp_path / rel
            dst = ROOT / rel
            if not src.exists():
                continue
            if src.is_dir():
                stage = dst.with_name(dst.name + ".restore")
                if stage.exists():
                    shutil.rmtree(stage)
                shutil.copytree(src, stage)
                if dst.exists():
                    if dst.is_dir():
                        shutil.rmtree(dst)
                    else:
                        dst.unlink()
                os.replace(stage, dst)
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                stage = dst.with_suffix(dst.suffix + ".restore")
                shutil.copy2(src, stage)
                os.replace(stage, dst)
    return {"name":name,"message":"Backup відновлено"}

def delete_backup(name: str) -> bool:
    name = Path(str(name or "")).name
    path = BACKUP_DIR / name
    if path.is_file():
        path.unlink()
        return True
    return False
