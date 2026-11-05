"""Prediction module used by the API and the command line."""
import time

import numpy as np

from . import config as C
from .audio import _decode, extract_features, load_audio_bytes, prepare_signal
from .audio_quality import assess_audio_quality
from .denoise import reduce_noise_signal
from .errors import AudioError, ModelNotTrainedError
from .modelcheck import artifact_id
from .modelio import load_metrics, load_model

_cache = {"path": None, "mtime": None, "bundle": None, "id": None, "error": None}


def get_bundle():
    """Return the validated model, reloading automatically if the file or path changed. Raises ModelNotTrainedError."""
    mtime = C.MODEL_PATH.stat().st_mtime if C.MODEL_PATH.exists() else None
    if mtime is None:
        _cache.update(path=None, mtime=None, bundle=None, id=None, error=None)
        raise ModelNotTrainedError("Model not trained yet. Run train_model.bat after downloading CREMA-D.")
    if _cache["path"] != C.MODEL_PATH or _cache["mtime"] != mtime:
        _cache.update(path=C.MODEL_PATH, mtime=mtime, bundle=None, id=None, error=None)
        try:
            _cache.update(bundle=load_model(), id=artifact_id(C.MODEL_PATH))
        except ModelNotTrainedError as exc:
            _cache["error"] = str(exc)
    if _cache["bundle"] is None:
        raise ModelNotTrainedError(_cache["error"] or "The model could not be loaded.")
    return _cache["bundle"]


def classify(text: str) -> str:
    """'incompatible' when a model file exists but cannot be used; otherwise 'missing'."""
    return "incompatible" if any(w in text for w in ("incompatible", "older", "could not be loaded")) else "missing"


def model_state() -> dict:
    """{'state': 'ready' | 'missing' | 'incompatible', 'reason': str | None}"""
    try:
        get_bundle()
        return {"state": "ready", "reason": None}
    except ModelNotTrainedError as exc:
        return {"state": classify(str(exc)), "reason": str(exc)}


def model_is_trained() -> bool:
    return model_state()["state"] == "ready"


def reliability_for(bundle, score: float) -> dict:
    """What validation showed for predictions with a similar top score. Never invented: empty when unavailable."""
    rel = bundle.get("reliability")
    if not rel:
        return {"available": False, "validated_accuracy": None, "samples": 0, "score_range": None, "uncertain": None}
    for b in rel["bins"]:
        if b["low"] <= score < b["high"]:
            enough = b["samples"] >= C.MIN_BIN_SAMPLES and b["accuracy"] is not None
            return {"available": enough, "validated_accuracy": b["accuracy"], "samples": b["samples"], "score_range": [b["low"], min(b["high"], 1.0)],
                    "uncertain": (b["accuracy"] < C.UNCERTAIN_BELOW_ACCURACY) if enough else None}
    return {"available": False, "validated_accuracy": None, "samples": 0, "score_range": None, "uncertain": None}


def check_out_of_distribution(feat: np.ndarray, bundle: dict) -> dict:
    """Evaluate whether an input feature vector substantially deviates from the training distribution.
    
    Uses maximum absolute standardized feature deviation (|z|_max).
    Calibrated at the 99.5th percentile on development speakers (default threshold: 10.12, e2v: 3.83).
    """
    n_feats = feat.shape[0] if hasattr(feat, "shape") else 296
    is_e2v = (n_feats == 768) or (
        C.SER_MODEL_PROFILE in ("production", "default", "emotion2vec_experimental", "e2v", "emotion2vec", "experimental")
        and C.SER_MODEL_PROFILE not in ("staging", "candidate_option2", "svm_rollback", "svm", "baseline")
    )
    threshold = float(getattr(C, "E2V_OOD_Z_THRESHOLD", 3.83)) if is_e2v else C.OOD_Z_THRESHOLD
    if not C.OOD_SAFEGUARD_ENABLED:
        return {"is_ood": False, "max_deviation": 0.0, "threshold": threshold, "warning": None}
    
    pipe = bundle.get("pipeline")
    scaler = pipe.named_steps.get("scale") or pipe.named_steps.get("scaler") if hasattr(pipe, "named_steps") else None
    if scaler is None or not hasattr(scaler, "mean_") or not hasattr(scaler, "scale_"):
        return {"is_ood": False, "max_deviation": 0.0, "threshold": threshold, "warning": None}
    
    std = np.where(scaler.scale_ > 1e-7, scaler.scale_, 1.0)
    z = np.abs((feat - scaler.mean_) / std)
    max_z = float(np.max(z))
    is_ood = bool(max_z > threshold)
    warning = (
        f"Acoustic properties differ substantially from the training distribution "
        f"(peak feature deviation: {max_z:.1f} std dev vs {threshold:.1f} threshold). "
        f"The prediction reflects vocal acoustic proximity but should not be treated as a definitive emotional assessment."
        if is_ood else None
    )
    return {
        "is_ood": is_ood,
        "max_deviation": round(max_z, 2),
        "threshold": threshold,
        "warning": warning,
    }


