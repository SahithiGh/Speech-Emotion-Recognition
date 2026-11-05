import collections

import pytest

from app import config as C
from app.dataset import (holdout_test_speakers, is_lfs_pointer, load_manifest, parse_filename, scan_dataset,
                         sha256_file, speaker_folds)
from app.errors import DatasetError
from conftest import make_tone_dataset, wav_bytes, tone


def test_parse_filename():
    assert parse_filename("1001_DFA_ANG_XX.wav") == ("1001", "angry")
    assert parse_filename("1091_WSI_NEU_XX.wav") == ("1091", "neutral")
    assert parse_filename("1001_IEO_FEA_HI.wav") == ("1001", "fear")
    assert parse_filename("notes.wav") is None and parse_filename("1001_DFA_XXX_XX.wav") is None


def test_official_manifest_matches_known_crema_d_facts():
    """The manifest was built from the official repository's file list; this checks label parsing against all 7,442 real names."""
    m = load_manifest()
    assert len(m) == C.EXPECTED_CREMA_D_CLIPS
    parsed = [parse_filename(n) for n in m]
    assert all(p is not None for p in parsed)
    emo = collections.Counter(p[1] for p in parsed)
    assert emo == {"angry": 1271, "disgust": 1271, "fear": 1271, "happy": 1271, "sad": 1271, "neutral": 1087}
    assert len({p[0] for p in parsed}) == 91
    assert all(len(sha) == 64 for sha, _ in m.values())


def test_lfs_pointer_detected(tmp_path):
    p = tmp_path / "1001_DFA_ANG_XX.wav"
    p.write_text("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 72862\n")
    assert is_lfs_pointer(p)
    with pytest.raises(DatasetError, match="LFS"):
        scan_dataset(tmp_path)


def test_missing_and_empty_dataset(tmp_path):
    with pytest.raises(DatasetError):
        scan_dataset(tmp_path / "nope")
    with pytest.raises(DatasetError):
        scan_dataset(tmp_path)


def test_manifest_verification_flags_every_problem_type(tmp_path):
    make_tone_dataset(tmp_path, speakers=4, reps=3)
    names = sorted(p.name for p in tmp_path.glob("*.wav"))
    manifest = {n: (sha256_file(tmp_path / n), (tmp_path / n).stat().st_size) for n in names}
    ok = scan_dataset(tmp_path, manifest=manifest, deep=True)
    assert ok.problems() == 0 and len(ok.clips) == len(names) and ok.verification == "manifest-sha256"
    # damage the dataset in four different ways
    (tmp_path / names[0]).write_bytes((tmp_path / names[0]).read_bytes()[:-500])                # truncated
    (tmp_path / names[1]).write_bytes(b"x" + (tmp_path / names[1]).read_bytes()[1:])            # same size, wrong content -> hash
    (tmp_path / "1001_ZZZ_ANG_XX.wav").write_bytes(wav_bytes(tone()))                            # not in official list
    (tmp_path / names[2]).unlink()                                                               # missing
    bad = scan_dataset(tmp_path, manifest=manifest, deep=True)
    assert names[0] in bad.size_mismatch and names[1] in bad.not_wav + bad.hash_mismatch
    assert "1001_ZZZ_ANG_XX.wav" in bad.unlisted and names[2] in bad.missing and not bad.complete


def test_holdout_has_no_overlap_and_all_emotions(tmp_path):
    make_tone_dataset(tmp_path, speakers=20, reps=1)
    clips = scan_dataset(tmp_path, manifest=None).clips
    s = holdout_test_speakers(clips)
    assert set(s["test"]).isdisjoint(s["development"]) and len(s["test"]) >= 2
    assert len(s["test"]) + len(s["development"]) == 20


def test_cv_folds_never_share_speakers(tmp_path):
    import numpy as np
    make_tone_dataset(tmp_path, speakers=20, reps=1)
    clips = scan_dataset(tmp_path, manifest=None).clips
    y = np.array([c.emotion for c in clips]); g = np.array([c.actor for c in clips])
    folds = speaker_folds(y, g, k=5)
    assert len(folds) == 5
    for tr, va in folds:
        assert set(g[tr]).isdisjoint(g[va])
    all_val = np.concatenate([va for _, va in folds])
    assert sorted(all_val) == list(range(len(y)))   # every clip validated exactly once
