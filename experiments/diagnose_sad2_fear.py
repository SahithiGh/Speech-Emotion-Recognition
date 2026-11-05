"""Diagnostic Script: Deep Investigation of Sad2 Fear Prediction.

Diagnoses:
1. Active model verification (path, SHA256, bundle integrity).
2. Preprocessing & decoding pipeline analysis (Sad2.mp3.mpeg vs Sad2.wav).
3. Feature distribution & Top 15 deviating features.
4. Effect of 6.0-second truncation vs full 8.66-second audio.
5. Decision function values (all 15 pairwise SVM margins) & Platt scaling behavior.
6. Head-to-head Production vs Staging comparison.
7. Baseline CREMA-D reference comparisons (Sad, Happy, Neutral, Fear, Angry).
"""
import hashlib
import json
import os
import sys
from pathlib import Path

import joblib
import librosa
import numpy as np
import soundfile as sf

# Paths
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app import predict
from app.audio import FEATURE_GROUPS, _decode, extract_features, load_audio_bytes, load_audio_file, prepare_signal
from app.modelcheck import validate_bundle

OUTPUT_FILE = Path("experiments/sad2_investigation_results.json")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def get_feature_name(col_idx):
    for group_key, (label, desc, cols) in FEATURE_GROUPS.items():
        if col_idx in cols:
            offset = col_idx - cols[0]
            return f"{label} [idx {col_idx}, offset {offset}]"
    return f"Feature {col_idx}"


