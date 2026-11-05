"""Mel spectrogram of the actual uploaded audio, for display only. It is an audio-analysis view, not an emotion prediction."""
import base64

import librosa
import numpy as np

from . import config as C


def compute_spectrogram(y: np.ndarray) -> dict:
    """Return a compact, quantised log-mel spectrogram of the whole recording (no trimming; time 0 is the start of the audio)."""
    sr = C.SAMPLE_RATE
    n_fft = 1024
    hop = max(160, int(np.ceil(len(y) / C.SPECTROGRAM_MAX_FRAMES)))     # at most ~600 columns, so long clips stay light
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop, center=False)) ** 2
    mel = librosa.feature.melspectrogram(S=S, sr=sr, n_fft=n_fft, n_mels=C.SPECTROGRAM_MELS, fmin=0, fmax=sr / 2)
    peak = max(float(mel.max()), 1e-10)
    db = 10 * np.log10(np.maximum(mel, 1e-10) / peak)                    # 0 dB = loudest cell of this clip
    db = np.clip(db, -C.SPECTROGRAM_DB_RANGE, 0)
    q = np.round((db + C.SPECTROGRAM_DB_RANGE) / C.SPECTROGRAM_DB_RANGE * 255).astype(np.uint8)   # 0..255, row 0 = lowest frequency
    freqs = librosa.mel_frequencies(n_mels=C.SPECTROGRAM_MELS, fmin=0, fmax=sr / 2)
    frames = q.shape[1]
    return {"duration": round(len(y) / sr, 3), "sample_rate": sr, "n_mels": int(q.shape[0]), "frames": int(frames),
            "frame_seconds": hop / sr, "first_frame_center_seconds": (n_fft / 2) / sr,
            "frame_window_seconds": n_fft / sr, "fmin": 0, "fmax": sr / 2,
            "mel_frequencies_hz": [round(float(f), 1) for f in freqs],
            "db_min": -C.SPECTROGRAM_DB_RANGE, "db_max": 0,
            "scale": "log-mel power in dB relative to the loudest cell of this clip",
            "data": base64.b64encode(q.tobytes()).decode("ascii")}
