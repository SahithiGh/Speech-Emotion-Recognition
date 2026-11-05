import io
import numpy as np
import soundfile as sf
import sys
sys.path.insert(0, "backend")

from app.predict import predict_bytes

# Load several different emotions from CREMA-D
clips = [
    ("ANG", "data/AudioWAV/1001_DFA_ANG_XX.wav"),
    ("DIS", "data/AudioWAV/1001_DFA_DIS_XX.wav"),
    ("FEA", "data/AudioWAV/1001_DFA_FEA_XX.wav"),
    ("HAP", "data/AudioWAV/1001_DFA_HAP_XX.wav"),
    ("NEU", "data/AudioWAV/1001_DFA_NEU_XX.wav"),
    ("SAD", "data/AudioWAV/1001_DFA_SAD_XX.wav"),
]

print("Simulating clean speech with standard mic level (peak=0.5, no noise floor amplification):")
for code, path in clips:
    with open(path, "rb") as f:
        data = f.read()
    res = predict_bytes(data)
    print(f"True {code} -> Pred: {res['emotion']:8s} (conf={res['confidence']:.3f}, margin={res['margin']:.3f})")
