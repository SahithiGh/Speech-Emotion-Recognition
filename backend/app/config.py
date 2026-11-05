"""Central settings. Every path and constant used by training and prediction lives here."""
import os
from pathlib import Path

# SER_HOME lets the developer tests point the whole project at a temporary folder.
ROOT = Path(os.environ.get("SER_HOME") or Path(__file__).resolve().parents[2]).resolve()
DATA_DIR = ROOT / "data" / "AudioWAV"
MODELS_DIR = ROOT / "models"
OUTPUTS_DIR = ROOT / "outputs"

# Model Profiles & Artifact Locations
SVM_BACKUP_MODEL_PATH = MODELS_DIR / "svm_rollback_backup" / "emotion_model.joblib"
SVM_LEGACY_MODEL_PATH = MODELS_DIR / "emotion_model.joblib"
CANDIDATE_OPTION2_MODEL_PATH = MODELS_DIR / "candidate_option2" / "emotion_model.joblib"
EMOTION2VEC_PROD_MODEL_PATH = MODELS_DIR / "emotion2vec_production" / "emotion_model.joblib"
EMOTION2VEC_EXP_MODEL_PATH = MODELS_DIR / "emotion2vec_experimental" / "emotion_model.joblib"
EMOTION2VEC_CANDIDATE_PATH = ROOT / "experiments" / "emotion2vec_candidate" / "candidate_logistic_regression.joblib"

# Primary Promoted Production Model: emotion2vec+ (Base) + Logistic Regression
EMOTION2VEC_MODEL_PATH = (
    EMOTION2VEC_PROD_MODEL_PATH
    if EMOTION2VEC_PROD_MODEL_PATH.exists()
    else EMOTION2VEC_EXP_MODEL_PATH
    if EMOTION2VEC_EXP_MODEL_PATH.exists()
    else EMOTION2VEC_CANDIDATE_PATH
)
PRODUCTION_MODEL_PATH = EMOTION2VEC_MODEL_PATH
SVM_ROLLBACK_MODEL_PATH = (
    SVM_BACKUP_MODEL_PATH
    if SVM_BACKUP_MODEL_PATH.exists()
    else SVM_LEGACY_MODEL_PATH
)

SER_MODEL_PROFILE = os.environ.get("SER_MODEL_PROFILE", "production").lower()
if os.environ.get("SER_MODEL_PATH"):
    MODEL_PATH = Path(os.environ["SER_MODEL_PATH"])
elif SER_MODEL_PROFILE in ("staging", "candidate_option2", "option2") and CANDIDATE_OPTION2_MODEL_PATH.exists():
    MODEL_PATH = CANDIDATE_OPTION2_MODEL_PATH
    SER_MODEL_PROFILE = "candidate_option2"
elif SER_MODEL_PROFILE in ("svm_rollback", "svm", "baseline", "legacy_production"):
    MODEL_PATH = SVM_ROLLBACK_MODEL_PATH
    SER_MODEL_PROFILE = "svm_rollback"
elif SER_MODEL_PROFILE in ("emotion2vec_experimental", "e2v", "emotion2vec", "experimental"):
    MODEL_PATH = EMOTION2VEC_EXP_MODEL_PATH if EMOTION2VEC_EXP_MODEL_PATH.exists() else EMOTION2VEC_MODEL_PATH
    SER_MODEL_PROFILE = "emotion2vec_experimental"
else:
    MODEL_PATH = PRODUCTION_MODEL_PATH
    SER_MODEL_PROFILE = "production"

CONFIG_PATH = MODELS_DIR / "preprocessing_config.json"
METRICS_PATH = OUTPUTS_DIR / "metrics.json"
SPLIT_PATH = OUTPUTS_DIR / "speaker_split.json"
FEATURE_CACHE_PATH = OUTPUTS_DIR / "feature_cache.npz"
DATASET_REPORT_PATH = OUTPUTS_DIR / "dataset_report.json"

