"""Spectrogram, emotion timeline and optional transcription. Models here come from temporary generated tones (software tests);
the transcription engine is mocked, so those tests prove the API plumbing only and say nothing about real transcription quality."""
import base64

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config as C
from app import predict as P
from app import timeline as TL
from app import transcription as TR
from app.audio import extract_features
from conftest import make_tone_dataset, redirect_home, tone, wav_bytes
from test_api_and_training import run_train


def post(client, path, audio, **data):
    return client.post(path, files={"file": ("a.wav", audio, "audio/wav")}, data=data)


def sine(freq, seconds, amp=0.5, sr=16000):
    return (amp * np.sin(2 * np.pi * freq * np.arange(int(seconds * sr)) / sr)).astype(np.float32)


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    home = tmp_path_factory.mktemp("trained")
    redirect_home(mp, home)
    make_tone_dataset(C.DATA_DIR, speakers=20, reps=2)
    assert run_train(mp, C.DATA_DIR, "--folds", "3", "--no-compare") == 0
    P._cache.update(mtime=None, bundle=None, id=None, error=None)
    yield home
    mp.undo()
    P._cache.update(mtime=None, bundle=None, id=None, error=None)


@pytest.fixture
def client(home):
    P._cache.update(mtime=None, bundle=None, id=None, error=None)
    from app.main import app
    return TestClient(app)


@pytest.fixture
def tclient(trained):
    from app.main import app
    return TestClient(app)


# ---------- spectrogram ----------
def decode_spec(j):
    q = np.frombuffer(base64.b64decode(j["data"]), dtype=np.uint8).reshape(j["n_mels"], j["frames"])
    return q


def test_spectrogram_reflects_the_actual_audio_in_frequency_and_time(client):
    audio = np.concatenate([np.zeros(16000), sine(1000, 1.0), np.zeros(16000)])    # silence, 1 kHz tone from 1.0 s to 2.0 s, silence
    r = post(client, "/api/spectrogram", wav_bytes(audio))
    assert r.status_code == 200, r.text            # works with no trained model
    j = r.json(); q = decode_spec(j)
    assert j["duration"] == pytest.approx(3.0, abs=0.01) and q.shape == (C.SPECTROGRAM_MELS, j["frames"])
    freqs = np.array(j["mel_frequencies_hz"])
    row = int(q.mean(axis=1).argmax())
    assert 850 <= freqs[row] <= 1200                                   # energy sits at the 1 kHz band
    times = j["first_frame_center_seconds"] + np.arange(j["frames"]) * j["frame_seconds"]
    loud = times[q[row] > 0.8 * 255]
    assert loud.min() >= 0.85 and loud.max() <= 2.15                    # and between 1 s and 2 s of the original clip
    assert q[:, times < 0.5].max() < q.max() * 0.5 and 0 <= q.min() and q.max() == 255


def test_spectrogram_other_sample_rates_and_errors(client, monkeypatch):
    import io
    import soundfile as sf
    buf = io.BytesIO(); sf.write(buf, sine(2000, 2.0, sr=44100), 44100, format="WAV")
    j = post(client, "/api/spectrogram", buf.getvalue()).json()
    assert j["duration"] == pytest.approx(2.0, abs=0.01) and j["sample_rate"] == 16000
    assert post(client, "/api/spectrogram", wav_bytes(np.zeros(32000))).status_code == 200            # silence is shown as silence
    assert post(client, "/api/spectrogram", wav_bytes(tone(seconds=0.1))).json()["detail"]["code"] == "too_short"
    assert post(client, "/api/spectrogram", b"garbage" * 300).json()["detail"]["code"] == "undecodable"
    assert post(client, "/api/spectrogram", b"").status_code == 422
    monkeypatch.setattr(C, "MAX_INPUT_SECONDS", 3.0)
    assert post(client, "/api/spectrogram", wav_bytes(tone(seconds=5))).json()["detail"]["code"] == "too_long"
    monkeypatch.setattr(C, "MAX_UPLOAD_BYTES", 1000)
    assert post(client, "/api/spectrogram", wav_bytes(tone(seconds=2))).status_code == 413


def test_spectrogram_long_clip_stays_small(client):
    j = post(client, "/api/spectrogram", wav_bytes(tone(seconds=50))).json()
    assert j["frames"] <= C.SPECTROGRAM_MAX_FRAMES + 2 and len(j["data"]) < 60000


# ---------- timeline ----------
def test_plan_segments_cover_the_audio_with_exact_timestamps():
    assert TL.plan_segments(5.0, 2.0, 1.0) == [(0.0, 2.0), (1.0, 3.0), (2.0, 4.0), (3.0, 5.0)]
    assert TL.plan_segments(1.2, 2.0, 1.0) == [(0.0, 1.2)]
    assert TL.plan_segments(3.2, 2.0, 1.0)[-1] == (2.0, 3.2)


