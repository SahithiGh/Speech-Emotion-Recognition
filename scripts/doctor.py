"""Checks the installation and explains what to do next.   Usage:  python scripts/doctor.py"""
import importlib
import json
import shutil
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
ok = True


def line(good, text, fix=""):
    global ok
    ok &= bool(good)
    print(("[ OK ] " if good else "[FIX ] ") + text + (f"\n         -> {fix}" if fix and not good else ""))


v = sys.version_info
line((3, 10) <= v[:2] <= (3, 13), f"Python {v.major}.{v.minor}.{v.micro}", "Install Python 3.11 or 3.12 from python.org")
for mod in ("fastapi", "uvicorn", "multipart", "numpy", "scipy", "sklearn", "librosa", "soundfile", "joblib"):
    try:
        m = importlib.import_module(mod)
        line(True, f"package {mod} {getattr(m, '__version__', '')}")
    except Exception:
        line(False, f"package {mod} is missing", "Run setup_windows.bat")
node = shutil.which("node")
if node:
    line(True, "Node.js " + subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip())
else:
    line(False, "Node.js not found", "Install the LTS version from nodejs.org")
line((ROOT / "frontend" / "node_modules").is_dir(), "website packages installed", "Run setup_windows.bat")
try:
    from app import config as C
    from app.dataset import scan_dataset
    r = scan_dataset(C.DATA_DIR)
    line(r.complete, f"dataset: {r.summary()}", "Run download_dataset.bat")
except Exception as exc:
    line(False, f"dataset: {str(exc).splitlines()[0]}", "Run download_dataset.bat")
try:
    from app import config as C
    m = json.loads(C.METRICS_PATH.read_text()) if C.METRICS_PATH.exists() else None
    line(C.MODEL_PATH.exists() and bool(m), "trained model and metrics found" if m else "model not trained yet", "Run train_model.bat")
except Exception:
    line(False, "model files unreadable", "Run train_model.bat")
for port in (8000, 5173):
    with socket.socket() as s:
        free = s.connect_ex(("127.0.0.1", port)) != 0
    print(f"[info] port {port} is {'free' if free else 'in use (the app may already be running; stop_project.bat stops it)'}")
free_gb = shutil.disk_usage(ROOT).free / 1e9
line(free_gb > 1.0, f"free disk space {free_gb:.1f} GB", "Free some disk space (dataset needs ~0.6 GB)")
print("\nAll checks passed." if ok else "\nSome items need attention (see [FIX ] lines).")
sys.exit(0 if ok else 1)
