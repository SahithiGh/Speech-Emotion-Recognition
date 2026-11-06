"""Automatic Speaker Diarization module with Neural Speaker Embeddings.

Features:
- Primary: Pretrained WeSpeaker ResNet34-LM ONNX neural speaker embeddings (256-d r-vectors trained on VoxCeleb2).
- Automatic speaker counting (1, 2, 3, 4+ speakers) without arbitrary hardcoded limits.
- Emotion- and pitch-invariant voiceprint extraction (retains speaker identity despite emotional pitch shifts).
- Adaptive centroid-margin clustering with no arbitrary duration pruning.
- Retains legacy acoustic feature extractor for backwards compatibility and automated comparison.
"""
from typing import Dict, Any, List, Tuple, Optional
import os
import numpy as np
import librosa
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_distances

from . import config as C
from .errors import AudioError

# Cached ONNX inference session for WeSpeaker
_WESPEAKER_SESSION = None
_WESPEAKER_AVAILABLE = None


def _get_wespeaker_session():
    """Lazily load and cache the WeSpeaker ResNet34 ONNX inference session."""
    global _WESPEAKER_SESSION, _WESPEAKER_AVAILABLE
    if _WESPEAKER_AVAILABLE is False:
        return None
    if _WESPEAKER_SESSION is not None:
        return _WESPEAKER_SESSION

    model_path = getattr(C, "WESPEAKER_MODEL_PATH", C.ROOT / "models" / "wespeaker" / "voxceleb_resnet34_LM.onnx")
    if not os.path.exists(model_path):
        _WESPEAKER_AVAILABLE = False
        return None

    try:
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.inter_op_num_threads = 1
        so.intra_op_num_threads = 1
        _WESPEAKER_SESSION = ort.InferenceSession(str(model_path), sess_options=so, providers=["CPUExecutionProvider"])
        _WESPEAKER_AVAILABLE = True
        return _WESPEAKER_SESSION
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Could not initialize WeSpeaker ONNX session: %s", exc)
        _WESPEAKER_AVAILABLE = False
        return None


def _mel_scale(freq):
    import torch
    return 1127.0 * (1.0 + freq / 700.0).log()


def _inverse_mel_scale(mel):
    return 700.0 * ((mel / 1127.0).exp() - 1.0)


def _get_mel_banks(num_bins: int, window_length_padded: int, sample_freq: float, low_freq: float = 20.0, high_freq: float = 0.0):
    """Compute Kaldi-compliant mel filter banks."""
    import torch
    num_fft_bins = window_length_padded // 2
    nyquist = 0.5 * sample_freq
    if high_freq <= 0.0:
        high_freq += nyquist
    fft_bin_width = sample_freq / window_length_padded
    mel_low_freq = _mel_scale(torch.tensor(low_freq))
    mel_high_freq = _mel_scale(torch.tensor(high_freq))
    mel_freq_delta = (mel_high_freq - mel_low_freq) / (num_bins + 1)

    bin_idx = torch.arange(num_bins).unsqueeze(1)
    left_mel = mel_low_freq + bin_idx * mel_freq_delta
    center_mel = mel_low_freq + (bin_idx + 1.0) * mel_freq_delta
    right_mel = mel_low_freq + (bin_idx + 2.0) * mel_freq_delta

    center_freqs = _inverse_mel_scale(center_mel)
    mel = _mel_scale(fft_bin_width * torch.arange(num_fft_bins)).unsqueeze(0)

    up_slope = (mel - left_mel) / (center_mel - left_mel)
    down_slope = (right_mel - mel) / (right_mel - center_mel)
    bins = torch.max(torch.zeros(1), torch.min(up_slope, down_slope))
    return bins, center_freqs


