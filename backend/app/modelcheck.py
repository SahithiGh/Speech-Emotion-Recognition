"""Decides whether a saved model file can be trusted by the current inference code."""
import hashlib

import numpy as np

from . import config as C
from .audio import N_FEATURES
from .errors import ModelNotTrainedError


def validate_bundle(bundle) -> None:
    """Raises ModelNotTrainedError('incompatible: ...') unless the artifact matches this code's expectations."""
    def bad(why):
        raise ModelNotTrainedError(f"incompatible: {why}")
    if not isinstance(bundle, dict) or not {"pipeline", "labels", "preprocessing"} <= set(bundle):
        bad("the file does not look like a model made by train.py")
    pre = bundle["preprocessing"]
    n_feats = pre.get("n_features")
    if n_feats == 768:
        if pre.get("sample_rate") != C.SAMPLE_RATE:
            bad("its sample rate differs from emotion2vec+ (expected 16 kHz)")
    elif n_feats == N_FEATURES:
        if pre.get("feature_version") != C.FEATURE_VERSION:
            bad("it was made with an older feature set")
        if pre.get("sample_rate") != C.SAMPLE_RATE:
            bad("its feature size or sample rate differs from this code")
    else:
        bad(f"unsupported feature size: {n_feats} (expected {N_FEATURES} or 768)")
    if sorted(bundle["labels"]) != C.EMOTIONS:
        bad("its emotion classes differ from the six supported classes")
    pipe = bundle["pipeline"]
    if not hasattr(pipe, "predict_proba"):
        bad("it cannot produce class scores")
    try:                       # smoke test with a neutral input: shape and classes must work end to end
        exp_feats = 768 if n_feats == 768 else N_FEATURES
        out = pipe.predict_proba(np.zeros((1, exp_feats), dtype=np.float32))
        if out.shape != (1, len(C.EMOTIONS)) or sorted(pipe.classes_) != C.EMOTIONS:
            bad("its output does not match the six classes")
    except ModelNotTrainedError:
        raise
    except Exception as exc:
        bad(f"a test prediction failed ({type(exc).__name__})")


def artifact_id(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:12]