def _predict_windowed_signal(y: np.ndarray, sr: int, bundle: dict, is_e2v: bool) -> tuple[dict, np.ndarray, int]:
    """Perform temporal windowing across the entire speech signal when duration > 4.5s.
    Returns (scores_dict, pooled_feature, num_windows_used)."""
    dur = len(y) / sr
    pipeline = bundle["pipeline"]
    classes = pipeline.classes_

    if is_e2v:
        from .e2v_extractor import extract_e2v_embedding
        extract_fn = extract_e2v_embedding
    else:
        extract_fn = extract_features

    # For recordings <= 4.5 seconds: single calibrated utterance window
    if dur <= 4.5:
        feat = extract_fn(y)
        probs = pipeline.predict_proba(feat.reshape(1, -1))[0]
        scores = {c: float(p) for c, p in zip(classes, probs)}
        return scores, feat, 1

    # For longer recordings (> 4.5s): sliding windows covering 100% of speech
    from .timeline import plan_segments
    window_sec = getattr(C, "WINDOW_SECONDS", 3.5)
    hop_sec = getattr(C, "WINDOW_HOP", 2.0)
    segments = plan_segments(dur, window=window_sec, hop=hop_sec)

    valid_probs = []
    valid_feats = []

    for a, b in segments:
        seg = y[int(round(a * sr)) : int(round(b * sr))]
        if len(seg) / sr < C.MIN_SECONDS:
            continue
        seg_rms = float(np.sqrt(np.mean(seg ** 2)))
        if seg_rms < C.SILENCE_RMS:
            continue

        try:
            w_feat = extract_fn(seg)
            w_prob = pipeline.predict_proba(w_feat.reshape(1, -1))[0]
            valid_probs.append(w_prob)
            valid_feats.append(w_feat)
        except Exception as w_err:
            log.warning("Temporal window [%.2f-%.2f] inference failure: %s", a, b, w_err)
            continue

    if not valid_probs:
        # Fallback to single full-audio feature extraction
        feat = extract_fn(y)
        probs = pipeline.predict_proba(feat.reshape(1, -1))[0]
        scores = {c: float(p) for c, p in zip(classes, probs)}
        return scores, feat, 1

    # Probability average pooling across valid speech segments
    avg_probs = np.mean(valid_probs, axis=0)
    total_p = float(np.sum(avg_probs))
    if total_p > 0:
        avg_probs = avg_probs / total_p
    avg_feat = np.mean(valid_feats, axis=0).astype(np.float32)

    scores = {c: float(p) for c, p in zip(classes, avg_probs)}
    return scores, avg_feat, len(valid_probs)