def compute_kaldi_fbank_torch(
    waveform_np: np.ndarray,
    sample_rate: int = 16000,
    num_mel_bins: int = 80,
    frame_length: float = 25.0,
    frame_shift: float = 10.0,
) -> np.ndarray:
    """Compute 80-bin Kaldi filterbanks with Cepstral Mean Normalization (CMN) matching WeSpeaker."""
    import torch
    # Kaldi scales normalized audio [-1.0, 1.0] by 32768
    y = torch.from_numpy(waveform_np * 32768.0).float()
    if y.ndim == 1:
        y = y.unsqueeze(0)

    window_shift = int(sample_rate * frame_shift * 0.001)
    window_size = int(sample_rate * frame_length * 0.001)
    padded_window_size = 512

    # Strided framing (snip_edges=True)
    m = 1 + (y.shape[1] - window_size) // window_shift
    if m <= 0:
        pad_len = window_size - y.shape[1]
        y = torch.nn.functional.pad(y, (0, max(0, pad_len)))
        m = 1

    strided = y[0].as_strided((m, window_size), (window_shift, 1)).clone()

    # Subtract frame DC offset
    strided = strided - strided.mean(dim=1, keepdim=True)

    # Pre-emphasis (coefficient = 0.97)
    preemph = strided.clone()
    preemph[:, 1:] -= 0.97 * strided[:, :-1]
    preemph[:, 0] -= 0.97 * preemph[:, 0]

    # Hamming window
    window = torch.hamming_window(window_size, periodic=False)
    windowed = preemph * window
    padded = torch.nn.functional.pad(windowed, (0, padded_window_size - window_size))

    # Power spectrum via real FFT
    spectrum = torch.fft.rfft(padded).abs().pow(2.0)

    # Mel filterbank dot product
    mel_energies, _ = _get_mel_banks(num_mel_bins, padded_window_size, sample_rate, 20.0, 0.0)
    mel_energies = torch.nn.functional.pad(mel_energies, (0, 1), mode="constant", value=0)

    mel_energies = torch.mm(spectrum, mel_energies.T)
    mel_energies = torch.max(mel_energies, torch.tensor(1.1920929e-7)).log()

    # Cepstral Mean Normalization (CMN)
    mel_energies = mel_energies - mel_energies.mean(dim=0, keepdim=True)
    return mel_energies.unsqueeze(0).numpy()


def extract_wespeaker_embedding(y: np.ndarray, sr: int = 16000) -> Optional[np.ndarray]:
    """Extract a 256-dimensional unit-normalized speaker voiceprint using WeSpeaker ResNet34 ONNX."""
    sess = _get_wespeaker_session()
    if sess is None:
        return None

    if len(y) < 400:
        y = np.pad(y, (0, 400 - len(y)))

    try:
        feats = compute_kaldi_fbank_torch(y, sample_rate=sr)
        emb = sess.run(["embs"], {"feats": feats})[0][0]
        norm = np.linalg.norm(emb)
        if norm > 1e-8:
            emb = emb / norm
        return emb.astype(np.float32)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("WeSpeaker embedding extraction failed: %s", exc)
        return None


def extract_turn_acoustic_features_legacy(y: np.ndarray, sr: int = 16000) -> np.ndarray:
    """Legacy 70-d DSP feature extractor (retained for comparison & fallback)."""
    if len(y) < 256:
        return np.zeros(70, dtype=np.float32)

    if len(y) < 1024:
        y_proc = np.pad(y, (0, 1024 - len(y)), mode="reflect")
    else:
        y_proc = y

    try:
        f0, voiced_flag, _ = librosa.pyin(
            y_proc,
            fmin=65.0,
            fmax=500.0,
            sr=sr,
            frame_length=1024,
            hop_length=256,
        )
        if voiced_flag is not None and np.any(voiced_flag):
            f0_voiced = f0[voiced_flag & np.isfinite(f0)]
            if len(f0_voiced) > 3:
                f0_mean = float(np.mean(f0_voiced))
                f0_med = float(np.median(f0_voiced))
                f0_std = float(np.std(f0_voiced))
                f0_iqr = float(np.percentile(f0_voiced, 75) - np.percentile(f0_voiced, 25))
            else:
                f0_mean, f0_med, f0_std, f0_iqr = 150.0, 150.0, 20.0, 10.0
        else:
            f0_mean, f0_med, f0_std, f0_iqr = 150.0, 150.0, 20.0, 10.0
    except Exception:
        f0_mean, f0_med, f0_std, f0_iqr = 150.0, 150.0, 20.0, 10.0

    pitch_vec = np.array([
        (f0_mean - 150.0) / 100.0,
        (f0_med - 150.0) / 100.0,
        f0_std / 50.0,
        f0_iqr / 30.0,
    ], dtype=np.float32)

    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        mfcc_sub = mfcc[1:20]
        mfcc_std = np.std(mfcc_sub, axis=1) / 15.0
        d_mfcc = librosa.feature.delta(mfcc_sub)
        d_mean = np.mean(d_mfcc, axis=1) / 5.0
    except Exception:
        mfcc_std = np.zeros(19, dtype=np.float32)
        d_mean = np.zeros(19, dtype=np.float32)

    try:
        sc = (float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))) - 2000.0) / 1500.0
        sb = (float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))) - 2000.0) / 1500.0
        ro = (float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))) - 4000.0) / 2000.0
        contrast = np.mean(librosa.feature.spectral_contrast(y=y, sr=sr), axis=1) / 20.0
    except Exception:
        sc, sb, ro = 0.0, 0.0, 0.0
        contrast = np.zeros(7, dtype=np.float32)

    spec_vec = np.array([sc, sb, ro], dtype=np.float32)
    vec = np.concatenate([pitch_vec * 2.0, mfcc_std, d_mean, spec_vec * 1.2, contrast]).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 1e-7:
        vec = vec / norm
    return vec


