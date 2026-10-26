from __future__ import annotations
import hashlib, json, py_compile, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "server"
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
TESTS = ROOT / "tests"

def fail(msg):
    print("FAIL:", msg)
    raise SystemExit(1)

def ok(msg):
    print("PASS:", msg)

def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        fail(f"{path.relative_to(ROOT)}: {e}")

# Core runtime
required = [
    "server/app.py","server/version.py","server/schedule_engine.py",
    "server/academic_cycle.py","server/duty_rotation.py",
    "public/index.html","public/js/app.js","public/css/tv.css",
    "scripts/install.sh","scripts/launch-kiosk.sh","scripts/watchdog.sh",
    "INSTALL_TO_RPI4.ps1",
]
missing=[x for x in required if not (ROOT/x).is_file()]
if missing: fail("missing: "+", ".join(missing))

version=(SERVER/"version.py").read_text(encoding="utf-8-sig")
if 'VERSION = "3.4.1"' not in version: fail("runtime version is not 3.4.1")
ok("runtime version 3.4.1")

# Schedule data: semantic source validation, no hard-coded workbook revision numbers.
names=("schedule_numerator.json","schedule_denominator.json",
       "shelter_numerator.json","shelter_denominator.json")
expected_classes=["10-А","10-Б","10-В","10-Г","11-А","11-Б","11-В","11-Г"]
expected_days=["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"]

for name in names:
    cur=load(DATA/"current"/name)
    default=load(DATA/"default"/name)
    if cur != default: fail(f"current/default mismatch: {name}")
    source=cur.get("source")
    if not isinstance(source,str) or not source.lower().endswith(".xlsx"):
        fail(f"{name}: invalid source metadata: {source!r}")
    bells=cur.get("bellSchedule")
    if not isinstance(bells,list) or len(bells)!=8:
        fail(f"{name}: expected 8 bell periods in this Raspberry branch")
    days=cur.get("days")
    if not isinstance(days,dict) or list(days.keys()) != expected_days:
        fail(f"{name}: unexpected day structure")
    for day in expected_days:
        if list(days[day].keys()) != expected_classes:
            fail(f"{name}: class order mismatch on {day}")
    ok(f"{name}: {source}")

# Manifest integrity
manifest=load(DATA/"current"/"content_manifest.json")
if manifest.get("version")!="2026-10-25-3.4.1-slideshow-title":
    fail("content_manifest version mismatch")
for name,item in manifest.get("schedules",{}).items():
    fp=DATA/"current"/name
    if hashlib.sha256(fp.read_bytes()).hexdigest()!=item.get("sha256"):
        fail(f"SHA-256 mismatch: {name}")
for key in ("calendar","content"):
    item=manifest.get(key,{})
    fp=DATA/"current"/str(item.get("url",""))
    if not fp.is_file() or hashlib.sha256(fp.read_bytes()).hexdigest()!=item.get("sha256"):
        fail(f"SHA-256 mismatch: {key}")
ok("content manifest SHA-256")

# Python syntax
for p in sorted(SERVER.glob("*.py")):
    py_compile.compile(str(p),doraise=True)
ok("server Python syntax")

# Run every shipped test; no references to missing legacy tests.
tests=sorted(TESTS.glob("test_*.py")) if TESTS.is_dir() else []
if not tests:
    fail("no tests/test_*.py shipped")
for test in tests:
    print("RUN :", test.relative_to(ROOT))
    r=subprocess.run([sys.executable,str(test)],cwd=str(ROOT))
    if r.returncode: fail(f"{test.name} failed: {r.returncode}")
    ok(test.name)

# Optional JavaScript syntax if Node is available.
import shutil
node=shutil.which("node")
if node:
    r=subprocess.run([node,"--check",str(PUBLIC/"js/app.js")],capture_output=True,text=True)
    if r.returncode: fail("app.js syntax: "+r.stderr.strip())
    ok("TV JavaScript syntax")
else:
    print("INFO: node not found; JavaScript syntax check skipped")

# 3.4.1 slideshow runtime contract
front=(PUBLIC/"js/app.js").read_text(encoding="utf-8-sig")
smart=(SERVER/"smart_ops.py").read_text(encoding="utf-8-sig")
if "after_school" not in front.lower() or "after_school_slides" not in smart:
    fail("after-school slideshow contract missing")
ok("after-school slideshow runtime present")

# Installer sanity
installer=(ROOT/"INSTALL_TO_RPI4.ps1").read_text(encoding="utf-8-sig")
installsh=(ROOT/"scripts/install.sh").read_text(encoding="utf-8-sig")
for token in ("server","public","data","scripts"):
    if token not in installer: fail(f"installer missing {token}")
for token in ("lyceumtv.service","lyceumtv-kiosk.service","lyceumtv-watchdog.timer"):
    if token not in installsh: fail(f"install.sh missing {token}")
ok("Raspberry Pi 4 deployment scripts")

# 3.4.1 slideshow UI policy.
tv_html=(PUBLIC/"index.html").read_text(encoding="utf-8-sig")
slide_js=(PUBLIC/"js/slideshow.js").read_text(encoding="utf-8-sig")
admin_html=(PUBLIC/"admin.html").read_text(encoding="utf-8-sig")
if 'id="slideshowTitle"' not in tv_html: fail("slideshow title element missing")
for forbidden in ('afterSchoolAnnouncement','afterSchoolPhotoTitle','afterSchoolPhotoCount'):
    if forbidden in tv_html or forbidden in slide_js:
        fail(f"slideshow UI still exposes {forbidden}")
if 'name="slideshow_title"' not in admin_html: fail("admin slideshow_title setting missing")
ok("slideshow UI: title + photos only; no announcement, filename or photo counter")

print()
print("VERIFY SUCCESSFUL")
