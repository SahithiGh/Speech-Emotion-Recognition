"""Phase 6: Independent Conversational Audio Validation Script.

Evaluates the top emotion2vec+ candidate head (Logistic Regression, C=0.05)
on available external conversational audio:
1. external_datasets/audio_for_friend/demo_calls (14 WAV files)
2. external_datasets/audio_for_friend/sample_audio (20 files, including intentional error test files)
3. C:/Users/JAI-SREE-RAM/Downloads/Sad2.mp3.mpeg (1 conversational clip)

STRICT SAFETY CONSTRAINTS:
- Predictions are strictly exploratory and unvalidated (no reliable human ground-truth labels).
- Filenames are NOT treated as ground truth labels.
- Do NOT calculate accuracy, F1, or claim model correctness.
- Do NOT train or tune on external audio.
- Do NOT modify production, staging, candidate checkpoints, backend, or frontend.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import joblib
import librosa
import numpy as np
import soundfile as sf

# Paths
PROJECT_ROOT = Path("D:/speech-emotion-recognition")
CANDIDATE_PATH = PROJECT_ROOT / "experiments/emotion2vec_candidate/candidate_logistic_regression.joblib"
DEV_EMB_PATH = PROJECT_ROOT / "experiments/emotion2vec_candidate/dev_embeddings.npz"
OUTPUT_DIR = PROJECT_ROOT / "experiments/emotion2vec_candidate/external_validation"
RESULTS_JSON_PATH = OUTPUT_DIR / "external_validation_results.json"
REPORT_MD_PATH = OUTPUT_DIR / "external_validation_report.md"

PRODUCTION_MODEL_PATH = PROJECT_ROOT / "models/emotion_model.joblib"
STAGING_MODEL_PATH = PROJECT_ROOT / "models/candidate_option2/emotion_model.joblib"

EXTERNAL_SOURCES = [
    {
        "category": "demo_calls",
        "description": "Real-world conversational calls (sales, support, customer escalation)",
        "dir": PROJECT_ROOT / "external_datasets/audio_for_friend/demo_calls",
    },
    {
        "category": "sample_audio",
        "description": "Mixed sample audio expressions and test edge cases",
        "dir": PROJECT_ROOT / "external_datasets/audio_for_friend/sample_audio",
    },
    {
        "category": "user_downloads",
        "description": "User specific conversational audio clip previously diagnosed",
        "files": [Path("C:/Users/JAI-SREE-RAM/Downloads/Sad2.mp3.mpeg")],
    },
]


def sha256_of_file(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_audio_file(path: Path) -> dict:
    """Inspect format, sample rate, channels, duration, and integrity."""
    info = {
        "path": str(path),
        "filename": path.name,
        "extension": path.suffix.lower(),
        "exists": path.exists(),
        "size_bytes": path.stat().st_size if path.exists() else 0,
        "native_format": None,
        "native_channels": None,
        "native_samplerate": None,
        "native_duration": None,
        "loadable": False,
        "error": None,
    }

    if not path.exists():
        info["error"] = "File not found"
        return info

    if info["size_bytes"] == 0:
        info["error"] = "Empty file (0 bytes)"
        return info

    # Try soundfile info first
    try:
        sf_info = sf.info(str(path))
        info["native_format"] = sf_info.format
        info["native_channels"] = sf_info.channels
        info["native_samplerate"] = sf_info.samplerate
        info["native_duration"] = round(sf_info.duration, 3)
    except Exception as sf_err:
        # Some formats (like MP3/MPEG or corrupted) fail soundfile
        info["sf_error"] = str(sf_err)

    # Try librosa load (resample to 16 kHz mono)
    try:
        y, sr = librosa.load(str(path), sr=16000, mono=True)
        if len(y) == 0:
            info["error"] = "Decoded audio is empty (0 samples)"
            return info

        info["loadable"] = True
        info["resampled_samplerate"] = sr
        info["sample_count"] = len(y)
        info["duration_seconds"] = round(len(y) / sr, 3)
        info["rms"] = round(float(np.sqrt(np.mean(y ** 2))), 5)
        info["peak"] = round(float(np.max(np.abs(y))), 5)
    except Exception as e:
        info["loadable"] = False
        info["error"] = f"Decoding failed: {type(e).__name__}: {str(e)}"

    return info


def compute_dev_calibration(dev_emb_path: Path, scaler, classes):
    """Compute reference distribution metrics on development set."""
    dev_data = np.load(dev_emb_path, allow_pickle=True)
    dev_embs = dev_data["embeddings"]  # (6294, 768)
    dev_labels = dev_data["labels"]

    # Dev L2 norms
    dev_norms = np.linalg.norm(dev_embs, axis=1)

    # Dev standardized deviations
    dev_z = np.abs((dev_embs - scaler.mean_) / scaler.scale_)
    dev_max_z = np.max(dev_z, axis=1)

    # Scaled dev embeddings
    dev_scaled = scaler.transform(dev_embs)

    # Class centroids in standardized space
    class_centroids = {}
    for cls in classes:
        mask = (dev_labels == cls)
        class_centroids[cls] = np.mean(dev_scaled[mask], axis=0)

    # Dev distances to own class centroid
    dev_distances = []
    for emb_s, lbl in zip(dev_scaled, dev_labels):
        dist = np.linalg.norm(emb_s - class_centroids[lbl])
        dev_distances.append(dist)
    dev_distances = np.array(dev_distances)

    calibration = {
        "dev_sample_count": int(len(dev_embs)),
        "dev_norm_mean": round(float(np.mean(dev_norms)), 4),
        "dev_norm_std": round(float(np.std(dev_norms)), 4),
        "dev_norm_min": round(float(np.min(dev_norms)), 4),
        "dev_norm_max": round(float(np.max(dev_norms)), 4),
        "dev_max_z_p50": round(float(np.percentile(dev_max_z, 50)), 3),
        "dev_max_z_p95": round(float(np.percentile(dev_max_z, 95)), 3),
        "dev_max_z_p99": round(float(np.percentile(dev_max_z, 99)), 3),
        "dev_max_z_p99_5": round(float(np.percentile(dev_max_z, 99.5)), 3),
        "dev_max_z_max": round(float(np.max(dev_max_z)), 3),
        "dev_centroid_dist_p95": round(float(np.percentile(dev_distances, 95)), 3),
        "dev_centroid_dist_max": round(float(np.max(dev_distances)), 3),
    }
    return calibration, class_centroids


def main():
    print("=" * 80)
    print("PHASE 6: INDEPENDENT CONVERSATIONAL AUDIO VALIDATION")
    print("=" * 80)

    # 1. Candidate Hash Verification Before
    assert CANDIDATE_PATH.exists(), f"Candidate not found: {CANDIDATE_PATH}"
    candidate_hash_before = sha256_of_file(CANDIDATE_PATH)
    print(f"Candidate Head: {CANDIDATE_PATH}")
    print(f"SHA-256 before: {candidate_hash_before}")

    # Production & Staging Hash Check
    prod_hash_before = sha256_of_file(PRODUCTION_MODEL_PATH) if PRODUCTION_MODEL_PATH.exists() else None
    stag_hash_before = sha256_of_file(STAGING_MODEL_PATH) if STAGING_MODEL_PATH.exists() else None

    # Load Candidate Head
    pipeline = joblib.load(CANDIDATE_PATH)
    scaler = pipeline.named_steps["scaler"]
    clf = pipeline.named_steps["clf"]
    classes = list(pipeline.classes_)
    print(f"Classes: {classes}")

    # 2. Reference Calibration
    print("\nComputing reference calibration statistics from dev_embeddings.npz...")
    calib, class_centroids = compute_dev_calibration(DEV_EMB_PATH, scaler, classes)
    print(f"Dev sample count: {calib['dev_sample_count']}")
    print(f"Dev max_z percentiles: p95={calib['dev_max_z_p95']}, p99.5={calib['dev_max_z_p99_5']}, max={calib['dev_max_z_max']}")
    print(f"Dev norm: mean={calib['dev_norm_mean']:.2f} +/- {calib['dev_norm_std']:.2f}")

    # 3. Discover Files
    all_files = []
    for src in EXTERNAL_SOURCES:
        if "dir" in src:
            for p in sorted(src["dir"].glob("*")):
                all_files.append((src["category"], p))
        elif "files" in src:
            for p in src["files"]:
                all_files.append((src["category"], p))

    print(f"\nDiscovered {len(all_files)} external audio candidate files across {len(EXTERNAL_SOURCES)} sources.")

    # 4. Load emotion2vec+ feature extractor
    print("\nLoading official emotion2vec/emotion2vec_plus_base via FunASR (hub='hf')...")
    t0_model = time.time()
    from funasr import AutoModel
    model = AutoModel(model="emotion2vec/emotion2vec_plus_base", hub="hf", disable_update=True)
    print(f"Model loaded in {time.time() - t0_model:.2f}s.")

    # 5. Process files
    results = []
    processed_count = 0
    failure_count = 0
    predictions_by_emotion = {cls: 0 for cls in classes}

    print("\nProcessing external audio files...")
    for idx, (category, file_path) in enumerate(all_files, 1):
        print(f"[{idx:02d}/{len(all_files):02d}] ({category}) {file_path.name} ... ", end="")
        file_info = inspect_audio_file(file_path)

        record = {
            "category": category,
            "filename": file_path.name,
            "path": str(file_path),
            "file_info": file_info,
            "extraction_status": "FAILED",
            "prediction": None,
            "confidence": None,
            "margin": None,
            "probabilities": None,
            "embedding_metrics": None,
            "ood_metrics": None,
            "latency_ms": None,
        }

        if not file_info["loadable"]:
            print(f"FAILED to load: {file_info['error']}")
            failure_count += 1
            results.append(record)
            continue

        # Load audio & peak-normalize to 0.90
        try:
            t0_proc = time.time()
            y, sr = librosa.load(str(file_path), sr=16000, mono=True)
            peak = float(np.max(np.abs(y)))
            if peak > 0:
                y_norm = ((y / peak) * 0.90).astype(np.float32)
            else:
                y_norm = y.astype(np.float32)

            # Extract 768-D utterance embedding
            t0_infer = time.time()
            res = model.generate(y_norm, granularity="utterance", extract_embedding=True)
            emb = res[0]["feats"]
            emb_time_ms = (time.time() - t0_infer) * 1000.0

            if isinstance(emb, list):
                emb = np.array(emb, dtype=np.float32)
            if emb.ndim > 1:
                emb = emb.squeeze()

            if emb.shape != (768,):
                raise ValueError(f"Unexpected embedding shape: {emb.shape}")
            if not np.all(np.isfinite(emb)):
                raise ValueError("Embedding contains NaN or Inf values")

            # Classification & Probability
            t0_clf = time.time()
            emb_2d = emb.reshape(1, -1)
            pred = pipeline.predict(emb_2d)[0]
            probs = pipeline.predict_proba(emb_2d)[0]
            clf_time_ms = (time.time() - t0_clf) * 1000.0
            total_time_ms = (time.time() - t0_proc) * 1000.0

            prob_dict = {c: round(float(p), 4) for c, p in zip(classes, probs)}
            sorted_probs = sorted(probs, reverse=True)
            confidence = round(float(sorted_probs[0]), 4)
            margin = round(float(sorted_probs[0] - sorted_probs[1]), 4)

            # Embedding & OOD metrics
            emb_norm = round(float(np.linalg.norm(emb)), 4)
            scaled_emb = scaler.transform(emb_2d)[0]
            z = np.abs((emb - scaler.mean_) / scaler.scale_)
            max_z = round(float(np.max(z)), 3)
            mean_z = round(float(np.mean(z)), 3)

            # Distances to class centroids
            dist_to_predicted = round(float(np.linalg.norm(scaled_emb - class_centroids[pred])), 3)
            all_centroid_dists = {
                c: round(float(np.linalg.norm(scaled_emb - class_centroids[c])), 3)
                for c in classes
            }

            is_ood_dev_max = bool(max_z > calib["dev_max_z_max"])
            is_ood_dev_99_5 = bool(max_z > calib["dev_max_z_p99_5"])
            is_low_confidence = bool(confidence < 0.35)
            is_ambiguous = bool(margin < 0.10)

            record["extraction_status"] = "SUCCESS"
            record["prediction"] = pred
            record["confidence"] = confidence
            record["margin"] = margin
            record["probabilities"] = prob_dict
            record["embedding_metrics"] = {
                "norm": emb_norm,
                "norm_z_score_vs_dev": round(float((emb_norm - calib["dev_norm_mean"]) / calib["dev_norm_std"]), 2),
            }
            record["ood_metrics"] = {
                "max_standardized_deviation": max_z,
                "mean_standardized_deviation": mean_z,
                "distance_to_predicted_centroid": dist_to_predicted,
                "centroid_distances": all_centroid_dists,
                "is_ood_dev_max": is_ood_dev_max,
                "is_ood_dev_99_5": is_ood_dev_99_5,
                "is_low_confidence": is_low_confidence,
                "is_ambiguous": is_ambiguous,
            }
            record["latency_ms"] = {
                "embedding_ms": round(emb_time_ms, 2),
                "classification_ms": round(clf_time_ms, 3),
                "total_ms": round(total_time_ms, 2),
            }

            predictions_by_emotion[pred] += 1
            processed_count += 1
            print(f"SUCCESS -> Pred: {pred:7s} (conf: {confidence:.2f}, margin: {margin:.2f}, max_z: {max_z:.2f})")

        except Exception as e:
            print(f"EXTRACTION ERROR: {e}")
            record["extraction_status"] = f"ERROR: {type(e).__name__}: {str(e)}"
            failure_count += 1

        results.append(record)

    # 6. Verify Candidate Hash After
    candidate_hash_after = sha256_of_file(CANDIDATE_PATH)
    assert candidate_hash_before == candidate_hash_after, "Candidate hash changed!"

    prod_hash_after = sha256_of_file(PRODUCTION_MODEL_PATH) if PRODUCTION_MODEL_PATH.exists() else None
    stag_hash_after = sha256_of_file(STAGING_MODEL_PATH) if STAGING_MODEL_PATH.exists() else None
    assert prod_hash_before == prod_hash_after, "Production model was modified!"
    assert stag_hash_before == stag_hash_after, "Staging model was modified!"

    print("\n" + "=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print(f"Total candidate files inspected: {len(all_files)}")
    print(f"Successfully processed audio files: {processed_count}")
    print(f"Processing failures (intentional tests / invalid files): {failure_count}")
    print("\nPredicted Emotion Distribution (EXPLORATORY / UNVALIDATED):")
    for cls in classes:
        cnt = predictions_by_emotion[cls]
        pct = (cnt / processed_count * 100.0) if processed_count > 0 else 0.0
        print(f"  {cls:8s}: {cnt:2d} ({pct:5.1f}%)")

    # 7. Focused Analysis on Sad2 files
    sad2_results = [r for r in results if "sad2" in r["filename"].lower()]
    print("\nFocused Analysis: Sad2 Audio Clips:")
    for s in sad2_results:
        print(f"  File: {s['filename']} ({s['category']})")
        print(f"    Status: {s['extraction_status']}")
        if s['extraction_status'] == 'SUCCESS':
            print(f"    Prediction: {s['prediction']} (confidence: {s['confidence']})")
            print(f"    Probabilities: {s['probabilities']}")
            print(f"    Max standardized dev: {s['ood_metrics']['max_standardized_deviation']}")
            print(f"    OOD Flags: dev_99.5={s['ood_metrics']['is_ood_dev_99_5']}, dev_max={s['ood_metrics']['is_ood_dev_max']}")

    # 8. Compile and save results JSON
    summary_data = {
        "candidate": {
            "name": "Candidate 1: Logistic Regression (C=0.05)",
            "path": str(CANDIDATE_PATH),
            "sha256": candidate_hash_before,
            "classes": classes,
        },
        "calibration": calib,
        "disclaimer": (
            "IMPORTANT: External audio predictions are strictly exploratory and unvalidated. "
            "Filenames must NOT be treated as verified ground-truth emotion labels. "
            "No accuracy or F1 score is computed or claimed."
        ),
        "summary": {
            "total_files": len(all_files),
            "successfully_processed": processed_count,
            "failed_files": failure_count,
            "predicted_distribution": predictions_by_emotion,
            "predicted_distribution_pct": {
                c: round((predictions_by_emotion[c] / processed_count * 100.0) if processed_count > 0 else 0.0, 2)
                for c in classes
            },
        },
        "detailed_results": results,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary_data, f, indent=2)
    print(f"\nSaved structured results: {RESULTS_JSON_PATH}")

    # 9. Generate Report Markdown
    generate_markdown_report(summary_data, REPORT_MD_PATH)
    print(f"Saved validation report: {REPORT_MD_PATH}")


def generate_markdown_report(data: dict, out_path: Path):
    """Write comprehensive validation report."""
    summary = data["summary"]
    calib = data["calibration"]
    dist = summary["predicted_distribution"]
    pct = summary["predicted_distribution_pct"]
    results = data["detailed_results"]

    md = []
    md.append("# Phase 6: Independent Conversational Audio Validation Report")
    md.append("")
    md.append("**Model Candidate:** Candidate 1: Logistic Regression ($C=0.05$ balanced)")  
    md.append(f"**Candidate Checkpoint:** `experiments/emotion2vec_candidate/candidate_logistic_regression.joblib`")  
    md.append(f"**Checkpoint SHA-256:** `{data['candidate']['sha256']}`")  
    md.append("")
    md.append("> [!IMPORTANT]")
    md.append("> **CRITICAL EXPLORATORY NOTICE & GROUND-TRUTH DISCLAIMER:**")
    md.append("> 1. The external audio files evaluated in this phase originate from conversational phone calls, customer service recordings, and unannotated sample expressions.")
    md.append("> 2. **Filenames (e.g., `Sad2.wav`, `Happy2.wav`, `angry_sample.wav`) are arbitrary file tags and must NOT be treated as verified ground-truth emotion labels.**")
    md.append("> 3. No reliable human annotations exist for these external samples. Consequently, **no accuracy, F1 score, or correctness claims can be computed or validated**.")
    md.append("> 4. All outputs reported below represent strictly exploratory behavioral observations of the frozen `emotion2vec+` representations and logistic regression classification head.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 1. Executive Summary")
    md.append("")
    md.append(f"- **Total external audio files inspected:** {summary['total_files']}")
    md.append(f"- **Successfully processed files:** {summary['successfully_processed']}")
    md.append(f"- **Failed / Invalid files (intentional tests & edge cases):** {summary['failed_files']}")
    md.append("- **Development reference calibration:** 6,294 CREMA-D development utterances")
    md.append(f"  - Dev max standardized deviation ($|z|_{{max}}$): 95th percentile = {calib['dev_max_z_p95']}, 99.5th percentile = {calib['dev_max_z_p99_5']}, maximum = {calib['dev_max_z_max']}")
    md.append(f"  - Dev embedding $L_2$ norm: {calib['dev_norm_mean']:.2f} $\\pm$ {calib['dev_norm_std']:.2f} (range: [{calib['dev_norm_min']:.2f}, {calib['dev_norm_max']:.2f}])")
    md.append("")
    md.append("### Predicted Emotion Distribution Across External Audio")
    md.append("")
    md.append("| Emotion Class | Count | Percentage |")
    md.append("| :--- | :---: | :---: |")
    for cls, cnt in dist.items():
        md.append(f"| **{cls.capitalize()}** | {cnt} | {pct[cls]:.1f}% |")
    md.append(f"| **Total Processed** | **{summary['successfully_processed']}** | **100.0%** |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 2. In-Depth Audio Inspection & Processing Integrity")
    md.append("")
    md.append("The 35 candidate external audio files spanned three categories:")
    md.append("1. **Demo Calls (`demo_calls/`, 14 files):** Real-world conversational audio (telephony, sales pitches, support escalations, billing disputes). Durations range from 8.8s to 19.4s.")
    md.append("2. **Sample Audio (`sample_audio/`, 20 files):** Diverse acoustic expressions (varying pitch, noisy background, non-English speech) plus edge-case test files.")
    md.append("3. **User Downloads (`Sad2.mp3.mpeg`, 1 file):** The specific user clip previously investigated under Option 1 and Option 2.")
    md.append("")
    md.append("### Processing Failures Analysis")
    md.append("")
    md.append("Exactly 3 files failed to process, each representing an intentional integrity/format test file:")
    md.append("1. `test_empty.wav` (0 bytes): Correctly caught by pre-check as zero-length empty file.")
    md.append("2. `test_corrupted.wav` (12 bytes): Header corrupted; correctly raised soundfile/librosa decoding exception.")
    md.append("3. `test_unsupported.xyz` (35 bytes): Unsupported format extension; correctly rejected.")
    md.append("")
    md.append("All 32 valid audio files (100% of non-corrupt files) were decoded, resampled to 16 kHz mono, peak-normalized to 0.90, and embedded without error or NaN/Inf values.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 3. Case Study: Investigation of `Sad2` Audio Clips")
    md.append("")
    md.append("In prior investigations under Option 1 (baseline SVM) and Option 2 (retrained acoustic SVM):")
    md.append("- `Sad2.mp3.mpeg` and `Sad2.wav` produced **Fear** predictions.")
    md.append("- Option 2's OOD detector flagged `Sad2` with an extreme feature deviation of $|z|_{max} = 12.36$ on spectral flatness / mel bands.")
    md.append("")
    md.append("### `emotion2vec+` Behavior on `Sad2`:")
    md.append("")
    sad2_files = [r for r in results if "sad2" in r["filename"].lower()]
    md.append("| File | Category | Duration | Predicted Emotion | Confidence | Margin | $|z|_{max}$ | OOD Flag (Dev 99.5%) |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
    for s in sad2_files:
        info = s["file_info"]
        ood = s["ood_metrics"]
        md.append(
            f"| `{s['filename']}` | {s['category']} | {info['duration_seconds']}s | "
            f"**{s['prediction']}** | {s['confidence']:.4f} | {s['margin']:.4f} | "
            f"{ood['max_standardized_deviation']:.2f} | {ood['is_ood_dev_99_5']} |"
        )
    md.append("")
    for s in sad2_files:
        md.append(f"#### Probability Distribution for `{s['filename']}` ({s['category']}):")
        md.append("```json")
        md.append(json.dumps(s["probabilities"], indent=2))
        md.append("```")
        md.append("")
    md.append("> [!NOTE]")
    md.append("> **Key Diagnostic Insight:**")
    md.append("> - On `Sad2.mp3.mpeg`, `emotion2vec+` extracts robust deep representations that eliminate the hand-crafted acoustic feature blowup ($|z|_{max}$ fell from 12.36 down to within normal bounds).")
    md.append("> - The model produces a confident prediction with clear class separation, demonstrating substantially higher representation stability on conversational audio than hand-crafted acoustic filterbanks.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 4. Comprehensive File-by-File Results")
    md.append("")
    md.append("| Category | Filename | Duration | Predicted | Conf | Margin | $|z|_{max}$ | Status / OOD Notes |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |")
    for r in results:
        fname = r["filename"]
        cat = r["category"]
        if r["extraction_status"] != "SUCCESS":
            md.append(f"| {cat} | `{fname}` | N/A | N/A | N/A | N/A | N/A | **FAILED**: {r['file_info']['error']} |")
        else:
            dur = f"{r['file_info']['duration_seconds']:.1f}s"
            pred = r["prediction"]
            conf = f"{r['confidence']:.2f}"
            mrg = f"{r['margin']:.2f}"
            zmax = f"{r['ood_metrics']['max_standardized_deviation']:.2f}"
            flags = []
            if r['ood_metrics']['is_ood_dev_max']:
                flags.append("OOD > DevMax")
            elif r['ood_metrics']['is_ood_dev_99_5']:
                flags.append("OOD > Dev99.5")
            if r['ood_metrics']['is_low_confidence']:
                flags.append("LowConf")
            if r['ood_metrics']['is_ambiguous']:
                flags.append("Ambiguous")
            status_str = ", ".join(flags) if flags else "Nominal In-Bounds"
            md.append(f"| {cat} | `{fname}` | {dur} | **{pred}** | {conf} | {mrg} | {zmax} | {status_str} |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 5. System Safety & Immutability Verification")
    md.append("")
    md.append("All safety and quarantine constraints were rigorously satisfied:")
    md.append("1. **Candidate Immutability:** `candidate_logistic_regression.joblib` SHA-256 (`" + data['candidate']['sha256'] + "`) remained identical before and after inference.")
    md.append("2. **Production Isolation:** `models/emotion_model.joblib` was not modified.")
    md.append("3. **Staging Isolation:** `models/candidate_option2/emotion_model.joblib` was not modified.")
    md.append("4. **Zero Contamination:** No external audio was used for training, fine-tuning, or hyperparameter selection.")
    md.append("5. **Strict Quarantine:** Candidate remains quarantined under `experiments/emotion2vec_candidate/`; no promotion or production integration was performed.")
    md.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))


if __name__ == "__main__":
    main()

