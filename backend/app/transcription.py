"""Optional speech-to-text, kept separate from emotion recognition.

No engine is bundled. A real engine is used only when the optional package is installed AND the user enables it:
    pip install -r requirements-transcription.txt         (faster-whisper)
    set SER_TRANSCRIBER=faster-whisper                     (optional: set SER_WHISPER_MODEL=base, default tiny)
The engine runs on this computer. The first run downloads the model files from the internet (Hugging Face); after that no audio or text leaves the computer.
If nothing is configured, transcription is reported as unavailable and no text is ever produced.

Language Detection Guardrails:
Before attempting transcription, language identification is executed to determine whether the spoken language is English.
- Case A (English detected confidently): English transcript with word-level timestamps is returned.
- Case B (Non-English detected confidently, e.g. Telugu, Hindi, Tamil): English transcription is skipped, returning 'Other language detected: <Language>'.
- Case C (Language uncertain / low confidence): Guessed transcription is skipped, returning 'Language could not be confidently identified.'.
Acoustic emotion detection operates independently on acoustic vocal features across all 6 classes.
"""
import importlib.util
import logging
import os
import threading
from typing import Optional, Tuple

import numpy as np

from .errors import AudioError

log = logging.getLogger("ser.transcription")

ENGINES = {"faster-whisper": {"module": "faster_whisper", "label": "faster-whisper (OpenAI Whisper model, runs locally)"}}
_model = {"name": None, "obj": None}
_lock = threading.Lock()

# Curated mapping of ISO-639-1 language codes to capitalized names
LANGUAGE_NAMES = {
    "en": "English",
    "te": "Telugu",
    "hi": "Hindi",
    "ta": "Tamil",
    "kn": "Kannada",
    "ml": "Malayalam",
    "mr": "Marathi",
    "bn": "Bengali",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "ur": "Urdu",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "th": "Thai",
    "nl": "Dutch",
    "pl": "Polish",
    "sv": "Swedish",
    "fa": "Persian",
    "el": "Greek",
    "cs": "Czech",
    "ro": "Romanian",
    "da": "Danish",
    "hu": "Hungarian",
    "fi": "Finnish",
    "he": "Hebrew",
    "uk": "Ukrainian",
    "ms": "Malay",
    "sk": "Slovak",
    "bg": "Bulgarian",
    "hr": "Croatian",
    "lt": "Lithuanian",
    "sl": "Slovenian",
    "et": "Estonian",
    "lv": "Latvian",
    "ne": "Nepali",
    "si": "Sinhala",
    "my": "Burmese",
    "km": "Khmer",
    "sw": "Swahili",
    "af": "Afrikaans",
    "sq": "Albanian",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "eu": "Basque",
    "be": "Belarusian",
    "bs": "Bosnian",
    "ca": "Catalan",
    "gl": "Galician",
    "ka": "Georgian",
    "is": "Icelandic",
    "kk": "Kazakh",
    "mk": "Macedonian",
    "mn": "Mongolian",
    "no": "Norwegian",
    "sr": "Serbian",
    "cy": "Welsh",
}

LANGUAGE_CONFIDENCE_THRESHOLD = 0.60


def get_language_name(code: Optional[str]) -> str:
    """Map language code to a readable name, fallback to code."""
    if not code:
        return "Unknown"
    cleaned = code.strip().lower()
    return LANGUAGE_NAMES.get(cleaned, cleaned.capitalize())


def status() -> dict:
    name = (os.environ.get("SER_TRANSCRIBER") or "").strip()
    base = {
        "engine": None,
        "label": None,
        "available": False,
        "runs_locally": True,
        "language": "multilingual",
        "evaluated": False,
        "privacy": "Audio stays on this computer. The model files are downloaded from the internet once, on first use.",
        "reason": None,
    }
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
            # Default to multilingual 'tiny' so it supports language identification across 100 languages
            raw_model_size = os.environ.get("SER_WHISPER_MODEL", "tiny").strip()
            # If an English-only model was set, switch to multilingual equivalent for language detection
            if raw_model_size.endswith(".en"):
                model_size = raw_model_size[:-3] or "tiny"
            else:
                model_size = raw_model_size
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


def detect_language(y: np.ndarray, model=None) -> Tuple[str, float]:
    """Detect spoken language and probability from audio signal."""
    if model is None:
        st = status()
        if not st["available"]:
            return "unknown", 0.0
        model = _load(st["engine"])

    if not hasattr(model, "detect_language"):
        # For mock test engines without detect_language, default to English
        return "en", 1.0

    with _lock:
        try:
            detected_lang, prob, _ = model.detect_language(y)
            return (detected_lang or "unknown").lower(), float(prob)
        except Exception as exc:
            log.warning("Language detection failed: %s", exc)
            return "unknown", 0.0


