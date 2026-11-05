"""FastAPI server. Start with:  python -m uvicorn app.main:app --port 8000

API contract (JSON):
  GET  /api/health        -> {status, model_ready}            application availability and model readiness are separate
  GET  /api/config        -> limits and supported formats     the website reads its limits from here
  GET  /api/model/status  -> {trained, state, reason, ...}
  GET  /api/model/info    -> model information built from the real artifact and evaluation
  GET  /api/metrics       -> saved evaluation report, or {trained: false}
  POST /api/spectrogram   -> mel spectrogram of the audio (no model needed)
  POST /api/timeline      -> segment-level model results (form: window_s, hop_s)
  GET  /api/transcription/status, POST /api/transcribe -> optional speech-to-text; 503 when no engine is configured
  POST /api/predict       -> multipart field "file"; 200 result, 413 too large, 422 bad audio, 503 model unavailable, 504 timeout
Errors use {"detail": {"code", "message"}}. Audio is never written to logs.
"""
import asyncio
import collections
import logging
import os
import time
import base64
import io
import uuid
import secrets
import numpy as np
import soundfile as sf
import librosa

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, FileResponse

from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from . import config as C
from . import predict
from . import transcription
from . import consistency
from . import db
from .conversation_analysis import process_full_conversation_analysis
from .export import generate_pdf_report, generate_csv_export
from .audio import load_raw_signal
from .errors import AudioError, ModelNotTrainedError
from .spectrogram import compute_spectrogram
from .timeline import analyse_timeline
from .info import model_info
from .languages import LANGUAGES
from .modelio import load_metrics

log = logging.getLogger("ser")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# Extra allowed website origins for a custom domain: SER_CORS_ORIGINS="https://example.org,https://www.example.org"
ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] + [o.strip() for o in os.environ.get("SER_CORS_ORIGINS", "").split(",") if o.strip()]

_slots = asyncio.Semaphore(C.MAX_CONCURRENT_ANALYSES)
_hits: dict = collections.defaultdict(collections.deque)
HEAVY = ("/api/predict", "/api/timeline", "/api/spectrogram", "/api/transcribe")

app = FastAPI(title="Speech Emotion Recognition API")


@app.on_event("startup")
def startup_checks():
    db.init_db()
    os.environ.setdefault("SER_TRANSCRIBER", "faster-whisper")
    for problem in C.validate_config():
        log.error("configuration problem: %s", problem)
    log.info("model state at startup: %s", predict.model_state()["state"])   # also loads the model once, so the first request is fast
    transcription.prewarm()
    is_e2v = getattr(C, "SER_MODEL_PROFILE", "production") in ("production", "default", "emotion2vec_experimental", "e2v", "emotion2vec", "experimental") and getattr(C, "SER_MODEL_PROFILE", "production") not in ("staging", "candidate_option2", "svm_rollback", "svm", "baseline")
    if is_e2v:
        try:
            from .e2v_extractor import get_bridge
            get_bridge().warmup()
        except Exception as exc:
            log.warning("emotion2vec worker prewarm skipped: %s", exc)


@app.on_event("shutdown")
def shutdown_event():
    try:
        from .e2v_extractor import shutdown_bridge
        shutdown_bridge()
    except Exception:
        pass
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["*"])


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    """Optional per-client limit for the CPU-heavy endpoints (SER_RATE_LIMIT_PER_MIN, off by default)."""
    if C.RATE_LIMIT_PER_MINUTE and request.method == "POST" and request.url.path in HEAVY:
        q, now = _hits[request.client.host if request.client else "unknown"], time.monotonic()
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= C.RATE_LIMIT_PER_MINUTE:
            return JSONResponse(status_code=429, content={"detail": {"code": "rate_limited", "message": "Too many requests. Please wait a minute and try again."}})
        q.append(now)
    return await call_next(request)


@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    log.info("%s %s -> %s in %.0f ms", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)  # no query, body or audio
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "model_ready": predict.model_is_trained()}


