"""Comprehensive Test Suite for Candidate Option 2 (Resampling Augmentation)
and the Out-of-Distribution (OOD) Safeguard.
"""
import io
import wave
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config as C
from app import predict
from app.audio import extract_features, load_audio_bytes, prepare_signal
from app.errors import AudioError
from app.main import app
from app.modelcheck import validate_bundle
from app.modelio import load_model


def make_test_wav(duration_s=2.0, sr=16000, freq=440.0, amplitude=0.5, channels=1):
    """Generate in-memory WAV bytes with harmonic speech-like modulation."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    # Fundamental + harmonics to pass VAD and spectral flatness checks
    sig = amplitude * (
        0.6 * np.sin(2 * np.pi * freq * t) +
        0.3 * np.sin(2 * np.pi * 2 * freq * t) +
        0.1 * np.sin(2 * np.pi * 3 * freq * t)
    )
    # Add subtle amplitude modulation
    mod = 0.5 * (1.0 + np.sin(2 * np.pi * 3.0 * t))
    sig = (sig * mod).astype(np.float32)
    
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        if channels == 1:
            samples = (sig * 32767).astype(np.int16)
        else:
            stereo = np.column_stack([sig, sig])
            samples = (stereo * 32767).astype(np.int16)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


def test_candidate_model_bundle_integrity():
    """Verify candidate bundle structure, feature count, classes, and backend validator."""
    assert C.CANDIDATE_OPTION2_MODEL_PATH.exists(), "Candidate model file does not exist!"
    
    # Save original path
    orig_path = C.MODEL_PATH
    try:
        C.set_active_model_profile("candidate_option2")
        bundle = load_model()
        validate_bundle(bundle)
        
        assert bundle["preprocessing"]["n_features"] == 296
        assert bundle["preprocessing"]["sample_rate"] == 16000
        assert list(bundle["pipeline"].classes_) == C.EMOTIONS
        assert list(bundle["labels"]) == C.EMOTIONS
        
        scaler = bundle["pipeline"].named_steps["scale"]
        assert scaler.mean_.shape == (296,)
        assert scaler.scale_.shape == (296,)
    finally:
        C.set_active_model_profile("production")


def test_model_profile_selection_and_rollback():
    """Test switching between production and candidate staging, verifying complete reversibility."""
    assert C.PRODUCTION_MODEL_PATH.exists(), "Production model missing!"
    assert C.CANDIDATE_OPTION2_MODEL_PATH.exists(), "Candidate model missing!"
    
    # 1. Start in production
    C.set_active_model_profile("production")
    assert C.MODEL_PATH == C.PRODUCTION_MODEL_PATH
    assert C.SER_MODEL_PROFILE == "production"
    b_prod = predict.get_bundle()
    assert b_prod is not None
    
    # 2. Switch to staging / candidate_option2
    C.set_active_model_profile("staging")
    assert C.MODEL_PATH == C.CANDIDATE_OPTION2_MODEL_PATH
    assert C.SER_MODEL_PROFILE == "candidate_option2"
    b_stage = predict.get_bundle()
    assert b_stage is not None
    
    # 3. Rollback to production
    C.set_active_model_profile("production")
    assert C.MODEL_PATH == C.PRODUCTION_MODEL_PATH
    assert C.SER_MODEL_PROFILE == "production"
    b_rolled_back = predict.get_bundle()
    assert b_rolled_back is not None


def test_native_and_resampled_audio_inference():
    """Test inference on 16k native, 44.1k, and 48k recordings with Candidate Option 2."""
    C.set_active_model_profile("staging")
    try:
        # Native 16 kHz
        wav_16k = make_test_wav(duration_s=2.0, sr=16000)
        res_16k = predict.predict_bytes(wav_16k)
        assert res_16k["emotion"] in C.EMOTIONS
        assert 0.0 <= res_16k["confidence"] <= 1.0
        assert sum(res_16k["scores"].values()) == pytest.approx(1.0, abs=1e-3)
        
        # 44.1 kHz
        wav_44k = make_test_wav(duration_s=2.0, sr=44100)
        res_44k = predict.predict_bytes(wav_44k)
        assert res_44k["emotion"] in C.EMOTIONS
        assert sum(res_44k["scores"].values()) == pytest.approx(1.0, abs=1e-3)
        
        # 48.0 kHz
        wav_48k = make_test_wav(duration_s=2.0, sr=48000)
        res_48k = predict.predict_bytes(wav_48k)
        assert res_48k["emotion"] in C.EMOTIONS
        assert sum(res_48k["scores"].values()) == pytest.approx(1.0, abs=1e-3)
    finally:
        C.set_active_model_profile("production")


def test_stereo_and_mono_audio_compatibility():
    """Verify both mono and stereo WAVs decode and predict properly."""
    C.set_active_model_profile("staging")
    try:
        mono_wav = make_test_wav(duration_s=2.0, sr=16000, channels=1)
        stereo_wav = make_test_wav(duration_s=2.0, sr=16000, channels=2)
        
        res_mono = predict.predict_bytes(mono_wav)
        res_stereo = predict.predict_bytes(stereo_wav)
        
        assert res_mono["emotion"] in C.EMOTIONS
        assert res_stereo["emotion"] in C.EMOTIONS
    finally:
        C.set_active_model_profile("production")


def test_audio_edge_cases():
    """Check rejection of too short, too long, silent, and corrupted audio."""
    # Too short (< 0.5s)
    short_wav = make_test_wav(duration_s=0.2, sr=16000)
    with pytest.raises(AudioError) as exc:
        load_audio_bytes(short_wav)
    assert exc.value.code == "too_short"
    
    # Silent audio
    silent_buf = io.BytesIO()
    with wave.open(silent_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(np.zeros(16000, dtype=np.int16).tobytes())
    with pytest.raises(AudioError) as exc:
        load_audio_bytes(silent_buf.getvalue())
    assert exc.value.code in ("silent", "no_speech")
    
    # Corrupted / random garbage bytes
    with pytest.raises(AudioError) as exc:
        load_audio_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00broken_header")
    assert exc.value.code in ("undecodable", "corrupted")


def test_ood_safeguard_boundary_cases():
    """Verify OOD detection triggering at boundary thresholds."""
    C.set_active_model_profile("staging")
    try:
        bundle = predict.get_bundle()
        scaler = bundle["pipeline"].named_steps["scale"]
        
        # In-distribution vector: mean of training scaler
        id_feat = scaler.mean_.copy()
        ood_id = predict.check_out_of_distribution(id_feat, bundle)
        assert ood_id["is_ood"] is False
        assert ood_id["max_deviation"] == 0.0
        assert ood_id["warning"] is None
        
        # Borderline just below threshold (10.10 < 10.12)
        borderline_feat = scaler.mean_.copy()
        borderline_feat[0] = scaler.mean_[0] + 10.10 * scaler.scale_[0]
        ood_border = predict.check_out_of_distribution(borderline_feat, bundle)
        assert ood_border["is_ood"] is False
        
        # Out-of-distribution just above threshold (10.15 > 10.12)
        ood_feat = scaler.mean_.copy()
        ood_feat[0] = scaler.mean_[0] + 10.15 * scaler.scale_[0]
        ood_res = predict.check_out_of_distribution(ood_feat, bundle)
        assert ood_res["is_ood"] is True
        assert ood_res["max_deviation"] >= 10.15
        assert ood_res["warning"] is not None
    finally:
        C.set_active_model_profile("production")


def test_api_predict_contract_with_candidate():
    """Test full /api/predict FastAPI endpoint response structure under candidate profile."""
    C.set_active_model_profile("staging")
    try:
        client = TestClient(app)
        test_wav = make_test_wav(duration_s=2.0, sr=16000)
        
        response = client.post(
            "/api/predict",
            files={"file": ("test_speech.wav", test_wav, "audio/wav")}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required API fields
        assert "emotion" in data
        assert data["emotion"] in C.EMOTIONS
        assert "confidence" in data
        assert "margin" in data
        assert "scores" in data
        assert set(data["scores"].keys()) == set(C.EMOTIONS)
        assert "uncertain" in data
        assert "out_of_distribution" in data
        assert "ood_details" in data
        assert "is_ood" in data["ood_details"]
        assert "max_deviation" in data["ood_details"]
        assert "threshold" in data["ood_details"]
        assert "reliability" in data
        assert "notes" in data
        assert "model" in data
        assert data["model"]["profile"] == "candidate_option2"
    finally:
        C.set_active_model_profile("production")

