"""Train Experiment 1: 294-feature Model with Revised Spectral Contrast.

Trains on the 77 development speakers using SVC(C=5.0, kernel='rbf', class_weight='balanced', probability=True).
Saves model bundle to experiments/exp1_revised_contrast/model.joblib.
"""
import json
import os
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, recall_score, precision_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

# Ensure backend and experiments modules can be imported
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.dataset import parse_filename, speaker_folds
from experiments.features_exp1 import FEATURE_GROUPS_EXP1, drop_band6_from_296, preprocessing_config_294

EXP_DIR = Path("experiments/exp1_revised_contrast")
EXP_DIR.mkdir(parents=True, exist_ok=True)


def train_exp1():
    print("=== Training Experiment 1: Revised Spectral Contrast (294 Features) ===")
    
    # 1. Load cached features
    print("Loading feature cache from outputs/feature_cache.npz...")
    cache = np.load("outputs/feature_cache.npz")
    X_raw = cache["X"]  # (7441, 296)
    names = cache["names"]
    
    # Parse labels and actors
    y_all = []
    actors_all = []
    for name in names:
        actor, emotion = parse_filename(name)
        y_all.append(emotion)
        actors_all.append(actor)
    y_all = np.array(y_all)
    actors_all = np.array(actors_all)
    
    # 2. Transform to 294 features
    print("Dropping Nyquist contrast band 6 (columns 270 and 277)...")
    X_294 = drop_band6_from_296(X_raw)
    assert X_294.shape == (len(names), 294), f"Unexpected shape {X_294.shape}"
    print(f"Transformed features shape: {X_294.shape}")
    
    # 3. Load official speaker split
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    
    dev_speakers = set(split["development"])
    test_speakers = set(split["test"])
    print(f"Development speakers: {len(dev_speakers)}, Held-out test speakers: {len(test_speakers)}")
    
    dev_mask = np.isin(actors_all, list(dev_speakers))
    test_mask = np.isin(actors_all, list(test_speakers))
    
    assert not (set(actors_all[dev_mask]) & set(actors_all[test_mask])), "Data leakage between dev and test!"
    
    Xd, yd, gd = X_294[dev_mask], y_all[dev_mask], actors_all[dev_mask]
    Xte, yte, ste = X_294[test_mask], y_all[test_mask], actors_all[test_mask]
    print(f"Development set: {len(yd)} clips | Held-out test set: {len(yte)} clips")
    
    # 4. 5-Fold Cross-Validation on Development Set
    print("\nRunning 5-fold speaker-grouped cross validation on development data...")
    folds = speaker_folds(yd, gd, k=C.CV_FOLDS, seed=C.RANDOM_SEED)
    cv_f1s, cv_accs = [], []
    for fold_idx, (tr, va) in enumerate(folds, 1):
        fold_pipe = Pipeline([
            ("scale", StandardScaler()),
            ("clf", SVC(C=5.0, kernel="rbf", gamma="scale", class_weight="balanced", probability=False, random_state=42))
        ])
        fold_pipe.fit(Xd[tr], yd[tr])
        pred_va = fold_pipe.predict(Xd[va])
        f1 = f1_score(yd[va], pred_va, average="macro", zero_division=0)
        acc = accuracy_score(yd[va], pred_va)
        cv_f1s.append(f1)
        cv_accs.append(acc)
        print(f"  Fold {fold_idx}: macro F1 = {f1:.4f}, accuracy = {acc:.4f}")
    
    mean_cv_f1 = float(np.mean(cv_f1s))
    std_cv_f1 = float(np.std(cv_f1s))
    mean_cv_acc = float(np.mean(cv_accs))
    print(f"5-Fold CV macro F1: {mean_cv_f1:.4f} +/- {std_cv_f1:.4f} | Accuracy: {mean_cv_acc:.4f}")
    
    # 5. Fit full model on all 77 development speakers with probability=True
    print("\nFitting final model on all 77 development speakers...")
    t0 = time.time()
    final_pipeline = Pipeline([
        ("scale", StandardScaler()),
        ("clf", SVC(C=5.0, kernel="rbf", gamma="scale", class_weight="balanced", probability=True, random_state=42))
    ])
    final_pipeline.fit(Xd, yd)
    train_time = time.time() - t0
    print(f"Final training completed in {train_time:.1f}s")
    
    # 6. Evaluate on 14 held-out test speakers
    print("\nEvaluating on 14 held-out test speakers (1,147 clips)...")
    pred_te = final_pipeline.predict(Xte)
    test_acc = accuracy_score(yte, pred_te)
    test_macro_f1 = f1_score(yte, pred_te, average="macro", zero_division=0)
    test_uar = recall_score(yte, pred_te, average="macro", zero_division=0)
    test_precision = precision_score(yte, pred_te, average="macro", zero_division=0)
    labels = C.EMOTIONS
    cm = confusion_matrix(yte, pred_te, labels=labels).tolist()
    
    per_class = {}
    for emo in labels:
        idx = labels.index(emo)
        emo_mask = (yte == emo)
        emo_pred = (pred_te == emo)
        tp = int(np.sum((yte == emo) & (pred_te == emo)))
        fn = int(np.sum((yte == emo) & (pred_te != emo)))
        fp = int(np.sum((yte != emo) & (pred_te == emo)))
        prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        f1_c = float(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        per_class[emo] = {"precision": prec, "recall": rec, "f1": f1_c, "support": int(emo_mask.sum())}
    
    print(f"Test Accuracy:         {test_acc:.4f}")
    print(f"Test Macro F1:         {test_macro_f1:.4f}")
    print(f"Test Macro Recall(UAR):{test_uar:.4f}")
    print(f"Test Macro Precision:  {test_precision:.4f}")
    print("\nPer-class Recall:")
    for emo, m in per_class.items():
        print(f"  {emo:8s}: recall={m['recall']:.4f}, precision={m['precision']:.4f}, f1={m['f1']:.4f}")
    
    # 7. Save model bundle
    model_bundle = {
        "pipeline": final_pipeline,
        "labels": labels,
        "preprocessing": preprocessing_config_294(),
        "experiment": "exp1_revised_contrast",
    }
    model_path = EXP_DIR / "model.joblib"
    joblib.dump(model_bundle, model_path, compress=3)
    print(f"\nSaved model bundle to {model_path} ({model_path.stat().st_size / 1e6:.2f} MB)")
    
    # 8. Save metrics
    metrics = {
        "experiment": "exp1_revised_contrast",
        "n_features": 294,
        "cv_5fold": {
            "macro_f1_mean": mean_cv_f1,
            "macro_f1_std": std_cv_f1,
            "accuracy_mean": mean_cv_acc,
            "fold_macro_f1": cv_f1s,
        },
        "test_metrics": {
            "accuracy": float(test_acc),
            "macro_f1": float(test_macro_f1),
            "uar": float(test_uar),
            "macro_precision": float(test_precision),
            "per_class": per_class,
            "confusion_matrix": cm,
            "labels": labels,
        },
        "training_seconds": round(train_time, 2),
    }
    with open(EXP_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"Saved metrics to {EXP_DIR / 'metrics.json'}")
    return metrics


if __name__ == "__main__":
    train_exp1()