@app.get("/api/config")
def config():
    return {"max_upload_mb": C.MAX_UPLOAD_BYTES / (1024 * 1024), "max_audio_seconds": C.MAX_INPUT_SECONDS, "min_audio_seconds": C.MIN_SECONDS,
            "max_record_seconds": C.MAX_RECORD_SECONDS, "analysed_seconds": C.MAX_INPUT_SECONDS,
            "formats": ["WAV", "MP3", "OGG", "FLAC", "M4A", "MP4 (video audio track)"], "sample_rate": C.SAMPLE_RATE, "languages": LANGUAGES,
            "noise_reduction": {"enabled": True, "method": "spectral_gating"},
            "timeline": {"default_window": C.TIMELINE_DEFAULT_WINDOW, "default_step": C.TIMELINE_DEFAULT_HOP, "min_window": C.TIMELINE_MIN_WINDOW,
                         "max_window": C.TIMELINE_MAX_WINDOW, "min_step": C.TIMELINE_MIN_HOP, "max_segments": C.TIMELINE_MAX_SEGMENTS}}


@app.get("/api/model/status")
def model_status():
    m = load_metrics() or {}
    st = predict.model_state()
    is_e2v = getattr(C, "SER_MODEL_PROFILE", "production") in ("production", "default", "emotion2vec_experimental", "e2v", "emotion2vec", "experimental") and getattr(C, "SER_MODEL_PROFILE", "production") not in ("staging", "candidate_option2", "svm_rollback", "svm", "baseline")
    return {"trained": st["state"] == "ready", "state": st["state"], "reason": st["reason"], "emotions": C.EMOTIONS,
            "model_name": m.get("model_name"), "generated_at": m.get("generated_at"),
            "dataset_verification": (m.get("dataset_verification") or {}).get("mode"),
            "profile": getattr(C, "SER_MODEL_PROFILE", "production"),
            "ood_safeguard": getattr(C, "OOD_SAFEGUARD_ENABLED", True),
            "ood_threshold": float(getattr(C, "E2V_OOD_Z_THRESHOLD", 3.83)) if is_e2v else getattr(C, "OOD_Z_THRESHOLD", 10.12)}


@app.get("/api/model/info")
def info():
    return model_info()


@app.get("/api/metrics")
def metrics():
    data = load_metrics()
    if data is None or not data.get("trained") or not predict.model_is_trained():
        return {"trained": False, "message": "Model not trained yet"}
    return data


async def _read(file: UploadFile) -> bytes:
    data = await file.read(C.MAX_UPLOAD_BYTES + 1)
    if len(data) > C.MAX_UPLOAD_BYTES:
        raise HTTPException(413, {"code": "too_large", "message": f"File is too large. Maximum size is {C.MAX_UPLOAD_BYTES / (1024 * 1024):g} MB."})
    return data


