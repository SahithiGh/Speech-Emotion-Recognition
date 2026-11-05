"""Finding, verifying and splitting the CREMA-D WAV files."""
import csv
import gzip
import hashlib
import random
from dataclasses import dataclass, field
from pathlib import Path

from sklearn.model_selection import StratifiedGroupKFold

from . import config as C
from .errors import DatasetError


@dataclass
class Clip:
    path: Path
    actor: str
    emotion: str


@dataclass
class DatasetReport:
    clips: list = field(default_factory=list)
    lfs_pointers: list = field(default_factory=list)
    bad_names: list = field(default_factory=list)
    unlisted: list = field(default_factory=list)       # not part of the official CREMA-D file list
    size_mismatch: list = field(default_factory=list)  # wrong size: truncated or corrupted download
    hash_mismatch: list = field(default_factory=list)  # wrong SHA-256 (only with deep verification)
    not_wav: list = field(default_factory=list)
    missing: list = field(default_factory=list)        # in the official list but not on disk
    verification: str = "none"                          # none | manifest-size | manifest-sha256

    def problems(self) -> int:
        return sum(len(x) for x in (self.lfs_pointers, self.bad_names, self.unlisted, self.size_mismatch,
                                    self.hash_mismatch, self.not_wav, self.missing))

    @property
    def complete(self) -> bool:
        return self.verification != "none" and self.problems() == 0 and len(self.clips) == C.EXPECTED_CREMA_D_CLIPS

    def summary(self) -> str:
        actors = len({c.actor for c in self.clips})
        return (f"{len(self.clips)} verified clips from {actors} speakers [{self.verification}] | problems: "
                f"{len(self.lfs_pointers)} LFS placeholders, {len(self.size_mismatch)} wrong size, {len(self.hash_mismatch)} wrong hash, "
                f"{len(self.not_wav)} not WAV, {len(self.unlisted)} not in CREMA-D list, {len(self.bad_names)} bad names, "
                f"{len(self.missing)} missing")


def parse_filename(name: str):
    """'1001_DFA_ANG_XX.wav' -> ('1001', 'angry'). Returns None if the name is not CREMA-D style."""
    parts = Path(name).stem.split("_")
    if len(parts) != 4 or not parts[0].isdigit() or parts[2] not in C.CODE_TO_EMOTION:
        return None
    return parts[0], C.CODE_TO_EMOTION[parts[2]]


def is_lfs_pointer(path: Path) -> bool:
    """Git LFS placeholders are ~130-byte text files that start with 'version https://git-lfs'."""
    try:
        if path.stat().st_size > 1024:
            return False
        with open(path, "rb") as f:
            return f.read(40).startswith(b"version https://git-lfs")
    except OSError:
        return False


def load_manifest(path: Path = C.MANIFEST_PATH) -> dict:
    """Official CREMA-D file list: {file name: (sha256, size)}."""
    out = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for row in csv.reader(line for line in f if not line.startswith("#")):
            out[row[0]] = (row[1], int(row[2]))
    return out


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def scan_dataset(data_dir: Path = C.DATA_DIR, manifest="default", deep: bool = False) -> DatasetReport:
    """Inspect data_dir. manifest="default" checks every file against the official list (names and sizes,
    plus SHA-256 when deep=True); manifest=None skips that check (software tests only)."""
    data_dir = Path(data_dir)
    if not data_dir.is_dir():
        raise DatasetError(f"Dataset folder not found: {data_dir}\nRun download_dataset.bat or see data/README.md.")
    if manifest == "default":
        manifest = load_manifest()
    files = sorted({p for p in list(data_dir.glob("*.wav")) + list(data_dir.glob("*.WAV"))})
    if not files:
        raise DatasetError(f"No .wav files found in {data_dir}\nRun download_dataset.bat or see data/README.md.")
    report = DatasetReport(verification="none" if manifest is None else ("manifest-sha256" if deep else "manifest-size"))
    for p in files:
        if is_lfs_pointer(p):
            report.lfs_pointers.append(p.name)
            continue
        parsed = parse_filename(p.name)
        if parsed is None:
            report.bad_names.append(p.name)
            continue
        size = p.stat().st_size
        if manifest is not None:
            if p.name not in manifest:
                report.unlisted.append(p.name)
                continue
            if size != manifest[p.name][1]:
                report.size_mismatch.append(p.name)
                continue
        elif size < 2048:
            report.size_mismatch.append(p.name)
            continue
        with open(p, "rb") as f:
            head = f.read(12)
        if head[:4] != b"RIFF" or head[8:12] != b"WAVE":
            report.not_wav.append(p.name)
            continue
        if manifest is not None and deep and sha256_file(p) != manifest[p.name][0]:
            report.hash_mismatch.append(p.name)
            continue
        report.clips.append(Clip(p, parsed[0], parsed[1]))
    if manifest is not None:
        present = {p.name for p in files}
        report.missing = sorted(set(manifest) - present)
    if report.lfs_pointers and not report.clips:
        raise DatasetError(
            f"All {len(report.lfs_pointers)} files are Git LFS placeholders, not real audio.\n"
            "Run download_dataset.bat, which downloads and verifies the real audio without needing Git LFS.")
    if len(report.clips) < 60:
        raise DatasetError(f"Only {len(report.clips)} valid clips found; the full CREMA-D set has {C.EXPECTED_CREMA_D_CLIPS}.")
    return report


def dataset_fingerprint(clips) -> str:
    """Short hash of the exact files used, recorded with the results."""
    h = hashlib.sha256()
    for c in sorted(clips, key=lambda c: c.path.name):
        h.update(f"{c.path.name}:{c.path.stat().st_size}\n".encode())
    return h.hexdigest()[:16]


def holdout_test_speakers(clips, seed: int = C.RANDOM_SEED, fraction: float = C.TEST_SPEAKER_FRACTION) -> dict:
    """Choose test speakers. They are never used for training or model selection.
    Every emotion must be present in both the test speakers and the remaining development speakers."""
    emotions_of = {}
    for c in clips:
        emotions_of.setdefault(c.actor, set()).add(c.emotion)
    actors = sorted(emotions_of)
    if len(actors) < 8:
        raise DatasetError("Need at least 8 different speakers for a speaker-independent evaluation.")
    all_emotions = {c.emotion for c in clips}
    n_test = max(2, round(len(actors) * fraction))
    for attempt in range(500):
        rng = random.Random(seed + attempt)
        order = actors[:]
        rng.shuffle(order)
        test, dev = order[:n_test], order[n_test:]
        if all(set().union(*(emotions_of[a] for a in grp)) == all_emotions for grp in (test, dev)):
            return {"test": sorted(test), "development": sorted(dev)}
    raise DatasetError("Could not find a speaker split in which every emotion appears in both parts.")


def speaker_folds(y, groups, k: int = C.CV_FOLDS, seed: int = C.RANDOM_SEED):
    """Stratified, speaker-grouped K-fold indices: a speaker is never in training and validation of the same fold."""
    n_speakers = len(set(groups))
    k = max(2, min(k, n_speakers))
    return list(StratifiedGroupKFold(n_splits=k, shuffle=True, random_state=seed).split(y, y, groups))
