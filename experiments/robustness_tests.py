"""Expanded Robustness and Perturbation Evaluation for Option 2 vs Baseline.

Tests held-out CREMA-D test clips across 8 acoustic and processing conditions:
1. Native 16 kHz Mono
2. 44.1 kHz -> 16 kHz (soxr_hq)
3. 48.0 kHz -> 16 kHz (soxr_hq)
4. Alternative Resampling (kaiser_fast via librosa or resample_poly)
5. Stereo Recording (2-channel with channel divergence -> mono average)
6. Duration Variation (2.0s snippet with speech trim/pad)
7. Mild Ambient White Noise (20 dB SNR)
8. Room Rumble / Pink Noise (15 dB SNR)
"""
import json
import os
import sys
import time
from pathlib import Path

import joblib
import librosa
import scipy.signal
import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

# Ensure paths
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import extract_features, load_audio_file, prepare_signal
from app.dataset import parse_filename

OUTPUT_FILE = Path("experiments/robustness_results.json")


def add_gaussian_noise(y: np.ndarray, target_snr_db: float = 20.0) -> np.ndarray:
    """Add zero-mean Gaussian noise to achieve target SNR."""
    signal_power = np.mean(y ** 2)
    if signal_power == 0:
        return y
    snr_linear = 10.0 ** (target_snr_db / 10.0)
    noise_power = signal_power / snr_linear
    noise = np.random.default_rng(42).normal(0.0, np.sqrt(noise_power), len(y)).astype(np.float32)
    return y + noise


def add_pink_noise(y: np.ndarray, target_snr_db: float = 15.0) -> np.ndarray:
    """Generate 1/f pink noise (low-frequency room rumble) and mix to target SNR."""
    signal_power = np.mean(y ** 2)
    if signal_power == 0:
        return y
    n = len(y)
    white = np.random.default_rng(42).standard_normal(n)
    # Simple IIR filter for 1/f slope
    pink = np.zeros(n, dtype=np.float32)
    b0, b1, b2 = 0.049922035, -0.095993537, 0.050612699
    a1, a2 = -2.494956002, 2.017265875
    y1 = y2 = 0.0
    for i in range(n):
        pink[i] = white[i] + 0.5 * (pink[i-1] if i > 0 else 0)
    pink = pink - np.mean(pink)
    pink_power = np.mean(pink ** 2)
    if pink_power == 0:
        return y
    snr_linear = 10.0 ** (target_snr_db / 10.0)
    scale = np.sqrt(signal_power / (snr_linear * pink_power))
    return y + (pink * scale).astype(np.float32)


def make_stereo_and_decode(y: np.ndarray) -> np.ndarray:
    """Simulate stereo recording with slight inter-channel delay and gain imbalance, then decode to mono."""
    left = y * 0.95
    right = np.roll(y, 3) * 1.05
    stereo = np.column_stack([left, right])
    # Standard backend decode path: average across channels
    return stereo.mean(axis=1).astype(np.float32)


def evaluate_condition_for_clip(path: Path):
    """Load clip and generate variants for testing."""
    y_raw = load_audio_file(str(path))
    variants = {}
    
    # 1. Native
    variants["1_native_16k"] = y_raw
    
    # 2. 44.1k -> 16k
    y_44 = librosa.resample(y_raw, orig_sr=16000, target_sr=44100)
    variants["2_resample_44k"] = librosa.resample(y_44, orig_sr=44100, target_sr=16000)
    
    # 3. 48.0k -> 16k
    y_48 = librosa.resample(y_raw, orig_sr=16000, target_sr=48000)
    variants["3_resample_48k"] = librosa.resample(y_48, orig_sr=48000, target_sr=16000)
    
    # 4. Alternative resampler: scipy polyphase (scipy.signal.resample_poly)
    y_48_scipy = scipy.signal.resample_poly(y_raw, 48000, 16000).astype(np.float32)
    variants["4_resample_scipy_poly"] = scipy.signal.resample_poly(y_48_scipy, 16000, 48000).astype(np.float32)
    
    # 5. Stereo simulation
    variants["5_stereo_mono"] = make_stereo_and_decode(y_raw)
    
    # 6. Duration truncation (fixed 2.0s centered window)
    target_samples = int(2.0 * 16000)
    if len(y_raw) > target_samples:
        start = (len(y_raw) - target_samples) // 2
        y_short = y_raw[start:start + target_samples]
    else:
        pad = target_samples - len(y_raw)
        y_short = np.pad(y_raw, (0, pad), mode="constant")
    variants["6_duration_2s"] = y_short
    
    # 7. Ambient white noise (20 dB SNR)
    variants["7_white_noise_20db"] = add_gaussian_noise(y_raw, 20.0)
    
    # 8. Room rumble / pink noise (15 dB SNR)
    variants["8_pink_noise_15db"] = add_pink_noise(y_raw, 15.0)
    
    return variants


