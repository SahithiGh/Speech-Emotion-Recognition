import os
import sys
sys.path.insert(0, os.path.abspath("."))
import numpy as np
import soundfile as sf
import librosa
import joblib

from backend.app.audio import load_audio_file, extract_features, prepare_signal
import backend.app.config as C

# 1. Load model and scaler
bundle = joblib.load('models/emotion_model.joblib')
pipe = bundle['pipeline']
scaler = pipe.named_steps['scale']
clf = pipe.named_steps['clf']
labels = bundle['labels']

print("=== LOADED MODEL INFO ===")
print("Labels:", [str(l) for l in labels])
print("Scaler mean shape:", scaler.mean_.shape)
print("Classifier type:", type(clf))
print("Classifier gamma:", clf._gamma if hasattr(clf, '_gamma') else clf.gamma)
print("Classifier dual_coef_ shape:", clf.dual_coef_.shape if hasattr(clf, 'dual_coef_') else 'N/A')
print("Classifier support_vectors_ shape:", clf.support_vectors_.shape if hasattr(clf, 'support_vectors_') else 'N/A')
print("Classifier intercept_:", clf.intercept_)
if hasattr(clf, 'probA_') and hasattr(clf, 'probB_'):
    print("Classifier probA_:", clf.probA_)
    print("Classifier probB_:", clf.probB_)

# 2. Files to compare
files_to_check = [
    'external_datasets/audio_for_friend/sample_audio/Neutral1.wav',
    'external_datasets/audio_for_friend/sample_audio/Sad1.wav',
    'external_datasets/audio_for_friend/sample_audio/angry_sample.wav',
    'external_datasets/audio_for_friend/sample_audio/Happy2.wav',
    'external_datasets/audio_for_friend/sample_audio/real_voice.wav'
]

raw_signals = {}
features_raw = {}
features_scaled = {}

print("\n=== AUDIO PROPERTIES & SIGNALS ===")
for path in files_to_check:
    name = os.path.basename(path)
    # raw audio with soundfile directly
    raw_y, raw_sr = sf.read(path)
    # audio prepared by pipeline
    prep_y = load_audio_file(path)
    raw_signals[name] = (raw_y, raw_sr, prep_y)
    
    feats = extract_features(prep_y)
    features_raw[name] = feats
    feats_sc = scaler.transform(feats.reshape(1, -1))[0]
    features_scaled[name] = feats_sc
    
    print(f"{name:<20}: Raw SR={raw_sr}, Raw Shape={raw_y.shape}, Prep Shape={prep_y.shape}, Prep RMS={np.sqrt(np.mean(prep_y**2)):.4f}, Peak={np.max(np.abs(prep_y)):.4f}")

# Check pairwise similarity of raw features
print("\n=== PAIRWISE FEATURE VECTOR COMPARISONS ===")
names = list(features_raw.keys())
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        n1, n2 = names[i], names[j]
        f1, f2 = features_raw[n1], features_raw[n2]
        # correlation, euclidean distance, max abs diff
        corr = np.corrcoef(f1, f2)[0, 1]
        euc = np.linalg.norm(f1 - f2)
        max_diff = np.max(np.abs(f1 - f2))
        
        # scaled
        s1, s2 = features_scaled[n1], features_scaled[n2]
        s_corr = np.corrcoef(s1, s2)[0, 1]
        s_euc = np.linalg.norm(s1 - s2)
        print(f"{n1} vs {n2}: Raw Corr={corr:.4f}, Raw Euc={euc:.2f}, Scaled Corr={s_corr:.4f}, Scaled Euc={s_euc:.2f}")

# Check decision function values and probability values
print("\n=== DECISION FUNCTION & PREDICT_PROBA ===")
for name in names:
    sc = features_scaled[name].reshape(1, -1)
    df = clf.decision_function(sc)
    probs = pipe.predict_proba(features_raw[name].reshape(1, -1))[0]
    print(f"\n{name}:")
    print("  Decision function (one-vs-one or shape):", df.shape, np.round(df[0], 3) if len(df.shape)>1 else np.round(df, 3))
    prob_str = ", ".join([f"{labels[k]}: {probs[k]:.3f}" for k in range(len(labels))])
    print("  Probabilities:", prob_str)