async def _guarded(func, *args):
    """Runs CPU work off the event loop with a timeout and maps errors to the documented responses."""
    try:
        async with _slots:      # at most MAX_CONCURRENT_ANALYSES heavy jobs run at once; others wait their turn
            return await asyncio.wait_for(run_in_threadpool(func, *args), C.PREDICT_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise HTTPException(504, {"code": "timeout", "message": "The analysis took too long. Try a shorter clip."})
    except ModelNotTrainedError as exc:
        raise HTTPException(503, {"code": "model_" + predict.classify(str(exc)), "message": f"Analysis is unavailable: {exc}"})
    except AudioError as exc:
        status = 503 if exc.code == "transcription_unavailable" else 422
        raise HTTPException(status, {"code": exc.code, "message": str(exc)})
    except HTTPException:
        raise
    except Exception as exc:
        log.error("request failed: %s: %s", type(exc).__name__, exc, exc_info=True)
        raise HTTPException(500, {"code": "server_error", "message": "Unexpected error while analyzing the audio."})


# --- Pydantic Schemas ---
class RegisterRequest(BaseModel):
    email: str
    full_name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class UpdateProfileRequest(BaseModel):
    full_name: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

class SaveAnalysisRequest(BaseModel):
    original_filename: str
    predicted_emotion: str
    confidence: float
    margin: float
    scores: Dict[str, float]
    analyzed_seconds: float
    is_uncertain: bool = False
    transcript: Optional[str] = None
    transcript_segments: Optional[List[Dict[str, Any]]] = None
    consistency_status: Optional[str] = None
    consistency_explanation: Optional[str] = None
    notes: Optional[List[str]] = None
    model_name: Optional[str] = None
    model_id: Optional[str] = None
    feature_version: Optional[int] = None
    speakers: Optional[List[Dict[str, Any]]] = None
    conversation_timeline: Optional[List[Dict[str, Any]]] = None
    emotion_tracks: Optional[Dict[str, Any]] = None
    emotion_journey: Optional[List[Dict[str, Any]]] = None
    voice_analysis: Optional[Dict[str, Any]] = None
    audio_file_path: Optional[str] = None
    audio_id: Optional[str] = None
    audio_base64: Optional[str] = None

class SpeakerRenameRequest(BaseModel):
    speaker_id: str
    name: str

class ExportReportRequest(BaseModel):
    analysis: Dict[str, Any]

class RecalculateConsistencyRequest(BaseModel):
    transcript: str
    predicted_emotion: str
    confidence: float = 0.0
    is_uncertain: bool = False


def _get_current_user(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization") or ""
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.query_params:
        token = request.query_params.get("token", "").strip()
    if not token:
        raise HTTPException(401, {"code": "unauthorized", "message": "Authentication required. Please sign in."})
    user = db.get_user_by_session(token)
    if not user:
        raise HTTPException(401, {"code": "invalid_session", "message": "Your session has expired or is invalid. Please sign in again."})
    return user


# In-memory buffer for HTTP byte-range preview streaming
_audio_cache: dict[str, tuple[float, bytes, str]] = {}

def _cache_audio(wav_bytes: bytes, mime_type: str = "audio/wav") -> str:
    audio_id = str(uuid.uuid4())
    now = time.time()
    expired = [k for k, v in _audio_cache.items() if now - v[0] > 1800]
    for k in expired:
        _audio_cache.pop(k, None)
    _audio_cache[audio_id] = (now, wav_bytes, mime_type)
    return audio_id

def _signal_to_wav_bytes(y_signal: np.ndarray, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    clipped = np.clip(y_signal, -1.0, 1.0).astype(np.float32)
    sf.write(buf, clipped, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()

# Background analysis job registry
_jobs: Dict[str, Dict[str, Any]] = {}

def _predict_and_enrich(data: bytes, progress_cb=None) -> dict:
    if progress_cb:
        progress_cb("audio_extraction", "Validating and extracting audio format...", 15)

    try:
        pred = predict.predict_bytes(data, return_signal=True)
    except TypeError:
        pred = predict.predict_bytes(data)

    if not isinstance(pred, dict):
        return pred

    raw_y = pred.pop("_raw_y", None)
    proc_y = pred.pop("_proc_y", None)
    proc_sr = pred.pop("_sr", C.SAMPLE_RATE)

    if progress_cb:
        progress_cb("quality_assessment", "Assessing audio quality & background noise...", 30)

    # Maintain clearly separated audio references:
    # 1. Original audio (extracted audio track for video/audio)
    # 2. Processed audio (denoised audio track if noise reduction was applied)
    audio_playback = {
        "original_audio_url": None,
        "processed_audio_url": None,
        "has_processed": False,
        "stream_url": None,
    }
    try:
        if raw_y is not None:
            raw_wav = _signal_to_wav_bytes(raw_y, proc_sr)
            audio_playback["original_audio_url"] = f"data:audio/wav;base64,{base64.b64encode(raw_wav).decode('ascii')}"
            audio_id = _cache_audio(raw_wav, "audio/wav")
            audio_playback["stream_url"] = f"/api/audio/preview/{audio_id}"
            audio_playback["audio_id"] = audio_id
        if proc_y is not None and pred.get("noise_reduction", {}).get("applied"):
            proc_wav = _signal_to_wav_bytes(proc_y, proc_sr)
            audio_playback["processed_audio_url"] = f"data:audio/wav;base64,{base64.b64encode(proc_wav).decode('ascii')}"
            audio_playback["has_processed"] = True
    except Exception as audio_err:
        log.warning("Could not generate audio playback preview: %s", audio_err)

    pred["audio_playback"] = audio_playback

    # If audio quality check rejected the recording, do not run downstream transcription or consistency
    if not pred.get("prediction_accepted", True):
        pred["transcription"] = None
        pred["consistency"] = None
        pred["speakers"] = []
        pred["conversation_timeline"] = []
        pred["emotion_tracks"] = {}
        pred["emotion_journey"] = []
        pred["voice_analysis"] = {}
        pred["speaker_count"] = 0
        if progress_cb:
            progress_cb("complete", "Analysis complete", 100)
        return pred

    if progress_cb:
        progress_cb("transcription", "Transcribing speech and detecting language...", 65)

    trans_res = None
    try:
        if proc_y is not None:
            if proc_sr != C.SAMPLE_RATE:
                whisper_signal = librosa.resample(proc_y, orig_sr=proc_sr, target_sr=C.SAMPLE_RATE)
            else:
                whisper_signal = proc_y
        else:
            whisper_signal = load_raw_signal(data)

        st = transcription.status()
        if st["available"]:
            trans_res = transcription.transcribe(whisper_signal)
        else:
            trans_res = {"available": False, "status": "unavailable", "reason": st["reason"], "text": None}
    except Exception as exc:
        log.warning("Transcription stage skipped/failed: %s", exc)
        trans_res = {"available": False, "status": "failed", "reason": str(exc), "text": None}
    
    pred["transcription"] = trans_res

    if trans_res and trans_res.get("case") == "B":
        lang_name = trans_res.get("language_name", "another language")
        pred["consistency"] = {
            "status": "inconclusive",
            "display_label": "Cross-Modal Evaluation Unavailable",
            "explanation": f"Spoken speech was identified as {lang_name}. Lexical affect comparison is available for English transcripts only; acoustic vocal emotion is evaluated independently.",
            "text_affect": {"polarity": "unknown", "detected_emotions": [], "cues": []},
        }
    elif trans_res and trans_res.get("case") == "C" and not trans_res.get("no_speech"):
        pred["consistency"] = {
            "status": "inconclusive",
            "display_label": "Cross-Modal Evaluation Unavailable",
            "explanation": "Spoken language could not be confidently identified. Acoustic vocal emotion is evaluated independently.",
            "text_affect": {"polarity": "unknown", "detected_emotions": [], "cues": []},
        }
    else:
        transcript_text = trans_res.get("text") if trans_res else None
        pred["consistency"] = consistency.analyze_cross_modal_consistency(
            transcript=transcript_text,
            predicted_emotion=pred.get("emotion"),
            confidence=pred.get("confidence", 0.0),
            is_uncertain=pred.get("uncertain", False),
        )

    if progress_cb:
        progress_cb("speaker_diarization", "Diarizing speakers and segmenting conversational turns...", 80)

    try:
        conv_signal = proc_y if proc_y is not None else whisper_signal
        conv_sr = proc_sr if proc_y is not None else C.SAMPLE_RATE
        if conv_sr != C.SAMPLE_RATE:
            conv_signal = librosa.resample(conv_signal, orig_sr=conv_sr, target_sr=C.SAMPLE_RATE)
            conv_sr = C.SAMPLE_RATE

        if progress_cb:
            progress_cb("voice_analysis", "Extracting pitch F0 and vocal energy measurements...", 92)

        conv_res = process_full_conversation_analysis(
            conv_signal, sr=conv_sr, transcription_result=trans_res
        )
        pred["speakers"] = conv_res.get("speakers", [])
        pred["conversation_timeline"] = conv_res.get("conversation_timeline", [])
        pred["emotion_tracks"] = conv_res.get("emotion_tracks", {})
        pred["emotion_journey"] = conv_res.get("emotion_journey", [])
        pred["voice_analysis"] = conv_res.get("voice_analysis", {})
        pred["speaker_count"] = conv_res.get("speaker_count", 1)
        full_rec_duration = conv_res.get("duration") or (round(len(conv_signal) / conv_sr, 2) if conv_signal is not None else pred.get("analyzed_seconds", 0.0))
        pred["recording_duration"] = full_rec_duration
        pred["analyzed_seconds"] = full_rec_duration
        if conv_res.get("combined_transcript") and pred.get("transcription"):
            pred["transcription"]["combined_transcript"] = conv_res["combined_transcript"]
    except Exception as conv_err:
        log.warning("Conversation analysis stage skipped/failed: %s", conv_err)
        pred["speakers"] = []
        pred["conversation_timeline"] = []
        pred["emotion_tracks"] = {}
        pred["emotion_journey"] = []
        pred["voice_analysis"] = {}
        pred["speaker_count"] = 0

    if progress_cb:
        progress_cb("complete", "Conversation analysis complete", 100)

    return pred


@app.get("/api/audio/preview/{audio_id}")
async def stream_audio_preview(audio_id: str, request: Request):
    entry = _audio_cache.get(audio_id)
    if not entry:
        raise HTTPException(404, "Audio preview not found or expired.")
    _, content, mime_type = entry
    file_size = len(content)

    range_header = request.headers.get("Range")
    if range_header:
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0]) if byte_range[0] else 0
            end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            chunk_length = end - start + 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_length),
                "Content-Type": mime_type,
            }
            return Response(content[start:end + 1], status_code=206, headers=headers, media_type=mime_type)
        except Exception:
            pass

    headers = {
        "Content-Length": str(file_size),
        "Accept-Ranges": "bytes",
        "Content-Type": mime_type,
    }
    return Response(content, status_code=200, headers=headers, media_type=mime_type)