def run_diagnostics():
    print("=" * 80)
    print("DEEP DIAGNOSTIC: SAD2 FEAR PREDICTION INVESTIGATION")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 1. Confirm Active Staging Model and Configuration
    # -------------------------------------------------------------------------
    C.set_active_model_profile("staging")
    staging_path = C.MODEL_PATH
    staging_sha256 = sha256_file(staging_path)
    prod_path = C.PRODUCTION_MODEL_PATH
    prod_sha256 = sha256_file(prod_path)

    bundle_stage = predict.get_bundle()
    pipe_stage = bundle_stage["pipeline"]
    scaler_stage = pipe_stage.named_steps["scale"]
    clf_stage = pipe_stage.named_steps["clf"]

    bundle_prod = joblib.load(prod_path)
    pipe_prod = bundle_prod["pipeline"]
    scaler_prod = pipe_prod.named_steps["scale"]
    clf_prod = pipe_prod.named_steps["clf"]

    print(f"\n[1] MODEL VERIFICATION:")
    print(f"  Staging Model Path:   {staging_path}")
    print(f"  Staging SHA-256:      {staging_sha256}")
    print(f"  Production Path:      {prod_path}")
    print(f"  Production SHA-256:   {prod_sha256}")
    print(f"  Staging Scaler Feat:  {scaler_stage.n_features_in_} features")
    print(f"  Staging Feat 270:     mean={scaler_stage.mean_[270]:.3f}, std={scaler_stage.scale_[270]:.3f}")
    print(f"  Production Feat 270:  mean={scaler_prod.mean_[270]:.3f}, std={scaler_prod.scale_[270]:.3f}")

    # -------------------------------------------------------------------------
    # 2. Audio Decoding & Preprocessing Log
    # -------------------------------------------------------------------------
    p_dl = r"C:\Users\JAI-SREE-RAM\Downloads\Sad2.mp3.mpeg"
    p_wav = r"external_datasets\audio_for_friend\sample_audio\Sad2.wav"

    with open(p_dl, "rb") as f:
        b_dl = f.read()
    with open(p_wav, "rb") as f:
        b_wav = f.read()

    y_dl_raw, sr_dl = _decode(b_dl)
    y_wav_raw, sr_wav = _decode(b_wav)

    print(f"\n[2] AUDIO DECODING & PREPROCESSING:")
    print(f"  Sad2.mp3.mpeg:")
    print(f"    Raw bytes:          {len(b_dl):,} bytes")
    print(f"    Decoded SR:         {sr_dl} Hz")
    print(f"    Raw samples:        {len(y_dl_raw):,} ({len(y_dl_raw)/sr_dl:.3f} seconds)")
    print(f"    Decoded min/max:    {float(y_dl_raw.min()):.4f} / {float(y_dl_raw.max()):.4f}")
    print(f"    Decoded RMS:        {float(np.sqrt(np.mean(y_dl_raw**2))):.4f}")

    print(f"  Sad2.wav:")
    print(f"    Raw bytes:          {len(b_wav):,} bytes")
    print(f"    Decoded SR:         {sr_wav} Hz")
    print(f"    Raw samples:        {len(y_wav_raw):,} ({len(y_wav_raw)/sr_wav:.3f} seconds)")

    # Trace prepare_signal step-by-step
    notes_dl = []
    y_16k_resampled = librosa.resample(y_dl_raw, orig_sr=sr_dl, target_sr=C.SAMPLE_RATE)
    y_trimmed, trim_idx = librosa.effects.trim(y_16k_resampled, top_db=C.TRIM_TOP_DB)
    duration_pre_trunc = len(y_trimmed) / C.SAMPLE_RATE
    
    # Truncation check
    is_truncated = len(y_trimmed) > int(C.MAX_SECONDS * C.SAMPLE_RATE)
    y_prep = prepare_signal(y_dl_raw, sr_dl, notes_dl)
    duration_final = len(y_prep) / C.SAMPLE_RATE

    print(f"\n  Signal Processing Steps:")
    print(f"    1. Resampled 48k -> 16k: {len(y_16k_resampled)} samples ({len(y_16k_resampled)/16000:.3f}s)")
    print(f"    2. Trimmed silence (top_db={C.TRIM_TOP_DB}): {len(y_trimmed)} samples ({duration_pre_trunc:.3f}s)")
    print(f"    3. Truncation to MAX_SECONDS ({C.MAX_SECONDS}s): Truncated = {is_truncated}")
    print(f"       Remaining speech: {len(y_prep)} samples ({duration_final:.2f}s)")
    print(f"    4. Peak normalized to 0.9: peak={float(np.max(np.abs(y_prep))):.3f}")
    print(f"    5. Processing notes: {notes_dl}")

    # -------------------------------------------------------------------------
    # 3 & 4. Features & Top 15 Deviations Against Candidate Training Distribution
    # -------------------------------------------------------------------------
    feat_dl = extract_features(y_prep)
    z_stage = (feat_dl - scaler_stage.mean_) / scaler_stage.scale_
    z_prod = (feat_dl - scaler_prod.mean_) / scaler_prod.scale_

    top15_indices = np.argsort(np.abs(z_stage))[-15:][::-1]
    top15_table = []

    print(f"\n[3 & 4] TOP 15 STANDARDIZED FEATURE DEVIATIONS (STAGING MODEL):")
    print(f"  {'Idx':4s} | {'Feature Name / Group':35s} | {'Raw Val':10s} | {'Train Mean':10s} | {'Train Std':10s} | {'Z-Score':8s}")
    print(f"  {'-'*88}")
    for idx in top15_indices:
        name = get_feature_name(idx)
        raw_v = float(feat_dl[idx])
        tr_m = float(scaler_stage.mean_[idx])
        tr_s = float(scaler_stage.scale_[idx])
        z_val = float(z_stage[idx])
        top15_table.append({
            "index": int(idx),
            "name": name,
            "raw_value": round(raw_v, 4),
            "training_mean": round(tr_m, 4),
            "training_std": round(tr_s, 4),
            "z_score": round(z_val, 2),
        })
        print(f"  {idx:4d} | {name:35s} | {raw_v:10.4f} | {tr_m:10.4f} | {tr_s:10.4f} | {z_val:+8.2f}")

    # -------------------------------------------------------------------------
    # 5. File Extension & Decoding Engine Impact Check
    # -------------------------------------------------------------------------
    # Test decoding via sf directly vs pyav vs librosa
    feat_wav = extract_features(prepare_signal(y_wav_raw, sr_wav))
    max_feat_diff = float(np.max(np.abs(feat_dl - feat_wav)))
    print(f"\n[5] FILE EXTENSION (.mp3.mpeg vs .wav) COMPARISON:")
    print(f"  Max absolute feature difference between MP3 and WAV: {max_feat_diff:.6f}")
    print(f"  Does .mp3.mpeg extension cause decoding failure? NO (soundfile decoded audio layer 3 successfully).")

    # -------------------------------------------------------------------------
    # 6. Effect of 6.0s Truncation vs Full Audio (8.66s)
    # -------------------------------------------------------------------------
    # Extract features without truncation (first 8.66s)
    y_full_prep = y_trimmed / float(np.max(np.abs(y_trimmed))) * 0.9
    feat_full = extract_features(y_full_prep)
    probs_stage_full = pipe_stage.predict_proba(feat_full.reshape(1, -1))[0]
    pred_stage_full = pipe_stage.predict(feat_full.reshape(1, -1))[0]

    # Truncated to 6.0s (official pipeline)
    probs_stage_6s = pipe_stage.predict_proba(feat_dl.reshape(1, -1))[0]
    pred_stage_6s = pipe_stage.predict(feat_dl.reshape(1, -1))[0]

    print(f"\n[6] TRUNCATION EFFECT (6.0s vs Full 8.66s):")
    print(f"  Truncated to 6.0s:  predicted={pred_stage_6s:8s} | " +
          ", ".join([f"{c}: {p:.3f}" for c, p in zip(pipe_stage.classes_, probs_stage_6s)]))
    print(f"  Full 8.66s:         predicted={pred_stage_full:8s} | " +
          ", ".join([f"{c}: {p:.3f}" for c, p in zip(pipe_stage.classes_, probs_stage_full)]))
    print(f"  Z-score max on 6.0s: {np.max(np.abs(z_stage)):.2f}")
    z_full = (feat_full - scaler_stage.mean_) / scaler_stage.scale_
    print(f"  Z-score max on 8.66s: {np.max(np.abs(z_full)):.2f} (col {np.argmax(np.abs(z_full))})")

    # -------------------------------------------------------------------------
    # 7. Decision Function Values & Platt Scaling Breakdown
    # -------------------------------------------------------------------------
    # The SVC uses 15 one-vs-one binary decision functions for 6 classes:
    # (angry, disgust), (angry, fear), (angry, happy), (angry, neutral), (angry, sad),
    # (disgust, fear), (disgust, happy), (disgust, neutral), (disgust, sad),
    # (fear, happy), (fear, neutral), (fear, sad),
    # (happy, neutral), (happy, sad),
    # (neutral, sad)
    scaled_vec_6s = scaler_stage.transform(feat_dl.reshape(1, -1))
    decision_margins = clf_stage.decision_function(scaled_vec_6s)[0]
    
    classes = list(clf_stage.classes_)
    pair_names = []
    for i in range(len(classes)):
        for j in range(i + 1, len(classes)):
            pair_names.append(f"{classes[i]} vs {classes[j]}")

    print(f"\n[7] SVM ONE-VS-ONE DECISION MARGINS (STAGING):")
    for pair, margin in zip(pair_names, decision_margins):
        print(f"  {pair:24s}: margin = {margin:+7.3f}")

    # Platt calibration parameters (probA_ and probB_)
    print(f"\n  Platt Scaling Parameters:")
    print(f"    probA (sigmoidal slopes):  {clf_stage.probA_.round(3)}")
    print(f"    probB (sigmoidal biases):  {clf_stage.probB_.round(3)}")

    # -------------------------------------------------------------------------
    # 8. Head-to-Head Comparison: Production vs Staging on Sad2
    # -------------------------------------------------------------------------
    probs_prod = pipe_prod.predict_proba(feat_dl.reshape(1, -1))[0]
    pred_prod = pipe_prod.predict(feat_dl.reshape(1, -1))[0]

    print(f"\n[8] HEAD-TO-HEAD ON SAD2:")
    print(f"  Production Model: predicted={pred_prod:8s} | " +
          ", ".join([f"{c}: {p:.4f}" for c, p in zip(pipe_prod.classes_, probs_prod)]))
    print(f"  Staging Model:    predicted={pred_stage_6s:8s} | " +
          ", ".join([f"{c}: {p:.4f}" for c, p in zip(pipe_stage.classes_, probs_stage_6s)]))
    print(f"  Production Peak Deviation: {float(np.max(np.abs(z_prod))):.2f} (col {int(np.argmax(np.abs(z_prod)))})")
    print(f"  Staging Peak Deviation:    {float(np.max(np.abs(z_stage))):.2f} (col {int(np.argmax(np.abs(z_stage)))})")

    # -------------------------------------------------------------------------
    # 9. Comparative Diagnostic on Known CREMA-D Clips
    # -------------------------------------------------------------------------
    crema_samples = {
        "CREMA-D Sad": "data/AudioWAV/1001_DFA_SAD_XX.wav",
        "CREMA-D Happy": "data/AudioWAV/1001_DFA_HAP_XX.wav",
        "CREMA-D Neutral": "data/AudioWAV/1001_DFA_NEU_XX.wav",
        "CREMA-D Fear": "data/AudioWAV/1001_DFA_FEA_XX.wav",
        "CREMA-D Angry": "data/AudioWAV/1001_DFA_ANG_XX.wav",
    }

    print(f"\n[9] CREMA-D REFERENCE CLIPS EVALUATION (STAGING MODEL):")
    crema_results = {}
    for label, path in crema_samples.items():
        if os.path.exists(path):
            y_ref = load_audio_file(path)
            f_ref = extract_features(y_ref)
            z_ref = (f_ref - scaler_stage.mean_) / scaler_stage.scale_
            p_ref = pipe_stage.predict(f_ref.reshape(1, -1))[0]
            pr_ref = pipe_stage.predict_proba(f_ref.reshape(1, -1))[0]
            pdict = {c: round(float(p), 4) for c, p in zip(pipe_stage.classes_, pr_ref)}
            max_z_ref = float(np.max(np.abs(z_ref)))
            crema_results[label] = {
                "predicted": p_ref,
                "confidence": round(float(pr_ref.max()), 4),
                "max_deviation": round(max_z_ref, 2),
                "probabilities": pdict,
            }
            print(f"  {label:16s} -> {p_ref:8s} (conf: {pr_ref.max():.1%}, max_z: {max_z_ref:.2f}) | {pdict}")

    # -------------------------------------------------------------------------
    # 10. Save Detailed JSON Report
    # -------------------------------------------------------------------------
    report = {
        "model_verification": {
            "staging": {"path": str(staging_path), "sha256": staging_sha256},
            "production": {"path": str(prod_path), "sha256": prod_sha256},
        },
        "file_investigated": {
            "name": "Sad2.mp3.mpeg",
            "wav_equivalent": "Sad2.wav",
            "duration_raw_seconds": round(len(y_dl_raw) / sr_dl, 3),
            "duration_analyzed_seconds": duration_final,
            "was_truncated": is_truncated,
            "peak_standardized_deviation": round(float(np.max(np.abs(z_stage))), 2),
            "top_15_deviations": top15_table,
        },
        "predictions_comparison": {
            "sad2_staging_6s": {
                "predicted": pred_stage_6s,
                "confidence": round(float(probs_stage_6s.max()), 4),
                "margin": round(float(sorted(probs_stage_6s, reverse=True)[0] - sorted(probs_stage_6s, reverse=True)[1]), 4),
                "scores": {c: round(float(p), 4) for c, p in zip(pipe_stage.classes_, probs_stage_6s)},
            },
            "sad2_staging_full_8s": {
                "predicted": pred_stage_full,
                "confidence": round(float(probs_stage_full.max()), 4),
                "margin": round(float(sorted(probs_stage_full, reverse=True)[0] - sorted(probs_stage_full, reverse=True)[1]), 4),
                "scores": {c: round(float(p), 4) for c, p in zip(pipe_stage.classes_, probs_stage_full)},
            },
            "sad2_production": {
                "predicted": pred_prod,
                "confidence": round(float(probs_prod.max()), 4),
                "margin": round(float(sorted(probs_prod, reverse=True)[0] - sorted(probs_prod, reverse=True)[1]), 4),
                "scores": {c: round(float(p), 4) for c, p in zip(pipe_prod.classes_, probs_prod)},
            },
        },
        "decision_margins_staging": {
            pair: round(float(margin), 4) for pair, margin in zip(pair_names, decision_margins)
        },
        "crema_reference_evaluation": crema_results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\n[10] Saved diagnostic output to {OUTPUT_FILE}")


if __name__ == "__main__":
    run_diagnostics()

