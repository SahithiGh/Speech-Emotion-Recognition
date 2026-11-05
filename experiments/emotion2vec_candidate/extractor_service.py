"""Standalone emotion2vec+ embedding extraction service running in .venv_e2v.

Operates in two modes:
1. Daemon mode (persistent process with stdin/stdout JSON-lines IPC):
   - Loads emotion2vec+ foundation model once into memory.
   - Responds to requests in ~0.2s with 768-D utterance embedding.
2. CLI mode (one-shot fallback):
   - python extractor_service.py --input <path_to_wav>
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import librosa


def load_model():
    """Load official emotion2vec+ model via FunASR."""
    from funasr import AutoModel
    return AutoModel(
        model="emotion2vec/emotion2vec_plus_base",
        hub="hf",
        disable_update=True,
        device="cpu",
    )


def extract_embedding_from_file(model, path_str: str) -> list[float]:
    """Load audio, resample to 16 kHz mono, peak-normalize to 0.90, extract 768-D embedding."""
    y, sr = librosa.load(path_str, sr=16000, mono=True)
    pk = float(np.max(np.abs(y)))
    if pk > 0:
        y = (y / pk) * 0.90
    y = y.astype(np.float32)

    res = model.generate(y, granularity="utterance", extract_embedding=True)
    emb = res[0]["feats"]
    if isinstance(emb, list):
        emb = np.array(emb, dtype=np.float32)
    if emb.ndim > 1:
        emb = emb.squeeze()
    if emb.shape != (768,):
        raise ValueError(f"Unexpected embedding shape: {emb.shape}")
    if not np.all(np.isfinite(emb)):
        raise ValueError("Extracted embedding contains NaN or Inf values")
    return [round(float(v), 6) for v in emb]


MSG_PREFIX = "__E2V_MSG__:"


def send_msg(data: dict):
    sys.stdout.write(f"{MSG_PREFIX}{json.dumps(data)}\n")
    sys.stdout.flush()


def run_daemon():
    """Persistent stdin/stdout JSON-RPC loop."""
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

    try:
        model = load_model()
        send_msg({"status": "ready", "model": "emotion2vec_plus_base"})
    except Exception as exc:
        send_msg({"status": "error", "error": f"Failed to load model: {exc}"})
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            action = req.get("action", "extract")
            if action in ("exit", "shutdown"):
                send_msg({"status": "closed"})
                break
            elif action == "ping":
                send_msg({"status": "pong"})
                continue

            wav_path = req.get("wav_path")
            if not wav_path or not Path(wav_path).exists():
                send_msg({"status": "error", "error": f"Audio file not found: {wav_path}"})
                continue

            t0 = time.perf_counter()
            emb = extract_embedding_from_file(model, wav_path)
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
            send_msg({
                "status": "ok",
                "embedding": emb,
                "dimension": len(emb),
                "elapsed_ms": elapsed_ms,
            })

        except Exception as exc:
            send_msg({"status": "error", "error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description="emotion2vec+ feature extraction service")
    parser.add_argument("--daemon", action="store_true", help="Run as persistent daemon reading stdin")
    parser.add_argument("--input", type=str, help="Input audio path for one-shot extraction")
    args = parser.parse_args()

    if args.daemon:
        run_daemon()
    elif args.input:
        model = load_model()
        emb = extract_embedding_from_file(model, args.input)
        print(json.dumps({"status": "ok", "dimension": len(emb), "embedding": emb}))
    else:
        # Default to daemon mode if stdin is piped
        run_daemon()


if __name__ == "__main__":
    main()
