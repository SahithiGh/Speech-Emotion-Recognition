"""Audio Quality Assessment Module.

Evaluates measurable acoustic indicators before emotion classification:
- Estimated Signal-to-Noise Ratio (SNR) via adaptive percentile noise floor tracking
- Background noise level (RMS)
- Sample clipping and harmonic distortion
- Silence and low-volume sections
- Active speech duration and speech-to-pause ratio
- Spectral flatness (broadband noise / hiss vs harmonic vocal spectrum)

Quality States:
- GOOD: Audio is clean and suitable for emotion analysis.
- WARNING: Background noise or minor quality issues present, but speech is intelligible.
- NOISY: Heavy background noise makes reliable emotion prediction unsuitable.
- UNUSABLE: Insufficient speech, severe clipping, silence, or invalid audio.
"""
from typing import Dict, Any, List
import librosa
import numpy as np


def assess_audio_quality(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """Analyze acoustic characteristics and return a structured quality assessment."""
    dur = float(len(y) / sr) if sr > 0 else 0.0
    if dur < 0.5:
        return {
            "status": "UNUSABLE",
            "prediction_accepted": False,
            "code": "too_short",
            "reason": f"Recording duration ({dur:.2f}s) is shorter than 0.5 seconds.",
            "snr_db": 0.0,
            "noise_floor": 0.0,
            "speech_duration": 0.0,
            "speech_ratio": 0.0,
            "clipping_fraction": 0.0,
            "flatness": 0.0,
            "warnings": ["Audio is too short for reliable evaluation."]
        }

    peak = float(np.max(np.abs(y))) if len(y) > 0 else 0.0
    rms = float(np.sqrt(np.mean(y ** 2))) if len(y) > 0 else 0.0
    clip_frac = float(np.mean(np.abs(y) >= 0.99)) if len(y) > 0 else 0.0

    if peak < 0.012 or rms < 0.002:
        return {
            "status": "UNUSABLE",
            "prediction_accepted": False,
            "code": "silent",
            "reason": "Recording is silent or too quiet to analyze. Please speak closer to the microphone.",
            "snr_db": 0.0,
            "noise_floor": round(rms, 4),
            "speech_duration": 0.0,
            "speech_ratio": 0.0,
            "clipping_fraction": round(clip_frac, 4),
            "flatness": 0.0,
            "warnings": ["Audio energy is below audible threshold."]
        }

    if clip_frac >= 0.03:
        return {
            "status": "UNUSABLE",
            "prediction_accepted": False,
            "code": "clipped",
            "reason": f"Audio is severely clipped and distorted ({clip_frac * 100:.1f}% clipped samples). Lower your microphone input volume.",
            "snr_db": 0.0,
            "noise_floor": round(rms, 4),
            "speech_duration": 0.0,
            "speech_ratio": 0.0,
            "clipping_fraction": round(clip_frac, 4),
            "flatness": 0.0,
            "warnings": ["Severe digital clipping distortion."]
        }

    # Frame-level RMS (25ms window, 10ms hop)
    frame_len = int(0.025 * sr)
    hop_len = int(0.010 * sr)
    f_rms = librosa.feature.rms(y=y, frame_length=frame_len, hop_length=hop_len)[0]

    # Background noise floor: estimate from lowest 15% energy frames
    sorted_e = np.sort(f_rms)
    n_floor_idx = max(1, int(len(sorted_e) * 0.15))
    noise_floor_rms = float(np.mean(sorted_e[:n_floor_idx]))

    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    p90 = sorted_e[min(len(sorted_e) - 1, int(len(sorted_e) * 0.90))]
    rms_ratio = noise_floor_rms / max(float(p90), 1e-6)

    # Steady tonal acoustic signal (e.g. continuous test tones or sustained vocal vowels without silence gaps)
    # has uniform energy across frames (high rms_ratio) but very low spectral flatness (tonal, not broadband noise)
    if rms_ratio > 0.70 and flatness < 0.015:
        noise_floor_rms = min(noise_floor_rms, 0.001)

    # Adaptive speech threshold: must exceed noise floor and absolute speech energy
    speech_thresh = max(noise_floor_rms * 2.5, 0.008)
    speech_mask = (f_rms >= speech_thresh) & (f_rms >= 0.005)
    speech_dur = float(np.sum(speech_mask) * hop_len / sr)
    speech_ratio = float(speech_dur / dur) if dur > 0 else 0.0

    speech_rms = float(np.mean(f_rms[speech_mask])) if np.any(speech_mask) else 0.0
    snr_db = float(20 * np.log10(max(speech_rms, 1e-6) / max(noise_floor_rms, 1e-6)))

    # Heavy background noise check (NOISY)
    # Calibrated against project test samples:
    # Noisy1.wav: SNR 13.1 dB, noise floor 0.016
    # Noisy2.wav: SNR 12.1 dB, noise floor 0.019
    is_heavy_noise = (
        (snr_db < 16.0 and noise_floor_rms >= 0.012)
        or (snr_db < 18.0 and flatness > 0.05)
        or (noise_floor_rms >= 0.012 and flatness > 0.04)
    )
    if is_heavy_noise:
        return {
            "status": "NOISY",
            "prediction_accepted": True,
            "code": "noisy_audio",
            "reason": "Noisy audio detected. Heavy background noise may affect reliability. Consider recording in a quieter environment.",
            "snr_db": round(snr_db, 1),
            "noise_floor": round(noise_floor_rms, 4),
            "speech_duration": round(speech_dur, 2),
            "speech_ratio": round(speech_ratio, 2),
            "clipping_fraction": round(clip_frac, 4),
            "flatness": round(flatness, 4),
            "warnings": [
                f"Low signal-to-noise ratio ({snr_db:.1f} dB).",
                f"Elevated background noise floor ({noise_floor_rms:.4f} RMS)."
            ]
        }

    # Insufficient speech in non-noisy audio -> UNUSABLE
    if speech_dur < 0.6:
        return {
            "status": "UNUSABLE",
            "prediction_accepted": False,
            "code": "no_speech",
            "reason": f"Insufficient speech detected ({speech_dur:.2f}s). Please provide a recording containing clear spoken sentences.",
            "snr_db": round(snr_db, 1),
            "noise_floor": round(noise_floor_rms, 4),
            "speech_duration": round(speech_dur, 2),
            "speech_ratio": round(speech_ratio, 2),
            "clipping_fraction": round(clip_frac, 4),
            "flatness": round(flatness, 4),
            "warnings": ["Speech activity detector found fewer than 0.6 seconds of vocalization."]
        }

    # Moderate warning checks (WARNING)
    warnings: List[str] = []
    if snr_db < 25.0:
        warnings.append(f"Moderate background noise detected (SNR: {snr_db:.1f} dB).")
    if noise_floor_rms >= 0.004:
        warnings.append(f"Elevated ambient noise floor ({noise_floor_rms:.4f} RMS).")
    if clip_frac >= 0.005:
        warnings.append(f"Audio contains slight clipping ({clip_frac * 100:.1f}%).")
    if speech_ratio < 0.25 and dur >= 4.0:
        warnings.append("Recording contains long pauses or extended silence.")
    if speech_dur < 1.2:
        warnings.append(f"Short speech duration ({speech_dur:.1f}s). Results may be less reliable.")

    if warnings:
        return {
            "status": "WARNING",
            "prediction_accepted": True,
            "code": "audio_warning",
            "reason": "Background noise detected. Prediction may be less reliable.",
            "snr_db": round(snr_db, 1),
            "noise_floor": round(noise_floor_rms, 4),
            "speech_duration": round(speech_dur, 2),
            "speech_ratio": round(speech_ratio, 2),
            "clipping_fraction": round(clip_frac, 4),
            "flatness": round(flatness, 4),
            "warnings": warnings
        }

    return {
        "status": "GOOD",
        "prediction_accepted": True,
        "code": "good_quality",
        "reason": "Audio quality is suitable for emotion analysis.",
        "snr_db": round(snr_db, 1),
        "noise_floor": round(noise_floor_rms, 4),
        "speech_duration": round(speech_dur, 2),
        "speech_ratio": round(speech_ratio, 2),
        "clipping_fraction": round(clip_frac, 4),
        "flatness": round(flatness, 4),
        "warnings": []
    }
