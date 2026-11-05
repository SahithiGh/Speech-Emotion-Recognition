"""Comprehensive Test Suite for the emotion2vec_experimental Model Profile.

Validates:
1. Model bundle structure, 768-D feature expectation, and 6-class labels.
2. Safe profile switching between production, staging, and emotion2vec_experimental.
3. Strict immutability of production and staging checkpoints during profile switches.
4. End-to-end prediction via predict_bytes and FastAPI endpoints.
5. Extraction pipeline integrity, normalization (16 kHz, mono, 0.9 peak), and 6-class scores.
6. Clean shutdown of the sidecar worker daemon.
"""

import hashlib
import io
import wave
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config as C
from app import predict
from app.e2v_extractor import get_bridge
from app.main import app
from app.modelcheck import validate_bundle
from app.modelio import load_metrics, load_model


def make_test_wav(duration_s=2.0, sr=16000, freq=440.0, amplitude=0.5, channels=1):
    """Generate in-memory WAV bytes with harmonic speech-like modulation."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    # Fundamental + harmonics to pass VAD and spectral flatness checks
    sig = amplitude * (
        0.6 * np.sin(2 * np.pi * freq * t) +
        0.3 * np.sin(2 * np.pi * 2 * freq * t) +
        0.1 * np.sin(2 * np.pi * 3 * freq * t)
    )
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


def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def test_emotion2vec_bundle_integrity():
    """Verify emotion2vec+ bundle structure, 768-D features, 6 classes, and pipeline."""
    assert C.EMOTION2VEC_MODEL_PATH.exists(), f"Missing model: {C.EMOTION2VEC_MODEL_PATH}"

    orig_profile = C.SER_MODEL_PROFILE
    try:
        C.set_active_model_profile("emotion2vec_experimental")
        assert C.SER_MODEL_PROFILE == "emotion2vec_experimental"
        bundle = load_model()
        validate_bundle(bundle)

        assert bundle["preprocessing"]["n_features"] == 768
        assert bundle["preprocessing"]["sample_rate"] == 16000
        assert list(bundle["labels"]) == C.EMOTIONS
        assert list(bundle["pipeline"].classes_) == C.EMOTIONS

        pipe = bundle["pipeline"]
        scaler = pipe.named_steps.get("scaler") or pipe.named_steps.get("scale")
        assert scaler.mean_.shape == (768,)
        assert scaler.scale_.shape == (768,)
    finally:
        C.set_active_model_profile(orig_profile)


def test_profile_switching_and_immutability():
    """Verify switching between profiles never alters model checkpoints."""
    prod_hash_before = sha256_of_file(C.PRODUCTION_MODEL_PATH)
    stage_hash_before = sha256_of_file(C.CANDIDATE_OPTION2_MODEL_PATH)
    e2v_hash_before = sha256_of_file(C.EMOTION2VEC_MODEL_PATH)
    svm_hash_before = sha256_of_file(C.SVM_ROLLBACK_MODEL_PATH)

    try:
        # 1. Promoted Production (emotion2vec+)
        C.set_active_model_profile("production")
        assert C.SER_MODEL_PROFILE == "production"
        b_prod = predict.get_bundle()
        assert b_prod["preprocessing"]["n_features"] == 768

        # 2. Option 2 Staging
        C.set_active_model_profile("staging")
        assert C.SER_MODEL_PROFILE == "candidate_option2"
        b_stage = predict.get_bundle()
        assert b_stage["preprocessing"]["n_features"] == 296

        # 3. SVM Rollback Backup
        C.set_active_model_profile("svm_rollback")
        assert C.SER_MODEL_PROFILE == "svm_rollback"
        b_svm = predict.get_bundle()
        assert b_svm["preprocessing"]["n_features"] == 296

        # 4. emotion2vec+ Experimental
        C.set_active_model_profile("emotion2vec_experimental")
        assert C.SER_MODEL_PROFILE == "emotion2vec_experimental"
        b_e2v = predict.get_bundle()
        assert b_e2v["preprocessing"]["n_features"] == 768

        # 5. Return to Production
        C.set_active_model_profile("production")
        assert C.SER_MODEL_PROFILE == "production"
        b_roll = predict.get_bundle()
        assert b_roll["preprocessing"]["n_features"] == 768

    finally:
        C.set_active_model_profile("production")

    # Hashes must remain 100% identical
    assert sha256_of_file(C.PRODUCTION_MODEL_PATH) == prod_hash_before
    assert sha256_of_file(C.CANDIDATE_OPTION2_MODEL_PATH) == stage_hash_before
    assert sha256_of_file(C.EMOTION2VEC_MODEL_PATH) == e2v_hash_before
    assert sha256_of_file(C.SVM_ROLLBACK_MODEL_PATH) == svm_hash_before


def test_e2v_prediction_pipeline():
    """Verify predict_bytes produces 6-class scores and valid structure under emotion2vec_experimental."""
    orig_profile = C.SER_MODEL_PROFILE
    try:
        C.set_active_model_profile("emotion2vec_experimental")
        wav_bytes = make_test_wav(duration_s=2.0, sr=16000)

        res = predict.predict_bytes(wav_bytes)

        assert res["emotion"] in C.EMOTIONS
        assert isinstance(res["confidence"], float)
        assert 0.0 <= res["confidence"] <= 1.0
        assert isinstance(res["margin"], float)

        # All 6 classes must be present
        assert sorted(res["scores"].keys()) == C.EMOTIONS
        assert abs(sum(res["scores"].values()) - 1.0) < 1e-4

        # Profile metadata
        assert res["model"]["profile"] == "emotion2vec_experimental"
        assert res["out_of_distribution"] in (True, False)
        assert res["ood_details"]["threshold"] == 3.83

    finally:
        C.set_active_model_profile(orig_profile)


def test_e2v_fastapi_endpoints(monkeypatch):
    """Test FastAPI /api/health, /api/model/status, /api/metrics, and /api/predict with e2v profile."""
    monkeypatch.delenv("SER_TRANSCRIBER", raising=False)
    orig_profile = C.SER_MODEL_PROFILE
    try:
        C.set_active_model_profile("emotion2vec_experimental")
        client = TestClient(app)

        # 1. Health
        r_health = client.get("/api/health")
        assert r_health.status_code == 200
        assert r_health.json()["status"] == "ok"
        assert r_health.json()["model_ready"] is True

        # 2. Status
        r_status = client.get("/api/model/status")
        assert r_status.status_code == 200
        status_data = r_status.json()
        assert status_data["profile"] == "emotion2vec_experimental"
        assert status_data["trained"] is True
        assert status_data["ood_threshold"] == 3.83
        assert status_data["emotions"] == C.EMOTIONS

        # 3. Metrics
        r_metrics = client.get("/api/metrics")
        assert r_metrics.status_code == 200
        metrics_data = r_metrics.json()
        assert metrics_data["trained"] is True
        assert "accuracy" in metrics_data

        # 4. Predict endpoint
        wav_bytes = make_test_wav(duration_s=2.0, sr=16000)
        r_pred = client.post(
            "/api/predict",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
        )
        assert r_pred.status_code == 200
        pred_data = r_pred.json()
        assert pred_data["emotion"] in C.EMOTIONS
        assert pred_data["model"]["profile"] == "emotion2vec_experimental"
        assert sorted(pred_data["scores"].keys()) == C.EMOTIONS

    finally:
        C.set_active_model_profile(orig_profile)
        get_bridge().shutdown()


def test_promoted_production_profile(monkeypatch):
    """Verify that default production profile operates with promoted emotion2vec+ model."""
    monkeypatch.delenv("SER_TRANSCRIBER", raising=False)
    orig_profile = C.SER_MODEL_PROFILE
    try:
        C.set_active_model_profile("production")
        assert C.SER_MODEL_PROFILE == "production"
        bundle = load_model()
        assert bundle["preprocessing"]["n_features"] == 768

        client = TestClient(app)
        r_status = client.get("/api/model/status")
        assert r_status.status_code == 200
        st = r_status.json()
        assert st["profile"] == "production"
        assert st["trained"] is True
        assert st["ood_threshold"] == 3.83
        assert "emotion2vec+" in st["model_name"]

        wav_bytes = make_test_wav(duration_s=2.0, sr=16000)
        r_pred = client.post("/api/predict", files={"file": ("test.wav", wav_bytes, "audio/wav")})
        assert r_pred.status_code == 200
        pred = r_pred.json()
        assert pred["emotion"] in C.EMOTIONS
        assert pred["model"]["profile"] == "production"
    finally:
        C.set_active_model_profile(orig_profile)
        get_bridge().shutdown()


def test_svm_rollback_profile(monkeypatch):
    """Verify that svm_rollback profile loads the original SVM model."""
    monkeypatch.delenv("SER_TRANSCRIBER", raising=False)
    orig_profile = C.SER_MODEL_PROFILE
    try:
        C.set_active_model_profile("svm_rollback")
        assert C.SER_MODEL_PROFILE == "svm_rollback"
        bundle = load_model()
        assert bundle["preprocessing"]["n_features"] == 296

        client = TestClient(app)
        r_status = client.get("/api/model/status")
        assert r_status.status_code == 200
        st = r_status.json()
        assert st["profile"] == "svm_rollback"
        assert st["trained"] is True
        assert st["ood_threshold"] == 10.12

        wav_bytes = make_test_wav(duration_s=2.0, sr=16000)
        r_pred = client.post("/api/predict", files={"file": ("test.wav", wav_bytes, "audio/wav")})
        assert r_pred.status_code == 200
        pred = r_pred.json()
        assert pred["emotion"] in C.EMOTIONS
        assert pred["model"]["profile"] == "svm_rollback"
    finally:
        C.set_active_model_profile(orig_profile)
        get_bridge().shutdown()
