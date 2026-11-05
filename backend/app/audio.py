"""Loading audio and turning it into the numeric features the classifier uses.

Training and prediction call exactly the same functions (prepare_signal -> extract_features),
so a clip gets the same feature vector whichever way it arrives.
"""
import io
import os
import tempfile

import librosa
import numpy as np
import soundfile as sf

from . import config as C
from .errors import AudioError


def prepare_signal(y: np.ndarray, sr: int, notes: list | None = None) -> np.ndarray:
    """Validate a mono waveform and return a clean 16 kHz signal. Optional `notes` collects user-facing warnings."""
    notes = notes if notes is not None else []
    y = np.asarray(y, dtype=np.float32)
    if y.ndim != 1:
        raise AudioError("Unsupported audio layout.")
    if y.size == 0:
        raise AudioError("The audio file is empty.")
    if not np.all(np.isfinite(y)):
        raise AudioError("The audio contains invalid values and may be corrupted.")
    if len(y) / sr > C.MAX_INPUT_SECONDS:
        raise AudioError(f"The audio is longer than {int(C.MAX_INPUT_SECONDS)} seconds. Use a shorter clip (one sentence is ideal).", "too_long")
    if np.mean(np.abs(y) >= 0.99) > C.CLIP_FRACTION:
        notes.append("The recording is clipped (too loud), which can distort the result. Move back from the microphone or lower its volume.")
    if sr != C.SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=C.SAMPLE_RATE)
    if len(y) / C.SAMPLE_RATE < C.MIN_SECONDS:
        raise AudioError(f"The recording is too short. Please provide at least {C.MIN_SECONDS} seconds of speech.", "too_short")
    if float(np.sqrt(np.mean(y ** 2))) < C.SILENCE_RMS:
        raise AudioError("The recording is silent or too quiet. Speak closer to the microphone and try again.", "silent")
    # Voice Activity / Speech check: ensure non-trivial speech frames exist
    frame_rms = librosa.feature.rms(y=y, frame_length=512, hop_length=160)[0]
    speech_frames = (frame_rms > 0.15 * np.max(frame_rms)) & (frame_rms >= C.SILENCE_RMS)
    if np.sum(speech_frames) < 6:
        raise AudioError("No speech detected. Please upload a recording containing speech.", "no_speech")
    # Spectral flatness check: reject stationary white/pink noise and mic hiss without harmonic speech
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    if flatness > 0.22:
        raise AudioError("No clear speech detected. The audio contains too much background noise or hiss. Speak closer to the microphone and try again.", "no_speech")
    y, _ = librosa.effects.trim(y, top_db=C.TRIM_TOP_DB)
    if len(y) / C.SAMPLE_RATE < C.MIN_SECONDS:
        raise AudioError("Not enough speech was found after removing silence. Please record a longer sentence.", "too_short")
    if len(y) / C.SAMPLE_RATE < C.SHORT_NOTE_SECONDS:
        notes.append("Very short clip. Results are less reliable; try a full sentence of 2 to 5 seconds.")
    if len(y) > C.MAX_SECONDS * C.SAMPLE_RATE:
        y = y[: int(C.MAX_SECONDS * C.SAMPLE_RATE)]
        notes.append(f"Only the first {int(C.MAX_SECONDS)} seconds were analysed. Use shorter clips for targeted evaluation.")
    peak = float(np.max(np.abs(y)))
    if peak < 0.012:
        raise AudioError("Audio is too quiet. Please record again.", "silent")
    y = y / peak * 0.9   # peak-normalise so loud and quiet recordings are comparable
    return y.astype(np.float32)


def load_audio_file(path) -> np.ndarray:
    """Load a dataset clip from disk."""
    try:
        y, sr = librosa.load(str(path), sr=None, mono=True)
    except Exception as exc:
        raise AudioError(f"Could not read audio file ({type(exc).__name__}).") from exc
    return prepare_signal(y, int(sr))


def _decode(data: bytes):
    """Decode uploaded bytes to (mono float32 samples, sample rate).
    Supports WAV, MP3, OGG, FLAC, M4A, AAC, and video formats (MP4, WebM, MOV, MKV) via PyAV/SoundFile."""
    if not data:
        raise AudioError("The uploaded file is empty.", "empty")
    
    # 1. Fast path with soundfile for standard uncompressed/lossless audio (WAV, FLAC, OGG)
    try:
        info = sf.info(io.BytesIO(data))
        if info.duration > C.MAX_INPUT_SECONDS:
            raise AudioError(f"The audio is longer than {int(C.MAX_INPUT_SECONDS)} seconds. Use a shorter clip (one sentence is ideal).", "too_long")
        y, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        return y.mean(axis=1), int(sr)
    except AudioError:
        raise
    except Exception:
        pass

    # 2. PyAV path for MP3, M4A, AAC, and video containers (MP4, WebM, MOV, MKV)
    try:
        import av
        container = av.open(io.BytesIO(data))
        audio_streams = [s for s in container.streams if s.type == "audio"]
        video_streams = [s for s in container.streams if s.type == "video"]

        if video_streams and not audio_streams:
            raise AudioError("The uploaded video has no audio track. Please upload a video with spoken audio.", "no_audio_stream")
        if not audio_streams:
            raise AudioError("No audio track detected in this file.", "undecodable")

        stream = audio_streams[0]
        sr = stream.codec_context.sample_rate or C.SAMPLE_RATE
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=sr)
        samples = []
        for frame in container.decode(stream):
            for resampled_frame in resampler.resample(frame):
                samples.append(resampled_frame.to_ndarray()[0])
        for resampled_frame in resampler.resample(None):
            samples.append(resampled_frame.to_ndarray()[0])

        if not samples:
            raise AudioError("The audio stream in this file is empty.", "empty")

        y = np.concatenate(samples).astype(np.float32)
        duration = len(y) / sr
        if duration > C.MAX_INPUT_SECONDS:
            raise AudioError(f"The audio is longer than {int(C.MAX_INPUT_SECONDS)} seconds. Use a shorter clip (one sentence is ideal).", "too_long")
        return y, int(sr)
    except AudioError:
        raise
    except Exception:
        pass

    # 3. Last-resort fallback with librosa via temporary file
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        if len(y) / sr > C.MAX_INPUT_SECONDS:
            raise AudioError(f"The audio is longer than {int(C.MAX_INPUT_SECONDS)} seconds. Use a shorter clip (one sentence is ideal).", "too_long")
        return y.astype(np.float32), int(sr)
    except AudioError:
        raise
    except Exception as exc:
        raise AudioError("This file could not be decoded as audio or video. Supported formats include WAV, MP3, OGG, FLAC, M4A, and MP4.", "undecodable") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def load_audio_bytes(data: bytes, notes: list | None = None) -> np.ndarray:
    """Uploaded bytes -> cleaned 16 kHz signal for classification (silence trimmed, normalised)."""
    y, sr = _decode(data)
    return prepare_signal(y, sr, notes)


