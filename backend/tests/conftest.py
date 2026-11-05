"""Shared helpers. Generated tones are used ONLY to test software behaviour; they are not a dataset."""
import io
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from app import config as C  # noqa: E402


def wav_bytes(y, sr=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def tone(f0=200, seconds=1.2, amp=0.5, seed=0, sr=16000):
    t = np.arange(int(seconds * sr)) / sr
    rng = np.random.default_rng(seed)
    y = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in (1, 2, 3)) + 0.05 * rng.standard_normal(len(t))
    return (amp * y / np.max(np.abs(y))).astype(np.float32)


def make_tone_dataset(folder: Path, speakers=16, reps=2):
    """CREMA-D-style file names with tone audio, written to a temp folder for software tests only."""
    folder.mkdir(parents=True, exist_ok=True)
    for a in range(speakers):
        for i, code in enumerate(C.CODE_TO_EMOTION):
            for rep in range(reps):
                (folder / f"{1001 + a}_I{rep}A_{code}_XX.wav").write_bytes(
                    wav_bytes(tone(150 + 40 * i + (a % 3) * 15, seed=a * 30 + i * 3 + rep, amp=0.25 + 0.08 * i)))


def redirect_home(monkeypatch, home: Path):
    for name, sub in (("DATA_DIR", "data/AudioWAV"), ("MODELS_DIR", "models"), ("OUTPUTS_DIR", "outputs"),
                      ("MODEL_PATH", "models/m.joblib"), ("CONFIG_PATH", "models/c.json"), ("METRICS_PATH", "outputs/metrics.json"),
                      ("SPLIT_PATH", "outputs/split.json"), ("FEATURE_CACHE_PATH", "outputs/cache.npz"),
                      ("DATASET_REPORT_PATH", "outputs/ds.json")):
        monkeypatch.setattr(C, name, home / sub)


@pytest.fixture
def home(tmp_path, monkeypatch):
    redirect_home(monkeypatch, tmp_path)
    return tmp_path
