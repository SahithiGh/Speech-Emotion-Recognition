import glob
import os
import sys
sys.path.insert(0, os.path.abspath("."))
import joblib
import numpy as np
from backend.app.audio import load_audio_file, extract_features

bundle = joblib.load('models/emotion_model.joblib')
pipe = bundle['pipeline']
labels = bundle['labels']

EMO_MAP = {'ANG': 'angry', 'DIS': 'disgust', 'FEA': 'fear', 'HAP': 'happy', 'NEU': 'neutral', 'SAD': 'sad'}

files = glob.glob('data/AudioWAV/*.wav')[:30]
print(f"=== TESTING ON {len(files)} CREMA-D AUDIO CLIPS ===")
correct = 0
for f in files:
    fn = os.path.basename(f)
    parts = fn.split('_')
    gt = EMO_MAP.get(parts[2], 'unknown')
    
    y = load_audio_file(f)
    feat = extract_features(y)
    probs = pipe.predict_proba(feat.reshape(1, -1))[0]
    pred = labels[np.argmax(probs)]
    conf = float(np.max(probs))
    is_correct = (pred == gt)
    if is_correct:
        correct += 1
    
    top3 = ', '.join([f"{labels[i]}: {probs[i]:.2f}" for i in np.argsort(-probs)[:3]])
    status = "MATCH" if is_correct else "diff"
    print(f"{fn:<22} | GT: {gt:<7} | Pred: {pred:<7} ({conf:.2f}) | {top3} | {status}")

print(f"\nCREMA-D sample accuracy: {correct}/{len(files)} ({correct/len(files)*100:.1f}%)")
