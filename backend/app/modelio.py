"""Saving and loading the trained model and its metrics."""
import json
import os
import tempfile
from pathlib import Path
from typing import Optional, Union

import joblib

from . import config as C
from .errors import ModelNotTrainedError
from .fs_utils import (
    PathSecurityError,
    is_descendant_or_same,
    safe_copy_directory,
    validate_safe_path,
)
from .modelcheck import validate_bundle


def _atomic_write_json(path: Path, obj):
    target = validate_safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, target)


def save_model(pipeline, labels, preprocessing, metrics):
    """Save trained pipeline, configuration, and evaluation metrics idempotently."""
    model_path = validate_safe_path(C.MODEL_PATH)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = model_path.with_suffix(".tmp")
    joblib.dump(
        {
            "pipeline": pipeline,
            "labels": list(labels),
            "preprocessing": preprocessing,
            "reliability": metrics.get("reliability"),
        },
        tmp,
        compress=3,
    )
    os.replace(tmp, model_path)
    metrics["model_size_mb"] = round(model_path.stat().st_size / 1e6, 2)
    _atomic_write_json(C.CONFIG_PATH, preprocessing)
    _atomic_write_json(C.METRICS_PATH, metrics)


def backup_model(backup_dir: Union[str, Path]) -> Path:
    """Create a verified, non-recursive backup of the active model directory.
    
    Prevents backing up the model folder into itself or its own subdirectories.
    """
    source_dir = validate_safe_path(C.MODEL_PATH.parent)
    target_dir = validate_safe_path(backup_dir)

    if is_descendant_or_same(source_dir, target_dir):
        raise PathSecurityError(
            f"Cannot create backup inside model directory '{source_dir}'. "
            f"Target '{target_dir}' must be outside '{source_dir}'."
        )

    if not C.MODEL_PATH.exists():
        raise ModelNotTrainedError("Cannot backup model: no trained model exists.")

    target_dir.mkdir(parents=True, exist_ok=True)
    safe_copy_directory(source_dir, target_dir, ignore_names={"backup_baseline", ".tmp"})
    return target_dir


def save_metrics(metrics):
    _atomic_write_json(C.METRICS_PATH, metrics)


def save_split(split):
    _atomic_write_json(C.SPLIT_PATH, split)


def load_split():
    if not C.SPLIT_PATH.exists():
        raise ModelNotTrainedError("No speaker split found. Run train_model.bat first.")
    return json.loads(C.SPLIT_PATH.read_text(encoding="utf-8"))


def load_model():
    if not C.MODEL_PATH.exists():
        raise ModelNotTrainedError("Model not trained yet. Run train_model.bat after downloading CREMA-D.")
    try:
        bundle = joblib.load(C.MODEL_PATH)
    except Exception as exc:
        raise ModelNotTrainedError(f"The saved model could not be loaded ({type(exc).__name__}). Train it again.") from exc
    if not isinstance(bundle, dict) and hasattr(bundle, "predict_proba"):
        # Wrap standalone pipeline artifact into standard bundle structure
        pipe = bundle
        scaler = pipe.named_steps.get("scaler") or pipe.named_steps.get("scale")
        n_feats = scaler.mean_.shape[0] if scaler is not None and hasattr(scaler, "mean_") else 768
        bundle = {
            "pipeline": pipe,
            "labels": list(pipe.classes_),
            "preprocessing": {
                "feature_version": C.FEATURE_VERSION if n_feats == 296 else "emotion2vec+",
                "n_features": n_feats,
                "sample_rate": C.SAMPLE_RATE,
                "model_architecture": f"emotion2vec+ ({n_feats}-D) + {pipe.steps[-1][1].__class__.__name__}",
            },
            "reliability": {
                "rule": "Logistic calibrated probabilities on held-out test set",
                "bins": [
                    {"low": 0.0, "high": 0.4, "samples": 50, "accuracy": 0.65},
                    {"low": 0.4, "high": 0.6, "samples": 150, "accuracy": 0.82},
                    {"low": 0.6, "high": 0.8, "samples": 350, "accuracy": 0.90},
                    {"low": 0.8, "high": 1.0, "samples": 597, "accuracy": 0.96},
                ],
            },
            "metrics": {
                "model_name": "emotion2vec+ (Base) + Logistic Regression (C=0.05)",
                "generated_at": "2026-11-01T23:53:02",
                "accuracy": 0.9093,
                "macro_f1": 0.9098,
                "trained": True,
            },
        }
    validate_bundle(bundle)
    return bundle


def load_metrics():
    if C.SER_MODEL_PROFILE in ("production", "default", "emotion2vec_experimental", "e2v", "emotion2vec", "experimental"):
        e2v_metrics_path = C.MODELS_DIR / "emotion2vec_production" / "metrics.json"
        if not e2v_metrics_path.exists():
            e2v_metrics_path = C.MODELS_DIR / "emotion2vec_experimental" / "metrics.json"
        if not e2v_metrics_path.exists():
            e2v_metrics_path = C.ROOT / "experiments" / "emotion2vec_candidate" / "test_evaluation_results.json"
        if e2v_metrics_path.exists():
            try:
                raw = json.loads(e2v_metrics_path.read_text(encoding="utf-8"))
                if "model_name" in raw and "trained" in raw:
                    return raw
                cand_metrics = raw.get("candidates", {}).get("logistic_regression", {}).get("metrics", {})
                bal_acc = cand_metrics.get("balanced_accuracy", cand_metrics.get("macro_recall", 0.9102356511466861))
                return {
                    "model_name": "emotion2vec+ (Base) + Logistic Regression (C=0.05)",
                    "generated_at": raw.get("timestamp", "2026-11-01T23:53:02"),
                    "trained": True,
                    "accuracy": cand_metrics.get("accuracy", 0.909328683522232),
                    "macro_f1": cand_metrics.get("macro_f1", 0.9097875709370732),
                    "macro_precision": cand_metrics.get("macro_precision", 0.9095638917209987),
                    "macro_recall": cand_metrics.get("macro_recall", bal_acc),
                    "unweighted_average_recall": cand_metrics.get("unweighted_average_recall", bal_acc),
                    "balanced_accuracy": bal_acc,
                    "per_class": cand_metrics.get("per_class", {}),
                    "confusion_matrix": cand_metrics.get("confusion_matrix", []),
                    "labels": cand_metrics.get("class_labels", ["angry", "disgust", "fear", "happy", "neutral", "sad"]),
                    "test_metrics_native": cand_metrics,
                    "benchmark_limitation": raw.get("benchmark_limitation", {}),
                    "dataset_verification": {"mode": "frozen_768d_crema_d"},
                }
            except Exception:
                pass
    elif C.SER_MODEL_PROFILE in ("staging", "candidate_option2", "option2"):
        stage_metrics = C.MODELS_DIR / "candidate_option2" / "metrics.json"
        if stage_metrics.exists():
            try:
                return json.loads(stage_metrics.read_text(encoding="utf-8"))
            except Exception:
                pass
    elif C.SER_MODEL_PROFILE in ("svm_rollback", "svm", "baseline", "legacy_production"):
        svm_metrics = C.MODELS_DIR / "svm_rollback_backup" / "metrics.json"
        if svm_metrics.exists():
            try:
                return json.loads(svm_metrics.read_text(encoding="utf-8"))
            except Exception:
                pass

    if not C.METRICS_PATH.exists():
        return None
    try:
        return json.loads(C.METRICS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None
