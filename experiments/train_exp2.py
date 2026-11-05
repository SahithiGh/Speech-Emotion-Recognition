"""Train Experiment 2: 296-feature Model with Resampling Augmentation.

Keeps all 296 features, but augments the 77 development speakers with simulated
48kHz -> 16kHz resampling (which introduces anti-aliasing filter cutoff at ~7.2 kHz).
This teaches the StandardScaler and RBF SVM that Spectral Contrast Band 6 (6.4 - 8.0 kHz)
has large variance due to recording/resampling hardware and carries no emotion label information.
"""
import json
import os
import sys
import time
from pathlib import Path

import joblib
import librosa
import numpy as np
from joblib import Parallel, delayed
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, recall_score, precision_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import FEATURE_GROUPS, N_FEATURES, extract_features, load_audio_file, preprocessing_config
from app.dataset import parse_filename, speaker_folds

EXP_DIR = Path("experiments/exp2_resampling_aug")
EXP_DIR.mkdir(parents=True, exist_ok=True)
RESAMPLED_CACHE_PATH = EXP_DIR / "resampled_dev_cache.npz"


def _extract_resampled(path_str: str) -> np.ndarray:
    """Simulate 48kHz -> 16kHz resampling and extract 296 features."""
    try:
        y = load_audio_file(path_str)
        # Resample up to 48kHz, then downsample back to 16kHz using librosa's standard filter
        y_48k = librosa.resample(y, orig_sr=16000, target_sr=48000)
        y_resampled = librosa.resample(y_48k, orig_sr=48000, target_sr=16000)
        return extract_features(y_resampled)
    except Exception as exc:
        print(f"Error extracting resampled features for {path_str}: {exc}")
        return None


def get_or_compute_resampled_features(dev_clips: list, jobs: int = 8) -> dict:
    """Load or compute resampled features for given clips."""
    if RESAMPLED_CACHE_PATH.exists():
        print(f"Loading cached resampled features from {RESAMPLED_CACHE_PATH}...")
        cache_data = np.load(RESAMPLED_CACHE_PATH)
        return {name: feat for name, feat in zip(cache_data["names"], cache_data["X"])}
    
    print(f"Extracting resampled features for {len(dev_clips)} clips using {jobs} workers...")
    t0 = time.time()
    paths = [str(C.DATA_DIR / name) for name in dev_clips]
    results = Parallel(n_jobs=jobs, batch_size=32)(delayed(_extract_resampled)(p) for p in paths)
    
    valid_cache = {}
    valid_names = []
    valid_X = []
    for name, feat in zip(dev_clips, results):
        if feat is not None and len(feat) == N_FEATURES:
            valid_cache[name] = feat
            valid_names.append(name)
            valid_X.append(feat)
            
    print(f"Extraction completed in {time.time() - t0:.1f}s. Saving to {RESAMPLED_CACHE_PATH}...")
    np.savez_compressed(
        RESAMPLED_CACHE_PATH,
        names=np.array(valid_names),
        X=np.stack(valid_X)
    )
    return valid_cache


