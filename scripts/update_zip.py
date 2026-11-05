import zipfile
import os
import sys
from pathlib import Path

root = Path(".").resolve()
sys.path.insert(0, str(root / "backend"))

from app.fs_utils import check_repeated_segments, validate_safe_path

zip_path = Path("speech-emotion-recognition.zip")

print("Updating speech-emotion-recognition.zip...")
exclude_dirs = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    "node_modules",
    ".git",
    "models_backup",
    "outputs_backup",
    ".agents",
    "test_frames",
    ".system_generated",
    "backup_baseline",
}
exclude_files = {
    "speech-emotion-recognition.zip",
    "speech-emotion-recognition-original-backup.zip",
    "test_subst_probe.py",
    "test_find_bottom.py",
    "test_remove_leaf.py",
    "test_bottom_up.py",
}

file_count = 0
total_size = 0

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        rel_dir = Path(dirpath).relative_to(root)
        
        # Guard against deeply nested or recursive paths
        if len(rel_dir.parts) > 20:
            print(f"Skipping excessively deep directory: {rel_dir}")
            dirnames.clear()
            continue

        has_repeats, rep = check_repeated_segments(rel_dir)
        if has_repeats:
            print(f"Skipping recursive repeated directory '{rep}': {rel_dir}")
            dirnames.clear()
            continue

        for f in filenames:
            if f in exclude_files or f.endswith(".tmp"):
                continue
            fpath = Path(dirpath) / f
            arcname = fpath.relative_to(root)
            zf.write(fpath, arcname)
            file_count += 1
            total_size += fpath.stat().st_size

print(f"Archive updated successfully: {file_count} files, {total_size / (1024*1024):.1f} MB uncompressed.")
