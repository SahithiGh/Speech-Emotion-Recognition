"""Comprehensive Evaluation and Comparison across:
1. Baseline Production Model (296 features, CREMA-D native)
2. Experiment 1: Revised Spectral Contrast (294 features, Nyquist band 6 dropped)
3. Experiment 2: Resampling Augmentation (296 features, 50% simulated resampling)

Evaluates:
- Held-out CREMA-D test set (14 speakers, 1,147 clips) in NATIVE 16kHz
- Held-out CREMA-D test set in RESAMPLED (48kHz -> 16kHz)
- External audio files from external_datasets/audio_for_friend/sample_audio/
"""
import json
import os
import sys
import time
from pathlib import Path

import joblib
import librosa
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score

# Ensure backend and experiments modules can be imported
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import extract_features, load_audio_file
from app.dataset import parse_filename
from experiments.features_exp1 import drop_band6_from_296, extract_features_294

REPORT_PATH = Path("experiments/comparison_report.json")


def load_all_models():
    models = {}
    
    # 1. Baseline model
    base_path = Path("models/emotion_model.joblib")
    if base_path.exists():
        b = joblib.load(base_path)
        models["baseline"] = {
            "name": "Baseline Production Model (C=5, 296 features)",
            "pipeline": b["pipeline"],
            "feature_dim": 296,
            "extract_fn": extract_features,
            "drop_cache_fn": lambda X: X,
        }
    
    # 2. Experiment 1
    exp1_path = Path("experiments/exp1_revised_contrast/model.joblib")
    if exp1_path.exists():
        b = joblib.load(exp1_path)
        models["exp1"] = {
            "name": "Experiment 1: Revised Spectral Contrast (C=5, 294 features)",
            "pipeline": b["pipeline"],
            "feature_dim": 294,
            "extract_fn": extract_features_294,
            "drop_cache_fn": drop_band6_from_296,
        }
        
    # 3. Experiment 2
    exp2_path = Path("experiments/exp2_resampling_aug/model.joblib")
    if exp2_path.exists():
        b = joblib.load(exp2_path)
        models["exp2"] = {
            "name": "Experiment 2: Resampling Augmentation (C=5, 296 features)",
            "pipeline": b["pipeline"],
            "feature_dim": 296,
            "extract_fn": extract_features,
            "drop_cache_fn": lambda X: X,
        }
        
    return models


def evaluate_crema_test_set(models):
    print("\n--- Evaluating on Held-Out CREMA-D Test Set (14 Speakers, 1,147 Clips) ---")
    cache = np.load("outputs/feature_cache.npz")
    X_native = cache["X"]
    names = cache["names"]
    
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    test_speakers = set(split["test"])
    
    y_all = np.array([parse_filename(n)[1] for n in names])
    actors_all = np.array([parse_filename(n)[0] for n in names])
    test_mask = np.isin(actors_all, list(test_speakers))
    
    Xte_native = X_native[test_mask]
    yte = y_all[test_mask]
    test_names = names[test_mask]
    labels = C.EMOTIONS
    
    results = {}
    for key, m in models.items():
        Xte_prep = m["drop_cache_fn"](Xte_native)
        pipe = m["pipeline"]
        pred = pipe.predict(Xte_prep)
        
        acc = accuracy_score(yte, pred)
        mf1 = f1_score(yte, pred, average="macro", zero_division=0)
        uar = recall_score(yte, pred, average="macro", zero_division=0)
        prec = precision_score(yte, pred, average="macro", zero_division=0)
        cm = confusion_matrix(yte, pred, labels=labels).tolist()
        
        per_class = {}
        for emo in labels:
            tp = int(np.sum((yte == emo) & (pred == emo)))
            fn = int(np.sum((yte == emo) & (pred != emo)))
            fp = int(np.sum((yte != emo) & (pred == emo)))
            p = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
            r = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
            f1 = float(2 * p * r / (p + r)) if (p + r) > 0 else 0.0
            per_class[emo] = {"precision": p, "recall": r, "f1": f1}
            
        results[key] = {
            "name": m["name"],
            "accuracy": float(acc),
            "macro_f1": float(mf1),
            "uar": float(uar),
            "macro_precision": float(prec),
            "per_class": per_class,
            "confusion_matrix": cm,
        }
        print(f"{m['name']}:")
        print(f"  Accuracy: {acc:.4f} | Macro F1: {mf1:.4f} | UAR: {uar:.4f} | Precision: {prec:.4f}")
        
    return results


