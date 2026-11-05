import os
import sys
import json

os.environ["SER_TRANSCRIBER"] = "faster-whisper"
sys.path.insert(0, "backend")

from app.main import _predict_and_enrich

with open("data/AudioWAV/1001_DFA_ANG_XX.wav", "rb") as f:
    audio_bytes = f.read()

res = _predict_and_enrich(audio_bytes)
print(json.dumps({
    "emotion": res["emotion"],
    "confidence": round(res["confidence"], 4),
    "margin": round(res["margin"], 4),
    "transcript": res["transcription"]["text"],
    "engine": res["transcription"]["engine"],
    "consistency": res["consistency"]
}, indent=2))