def predict_bytes(data: bytes, return_signal: bool = False) -> dict:
    t0 = time.perf_counter()
    bundle = get_bundle()
    notes: list = []
    
    # 1. Decode raw audio and run audio-quality assessment
    raw_y, sr = _decode(data)
    initial_quality = assess_audio_quality(raw_y, sr)
    metrics = bundle.get("metrics") or load_metrics() or {}
    
    # 2. Reject unrecoverable non-speech audio (empty, silent, clipped, or too short)
    if initial_quality["status"] == "UNUSABLE" and initial_quality.get("code") in ("silent", "clipped", "too_short"):
        raise AudioError(initial_quality["reason"], initial_quality.get("code", "unusable_audio"))

    # 3. Conditional automatic noise reduction:
    # Applied when background noise or elevated noise floor is detected (NOISY or WARNING).
    # Already-clean recordings bypass processing completely to preserve natural vocal prosody.
    needs_denoise = (
        initial_quality["status"] == "NOISY"
        or (initial_quality["status"] == "WARNING" and (initial_quality["noise_floor"] >= 0.0035 or initial_quality["snr_db"] < 25.0))
        or (initial_quality["status"] == "UNUSABLE" and initial_quality.get("code") == "no_speech" and initial_quality["noise_floor"] >= 0.010)
    )

    proc_y = raw_y
    final_quality = initial_quality
    denoise_info = {
        "applied": False,
        "method": "none",
        "reason": "Audio is already clean (no noise reduction required)",
        "noise_floor_before": initial_quality["noise_floor"],
        "noise_floor_after": initial_quality["noise_floor"],
        "snr_before": initial_quality["snr_db"],
        "snr_after": initial_quality["snr_db"],
    }

    if needs_denoise:
        cleaned_y, d_res = reduce_noise_signal(
            raw_y,
            sr,
            initial_noise_floor=initial_quality["noise_floor"],
            initial_snr_db=initial_quality["snr_db"],
        )
        if d_res.get("applied"):
            clean_q = assess_audio_quality(cleaned_y, sr)
            # Accept noise reduction if noise floor was lowered or SNR improved without invalidating audio
            if clean_q["status"] != "UNUSABLE" and (
                clean_q["noise_floor"] < initial_quality["noise_floor"] or clean_q["snr_db"] > initial_quality["snr_db"]
            ):
                proc_y = cleaned_y
                pct_reduction = max(0.0, round((1.0 - clean_q["noise_floor"] / max(initial_quality["noise_floor"], 1e-6)) * 100, 1))
                snr_improvement = round(clean_q["snr_db"] - initial_quality["snr_db"], 1)
                denoise_info = {
                    "applied": True,
                    "method": "spectral_gating",
                    "status_before": initial_quality["status"],
                    "status_after": clean_q["status"],
                    "noise_floor_before": initial_quality["noise_floor"],
                    "noise_floor_after": clean_q["noise_floor"],
                    "noise_floor_reduction_pct": pct_reduction,
                    "snr_before": initial_quality["snr_db"],
                    "snr_after": clean_q["snr_db"],
                    "snr_improvement_db": snr_improvement,
                    "message": f"Noise reduced by {pct_reduction}% (SNR improved from {initial_quality['snr_db']:.1f} dB to {clean_q['snr_db']:.1f} dB)."
                }
                final_quality = {
                    **clean_q,
                    "initial_status": initial_quality["status"],
                    "noise_reduced": True,
                }
                notes.append(f"Automatic noise reduction applied: noise floor reduced by {pct_reduction}%.")
            else:
                denoise_info = {
                    "applied": False,
                    "method": "spectral_gating",
                    "reason": "Noise reduction did not improve measurable acoustic quality (retained original audio)",
                    "noise_floor_before": initial_quality["noise_floor"],
                    "noise_floor_after": initial_quality["noise_floor"],
                    "snr_before": initial_quality["snr_db"],
                    "snr_after": initial_quality["snr_db"],
                }
        else:
            denoise_info = d_res

    # 4. Reject UNUSABLE audio after any noise reduction attempt
    if final_quality["status"] == "UNUSABLE":
        raise AudioError(final_quality["reason"], final_quality.get("code", "unusable_audio"))

    # 5. Prepare signal for feature extraction (processable audio: GOOD, WARNING, and NOISY)
    y = prepare_signal(proc_y, sr, notes)
    if final_quality["status"] == "NOISY":
        notes.append(final_quality["reason"])
    elif final_quality["status"] == "WARNING" and not denoise_info.get("applied"):
        notes.append("Background noise detected. Prediction may be less reliable.")

    # Determine feature extractor dynamically based on model's expected input dimension
    scaler = getattr(bundle["pipeline"], "named_steps", {}).get("scale") or getattr(bundle["pipeline"], "named_steps", {}).get("scaler")
    clf = getattr(bundle["pipeline"], "named_steps", {}).get("clf")
    n_feats = None
    if scaler is not None and hasattr(scaler, "mean_"):
        n_feats = scaler.mean_.shape[0]
    elif clf is not None and hasattr(clf, "n_features_in_"):
        n_feats = clf.n_features_in_
    else:
        n_feats = bundle.get("preprocessing", {}).get("n_features")

    if n_feats == 768:
        is_e2v = True
    elif n_feats == 296:
        is_e2v = False
    else:
        is_e2v = (
            C.SER_MODEL_PROFILE in ("production", "default", "emotion2vec_experimental", "e2v", "emotion2vec", "experimental")
            and C.SER_MODEL_PROFILE not in ("staging", "candidate_option2", "svm_rollback", "svm", "baseline")
        )

    scores, feat, n_windows = _predict_windowed_signal(y, C.SAMPLE_RATE, bundle, is_e2v)
    top = max(scores, key=scores.get)
    ranked = sorted(scores.values(), reverse=True)
    rel = reliability_for(bundle, scores[top])
    margin = float(ranked[0] - ranked[1])
    
    ood = check_out_of_distribution(feat, bundle)
    is_uncertain = bool(
        rel.get("uncertain") is True
        or scores[top] < 0.25
        or margin < 0.04
        or ood["is_ood"]
    )
    if is_uncertain:
        rel["uncertain"] = True
    if ood["is_ood"]:
        notes.append("Atypical acoustic environment: recording features deviate from the model's training distribution. Prediction may be less reliable.")
    if n_windows > 1:
        notes.append(f"Full recording ({round(len(y) / C.SAMPLE_RATE, 1)}s) analyzed across {n_windows} temporal speech windows.")
        
    out = {
        "prediction_accepted": True,
        "audio_quality": final_quality,
        "initial_audio_quality": initial_quality,
        "noise_reduction": denoise_info,
        "emotion": top, "confidence": scores[top], "margin": margin, "scores": scores,
        "uncertain": is_uncertain,
        "out_of_distribution": ood["is_ood"],
        "ood_details": ood,
        "score_type": "normalized model scores (sum to 1); not calibrated probabilities of a person's emotion",
        "reliability": rel, "analyzed_seconds": round(len(y) / C.SAMPLE_RATE, 2), "notes": notes, "processing_ms": round((time.perf_counter() - t0) * 1000),
        "model": {"id": _cache["id"], "name": metrics.get("model_name"), "trained_at": metrics.get("generated_at"), "language": "en", "dataset": "CREMA-D", "profile": C.SER_MODEL_PROFILE}
    }
    if return_signal:
        out["_raw_y"] = raw_y
        out["_proc_y"] = proc_y
        out["_sr"] = sr
    return out


def predict_file(path) -> dict:
    with open(path, "rb") as f:
        return predict_bytes(f.read())
