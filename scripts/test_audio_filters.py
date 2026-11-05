import sys
from pathlib import Path
import numpy as np
import librosa
sys.path.insert(0, "backend")
from app import config as C

files = list(C.DATA_DIR.glob("*.wav"))[:200]
failed = []

for f in files:
    y, sr = librosa.load(str(f), sr=16000, mono=True)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    if flatness > 0.22:
        failed.append((f.name, f"flatness={flatness:.3f}"))
        continue
    y_trim, _ = librosa.effects.trim(y, top_db=C.TRIM_TOP_DB)
    peak = float(np.max(np.abs(y_trim)))
    if peak < 0.02:
        failed.append((f.name, f"peak={peak:.3f}"))
        continue
    t_rms = librosa.feature.rms(y=y_trim, frame_length=512, hop_length=160)[0]
    p90 = float(np.percentile(t_rms, 90))
    p10 = float(np.percentile(t_rms, 10))
    if p90 < 0.012 or (p90 / (p10 + 1e-5)) < 1.8:
        failed.append((f.name, f"dynamic_range={p90/(p10+1e-5):.2f}, p90={p90:.3f}"))

print(f"Tested 200 CREMA-D files against audio filter.")
print(f"Failed count: {len(failed)}")
if failed:
    print(f"First 5 failed: {failed[:5]}")
