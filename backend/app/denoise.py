"""Audio Noise Reduction Module.

Provides automatic background noise suppression for audio/video uploads
prior to feature extraction and emotion recognition.

Algorithm:
- Evaluates DeepFilterNet: DeepFilterNet requires `deepfilterlib` which only
  distributes pre-compiled binary wheels up to Python 3.11 on Windows. In Python
  3.13, it requires a full Rust/Cargo build toolchain.
- Implements Spectral Gating (`noisereduce`): Non-stationary / stationary STFT
  spectral gating that attenuates background rumble, fan noise, microphone hiss,
  and ambient hum while strictly preserving speech formants, pitch variations,
  vocal intensity, and emotional expression.
- Conditional Processing: Applied only when audio quality assessment identifies
  background noise (NOISY or WARNING with elevated noise floor). Clean speech
  bypasses this step with zero modification.
"""
import logging
from typing import Dict, Any, Tuple, Optional
import numpy as np

log = logging.getLogger(__name__)

# Check DeepFilterNet status for technical reporting
_DEEPFILTERNET_AVAILABLE = False
_DEEPFILTERNET_REASON = (
    "DeepFilterNet requires 'deepfilterlib', which provides wheels only up to Python 3.11. "
    "In Python 3.13 on Windows, source compilation requires a Rust/Cargo toolchain which is not present."
)
try:
    import df  # type: ignore
    _DEEPFILTERNET_AVAILABLE = True
    _DEEPFILTERNET_REASON = "DeepFilterNet is installed and available."
except ImportError:
    pass

# Check noisereduce status
_NOISEREDUCE_AVAILABLE = False
try:
    import noisereduce as nr
    _NOISEREDUCE_AVAILABLE = True
except ImportError as err:
    log.warning("noisereduce package not installed: %s", err)


def is_deepfilternet_available() -> Tuple[bool, str]:
    """Return whether DeepFilterNet is available and the diagnostic explanation."""
    return _DEEPFILTERNET_AVAILABLE, _DEEPFILTERNET_REASON


def is_noisereduce_available() -> bool:
    """Return whether spectral gating noisereduce is available."""
    return _NOISEREDUCE_AVAILABLE


def reduce_noise_signal(
    y: np.ndarray,
    sr: int,
    initial_noise_floor: float = 0.0,
    initial_snr_db: float = 0.0,
    prop_decrease: float = 0.75
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Apply automatic background noise reduction on mono floating-point audio.
    
    Args:
        y: Mono audio waveform as float32 numpy array.
        sr: Sample rate (typically 16000 Hz).
        initial_noise_floor: Pre-assessed RMS noise floor.
        initial_snr_db: Pre-assessed estimated SNR.
        prop_decrease: Degree of noise reduction (0.0 to 1.0). 0.75 gives 75% noise
                       attenuation, maintaining vocal naturalness without musical noise artifacts.
                       
    Returns:
        (processed_y, info_dict)
    """
    if not _NOISEREDUCE_AVAILABLE:
        log.warning("Noise reduction requested but noisereduce library is unavailable.")
        return y, {
            "applied": False,
            "method": "none",
            "reason": "Noise reduction library not available in runtime environment",
            "noise_floor_before": round(initial_noise_floor, 4),
            "noise_floor_after": round(initial_noise_floor, 4),
            "snr_before": round(initial_snr_db, 1),
            "snr_after": round(initial_snr_db, 1),
        }

    if y.size == 0 or not np.all(np.isfinite(y)):
        return y, {
            "applied": False,
            "method": "spectral_gating",
            "reason": "Audio waveform is empty or contains non-finite samples",
            "noise_floor_before": round(initial_noise_floor, 4),
            "noise_floor_after": round(initial_noise_floor, 4),
            "snr_before": round(initial_snr_db, 1),
            "snr_after": round(initial_snr_db, 1),
        }

    try:
        # Perform spectral gating noise suppression
        # stationary=True uses adaptive noise floor profile from speech pauses
        cleaned = nr.reduce_noise(
            y=y,
            sr=sr,
            prop_decrease=prop_decrease,
            stationary=True,
            n_jobs=1
        )

        # Validate processed waveform
        if not np.all(np.isfinite(cleaned)):
            log.warning("Denoised audio contains NaN/Inf values. Falling back to original.")
            return y, {
                "applied": False,
                "method": "spectral_gating",
                "reason": "Denoised waveform contained non-finite values (fallback to original)",
                "noise_floor_before": round(initial_noise_floor, 4),
                "noise_floor_after": round(initial_noise_floor, 4),
                "snr_before": round(initial_snr_db, 1),
                "snr_after": round(initial_snr_db, 1),
            }

        # Check energy preservation: speech should not be silenced
        peak_orig = float(np.max(np.abs(y)))
        peak_cleaned = float(np.max(np.abs(cleaned)))
        if peak_cleaned < 0.005 or (peak_orig > 0.05 and peak_cleaned < 0.02 * peak_orig):
            log.warning("Denoising over-attenuated speech signal. Falling back to original.")
            return y, {
                "applied": False,
                "method": "spectral_gating",
                "reason": "Signal over-attenuated by noise filter (fallback to original)",
                "noise_floor_before": round(initial_noise_floor, 4),
                "noise_floor_after": round(initial_noise_floor, 4),
                "snr_before": round(initial_snr_db, 1),
                "snr_after": round(initial_snr_db, 1),
            }

        return cleaned.astype(np.float32), {
            "applied": True,
            "method": "spectral_gating",
            "prop_decrease": prop_decrease,
            "noise_floor_before": round(initial_noise_floor, 4),
            "snr_before": round(initial_snr_db, 1),
        }

    except Exception as exc:
        log.error("Noise reduction execution failed: %s", exc, exc_info=True)
        return y, {
            "applied": False,
            "method": "spectral_gating",
            "reason": f"Denoising failed: {str(exc)}",
            "noise_floor_before": round(initial_noise_floor, 4),
            "noise_floor_after": round(initial_noise_floor, 4),
            "snr_before": round(initial_snr_db, 1),
            "snr_after": round(initial_snr_db, 1),
        }
