"""Builds the (clips x features) table for the dataset, with a checkpointed cache so work is never repeated."""
import os

import numpy as np
from joblib import Parallel, delayed

from . import config as C
from .audio import extract_features, load_audio_file
from .errors import AudioError


def default_jobs() -> int:
    """Use at most 4 cores: enough for speed, gentle on a laptop's memory and temperature."""
    return max(1, min(4, (os.cpu_count() or 2) - 1))


def _one(path_str: str):
    try:
        return path_str, extract_features(load_audio_file(path_str)), None
    except AudioError as exc:
        return path_str, None, str(exc)
    except Exception as exc:  # one bad file must not stop a whole run
        return path_str, None, f"{type(exc).__name__}: {exc}"


def _load_cache() -> dict:
    """{file name: (size, vector)}. Ignored if the feature version changed."""
    if not C.FEATURE_CACHE_PATH.exists():
        return {}
    try:
        z = np.load(C.FEATURE_CACHE_PATH, allow_pickle=False)
        if int(z["version"]) != C.FEATURE_VERSION:
            return {}
        return {n: (int(s), v) for n, s, v in zip(z["names"].tolist(), z["sizes"], z["X"])}
    except Exception:
        return {}


def _save_cache(cache: dict):
    C.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    names = list(cache)
    tmp = C.FEATURE_CACHE_PATH.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, names=np.array(names), sizes=np.array([cache[n][0] for n in names]),
                        X=np.stack([cache[n][1] for n in names]), version=np.array(C.FEATURE_VERSION))
    os.replace(tmp, C.FEATURE_CACHE_PATH)


def build_feature_table(clips, jobs: int | None = None, use_cache: bool = True):
    """Return (X, kept_clips, skipped); skipped is a list of (file name, reason). The cache is saved after every chunk."""
    jobs = jobs or default_jobs()
    cache = _load_cache() if use_cache else {}
    todo = [c for c in clips if c.path.name not in cache or cache[c.path.name][0] != c.path.stat().st_size]
    skipped = []
    if todo:
        print(f"Extracting features for {len(todo)} clips ({len(clips) - len(todo)} reused from cache, {jobs} worker(s))...")
        step = 400
        for i in range(0, len(todo), step):
            chunk = todo[i:i + step]
            for c, (_, vec, err) in zip(chunk, Parallel(n_jobs=jobs)(delayed(_one)(str(c.path)) for c in chunk)):
                if vec is None:
                    skipped.append((c.path.name, err))
                else:
                    cache[c.path.name] = (c.path.stat().st_size, vec)
            _save_cache(cache)   # checkpoint: an interrupted run resumes here
            print(f"  {min(i + step, len(todo))}/{len(todo)}")
    else:
        print(f"All {len(clips)} clips found in feature cache.")
    kept = [c for c in clips if c.path.name in cache]
    X = np.stack([cache[c.path.name][1] for c in kept]) if kept else np.empty((0, 0))
    return X, kept, skipped
