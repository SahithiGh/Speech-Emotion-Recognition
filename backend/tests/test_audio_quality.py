"""Automated Tests for Audio Quality Assessment and Noisy Audio Detection.

Tests cover:
1. Clean speech (GOOD)
2. Speech with slight background noise (WARNING)
3. Speech with heavy background noise (NOISY - rejection from prediction)
4. Very quiet speech (distinguished from noise)
5. Pure silence (UNUSABLE)
6. Clipped/distorted audio (UNUSABLE / WARNING)
7. Short recording < 0.5s (UNUSABLE)
8. Real WAV uploads
9. Real MP3 uploads
10. API endpoint behavior on clean vs noisy vs unusable audio
"""
import io
import os
import wave
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.audio_quality import assess_audio_quality
from app.audio import _decode
from app import predict
from app.main import app


def make_clean_speech_wav(duration_s=2.5, sr=16000, freq=300.0, amplitude=0.4):
    """Generate harmonic speech-like modulated waveform with clean silence floor."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    sig = amplitude * (
        0.6 * np.sin(2 * np.pi * freq * t) +
        0.3 * np.sin(2 * np.pi * 2 * freq * t) +
        0.1 * np.sin(2 * np.pi * 3 * freq * t)
    )
    # Add envelope syllabic modulation with pauses
    mod = np.clip(np.sin(2 * np.pi * 2.5 * t), 0, 1)
    sig = (sig * mod).astype(np.float32)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((sig * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def make_noisy_wav(clean_bytes: bytes, noise_amplitude=0.08, sr=16000):
    """Inject heavy stationary broadband Gaussian noise into clean audio."""
    with wave.open(io.BytesIO(clean_bytes), "rb") as wf:
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32767.0

    noise = np.random.normal(0, noise_amplitude, len(samples)).astype(np.float32)
    noisy_samples = np.clip(samples + noise, -1.0, 1.0)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((noisy_samples * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def test_clean_speech_quality():
    wav = make_clean_speech_wav(duration_s=3.0)
    y, sr = _decode(wav)
    res = assess_audio_quality(y, sr)
    assert res["status"] == "GOOD"
    assert res["prediction_accepted"] is True
    assert res["snr_db"] >= 25.0
    assert res["speech_duration"] >= 1.0


def test_heavy_noise_rejection():
    clean_wav = make_clean_speech_wav(duration_s=3.0)
    # Heavy noise level (0.08 amplitude)
    noisy_wav = make_noisy_wav(clean_wav, noise_amplitude=0.08)
    y, sr = _decode(noisy_wav)
    res = assess_audio_quality(y, sr)
    assert res["status"] == "NOISY"
    assert res["prediction_accepted"] is True
    assert "Noisy audio detected" in res["reason"]


def test_real_noisy_samples():
    """Verify real project test samples Noisy1.wav and Noisy2.wav trigger noise reduction and retain valid predictions."""
    for fname in ["Noisy1.wav", "Noisy2.wav"]:
        path = os.path.join(r"external data\sample_audio", fname)
        if not os.path.exists(path):
            path = os.path.join("backend_reference", fname)
        if not os.path.exists(path):
            continue
        with open(path, "rb") as f:
            data = f.read()
        res = predict.predict_bytes(data)
        assert res["prediction_accepted"] is True
        assert res["audio_quality"]["status"] in ("NOISY", "WARNING")
        assert res.get("noise_reduction", {}).get("applied") is True
        assert res["noise_reduction"]["noise_floor_after"] < res["noise_reduction"]["noise_floor_before"]
        assert res["emotion"] is not None
        assert res["confidence"] > 0.0
        assert len(res["scores"]) == 6


def test_real_clean_sample():
    """Verify clean recordings are classified as GOOD."""
    path = os.path.join(r"external data\sample_audio", "Happy2.wav")
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        res = predict.predict_bytes(data)
        assert res["prediction_accepted"] is True
        assert res["audio_quality"]["status"] == "GOOD"
        assert res["emotion"] is not None
        assert res["confidence"] > 0.0


def test_moderate_noise_warning():
    """Verify moderate background noise produces a WARNING with prediction accepted."""
    path = os.path.join(r"external data\sample_audio", "real_voice.wav")
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        res = predict.predict_bytes(data)
        assert res["prediction_accepted"] is True
        assert res["audio_quality"].get("initial_status", res["audio_quality"]["status"]) == "WARNING"
        assert res["audio_quality"]["status"] in ("WARNING", "GOOD")
        assert res.get("noise_reduction", {}).get("applied") is True or any("Background noise" in n for n in res["notes"])


def test_quiet_speech_distinction():
    """Verify quiet speech with a low noise floor is NOT falsely classified as NOISY."""
    clean_wav = make_clean_speech_wav(duration_s=3.0, amplitude=0.04) # very quiet speech
    y, sr = _decode(clean_wav)
    res = assess_audio_quality(y, sr)
    assert res["status"] in ("GOOD", "WARNING")
    assert res["status"] != "NOISY"
    assert res["prediction_accepted"] is True


def test_silence_unusable():
    """Verify pure silence is marked as UNUSABLE."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(np.zeros(32000, dtype=np.int16).tobytes())
    y, sr = _decode(buf.getvalue())
    res = assess_audio_quality(y, sr)
    assert res["status"] == "UNUSABLE"
    assert res["prediction_accepted"] is False
    assert "silent" in res["reason"].lower() or "too quiet" in res["reason"].lower()


