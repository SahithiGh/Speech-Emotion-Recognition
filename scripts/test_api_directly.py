import requests
from pathlib import Path
import json
import io
import soundfile as sf
import numpy as np

API_URL = "http://127.0.0.1:8000/api/predict"

test_clips = [
    ("angry", "data/AudioWAV/1001_DFA_ANG_XX.wav"),
    ("disgust", "data/AudioWAV/1001_DFA_DIS_XX.wav"),
    ("fear", "data/AudioWAV/1001_DFA_FEA_XX.wav"),
    ("happy", "data/AudioWAV/1001_DFA_HAP_XX.wav"),
    ("neutral", "data/AudioWAV/1001_DFA_NEU_XX.wav"),
    ("sad", "data/AudioWAV/1001_DFA_SAD_XX.wav"),
    ("angry_2", "data/AudioWAV/1010_DFA_ANG_XX.wav"),
    ("disgust_2", "data/AudioWAV/1002_DFA_DIS_XX.wav"),
    ("fear_2", "data/AudioWAV/1010_DFA_FEA_XX.wav"),
    ("happy_2", "data/AudioWAV/1010_DFA_HAP_XX.wav"),
    ("neutral_2", "data/AudioWAV/1010_DFA_NEU_XX.wav"),
    ("sad_2", "data/AudioWAV/1002_DFA_SAD_XX.wav"),
]

print("==================================================================")
print("TESTING BACKEND API (http://127.0.0.1:8000/api/predict) DIRECTLY")
print("==================================================================")

for label, rel_path in test_clips:
    fpath = Path(rel_path)
    if not fpath.exists():
        print(f"Skipping {fpath}: does not exist")
        continue
    with open(fpath, "rb") as f:
        files = {"file": (fpath.name, f, "audio/wav")}
        resp = requests.post(API_URL, files=files)
    if resp.status_code == 200:
        data = resp.json()
        print(f"True: {label:10s} | Predicted: {data['emotion']:10s} | Conf: {data['confidence']:.3f} | Margin: {data['margin']:.3f} | Uncertain: {data['uncertain']} | Consistency: {data.get('consistency', {}).get('status')}")
    else:
        print(f"True: {label:10s} | FAILED status={resp.status_code} body={resp.text}")

print("\n--- Testing Silence on API ---")
buf = io.BytesIO()
sf.write(buf, np.zeros(16000 * 2, dtype=np.float32), 16000, format="WAV")
resp = requests.post(API_URL, files={"file": ("silence.wav", buf.getvalue(), "audio/wav")})
print(f"Silence response: status={resp.status_code}, body={resp.text}")

print("\n--- Testing Very Low Gain Ambient Mic Noise on API ---")
np.random.seed(42)
hiss = (np.random.randn(16000 * 2) * 0.0005).astype(np.float32)
buf = io.BytesIO()
sf.write(buf, hiss, 16000, format="WAV")
resp = requests.post(API_URL, files={"file": ("hiss.wav", buf.getvalue(), "audio/wav")})
print(f"Hiss response: status={resp.status_code}, body={resp.text}")