@app.post("/api/predict")
async def predict_endpoint(file: UploadFile = File(...)):
    return await _guarded(_predict_and_enrich, await _read(file))


def _spectrogram(data: bytes):
    return compute_spectrogram(load_raw_signal(data))


@app.post("/api/spectrogram")
async def spectrogram_endpoint(file: UploadFile = File(...)):
    """Mel spectrogram of the uploaded audio. Works without a trained model. Not an emotion prediction."""
    return await _guarded(_spectrogram, await _read(file))


def _timeline(data: bytes, window: float, hop: float):
    bundle = predict.get_bundle()
    out = analyse_timeline(load_raw_signal(data), bundle["pipeline"], window, hop)
    m = load_metrics() or {}
    out["model"] = {"id": predict._cache["id"], "name": m.get("model_name"), "trained_at": m.get("generated_at"), "language": "en", "dataset": "CREMA-D"}
    return out


@app.post("/api/timeline")
async def timeline_endpoint(file: UploadFile = File(...), window_s: float = Form(C.TIMELINE_DEFAULT_WINDOW), hop_s: float = Form(C.TIMELINE_DEFAULT_HOP)):
    """Segment-level analysis of the original audio with the real model (batched). 422 for invalid window settings."""
    return await _guarded(_timeline, await _read(file), window_s, hop_s)