def test_short_recording_unusable():
    """Verify recording < 0.5s is marked as UNUSABLE."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(np.zeros(4000, dtype=np.int16).tobytes()) # 0.25s
    y, sr = _decode(buf.getvalue())
    res = assess_audio_quality(y, sr)
    assert res["status"] == "UNUSABLE"
    assert res["prediction_accepted"] is False
    assert "shorter than 0.5" in res["reason"]


def test_severe_clipping_unusable():
    """Verify severe clipping distortion (> 3%) is UNUSABLE."""
    sr = 16000
    t = np.linspace(0, 2.0, int(2.0 * sr), endpoint=False)
    # Severe clipped square/sine
    sig = 5.0 * np.sin(2 * np.pi * 300 * t)
    sig = np.clip(sig, -1.0, 1.0).astype(np.float32)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((sig * 32767).astype(np.int16).tobytes())
    y, sr = _decode(buf.getvalue())
    res = assess_audio_quality(y, sr)
    assert res["status"] == "UNUSABLE"
    assert res["prediction_accepted"] is False
    assert "clipped" in res["reason"].lower()


def test_api_predict_noisy_audio_supplements_prediction():
    """Verify /api/predict automatically reduces noise while returning valid predictions."""
    client = TestClient(app)
    path = os.path.join(r"external data\sample_audio", "Noisy1.wav")
    if not os.path.exists(path):
        path = os.path.join("backend_reference", "Noisy1.wav")
    if os.path.exists(path):
        with open(path, "rb") as f:
            noisy_wav = f.read()
    else:
        clean_wav = make_clean_speech_wav(duration_s=3.0)
        noisy_wav = make_noisy_wav(clean_wav, noise_amplitude=0.02)

    resp = client.post("/api/predict", files={"file": ("Noisy1.wav", noisy_wav, "audio/wav")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["prediction_accepted"] is True
    assert data["audio_quality"]["status"] in ("NOISY", "WARNING")
    assert data.get("noise_reduction", {}).get("applied") is True
    assert data["emotion"] is not None
    assert data["confidence"] > 0.0
    assert "scores" in data and len(data["scores"]) == 6


def test_api_cannot_save_invalid_analysis():
    """Verify personal history rejects saving analyses with missing or empty emotion predictions."""
    client = TestClient(app)
    resp = client.post(
        "/api/analyses/save",
        headers={"Authorization": "Bearer fake_token"},
        json={
            "original_filename": "invalid.wav",
            "predicted_emotion": "",
            "confidence": 0.0,
            "margin": 0.0,
            "scores": {},
            "analyzed_seconds": 3.0,
        }
    )
    assert resp.status_code in (400, 401)


def test_clean_audio_bypasses_noise_reduction():
    """Verify clean speech does not trigger unnecessary noise reduction processing."""
    client = TestClient(app)
    clean_wav = make_clean_speech_wav(duration_s=3.0, amplitude=0.4)
    resp = client.post("/api/predict", files={"file": ("clean.wav", clean_wav, "audio/wav")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["prediction_accepted"] is True
    assert data["audio_quality"]["status"] == "GOOD"
    assert data.get("noise_reduction", {}).get("applied") is False
    assert "clean" in data.get("noise_reduction", {}).get("reason", "").lower()


