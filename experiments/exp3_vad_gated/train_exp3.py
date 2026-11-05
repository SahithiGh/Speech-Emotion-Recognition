"""Train Experiment 3: VAD-Gated Feature Model with Resampling Augmentation.

Candidate Option 3:
- Feature extraction: 296 features with Candidate A VAD-gating
- Resampling augmentation: 50% of dev clips augmented with 48k -> 16k resampling
- Model architecture: SVC(C=5.0, kernel='rbf', class_weight='balanced', probability=True)
- Training data: 77 development speakers (6,295 clips), speaker-disjoint from test set
- Scaler and OOD threshold calibrated exclusively on development data
"""
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import joblib
import librosa
import numpy as np
from joblib import Parallel, delayed
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

# Ensure root & backend in path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import prepare_signal
from app.dataset import parse_filename, speaker_folds
from experiments.exp3_vad_gated.features_exp3 import N_FEATURES, extract_features_exp3

EXP_DIR = Path("experiments/exp3_vad_gated")
EXP_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR = Path("models/candidate_option3")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

NATIVE_CACHE_PATH = EXP_DIR / "vad_native_cache.npz"
RESAMPLED_DEV_CACHE_PATH = EXP_DIR / "vad_resampled_dev_cache.npz"
RESAMPLED_TEST_CACHE_PATH = EXP_DIR / "vad_resampled_test_cache.npz"


def _extract_vad_native(path_str: str) -> np.ndarray:
    """Load audio, prepare signal, and extract 296 VAD-gated features."""
    try:
        y, sr = librosa.load(path_str, sr=16000, mono=True)
        y = prepare_signal(y, sr)
        return extract_features_exp3(y, vad_candidate="A")
    except Exception as exc:
        print(f"Error extracting native VAD features for {path_str}: {exc}")
        return None


def _extract_vad_resampled(path_str: str) -> np.ndarray:
    """Simulate 48kHz -> 16kHz resampling, prepare signal, and extract 296 VAD-gated features."""
    try:
        y, sr = librosa.load(path_str, sr=16000, mono=True)
        y = prepare_signal(y, sr)
        # Resample up to 48kHz, then back to 16kHz using librosa's standard anti-aliasing filter
        y_48k = librosa.resample(y, orig_sr=16000, target_sr=48000)
        y_16k = librosa.resample(y_48k, orig_sr=48000, target_sr=16000)
        y_16k = y_16k / np.max(np.abs(y_16k)) * 0.9
        return extract_features_exp3(y_16k, vad_candidate="A")
    except Exception as exc:
        print(f"Error extracting resampled VAD features for {path_str}: {exc}")
        return None


def get_native_vad_features(all_paths: list, names: list, jobs: int = 12) -> tuple:
    """Extract or load cached native VAD features for all files."""
    if NATIVE_CACHE_PATH.exists():
        print(f"Loading cached native VAD features from {NATIVE_CACHE_PATH}...")
        data = np.load(NATIVE_CACHE_PATH)
        return data["names"], data["X"], data["y"], data["actors"]

    print(f"Extracting native VAD-gated features for {len(all_paths)} files with {jobs} workers...")
    t0 = time.time()
    results = Parallel(n_jobs=jobs, batch_size=32)(delayed(_extract_vad_native)(str(p)) for p in all_paths)

    valid_names, valid_X, valid_y, valid_actors = [], [], [], []
    for name, path, feat in zip(names, all_paths, results):
        if feat is not None and len(feat) == N_FEATURES:
            actor, emotion = parse_filename(name)
            valid_names.append(name)
            valid_X.append(feat)
            valid_y.append(emotion)
            valid_actors.append(actor)

    print(f"Native VAD extraction completed in {time.time() - t0:.1f}s ({len(valid_X)} valid clips).")
    names_arr = np.array(valid_names)
    X_arr = np.stack(valid_X)
    y_arr = np.array(valid_y)
    actors_arr = np.array(valid_actors)

    np.savez_compressed(
        NATIVE_CACHE_PATH,
        names=names_arr,
        X=X_arr,
        y=y_arr,
        actors=actors_arr,
    )
    return names_arr, X_arr, y_arr, actors_arr


