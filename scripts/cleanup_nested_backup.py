"""Safely inspect and unwind the recursive models/backup_baseline directory tree.

Usage:
    python scripts/cleanup_nested_backup.py             # Dry-run inspection (safe, default)
    python scripts/cleanup_nested_backup.py --execute   # Perform actual safe bottom-up removal
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure backend package is importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.fs_utils import (
    inspect_nested_directory,
    safe_unwind_nested_empty_directory,
    resolve_safe_path,
)

MODELS_DIR = ROOT / "models"
TARGET_NAME = "backup_baseline"
TARGET_DIR = MODELS_DIR / TARGET_NAME

REQUIRED_MODEL_FILES = [
    "emotion_model.joblib",
    "preprocessing_config.json",
    "README.md",
]


def verify_active_models_intact() -> bool:
    """Ensure active model artifacts in models/ are present and untouched."""
    all_ok = True
    print("Verifying active model artifacts in models/:")
    for fname in REQUIRED_MODEL_FILES:
        fpath = MODELS_DIR / fname
        if fpath.exists() and fpath.is_file() and fpath.stat().st_size > 0:
            print(f"  [PRESERVED] {fname} ({fpath.stat().st_size} bytes)")
        else:
            print(f"  [MISSING/DAMAGED] {fname}!")
            all_ok = False
    return all_ok


def main():
    parser = argparse.ArgumentParser(
        description="Safely inspect and clean up the recursive models/backup_baseline directory."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform the removal. If not passed, runs in dry-run inspection mode.",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("RECURSIVE DIRECTORY CLEANUP AUDIT")
    print("=" * 70)
    print(f"Target directory: {TARGET_DIR}")
    print(f"Mode: {'EXECUTE (LIVE REMOVAL)' if args.execute else 'DRY-RUN (INSPECTION ONLY)'}")
    print("-" * 70)

    # 1. Verify required model files are safe
    if not verify_active_models_intact():
        print("\n[ABORT] Active model artifacts missing or damaged. Stopping to prevent data loss.")
        return 1

    # 2. Check target existence
    if not TARGET_DIR.exists():
        print(f"\n[INFO] Target directory does not exist: {TARGET_DIR}")
        print("Nothing to clean up.")
        return 0

    # 3. Non-recursive iterative inspection
    print("\nInspecting nested directory hierarchy (iterative, non-recursive)...")
    inspection = inspect_nested_directory(MODELS_DIR, TARGET_NAME)

    depth = inspection["depth"]
    files = inspection["files"]
    print(f"Total nesting depth: {depth} levels of '{TARGET_NAME}'")
    print(f"Files found inside: {len(files)}")

    if files:
        print("\n[WARNING] Discovered files inside nested hierarchy:")
        for f in files[:10]:
            print(f"  Level {f['depth']}: {f['name']} ({f['size']} bytes)")
        if len(files) > 10:
            print(f"  ... and {len(files) - 10} more files.")
        print("[REFUSAL] Refusing to remove because non-empty files exist in the tree.")
        return 1

    print("Inspection confirmed: The nested tree contains ONLY empty directory levels. No user files.")

    # 4. Cleanup operation
    if not args.execute:
        print("\n" + "=" * 70)
        print("DRY RUN COMPLETE: No filesystem changes were made.")
        print(f"To remove the {depth} empty recursive levels safely without stack overflow, run:")
        print("    python scripts/cleanup_nested_backup.py --execute")
        print("=" * 70)
        return 0

    print("\nExecuting safe bottom-up unwinding (iterative leaf removal)...")
    result = safe_unwind_nested_empty_directory(
        parent_dir=MODELS_DIR,
        folder_name=TARGET_NAME,
        dry_run=False,
    )

    if result["success"]:
        print(f"\n[SUCCESS] Safely removed {result['depth_removed']} nested levels.")
        print(f"Verification: {TARGET_DIR.exists()=}")
        print("\nRe-verifying active model artifacts:")
        verify_active_models_intact()
        return 0
    else:
        print(f"\n[ERROR] Cleanup encountered an error: {result.get('error')}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

