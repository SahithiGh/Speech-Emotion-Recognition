"""Isolated Smoke Test Script for emotion2vec+ (emotion2vec_plus_base).

Executes Phase 2 Minimal Verification:
1. Load official emotion2vec_plus_base model via FunASR AutoModel.
2. Measure model loading time and peak RAM usage.
3. Test exactly 3 audio samples:
   - Sad2.mp3.mpeg
   - Happy2.wav
   - Neutral1.wav
4. Preprocess to mono 16 kHz, peak-normalize to 0.9.
5. Extract utterance-level 768-dimensional embeddings via official API.
6. Verify shape == (768,), non-empty, all finite (no NaN/Inf).
7. Record inference latency, RAM, and diagnostic metrics.
8. Output structured results to smoke_test_results.json.
"""
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import psutil
import soundfile as sf
import librosa

OUTPUT_JSON = Path("experiments/emotion2vec_candidate/smoke_test_results.json")


def get_process_ram_mb() -> float:
    """Current resident set size in MB."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)


def sha256_of_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_smoke_test():
    print("=" * 80)
    print("PHASE 2 SMOKE TEST: EMOTION2VEC+ ISOLATED INFERENCE VERIFICATION")
    print("=" * 80)

    initial_ram = get_process_ram_mb()
    print(f"Initial Python process RAM: {initial_ram:.2f} MB")

    # 1. Official Model Loading
    print("\n[Step 1] Loading official emotion2vec/emotion2vec_plus_base via FunASR...")
    t0_load = time.time()
    from funasr import AutoModel

    # Load via Hugging Face hub (with fallback to ModelScope if HF is throttled)
    try:
        model = AutoModel(model="emotion2vec/emotion2vec_plus_base", hub="hf", device="cpu")
        hub_used = "hf"
    except Exception as exc:
        print(f"Notice: HF hub load encountered {exc}. Trying ModelScope hub...")
        model = AutoModel(model="iic/emotion2vec_plus_base", hub="ms", device="cpu")
        hub_used = "ms"

    load_time_sec = time.time() - t0_load
    post_load_ram = get_process_ram_mb()
    model_ram_delta = post_load_ram - initial_ram

    print(f"Model loaded successfully in {load_time_sec:.2f}s (Hub: {hub_used}).")
    print(f"Post-load RAM: {post_load_ram:.2f} MB (RAM increase: {model_ram_delta:.2f} MB)")

    # 2. Test Audio Files
    test_files = [
        ("Sad2.mp3.mpeg", "C:/Users/JAI-SREE-RAM/Downloads/Sad2.mp3.mpeg"),
        ("Happy2.wav", "external_datasets/audio_for_friend/sample_audio/Happy2.wav"),
        ("Neutral1.wav", "external_datasets/audio_for_friend/sample_audio/Neutral1.wav"),
    ]

    sample_results = []
    peak_ram_during_infer = post_load_ram

    for name, path_str in test_files:
        print(f"\n[Testing Clip] {name} ({path_str})")
        if not os.path.exists(path_str):
            raise FileNotFoundError(f"Required smoke test sample not found: {path_str}")

        # Preprocessing: load, convert to mono 16 kHz, peak-normalize
        t0_prep = time.time()
        y, orig_sr = librosa.load(path_str, sr=16000, mono=True)
        raw_duration = len(y) / 16000.0

        peak = float(np.max(np.abs(y)))
        if peak > 1e-6:
            y = y / peak * 0.9
        y = y.astype(np.float32)
        prep_time_ms = (time.time() - t0_prep) * 1000

        # Inference: extract 768-dim utterance embedding
        t0_infer = time.time()
        # FunASR AutoModel accepts 1D numpy array
        res_list = model.generate(
            y,
            granularity="utterance",
            extract_embedding=True,
        )
        infer_time_ms = (time.time() - t0_infer) * 1000
        rtf = (infer_time_ms / 1000.0) / raw_duration

        current_ram = get_process_ram_mb()
        peak_ram_during_infer = max(peak_ram_during_infer, current_ram)

        # Inspect output
        if not res_list or not isinstance(res_list, list):
            raise RuntimeError(f"Unexpected response format from model.generate: {type(res_list)}")

        res = res_list[0]
        feats = res.get("feats")
        if feats is None:
            raise KeyError(f"No 'feats' key found in model output dict. Keys: {list(res.keys())}")

        emb = np.asarray(feats, dtype=np.float32).squeeze()

        # Dimension and finite value assertions
        is_finite = bool(np.all(np.isfinite(emb)))
        is_nonempty = bool(emb.size > 0)
        dim = int(emb.shape[0]) if emb.ndim == 1 else -1

        print(f"  Duration: {raw_duration:.3f}s | Prep: {prep_time_ms:.1f}ms | Infer: {infer_time_ms:.1f}ms (RTF: {rtf:.4f})")
        print(f"  Embedding Shape: {emb.shape} | Dim == 768: {dim == 768} | All Finite: {is_finite}")
        print(f"  L2 Norm: {np.linalg.norm(emb):.4f} | Min: {emb.min():.4f} | Max: {emb.max():.4f} | Mean: {emb.mean():.4f} | Std: {emb.std():.4f}")

        sample_results.append({
            "name": name,
            "path": path_str,
            "raw_duration_sec": round(raw_duration, 3),
            "prep_time_ms": round(prep_time_ms, 2),
            "infer_time_ms": round(infer_time_ms, 2),
            "real_time_factor": round(rtf, 4),
            "embedding_dimension": dim,
            "dimension_valid_768": bool(dim == 768),
            "all_values_finite": is_finite,
            "is_nonempty": is_nonempty,
            "l2_norm": round(float(np.linalg.norm(emb)), 4),
            "min_val": round(float(emb.min()), 4),
            "max_val": round(float(emb.max()), 4),
            "mean_val": round(float(emb.mean()), 4),
            "std_val": round(float(emb.std()), 4),
            "first_5_values": [round(float(v), 5) for v in emb[:5]],
        })

    # Summary report
    all_valid = all(s["dimension_valid_768"] and s["all_values_finite"] for s in sample_results)
    report = {
        "status": "PASS" if all_valid else "FAIL",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model_identifier": "emotion2vec/emotion2vec_plus_base",
        "hub_used": hub_used,
        "runtime_metrics": {
            "model_load_time_sec": round(load_time_sec, 2),
            "initial_ram_mb": round(initial_ram, 2),
            "post_load_ram_mb": round(post_load_ram, 2),
            "peak_inference_ram_mb": round(peak_ram_during_infer, 2),
            "model_net_ram_mb": round(peak_ram_during_infer - initial_ram, 2),
        },
        "sample_verifications": sample_results,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n[OK] Smoke test completed successfully. Output written to {OUTPUT_JSON}")


if __name__ == "__main__":
    run_smoke_test()