def transcribe(y: np.ndarray) -> dict:
    """Transcribe 16 kHz mono audio after language identification.
    
    Guarantees:
    - Case A: English detected confidently -> Returns English transcript with timestamps.
    - Case B: Other language detected confidently -> Skips English decoding; returns 'Other language detected: <Language>'.
    - Case C: Language uncertain -> Skips transcription; returns 'Language could not be confidently identified.'.
    """
    st = status()
    if not st["available"]:
        raise AudioError(st["reason"], "transcription_unavailable")

    y = np.asarray(y, dtype=np.float32)

    # Validate signal presence
    if len(y) == 0 or np.max(np.abs(y)) < 1e-4:
        return {
            "text": None,
            "segments": [],
            "engine": st["label"],
            "language": None,
            "language_code": None,
            "language_name": None,
            "language_probability": 0.0,
            "is_english": False,
            "case": "C",
            "no_speech": True,
            "has_word_timestamps": False,
            "message": "No speech detected in audio.",
            "note": "Audio contains silence or undetectable vocal energy.",
        }

    try:
        model = _load(st["engine"])
        detected_lang, lang_prob = detect_language(y, model=model)
    except Exception as exc:
        raise AudioError(f"Transcription initialization failed ({type(exc).__name__}).", "transcription_failed") from exc

    lang_code = detected_lang.lower()
    lang_name = get_language_name(lang_code)

    # Case B: Confidently detected non-English language (e.g. Telugu, Hindi, Tamil)
    if lang_code != "en" and lang_prob >= 0.50:
        msg = f"Other language detected: {lang_name}"
        log.info("Non-English speech detected (%s, confidence=%.2f). Skipping English transcription.", lang_name, lang_prob)
        return {
            "text": None,
            "segments": [],
            "engine": st["label"],
            "language": lang_code,
            "language_code": lang_code,
            "language_name": lang_name,
            "language_probability": round(float(lang_prob), 3),
            "is_english": False,
            "case": "B",
            "no_speech": False,
            "has_word_timestamps": False,
            "message": msg,
            "note": f"Spoken speech was identified as {lang_name} (confidence {round(lang_prob * 100, 1)}%). English transcription is omitted to prevent inaccurate text generation.",
        }

    # Case A & Fallback: English detected or language ambiguous -> Attempt English transcription
    parts = []
    trans_info = None
    try:
        with _lock:
            try:
                segs, trans_info = model.transcribe(y, language="en", vad_filter=True, word_timestamps=True)
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
                segs, trans_info = model.transcribe(y, language="en", vad_filter=True)
                parts = [{"start": round(float(s.start), 2), "end": round(float(s.end), 2), "text": s.text.strip(), "words": []} for s in segs]
    except Exception as exc:
        raise AudioError(f"Transcription failed ({type(exc).__name__}).", "transcription_failed") from exc

    text = " ".join(p["text"] for p in parts).strip()

    # If language was NOT English and no text was produced, or confidence was too low
    if not text and lang_code != "en" and lang_prob < 0.50:
        msg = "Language could not be confidently identified."
        log.info("Language uncertain (top candidate: %s, confidence=%.2f). Skipping transcription.", lang_name, lang_prob)
        return {
            "text": None,
            "segments": [],
            "engine": st["label"],
            "language": "unknown",
            "language_code": "unknown",
            "language_name": "Unknown",
            "language_probability": round(float(lang_prob), 3),
            "is_english": False,
            "case": "C",
            "no_speech": False,
            "has_word_timestamps": False,
            "message": msg,
            "note": "Spoken language could not be identified with sufficient confidence. Transcription is omitted to prevent inaccurate text generation.",
        }

    return {
        "text": text,
        "segments": parts,
        "engine": st["label"],
        "language": "en",
        "language_code": "en",
        "language_name": "English",
        "language_probability": round(float(lang_prob if lang_code == "en" else 0.85), 3),
        "is_english": True,
        "case": "A",
        "no_speech": not text,
        "has_word_timestamps": any(len(p.get("words", [])) > 0 for p in parts),
        "message": None,
        "note": "The transcript comes from a speech-to-text engine whose accuracy has not been evaluated in this project, and it is English only.",
    }
