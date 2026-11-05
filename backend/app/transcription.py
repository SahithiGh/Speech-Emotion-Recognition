"""Optional speech-to-text, kept separate from emotion recognition.

No engine is bundled. A real engine is used only when the optional package is installed AND the user enables it:
    pip install -r requirements-transcription.txt         (faster-whisper)
    set SER_TRANSCRIBER=faster-whisper                     (optional: set SER_WHISPER_MODEL=base.en, default tiny.en)
The engine runs on this computer. The first run downloads the model files from the internet (Hugging Face); after that no audio or text leaves the computer.
If nothing is configured, transcription is reported as unavailable and no text is ever produced."""
import importlib.util
import logging
import os
import threading

import numpy as np

from .errors import AudioError

log = logging.getLogger("ser.transcription")

ENGINES = {"faster-whisper": {"module": "faster_whisper", "label": "faster-whisper (OpenAI Whisper model, runs locally)"}}
_model = {"name": None, "obj": None}
_lock = threading.Lock()


def status() -> dict:
    name = (os.environ.get("SER_TRANSCRIBER") or "").strip()
    base = {"engine": None, "label": None, "available": False, "runs_locally": True, "language": "en", "evaluated": False,
            "privacy": "Audio stays on this computer. The model files are downloaded from the internet once, on first use.", "reason": None}
    if not name:
        return {**base, "reason": "No transcription engine is configured. Install requirements-transcription.txt and set SER_TRANSCRIBER=faster-whisper (see the README)."}
    if name not in ENGINES:
        return {**base, "reason": f"Unknown engine '{name}'. Supported: {', '.join(ENGINES)}."}
    if importlib.util.find_spec(ENGINES[name]["module"]) is None:
        return {**base, "engine": name, "label": ENGINES[name]["label"], "reason": f"The package for {name} is not installed. Run: pip install -r requirements-transcription.txt"}
    return {**base, "engine": name, "label": ENGINES[name]["label"], "available": True}


def _load(name):
    with _lock:
        if _model["name"] != name:
            from faster_whisper import WhisperModel   # imported only when actually used
            model_size = os.environ.get("SER_WHISPER_MODEL", "tiny.en")
            try:
                # Fast local load if already cached, preventing remote network stalls
                obj = WhisperModel(model_size, device="cpu", compute_type="int8", local_files_only=True)
            except Exception:
                # Fallback to downloading on first run if not in cache
                obj = WhisperModel(model_size, device="cpu", compute_type="int8", local_files_only=False)
            _model.update(name=name, obj=obj)
        return _model["obj"]


def prewarm():
    """Pre-warm transcription model if configured, so the first request is fast."""
    st = status()
    if st["available"]:
        try:
            _load(st["engine"])
            log.info("Transcription engine '%s' is warm and ready.", st["engine"])
        except Exception as exc:
            log.warning("Transcription prewarm skipped: %s", exc)


def transcribe(y: np.ndarray) -> dict:
    """Transcribe 16 kHz mono audio with word and segment timestamps. Raises AudioError on failure."""
    st = status()
    if not st["available"]:
        raise AudioError(st["reason"], "transcription_unavailable")
    
    y = np.asarray(y, dtype=np.float32)
    try:
        model = _load(st["engine"])
        with _lock:
            try:
                segs, info = model.transcribe(y, language="en", vad_filter=True, word_timestamps=True)
                parts = []
                for s in segs:
                    words = []
                    if hasattr(s, "words") and s.words:
                        for w in s.words:
                            words.append({
                                "word": w.word.strip(),
                                "start": round(float(w.start), 2),
                                "end": round(float(w.end), 2),
                                "probability": round(float(getattr(w, "probability", 1.0)), 2),
                            })
                    parts.append({
                        "start": round(float(s.start), 2),
                        "end": round(float(s.end), 2),
                        "text": s.text.strip(),
                        "words": words,
                    })
            except Exception:
                # Fallback without word_timestamps if internal alignment fails
                segs, info = model.transcribe(y, language="en", vad_filter=True)
                parts = [{"start": round(float(s.start), 2), "end": round(float(s.end), 2), "text": s.text.strip(), "words": []} for s in segs]
    except Exception as exc:
        raise AudioError(f"Transcription failed ({type(exc).__name__}).", "transcription_failed") from exc
    text = " ".join(p["text"] for p in parts).strip()
    return {
        "text": text,
        "segments": parts,
        "engine": st["label"],
        "language": "en",
        "no_speech": not text,
        "has_word_timestamps": any(len(p.get("words", [])) > 0 for p in parts),
        "note": "The transcript comes from a speech-to-text engine whose accuracy has not been evaluated in this project, and it is English only.",
    }
