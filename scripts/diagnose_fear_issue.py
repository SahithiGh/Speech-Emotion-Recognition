import os
import sys
import json
from pathlib import Path
import numpy as np

sys.path.insert(0, "backend")

from app import config as C
from app.audio import extract_features, load_audio_bytes, load_raw_signal
from app.modelio import load_model, load_metrics
from app.predict import get_bundle, predict_bytes

print("=================================================================")
print("DIAGNOSIS STEP 1 & 2: Inspect Model, Pipeline, and Classes")
print("=================================================================")

bundle = load_model()
pipeline = bundle["pipeline"]
print(f"Model path: {C.MODEL_PATH}")
print(f"Pipeline steps: {pipeline.named_steps}")
scaler = pipeline.named_steps.get("scaler")
clf = pipeline.named_steps.get("clf")
print(f"Scaler: {scaler}")
print(f"Classifier: {type(clf)} - {clf}")
print(f"Classes in pipeline: {pipeline.classes_}")
if hasattr(clf, "classes_"):
    print(f"Classes in clf: {clf.classes_}")
if hasattr(clf, "intercept_"):
    print(f"CLF Intercepts shape: {clf.intercept_.shape}")
    print(f"CLF Intercepts: {clf.intercept_}")

print("\n=================================================================")
print("DIAGNOSIS STEP 1: Direct Inference on Known CREMA-D Clips")
print("=================================================================")

samples = {
    "ANG": ["1001_DFA_ANG_XX.wav", "1002_DFA_ANG_XX.wav", "1010_DFA_ANG_XX.wav", "1015_DFA_ANG_XX.wav"],
    "DIS": ["1001_DFA_DIS_XX.wav", "1002_DFA_DIS_XX.wav", "1010_DFA_DIS_XX.wav", "1015_DFA_DIS_XX.wav"],
    "FEA": ["1001_DFA_FEA_XX.wav", "1002_DFA_FEA_XX.wav", "1010_DFA_FEA_XX.wav", "1015_DFA_FEA_XX.wav"],
    "HAP": ["1001_DFA_HAP_XX.wav", "1002_DFA_HAP_XX.wav", "1010_DFA_HAP_XX.wav", "1015_DFA_HAP_XX.wav"],
    "NEU": ["1001_DFA_NEU_XX.wav", "1002_DFA_NEU_XX.wav", "1010_DFA_NEU_XX.wav", "1015_DFA_NEU_XX.wav"],
    "SAD": ["1001_DFA_SAD_XX.wav", "1002_DFA_SAD_XX.wav", "1010_DFA_SAD_XX.wav", "1015_DFA_SAD_XX.wav"],
}

for emo_code, filenames in samples.items():
    expected_emo = C.CODE_TO_EMOTION[emo_code]
    print(f"\n--- True Emotion: {expected_emo} ({emo_code}) ---")
    for fname in filenames:
        fpath = C.DATA_DIR / fname
        if not fpath.exists():
            print(f"File not found: {fname}")
            continue
        with open(fpath, "rb") as f:
            data = f.read()
        res = predict_bytes(data)
        top_emo = res["emotion"]
        conf = res["confidence"]
        scores_str = ", ".join(f"{k}: {v:.3f}" for k, v in res["scores"].items())
        print(f"[{fname}] Predicted: {top_emo} (conf={conf:.3f}, margin={res['margin']:.3f}, uncertain={res['uncertain']}) | {scores_str}")

print("\n=================================================================")
print("DIAGNOSIS STEP 3: Check Silence and Non-Speech Behavior")
print("=================================================================")

zero_audio = np.zeros(16000 * 3, dtype=np.float32)
import io
import soundfile as sf
buf = io.BytesIO()
sf.write(buf, zero_audio, 16000, format="WAV")
zero_bytes = buf.getvalue()

try:
    res_zero = predict_bytes(zero_bytes)
    print("Zero audio prediction result:", res_zero)
except Exception as e:
    print(f"Zero audio correctly raised exception: {type(e).__name__}: {e}")

# Room hiss noise
np.random.seed(42)
hiss = (np.random.randn(16000 * 3) * 0.001).astype(np.float32)
buf_hiss = io.BytesIO()
sf.write(buf_hiss, hiss, 16000, format="WAV")
hiss_bytes = buf_hiss.getvalue()

try:
    res_hiss = predict_bytes(hiss_bytes)
    print("Hiss audio prediction result:", res_hiss["emotion"], res_hiss["confidence"], res_hiss["scores"])
except Exception as e:
    print(f"Hiss audio raised exception: {type(e).__name__}: {e}")

print("\n=================================================================")
print("DIAGNOSIS STEP 4: Measure Prediction Distribution on Held-Out Test Set")
print("=================================================================")

if C.SPLIT_PATH.exists():
    with open(C.SPLIT_PATH) as f:
        split_info = json.load(f)
    test_speakers = set(str(s) for s in split_info.get("test_speakers", []))
    print(f"Held-out test speakers count: {len(test_speakers)}")
else:
    test_speakers = set()

all_files = list(C.DATA_DIR.glob("*.wav"))
test_files = [f for f in all_files if f.name.split("_")[0] in test_speakers]
if not test_files:
    test_files = all_files[:200]

print(f"Evaluating distribution on {len(test_files)} clips...")

from collections import Counter
pred_counts = Counter()
true_counts = Counter()
matches = 0

for fpath in test_files[:150]:
    parts = fpath.name.split("_")
    true_code = parts[2]
    true_emo = C.CODE_TO_EMOTION.get(true_code)
    true_counts[true_emo] += 1
    with open(fpath, "rb") as f:
        res = predict_bytes(f.read())
    pred_emo = res["emotion"]
    pred_counts[pred_emo] += 1
    if pred_emo == true_emo:
        matches += 1

print("\nTrue class distribution in sample:")
for emo, cnt in sorted(true_counts.items()):
    print(f"  {emo}: {cnt}")

print("\nPredicted class distribution in sample:")
for emo, cnt in sorted(pred_counts.items()):
    print(f"  {emo}: {cnt} ({cnt/sum(pred_counts.values())*100:.1f}%)")

print(f"\nSample accuracy: {matches}/{sum(true_counts.values())} = {matches/sum(true_counts.values())*100:.2f}%")
