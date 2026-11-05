import sys
from pathlib import Path
import numpy as np
import librosa
sys.path.insert(0, "backend")
from app import config as C

files = list(C.DATA_DIR.glob("*.wav"))
for f in files[:500]:
    y, sr = librosa.load(str(f), sr=16000, mono=True)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    if flatness > 0.10:
        print(f"High flatness clip: {f.name}, flatness={flatness:.4f}")