@app.get("/api/transcription/status")
def transcription_status():
    return transcription.status()


def _transcribe(data: bytes):
    return transcription.transcribe(load_raw_signal(data))


@app.post("/api/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    """Optional speech-to-text. 503 when no engine is configured; never returns invented text."""
    return await _guarded(_transcribe, await _read(file))


@app.post("/api/consistency/recalculate")
def recalculate_consistency_endpoint(body: RecalculateConsistencyRequest):
    """Recalculate lexical affect and cross-modal consistency after user edits the transcript."""
    return consistency.analyze_cross_modal_consistency(
        transcript=body.transcript,
        predicted_emotion=body.predicted_emotion,
        confidence=body.confidence,
        is_uncertain=body.is_uncertain,
    )


# =========================================================================
# Authentication Endpoints
# =========================================================================

@app.post("/api/auth/register")
def register(body: RegisterRequest):
    try:
        user = db.create_user(body.email, body.full_name, body.password)
        token = db.create_session(user["id"])
        return {"user": user, "token": token}
    except ValueError as exc:
        raise HTTPException(400, {"code": "registration_failed", "message": str(exc)})


@app.post("/api/auth/login")
def login(body: LoginRequest):
    user = db.authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(401, {"code": "invalid_credentials", "message": "Invalid email address or password."})
    token = db.create_session(user["id"])
    return {"user": user, "token": token}


@app.post("/api/auth/logout")
def logout(request: Request):
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        db.delete_session(token)
    return {"ok": True}


@app.get("/api/auth/me")
def get_me(request: Request):
    user = _get_current_user(request)
    return {"user": user}


@app.put("/api/auth/profile")
def update_profile(body: UpdateProfileRequest, request: Request):
    user = _get_current_user(request)
    try:
        updated = db.update_user_profile(user["id"], body.full_name)
        return {"user": updated}
    except ValueError as exc:
        raise HTTPException(400, {"code": "profile_update_failed", "message": str(exc)})


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    token = db.create_password_reset_token(body.email)
    return {
        "message": "If this email is registered, password reset instructions have been generated.",
        "token": token,
    }


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordRequest):
    try:
        success = db.reset_password_with_token(body.token, body.password)
        if not success:
            raise HTTPException(400, {"code": "invalid_token", "message": "Reset token is invalid or expired."})
        return {"ok": True, "message": "Password updated successfully. You can now log in."}
    except ValueError as exc:
        raise HTTPException(400, {"code": "reset_failed", "message": str(exc)})


@app.delete("/api/auth/account")
def delete_account(request: Request):
    user = _get_current_user(request)
    db.delete_user_account(user["id"])
    return {"ok": True, "message": "Account deleted successfully."}


# =========================================================================
# Saved Analyses Endpoints
# =========================================================================

@app.post("/api/analyses/save")
def save_analysis_endpoint(body: SaveAnalysisRequest, request: Request):
    user = _get_current_user(request)
    if not body.predicted_emotion or body.predicted_emotion.lower() in ("none", "null"):
        raise HTTPException(400, {"code": "invalid_prediction", "message": "Recordings without a valid emotion prediction cannot be saved to history."})

    analysis_id = secrets.token_hex(16)
    audio_file_path = body.audio_file_path
    saved_audio_dir = os.path.join(C.OUTPUTS_DIR, "saved_audio")
    os.makedirs(saved_audio_dir, exist_ok=True)

    audio_bytes = None
    if body.audio_id and body.audio_id in _audio_cache:
        _, audio_bytes, _ = _audio_cache[body.audio_id]
    elif body.audio_base64:
        try:
            b64_str = body.audio_base64
            if "," in b64_str:
                b64_str = b64_str.split(",", 1)[1]
            audio_bytes = base64.b64decode(b64_str)
        except Exception as b64_err:
            log.warning("Could not decode audio_base64 for saved analysis: %s", b64_err)

    if audio_bytes:
        fpath = os.path.join(saved_audio_dir, f"{analysis_id}.wav")
        try:
            with open(fpath, "wb") as f:
                f.write(audio_bytes)
            audio_file_path = fpath
        except Exception as e:
            log.warning("Could not persist saved analysis audio file: %s", e)

    saved = db.save_analysis(
        user_id=user["id"],
        original_filename=body.original_filename,
        predicted_emotion=body.predicted_emotion,
        confidence=body.confidence,
        margin=body.margin,
        scores=body.scores,
        analyzed_seconds=body.analyzed_seconds,
        is_uncertain=body.is_uncertain,
        transcript=body.transcript,
        transcript_segments=body.transcript_segments,
        consistency_status=body.consistency_status,
        consistency_explanation=body.consistency_explanation,
        notes=body.notes,
        model_name=body.model_name,
        model_id=body.model_id,
        feature_version=body.feature_version,
        speakers=body.speakers,
        conversation_timeline=body.conversation_timeline,
        emotion_tracks=body.emotion_tracks,
        emotion_journey=body.emotion_journey,
        voice_analysis=body.voice_analysis,
        audio_file_path=audio_file_path,
        analysis_id=analysis_id,
    )
    return {"analysis": saved}


@app.get("/api/analyses")
def list_analyses(request: Request):
    user = _get_current_user(request)
    return {"analyses": db.list_user_analyses(user["id"])}


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str, request: Request):
    user = _get_current_user(request)
    analysis = db.get_user_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis not found."})
    return {"analysis": analysis}


@app.get("/api/analyses/{analysis_id}/audio")
def get_saved_analysis_audio(analysis_id: str, request: Request):
    """Stream or return the original audio file belonging to a saved analysis."""
    user = _get_current_user(request)
    analysis = db.get_user_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis not found."})
    audio_path = analysis.get("audio_file_path")
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(404, {"code": "audio_not_found", "message": "Saved audio file is not available."})

    stat_res = os.stat(audio_path)
    file_size = stat_res.st_size
    range_header = request.headers.get("Range")
    if range_header:
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0]) if byte_range[0] else 0
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            length = end - start + 1
            with open(audio_path, "rb") as f:
                f.seek(start)
                data = f.read(length)
            return Response(
                content=data,
                status_code=206,
                media_type="audio/wav",
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(length),
                },
            )
        except Exception as e:
            log.warning("Range request error: %s", e)

    return FileResponse(audio_path, media_type="audio/wav", filename=f"{analysis.get('original_filename', 'audio')}.wav")


@app.delete("/api/analyses/{analysis_id}")
def delete_analysis(analysis_id: str, request: Request):
    user = _get_current_user(request)
    deleted = db.delete_user_analysis(analysis_id, user["id"])
    if not deleted:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis not found."})
    return {"ok": True}


@app.post("/api/analyses/{analysis_id}/speakers/rename")
def rename_analysis_speaker(analysis_id: str, body: SpeakerRenameRequest, request: Request):
    user = _get_current_user(request)
    try:
        updated = db.update_saved_analysis_speaker_name(
            analysis_id=analysis_id,
            user_id=user["id"],
            speaker_id=body.speaker_id,
            new_name=body.name,
        )
        if not updated:
            raise HTTPException(404, {"code": "not_found", "message": "Analysis not found or could not be updated."})
        return {"analysis": updated}
    except ValueError as exc:
        raise HTTPException(400, {"code": "invalid_name", "message": str(exc)})


# =========================================================================
# Unified Conversation Job & Progress Endpoints
# =========================================================================

def _run_conversation_job_sync(job_id: str, data: bytes):
    def progress_callback(stage: str, stage_label: str, progress_pct: int):
        if job_id in _jobs:
            _jobs[job_id]["stage"] = stage
            _jobs[job_id]["stage_label"] = stage_label
            _jobs[job_id]["progress_pct"] = progress_pct

    try:
        res = _predict_and_enrich(data, progress_cb=progress_callback)
        if job_id in _jobs:
            _jobs[job_id]["stage"] = "complete"
            _jobs[job_id]["stage_label"] = "Conversation analysis complete"
            _jobs[job_id]["progress_pct"] = 100
            _jobs[job_id]["done"] = True
            _jobs[job_id]["result"] = res
    except Exception as exc:
        log.error("Conversation job %s failed: %s", job_id, exc, exc_info=True)
        if job_id in _jobs:
            _jobs[job_id]["stage"] = "failed"
            _jobs[job_id]["stage_label"] = f"Analysis error: {str(exc)}"
            _jobs[job_id]["done"] = True
            _jobs[job_id]["error"] = str(exc)


async def _launch_job(job_id: str, data: bytes):
    await run_in_threadpool(_run_conversation_job_sync, job_id, data)


@app.post("/api/analyze/conversation")
async def analyze_conversation_endpoint(file: UploadFile = File(...)):
    """Upload audio/video for full conversation analysis with asynchronous progress updates."""
    data = await _read(file)
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {
        "job_id": job_id,
        "stage": "queued",
        "stage_label": "Queued for processing...",
        "progress_pct": 5,
        "done": False,
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    now = time.time()
    for jid in list(_jobs.keys()):
        if now - _jobs[jid].get("created_at", now) > 3600:
            _jobs.pop(jid, None)

    asyncio.create_task(_launch_job(job_id, data))
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}/progress")
def get_job_progress_endpoint(job_id: str):
    """Poll progress of a conversation analysis job."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis job not found or expired."})
    return {
        "job_id": job["job_id"],
        "stage": job["stage"],
        "stage_label": job["stage_label"],
        "progress_pct": job["progress_pct"],
        "done": job["done"],
        "result": job["result"],
        "error": job["error"],
    }


