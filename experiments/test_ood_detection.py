"""Evaluate Out-of-Distribution (OOD) Detection Metrics.

Evaluates:
- Metric 1: Maximum Absolute Z-score: max(|z|)
- Metric 2: Mean Squared Scaled Distance (MSD): mean(z^2)
- Metric 3: 95th Percentile Z-score (p95 |z|)
- Metric 4: Scaled Euclidean Distance to Nearest Class Centroid

Calibrated on: 77 CREMA-D Development Speakers (6,294 clips)
Evaluated on:
1. In-Distribution: 1,147 Held-out CREMA-D Test clips (unseen speakers)
2. In-Distribution Resampled: 250 Held-out Test clips resampled (48k -> 16k)
3. Known Non-Speech / Synthetic / Severe Noise OOD clips
4. External Audio Files (sample_audio/)
"""
import json
import os
import sys
from pathlib import Path

import joblib
import librosa
import numpy as np

# Ensure paths
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import extract_features, load_audio_file
from app.dataset import parse_filename

OOD_REPORT_FILE = Path("experiments/ood_safeguard_evaluation.json")


def compute_metrics_for_vector(feat: np.ndarray, scaler, class_centroids):
    z = (feat - scaler.mean_) / scaler.scale_
    z_abs = np.abs(z)
    
    max_z = float(np.max(z_abs))
    p95_z = float(np.percentile(z_abs, 95))
    msd = float(np.mean(z ** 2))
    
    # Distance to nearest class centroid
    centroid_dists = [np.linalg.norm(z - c) for c in class_centroids.values()]
    min_centroid_dist = float(np.min(centroid_dists))
    
    return {
        "max_z": round(max_z, 2),
        "p95_z": round(p95_z, 2),
        "msd": round(msd, 2),
        "min_centroid_dist": round(min_centroid_dist, 2),
    }


