"""Tests for filesystem safety: path validation, recursion prevention, safe copying, and archive security."""

import io
import os
import tempfile
import zipfile
from pathlib import Path

import pytest

from app.fs_utils import (
    PathSecurityError,
    check_repeated_segments,
    inspect_nested_directory,
    is_descendant_or_same,
    safe_copy_directory,
    safe_extract_zip,
    safe_unwind_nested_empty_directory,
    validate_safe_path,
)
from app.modelio import backup_model, load_model
from app.predict import predict_bytes


def test_is_descendant_or_same(tmp_path):
    root = tmp_path / "models"
    root.mkdir()
    child = root / "backup_baseline"
    child.mkdir()
    grandchild = child / "backup_baseline"
    grandchild.mkdir()
    sibling = tmp_path / "models_backup"
    sibling.mkdir()

    # Exact same dir
    assert is_descendant_or_same(root, root) is True
    # Descendants
    assert is_descendant_or_same(root, child) is True
    assert is_descendant_or_same(root, grandchild) is True
    assert is_descendant_or_same(child, grandchild) is True
    # Non-descendants
    assert is_descendant_or_same(child, root) is False
    assert is_descendant_or_same(root, sibling) is False
    assert is_descendant_or_same(sibling, root) is False


def test_validate_safe_path_limits(tmp_path):
    base = tmp_path / "base"
    base.mkdir()

    # Normal valid path
    valid = base / "valid" / "sub"
    valid.mkdir(parents=True)
    assert validate_safe_path(valid, base_dir=base) == valid.resolve()

    # Path traversal / escape
    outside = tmp_path / "outside"
    outside.mkdir()
    with pytest.raises(PathSecurityError, match="escapes base directory"):
        validate_safe_path(outside, base_dir=base)

    # Excessive depth
    deep = base
    for i in range(12):
        deep = deep / f"level_{i}"
    deep.mkdir(parents=True)
    with pytest.raises(PathSecurityError, match="exceeds safe limit"):
        validate_safe_path(deep, base_dir=base, max_depth=10)

    # Recursive repeated names
    repeats = base / "sub" / "sub" / "sub"
    repeats.mkdir(parents=True)
    with pytest.raises(PathSecurityError, match="suspicious recursive folder repetitions"):
        validate_safe_path(repeats, max_name_repeats=2)


def test_safe_copy_directory_rejects_copy_into_itself(tmp_path):
    src = tmp_path / "models"
    src.mkdir()
    (src / "model.bin").write_text("model data")
    (src / "config.json").write_text("{}")

    # Attempt recursive copy: src into src/backup_baseline
    nested_dst = src / "backup_baseline"
    with pytest.raises(PathSecurityError, match="Cannot copy directory.*into itself or its descendant"):
        safe_copy_directory(src, nested_dst)

    # Verify no nested_dst was created
    assert not nested_dst.exists()

    # Legitimate copy to sibling directory succeeds
    sibling_dst = tmp_path / "models_backup"
    copied = safe_copy_directory(src, sibling_dst)
    assert copied == 2
    assert (sibling_dst / "model.bin").read_text() == "model data"
    assert (sibling_dst / "config.json").read_text() == "{}"


def test_safe_backup_model_refuses_nested_backup(tmp_path, monkeypatch):
    from app import config as C

    models_dir = tmp_path / "models"
    models_dir.mkdir()
    model_file = models_dir / "emotion_model.joblib"
    model_file.write_text("fake joblib")
    config_file = models_dir / "preprocessing_config.json"
    config_file.write_text("{}")
    monkeypatch.setattr(C, "MODEL_PATH", model_file)

    # Attempting to backup into models/backup_baseline must fail
    nested_target = models_dir / "backup_baseline"
    with pytest.raises(PathSecurityError, match="Cannot create backup inside model directory"):
        backup_model(nested_target)

    # Backup to external directory succeeds and is idempotent
    external_target = tmp_path / "external_backup"
    backup_model(external_target)
    assert (external_target / "emotion_model.joblib").exists()

    # Second backup call to external_target is idempotent and does not create sub-nesting
    backup_model(external_target)
    assert not (external_target / "models").exists()
    assert not (external_target / "external_backup").exists()


def test_safe_extract_zip_rejects_malicious_archives(tmp_path):
    target_extract = tmp_path / "extracted"
    target_extract.mkdir()

    # 1. ZipSlip archive
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../../escape.txt", "evil")
    buf.seek(0)
    zip_path = tmp_path / "slip.zip"
    zip_path.write_bytes(buf.getvalue())

    with pytest.raises(PathSecurityError, match="ZipSlip vulnerability detected"):
        safe_extract_zip(zip_path, target_extract)

    # 2. Recursive repeated folder archive
    buf2 = io.BytesIO()
    with zipfile.ZipFile(buf2, "w") as zf:
        zf.writestr("nested/nested/nested/nested/file.txt", "data")
    buf2.seek(0)
    zip_rep = tmp_path / "recursive.zip"
    zip_rep.write_bytes(buf2.getvalue())

    with pytest.raises(PathSecurityError, match="suspicious recursive repetition"):
        safe_extract_zip(zip_rep, target_extract, max_name_repeats=2)


def test_bottom_up_unwinding_and_safety_checks(tmp_path):
    parent = tmp_path / "container"
    parent.mkdir()

    # Build 10 levels of nested empty folders
    curr = parent
    for _ in range(10):
        curr = curr / "loop"
        curr.mkdir()

    # Inspection
    info = inspect_nested_directory(parent, "loop")
    assert info["depth"] == 10
    assert len(info["files"]) == 0

    # Dry-run
    dry_res = safe_unwind_nested_empty_directory(parent, "loop", dry_run=True)
    assert dry_res["success"] is True
    assert dry_res["depth_removed"] == 10
    assert (parent / "loop").exists()  # Intact after dry-run

    # Add a file at depth 5 to test refusal
    f5 = parent / "loop" / "loop" / "loop" / "loop" / "loop" / "important.txt"
    f5.write_text("critical data")

    refuse_res = safe_unwind_nested_empty_directory(parent, "loop", dry_run=False)
    assert refuse_res["success"] is False
    assert "file(s) found" in refuse_res["error"]
    assert f5.exists()  # File was preserved

    # Remove the file and verify live execution cleans up all 10 levels
    f5.unlink()
    live_res = safe_unwind_nested_empty_directory(parent, "loop", dry_run=False)
    assert live_res["success"] is True
    assert live_res["depth_removed"] == 10
    assert not (parent / "loop").exists()


def test_active_model_artifacts_and_inference():
    """Verify that models/emotion_model.joblib is valid and loads properly."""
    from app import config as C

    assert C.MODEL_PATH.exists()
    assert C.CONFIG_PATH.exists()
    assert (C.MODEL_PATH.parent / "README.md").exists()
    assert not (C.MODEL_PATH.parent / "backup_baseline").exists()

    bundle = load_model()
    assert "pipeline" in bundle
    assert "labels" in bundle
    assert len(bundle["labels"]) == 6

    # Test prediction on a synthetic audio signal
    import numpy as np
    import soundfile as sf
    buf = io.BytesIO()
    # 2 seconds of clean 440 Hz tone
    t = np.linspace(0, 2.0, 32000, endpoint=False)
    sig = (np.sin(2 * np.pi * 440 * t) * 0.3).astype(np.float32)
    sf.write(buf, sig, 16000, format="WAV")
    
    res = predict_bytes(buf.getvalue())
    assert "emotion" in res
    assert res["emotion"] in bundle["labels"]
    assert "scores" in res
    assert "confidence" in res