RESOURCES_DIR = Path(__file__).resolve().parent / "resources"
MANIFEST_PATH = RESOURCES_DIR / "crema_d_manifest.csv.gz"   # official file list: name, sha256, size
CREMA_D_COMMIT = "1658cd342dff90010aa843eaeebd53610a08b1dc"

# CREMA-D file names look like 1001_DFA_ANG_XX.wav  ->  actor_sentence_emotion_level
CODE_TO_EMOTION = {"ANG": "angry", "DIS": "disgust", "FEA": "fear", "HAP": "happy", "NEU": "neutral", "SAD": "sad"}
EMOTIONS = sorted(CODE_TO_EMOTION.values())

# Audio / feature settings (used identically for training and prediction)
SAMPLE_RATE = 16000
MIN_SECONDS = 0.5           # shorter clips (after trimming silence) are rejected
SHORT_NOTE_SECONDS = 1.0    # shorter than this still works but gets a reliability note
MAX_SECONDS = 60.0          # Full audio recordings up to 60s are analyzed via temporal windowing
WINDOW_SECONDS = 3.5        # Temporal analysis window length (seconds) for long recordings
WINDOW_HOP = 2.0            # Temporal analysis hop step (seconds)
MAX_INPUT_SECONDS = float(os.environ.get("SER_MAX_AUDIO_SECONDS", 60))    # longer uploads are rejected
SILENCE_RMS = 0.003
CLIP_FRACTION = 0.005       # more than 0.5% of samples at full scale -> "clipped" note
TRIM_TOP_DB = 30
N_MFCC = 40
N_MELS = 40
FEATURE_VERSION = 2         # bump when feature extraction changes so old caches/models are rejected

EXPECTED_CREMA_D_CLIPS = 7442
RANDOM_SEED = 42
TEST_SPEAKER_FRACTION = 0.15
CV_FOLDS = 5
BOOTSTRAP_ROUNDS = 1000
MAX_UPLOAD_BYTES = int(float(os.environ.get("SER_MAX_UPLOAD_MB", 15)) * 1024 * 1024)
MAX_RECORD_SECONDS = 60
PREDICT_TIMEOUT_SECONDS = float(os.environ.get("SER_PREDICT_TIMEOUT", 60))
MAX_CONCURRENT_ANALYSES = int(os.environ.get("SER_MAX_CONCURRENT", 2))      # CPU-heavy work is queued beyond this
RATE_LIMIT_PER_MINUTE = int(os.environ.get("SER_RATE_LIMIT_PER_MIN", 0))   # 0 = off (local use); set for a public deployment

# Uncertainty is never decided by an invented threshold. Training measures, on out-of-fold validation predictions,
# how often the model was right for each range of top score. A result is marked uncertain only when fewer than
# UNCERTAIN_BELOW_ACCURACY of validation predictions in its range were correct and the range has enough data.
RELIABILITY_EDGES = [0.0, 0.4, 0.6, 0.8, 1.000001]
UNCERTAIN_BELOW_ACCURACY = 0.5
MIN_BIN_SAMPLES = 30

# Emotion timeline (segment-level analysis). Windows are not validated: the model was trained on whole sentences.
TIMELINE_DEFAULT_WINDOW = 2.0
TIMELINE_DEFAULT_HOP = 1.0
TIMELINE_MIN_WINDOW = 1.0
TIMELINE_MAX_WINDOW = 4.0
TIMELINE_MIN_HOP = 0.5
TIMELINE_MAX_SEGMENTS = 240
SPECTROGRAM_MELS = 64
SPECTROGRAM_MAX_FRAMES = 600
SPECTROGRAM_DB_RANGE = 80.0

