import os
import sys
sys.path.insert(0, os.path.abspath("."))
import numpy as np
import joblib
from backend.app.audio import load_audio_file, extract_features

bundle = joblib.load('models/emotion_model.joblib')
scaler = bundle['pipeline'].named_steps['scale']

files = [
    ('Neutral1.wav', 'external_datasets/audio_for_friend/sample_audio/Neutral1.wav'),
    ('Sad1.wav', 'external_datasets/audio_for_friend/sample_audio/Sad1.wav'),
    ('angry_sample.wav', 'external_datasets/audio_for_friend/sample_audio/angry_sample.wav'),
    ('Happy2.wav', 'external_datasets/audio_for_friend/sample_audio/Happy2.wav'),
    ('real_voice.wav', 'external_datasets/audio_for_friend/sample_audio/real_voice.wav')
]

feature_indices = [
    ('MFCC 1 (Mean)', 0),
    ('MFCC 2 (Mean)', 1),
    ('MFCC 3 (Mean)', 2),
    ('Spectral Centroid (Mean)', 278),
    ('Zero Crossing Rate (Mean)', 282),
    ('RMS Energy (Mean)', 283),
    ('Spectral Contrast Band 0 (Mean)', 264),
    ('Spectral Contrast Band 3 (Mean)', 267),
    ('Spectral Contrast Band 6 (Mean)', 270),
    ('Pitch F0 Mean (Hz)', 290),
    ('Pitch F0 Std', 291),
    ('Speech Ratio', 293)
]

print("=== RAW FEATURE VALUES ACROSS THE 5 RECORDINGS ===")
header = f"{'Feature Name':<32} | " + " | ".join([f"{f[0]:<15}" for f in files]) + " | CREMA-D Mean (Std)"
print(header)
print("-" * len(header))

for fname, fidx in feature_indices:
    vals = []
    for name, path in files:
        y = load_audio_file(path)
        feat = extract_features(y)
        vals.append(f"{feat[fidx]:>15.2f}")
    crema_stat = f"{scaler.mean_[fidx]:>8.2f} (+/- {scaler.scale_[fidx]:.2f})"
    print(f"{fname:<32} | " + " | ".join(vals) + f" | {crema_stat}")

print("\n=== STANDARDIZED (Z-SCORE) FEATURE VALUES ===")
header_z = f"{'Feature Name':<32} | " + " | ".join([f"{f[0]:<15}" for f in files])
print(header_z)
print("-" * len(header_z))

for fname, fidx in feature_indices:
    vals = []
    for name, path in files:
        y = load_audio_file(path)
        feat = extract_features(y)
        z = (feat[fidx] - scaler.mean_[fidx]) / scaler.scale_[fidx]
        vals.append(f"{z:>15.2f}")
    print(f"{fname:<32} | " + " | ".join(vals))

