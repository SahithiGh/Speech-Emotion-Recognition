import io
import numpy as np
import soundfile as sf
import sys
sys.path.insert(0, "backend")

from app.audio import prepare_signal, extract_features, FEATURE_GROUPS
from app.modelio import load_model

bundle = load_model()
pipeline = bundle["pipeline"]
scaler = pipeline.named_steps["scale"]
clf = pipeline.named_steps["clf"]

with open("data/AudioWAV/1001_DFA_NEU_XX.wav", "rb") as f:
    clean_bytes = f.read()

y_clean, sr = sf.read(io.BytesIO(clean_bytes), dtype="float32")
sig_clean = prepare_signal(y_clean, sr)
feat_clean = extract_features(sig_clean)

# Low gain + noise
np.random.seed(42)
y_noisy = (y_clean * 0.15) + (np.random.randn(len(y_clean)) * 0.001).astype(np.float32)
sig_noisy = prepare_signal(y_noisy, sr)
feat_noisy = extract_features(sig_noisy)

scaled_clean = scaler.transform(feat_clean.reshape(1, -1))[0]
scaled_noisy = scaler.transform(feat_noisy.reshape(1, -1))[0]

print("Feature comparison between Clean Neutral vs Noisy Neutral:")
diff = np.abs(scaled_noisy - scaled_clean)
top_diff_idx = np.argsort(diff)[::-1][:15]

for idx in top_diff_idx:
    group_name = "unknown"
    for g, (_, _, cols) in FEATURE_GROUPS.items():
        if idx in cols:
            group_name = g
            break
    print(f"Feature {idx:3d} ({group_name:10s}): clean={scaled_clean[idx]:.3f}, noisy={scaled_noisy[idx]:.3f}, diff={diff[idx]:.3f}")

print("\nPitch features (f0 mean, f0 std, f0 range, speech ratio, rms p10, rms p90):")
print("Raw clean pitch stats:", feat_clean[-6:])
print("Raw noisy pitch stats:", feat_noisy[-6:])
