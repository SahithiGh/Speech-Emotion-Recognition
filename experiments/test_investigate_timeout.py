"""Diagnosis script to reproduce and isolate the timeout error on Happy2.mp3.mpeg and Sad2.mp3.mpeg.
"""
import os
import sys
import time

ROOT = r"D:\speech-emotion-recognition"
sys.path.insert(0, os.path.join(ROOT, "backend"))

HAPPY_PATH = r"C:\Users\JAI-SREE-RAM\Downloads\Happy2.mp3.mpeg"
SAD_PATH = r"C:\Users\JAI-SREE-RAM\Downloads\Sad2.mp3.mpeg"

from app import config as C
from app.audio import load_audio_file, load_raw_signal
from app import predict
from app import transcription
from app import consistency


def test_file(filepath: str, profile_name: str):
    print("=" * 60)
    print(f"Testing {os.path.basename(filepath)} with profile: {profile_name}")
    print("=" * 60)

    C.set_active_model_profile(profile_name)
    os.environ["SER_TRANSCRIBER"] = "faster-whisper"
    predict._cache.update(path=None, mtime=None, bundle=None, id=None, error=None)

    with open(filepath, "rb") as f:
        data = f.read()

    print(f"File size: {len(data):,} bytes")

    # Step 1: Raw signal loading
    t0 = time.perf_counter()
    raw_y = load_raw_signal(data)
    t_load = time.perf_counter() - t0
    print(f"[1] load_raw_signal: shape={raw_y.shape}, duration={len(raw_y)/16000:.3f}s in {t_load*1000:.1f} ms")

    # Step 2: Prediction bytes
    t0 = time.perf_counter()
    try:
        pred = predict.predict_bytes(data)
        t_pred = time.perf_counter() - t0
        print(f"[2] predict_bytes: emotion={pred.get('emotion')}, conf={pred.get('confidence'):.4f}, ood={pred.get('out_of_distribution')} in {t_pred*1000:.1f} ms")
    except Exception as exc:
        t_pred = time.perf_counter() - t0
        print(f"[2] predict_bytes FAILED after {t_pred*1000:.1f} ms: {type(exc).__name__}: {exc}")

    # Step 3: Transcription
    t0 = time.perf_counter()
    try:
        st = transcription.status()
        print(f"[3a] transcription status: available={st.get('available')}, reason={st.get('reason')}")
        if st["available"]:
            trans_res = transcription.transcribe(raw_y)
            t_trans = time.perf_counter() - t0
            print(f"[3b] transcribe: text='{trans_res.get('text')}' in {t_trans*1000:.1f} ms")
        else:
            t_trans = time.perf_counter() - t0
            print(f"[3b] transcription skipped in {t_trans*1000:.1f} ms")
    except Exception as exc:
        t_trans = time.perf_counter() - t0
        print(f"[3b] transcribe FAILED after {t_trans*1000:.1f} ms: {type(exc).__name__}: {exc}")

    # Step 4: Total pipeline simulation
    print(f"Total serial time: {(t_load + t_pred + t_trans):.2f} s")


def main():
    for profile in ["production", "emotion2vec_experimental"]:
        for fpath in [SAD_PATH, HAPPY_PATH]:
            test_file(fpath, profile)


if __name__ == "__main__":
    main()