def test_timeline_uses_the_real_model_and_original_timestamps(tclient):
    audio = np.concatenate([sine(180, 2.0), np.zeros(32000), sine(300, 1.0)])      # tone 0-2 s, silence 2-4 s, tone 4-5 s
    r = post(tclient, "/api/timeline", wav_bytes(audio), window_s="2.0", hop_s="1.0")
    assert r.status_code == 200, r.text
    j = r.json()
    segs = j["segments"]
    assert [(s["start"], s["end"]) for s in segs] == [(0.0, 2.0), (1.0, 3.0), (2.0, 4.0), (3.0, 5.0)]
    assert segs[2]["status"] == "silent" and segs[2]["scores"] is None            # silent window is not classified
    assert segs[0]["status"] == "ok" and abs(sum(segs[0]["scores"].values()) - 1) < 1e-4
    assert j["counts"]["silent"] >= 1 and "not evaluated on short windows" in j["caution"] and j["model"]["dataset"] == "CREMA-D"
    # independent check: run the model ourselves on the same slice of the original audio
    pipe = P.get_bundle()["pipeline"]
    for s in segs:
        if s["status"] != "ok":
            continue
        piece = audio[int(round(s["start"] * 16000)):int(round(s["end"] * 16000))]
        feats = extract_features((piece / np.max(np.abs(piece)) * 0.9).astype(np.float32))
        expect = pipe.predict_proba(feats.reshape(1, -1))[0]
        assert np.allclose([s["scores"][c] for c in pipe.classes_], expect, atol=1e-6)
        assert s["emotion"] == pipe.classes_[int(expect.argmax())]


def test_timeline_handles_failures_short_windows_and_bad_settings(tclient, monkeypatch):
    y = tone(seconds=6)
    calls = {"n": 0}
    real = TL.extract_features

    def flaky(seg):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real(seg)
    monkeypatch.setattr(TL, "extract_features", flaky)
    j = post(tclient, "/api/timeline", wav_bytes(y)).json()
    assert [s["status"] for s in j["segments"]].count("failed") == 1 and j["counts"]["ok"] >= 2
    monkeypatch.setattr(TL, "extract_features", real)
    # a window shorter than the minimum is reported as too short, never classified
    out = TL.analyse_timeline(np.ones(4000, dtype=np.float32) * 0.3, P.get_bundle()["pipeline"], 2.0, 1.0)
    assert out["segments"][0]["status"] == "too_short"
    # invalid settings and too many segments
    assert post(tclient, "/api/timeline", wav_bytes(y), window_s="9", hop_s="1").json()["detail"]["code"] == "bad_parameters"
    assert post(tclient, "/api/timeline", wav_bytes(y), window_s="2", hop_s="3").json()["detail"]["code"] == "bad_parameters"
    monkeypatch.setattr(C, "TIMELINE_MAX_SEGMENTS", 60)
    r = post(tclient, "/api/timeline", wav_bytes(tone(seconds=40)), window_s="2", hop_s="0.5")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "too_many_segments"
    assert post(tclient, "/api/timeline", b"garbage" * 300).status_code == 422
    assert post(tclient, "/api/timeline", wav_bytes(np.zeros(32000))).json()["counts"]["silent"] >= 1


def test_timeline_unavailable_without_model(client):
    r = post(client, "/api/timeline", wav_bytes(tone(seconds=3)))
    assert r.status_code == 503 and r.json()["detail"]["code"] == "model_missing"


# ---------- transcription (optional, separate from emotion) ----------
def test_transcription_is_reported_unavailable_when_not_configured(client, monkeypatch):
    monkeypatch.delenv("SER_TRANSCRIBER", raising=False)
    st = client.get("/api/transcription/status").json()
    assert st["available"] is False and st["engine"] is None and "No transcription engine" in st["reason"] and st["evaluated"] is False
    r = post(client, "/api/transcribe", wav_bytes(tone()))
    assert r.status_code == 503 and r.json()["detail"]["code"] == "transcription_unavailable"     # no text is ever invented
    monkeypatch.setenv("SER_TRANSCRIBER", "nonsense")
    assert "Unknown engine" in client.get("/api/transcription/status").json()["reason"]
    monkeypatch.setenv("SER_TRANSCRIBER", "faster-whisper")
    import importlib.util
    if importlib.util.find_spec("faster_whisper") is not None:
        st = client.get("/api/transcription/status").json()
        assert st["available"] is True and st["engine"] == "faster-whisper"
        # Test simulated uninstalled state
        monkeypatch.setattr(importlib.util, "find_spec", lambda mod: None if mod == "faster_whisper" else True)
        st_uninstalled = client.get("/api/transcription/status").json()
        assert st_uninstalled["available"] is False and ("not installed" in st_uninstalled["reason"])
    else:
        st = client.get("/api/transcription/status").json()
        assert st["available"] is False and ("not installed" in st["reason"])


def test_transcription_plumbing_with_a_mocked_engine(client, monkeypatch):
    """MOCKED engine: verifies request handling, error mapping and no-speech handling only."""
    monkeypatch.setattr(TR, "status", lambda: {"engine": "mock", "label": "mock engine", "available": True, "reason": None})
    class Seg:
        def __init__(self, s, e, t): self.start, self.end, self.text = s, e, t
    class FakeModel:
        def __init__(self, segs): self.segs = segs
        def transcribe(self, y, **kw): return iter(self.segs), None
    monkeypatch.setattr(TR, "_load", lambda name: FakeModel([Seg(0.0, 1.0, " hello"), Seg(1.0, 2.0, "world ")]))
    j = post(client, "/api/transcribe", wav_bytes(tone(seconds=2))).json()
    assert j["text"] == "hello world" and j["no_speech"] is False and j["engine"] == "mock engine" and "not been evaluated" in j["note"]
    monkeypatch.setattr(TR, "_load", lambda name: FakeModel([]))
    assert post(client, "/api/transcribe", wav_bytes(tone(seconds=2))).json()["no_speech"] is True
    monkeypatch.setattr(TR, "_load", lambda name: (_ for _ in ()).throw(RuntimeError("engine crashed")))
    r = post(client, "/api/transcribe", wav_bytes(tone(seconds=2)))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "transcription_failed"


def test_config_advertises_timeline_limits(client):
    t = client.get("/api/config").json()["timeline"]
    assert t["default_window"] == 2.0 and t["max_segments"] == C.TIMELINE_MAX_SEGMENTS
