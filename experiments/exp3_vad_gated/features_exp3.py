"""Experiment 3: VAD-Gated Feature Extraction (296 Features).

Preserves exact 296 feature ordering and dimensionality while gating
temporal mean and standard deviation aggregations over voiced speech frames.
This makes Mel spectrogram statistics (Features 160-239) and timbre statistics
invariant to conversational pauses, breath gaps, and silence.

Candidate A: Adaptive Energy + Spectral Flatness VAD.
Candidate B: Multi-Band / Formant Voice Activity Detector.
"""
import numpy as np
import librosa
from scipy.ndimage import binary_closing, binary_dilation, binary_opening

# Exact parameters matching production
SAMPLE_RATE = 16000
N_MFCC = 40
N_MELS = 40
N_FEATURES = 296


def compute_vad_mask_candidate_a(
    y: np.ndarray,
    sr: int = SAMPLE_RATE,
    frame_length: int = 2048,
    hop_length: int = 512,
    rel_energy_thresh: float = 0.08,
    min_energy_thresh: float = 0.005,
    max_flatness: float = 0.28,
    pad_frames: int = 1,
) -> np.ndarray:
    """Candidate A: Adaptive Energy + Spectral Flatness VAD.
    
    Identifies frames that have sufficient acoustic energy AND are not flat
    stationary noise (such as room hiss or microphone self-noise).
    Includes temporal morphological closing to avoid chopping intra-word plosives,
    and a 1-frame hangover dilation (32 ms) to protect quiet word onsets and release bursts.
    """
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=frame_length, hop_length=hop_length)[0]
    
    n_frames = len(rms)
    max_rms = float(np.max(rms)) if n_frames > 0 else 0.0
    thresh = max(rel_energy_thresh * max_rms, min_energy_thresh)
    
    # Voiced speech criterion: energy above threshold AND non-flat spectrum
    raw_mask = (rms > thresh) & (flatness < max_flatness)
    
    # Morphological closing (fill gaps <= 2 frames ~ 64 ms) and opening (remove spikes <= 1 frame)
    if n_frames >= 4 and np.any(raw_mask):
        structure = np.ones(3, dtype=bool)
        closed_mask = binary_closing(raw_mask, structure=structure)
        cleaned_mask = binary_opening(closed_mask, structure=structure)
        # Apply safety dilation (hangover) to protect quiet word onsets and word-final release bursts
        if pad_frames > 0 and np.any(cleaned_mask):
            pad_struct = np.ones(1 + 2 * pad_frames, dtype=bool)
            cleaned_mask = binary_dilation(cleaned_mask, structure=pad_struct)
    else:
        cleaned_mask = raw_mask
        
    # Safeguard: if fewer than 6 frames (~192 ms) detected, fall back to energy-only or all frames
    if np.sum(cleaned_mask) < 6:
        fallback = rms > (0.05 * max_rms)
        if np.sum(fallback) >= 6:
            cleaned_mask = fallback
        else:
            cleaned_mask = np.ones(n_frames, dtype=bool)
            
    return cleaned_mask.astype(bool)


def compute_vad_mask_candidate_b(
    y: np.ndarray,
    sr: int = SAMPLE_RATE,
    frame_length: int = 2048,
    hop_length: int = 512,
    fmin_band: int = 2,   # ~160 Hz in 40-mel grid
    fmax_band: int = 28,  # ~4000 Hz in 40-mel grid
    rel_thresh: float = 0.06,
) -> np.ndarray:
    """Candidate B: Multi-Band / Formant Voice Activity Detector.
    
    Focuses energy integration on the core human speech formant frequency region (160 Hz - 4000 Hz),
    down-weighting sub-bass rumble (<160 Hz) and high-frequency hiss (>4000 Hz).
    """
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length, n_mels=40)
    # Convert power mel to linear energy in core speech bands
    voice_band_energy = np.sum(mel[fmin_band:fmax_band, :], axis=0)
    n_frames = len(voice_band_energy)
    
    max_energy = float(np.max(voice_band_energy)) if n_frames > 0 else 0.0
    raw_mask = voice_band_energy > (rel_thresh * max_energy)
    
    if n_frames >= 4 and np.any(raw_mask):
        structure = np.ones(3, dtype=bool)
        closed_mask = binary_closing(raw_mask, structure=structure)
        cleaned_mask = binary_opening(closed_mask, structure=structure)
    else:
        cleaned_mask = raw_mask
        
    # Safeguard
    if np.sum(cleaned_mask) < 6:
        cleaned_mask = np.ones(n_frames, dtype=bool)
        
    return cleaned_mask.astype(bool)


