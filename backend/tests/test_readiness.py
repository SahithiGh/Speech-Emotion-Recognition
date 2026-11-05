"""Health, limits, model readiness, model information, uncertainty rule, timeouts and temporary-file cleanup.
These are infrastructure tests; model files here come from temporary generated tones or are deliberately broken."""
import os
import time

import joblib
import pytest
from fastapi.testclient import TestClient

from app import config as C
from app import predict as P
from app.audio import load_audio_bytes
from app.errors import AudioError
from conftest import make_tone_dataset, tone, wav_bytes
from test_api_and_training import run_train


@pytest.fixture
def client(home):
    P._cache.update(mtime=None, bundle=None, id=None, error=None)
    from app.main import app
    return TestClient(app)


def test_health_separates_app_from_model_readiness(client):
    assert client.get("/api/health").json() == {"status": "ok", "model_ready": False}
    info = client.get("/api/model/info").json()
    assert info["status"] == "missing" and info["evaluation_status"] == "pending" and "model_id" not in info
    assert info["languages"] == [{"code": "en", "name": "English", "dataset": "CREMA-D", "status": "supported"}]
    assert "ODbL" in info["dataset"]["license"] or "Open Database" in info["dataset"]["license"]


def test_config_endpoint_matches_backend_limits(client, monkeypatch):
    monkeypatch.setattr(C, "MAX_UPLOAD_BYTES", 5 * 1024 * 1024)
    monkeypatch.setattr(C, "MAX_INPUT_SECONDS", 20.0)
    c = client.get("/api/config").json()
    assert c["max_upload_mb"] == 5 and c["max_audio_seconds"] == 20 and c["max_record_seconds"] == C.MAX_RECORD_SECONDS
    with pytest.raises(AudioError) as e:
        load_audio_bytes(wav_bytes(tone(seconds=25)))
    assert e.value.code == "too_long"


def test_broken_and_incompatible_models_are_not_reported_as_trained(client, home):
    C.MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    C.MODEL_PATH.write_bytes(b"not a model")
    st = client.get("/api/model/status").json()
    assert st["trained"] is False and st["state"] == "incompatible"
    assert client.get("/api/health").json()["model_ready"] is False
    r = client.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone()), "audio/wav")})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "model_incompatible"
    assert client.get("/api/metrics").json()["trained"] is False


def test_trained_model_info_reliability_and_wrong_classes(home, monkeypatch, client):
    make_tone_dataset(C.DATA_DIR, speakers=20, reps=2)
    assert run_train(monkeypatch, C.DATA_DIR, "--folds", "3", "--no-compare") == 0
    P._cache.update(mtime=None, bundle=None, id=None, error=None)
    assert client.get("/api/health").json() == {"status": "ok", "model_ready": True}
    info = client.get("/api/model/info").json()
    assert info["status"] == "ready" and info["evaluation_status"] == "evaluated" and info["model_id"] and info["sample_rate"] == 16000
    assert "StandardScaler" in info["architecture"] and "documented" in info["uncertainty"]
    # a model whose classes differ from the six supported ones is rejected, even though the file loads
    b = joblib.load(C.MODEL_PATH); b["labels"] = ["a", "b"]; joblib.dump(b, C.MODEL_PATH)
    os.utime(C.MODEL_PATH, (time.time() + 5, time.time() + 5))
    assert client.get("/api/model/status").json()["state"] == "incompatible"


def test_uncertainty_comes_only_from_validation_evidence():
    bundle = {"reliability": {"bins": [{"low": 0.0, "high": 0.4, "samples": 100, "accuracy": 0.30},
                                       {"low": 0.4, "high": 0.8, "samples": 5, "accuracy": 0.10},
                                       {"low": 0.8, "high": 1.000001, "samples": 200, "accuracy": 0.90}]}}
    assert P.reliability_for(bundle, 0.2)["uncertain"] is True              # enough evidence that this range is usually wrong
    assert P.reliability_for(bundle, 0.5)["uncertain"] is None              # too few validation samples: no claim either way
    assert P.reliability_for(bundle, 0.9)["uncertain"] is False
    assert P.reliability_for({}, 0.9) == {"available": False, "validated_accuracy": None, "samples": 0, "score_range": None, "uncertain": None}


def test_slow_analysis_returns_timeout(client, monkeypatch):
    monkeypatch.setattr(C, "PREDICT_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(P, "predict_bytes", lambda data: time.sleep(1.0))   # mocked: tests the timeout handling only
    r = client.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone()), "audio/wav")})
    assert r.status_code == 504 and r.json()["detail"]["code"] == "timeout"


def test_temporary_files_are_removed_after_failure(tmp_path, monkeypatch):
    import tempfile
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    for blob in (b"garbage" * 200, b"\x00" * 3000):
        with pytest.raises(AudioError):
            load_audio_bytes(blob)
    assert list(tmp_path.iterdir()) == []


def test_uploads_never_reach_the_log(client, caplog, home):
    import logging
    marker = b"SECRET-AUDIO-MARKER"
    with caplog.at_level(logging.INFO, logger="ser"):
        client.post("/api/predict", files={"file": ("private_name.wav", marker * 50, "audio/wav")})
    assert "SECRET-AUDIO-MARKER" not in caplog.text and "private_name" not in caplog.text and "/api/predict" in caplog.text


def test_feature_groups_partition_all_features():
    from app.audio import FEATURE_GROUPS, N_FEATURES
    idx = sorted(i for _, _, cols in FEATURE_GROUPS.values() for i in cols)
    assert idx == list(range(N_FEATURES))      # every feature belongs to exactly one explained group


def test_startup_configuration_validation(monkeypatch):
    assert C.validate_config() == []
    monkeypatch.setattr(C, "MAX_CONCURRENT_ANALYSES", 0)
    monkeypatch.setattr(C, "MAX_UPLOAD_BYTES", 0)
    assert len(C.validate_config()) == 2


def test_optional_rate_limit_and_processing_time(client, monkeypatch):
    monkeypatch.setattr(C, "RATE_LIMIT_PER_MINUTE", 2)
    import app.main as M
    M._hits.clear()
    codes = [client.post("/api/spectrogram", files={"file": ("a.wav", wav_bytes(tone(seconds=1)), "audio/wav")}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert client.get("/api/health").status_code == 200      # light endpoints are never limited
    M._hits.clear()


def test_unexpected_errors_never_leak_internals(client, monkeypatch):
    monkeypatch.setattr(P, "predict_bytes", lambda data: (_ for _ in ()).throw(RuntimeError("secret /home/user/key.txt stack detail")))
    r = client.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone()), "audio/wav")})
    assert r.status_code == 500 and r.json()["detail"] == {"code": "server_error", "message": "Unexpected error while analyzing the audio."}
    assert "secret" not in r.text and "/home" not in r.text and "Traceback" not in r.text
    import app.main as M
    assert M.app.debug is False
