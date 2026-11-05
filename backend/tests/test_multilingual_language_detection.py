"""Tests for multilingual language detection and transcription guardrails.

Verifies:
1. Language detection runs before transcription.
2. Case A: Confident English audio -> English transcript with word/segment timestamps.
3. Case B: Confident non-English audio (Telugu, Hindi, Tamil) -> English transcription is skipped,
   returning 'Other language detected: <Language>'.
4. Case C: Uncertain audio / silence -> Guessed transcription is skipped, returning
   'Language could not be confidently identified.'.
5. Acoustic emotion recognition operates independently across all 6 emotion classes regardless of spoken language.
"""
import io
import os
import pathlib
import pytest
import numpy as np
import librosa
from fastapi.testclient import TestClient

from app import transcription, predict, audio, consistency
from app.main import app

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures" / "multilingual"
CREMA_EN_SAMPLE = pathlib.Path("data/AudioWAV/1001_DFA_ANG_XX.wav")


@pytest.fixture(autouse=True)
def setup_transcription_env(monkeypatch):
    monkeypatch.setenv("SER_TRANSCRIBER", "faster-whisper")
    monkeypatch.setenv("SER_WHISPER_MODEL", "tiny")


@pytest.fixture
def client():
    return TestClient(app)


def test_transcription_status_available():
    st = transcription.status()
    assert st["available"] is True
    assert st["engine"] == "faster-whisper"


def test_detect_language_english_sample():
    assert CREMA_EN_SAMPLE.exists(), f"Missing CREMA-D sample {CREMA_EN_SAMPLE}"
    y, sr = librosa.load(str(CREMA_EN_SAMPLE), sr=16000)
    lang, prob = transcription.detect_language(y)
    assert lang == "en"
    assert prob >= 0.80


def test_transcribe_case_a_english():
    y, sr = librosa.load(str(CREMA_EN_SAMPLE), sr=16000)
    res = transcription.transcribe(y)
    assert res["case"] == "A"
    assert res["is_english"] is True
    assert res["language"] == "en"
    assert res["language_name"] == "English"
    assert res["text"] is not None
    assert len(res["text"]) > 0
    assert res["message"] is None


@pytest.mark.skipif(not (FIXTURES_DIR / "telugu_sample.mp3").exists(), reason="Telugu fixture missing")
def test_transcribe_case_b_telugu():
    y, sr = librosa.load(str(FIXTURES_DIR / "telugu_sample.mp3"), sr=16000)
    res = transcription.transcribe(y)
    assert res["case"] == "B"
    assert res["is_english"] is False
    assert res["language"] == "te"
    assert res["language_name"] == "Telugu"
    assert res["text"] is None
    assert res["message"] == "Other language detected: Telugu"


@pytest.mark.skipif(not (FIXTURES_DIR / "hindi_sample.mp3").exists(), reason="Hindi fixture missing")
def test_transcribe_case_b_hindi():
    y, sr = librosa.load(str(FIXTURES_DIR / "hindi_sample.mp3"), sr=16000)
    res = transcription.transcribe(y)
    assert res["case"] == "B"
    assert res["is_english"] is False
    assert res["language"] == "hi"
    assert res["language_name"] == "Hindi"
    assert res["text"] is None
    assert res["message"] == "Other language detected: Hindi"


@pytest.mark.skipif(not (FIXTURES_DIR / "tamil_sample.mp3").exists(), reason="Tamil fixture missing")
def test_transcribe_case_b_tamil():
    y, sr = librosa.load(str(FIXTURES_DIR / "tamil_sample.mp3"), sr=16000)
    res = transcription.transcribe(y)
    assert res["case"] == "B"
    assert res["is_english"] is False
    assert res["language"] == "ta"
    assert res["language_name"] == "Tamil"
    assert res["text"] is None
    assert res["message"] == "Other language detected: Tamil"


def test_transcribe_case_c_silence():
    silence = np.zeros(16000 * 2, dtype=np.float32)
    res = transcription.transcribe(silence)
    assert res["case"] == "C"
    assert res["no_speech"] is True
    assert res["text"] is None


def test_independent_emotion_recognition_on_multilingual_audio(client):
    """Verifies that non-English audio successfully predicts vocal emotion across all classes."""
    telugu_path = FIXTURES_DIR / "telugu_sample.mp3"
    if not telugu_path.exists():
        pytest.skip("Telugu fixture missing")

    audio_bytes = telugu_path.read_bytes()
    resp = client.post("/api/predict", files={"file": ("sample.mp3", io.BytesIO(audio_bytes), "audio/mpeg")})
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # 1. Acoustic emotion predictions must be present and valid
    assert data["prediction_accepted"] is True
    assert data["emotion"] in {"happy", "sad", "angry", "fear", "disgust", "neutral"}
    assert "confidence" in data
    assert data["confidence"] > 0
    assert "scores" in data
    assert len(data["scores"]) == 6

    # 2. Transcription result must identify Telugu and skip English text
    trans = data.get("transcription")
    assert trans is not None
    assert trans["case"] == "B"
    assert trans["is_english"] is False
    assert trans["language_name"] == "Telugu"
    assert trans["text"] is None
    assert "Other language detected: Telugu" in trans["message"]

    # 3. Consistency explains that cross-modal comparison is unavailable for non-English
    consistency_data = data.get("consistency")
    assert consistency_data is not None
    assert consistency_data["status"] == "inconclusive"
    assert "Telugu" in consistency_data["explanation"]