def evaluate_resampled_test_clips(models, num_sample_clips=100):
    print(f"\n--- Evaluating Resampling Stability on {num_sample_clips} Held-out Test Clips ---")
    cache = np.load("outputs/feature_cache.npz")
    names = cache["names"]
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)
    test_speakers = set(split["test"])
    
    test_clip_names = [n for n in names if parse_filename(n)[0] in test_speakers]
    # Pick a stratified deterministic subset of test clips
    rng = np.random.default_rng(42)
    selected_indices = rng.choice(len(test_clip_names), size=min(num_sample_clips, len(test_clip_names)), replace=False)
    selected_names = [test_clip_names[i] for i in selected_indices]
    
    results = {k: {"native_preds": [], "resampled_preds": [], "native_acc": 0, "resampled_acc": 0, "fear_counts": 0} for k in models}
    ground_truth = []
    
    print(f"Resampling and evaluating {len(selected_names)} clips (simulating 48k -> 16k)...")
    for name in selected_names:
        actor, true_emo = parse_filename(name)
        ground_truth.append(true_emo)
        path = str(C.DATA_DIR / name)
        y = load_audio_file(path)
        
        # Resampled version
        y_48k = librosa.resample(y, orig_sr=16000, target_sr=48000)
        y_res = librosa.resample(y_48k, orig_sr=48000, target_sr=16000)
        
        for k, m in models.items():
            fn = m["extract_fn"]
            pipe = m["pipeline"]
            
            v_nat = fn(y).reshape(1, -1)
            v_res = fn(y_res).reshape(1, -1)
            
            p_nat = pipe.predict(v_nat)[0]
            p_res = pipe.predict(v_res)[0]
            
            results[k]["native_preds"].append(p_nat)
            results[k]["resampled_preds"].append(p_res)
            if p_res == "fear":
                results[k]["fear_counts"] += 1
                
    for k, m in models.items():
        nat_preds = results[k]["native_preds"]
        res_preds = results[k]["resampled_preds"]
        acc_nat = accuracy_score(ground_truth, nat_preds)
        acc_res = accuracy_score(ground_truth, res_preds)
        agreement = np.mean([p1 == p2 for p1, p2 in zip(nat_preds, res_preds)])
        fear_pct = results[k]["fear_counts"] / len(ground_truth)
        
        results[k]["accuracy_native"] = float(acc_nat)
        results[k]["accuracy_resampled"] = float(acc_res)
        results[k]["pred_agreement_rate"] = float(agreement)
        results[k]["resampled_fear_percentage"] = float(fear_pct)
        
        print(f"{m['name']}:")
        print(f"  Native Acc: {acc_nat:.2%} | Resampled Acc: {acc_res:.2%} | Agreement: {agreement:.2%} | Fear %: {fear_pct:.1%}")
        
    return results


def evaluate_external_audio(models):
    print("\n--- Evaluating on External Audio (sample_audio/) ---")
    test_files = [
        "external_datasets/audio_for_friend/sample_audio/Neutral1.wav",
        "external_datasets/audio_for_friend/sample_audio/Neutral2.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad1.wav",
        "external_datasets/audio_for_friend/sample_audio/Sad2.wav",
        "external_datasets/audio_for_friend/sample_audio/angry_sample.wav",
        "external_datasets/audio_for_friend/sample_audio/Happy2.wav",
        "external_datasets/audio_for_friend/sample_audio/happy_sample.wav",
        "external_datasets/audio_for_friend/sample_audio/sad_sample.wav",
        "external_datasets/audio_for_friend/sample_audio/real_voice.wav",
        "external_datasets/audio_for_friend/sample_audio/sample_16k.wav",
    ]
    
    file_results = []
    for f in test_files:
        if not os.path.exists(f):
            continue
        fname = os.path.basename(f)
        y = load_audio_file(f)
        
        row = {"file": fname, "predictions": {}}
        for k, m in models.items():
            vec = m["extract_fn"](y).reshape(1, -1)
            pipe = m["pipeline"]
            probs = pipe.predict_proba(vec)[0]
            pred = pipe.predict(vec)[0]
            prob_dict = {c: round(float(p), 4) for c, p in zip(pipe.classes_, probs)}
            row["predictions"][k] = {
                "predicted": pred,
                "confidence": round(float(probs.max()), 4),
                "probabilities": prob_dict,
            }
        file_results.append(row)
        
    return file_results


def run_full_comparison():
    models = load_all_models()
    print(f"Loaded {len(models)} models: {list(models.keys())}")
    
    test_results = evaluate_crema_test_set(models)
    stability_results = evaluate_resampled_test_clips(models, num_sample_clips=100)
    external_results = evaluate_external_audio(models)
    
    comparison = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "models_evaluated": list(models.keys()),
        "held_out_crema_test": test_results,
        "resampling_stability_test": stability_results,
        "external_audio_evaluation": external_results,
    }
    
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(comparison, f, indent=2)
    print(f"\nSaved full comparison report to {REPORT_PATH}")
    return comparison


if __name__ == "__main__":
    run_full_comparison()

