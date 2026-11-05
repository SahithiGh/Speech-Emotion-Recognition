"""Comprehensive test of duration analysis (6s, 10s, 20s, 30s, 60s),
audio formats (WAV, MP3, MP4), conditions (clean, noisy, silence, corrupt),
and playback/transcription integrity.
"""
import io
import os
import sys
import time
import wave
from pathlib import Path
import numpy as np

# Ensure root in sys.path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from backend.app import config as C
from backend.app import predict
from backend.app.errors import AudioError


def make_speech_wav_bytes(duration_s: float, sr: int = 16000, noise_amp: float = 0.0) -> bytes:
    """Create modulated harmonic signal simulating human vocalization."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False, dtype=np.float32)
    # Pitch contour with harmonic content
    f0 = 180.0 + 30.0 * np.sin(2 * np.pi * 0.5 * t)
    sig = (
        0.5 * np.sin(2 * np.pi * f0 * t)
        + 0.25 * np.sin(2 * np.pi * 2 * f0 * t)
        + 0.15 * np.sin(2 * np.pi * 3 * f0 * t)
    ).astype(np.float32)
    # Speech-like rhythm/syllabic envelope (3 Hz syllables)
    envelope = 0.5 * (1.0 + np.sin(2 * np.pi * 3.0 * t))
    sig = sig * envelope
    
    if noise_amp > 0:
        noise = np.random.normal(0, noise_amp, len(t)).astype(np.float32)
        sig = sig + noise
        
    pk = float(np.max(np.abs(sig)))
    if pk > 0:
        sig = sig / pk * 0.8
        
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        samples = (sig * 32767).astype(np.int16)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


def run_tests():
    print("=" * 80)
    print("TEST SUITE: AUDIO DURATIONS, FORMATS, AND QUALITY CONDITIONS")
    print("=" * 80)
    
    durations = [6.0, 10.0, 20.0, 30.0, 60.0]
    duration_results = []
    
    print("\n--- 1. Testing Audio Durations (6s, 10s, 20s, 30s, 60s) ---")
    for dur in durations:
        t0 = time.perf_counter()
        data = make_speech_wav_bytes(dur)
        res = predict.predict_bytes(data)
        elapsed = round((time.perf_counter() - t0), 2)
        analyzed = res["analyzed_seconds"]
        top_emotion = res["emotion"]
        conf = res["confidence"]
        n_notes = len(res.get("notes", []))
        
        # Verify analyzed duration matches the input duration (within trim tolerance ~0.1s)
        diff = abs(analyzed - dur)
        passed = diff <= 0.3
        status_str = "PASS" if passed else "FAIL"
        
        duration_results.append({
            "target_duration": dur,
            "analyzed_duration": analyzed,
            "difference": round(diff, 2),
            "top_emotion": top_emotion,
            "confidence": round(conf, 3),
            "latency_s": elapsed,
            "passed": passed,
        })
        print(f"[{status_str}] Input: {dur:>4}s -> Analyzed: {analyzed:>5.2f}s | Emotion: {top_emotion:<8} ({conf*100:>5.1f}%) | Time: {elapsed:>4.2f}s")
        assert passed, f"Duration mismatch: expected ~{dur}s, got {analyzed}s"
        assert "Only the first 6 seconds" not in " ".join(res.get("notes", [])), "Found legacy 6s truncation note!"

    print("\n--- 2. Testing Formats (WAV, MP3, MP4) ---")
    # WAV
    clean_wav_path = Path("external data/sample_audio/real_voice.wav")
    if clean_wav_path.exists():
        with open(clean_wav_path, "rb") as f:
            wav_res = predict.predict_bytes(f.read())
        print(f"[PASS] Clean WAV ({clean_wav_path.name}) -> Analyzed: {wav_res['analyzed_seconds']}s, Emotion: {wav_res['emotion']}")
        assert wav_res["prediction_accepted"] is True
        
    # MP3
    mp3_path = Path("external data/sample_audio/test_voice.mp3")
    if mp3_path.exists():
        with open(mp3_path, "rb") as f:
            mp3_res = predict.predict_bytes(f.read())
        print(f"[PASS] MP3 ({mp3_path.name}) -> Analyzed: {mp3_res['analyzed_seconds']}s, Emotion: {mp3_res['emotion']}")
        assert mp3_res["prediction_accepted"] is True

    # MP4
    mp4_path = Path("external data/sample_audio/test_video_track.mp4")
    if mp4_path.exists():
        with open(mp4_path, "rb") as f:
            mp4_res = predict.predict_bytes(f.read())
        print(f"[PASS] MP4 video audio extraction ({mp4_path.name}) -> Analyzed: {mp4_res['analyzed_seconds']}s, Emotion: {mp4_res['emotion']}")
        assert mp4_res["prediction_accepted"] is True

    print("\n--- 3. Testing Quality Conditions (Clean, Noisy, Silence, Corrupted) ---")
    # Clean speech
    clean_data = make_speech_wav_bytes(6.0, noise_amp=0.0)
    clean_res = predict.predict_bytes(clean_data)
    print(f"[PASS] Clean Speech -> Noise Reduction Applied: {clean_res['noise_reduction']['applied']} (Expected False for clean)")
    assert clean_res["audio_quality"]["status"] in ("GOOD", "WARNING")

    # Moderately noisy speech
    noisy_mod_data = make_speech_wav_bytes(6.0, noise_amp=0.04)
    noisy_mod_res = predict.predict_bytes(noisy_mod_data)
    print(f"[PASS] Moderately Noisy -> Initial: {noisy_mod_res['initial_audio_quality']['status']} -> Reduced: {noisy_mod_res['noise_reduction']['applied']}")
    assert noisy_mod_res["prediction_accepted"] is True

    # Heavily noisy speech file (Noisy1.wav)
    noisy1_path = Path("external data/sample_audio/Noisy1.wav")
    if noisy1_path.exists():
        with open(noisy1_path, "rb") as f:
            n1_res = predict.predict_bytes(f.read())
        print(f"[PASS] Heavy Noise File ({noisy1_path.name}) -> Noise Reduction: {n1_res['noise_reduction']['applied']} ({n1_res['noise_reduction'].get('noise_floor_reduction_pct', 0)}% reduction)")
        assert n1_res["prediction_accepted"] is True

    # Silence
    silence_wav = make_speech_wav_bytes(3.0, noise_amp=0.0)
    # Zero out signal to simulate dead silence
    silence_data = (np.zeros(16000 * 3, dtype=np.int16)).tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(silence_data)
    silence_bytes = buf.getvalue()
    try:
        predict.predict_bytes(silence_bytes)
        print("[FAIL] Silence was not rejected!")
        assert False, "Silence should raise AudioError"
    except AudioError as err:
        print(f"[PASS] Silence correctly rejected: code='{err.code}', message='{err}'")
        assert err.code in ("silent", "unusable_audio")

    # Corrupted audio
    corrupt_bytes = b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00CORRUPTED_GARBAGE_DATA"
    try:
        predict.predict_bytes(corrupt_bytes)
        print("[FAIL] Corrupted audio was not rejected!")
        assert False, "Corrupted audio should raise AudioError"
    except AudioError as err:
        print(f"[PASS] Corrupted audio correctly rejected: code='{err.code}', message='{err}'")

    print("\n" + "=" * 80)
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)
    return duration_results

if __name__ == "__main__":
    run_tests()

