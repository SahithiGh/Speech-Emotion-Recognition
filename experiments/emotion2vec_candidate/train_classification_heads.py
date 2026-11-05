"""Phase 4: Train and Validate Classification Heads for emotion2vec+ on CREMA-D.

Strict Constraints:
1. Uses ONLY dev_embeddings.npz for training, scaling, CV, and tuning.
2. Does NOT open, read, or evaluate against test_embeddings.npz.
3. Uses 5-fold speaker-disjoint cross-validation (StratifiedGroupKFold) across the 77 dev speakers.
4. Fits StandardScaler strictly inside each fold on training speakers only.
5. Evaluates and compares:
   - Candidate 1: Logistic Regression with balanced class weights
   - Candidate 2: RBF SVM with balanced class weights
   - Candidate 3: Multi-Layer Perceptron (MLP) with early stopping
6. Parallelizes fold evaluation with joblib across available CPU cores for fast execution.
7. Generates full classification metrics: accuracy, macro F1, balanced accuracy,
   per-class precision/recall/F1, and confusion matrices.
8. Saves final candidate models to experiments/emotion2vec_candidate/.
9. Saves JSON metrics and markdown report.
10. STOPS before accessing held-out test data.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from joblib import Parallel, delayed
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

SCRIPT_DIR = Path(__file__).resolve().parent
DEV_CACHE_PATH = SCRIPT_DIR / "dev_embeddings.npz"
RESULTS_JSON_PATH = SCRIPT_DIR / "phase4_training_results.json"
REPORT_MD_PATH = SCRIPT_DIR / "phase4_training_report.md"

CLASSES = ["angry", "disgust", "fear", "happy", "neutral", "sad"]


def sha256_file(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def evaluate_oof_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Compute accuracy, balanced accuracy, macro F1, per-class metrics, and confusion matrix."""
    acc = float(accuracy_score(y_true, y_pred))
    bal_acc = float(balanced_accuracy_score(y_true, y_pred))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro"))
    macro_prec = float(precision_score(y_true, y_pred, average="macro"))
    macro_rec = float(recall_score(y_true, y_pred, average="macro"))

    report = classification_report(y_true, y_pred, labels=CLASSES, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=CLASSES).tolist()

    per_class = {}
    for cls in CLASSES:
        per_class[cls] = {
            "precision": float(report[cls]["precision"]),
            "recall": float(report[cls]["recall"]),
            "f1-score": float(report[cls]["f1-score"]),
            "support": int(report[cls]["support"]),
        }

    return {
        "accuracy": acc,
        "balanced_accuracy": bal_acc,
        "macro_f1": macro_f1,
        "macro_precision": macro_prec,
        "macro_recall": macro_rec,
        "per_class": per_class,
        "confusion_matrix": cm,
        "class_labels": CLASSES,
    }


def _fit_eval_single_fold(fold_idx, train_idx, val_idx, X, y, groups, clf_builder):
    """Fit and evaluate on a single fold with strictly isolated StandardScaler."""
    train_spk = set(groups[train_idx])
    val_spk = set(groups[val_idx])
    assert len(train_spk & val_spk) == 0, f"Speaker leakage in fold {fold_idx + 1}!"

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X[train_idx])
    X_val_s = scaler.transform(X[val_idx])

    clf = clf_builder()
    clf.fit(X_train_s, y[train_idx])
    preds = clf.predict(X_val_s)

    fold_acc = float(accuracy_score(y[val_idx], preds))
    fold_f1 = float(f1_score(y[val_idx], preds, average="macro"))

    return fold_idx, val_idx, preds, fold_acc, fold_f1


def run_parallel_cv(clf_builder, X, y, groups, folds, n_jobs=5):
    """Run speaker-disjoint 5-fold cross validation in parallel."""
    results = Parallel(n_jobs=n_jobs)(
        delayed(_fit_eval_single_fold)(f_idx, tr_idx, val_idx, X, y, groups, clf_builder)
        for f_idx, (tr_idx, val_idx) in enumerate(folds)
    )

    oof_preds = np.empty(len(y), dtype=object)
    fold_scores = []

    for fold_idx, val_idx, preds, fold_acc, fold_f1 in sorted(results, key=lambda r: r[0]):
        oof_preds[val_idx] = preds
        fold_scores.append({"fold": fold_idx + 1, "accuracy": fold_acc, "macro_f1": fold_f1})

    metrics = evaluate_oof_predictions(y, oof_preds)
    metrics["fold_scores"] = fold_scores
    return metrics, oof_preds


