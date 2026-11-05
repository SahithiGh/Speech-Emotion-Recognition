"""Investigate why specific external audio files produce Fear predictions in Option 2:
- Neutral2.wav
- Sad1.wav
- Sad2.wav
- angry_sample.wav
- Happy2.wav

Analyzes acoustic qualities, prosodic features, z-score deviations against CREMA-D,
and SVM decision function margins.
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
from app.audio import FEATURE_GROUPS, extract_features, load_audio_file
from app.dataset import parse_filename

OUTPUT_FILE = Path("experiments/external_investigation.json")


def analyze_clip(path: str, pipe, dev_X, dev_y, feature_names):
    scaler = pipe.named_steps["scale"]
    clf = pipe.named_steps["clf"]
    
    y = load_audio_file(path)
    sr = C.SAMPLE_RATE
    duration = len(y) / sr
    rms = float(np.sqrt(np.mean(y ** 2)))
    peak = float(np.max(np.abs(y)))
    crest = peak / (rms + 1e-8)
    
    # Prosody / Pitch
    f0 = librosa.yin(y, fmin=65, fmax=500, sr=sr)
    frame_rms = librosa.feature.rms(y=y)[0]
    n = min(len(f0), len(frame_rms))
    f0, r = f0[:n], frame_rms[:n]
    speech = r > 0.1 * r.max() if r.max() > 0 else np.ones(n, dtype=bool)
    fs = f0[speech] if speech.sum() >= 3 else f0
    
    pitch_mean = float(fs.mean())
    pitch_std = float(fs.std())
    pitch_p95 = float(np.percentile(fs, 95))
    pitch_p5 = float(np.percentile(fs, 5))
    pitch_range = pitch_p95 - pitch_p5
    speech_ratio = float(speech.mean())
    
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)))
    
    # Features & Z-scores
    feat = extract_features(y)
    z = (feat - scaler.mean_) / scaler.scale_
    
    # Model predictions
    feat_2d = feat.reshape(1, -1)
    probs = pipe.predict_proba(feat_2d)[0]
    pred = pipe.predict(feat_2d)[0]
    decision = clf.decision_function(scaler.transform(feat_2d))[0]
    
    prob_dict = {c: round(float(p), 4) for c, p in zip(pipe.classes_, probs)}
    
    # Identify top outlier features
    top_indices = np.argsort(np.abs(z))[-10:][::-1]
    top_outliers = []
    for idx in top_indices:
        # Determine feature group
        group_name = "unknown"
        for g, (label, desc, cols) in FEATURE_GROUPS.items():
            if idx in cols:
                group_name = f"{label} (col {idx})"
                break
        top_outliers.append({
            "col": int(idx),
            "group": group_name,
            "z_score": round(float(z[idx]), 2),
            "raw_val": round(float(feat[idx]), 3),
            "scaler_mean": round(float(scaler.mean_[idx]), 3),
            "scaler_std": round(float(scaler.scale_[idx]), 3),
        })
        
    # Distance to training class centroids
    scaled_feat = scaler.transform(feat_2d)[0]
    scaled_dev = scaler.transform(dev_X)
    class_distances = {}
    for emo in C.EMOTIONS:
        mask = (dev_y == emo)
        centroid_scaled = scaled_dev[mask].mean(axis=0)
        dist = float(np.linalg.norm(scaled_feat - centroid_scaled))
        class_distances[emo] = round(dist, 2)
        
    return {
        "file": os.path.basename(path),
        "acoustics": {
            "duration_seconds": round(duration, 2),
            "rms_energy": round(rms, 4),
            "peak_amplitude": round(peak, 4),
            "crest_factor": round(crest, 2),
            "pitch_mean_hz": round(pitch_mean, 1),
            "pitch_std_hz": round(pitch_std, 1),
            "pitch_range_hz": round(pitch_range, 1),
            "speech_ratio": round(speech_ratio, 2),
            "spectral_centroid_hz": round(centroid, 1),
            "spectral_flatness": round(flatness, 4),
            "spectral_rolloff_hz": round(rolloff, 1),
        },
        "prediction": {
            "predicted": pred,
            "confidence": round(float(probs.max()), 4),
            "probabilities": prob_dict,
            "decision_function_norm": round(float(np.linalg.norm(decision)), 3),
        },
        "distance_to_training_class_centroids": class_distances,
        "closest_training_class": min(class_distances, key=class_distances.get),
        "top_outlier_features": top_outliers,
    }


def main():
    print("=== Loading Option 2 Model and Development Reference Data ===")
    bundle = joblib.load("experiments/exp2_resampling_aug/model.joblib")
    pipe = bundle["pipeline"]
    
    cache = np.load("outputs/feature_cache.npz")
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    dev_speakers = set(split["development"])
    
    names = cache["names"]
    X = cache["X"]
    y_all = np.array([parse_filename(n)[1] for n in names])
    actors_all = np.array([parse_filename(n)[0] for n in names])
    dev_mask = np.isin(actors_all, list(dev_speakers))
    
    dev_X = X[dev_mask]
    dev_y = y_all[dev_mask]
    
    # Compute CREMA-D training acoustic norms for reference
    crema_pitch_means = []
    crema_pitch_stds = []
    # Pitch cols: 290 (mean), 291 (std), 292 (range)
    crema_pitch_norm = {
        "mean_hz": round(float(dev_X[:, 290].mean()), 1),
        "std_hz": round(float(dev_X[:, 291].mean()), 1),
        "range_hz": round(float(dev_X[:, 292].mean()), 1),
        "speech_ratio": round(float(dev_X[:, 293].mean()), 2),
    }
    
    target_files = [
        "external_datasets/audio_for_friend/sample_audio/Neutral2.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad1.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad2.wav",
        "external_datasets/audio_for_friend/sample_audio/angry_sample.wav",
        "external_datasets/audio_for_friend/sample_audio/Happy2.wav",
    ]
    
    investigations = []
    for f in target_files:
        if os.path.exists(f):
            print(f"Analyzing {os.path.basename(f)}...")
            res = analyze_clip(f, pipe, dev_X, dev_y, FEATURE_GROUPS)
            investigations.append(res)
            
    output = {
        "crema_training_reference": {
            "n_clips": len(dev_y),
            "pitch_norm": crema_pitch_norm,
        },
        "target_file_investigations": investigations,
    }
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        json.dump(output, out, indent=2)
    print(f"\nSaved investigation report to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