def run_robustness_evaluation(sample_size: int = 250):
    print("=== Loading Models for Robustness Comparison ===")
    base_bundle = joblib.load("models/emotion_model.joblib")
    base_pipe = base_bundle["pipeline"]
    
    exp2_bundle = joblib.load("experiments/exp2_resampling_aug/model.joblib")
    exp2_pipe = exp2_bundle["pipeline"]
    
    # Identify held-out test clips
    cache = np.load("outputs/feature_cache.npz")
    names = cache["names"]
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    test_speakers = set(split["test"])
    
    test_clip_names = [n for n in names if parse_filename(n)[0] in test_speakers]
    print(f"Total held-out test clips: {len(test_clip_names)} across {len(test_speakers)} speakers.")
    
    rng = np.random.default_rng(42)
    selected_indices = rng.choice(len(test_clip_names), size=min(sample_size, len(test_clip_names)), replace=False)
    selected_names = [test_clip_names[i] for i in selected_indices]
    print(f"Evaluating {len(selected_names)} held-out clips across 8 acoustic conditions...")
    
    condition_names = [
        "1_native_16k",
        "2_resample_44k",
        "3_resample_48k",
        "4_resample_scipy_poly",
        "5_stereo_mono",
        "6_duration_2s",
        "7_white_noise_20db",
        "8_pink_noise_15db",
    ]
    
    labels = C.EMOTIONS
    ground_truth = []
    
    # Store predictions: {model_name: {condition: [preds]}}
    all_preds = {
        "baseline": {cond: [] for cond in condition_names},
        "option2": {cond: [] for cond in condition_names},
    }
    
    t0 = time.time()
    for idx, name in enumerate(selected_names, 1):
        if idx % 50 == 0 or idx == len(selected_names):
            print(f"  Processed {idx}/{len(selected_names)} clips ({time.time() - t0:.1f}s)...")
        actor, true_emo = parse_filename(name)
        ground_truth.append(true_emo)
        path = C.DATA_DIR / name
        
        variants = evaluate_condition_for_clip(path)
        
        for cond in condition_names:
            sig = variants[cond]
            # Peak normalize as prepare_signal does
            peak = float(np.max(np.abs(sig)))
            if peak > 0:
                sig = sig / peak * 0.9
            feat = extract_features(sig).reshape(1, -1)
            
            p_base = base_pipe.predict(feat)[0]
            p_exp2 = exp2_pipe.predict(feat)[0]
            
            all_preds["baseline"][cond].append(p_base)
            all_preds["option2"][cond].append(p_exp2)
            
    print(f"\nCompleted feature extraction and inference in {time.time() - t0:.1f}s.")
    
    # Compute metrics for each model and condition
    results = {}
    for model_key in ["baseline", "option2"]:
        results[model_key] = {}
        native_preds = all_preds[model_key]["1_native_16k"]
        
        for cond in condition_names:
            preds = all_preds[model_key][cond]
            acc = accuracy_score(ground_truth, preds)
            mf1 = f1_score(ground_truth, preds, average="macro", zero_division=0)
            uar = recall_score(ground_truth, preds, average="macro", zero_division=0)
            prec = precision_score(ground_truth, preds, average="macro", zero_division=0)
            agreement = float(np.mean([p == nat for p, nat in zip(preds, native_preds)]))
            fear_pct = float(np.mean([p == "fear" for p in preds]))
            
            per_class_rec = {}
            for emo in labels:
                mask = np.array(ground_truth) == emo
                rec = float(np.mean(np.array(preds)[mask] == emo)) if mask.any() else 0.0
                per_class_rec[emo] = round(rec, 4)
                
            results[model_key][cond] = {
                "accuracy": round(float(acc), 4),
                "macro_f1": round(float(mf1), 4),
                "uar": round(float(uar), 4),
                "precision": round(float(prec), 4),
                "agreement_with_native": round(agreement, 4),
                "fear_percentage": round(fear_pct, 4),
                "per_class_recall": per_class_rec,
            }
            
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Saved robustness results to {OUTPUT_FILE}")
    return results


if __name__ == "__main__":
    run_robustness_evaluation(sample_size=250)