def extract_turn_acoustic_features(y: np.ndarray, sr: int = 16000) -> np.ndarray:
    """Primary speaker embedding extractor. Uses WeSpeaker ONNX, with legacy fallback."""
    emb = extract_wespeaker_embedding(y, sr=sr)
    if emb is not None:
        return emb
    return extract_turn_acoustic_features_legacy(y, sr=sr)


def detect_speech_activity_turns(
    y: np.ndarray,
    sr: int = 16000,
    min_speech_duration: float = 0.35,
    max_turn_duration: float = 4.0,
) -> List[Tuple[float, float]]:
    """Split audio into active speech turns using frame energy with clean non-overlapping segmenting."""
    duration = len(y) / sr
    if duration < min_speech_duration:
        return [(0.0, round(duration, 3))]

    frame_len = 512
    hop_len = 160   # 10 ms hop
    frame_rms = librosa.feature.rms(y=y, frame_length=frame_len, hop_length=hop_len)[0]
    thresh = max(0.003, float(np.percentile(frame_rms, 25))) * 1.3

    is_speech = frame_rms > thresh
    # Smooth activity with morphological pause closing (0.35s pause)
    min_pause_frames = int(0.35 * sr / hop_len)
    smoothed = np.copy(is_speech)
    pause_len = 0
    for i in range(len(smoothed)):
        if not smoothed[i]:
            pause_len += 1
        else:
            if 0 < pause_len <= min_pause_frames:
                smoothed[i - pause_len:i] = True
            pause_len = 0

    # Extract continuous speech intervals
    intervals = []
    in_speech = False
    start_frame = 0
    for i, flag in enumerate(smoothed):
        if flag and not in_speech:
            in_speech = True
            start_frame = i
        elif not flag and in_speech:
            in_speech = False
            t_start = round(start_frame * hop_len / sr, 3)
            t_end = round(i * hop_len / sr, 3)
            if t_end - t_start >= min_speech_duration:
                intervals.append((t_start, t_end))

    if in_speech:
        t_start = round(start_frame * hop_len / sr, 3)
        t_end = round(len(smoothed) * hop_len / sr, 3)
        if t_end - t_start >= min_speech_duration:
            intervals.append((t_start, t_end))

    if not intervals:
        intervals = [(0.0, round(duration, 3))]

    # Break long continuous utterances into contiguous sub-turns
    final_turns = []
    for (s, e) in intervals:
        seg_dur = e - s
        if seg_dur <= max_turn_duration:
            final_turns.append((s, e))
        else:
            cur = s
            while cur < e - 0.5:
                next_end = min(cur + max_turn_duration, e)
                if e - next_end < 1.0:
                    next_end = e
                final_turns.append((round(cur, 3), round(next_end, 3)))
                cur = next_end

    # Filter out empty or pure-breathing trailing segments (RMS < 0.012 or peak < 0.035)
    filtered_turns = []
    for (s, e) in final_turns:
        st_samp = int(round(s * sr))
        et_samp = min(len(y), int(round(e * sr)))
        chunk = y[st_samp:et_samp]
        if len(chunk) < int(min_speech_duration * sr):
            continue
        c_rms = float(np.sqrt(np.mean(chunk ** 2)))
        c_peak = float(np.max(np.abs(chunk)))
        if c_rms >= 0.010 and c_peak >= 0.030:
            filtered_turns.append((s, e))

    if not filtered_turns:
        return [(0.0, round(duration, 3))]
    return filtered_turns