def _stats_gated(feature_matrix: np.ndarray, speech_mask: np.ndarray) -> np.ndarray:
    """Compute temporal mean and standard deviation across voiced speech frames only.
    
    Parameters
    ----------
    feature_matrix : shape (n_channels, n_frames)
    speech_mask : shape (n_frames,), boolean
    """
    if speech_mask.ndim != 1 or len(speech_mask) != feature_matrix.shape[1]:
        raise ValueError(
            f"Frame alignment error: mask frames {len(speech_mask)} != feature frames {feature_matrix.shape[1]}"
        )
    
    # Index speech frames
    gated = feature_matrix[:, speech_mask]
    
    # If no frames or 1 frame, avoid std division by zero
    if gated.shape[1] < 2:
        return np.concatenate([feature_matrix.mean(axis=1), np.zeros(feature_matrix.shape[0], dtype=np.float32)])
        
    mean = gated.mean(axis=1)
    std = gated.std(axis=1)
    return np.concatenate([mean, std])


def extract_features_exp3(y: np.ndarray, vad_candidate: str = "A") -> np.ndarray:
    """Extract exactly 296 features using VAD-gated aggregation.
    
    Preserves:
    - Exact 296 dimensions
    - Exact feature ordering
    - Dedicated pause/speech ratio in Feature 293
    - Exact training/inference consistency
    """
    sr = SAMPLE_RATE
    frame_length = 2048
    hop_length = 512
    
    # 1. Compute frame-synchronized feature matrices
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=frame_length, hop_length=hop_length)
    delta = librosa.feature.delta(mfcc)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS, n_fft=frame_length, hop_length=hop_length))
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)
    
    spectral = np.vstack([
        librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length),
        librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length),
        librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length),
        librosa.feature.spectral_flatness(y=y, n_fft=frame_length, hop_length=hop_length),
        librosa.feature.zero_crossing_rate(y, frame_length=frame_length, hop_length=hop_length),
        rms,
    ])
    
    # 2. Compute speech activity mask
    if vad_candidate.upper() == "A":
        speech_mask = compute_vad_mask_candidate_a(y, sr=sr, frame_length=frame_length, hop_length=hop_length)
    elif vad_candidate.upper() == "B":
        speech_mask = compute_vad_mask_candidate_b(y, sr=sr, frame_length=frame_length, hop_length=hop_length)
    else:
        raise ValueError(f"Unknown vad_candidate: {vad_candidate}. Must be 'A' or 'B'.")
        
    # Ensure exact length alignment
    n_frames = mfcc.shape[1]
    if len(speech_mask) > n_frames:
        speech_mask = speech_mask[:n_frames]
    elif len(speech_mask) < n_frames:
        speech_mask = np.pad(speech_mask, (0, n_frames - len(speech_mask)), mode="edge")
        
    # 3. YIN Pitch extraction (also aligned to speech frames)
    f0 = librosa.yin(y, fmin=65, fmax=500, sr=sr, frame_length=frame_length, hop_length=hop_length)
    n_yin = min(len(f0), n_frames)
    f0_aligned = f0[:n_yin]
    mask_aligned = speech_mask[:n_yin]
    
    if np.any(mask_aligned):
        fs = f0_aligned[mask_aligned]
    else:
        fs = f0_aligned
        
    r_aligned = rms[0, :n_frames]
    
    # Pitch & rhythm features (Features 290 - 295)
    # Feature 293 is the Speech/Pause Ratio (fraction of clip with active speech)
    speech_ratio = float(np.mean(speech_mask))
    pitch = np.array([
        float(fs.mean()),
        float(fs.std()),
        float(np.percentile(fs, 95) - np.percentile(fs, 5)),
        speech_ratio,  # Feature 293: Pause/speech ratio
        float(np.percentile(r_aligned, 10)),
        float(np.percentile(r_aligned, 90)),
    ], dtype=np.float32)
    
    # 4. Gated feature concatenation
    vec = np.concatenate([
        _stats_gated(mfcc, speech_mask),      # 80
        _stats_gated(delta, speech_mask),     # 80
        _stats_gated(mel, speech_mask),       # 80 (Features 160-239: Mel mean 160-199, Mel std 200-239)
        _stats_gated(chroma, speech_mask),    # 24
        _stats_gated(contrast, speech_mask),  # 14
        _stats_gated(spectral, speech_mask),  # 12
        pitch,                                # 6
    ])
    
    return np.nan_to_num(vec.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)

