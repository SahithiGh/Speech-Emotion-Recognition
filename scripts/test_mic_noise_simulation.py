import io
import numpy as np
import soundfile as sf
import sys
sys.path.insert(0, "backend")

from app.predict import predict_bytes

with open("data/AudioWAV/1001_DFA_NEU_XX.wav", "rb") as f:
    clean_bytes = f.read()

y, sr = sf.read(io.BytesIO(clean_bytes), dtype="float32")

# Test 4 different noise / scale levels
print("--- Testing different noise / mic levels on a TRUE NEUTRAL clip ---")
for noise_level in [0.0, 0.001, 0.003, 0.006]:
    for scale in [0.15, 0.3, 0.7]:
        np.random.seed(42)
        test_y = (y * scale) + (np.random.randn(len(y)) * noise_level).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, test_y, sr, format="WAV")
        try:
            res = predict_bytes(buf.getvalue())
            print(f"Scale: {scale:.2f}, Noise: {noise_level:.4f} -> Pred: {res['emotion']:8s} (conf={res['confidence']:.3f}, margin={res['margin']:.3f}, fear={res['scores'].get('fear',0):.3f}, neu={res['scores'].get('neutral',0):.3f})")
        except Exception as e:
            print(f"Scale: {scale:.2f}, Noise: {noise_level:.4f} -> REJECTED: {type(e).__name__}: {e}")
