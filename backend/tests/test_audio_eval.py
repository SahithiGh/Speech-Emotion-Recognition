import io

import numpy as np
import pytest
import soundfile as sf

from app import audio
from app.errors import AudioError
from app.evaluation import compute_metrics, per_speaker_accuracy, speaker_bootstrap_ci
from conftest import tone, wav_bytes


def test_bad_audio_is_rejected_cleanly():
    with pytest.raises(AudioError, match="empty"):
        audio.load_audio_bytes(b"")
    with pytest.raises(AudioError) as e:
        audio.load_audio_bytes(b"this is not audio at all" * 50)
    assert e.value.code == "undecodable"
    with pytest.raises(AudioError) as e:
        audio.load_audio_bytes(wav_bytes(np.zeros(16000)))
    assert e.value.code == "silent"
    with pytest.raises(AudioError) as e:
        audio.load_audio_bytes(wav_bytes(tone(seconds=0.1)))
    assert e.value.code == "too_short"
    with pytest.raises(AudioError) as e:
        audio.load_audio_bytes(wav_bytes(tone(seconds=70)))
    assert e.value.code == "too_long"


def test_notes_for_clipping_short_and_truncated(monkeypatch):
    n = []
    audio.load_audio_bytes(wav_bytes(np.clip(tone(seconds=2, amp=4.0), -1, 1)), n)
    assert any("clipped" in x for x in n)
    n = []
    audio.load_audio_bytes(wav_bytes(tone(seconds=0.7)), n)
    assert any("short" in x.lower() for x in n)
    n = []
    from app import config as C
    monkeypatch.setattr(C, "MAX_SECONDS", 6.0)
    y = audio.load_audio_bytes(wav_bytes(tone(seconds=9)), n)
    assert len(y) == 6 * 16000 and any("first 6" in x for x in n)


def test_training_path_and_inference_path_give_identical_features(tmp_path):
    b = wav_bytes(tone(220, seconds=2.0))
    p = tmp_path / "a.wav"; p.write_bytes(b)
    f_train = audio.extract_features(audio.load_audio_file(p))
    f_infer = audio.extract_features(audio.load_audio_bytes(b))
    assert f_train.shape == (audio.N_FEATURES,) and np.array_equal(f_train, f_infer) and np.all(np.isfinite(f_train))


def test_other_sample_rates_channels_and_loudness():
    st = np.stack([tone(220, seconds=2, sr=44100)] * 2, axis=1)
    buf = io.BytesIO(); sf.write(buf, st, 44100, format="WAV")
    y = audio.load_audio_bytes(buf.getvalue())
    assert abs(len(y) / 16000 - 2.0) < 0.05
    loud = audio.extract_features(audio.load_audio_bytes(wav_bytes(tone(220, seconds=2, amp=0.8))))
    quiet = audio.extract_features(audio.load_audio_bytes(wav_bytes(tone(220, seconds=2, amp=0.05))))
    assert np.allclose(loud, quiet, rtol=0.2, atol=0.5)   # peak normalisation makes volume largely irrelevant


def test_metrics_match_hand_calculation():
    labels = ["a", "b", "c"]
    yt = ["a", "a", "a", "b", "b", "c"]
    yp = ["a", "a", "b", "b", "b", "a"]
    m = compute_metrics(yt, yp, labels)
    assert m["confusion_matrix"] == [[2, 1, 0], [0, 2, 0], [1, 0, 0]]
    assert m["accuracy"] == pytest.approx(4 / 6)
    assert m["per_class"]["a"]["precision"] == pytest.approx(2 / 3) and m["per_class"]["a"]["recall"] == pytest.approx(2 / 3)
    assert m["per_class"]["b"]["precision"] == pytest.approx(2 / 3) and m["per_class"]["b"]["recall"] == pytest.approx(1.0)
    assert m["per_class"]["c"]["f1"] == 0.0
    f1s = [2 / 3, 0.8, 0.0]
    assert m["macro_f1"] == pytest.approx(sum(f1s) / 3)
    assert m["balanced_accuracy"] == pytest.approx((2 / 3 + 1.0 + 0.0) / 3)


def test_bootstrap_and_speaker_accuracy():
    rng = np.random.default_rng(0)
    spk = np.repeat(np.arange(10), 20)
    yt = rng.choice(["a", "b"], size=200)
    yp = np.where(rng.random(200) < 0.8, yt, np.where(yt == "a", "b", "a"))
    ci = speaker_bootstrap_ci(yt, yp, spk, 200, seed=1)
    assert ci["accuracy_95ci"][0] <= np.mean(yt == yp) <= ci["accuracy_95ci"][1]
    assert ci == speaker_bootstrap_ci(yt, yp, spk, 200, seed=1)       # reproducible
    assert speaker_bootstrap_ci(yt[:40], yp[:40], spk[:40], 50, 1) is None   # too few speakers -> no interval
    assert per_speaker_accuracy(yt, yp, spk)["speakers"] == 10


def test_video_without_audio_is_rejected():
    import av
    buf = io.BytesIO()
    out = av.open(buf, mode="w", format="mp4")
    stream = out.add_stream("h264", rate=24)
    stream.width = 64
    stream.height = 64
    stream.pix_fmt = "yuv420p"
    frame = av.VideoFrame(64, 64, "yuv420p")
    frame.pts = 0
    for p in stream.encode(frame):
        out.mux(p)
    for p in stream.encode(None):
        out.mux(p)
    out.close()
    
    with pytest.raises(AudioError) as exc_info:
        audio.load_audio_bytes(buf.getvalue())
    assert exc_info.value.code == "no_audio_stream"


def test_video_with_audio_is_extracted():
    import av
    buf = io.BytesIO()
    out = av.open(buf, mode="w", format="mp4")
    astream = out.add_stream("aac", rate=16000)
    astream.layout = "mono"
    t = np.linspace(0, 2.0, 32000, endpoint=False, dtype=np.float32)
    tone_samples = np.sin(2 * np.pi * 220 * t) * 0.5
    aframe = av.AudioFrame.from_ndarray(tone_samples.reshape(1, -1), format="fltp", layout="mono")
    aframe.rate = 16000
    aframe.pts = 0
    for p in astream.encode(aframe):
        out.mux(p)
    for p in astream.encode(None):
        out.mux(p)
    out.close()

    sig = audio.load_audio_bytes(buf.getvalue())
    assert len(sig) > 0
    assert abs(len(sig) / 16000 - 2.0) < 0.5


def test_supported_audio_formats_decoding():
    t_samples = tone(220, seconds=1.5)
    for fmt in ["WAV", "FLAC", "OGG"]:
        buf = io.BytesIO()
        sf.write(buf, t_samples, 16000, format=fmt)
        sig = audio.load_audio_bytes(buf.getvalue())
        assert len(sig) > 0
        assert abs(len(sig) / 16000 - 1.5) < 0.3
