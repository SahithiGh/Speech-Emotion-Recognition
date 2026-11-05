"""Verify data/AudioWAV against the official CREMA-D file list.
Usage:  python scripts/check_dataset.py [--deep]     (--deep also checks the SHA-256 of every file; reads ~600 MB)"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config as C  # noqa: E402
from app.dataset import scan_dataset  # noqa: E402
from app.errors import DatasetError  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--deep", action="store_true")
args = ap.parse_args()
try:
    r = scan_dataset(C.DATA_DIR, deep=args.deep)
except DatasetError as exc:
    print(f"PROBLEM: {exc}")
    sys.exit(1)
print(r.summary())
emo = Counter(c.emotion for c in r.clips)
for e in C.EMOTIONS:
    print(f"  {e:8s} {emo.get(e, 0)}")
try:
    import soundfile as sf
    rates, secs = Counter(), []
    for c in r.clips:
        i = sf.info(str(c.path))
        rates[(i.samplerate, i.channels)] += 1
        secs.append(i.duration)
    print(f"  audio formats (sample rate, channels): {dict(rates)}; duration {min(secs):.1f}-{max(secs):.1f} s")
except Exception as exc:  # soundfile missing or a header problem
    print(f"  (could not read audio headers: {exc})")
for label, items in (("Git LFS placeholders", r.lfs_pointers), ("wrong size", r.size_mismatch), ("wrong SHA-256", r.hash_mismatch),
                     ("not WAV", r.not_wav), ("not in the CREMA-D list", r.unlisted), ("missing", r.missing)):
    if items:
        print(f"PROBLEM: {len(items)} files {label}, e.g. {items[:3]}")
C.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
C.DATASET_REPORT_PATH.write_text(json.dumps({"verification": r.verification, "clips": len(r.clips), "complete": r.complete,
                                             "problems": r.problems(), "speakers": len({c.actor for c in r.clips})}, indent=2))
if r.complete:
    print(f"RESULT: complete and verified ({r.verification}). You can run train_model.bat.")
    sys.exit(0)
print("RESULT: NOT complete. Run download_dataset.bat again (it resumes and repairs).")
sys.exit(1)
