import sys
sys.path.insert(0, "backend")
import librosa
import numpy as np
from app import config as C

files = list(C.DATA_DIR.glob("*.wav"))[:100]
flatnesses = []
snrs = []
centroids = []
zcrs = []

for f in files:
    y, sr = librosa.load(str(f), sr=16000, mono=True)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=16000)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
    flatnesses.append(flatness)
    centroids.append(centroid)
    zcrs.append(zcr)

print(f"CREMA-D 100 clips stats:")
print(f"Spectral Flatness: mean={np.mean(flatnesses):.4f}, max={np.max(flatnesses):.4f}, p95={np.percentile(flatnesses, 95):.4f}")
print(f"Spectral Centroid: mean={np.mean(centroids):.1f}, max={np.max(centroids):.1f}, p95={np.percentile(centroids, 95):.1f}")
print(f"Zero Crossing Rate: mean={np.mean(zcrs):.4f}, max={np.max(zcrs):.4f}, p95={np.percentile(zcrs, 95):.4f}")
