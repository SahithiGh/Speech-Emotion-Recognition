"""Advanced Voice Analysis module.

Computes physical acoustic measurements from audio signals:
1. Waveform visualization peaks.
2. Mel spectrogram analysis.
3. Fundamental frequency (F0 / pitch) contour and statistics.
4. Vocal intensity / energy (RMS in dB) contour and statistics.
5. Speaker-specific voice breakdown.
"""
from typing import Dict, Any, List, Optional
import numpy as np
import librosa

from . import config as C


def compute_pitch_contour(y: np.ndarray, sr: int = 16000, hop_length: int = 512) -> Dict[str, Any]:
    """Compute fundamental frequency (F0 / pitch) contour and pitch statistics using pYIN."""
    duration = len(y) / sr
    if duration < 0.2 or np.max(np.abs(y)) < 1e-4:
        return {
            "mean_hz": 0.0,
            "median_hz": 0.0,
            "min_hz": 0.0,
            "max_hz": 0.0,
            "std_hz": 0.0,
            "voiced_percentage": 0.0,
            "time_series": [],
        }

    try:
        f0, voiced_flag, _ = librosa.pyin(
            y,
            fmin=float(librosa.note_to_hz("C2")),   # ~65 Hz
            fmax=float(librosa.note_to_hz("C7")),   # ~500 Hz
            sr=sr,
            frame_length=1024,
            hop_length=hop_length,
        )
        times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

        voiced_mask = (voiced_flag is not None) & (f0 is not None) & np.isfinite(f0) & (voiced_flag == True)
        f0_voiced = f0[voiced_mask]

        if len(f0_voiced) > 0:
            mean_hz = float(np.mean(f0_voiced))
            med_hz = float(np.median(f0_voiced))
            min_hz = float(np.min(f0_voiced))
            max_hz = float(np.max(f0_voiced))
            std_hz = float(np.std(f0_voiced))
            voiced_pct = float(len(f0_voiced) / len(f0) * 100.0)
        else:
            mean_hz, med_hz, min_hz, max_hz, std_hz, voiced_pct = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

        # Subsample time series to ~100 points maximum for fast frontend rendering
        step = max(1, len(times) // 100)
        ts = []
        for i in range(0, len(times), step):
            val = float(f0[i]) if (voiced_mask[i] and np.isfinite(f0[i])) else None
            ts.append({
                "time": round(float(times[i]), 2),
                "pitch_hz": round(val, 1) if val is not None else None,
            })

        return {
            "mean_hz": round(mean_hz, 1),
            "median_hz": round(med_hz, 1),
            "min_hz": round(min_hz, 1),
            "max_hz": round(max_hz, 1),
            "std_hz": round(std_hz, 1),
            "voiced_percentage": round(voiced_pct, 1),
            "time_series": ts,
        }
    except Exception:
        return {
            "mean_hz": 0.0,
            "median_hz": 0.0,
            "min_hz": 0.0,
            "max_hz": 0.0,
            "std_hz": 0.0,
            "voiced_percentage": 0.0,
            "time_series": [],
        }


def compute_vocal_energy(y: np.ndarray, sr: int = 16000, hop_length: int = 512) -> Dict[str, Any]:
    """Compute vocal intensity / RMS energy contour in decibels (dB)."""
    if len(y) == 0:
        return {
            "mean_db": -80.0,
            "max_db": -80.0,
            "dynamic_range_db": 0.0,
            "time_series": [],
        }

    try:
        rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop_length)[0]
        times = librosa.times_like(rms, sr=sr, hop_length=hop_length)

        # Convert to dB relative to full scale
        db = librosa.amplitude_to_db(rms, ref=1.0, top_db=80.0)
        valid_db = db[db > -75.0]

        mean_db = float(np.mean(valid_db)) if len(valid_db) > 0 else float(np.mean(db))
        max_db = float(np.max(db))
        min_db = float(np.min(db))
        dynamic_range = max(0.0, max_db - min_db)

        step = max(1, len(times) // 100)
        ts = []
        for i in range(0, len(times), step):
            ts.append({
                "time": round(float(times[i]), 2),
                "energy_db": round(float(db[i]), 1),
            })

        return {
            "mean_db": round(mean_db, 1),
            "max_db": round(max_db, 1),
            "dynamic_range_db": round(dynamic_range, 1),
            "time_series": ts,
        }
    except Exception:
        return {
            "mean_db": -60.0,
            "max_db": -60.0,
            "dynamic_range_db": 0.0,
            "time_series": [],
        }


def extract_advanced_voice_analysis(
    y: np.ndarray,
    sr: int = 16000,
    speaker_turns: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Perform full advanced voice analysis on audio with optional speaker breakdown."""
    duration = round(float(len(y) / sr), 3)

    pitch_data = compute_pitch_contour(y, sr=sr)
    energy_data = compute_vocal_energy(y, sr=sr)

    # Speaker-specific voice analysis
    speaker_metrics: Dict[str, Any] = {}
    if speaker_turns:
        # Group slices by speaker_id
        spk_audio: Dict[str, List[np.ndarray]] = {}
        for turn in speaker_turns:
            spk_id = turn.get("speaker_id")
            if not spk_id:
                continue
            st = int(round(turn["start"] * sr))
            et = min(len(y), int(round(turn["end"] * sr)))
            chunk = y[st:et]
            if len(chunk) > 256:
                spk_audio.setdefault(spk_id, []).append(chunk)

        for spk_id, chunks in spk_audio.items():
            combined = np.concatenate(chunks)
            spk_pitch = compute_pitch_contour(combined, sr=sr)
            spk_energy = compute_vocal_energy(combined, sr=sr)
            speaker_metrics[spk_id] = {
                "mean_pitch_hz": spk_pitch["mean_hz"],
                "pitch_std_hz": spk_pitch["std_hz"],
                "pitch_range_hz": [spk_pitch["min_hz"], spk_pitch["max_hz"]],
                "mean_energy_db": spk_energy["mean_db"],
                "dynamic_range_db": spk_energy["dynamic_range_db"],
            }

    return {
        "duration": duration,
        "pitch": pitch_data,
        "energy": energy_data,
        "speaker_metrics": speaker_metrics,
        "disclaimer": "Pitch (fundamental frequency), vocal energy, and acoustic contours represent physical voice measurements. They do not independently prove emotional states or psychological deception.",
    }

