"""Conversation Analysis module.

Integrates:
1. Automatic speaker diarization (1, 2, 3, 4+ speakers).
2. Speaker-wise emotion recognition across the 6 emotion classes.
3. Dual emotion timelines: Emotion Tracks (default) & Emotion Journey (alternative).
4. Combined conversation timeline with multi-speaker lanes and overlap detection.
5. Combined chronological transcript with speaker attribution.
6. Advanced voice analysis (pitch F0, vocal intensity/energy).
"""
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import librosa

from . import config as C
from . import predict
from .diarization import perform_diarization
from .voice_analysis import extract_advanced_voice_analysis
from .audio import extract_features


EMOTION_CLASSES = ["happy", "sad", "angry", "fear", "disgust", "neutral"]


def analyze_speaker_emotion_for_chunk(
    chunk: np.ndarray,
    pipeline,
    is_e2v: bool = True,
    sr: int = 16000,
) -> Tuple[str, float, Dict[str, float]]:
    """Classify emotion on a speech chunk with the production model."""
    if len(chunk) < int(0.35 * sr):
        # Default neutral for tiny fragments
        return "neutral", 0.50, {c: 1.0 / 6 for c in EMOTION_CLASSES}

    pk = float(np.max(np.abs(chunk)))
    if pk < 0.005:
        return "neutral", 0.50, {c: 1.0 / 6 for c in EMOTION_CLASSES}

    norm_chunk = (chunk / pk) * 0.90

    try:
        if is_e2v:
            from .e2v_extractor import extract_e2v_embedding
            emb = extract_e2v_embedding(norm_chunk)
            feats = np.asarray(emb, dtype=np.float32).reshape(1, -1)
        else:
            feats = extract_features(norm_chunk).reshape(1, -1)

        probs = pipeline.predict_proba(feats)[0]
        classes = list(pipeline.classes_)
        scores = {c: round(float(p), 4) for c, p in zip(classes, probs)}
        top_emo = max(scores, key=scores.get)
        top_conf = scores[top_emo]
        return top_emo, top_conf, scores
    except Exception:
        return "neutral", 0.50, {c: 1.0 / 6 for c in EMOTION_CLASSES}


def build_emotion_tracks_and_journey(
    turns: List[Dict[str, Any]],
    duration: float,
) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """Construct Emotion Tracks (6 separate tracks) and Emotion Journey (dominant blocks)."""
    # 1. Emotion Tracks: generate time samples at 0.5s intervals across full duration
    track_times = np.arange(0.0, max(duration, 0.5), 0.5)
    tracks: Dict[str, List[Dict[str, Any]]] = {c: [] for c in EMOTION_CLASSES}

    for t in track_times:
        t_sec = round(float(t), 2)
        # Find active turns covering this moment
        covering = [turn for turn in turns if turn["start"] <= t_sec <= turn["end"]]
        if covering and covering[0].get("scores"):
            scores = covering[0]["scores"]
        else:
            # Baseline neutral distribution when silent or between turns
            scores = {c: 0.05 for c in EMOTION_CLASSES}
            scores["neutral"] = 0.75

        for c in EMOTION_CLASSES:
            tracks[c].append({
                "time": t_sec,
                "probability": round(float(scores.get(c, 0.0)), 3),
            })

    # 2. Emotion Journey: sequence of contiguous dominant emotion intervals
    journey = []
    if turns:
        sorted_turns = sorted(turns, key=lambda x: x["start"])
        cur_start = 0.0
        cur_emo = sorted_turns[0].get("emotion", "neutral")
        cur_scores = sorted_turns[0].get("scores", {c: 1.0 / 6 for c in EMOTION_CLASSES})
        cur_conf = sorted_turns[0].get("confidence", 0.70)

        for turn in sorted_turns:
            emo = turn.get("emotion", "neutral")
            if emo != cur_emo and (turn["start"] - cur_start >= 0.5):
                journey.append({
                    "start": round(cur_start, 2),
                    "end": round(turn["start"], 2),
                    "emotion": cur_emo,
                    "confidence": round(cur_conf, 2),
                    "scores": cur_scores,
                })
                cur_start = turn["start"]
                cur_emo = emo
                cur_scores = turn.get("scores", cur_scores)
                cur_conf = turn.get("confidence", cur_conf)

        journey.append({
            "start": round(cur_start, 2),
            "end": round(duration, 2),
            "emotion": cur_emo,
            "confidence": round(cur_conf, 2),
            "scores": cur_scores,
        })
    else:
        journey.append({
            "start": 0.0,
            "end": round(duration, 2),
            "emotion": "neutral",
            "confidence": 0.80,
            "scores": {c: (0.8 if c == "neutral" else 0.04) for c in EMOTION_CLASSES},
        })

    return tracks, journey


