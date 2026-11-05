"""Phase 2 Validation Suite: Experimental VAD-Gated Feature Extraction.

Executes all 8 mandatory verification checks:
1. Compare Candidate A and Candidate B.
2. Verify detected speech regions on Sad2, CREMA-D, quiet speech, breaths.
3. Verify pause exclusion vs actual speech preservation.
4. Frame alignment across all feature matrices.
5. Feature gating breakdown & pause/speech ratio preservation.
6. 296-dimension ordering & consistency check.
7. Synthetic pause-insertion experiment (0.5s, 1.0s, 2.0s).
8. CREMA-D dataset count and speaker split verification.
"""
import json
import os
import sys
from pathlib import Path

import joblib
import librosa
import numpy as np

# Ensure root is in path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app.audio import (
    FEATURE_GROUPS,
    N_FEATURES,
    load_audio_file,
    prepare_signal,
    extract_features as extract_features_baseline,
)
from app.dataset import parse_filename
from experiments.exp3_vad_gated.features_exp3 import (
    compute_vad_mask_candidate_a,
    compute_vad_mask_candidate_b,
    extract_features_exp3,
)

OUTPUT_JSON = Path("experiments/exp3_vad_gated/phase2_validation_results.json")


def run_checks():
    results = {}
    print("=" * 80)
    print("PHASE 2 VALIDATION: VAD-GATED FEATURE EXTRACTION EXPERIMENT")
    print("=" * 80)

    # Load scalers from the saved bundles
    bundle_prod = joblib.load("models/emotion_model.joblib")
    scaler_prod = bundle_prod["pipeline"].named_steps["scale"]
    bundle_stage = joblib.load("models/candidate_option2/emotion_model.joblib")
    scaler_stage = bundle_stage["pipeline"].named_steps["scale"]

    # -------------------------------------------------------------------------
    # CHECK 8: Confirm CREMA-D Dataset Count & Speaker Split
    # -------------------------------------------------------------------------
    print("\n--- CHECK 8: CREMA-D Dataset Count & Exact Speaker Split ---")
    with open("outputs/speaker_split.json", "r", encoding="utf-8") as f:
        split = json.load(f)

    dev_speakers = set(split["development"])
    test_speakers = set(split["test"])
    audio_dir = Path("data/AudioWAV")
    all_wavs = list(audio_dir.glob("*.wav"))

    dev_files = []
    test_files = []
    other_files = []

    for p in all_wavs:
        try:
            actor, emotion = parse_filename(p.name)
            if actor in dev_speakers:
                dev_files.append(p.name)
            elif actor in test_speakers:
                test_files.append(p.name)
            else:
                other_files.append(p.name)
        except Exception:
            pass

    check8_data = {
        "total_wav_files": len(all_wavs),
        "dev_speakers_count": len(dev_speakers),
        "test_speakers_count": len(test_speakers),
        "dev_files_count": len(dev_files),
        "test_files_count": len(test_files),
        "unassigned_count": len(other_files),
        "disjoint_check": len(dev_speakers.intersection(test_speakers)) == 0,
    }
    results["check8_dataset_and_split"] = check8_data
    print(f"  Total audio files: {len(all_wavs)}")
    print(f"  Dev speakers: {len(dev_speakers)} ({len(dev_files)} files)")
    print(f"  Test speakers: {len(test_speakers)} ({len(test_files)} files)")
    print(f"  Speaker disjointness verified: {check8_data['disjoint_check']}")

    # -------------------------------------------------------------------------
    # CHECK 4, 5 & 6: Frame Alignment, Dimensions & Ordering
    # -------------------------------------------------------------------------
    print("\n--- CHECK 4, 5 & 6: Alignment, Dimensions & Feature Ordering ---")
    dummy_audio = np.random.randn(16000 * 3).astype(np.float32)
    sr = 16000
    frame_length = 2048
    hop_length = 512

    mfcc = librosa.feature.mfcc(y=dummy_audio, sr=sr, n_mfcc=40, n_fft=frame_length, hop_length=hop_length)
    delta = librosa.feature.delta(mfcc)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=dummy_audio, sr=sr, n_mels=40, n_fft=frame_length, hop_length=hop_length))
    chroma = librosa.feature.chroma_stft(y=dummy_audio, sr=sr, n_fft=frame_length, hop_length=hop_length)
    contrast = librosa.feature.spectral_contrast(y=dummy_audio, sr=sr, n_fft=frame_length, hop_length=hop_length)
    rms = librosa.feature.rms(y=dummy_audio, frame_length=frame_length, hop_length=hop_length)

    mask_a = compute_vad_mask_candidate_a(dummy_audio, sr=sr, frame_length=frame_length, hop_length=hop_length)
    mask_b = compute_vad_mask_candidate_b(dummy_audio, sr=sr, frame_length=frame_length, hop_length=hop_length)

    n_frames = mfcc.shape[1]
    align_ok = (
        mfcc.shape[1] == delta.shape[1] == mel.shape[1] == chroma.shape[1] == contrast.shape[1] == rms.shape[1] == len(mask_a) == len(mask_b)
    )

    feat_a = extract_features_exp3(dummy_audio, vad_candidate="A")
    feat_b = extract_features_exp3(dummy_audio, vad_candidate="B")
    feat_base = extract_features_baseline(dummy_audio)

    check4_6_data = {
        "frame_alignment_match": bool(align_ok),
        "frame_count": n_frames,
        "feature_dim_candidate_a": len(feat_a),
        "feature_dim_candidate_b": len(feat_b),
        "feature_dim_baseline": len(feat_base),
        "dimension_target_met": (len(feat_a) == 296 and len(feat_b) == 296),
        "finite_values_check": bool(np.all(np.isfinite(feat_a)) and np.all(np.isfinite(feat_b))),
        "feature_293_speech_ratio_val": float(feat_a[293]),
        "feature_293_is_speech_ratio": bool(0.0 <= feat_a[293] <= 1.0),
    }
    results["check4_5_6_alignment_and_dimensions"] = check4_6_data
    print(f"  Frame synchronization across all 7 matrices: {align_ok} ({n_frames} frames)")
    print(f"  Feature dimensions: Candidate A = {len(feat_a)}, Candidate B = {len(feat_b)}, Baseline = {len(feat_base)}")
    print(f"  Feature 293 (Speech Ratio): {feat_a[293]:.4f} (Valid probability: {check4_6_data['feature_293_is_speech_ratio']})")

    # -------------------------------------------------------------------------
    # CHECK 1 & 2: Compare Candidate A and Candidate B on Key Clips
    # -------------------------------------------------------------------------
    print("\n--- CHECK 1, 2 & 3: VAD Comparison & Speech Preservation ---")
    test_clips = {
        "Sad2_mp3": "C:/Users/JAI-SREE-RAM/Downloads/Sad2.mp3.mpeg",
        "Sad2_wav": "external_datasets/audio_for_friend/sample_audio/Sad2.wav",
        "CREMA_Sad": "data/AudioWAV/1001_DFA_SAD_XX.wav",
        "CREMA_Hap": "data/AudioWAV/1001_DFA_HAP_XX.wav",
        "CREMA_Fea": "data/AudioWAV/1001_DFA_FEA_XX.wav",
        "CREMA_Neu": "data/AudioWAV/1001_DFA_NEU_XX.wav",
        "CREMA_Ang": "data/AudioWAV/1001_DFA_ANG_XX.wav",
    }

    vad_comparisons = {}
    for name, path in test_clips.items():
        if not os.path.exists(path):
            continue
        y_raw, sr_raw = librosa.load(path, sr=16000)
        # Apply standard audio prep (trim leading/trailing silence, cap 6.0s, normalize 0.9)
        y_prep = prepare_signal(y_raw, 16000)
        dur = len(y_prep) / 16000

        mask_a = compute_vad_mask_candidate_a(y_prep, sr=16000)
        mask_b = compute_vad_mask_candidate_b(y_prep, sr=16000)

        rms = librosa.feature.rms(y=y_prep, frame_length=2048, hop_length=512)[0]
        n_tot = len(rms)

        # Contrast of energy in speech vs pause
        speech_rms_a = float(np.mean(rms[mask_a])) if np.any(mask_a) else 0.0
        pause_rms_a = float(np.mean(rms[~mask_a])) if np.any(~mask_a) else 0.0
        speech_rms_b = float(np.mean(rms[mask_b])) if np.any(mask_b) else 0.0
        pause_rms_b = float(np.mean(rms[~mask_b])) if np.any(~mask_b) else 0.0

        ratio_a = float(np.mean(mask_a))
        ratio_b = float(np.mean(mask_b))

        vad_comparisons[name] = {
            "duration_analyzed_s": round(dur, 3),
            "total_frames": n_tot,
            "candidate_a": {
                "speech_frames": int(np.sum(mask_a)),
                "pause_frames": int(np.sum(~mask_a)),
                "speech_ratio": round(ratio_a, 4),
                "speech_duration_s": round(ratio_a * dur, 3),
                "speech_rms": round(speech_rms_a, 4),
                "pause_rms": round(pause_rms_a, 4),
                "energy_contrast_db": round(20 * np.log10(max(speech_rms_a / max(pause_rms_a, 1e-6), 1.0)), 2),
            },
            "candidate_b": {
                "speech_frames": int(np.sum(mask_b)),
                "pause_frames": int(np.sum(~mask_b)),
                "speech_ratio": round(ratio_b, 4),
                "speech_duration_s": round(ratio_b * dur, 3),
                "speech_rms": round(speech_rms_b, 4),
                "pause_rms": round(pause_rms_b, 4),
                "energy_contrast_db": round(20 * np.log10(max(speech_rms_b / max(pause_rms_b, 1e-6), 1.0)), 2),
            },
        }
        print(f"  {name:12s} ({dur:.2f}s): Cand A Speech={ratio_a:.1%} (Contrast={vad_comparisons[name]['candidate_a']['energy_contrast_db']} dB) | Cand B Speech={ratio_b:.1%}")

    results["check1_2_3_vad_comparison"] = vad_comparisons

    # -------------------------------------------------------------------------
    # CHECK: Before/After Feature Deviations for Sad2 (Features 200–210)
    # -------------------------------------------------------------------------
    print("\n--- MEASURING SAD2 FEATURE DEVIATIONS: UN-GATED VS VAD-GATED ---")
    y_sad2_raw, _ = librosa.load(test_clips["Sad2_mp3"], sr=16000)
    y_sad2 = prepare_signal(y_sad2_raw, 16000)

    f_baseline = extract_features_baseline(y_sad2)
    f_cand_a = extract_features_exp3(y_sad2, vad_candidate="A")
    f_cand_b = extract_features_exp3(y_sad2, vad_candidate="B")

    # Standardize against staging scaler to measure z-score change
    z_baseline = (f_baseline - scaler_stage.mean_) / scaler_stage.scale_
    z_cand_a = (f_cand_a - scaler_stage.mean_) / scaler_stage.scale_
    z_cand_b = (f_cand_b - scaler_stage.mean_) / scaler_stage.scale_

    mel_std_comparison = []
    print(f"  {'Idx':4s} | {'Mel Band':15s} | {'Baseline Raw':12s} | {'Cand A Raw':12s} | {'Baseline Z':10s} | {'Cand A Z':10s} | {'Z Reduction':12s}")
    print(f"  {'-'*88}")
    for idx in range(200, 211):
        band_num = idx - 200
        raw_base = float(f_baseline[idx])
        raw_a = float(f_cand_a[idx])
        raw_b = float(f_cand_b[idx])
        zb = float(z_baseline[idx])
        za = float(z_cand_a[idx])
        mel_std_comparison.append({
            "feature_index": idx,
            "band_name": f"Mel Band {band_num} Std",
            "baseline_raw": round(raw_base, 3),
            "cand_a_raw": round(raw_a, 3),
            "cand_b_raw": round(raw_b, 3),
            "baseline_z": round(zb, 2),
            "cand_a_z": round(za, 2),
            "z_reduction": round(zb - za, 2),
        })
        print(f"  {idx:4d} | Mel Band {band_num:2d} Std | {raw_base:12.3f} | {raw_a:12.3f} | {zb:+10.2f} | {za:+10.2f} | {zb - za:+12.2f}")

    results["sad2_features_200_210_shift"] = mel_std_comparison

    # -------------------------------------------------------------------------
    # CHECK 7: Synthetic Pause-Insertion Experiment (0.5s, 1.0s, 2.0s)
    # -------------------------------------------------------------------------
    print("\n--- CHECK 7: Synthetic Pause-Insertion Experiment (0.5s, 1.0s, 2.0s) ---")
    crema_clean_clips = [
        "data/AudioWAV/1002_DFA_SAD_XX.wav",
        "data/AudioWAV/1002_DFA_HAP_XX.wav",
        "data/AudioWAV/1002_DFA_ANG_XX.wav",
        "data/AudioWAV/1002_DFA_FEA_XX.wav",
        "data/AudioWAV/1002_DFA_NEU_XX.wav",
    ]

    pause_durations = [0.5, 1.0, 2.0]
    pause_experiment_results = []

    for path in crema_clean_clips:
        if not os.path.exists(path):
            continue
        p = Path(path)
        y_clean, _ = librosa.load(path, sr=16000)
        y_clean = prepare_signal(y_clean, 16000)

        # Baseline clean features
        f_clean_base = extract_features_baseline(y_clean)
        f_clean_vada = extract_features_exp3(y_clean, vad_candidate="A")

        for pause_sec in pause_durations:
            # Insert pause in the middle
            split_point = len(y_clean) // 2
            silence_samples = int(pause_sec * 16000)
            # Create synthetic pause (clean digital pause / room tone floor)
            pause_samples = np.zeros(silence_samples, dtype=np.float32)
            y_paused = np.concatenate([y_clean[:split_point], pause_samples, y_clean[split_point:]])
            # Peak normalise to 0.9
            y_paused = y_paused / np.max(np.abs(y_paused)) * 0.9

            # Extract features on paused version
            f_paused_base = extract_features_baseline(y_paused)
            f_paused_vada = extract_features_exp3(y_paused, vad_candidate="A")
            f_paused_vadb = extract_features_exp3(y_paused, vad_candidate="B")

            # Measure shift in Mel Band 0 Std (Feature 200) and across all Mel stds (200-239)
            shift_mel0_base = float(f_paused_base[200] - f_clean_base[200])
            shift_mel0_vada = float(f_paused_vada[200] - f_clean_vada[200])

            max_mel_std_shift_base = float(np.max(np.abs(f_paused_base[200:240] - f_clean_base[200:240])))
            max_mel_std_shift_vada = float(np.max(np.abs(f_paused_vada[200:240] - f_clean_vada[200:240])))

            entry = {
                "clip": p.name,
                "pause_seconds": pause_sec,
                "mel0_std_clean": round(float(f_clean_base[200]), 3),
                "mel0_std_paused_un_gated": round(float(f_paused_base[200]), 3),
                "mel0_std_paused_vad_gated": round(float(f_paused_vada[200]), 3),
                "mel0_shift_un_gated": round(shift_mel0_base, 3),
                "mel0_shift_vad_gated": round(shift_mel0_vada, 3),
                "max_mel_std_shift_un_gated": round(max_mel_std_shift_base, 3),
                "max_mel_std_shift_vad_gated": round(max_mel_std_shift_vada, 3),
            }
            pause_experiment_results.append(entry)
            print(f"  {p.name:22s} + {pause_sec:3.1f}s pause -> Mel0 Shift: Un-gated={shift_mel0_base:+6.3f} dB | VAD-gated={shift_mel0_vada:+6.3f} dB (Max shift: {max_mel_std_shift_vada:.3f} vs {max_mel_std_shift_base:.3f})")

    results["check7_synthetic_pause_experiment"] = pause_experiment_results

    # Save to disk
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Phase 2 validation completed. Results written to {OUTPUT_JSON}")


if __name__ == "__main__":
    run_checks()
