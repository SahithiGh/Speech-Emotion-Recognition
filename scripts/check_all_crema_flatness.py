import sys
from pathlib import Path
import numpy as np
import librosa
sys.path.insert(0, "backend")
from app import config as C

files = list(C.DATA_DIR.glob("*.wav"))
print(f"Checking {len(files)} clips for spectral flatness and dynamic range...")

# Sample 500 clips across all emotions and actors
np.random.seed(42)
sampled = np.random.choice(files, size=500, replace=False)

flatnesses = []
p90_p10_ratios = []

for f in sampled:
    y, sr = librosa.load(str(f), sr=16000, mono=True)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    flatnesses.append(flatness)
    frame_rms = librosa.feature.rms(y=y, frame_length=512, hop_length=160)[0]
    p90 = np.percentile(frame_rms, 90)
    p10 = np.percentile(frame_rms, 10)
    p90_p10_ratios.append(p90 / (p10 + 1e-6))

print(f"Flatness across 500 CREMA-D clips:")
print(f"  mean = {np.mean(flatnesses):.4f}")
print(f"  median = {np.median(flatnesses):.4f}")
print(f"  p95 = {np.percentile(flatnesses, 95):.4f}")
print(f"  p99 = {np.percentile(flatnesses, 99):.4f}")
print(f"  max = {np.max(flatnesses):.4f}")

print(f"Dynamic range ratio (p90 / p10):")
print(f"  mean = {np.mean(p90_p10_ratios):.2f}")
print(f"  min = {np.min(p90_p10_ratios):.2f}")
print(f"  p5 = {np.percentile(p90_p10_ratios, 5):.2f}")