def perform_diarization(
    y: np.ndarray,
    sr: int = 16000,
    transcript_segments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute complete automatic speaker diarization with WeSpeaker neural embeddings."""
    duration = float(len(y) / sr)
    if duration <= 0:
        return {
            "speaker_count": 0,
            "speakers": [],
            "turns": [],
            "total_speech_duration": 0.0,
            "total_recording_duration": 0.0,
        }

    # 1. Segment audio into speech turns
    turns_planned = detect_speech_activity_turns(y, sr=sr, min_speech_duration=0.35)
    if (not turns_planned or len(turns_planned) <= 1) and transcript_segments and len(transcript_segments) > 1:
        ts_turns = []
        for s in transcript_segments:
            st = float(s.get("start", 0.0))
            et = float(s.get("end", duration))
            if et - st >= 0.35:
                ts_turns.append((round(st, 3), round(et, 3)))
        if len(ts_turns) > len(turns_planned):
            turns_planned = ts_turns

    # 2. Extract vocal embeddings for each turn
    feature_rows = []
    turn_slices = []
    for (t_start, t_end) in turns_planned:
        start_samp = int(round(t_start * sr))
        end_samp = min(len(y), int(round(t_end * sr)))
        chunk = y[start_samp:end_samp]
        if len(chunk) < 256:
            continue
        feat = extract_turn_acoustic_features(chunk, sr=sr)
        feature_rows.append(feat)
        turn_slices.append((t_start, t_end))

    N = len(feature_rows)
    if N == 0:
        return {
            "speaker_count": 1,
            "speakers": [{
                "speaker_id": "spk_A",
                "name": "Speaker A",
                "label": "Speaker A",
                "speaking_seconds": round(duration, 2),
                "speaking_percentage": 100.0,
                "segment_count": 1,
            }],
            "turns": [{
                "speaker_id": "spk_A",
                "speaker_name": "Speaker A",
                "start": 0.0,
                "end": round(duration, 3),
                "confidence": 0.95,
                "is_overlap": False,
                "is_uncertain": False,
            }],
            "total_speech_duration": round(duration, 2),
            "total_recording_duration": round(duration, 2),
        }

    X = np.stack(feature_rows)
    is_neural = (X.shape[1] == 256)
    dist_matrix = cosine_distances(X)
    max_dist = float(np.max(dist_matrix))

    # 3. Determine optimal number of speakers k
    if is_neural:
        # Neural embeddings (256-d WeSpeaker):
        # Intra-speaker variation is < 0.45; inter-speaker distances are >= 0.55
        if N == 1 or max_dist < 0.45:
            labels = np.zeros(N, dtype=int)
            best_k = 1
        else:
            CLUSTER_THRESHOLD = 0.65
            clusterer = AgglomerativeClustering(
                distance_threshold=CLUSTER_THRESHOLD,
                n_clusters=None,
                metric="precomputed",
                linkage="average",
            )
            labels = clusterer.fit_predict(dist_matrix)

            # Centroid merge pass: if centroids of two clusters are closer than 0.48, merge them
            unique_lbls = sorted(list(set(labels)))
            if len(unique_lbls) > 1:
                centroids = {}
                for c in unique_lbls:
                    c_idx = (labels == c)
                    c_mean = np.mean(X[c_idx], axis=0)
                    centroids[c] = c_mean / (np.linalg.norm(c_mean) + 1e-7)

                merged_map = {c: c for c in unique_lbls}
                for i in range(len(unique_lbls)):
                    for j in range(i + 1, len(unique_lbls)):
                        c1, c2 = unique_lbls[i], unique_lbls[j]
                        if merged_map[c1] != merged_map[c2]:
                            c_dist = float(cosine_distances([centroids[c1]], [centroids[c2]])[0, 0])
                            if c_dist < 0.48:
                                merged_map[c2] = merged_map[c1]

                labels = np.array([merged_map[l] for l in labels])
            best_k = len(set(labels))
    else:
        # Fallback for legacy 70-d DSP features if ONNX is unavailable
        if N == 1 or max_dist < 0.080:
            labels = np.zeros(N, dtype=int)
            best_k = 1
        else:
            clusterer = AgglomerativeClustering(
                distance_threshold=0.100,
                n_clusters=None,
                metric="precomputed",
                linkage="average",
            )
            labels = clusterer.fit_predict(dist_matrix)
            best_k = len(set(labels))

    # 4. Canonical chronological speaker mapping:
    # First speaker to talk is 'Speaker A' (spk_A), second is 'Speaker B' (spk_B), etc.
    cluster_order = []
    for lbl in labels:
        if lbl not in cluster_order:
            cluster_order.append(lbl)

    spk_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    cluster_to_spk = {}
    for i, c_idx in enumerate(cluster_order):
        letter = spk_letters[i % len(spk_letters)]
        cluster_to_spk[c_idx] = {
            "id": f"spk_{letter}",
            "name": f"Speaker {letter}",
            "letter": letter,
        }

    # Compute centroids per cluster for confidence calculation
    centroids = {}
    for c_idx in cluster_order:
        c_feats = X[labels == c_idx]
        c_mean = np.mean(c_feats, axis=0)
        c_norm = np.linalg.norm(c_mean)
        centroids[c_idx] = c_mean / (c_norm + 1e-7)

    # 5. Build speech turns
    turns = []
    for i, (t_start, t_end) in enumerate(turn_slices):
        c_idx = labels[i]
        spk_info = cluster_to_spk[c_idx]

        # Compute confidence based on similarity to cluster centroid vs other centroids
        v = X[i]
        sim_own = float(np.dot(v, centroids[c_idx]))
        other_sims = [float(np.dot(v, centroids[other_c])) for other_c in cluster_order if other_c != c_idx]
        second_sim = max(other_sims) if other_sims else 0.0

        margin = max(0.0, sim_own - second_sim)
        if is_neural:
            conf = round(float(np.clip(0.70 + margin * 0.70, 0.65, 0.99)), 2)
            is_uncertain = bool(margin < 0.04 and best_k > 1)
        else:
            conf = round(float(np.clip(0.65 + margin * 5.0, 0.65, 0.98)), 2)
            is_uncertain = bool(conf < 0.55 and best_k > 1)

        # Overlap check: speech frames in this turn with elevated energy variance
        chunk = y[int(t_start * sr):int(t_end * sr)]
        is_overlap = False
        if len(chunk) > 1024 and best_k > 1:
            frame_rms = librosa.feature.rms(y=chunk, frame_length=512, hop_length=160)[0]
            if float(np.std(frame_rms)) > 0.04 and float(np.max(frame_rms)) > 0.15:
                is_overlap = True

        turns.append({
            "turn_index": i,
            "speaker_id": spk_info["id"],
            "speaker_name": spk_info["name"] if not is_uncertain else "Unknown Speaker",
            "start": t_start,
            "end": t_end,
            "confidence": conf,
            "is_overlap": is_overlap,
            "is_uncertain": is_uncertain,
        })

    # 6. Aggregate speaker statistics
    total_speech_seconds = sum(t["end"] - t["start"] for t in turns)
    if total_speech_seconds <= 0:
        total_speech_seconds = duration

    speakers_dict: Dict[str, Dict[str, Any]] = {}
    for c_idx in cluster_order:
        spk_info = cluster_to_spk[c_idx]
        spk_turns = [t for t in turns if t["speaker_id"] == spk_info["id"]]
        spk_dur = sum(t["end"] - t["start"] for t in spk_turns)
        pct = round((spk_dur / total_speech_seconds) * 100.0, 1)

        speakers_dict[spk_info["id"]] = {
            "speaker_id": spk_info["id"],
            "name": spk_info["name"],
            "label": spk_info["name"],
            "speaking_seconds": round(spk_dur, 2),
            "speaking_percentage": pct,
            "segment_count": len(spk_turns),
        }

    speakers_list = list(speakers_dict.values())

    return {
        "speaker_count": len(speakers_list),
        "speakers": speakers_list,
        "turns": turns,
        "total_speech_duration": round(total_speech_seconds, 2),
        "total_recording_duration": round(duration, 2),
    }