def build_combined_chronological_transcript(
    transcript_segments: Optional[List[Dict[str, Any]]],
    turns: List[Dict[str, Any]],
    speaker_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Align transcription segments with diarized speaker turns into a chronological transcript."""
    if not transcript_segments:
        return []

    combined_transcript = []
    for s_idx, seg in enumerate(transcript_segments):
        s_start = float(seg.get("start", 0.0))
        s_end = float(seg.get("end", 0.0))
        text = (seg.get("text") or "").strip()

        # Find best matching speaker turn based on temporal overlap
        best_spk_id = "spk_A"
        best_spk_name = speaker_map.get("spk_A", "Speaker A")
        best_overlap = -1.0
        turn_emotion = None
        turn_scores = None

        for turn in turns:
            overlap_start = max(s_start, turn["start"])
            overlap_end = min(s_end, turn["end"])
            overlap_dur = overlap_end - overlap_start
            if overlap_dur > best_overlap:
                best_overlap = overlap_dur
                best_spk_id = turn["speaker_id"]
                best_spk_name = speaker_map.get(turn["speaker_id"], turn["speaker_name"])
                turn_emotion = turn.get("emotion")
                turn_scores = turn.get("scores")

        combined_transcript.append({
            "index": s_idx,
            "speaker_id": best_spk_id,
            "speaker_name": best_spk_name,
            "start": round(s_start, 2),
            "end": round(s_end, 2),
            "text": text,
            "words": seg.get("words", []),
            "emotion": turn_emotion or "neutral",
            "scores": turn_scores,
            "confidence": round(float(seg.get("probability", 0.90)), 2),
        })

    return combined_transcript


def process_full_conversation_analysis(
    y: np.ndarray,
    sr: int = 16000,
    transcription_result: Optional[Dict[str, Any]] = None,
    user_speaker_renames: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Execute complete unified conversation analysis.
    
    Integrates:
    - Diarization (1 to 4+ speakers)
    - Speaker-wise emotion recognition
    - Multi-speaker timeline & overlap detection
    - Emotion Tracks (default) & Emotion Journey (alternative)
    - Combined chronological transcript
    - Advanced voice analysis (pitch & vocal energy)
    """
    duration = round(float(len(y) / sr), 3)
    user_renames = user_speaker_renames or {}

    # 1. Run Diarization
    t_segs = transcription_result.get("segments") if transcription_result else None
    diar_res = perform_diarization(y, sr=sr, transcript_segments=t_segs)

    # 2. Setup production emotion model pipeline
    bundle = predict.get_bundle()
    pipeline = bundle["pipeline"]
    scaler = getattr(pipeline, "named_steps", {}).get("scale") or getattr(pipeline, "named_steps", {}).get("scaler")
    n_feats = scaler.mean_.shape[0] if scaler is not None and hasattr(scaler, "mean_") else 296
    is_e2v = (n_feats == 768)

    # 3. Speaker-wise emotion recognition per turn
    annotated_turns = []
    spk_emotions: Dict[str, List[str]] = {}
    spk_scores: Dict[str, List[Dict[str, float]]] = {}

    for turn in diar_res["turns"]:
        st_samp = int(round(turn["start"] * sr))
        et_samp = min(len(y), int(round(turn["end"] * sr)))
        chunk = y[st_samp:et_samp]

        top_emo, top_conf, scores = analyze_speaker_emotion_for_chunk(
            chunk, pipeline=pipeline, is_e2v=is_e2v, sr=sr
        )

        spk_id = turn["speaker_id"]
        # Apply user renames if provided
        disp_name = user_renames.get(spk_id, turn["speaker_name"])

        turn_item = {
            **turn,
            "speaker_name": disp_name,
            "emotion": top_emo,
            "top_score": top_conf,
            "scores": scores,
        }
        annotated_turns.append(turn_item)
        spk_emotions.setdefault(spk_id, []).append(top_emo)
        spk_scores.setdefault(spk_id, []).append(scores)

    # 4. Build Emotion Tracks (default) and Emotion Journey (alternative)
    emotion_tracks, emotion_journey = build_emotion_tracks_and_journey(annotated_turns, duration=duration)

    # 5. Build Advanced Voice Analysis (waveform, pitch F0, vocal energy)
    voice_analysis_data = extract_advanced_voice_analysis(y, sr=sr, speaker_turns=annotated_turns)

    # 6. Aggregate each speaker's profile with emotion distribution and voice metrics
    speaker_map = {spk["speaker_id"]: user_renames.get(spk["speaker_id"], spk["name"]) for spk in diar_res["speakers"]}
    enhanced_speakers = []

    for spk in diar_res["speakers"]:
        spk_id = spk["speaker_id"]
        disp_name = speaker_map.get(spk_id, spk["name"])
        emos = spk_emotions.get(spk_id, [])
        scores_list = spk_scores.get(spk_id, [])

        # Calculate emotion distribution percentages
        distribution: Dict[str, float] = {c: 0.0 for c in EMOTION_CLASSES}
        if emos:
            for e in emos:
                distribution[e] = distribution.get(e, 0.0) + 1.0
            for c in EMOTION_CLASSES:
                distribution[c] = round((distribution[c] / len(emos)) * 100.0, 1)
            dominant_emo = max(distribution, key=distribution.get)
        else:
            distribution["neutral"] = 100.0
            dominant_emo = "neutral"

        # Mean confidence
        mean_conf = round(float(np.mean([max(s.values()) for s in scores_list])) if scores_list else 0.75, 2)

        # Speaker voice metrics
        spk_voice = voice_analysis_data.get("speaker_metrics", {}).get(spk_id, {})

        enhanced_speakers.append({
            "speaker_id": spk_id,
            "name": disp_name,
            "label": disp_name,
            "speaking_seconds": spk["speaking_seconds"],
            "speaking_percentage": spk["speaking_percentage"],
            "segment_count": spk["segment_count"],
            "dominant_emotion": dominant_emo,
            "confidence": mean_conf,
            "emotion_distribution": distribution,
            "voice_metrics": spk_voice,
        })

    # 7. Build Combined Chronological Transcript
    raw_transcript_segments = transcription_result.get("segments") if transcription_result else None
    combined_transcript = build_combined_chronological_transcript(
        transcript_segments=raw_transcript_segments,
        turns=annotated_turns,
        speaker_map=speaker_map,
    )

    return {
        "duration": duration,
        "speaker_count": len(enhanced_speakers),
        "speakers": enhanced_speakers,
        "conversation_timeline": annotated_turns,
        "emotion_tracks": emotion_tracks,
        "emotion_journey": emotion_journey,
        "combined_transcript": combined_transcript,
        "voice_analysis": voice_analysis_data,
        "disclaimer": "Predictions represent physical acoustic model outputs. Speaker identification and vocal emotion estimates are recording-specific and do not establish confirmed psychological inner truth.",
    }