def get_resampled_vad_features(paths: list, names: list, cache_path: Path, jobs: int = 12) -> dict:
    """Extract or load cached resampled VAD features."""
    if cache_path.exists():
        print(f"Loading cached resampled VAD features from {cache_path}...")
        data = np.load(cache_path)
        return {n: f for n, f in zip(data["names"], data["X"])}

    print(f"Extracting resampled VAD features for {len(paths)} files with {jobs} workers...")
    t0 = time.time()
    results = Parallel(n_jobs=jobs, batch_size=32)(delayed(_extract_vad_resampled)(str(p)) for p in paths)

    res_dict = {}
    valid_names, valid_X = [], []
    for n, f in zip(names, results):
        if f is not None and len(f) == N_FEATURES:
            res_dict[n] = f
            valid_names.append(n)
            valid_X.append(f)

    print(f"Resampled extraction completed in {time.time() - t0:.1f}s. Saving to {cache_path}...")
    np.savez_compressed(cache_path, names=np.array(valid_names), X=np.stack(valid_X))
    return res_dict


def train_candidate_option3():
    print("=" * 80)
    print("EXPERIMENT 3 TRAINING: VAD-GATED CANDIDATE MODEL")
    print("=" * 80)

    # 1. Dataset & Split Verification
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)

    dev_speakers = set(split["development"])
    test_speakers = set(split["test"])
    audio_dir = Path("data/AudioWAV")
    all_wavs = sorted(list(audio_dir.glob("*.wav")))
    all_names = [p.name for p in all_wavs]

    print(f"Total audio files found: {len(all_wavs)}")
    print(f"Development speakers: {len(dev_speakers)}, Held-out test speakers: {len(test_speakers)}")

    # 2. Extract or load Native VAD features
    names_all, X_native_all, y_all, actors_all = get_native_vad_features(all_wavs, all_names)

    # Partition by speaker split
    dev_mask = np.isin(actors_all, list(dev_speakers))
    test_mask = np.isin(actors_all, list(test_speakers))

    dev_names = names_all[dev_mask]
    Xd_native = X_native_all[dev_mask]
    yd = y_all[dev_mask]
    gd = actors_all[dev_mask]

    test_names = names_all[test_mask]
    Xte_native = X_native_all[test_mask]
    yte = y_all[test_mask]
    gte = actors_all[test_mask]

    print(f"Development set: {len(yd)} clips | Held-out test set: {len(yte)} clips")
    # Note: 1076_MTI_SAD_XX.wav is silent in CREMA-D and skipped by prepare_signal (6,294 valid dev clips).
    assert len(yd) == 6294, f"Expected 6,294 dev clips, got {len(yd)}"
    assert len(yte) == 1147, f"Expected 1,147 test clips, got {len(yte)}"
    assert len(set(gd).intersection(set(gte))) == 0, "Speaker leakage detected!"

    # 3. Resampling Augmentation for 50% of Development Clips
    rng = np.random.default_rng(42)
    resample_subset_mask = rng.random(len(dev_names)) < 0.5
    dev_resample_targets = dev_names[resample_subset_mask]
    dev_resample_paths = [audio_dir / n for n in dev_resample_targets]
    print(f"Selected {len(dev_resample_targets)} development clips (~50%) for resampling augmentation.")

    resampled_dev_dict = get_resampled_vad_features(dev_resample_paths, dev_resample_targets.tolist(), RESAMPLED_DEV_CACHE_PATH)

    Xd_aug = Xd_native.copy()
    num_augmented = 0
    for idx, (is_resampled, name) in enumerate(zip(resample_subset_mask, dev_names)):
        if is_resampled and name in resampled_dev_dict:
            Xd_aug[idx] = resampled_dev_dict[name]
            num_augmented += 1

    print(f"Augmented development matrix ready: {num_augmented} clips resampled, {len(dev_names) - num_augmented} native.")

    # Also pre-extract resampled features for all held-out test clips for evaluation
    test_paths = [audio_dir / n for n in test_names]
    resampled_test_dict = get_resampled_vad_features(test_paths, test_names.tolist(), RESAMPLED_TEST_CACHE_PATH)
    Xte_resampled = np.stack([resampled_test_dict[n] for n in test_names])

    # 4. 5-Fold Speaker-Grouped Cross-Validation on Development Data Only
    print("\nRunning 5-fold speaker-grouped cross-validation on augmented development set...")
    folds = speaker_folds(yd, gd, k=C.CV_FOLDS, seed=C.RANDOM_SEED)
    cv_f1s, cv_accs = [], []
    for fold_idx, (tr, va) in enumerate(folds, 1):
        pipe_cv = Pipeline([
            ("scale", StandardScaler()),
            ("clf", SVC(C=5.0, kernel="rbf", gamma="scale", class_weight="balanced", probability=False, random_state=42))
        ])
        pipe_cv.fit(Xd_aug[tr], yd[tr])
        p_va = pipe_cv.predict(Xd_aug[va])
        f1 = f1_score(yd[va], p_va, average="macro", zero_division=0)
        acc = accuracy_score(yd[va], p_va)
        cv_f1s.append(f1)
        cv_accs.append(acc)
        print(f"  Fold {fold_idx}: macro F1 = {f1:.4f}, accuracy = {acc:.4f}")

    mean_cv_f1 = float(np.mean(cv_f1s))
    mean_cv_acc = float(np.mean(cv_accs))
    print(f"Mean CV Macro F1: {mean_cv_f1:.4f} (+/- {np.std(cv_f1s):.4f}) | Mean CV Accuracy: {mean_cv_acc:.4f}")

    # 5. Train Final Model on 100% of Development Set
    print("\nFitting final Candidate Option 3 model on full augmented development set...")
    t_train_start = time.time()
    final_scaler = StandardScaler()
    Xd_aug_scaled = final_scaler.fit_transform(Xd_aug)

    final_clf = SVC(
        C=5.0,
        kernel="rbf",
        gamma="scale",
        class_weight="balanced",
        probability=True,
        random_state=42,
    )
    final_clf.fit(Xd_aug_scaled, yd)
    train_duration = time.time() - t_train_start
    print(f"Model fitting completed in {train_duration:.2f}s. Support vectors: {len(final_clf.support_)}")

    final_pipeline = Pipeline([
        ("scale", final_scaler),
        ("clf", final_clf),
    ])

    # 6. OOD Calibration Exclusively on Development Data
    print("\nCalibrating OOD threshold using development data only...")
    # Calculate peak standardized deviation for each dev sample
    z_dev = np.abs(Xd_aug_scaled)
    max_z_per_dev_sample = np.max(z_dev, axis=1)

    p99 = float(np.percentile(max_z_per_dev_sample, 99.0))
    p995 = float(np.percentile(max_z_per_dev_sample, 99.5))
    p999 = float(np.percentile(max_z_per_dev_sample, 99.9))
    max_dev_z = float(np.max(max_z_per_dev_sample))

    # We set the calibrated threshold at the 99.9th percentile of dev data to allow < 0.1% false positives
    calibrated_ood_threshold = round(p999, 2)
    print(f"Dev data max deviations: 99th={p99:.2f}, 99.5th={p995:.2f}, 99.9th={p999:.2f}, absolute max={max_dev_z:.2f}")
    print(f"Setting Candidate Option 3 Calibrated OOD Threshold = {calibrated_ood_threshold}")

    # Measure false positive rate on held-out test set
    z_test = np.abs(final_scaler.transform(Xte_native))
    max_z_test = np.max(z_test, axis=1)
    test_fp_count = int(np.sum(max_z_test > calibrated_ood_threshold))
    test_fp_rate = float(test_fp_count / len(max_z_test))
    print(f"Held-out test set false alarm rate at threshold {calibrated_ood_threshold}: {test_fp_rate:.2%} ({test_fp_count}/{len(max_z_test)})")

    # 7. Evaluate on Held-Out Test Set (Native & Resampled)
    print("\nEvaluating Candidate Option 3 on strictly held-out test set (14 unseen speakers)...")
    pred_test_native = final_pipeline.predict(Xte_native)
    prob_test_native = final_pipeline.predict_proba(Xte_native)
    acc_native = accuracy_score(yte, pred_test_native)
    bal_acc_native = balanced_accuracy_score(yte, pred_test_native)
    macro_f1_native = f1_score(yte, pred_test_native, average="macro", zero_division=0)
    rep_native = classification_report(yte, pred_test_native, output_dict=True, zero_division=0)
    cm_native = confusion_matrix(yte, pred_test_native, labels=final_clf.classes_).tolist()

    pred_test_resamp = final_pipeline.predict(Xte_resampled)
    acc_resamp = accuracy_score(yte, pred_test_resamp)
    macro_f1_resamp = f1_score(yte, pred_test_resamp, average="macro", zero_division=0)
    agreement = float(np.mean(pred_test_native == pred_test_resamp))

    print(f"Held-Out Native 16k:   Accuracy = {acc_native:.4f}, Balanced Acc = {bal_acc_native:.4f}, Macro F1 = {macro_f1_native:.4f}")
    print(f"Held-Out Resampled 48k: Accuracy = {acc_resamp:.4f}, Macro F1 = {macro_f1_resamp:.4f}")
    print(f"Prediction Agreement (Native vs Resampled): {agreement:.2%}")

    # 8. Save Artifacts in models/candidate_option3/
    metadata = {
        "model_profile": "candidate_option3",
        "description": "CREMA-D SVM with VAD-Gating (Candidate A) and Multi-Rate Resampling Augmentation",
        "vad_candidate": "A (Adaptive Energy + Spectral Flatness + Hangover Dilation)",
        "feature_version": "v3_vad_gated_296",
        "n_features": 296,
        "sample_rate": 16000,
        "classes": final_clf.classes_.tolist(),
        "n_train_samples": len(yd),
        "n_test_samples": len(yte),
        "dev_speakers_count": len(dev_speakers),
        "test_speakers_count": len(test_speakers),
        "training_resampled_fraction": 0.5,
        "calibrated_ood_threshold": calibrated_ood_threshold,
        "ood_false_positive_rate_test": test_fp_rate,
        "cv_mean_macro_f1": round(mean_cv_f1, 4),
        "test_native_macro_f1": round(macro_f1_native, 4),
        "test_native_accuracy": round(acc_native, 4),
        "test_native_balanced_acc": round(bal_acc_native, 4),
        "test_resampled_macro_f1": round(macro_f1_resamp, 4),
        "test_resampled_accuracy": round(acc_resamp, 4),
        "native_vs_resampled_agreement": round(agreement, 4),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    bundle = {
        "pipeline": final_pipeline,
        "labels": final_clf.classes_,
        "preprocessing": {
            "sample_rate": 16000,
            "min_seconds": 0.5,
            "max_seconds": 6.0,
            "silence_rms": 0.008,
            "trim_top_db": 20,
            "n_mfcc": 40,
            "n_mels": 40,
            "peak_normalise": 0.9,
            "feature_version": "v3_vad_gated_296",
            "n_features": 296,
            "vad_candidate": "A",
            "vad_hangover_frames": 1,
            "calibrated_ood_threshold": calibrated_ood_threshold,
        },
        "experiment": metadata,
    }

    model_path = MODEL_DIR / "emotion_model.joblib"
    joblib.dump(bundle, model_path)
    print(f"\nSaved model bundle to {model_path} ({model_path.stat().st_size:,} bytes)")

    config_path = MODEL_DIR / "preprocessing_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(bundle["preprocessing"], f, indent=2)

    metrics_path = MODEL_DIR / "metrics.json"
    metrics_data = {
        "metadata": metadata,
        "classification_report_native": rep_native,
        "confusion_matrix_native": cm_native,
        "classes": final_clf.classes_.tolist(),
    }
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    # 9. Compute Hashes
    def sha256_of_file(p):
        h = hashlib.sha256()
        with open(p, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()

    hashes = {
        "models/candidate_option3/emotion_model.joblib": sha256_of_file(model_path),
        "models/candidate_option3/preprocessing_config.json": sha256_of_file(config_path),
        "models/candidate_option3/metrics.json": sha256_of_file(metrics_path),
    }
    with open(EXP_DIR / "candidate_option3_hashes.json", "w", encoding="utf-8") as f:
        json.dump(hashes, f, indent=2)

    print("\nCandidate Option 3 SHA256 Hashes:")
    for fn, h in hashes.items():
        print(f"  {fn}: {h}")

    print("\n[OK] Phase 3 Training and Artifact Generation Completed.")


if __name__ == "__main__":
    train_candidate_option3()
