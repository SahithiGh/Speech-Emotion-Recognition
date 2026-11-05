"""Builds the model-information report from the real artifact and saved evaluation, never from fixed text."""
from . import config as C
from .languages import LANGUAGES
from .modelio import load_metrics
from . import predict

LIMITATIONS = [
    "Trained on acted English speech (CREMA-D); results on spontaneous speech, other microphones or other languages are expected to be lower.",
    "It estimates which acted emotion a voice sounds like. It does not measure a person's true feelings.",
    "Scores are normalized across six classes. They are not calibrated probabilities.",
    "There is no detector for non-speech audio; silence and very short clips are rejected, but music or noise may still receive an emotion label.",
    "The model always picks one of six emotions, even when none applies.",
]


def model_info() -> dict:
    st = predict.model_state()
    m = load_metrics() or {}
    info = {"status": st["state"], "reason": st["reason"], "languages": LANGUAGES, "dataset": C.DATASET_INFO,
            "emotions": C.EMOTIONS, "limitations": LIMITATIONS, "evaluation_status": "evaluated" if (m.get("trained") and st["state"] == "ready") else "pending"}
    if st["state"] == "ready":
        b = predict.get_bundle()
        pipe = b["pipeline"]
        clf = pipe.steps[-1][1]
        info.update({"model_id": predict._cache["id"], "model_name": m.get("model_name"), "trained_at": m.get("generated_at"),
                     "architecture": " then ".join(type(s).__name__ for _, s in pipe.steps) + f" ({clf.__class__.__name__}, parameters: " +
                                     ", ".join(f"{k}={v}" for k, v in clf.get_params().items() if k in ("C", "kernel", "gamma", "n_estimators", "max_iter", "learning_rate", "class_weight", "min_samples_leaf")) + ")",
                     "preprocessing": b["preprocessing"], "sample_rate": C.SAMPLE_RATE,
                     "expected_input": f"mono speech, resampled to 16 kHz in the backend; 0.5 to {int(C.MAX_INPUT_SECONDS)} seconds of speech are analysed",
                     "uncertainty": (b.get("reliability") or {}).get("rule", "unavailable")})
    return info
