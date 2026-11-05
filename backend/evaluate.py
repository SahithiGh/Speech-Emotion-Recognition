"""Re-score the saved model on the saved test speakers.   Usage:  python evaluate.py"""
import json
import sys
from datetime import datetime, timezone

import numpy as np

from app import config as C
from app.dataset import scan_dataset
from app.errors import DatasetError, ModelNotTrainedError
from app.evaluation import compute_metrics, per_speaker_accuracy, speaker_bootstrap_ci
from app.features_table import build_feature_table
from app.modelio import load_metrics, load_model, load_split, save_metrics


def main():
    old = (json.loads(C.METRICS_PATH.read_text(encoding="utf-8")) if C.METRICS_PATH.exists() else load_metrics()) or {}
    unverified = (old.get("dataset_verification") or {}).get("mode") == "none"
    try:
        bundle, split = load_model(), load_split()
        report = scan_dataset(C.DATA_DIR, manifest=None if unverified else "default")
    except (ModelNotTrainedError, DatasetError) as exc:
        print(f"ERROR: {exc}")
        return 1
    X, clips, _ = build_feature_table(report.clips)
    actors = np.array([c.actor for c in clips])
    mask = np.isin(actors, split["test"])
    if not mask.any():
        print("ERROR: none of the saved test speakers were found in the dataset.")
        return 1
    y = np.array([c.emotion for c in clips])[mask]
    pred = bundle["pipeline"].predict(X[mask])
    old.update(compute_metrics(y, pred, bundle["labels"]))
    old["confidence_intervals"] = speaker_bootstrap_ci(y, pred, actors[mask], C.BOOTSTRAP_ROUNDS, old.get("reproducibility", {}).get("seed", C.RANDOM_SEED))
    old["per_speaker_accuracy"] = per_speaker_accuracy(y, pred, actors[mask])
    old["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    old["trained"] = True
    save_metrics(old)
    print(old["classification_report"])
    print(f"Test accuracy {old['accuracy']:.3f} | macro F1 {old['macro_f1']:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
