import sys

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config as C
from conftest import make_tone_dataset, tone, wav_bytes


@pytest.fixture
def client(home):
    from app.main import app
    return TestClient(app)


def test_api_without_model(client):
    assert client.get("/api/health").json() == {"status": "ok", "model_ready": False}
    assert client.get("/api/model/status").json()["trained"] is False
    assert client.get("/api/metrics").json() == {"trained": False, "message": "Model not trained yet"}
    r = client.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone()), "audio/wav")})
    assert r.status_code == 503 and "not trained" in r.json()["detail"]["message"].lower()


def test_api_input_errors(client, monkeypatch):
    assert client.post("/api/predict").status_code == 422                                  # no file field
    monkeypatch.setattr(C, "MAX_UPLOAD_BYTES", 1000)
    r = client.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone(seconds=2)), "audio/wav")})
    assert r.status_code == 413 and r.json()["detail"]["code"] == "too_large"


def run_train(monkeypatch, data, *extra):
    import train
    monkeypatch.setattr(sys, "argv", ["train.py", "--data-dir", str(data), "--jobs", "2", "--skip-manifest-check", *extra])
    return train.main()


def test_train_refuses_partial_lfs_dataset(home, monkeypatch, capsys):
    data = C.DATA_DIR
    make_tone_dataset(data, speakers=12, reps=1)
    (data / "1001_I0A_ANG_XX.wav").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n")
    assert run_train(monkeypatch, data) == 1
    assert "incomplete or damaged" in capsys.readouterr().out
    assert not C.MODEL_PATH.exists() and not C.METRICS_PATH.exists()      # nothing is claimed as trained


def test_full_round_trip_train_evaluate_predict_api(home, monkeypatch, capsys):
    data = C.DATA_DIR
    make_tone_dataset(data, speakers=20, reps=2)
    assert run_train(monkeypatch, data, "--folds", "3") == 0
    assert C.MODEL_PATH.exists() and C.METRICS_PATH.exists() and C.SPLIT_PATH.exists()
    import json
    m = json.loads(C.METRICS_PATH.read_text())
    assert m["trained"] and m["dataset_verification"]["mode"] == "none"            # unverified data is labelled as such
    split = json.loads(C.SPLIT_PATH.read_text())
    assert set(split["test"]).isdisjoint(split["development"])
    assert sum(m["class_distribution"]["all"].values()) == m["total_clips_used"] == 240
    assert sum(m["class_distribution"]["test"].values()) == m["n_samples"] == m["split"]["test"]["clips"]
    assert len(m["confusion_matrix"]) == 6 and len(m["candidates"]) == 8
    assert m["reproducibility"]["seed"] == C.RANDOM_SEED and m["reproducibility"]["n_features"] == 296
    # second run: features come from the cache and results are identical (reproducible)
    assert run_train(monkeypatch, data, "--folds", "3", "--no-compare") == 0
    assert "found in feature cache" in capsys.readouterr().out      # no feature was extracted twice
    m2 = json.loads(C.METRICS_PATH.read_text())
    assert (m2["accuracy"], m2["confusion_matrix"], m2["model_name"]) == (m["accuracy"], m["confusion_matrix"], m["model_name"])
    cmp_ = m["comparison"]
    assert len(cmp_) == 8 and sum(c["selected"] for c in cmp_) == 1 and all(len(c["confusion_matrix"]) == 6 and set(c["per_class_recall"]) == set(C.EMOTIONS) for c in cmp_)
    chosen = next(c for c in cmp_ if c["selected"])
    assert chosen["model"] == m["model_name"] and chosen["macro_f1"] == pytest.approx(m["macro_f1"]) and chosen["uar"] == pytest.approx(m["unweighted_average_recall"])
    assert "not used for selection" in m["comparison_note"]
    # evaluate.py reproduces the saved test numbers
    import evaluate
    assert evaluate.main() == 0
    assert json.loads(C.METRICS_PATH.read_text())["confusion_matrix"] == m["confusion_matrix"]
    # API
    from app.main import app
    c = TestClient(app)
    assert c.get("/api/model/status").json()["trained"] is True
    r = c.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone(190, seconds=2)), "audio/wav")})
    j = r.json()
    assert r.status_code == 200 and j["emotion"] in C.EMOTIONS and set(j["scores"]) == set(C.EMOTIONS)
    assert abs(sum(j["scores"].values()) - 1) < 1e-4 and "notes" in j and j["margin"] >= 0
    assert isinstance(j["processing_ms"], int) and j["processing_ms"] >= 0
    fi = m["feature_importance"]
    assert len(fi["groups"]) == 9 and "individual prediction" in fi["caveat"] and all(g["n_features"] > 0 for g in fi["groups"])
    assert "low_confidence" not in j and set(j["reliability"]) >= {"available", "validated_accuracy", "samples", "uncertain"}   # no invented threshold
    assert j["model"]["id"] and j["model"]["dataset"] == "CREMA-D" and "not calibrated" in j["score_type"]
    rel = m["reliability"]
    assert sum(b["samples"] for b in rel["bins"]) == m["split"]["development"]["clips"]    # every development clip counted once, out of fold
    assert m["unweighted_average_recall"] == m["macro_recall"] and m["preprocessing"]["n_features"] == 296
    r = c.post("/api/predict", files={"file": ("a.wav", wav_bytes(np.zeros(16000)), "audio/wav")})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "silent"
    # a model made with another feature version must be rejected, not silently used
    bundle = joblib.load(C.MODEL_PATH)
    bundle["preprocessing"]["feature_version"] = 1
    joblib.dump(bundle, C.MODEL_PATH)
    import app.predict as P
    P._cache.update(mtime=None, bundle=None)
    assert c.post("/api/predict", files={"file": ("a.wav", wav_bytes(tone()), "audio/wav")}).status_code == 503