DATASET_INFO = {
    "name": "CREMA-D (Crowd-sourced Emotional Multimodal Actors Dataset)",
    "source": "https://github.com/CheyneyComputerScience/CREMA-D",
    "license": "Open Database License (ODbL) 1.0 for the database; Database Contents License (DbCL) 1.0 for its contents",
    "nature": "Acted emotional speech, English sentences, 91 actors",
    "citation": "Cao, H., Cooper, D. G., Keutmann, M. K., Gur, R. C., Nenkova, A., and Verma, R. (2014). IEEE Transactions on Affective Computing.",
}


# Out-of-Distribution (OOD) Safeguard settings
# Uses maximum standardized feature deviation (|z|_max).
# Calibrated at 99.5th percentile on development speakers.
OOD_SAFEGUARD_ENABLED = os.environ.get("SER_OOD_SAFEGUARD", "1").lower() not in ("0", "false", "no")
OOD_Z_THRESHOLD = float(os.environ.get("SER_OOD_Z_THRESHOLD", "10.12"))
E2V_OOD_Z_THRESHOLD = float(os.environ.get("SER_E2V_OOD_Z_THRESHOLD", "3.83"))


def set_active_model_profile(profile: str) -> Path:
    """Switch active model profile between 'production' (emotion2vec+), 'staging'/'candidate_option2', 'svm_rollback', and 'emotion2vec_experimental'."""
    global MODEL_PATH, SER_MODEL_PROFILE
    prof = profile.lower().strip()
    if prof in ("staging", "candidate_option2", "option2"):
        if not CANDIDATE_OPTION2_MODEL_PATH.exists():
            raise FileNotFoundError(f"Candidate model not found at {CANDIDATE_OPTION2_MODEL_PATH}")
        MODEL_PATH = CANDIDATE_OPTION2_MODEL_PATH
        SER_MODEL_PROFILE = "candidate_option2"
    elif prof in ("svm_rollback", "svm", "baseline", "legacy_production"):
        if not SVM_ROLLBACK_MODEL_PATH.exists():
            raise FileNotFoundError(f"SVM rollback model not found at {SVM_ROLLBACK_MODEL_PATH}")
        MODEL_PATH = SVM_ROLLBACK_MODEL_PATH
        SER_MODEL_PROFILE = "svm_rollback"
    elif prof in ("emotion2vec_experimental", "e2v", "emotion2vec", "experimental"):
        path = EMOTION2VEC_EXP_MODEL_PATH if EMOTION2VEC_EXP_MODEL_PATH.exists() else EMOTION2VEC_MODEL_PATH
        if not path.exists():
            raise FileNotFoundError(f"emotion2vec+ experimental model not found at {path}")
        MODEL_PATH = path
        SER_MODEL_PROFILE = "emotion2vec_experimental"
    elif prof in ("production", "default"):
        if not PRODUCTION_MODEL_PATH.exists():
            raise FileNotFoundError(f"Production model not found at {PRODUCTION_MODEL_PATH}")
        MODEL_PATH = PRODUCTION_MODEL_PATH
        SER_MODEL_PROFILE = "production"
    else:
        raise ValueError(f"Unknown model profile: {profile}. Valid options: 'production', 'staging', 'svm_rollback', 'emotion2vec_experimental'.")
    return MODEL_PATH


def validate_config() -> list:
    """Returns a list of problems with the current settings (empty when fine). Checked at server start."""
    bad = []
    if MAX_UPLOAD_BYTES <= 0: bad.append("SER_MAX_UPLOAD_MB must be greater than 0")
    if MAX_INPUT_SECONDS < MIN_SECONDS * 2: bad.append("SER_MAX_AUDIO_SECONDS is too small")
    if MAX_CONCURRENT_ANALYSES < 1: bad.append("SER_MAX_CONCURRENT must be at least 1")
    if RATE_LIMIT_PER_MINUTE < 0: bad.append("SER_RATE_LIMIT_PER_MIN cannot be negative")
    if not MANIFEST_PATH.exists(): bad.append(f"official file list missing: {MANIFEST_PATH.name}")
    return bad