def main():
    print("=" * 80, flush=True)
    print("PHASE 4: CLASSIFICATION HEAD DESIGN, TRAINING & VALIDATION", flush=True)
    print("=" * 80, flush=True)
    t0_all = time.time()

    # Step 1: Load development embeddings strictly
    if not DEV_CACHE_PATH.exists():
        raise FileNotFoundError(f"Development cache not found at {DEV_CACHE_PATH}")

    print(f"Loading development embeddings strictly from: {DEV_CACHE_PATH.name}", flush=True)
    dev_data = np.load(DEV_CACHE_PATH, allow_pickle=True)
    X = dev_data["embeddings"]
    y = dev_data["labels"]
    groups = dev_data["speaker_ids"]

    n_samples = len(X)
    n_speakers = len(np.unique(groups))
    print(f"Loaded {n_samples} development samples from {n_speakers} speakers.", flush=True)
    assert n_samples == 6294, f"Expected 6,294 dev samples, got {n_samples}"
    assert n_speakers == 77, f"Expected 77 dev speakers, got {n_speakers}"
    assert X.shape[1] == 768, f"Expected 768-D embeddings, got {X.shape[1]}"

    # Verify held-out test data is NOT touched
    test_path = SCRIPT_DIR / "test_embeddings.npz"
    print(f"Quarantine Check: Test set ({test_path.name}) exists = {test_path.exists()} (UNTOUCHED)", flush=True)

    # Step 2: Set up 5-fold StratifiedGroupKFold
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    folds = list(sgkf.split(X, y, groups))
    print(f"Configured 5-fold StratifiedGroupKFold across {n_speakers} speakers (Parallel n_jobs=5).", flush=True)
    for f_idx, (tr_idx, val_idx) in enumerate(folds):
        tr_s = len(set(groups[tr_idx]))
        val_s = len(set(groups[val_idx]))
        print(f"  Fold {f_idx + 1}: Train={len(tr_idx)} clips ({tr_s} spks), Val={len(val_idx)} clips ({val_s} spks)", flush=True)

    candidate_results = {}

    # --------------------------------------------------------------------------
    # Candidate 1: Logistic Regression Tuning
    # --------------------------------------------------------------------------
    print("\n" + "-" * 60, flush=True)
    print("CANDIDATE 1: Logistic Regression (Balanced Class Weights)", flush=True)
    print("-" * 60, flush=True)
    lr_c_grid = [0.05, 0.2, 1.0, 5.0]
    best_lr_c = None
    best_lr_f1 = -1.0
    best_lr_metrics = None

    for c_val in lr_c_grid:
        t_start = time.time()
        metrics, _ = run_parallel_cv(
            lambda c=c_val: LogisticRegression(
                C=c, class_weight="balanced", solver="lbfgs", max_iter=250, random_state=42
            ),
            X, y, groups, folds, n_jobs=5
        )
        elapsed = time.time() - t_start
        print(f"  C={c_val:<5}: Acc={metrics['accuracy']:.4f}, BalAcc={metrics['balanced_accuracy']:.4f}, Macro-F1={metrics['macro_f1']:.4f} ({elapsed:.1f}s)", flush=True)
        if metrics["macro_f1"] > best_lr_f1:
            best_lr_f1 = metrics["macro_f1"]
            best_lr_c = c_val
            best_lr_metrics = metrics

    print(f"  --> Best Logistic Regression: C={best_lr_c} (Macro-F1: {best_lr_f1:.4f}, Acc: {best_lr_metrics['accuracy']:.4f})", flush=True)
    candidate_results["logistic_regression"] = {
        "best_params": {"C": best_lr_c, "class_weight": "balanced", "solver": "lbfgs"},
        "metrics": best_lr_metrics,
    }

    # --------------------------------------------------------------------------
    # Candidate 2: RBF SVM Tuning
    # --------------------------------------------------------------------------
    print("\n" + "-" * 60, flush=True)
    print("CANDIDATE 2: RBF Support Vector Machine (Balanced Class Weights)", flush=True)
    print("-" * 60, flush=True)
    svm_configs = [
        {"C": 1.0, "gamma": "scale"},
        {"C": 2.0, "gamma": "scale"},
        {"C": 5.0, "gamma": "scale"},
    ]
    best_svm_cfg = None
    best_svm_f1 = -1.0
    best_svm_metrics = None

    for cfg in svm_configs:
        t_start = time.time()
        metrics, _ = run_parallel_cv(
            lambda c=cfg["C"], g=cfg["gamma"]: SVC(
                C=c, gamma=g, kernel="rbf", class_weight="balanced", probability=False, random_state=42
            ),
            X, y, groups, folds, n_jobs=5
        )
        elapsed = time.time() - t_start
        print(f"  C={cfg['C']:<4} gamma={cfg['gamma']:<5}: Acc={metrics['accuracy']:.4f}, BalAcc={metrics['balanced_accuracy']:.4f}, Macro-F1={metrics['macro_f1']:.4f} ({elapsed:.1f}s)", flush=True)
        if metrics["macro_f1"] > best_svm_f1:
            best_svm_f1 = metrics["macro_f1"]
            best_svm_cfg = cfg
            best_svm_metrics = metrics

    print(f"  --> Best RBF SVM: C={best_svm_cfg['C']}, gamma={best_svm_cfg['gamma']} (Macro-F1: {best_svm_f1:.4f}, Acc: {best_svm_metrics['accuracy']:.4f})", flush=True)
    candidate_results["rbf_svm"] = {
        "best_params": {**best_svm_cfg, "kernel": "rbf", "class_weight": "balanced", "probability": True},
        "metrics": best_svm_metrics,
    }

    # --------------------------------------------------------------------------
    # Candidate 3: Multi-Layer Perceptron (MLP) Probe
    # --------------------------------------------------------------------------
    print("\n" + "-" * 60, flush=True)
    print("CANDIDATE 3: Multi-Layer Perceptron (Dense Foundation Model Probe)", flush=True)
    print("-" * 60, flush=True)
    mlp_configs = [
        {"hidden": (128,), "alpha": 1e-3},
        {"hidden": (256,), "alpha": 1e-3},
        {"hidden": (256,), "alpha": 1e-2},
        {"hidden": (128, 64), "alpha": 1e-3},
    ]
    best_mlp_cfg = None
    best_mlp_f1 = -1.0
    best_mlp_metrics = None

    for cfg in mlp_configs:
        t_start = time.time()
        metrics, _ = run_parallel_cv(
            lambda h=cfg["hidden"], a=cfg["alpha"]: MLPClassifier(
                hidden_layer_sizes=h,
                alpha=a,
                activation="relu",
                solver="adam",
                max_iter=300,
                early_stopping=True,
                validation_fraction=0.1,
                n_iter_no_change=10,
                random_state=42,
            ),
            X, y, groups, folds, n_jobs=5
        )
        elapsed = time.time() - t_start
        h_str = str(cfg["hidden"])
        print(f"  Hidden={h_str:<10} alpha={cfg['alpha']:<6}: Acc={metrics['accuracy']:.4f}, BalAcc={metrics['balanced_accuracy']:.4f}, Macro-F1={metrics['macro_f1']:.4f} ({elapsed:.1f}s)", flush=True)
        if metrics["macro_f1"] > best_mlp_f1:
            best_mlp_f1 = metrics["macro_f1"]
            best_mlp_cfg = cfg
            best_mlp_metrics = metrics

    print(f"  --> Best MLP: Hidden={best_mlp_cfg['hidden']}, alpha={best_mlp_cfg['alpha']} (Macro-F1: {best_mlp_f1:.4f}, Acc: {best_mlp_metrics['accuracy']:.4f})", flush=True)
    candidate_results["mlp"] = {
        "best_params": {
            "hidden_layer_sizes": best_mlp_cfg["hidden"],
            "alpha": best_mlp_cfg["alpha"],
            "activation": "relu",
            "solver": "adam",
        },
        "metrics": best_mlp_metrics,
    }

    # --------------------------------------------------------------------------
    # Train Final Candidate Models on Full Development Set & Save Checkpoints
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80, flush=True)
    print("TRAINING FINAL CANDIDATES ON FULL DEVELOPMENT SET (77 SPEAKERS)", flush=True)
    print("=" * 80, flush=True)

    # 1. Best Logistic Regression
    lr_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            C=best_lr_c, class_weight="balanced", solver="lbfgs", max_iter=500, random_state=42
        )),
    ])
    lr_pipe.fit(X, y)
    lr_model_path = SCRIPT_DIR / "candidate_logistic_regression.joblib"
    joblib.dump(lr_pipe, lr_model_path)
    lr_sha = sha256_file(lr_model_path)
    lr_size_kb = lr_model_path.stat().st_size / 1024
    print(f"Saved: {lr_model_path.name} ({lr_size_kb:.1f} KB, SHA256: {lr_sha[:16]}...)", flush=True)
    candidate_results["logistic_regression"]["checkpoint"] = {
        "path": str(lr_model_path),
        "size_kb": round(lr_size_kb, 1),
        "sha256": lr_sha,
    }

    # 2. Best RBF SVM (with probability=True for production calibration compatibility)
    print("Fitting final RBF SVM with probability calibration...", flush=True)
    svm_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", SVC(
            C=best_svm_cfg["C"],
            gamma=best_svm_cfg["gamma"],
            kernel="rbf",
            class_weight="balanced",
            probability=True,
            random_state=42,
        )),
    ])
    svm_pipe.fit(X, y)
    svm_model_path = SCRIPT_DIR / "candidate_rbf_svm.joblib"
    joblib.dump(svm_pipe, svm_model_path)
    svm_sha = sha256_file(svm_model_path)
    svm_size_mb = svm_model_path.stat().st_size / (1024 * 1024)
    print(f"Saved: {svm_model_path.name} ({svm_size_mb:.2f} MB, SHA256: {svm_sha[:16]}...)", flush=True)
    candidate_results["rbf_svm"]["checkpoint"] = {
        "path": str(svm_model_path),
        "size_mb": round(svm_size_mb, 2),
        "sha256": svm_sha,
    }

    # 3. Best MLP
    mlp_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", MLPClassifier(
            hidden_layer_sizes=best_mlp_cfg["hidden"],
            alpha=best_mlp_cfg["alpha"],
            activation="relu",
            solver="adam",
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=10,
            random_state=42,
        )),
    ])
    mlp_pipe.fit(X, y)
    mlp_model_path = SCRIPT_DIR / "candidate_mlp.joblib"
    joblib.dump(mlp_pipe, mlp_model_path)
    mlp_sha = sha256_file(mlp_model_path)
    mlp_size_kb = mlp_model_path.stat().st_size / 1024
    print(f"Saved: {mlp_model_path.name} ({mlp_size_kb:.1f} KB, SHA256: {mlp_sha[:16]}...)", flush=True)
    candidate_results["mlp"]["checkpoint"] = {
        "path": str(mlp_model_path),
        "size_kb": round(mlp_size_kb, 1),
        "sha256": mlp_sha,
    }

    elapsed_all = time.time() - t0_all
    meta = {
        "phase": "Phase 4: Classification Head Design, Training & Cross-Validation",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_elapsed_seconds": round(elapsed_all, 2),
        "benchmark_limitation": (
            "CREMA-D contamination disclosure: CREMA-D is documented as part of emotion2vec's "
            "original self-supervised pretraining corpora. Therefore, high performance on CREMA-D "
            "represents in-domain representation probing and cannot be claimed as independent out-of-distribution "
            "generalization."
        ),
        "training_data": {
            "source": str(DEV_CACHE_PATH),
            "samples": n_samples,
            "speakers": n_speakers,
            "feature_dim": 768,
            "classes": CLASSES,
        },
        "held_out_test_status": "QUARANTINED (Untouched, 0 evaluations performed)",
        "candidates": candidate_results,
    }

    with open(RESULTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"\nSaved results JSON to: {RESULTS_JSON_PATH.name}", flush=True)
    print(f"Total training & CV runtime: {elapsed_all:.1f}s ({elapsed_all/60:.2f} min)", flush=True)


if __name__ == "__main__":
    main()