# =========================================================================
# Export Endpoints (PDF & CSV)
# =========================================================================

@app.post("/api/export/pdf")
def export_pdf_direct(body: ExportReportRequest):
    """Generate high-fidelity branded PDF report directly from analysis JSON."""
    try:
        pdf_bytes = generate_pdf_report(body.analysis)
        import re
        raw_fname = body.analysis.get("original_filename", "audio_analysis")
        fname = re.sub(r"[^a-zA-Z0-9_\-.]", "_", raw_fname)
        return Response(
            pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="SER_Report_{fname}.pdf"'},
        )
    except Exception as exc:
        log.error("PDF export generation failed: %s", exc, exc_info=True)
        raise HTTPException(500, {"code": "pdf_export_failed", "message": str(exc)})


@app.post("/api/export/csv")
def export_csv_direct(body: ExportReportRequest):
    """Generate structured multi-file CSV ZIP package directly from analysis JSON."""
    try:
        zip_bytes = generate_csv_export(body.analysis)
        import re
        raw_fname = body.analysis.get("original_filename", "audio_analysis")
        fname = re.sub(r"[^a-zA-Z0-9_\-.]", "_", raw_fname)
        return Response(
            zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="SER_Export_{fname}.zip"'},
        )
    except Exception as exc:
        log.error("CSV export generation failed: %s", exc, exc_info=True)
        raise HTTPException(500, {"code": "csv_export_failed", "message": str(exc)})