def train_exp2():
    print("=== Training Experiment 2: Resampling Augmentation (296 Features) ===")
    
    # 1. Load native cached features
    print("Loading native feature cache from outputs/feature_cache.npz...")
    cache = np.load("outputs/feature_cache.npz")
    X_native = cache["X"]  # (7441, 296)
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
    
    # 2. Load official speaker split
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    
    dev_speakers = set(split["development"])
    test_speakers = set(split["test"])
    print(f"Development speakers: {len(dev_speakers)}, Held-out test speakers: {len(test_speakers)}")
    
    dev_mask = np.isin(actors_all, list(dev_speakers))
    test_mask = np.isin(actors_all, list(test_speakers))
    
    dev_names = names[dev_mask]
    yd = y_all[dev_mask]
    gd = actors_all[dev_mask]
    Xd_native = X_native[dev_mask]
    
    Xte_native = X_native[test_mask]
    yte = y_all[test_mask]
    ste = actors_all[test_mask]
    test_names = names[test_mask]
    
    print(f"Development set: {len(yd)} clips | Held-out test set: {len(yte)} clips")
    
    # 3. Compute resampled features for development clips to create 50% augmented mix
    # We select 50% of clips deterministically using random seed 42
    rng = np.random.default_rng(42)
    resample_subset_mask = rng.random(len(dev_names)) < 0.5
    resample_target_names = dev_names[resample_subset_mask]
    print(f"Selected {len(resample_target_names)} development clips (~50%) for resampling simulation.")
    
    resampled_dict = get_or_compute_resampled_features(resample_target_names.tolist(), jobs=8)
    
    # Construct augmented development feature matrix
    Xd_aug = Xd_native.copy()
    num_augmented = 0
    for idx, (is_resampled, name) in enumerate(zip(resample_subset_mask, dev_names)):
        if is_resampled and name in resampled_dict:
            Xd_aug[idx] = resampled_dict[name]
            num_augmented += 1
            
    print(f"Augmented development matrix ready: {num_augmented} clips resampled, {len(dev_names) - num_augmented} native.")
    print(f"Feature 270 (sc band 6) mean across native: {Xd_native[:, 270].mean():.2f} (std={Xd_native[:, 270].std():.2f})")
    print(f"Feature 270 (sc band 6) mean across augmented: {Xd_aug[:, 270].mean():.2f} (std={Xd_aug[:, 270].std():.2f})")
    
    # 4. 5-Fold Cross-Validation on Development Set
    print("\nRunning 5-fold speaker-grouped cross validation on augmented development data...")
    folds = speaker_folds(yd, gd, k=C.CV_FOLDS, seed=C.RANDOM_SEED)
    cv_f1s, cv_accs = [], []
    for fold_idx, (tr, va) in enumerate(folds, 1):
        fold_pipe = Pipeline([
            ("scale", StandardScaler()),
            ("clf", SVC(C=5.0, kernel="rbf", gamma="scale", class_weight="balanced", probability=False, random_state=42))
        ])
        fold_pipe.fit(Xd_aug[tr], yd[tr])
        pred_va = fold_pipe.predict(Xd_aug[va])
        f1 = f1_score(yd[va], pred_va, average="macro", zero_division=0)
        acc = accuracy_score(yd[va], pred_va)
        cv_f1s.append(f1)
        cv_accs.append(acc)
        print(f"  Fold {fold_idx}: macro F1 = {f1:.4f}, accuracy = {acc:.4f}")
    
    mean_cv_f1 = float(np.mean(cv_f1s))
    std_cv_f1 = float(np.std(cv_f1s))
    mean_cv_acc = float(np.mean(cv_accs))
    print(f"5-Fold CV macro F1: {mean_cv_f1:.4f} +/- {std_cv_f1:.4f} | Accuracy: {mean_cv_acc:.4f}")
    
    # 5. Fit final model on all 77 development speakers with probability=True
    print("\nFitting final model on all 77 development speakers...")
    t0 = time.time()
    final_pipeline = Pipeline([
        ("scale", StandardScaler()),
        ("clf", SVC(C=5.0, kernel="rbf", gamma="scale", class_weight="balanced", probability=True, random_state=42))
    ])
    final_pipeline.fit(Xd_aug, yd)
    train_time = time.time() - t0
    print(f"Final training completed in {train_time:.1f}s")
    
    # 6. Evaluate on 14 held-out test speakers (NATIVE)
    print("\nEvaluating on 14 held-out test speakers (1,147 NATIVE clips)...")
    pred_te_nat = final_pipeline.predict(Xte_native)
    test_acc_nat = accuracy_score(yte, pred_te_nat)
    test_macro_f1_nat = f1_score(yte, pred_te_nat, average="macro", zero_division=0)
    test_uar_nat = recall_score(yte, pred_te_nat, average="macro", zero_division=0)
    test_precision_nat = precision_score(yte, pred_te_nat, average="macro", zero_division=0)
    labels = C.EMOTIONS
    cm_nat = confusion_matrix(yte, pred_te_nat, labels=labels).tolist()
    
    per_class_nat = {}
    for emo in labels:
        emo_mask = (yte == emo)
        tp = int(np.sum((yte == emo) & (pred_te_nat == emo)))
        fn = int(np.sum((yte == emo) & (pred_te_nat != emo)))
        fp = int(np.sum((yte != emo) & (pred_te_nat == emo)))
        prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        f1_c = float(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        per_class_nat[emo] = {"precision": prec, "recall": rec, "f1": f1_c, "support": int(emo_mask.sum())}
    
    print(f"Native Test Accuracy:         {test_acc_nat:.4f}")
    print(f"Native Test Macro F1:         {test_macro_f1_nat:.4f}")
    print(f"Native Test Macro Recall(UAR):{test_uar_nat:.4f}")
    print(f"Native Test Macro Precision:  {test_precision_nat:.4f}")
    
    # 7. Save model bundle
    prep = preprocessing_config()
    prep["experiment"] = "exp2_resampling_aug"
    model_bundle = {
        "pipeline": final_pipeline,
        "labels": labels,
        "preprocessing": prep,
        "experiment": "exp2_resampling_aug",
    }
    model_path = EXP_DIR / "model.joblib"
    joblib.dump(model_bundle, model_path, compress=3)
    print(f"\nSaved model bundle to {model_path} ({model_path.stat().st_size / 1e6:.2f} MB)")
    
    # 8. Save metrics
    metrics = {
        "experiment": "exp2_resampling_aug",
        "n_features": 296,
        "cv_5fold": {
            "macro_f1_mean": mean_cv_f1,
            "macro_f1_std": std_cv_f1,
            "accuracy_mean": mean_cv_acc,
            "fold_macro_f1": cv_f1s,
        },
        "test_metrics_native": {
            "accuracy": float(test_acc_nat),
            "macro_f1": float(test_macro_f1_nat),
            "uar": float(test_uar_nat),
            "macro_precision": float(test_precision_nat),
            "per_class": per_class_nat,
            "confusion_matrix": cm_nat,
            "labels": labels,
        },
        "training_seconds": round(train_time, 2),
    }
    with open(EXP_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"Saved metrics to {EXP_DIR / 'metrics.json'}")
    return metrics


if __name__ == "__main__":
    train_exp2()