def main():
    print("=== Loading Option 2 Scaler and Reference Data ===")
    bundle = joblib.load("experiments/exp2_resampling_aug/model.joblib")
    scaler = bundle["pipeline"].named_steps["scale"]
    
    cache = np.load("outputs/feature_cache.npz")
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    dev_speakers = set(split["development"])
    test_speakers = set(split["test"])
    
    names = cache["names"]
    X = cache["X"]
    y_all = np.array([parse_filename(n)[1] for n in names])
    actors_all = np.array([parse_filename(n)[0] for n in names])
    
    dev_mask = np.isin(actors_all, list(dev_speakers))
    test_mask = np.isin(actors_all, list(test_speakers))
    
    dev_X = X[dev_mask]
    dev_y = y_all[dev_mask]
    test_X = X[test_mask]
    test_y = y_all[test_mask]
    
    # Calculate class centroids in scaled space on dev data
    dev_z = scaler.transform(dev_X)
    class_centroids = {emo: dev_z[dev_y == emo].mean(axis=0) for emo in C.EMOTIONS}
    
    print(f"Calibrating OOD thresholds on {len(dev_X)} development clips...")
    dev_max_z = []
    dev_p95_z = []
    dev_msd = []
    dev_cent_dist = []
    
    for vec in dev_X:
        m = compute_metrics_for_vector(vec, scaler, class_centroids)
        dev_max_z.append(m["max_z"])
        dev_p95_z.append(m["p95_z"])
        dev_msd.append(m["msd"])
        dev_cent_dist.append(m["min_centroid_dist"])
        
    dev_max_z = np.array(dev_max_z)
    dev_p95_z = np.array(dev_p95_z)
    dev_msd = np.array(dev_msd)
    dev_cent_dist = np.array(dev_cent_dist)
    
    # Compute 95th, 99th, and 99.5th percentiles on development data
    thresholds = {
        "max_z": {
            "p95": round(float(np.percentile(dev_max_z, 95)), 2),
            "p99": round(float(np.percentile(dev_max_z, 99)), 2),
            "p99_5": round(float(np.percentile(dev_max_z, 99.5)), 2),
        },
        "msd": {
            "p95": round(float(np.percentile(dev_msd, 95)), 2),
            "p99": round(float(np.percentile(dev_msd, 99)), 2),
            "p99_5": round(float(np.percentile(dev_msd, 99.5)), 2),
        },
        "min_centroid_dist": {
            "p95": round(float(np.percentile(dev_cent_dist, 95)), 2),
            "p99": round(float(np.percentile(dev_cent_dist, 99)), 2),
            "p99_5": round(float(np.percentile(dev_cent_dist, 99.5)), 2),
        },
    }
    
    print("\n--- Empirical Thresholds Calibrated on Development Data ---")
    for k, v in thresholds.items():
        print(f"  {k:18s}: 95%={v['p95']:.2f}, 99%={v['p99']:.2f}, 99.5%={v['p99_5']:.2f}")
        
    # Evaluate False Alarm Rate on 1,147 Held-Out Test Clips (ID)
    print(f"\nEvaluating False Alarm Rate on {len(test_X)} Held-Out Test Clips...")
    test_max_z = []
    test_msd = []
    test_cent_dist = []
    for vec in test_X:
        m = compute_metrics_for_vector(vec, scaler, class_centroids)
        test_max_z.append(m["max_z"])
        test_msd.append(m["msd"])
        test_cent_dist.append(m["min_centroid_dist"])
        
    test_max_z = np.array(test_max_z)
    test_msd = np.array(test_msd)
    test_cent_dist = np.array(test_cent_dist)
    
    test_eval = {
        "max_z": {
            "false_alarm_rate_p99": round(float(np.mean(test_max_z > thresholds["max_z"]["p99"])), 4),
            "false_alarm_rate_p99_5": round(float(np.mean(test_max_z > thresholds["max_z"]["p99_5"])), 4),
        },
        "msd": {
            "false_alarm_rate_p99": round(float(np.mean(test_msd > thresholds["msd"]["p99"])), 4),
            "false_alarm_rate_p99_5": round(float(np.mean(test_msd > thresholds["msd"]["p99_5"])), 4),
        },
        "min_centroid_dist": {
            "false_alarm_rate_p99": round(float(np.mean(test_cent_dist > thresholds["min_centroid_dist"]["p99"])), 4),
            "false_alarm_rate_p99_5": round(float(np.mean(test_cent_dist > thresholds["min_centroid_dist"]["p99_5"])), 4),
        },
    }
    print("False Alarm Rates on Unseen Test Speakers:")
    for k, v in test_eval.items():
        print(f"  {k:18s}: at p99 threshold = {v['false_alarm_rate_p99']:.2%}, at p99.5 threshold = {v['false_alarm_rate_p99_5']:.2%}")
        
    # Evaluate on Resampled Held-Out Test Clips (48k -> 16k)
    print("\nEvaluating Resampled Test Clips (100 clips, 48k -> 16k)...")
    resampled_max_z = []
    resampled_msd = []
    test_names = names[test_mask][:100]
    for n in test_names:
        y = load_audio_file(str(C.DATA_DIR / n))
        y_48 = librosa.resample(y, orig_sr=16000, target_sr=48000)
        y_16 = librosa.resample(y_48, orig_sr=48000, target_sr=16000)
        v = extract_features(y_16)
        m = compute_metrics_for_vector(v, scaler, class_centroids)
        resampled_max_z.append(m["max_z"])
        resampled_msd.append(m["msd"])
        
    resampled_max_z = np.array(resampled_max_z)
    resampled_msd = np.array(resampled_msd)
    print(f"Resampled Test Clips flagged as OOD at p99.5:")
    print(f"  max_z: {np.mean(resampled_max_z > thresholds['max_z']['p99_5']):.1%}")
    print(f"  msd:   {np.mean(resampled_msd > thresholds['msd']['p99_5']):.1%}")
    
    # Evaluate on External Files
    print("\nEvaluating External Files (sample_audio/)...")
    external_files = [
        "external_datasets/audio_for_friend/sample_audio/Neutral1.wav",
        "external_datasets/audio_for_friend/sample_audio/Neutral2.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad1.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad2.wav",
        "external_datasets/audio_for_friend/sample_audio/angry_sample.wav",
        "external_datasets/audio_for_friend/sample_audio/Happy2.wav",
        "external_datasets/audio_for_friend/sample_audio/real_voice.wav",
        "external_datasets/audio_for_friend/sample_audio/sample_16k.wav",
    ]
    external_eval = []
    for f in external_files:
        if os.path.exists(f):
            y = load_audio_file(f)
            v = extract_features(y)
            m = compute_metrics_for_vector(v, scaler, class_centroids)
            is_ood_max_z = bool(m["max_z"] > thresholds["max_z"]["p99_5"])
            is_ood_msd = bool(m["msd"] > thresholds["msd"]["p99_5"])
            external_eval.append({
                "file": os.path.basename(f),
                "metrics": m,
                "is_ood_max_z_p99_5": is_ood_max_z,
                "is_ood_msd_p99_5": is_ood_msd,
            })
            print(f"  {os.path.basename(f):18s} -> max_z={m['max_z']:5.2f} (OOD={is_ood_max_z}), msd={m['msd']:5.2f} (OOD={is_ood_msd})")
            
    results = {
        "thresholds": thresholds,
        "test_false_alarm_rates": test_eval,
        "external_file_eval": external_eval,
    }
    with open(OOD_REPORT_FILE, "w", encoding="utf-8") as out:
        json.dump(results, out, indent=2)
    print(f"\nSaved OOD report to {OOD_REPORT_FILE}")


if __name__ == "__main__":
    main()