@app.get("/api/analyses/{analysis_id}/export/pdf")
def export_analysis_pdf(analysis_id: str, request: Request):
    """Generate high-fidelity branded PDF report for a saved analysis."""
    user = _get_current_user(request)
    analysis = db.get_user_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis not found."})
    try:
        pdf_bytes = generate_pdf_report(analysis)
        import re
        raw_fname = analysis.get("original_filename", "audio_analysis")
        fname = re.sub(r"[^a-zA-Z0-9_\-.]", "_", raw_fname)
        return Response(
            pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="SER_Report_{fname}.pdf"'},
        )
    except Exception as exc:
        log.error("PDF export generation failed: %s", exc, exc_info=True)
        raise HTTPException(500, {"code": "pdf_export_failed", "message": str(exc)})


@app.get("/api/analyses/{analysis_id}/export/csv")
def export_analysis_csv(analysis_id: str, request: Request):
    """Generate structured multi-file CSV ZIP package for a saved analysis."""
    user = _get_current_user(request)
    analysis = db.get_user_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(404, {"code": "not_found", "message": "Analysis not found."})
    try:
        zip_bytes = generate_csv_export(analysis)
        import re
        raw_fname = analysis.get("original_filename", "audio_analysis")
        fname = re.sub(r"[^a-zA-Z0-9_\-.]", "_", raw_fname)
        return Response(
            zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="SER_Export_{fname}.zip"'},
        )
    except Exception as exc:
        log.error("CSV export generation failed: %s", exc, exc_info=True)
        raise HTTPException(500, {"code": "csv_export_failed", "message": str(exc)})
