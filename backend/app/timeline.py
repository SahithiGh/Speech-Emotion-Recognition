"""Segment-level emotion analysis. Each window of the ORIGINAL audio is classified by the real model.

Segments are cut from the untrimmed recording, so start and end times match the original audio. The model was trained
on whole sentences; short windows were NOT validated, so segment results are exploratory estimates."""
import numpy as np

from . import config as C
from .audio import extract_features
from .errors import AudioError


def plan_segments(duration: float, window: float, hop: float):
    """List of (start, end) seconds. The last window is kept if it still has at least MIN_SECONDS of audio, else marked too short."""
    segs, start = [], 0.0
    while start < duration - 1e-9:
        end = min(start + window, duration)
        segs.append((round(start, 3), round(end, 3)))
        if end >= duration - 1e-9:
            break
        start += hop
    return segs


def validate_params(window: float, hop: float, duration: float):
    if not (C.TIMELINE_MIN_WINDOW <= window <= C.TIMELINE_MAX_WINDOW):
        raise AudioError(f"Window length must be between {C.TIMELINE_MIN_WINDOW:g} and {C.TIMELINE_MAX_WINDOW:g} seconds.", "bad_parameters")
    if not (C.TIMELINE_MIN_HOP <= hop <= window):
        raise AudioError(f"Step must be between {C.TIMELINE_MIN_HOP:g} seconds and the window length.", "bad_parameters")
    if len(plan_segments(duration, window, hop)) > C.TIMELINE_MAX_SEGMENTS:
        raise AudioError(f"That would create more than {C.TIMELINE_MAX_SEGMENTS} segments. Use a larger step or a shorter recording.", "too_many_segments")


def analyse_timeline(y: np.ndarray, pipeline, window: float, hop: float) -> dict:
    sr = C.SAMPLE_RATE
    duration = len(y) / sr
    validate_params(window, hop, duration)
    segments, rows, idx = [], [], []
    scaler = getattr(pipeline, "named_steps", {}).get("scale") or getattr(pipeline, "named_steps", {}).get("scaler")
    n_feats = scaler.mean_.shape[0] if scaler is not None and hasattr(scaler, "mean_") else 296
    is_e2v = (n_feats == 768)
    if is_e2v:
        from .e2v_extractor import extract_e2v_embedding
    for i, (a, b) in enumerate(plan_segments(duration, window, hop)):
        seg = y[int(round(a * sr)):int(round(b * sr))]
        item = {"index": i, "start": a, "end": b, "status": "ok", "emotion": None, "top_score": None, "scores": None}
        if len(seg) / sr < C.MIN_SECONDS:
            item["status"] = "too_short"
        elif float(np.sqrt(np.mean(seg ** 2))) < C.SILENCE_RMS:
            item["status"] = "silent"
        else:
            try:
                peak = float(np.max(np.abs(seg)))
                norm_seg = seg / peak * 0.9 if peak > 0 else seg
                if is_e2v:
                    rows.append(extract_e2v_embedding(norm_seg))
                else:
                    rows.append(extract_features(norm_seg))
                idx.append(i)
            except Exception:
                item["status"] = "failed"
        segments.append(item)
    if rows:                                    # one batched call instead of one model call per window
        try:
            probs = pipeline.predict_proba(np.stack(rows))
            classes = list(pipeline.classes_)
            for i, p in zip(idx, probs):
                scores = {c: float(v) for c, v in zip(classes, p)}
                top = max(scores, key=scores.get)
                segments[i].update(emotion=top, top_score=scores[top], scores=scores)
        except Exception:
            for i in idx:
                segments[i]["status"] = "failed"
    return {"duration": round(duration, 3), "window_seconds": window, "step_seconds": hop,
            "overlap_seconds": round(window - hop, 3), "segments": segments,
            "counts": {k: sum(1 for s in segments if s["status"] == k) for k in ("ok", "silent", "too_short", "failed")},
            "caution": "Segment results are estimates. The model was trained on whole sentences and was not evaluated on short windows, "
                       "so they can be unreliable for short or noisy speech, and a change between segments does not mean the speaker's emotion changed at that moment."}