def load_raw_signal(data: bytes) -> np.ndarray:
    """The WHOLE recording as mono 16 kHz audio with no trimming, so that time positions equal the original audio.
    Used by the spectrogram and the emotion timeline."""
    y, sr = _decode(data)
    if y.size == 0:
        raise AudioError("The audio file is empty.")
    if not np.all(np.isfinite(y)):
        raise AudioError("The audio contains invalid values and may be corrupted.")
    if len(y) / sr > C.MAX_INPUT_SECONDS:
        raise AudioError(f"The audio is longer than {int(C.MAX_INPUT_SECONDS)} seconds.", "too_long")
    if sr != C.SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=C.SAMPLE_RATE)
    if len(y) / C.SAMPLE_RATE < C.MIN_SECONDS:
        raise AudioError(f"The recording is too short. Please provide at least {C.MIN_SECONDS} seconds.", "too_short")
    return y.astype(np.float32)


def _stats(a: np.ndarray) -> np.ndarray:
    return np.concatenate([a.mean(axis=1), a.std(axis=1)])


def extract_features(y: np.ndarray) -> np.ndarray:
    """One fixed-length vector per clip (296 values).

    Why these features: MFCC/mel capture the vocal-tract spectrum (timbre); delta-MFCC capture how it changes;
    chroma and spectral contrast/centroid/bandwidth/rolloff/flatness describe brightness and noisiness;
    ZCR and RMS describe energy; pitch statistics (YIN, speech frames only) and speech/pause ratio capture
    intonation and tempo, which differ strongly between emotions such as sad, angry and happy.
    """
    sr = C.SAMPLE_RATE
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=C.N_MFCC)
    delta = librosa.feature.delta(mfcc)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_mels=C.N_MELS))
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
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
    pitch = np.array([fs.mean(), fs.std(), np.percentile(fs, 95) - np.percentile(fs, 5), speech.mean(),
                      np.percentile(r, 10), np.percentile(r, 90)])
    vec = np.concatenate([_stats(mfcc), _stats(delta), _stats(mel), _stats(chroma), _stats(contrast), _stats(spectral), pitch])
    return np.nan_to_num(vec.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)


N_FEATURES = 80 + 80 + 80 + 24 + 14 + 12 + 6

# Plain-language groups of the 296 values, used to report which kinds of sound property the model relies on.
FEATURE_GROUPS = {
    "mfcc": ("Voice timbre (MFCC)", "The overall shape of the sound spectrum, which reflects voice quality.", list(range(0, 80))),
    "delta": ("Timbre change (delta MFCC)", "How quickly the voice timbre changes over time.", list(range(80, 160))),
    "mel": ("Mel spectrum", "Energy in perceptual frequency bands.", list(range(160, 240))),
    "chroma": ("Pitch classes (chroma)", "Which musical pitch classes carry energy.", list(range(240, 264))),
    "contrast": ("Spectral contrast", "Difference between peaks and valleys in the spectrum.", list(range(264, 278))),
    "shape": ("Spectral shape", "Brightness, spread, roll-off and noisiness of the sound.", list(range(278, 282)) + list(range(284, 288))),
    "loudness": ("Loudness and zero crossings", "Overall energy, its variation and how often the waveform crosses zero.", [282, 283, 288, 289, 294, 295]),
    "pitch": ("Pitch (intonation)", "Average pitch, its variation and its range during speech.", [290, 291, 292]),
    "pauses": ("Speech and pause ratio", "How much of the clip contains speech rather than pauses.", [293]),
}


def preprocessing_config() -> dict:
    """Saved next to the model so predictions always use the same settings."""
    return {
        "sample_rate": C.SAMPLE_RATE, "min_seconds": C.MIN_SECONDS, "max_seconds": C.MAX_SECONDS,
        "silence_rms": C.SILENCE_RMS, "trim_top_db": C.TRIM_TOP_DB, "n_mfcc": C.N_MFCC, "n_mels": C.N_MELS,
        "peak_normalise": 0.9, "feature_version": C.FEATURE_VERSION, "n_features": N_FEATURES,
        "features": "mean+std of MFCC(40), delta-MFCC(40), log-mel(40), chroma(12), spectral contrast(7), centroid, "
                    "bandwidth, rolloff, flatness, zero-crossing rate, RMS; plus pitch mean/std/range (YIN, speech frames), "
                    "speech ratio and RMS 10th/90th percentiles",
    }
