"""Experiment 1 Feature Extraction: 294 Features with Revised Spectral Contrast.

Eliminates the resampler-sensitive top Nyquist contrast band (Band 6: 6.4 kHz - 8.0 kHz),
which caused out-of-distribution audio to collapse to static fear probabilities.
"""
import librosa
import numpy as np

# Audio parameters matching production
SAMPLE_RATE = 16000
N_MFCC = 40
N_MELS = 40
N_FEATURES_EXP1 = 294

# Group definitions for 294 features (contrast reduced from 14 to 12 features)
FEATURE_GROUPS_EXP1 = {
    "mfcc": ("Voice timbre (MFCC)", "The overall shape of the sound spectrum.", list(range(0, 80))),
    "delta": ("Timbre change (delta MFCC)", "How quickly the voice timbre changes over time.", list(range(80, 160))),
    "mel": ("Mel spectrum", "Energy in perceptual frequency bands.", list(range(160, 240))),
    "chroma": ("Pitch classes (chroma)", "Which musical pitch classes carry energy.", list(range(240, 264))),
    "contrast": ("Spectral contrast (Bands 0-5)", "Difference between peaks and valleys in 0-6400 Hz range.", list(range(264, 276))),
    "shape": ("Spectral shape", "Brightness, spread, roll-off and noisiness of the sound.", list(range(276, 280)) + list(range(282, 286))),
    "loudness": ("Loudness and zero crossings", "Overall energy, variation and zero-crossing rate.", [280, 281, 286, 287, 292, 293]),
    "pitch": ("Pitch (intonation)", "Average pitch, variation and range during speech.", [288, 289, 290]),
    "pauses": ("Speech and pause ratio", "Proportion of the clip containing speech.", [291]),
}


def _stats(a: np.ndarray) -> np.ndarray:
    return np.concatenate([a.mean(axis=1), a.std(axis=1)])


def extract_features_294(y: np.ndarray) -> np.ndarray:
    """Extract 294 features from mono 16 kHz audio array.
    
    Drops the 7th spectral contrast band (Nyquist band: 6.4 - 8.0 kHz),
    which is sensitive to anti-aliasing low-pass filters in 44.1k/48k -> 16k resamplers.
    Bands 0-5 (0 to 6.4 kHz) are preserved and are invariant to resampling.
    """
    sr = SAMPLE_RATE
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
    delta = librosa.feature.delta(mfcc)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS))
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    
    # Standard librosa spectral_contrast with n_bands=6 computes 7 bands.
    # We slice [:-1] to keep bands 0..5 (0 Hz to 6400 Hz) and discard band 6 (6400 to 8000 Hz).
    contrast_full = librosa.feature.spectral_contrast(y=y, sr=sr, n_bands=6)
    contrast = contrast_full[:-1]  # shape (6, frames)
    
    rms = librosa.feature.rms(y=y)
    spectral = np.vstack([
        librosa.feature.spectral_centroid(y=y, sr=sr),
        librosa.feature.spectral_bandwidth(y=y, sr=sr),
        librosa.feature.spectral_rolloff(y=y, sr=sr),
        librosa.feature.spectral_flatness(y=y),
        librosa.feature.zero_crossing_rate(y),
        rms,
    ])
    f0 = librosa.yin(y, fmin=65, fmax=500, sr=sr)
    n = min(len(f0), rms.shape[1])
    f0, r = f0[:n], rms[0, :n]
    speech = r > 0.1 * r.max() if r.max() > 0 else np.ones(n, dtype=bool)
    if speech.sum() < 3:
        speech = np.ones(n, dtype=bool)
    fs = f0[speech]
    pitch = np.array([
        fs.mean(),
        fs.std(),
        np.percentile(fs, 95) - np.percentile(fs, 5),
        speech.mean(),
        np.percentile(r, 10),
        np.percentile(r, 90),
    ])
    
    vec = np.concatenate([
        _stats(mfcc),      # 80
        _stats(delta),     # 80
        _stats(mel),       # 80
        _stats(chroma),    # 24
        _stats(contrast),  # 12 (6 mean + 6 std)
        _stats(spectral),  # 12 (6 mean + 6 std)
        pitch,             # 6
    ])
    return np.nan_to_num(vec.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)


def drop_band6_from_296(X_296: np.ndarray) -> np.ndarray:
    """Drop spectral contrast Band 6 Mean (col 270) and Std (col 277) from a 296-D matrix/vector.
    
    Returns array with shape (..., 294).
    """
    return np.delete(X_296, [270, 277], axis=-1)


def preprocessing_config_294() -> dict:
    return {
        "sample_rate": SAMPLE_RATE,
        "n_mfcc": N_MFCC,
        "n_mels": N_MELS,
        "n_features": N_FEATURES_EXP1,
        "experiment": "exp1_revised_contrast",
        "description": "294 features: Band-limited spectral contrast (Bands 0-5, 0-6400 Hz), Nyquist band 6 dropped.",
    }

