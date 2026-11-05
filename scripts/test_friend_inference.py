import os
import sys
sys.path.insert(0, os.path.abspath("."))
import joblib
import numpy as np
from backend.app.audio import load_audio_file, extract_features

bundle = joblib.load('models/emotion_model.joblib')
pipe = bundle['pipeline']
labels = bundle['labels']

root = 'external_datasets/audio_for_friend'
print(f"Active model classes: {[str(l) for l in labels]}")
print("\n=== INFERENCE CHECK ON AUDIO_FOR_FRIEND ===")

results = []
for dp, dn, fns in os.walk(root):
    for fn in sorted(fns):
        p = os.path.join(dp, fn)
        rel = os.path.relpath(p, root)
        try:
            sig = load_audio_file(p)
            dur = len(sig) / 16000.0
            feats = extract_features(sig)
            probs = pipe.predict_proba(feats.reshape(1, -1))[0]
            pred = str(labels[np.argmax(probs)])
            conf = float(np.max(probs))
            results.append((rel, 'OK', dur, pred, conf, probs))
        except Exception as e:
            results.append((rel, f"FAIL: {type(e).__name__} ({e})", 0, 'N/A', 0.0, []))

print(f"{'Relative File Path':<48} | {'Status':<6} | {'Dur':<6} | {'Pred':<7} | {'Conf':<5} | {'Top 3 Probabilities'}")
print("-" * 120)
for r in results:
    if r[1] == 'OK':
        top_probs = ', '.join([f"{labels[i]}: {r[5][i]:.2f}" for i in np.argsort(-r[5])[:3]])
        print(f"{r[0]:<48} | {r[1]:<6} | {r[2]:>5.1f}s | {r[3]:<7} | {r[4]:.2f}  | {top_probs}")
    else:
        print(f"{r[0]:<48} | {r[1]}")
