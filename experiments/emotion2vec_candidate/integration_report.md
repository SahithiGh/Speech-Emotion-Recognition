# Phase 7: emotion2vec+ Experimental Profile Integration Report

**Integration Target:** Separate Experimental Profile (`emotion2vec_experimental`)  
**Production Isolation:** Strict (Production baseline model `models/emotion_model.joblib` and Option 2 staging model remain 100% unchanged)  
**Primary Candidate:** Candidate 1: Logistic Regression ($C=0.05$ balanced) on frozen 768-D `emotion2vec+` representations  
**Verification Date:** November 2026  

---

## 1. Architectural Design & Isolation

To integrate the 1.04 GB `emotion2vec_plus_base` foundation model without polluting the existing lightweight backend environment (`backend/.venv`), an isolated sidecar IPC architecture was implemented:

```
+-----------------------------------------------------------------------------+
|                                FASTAPI BACKEND                              |
|                          (backend/.venv - Python 3.13)                      |
|                                                                             |
|   SER_MODEL_PROFILE = "production" | "staging" | "emotion2vec_experimental" |
|                                                                             |
|   GET  /api/health       -> Status and model readiness                      |
|   GET  /api/model/status -> Profile, OOD threshold (3.83 vs 10.12), classes |
|   GET  /api/metrics      -> Phase 5 held-out test evaluation benchmarks     |
|   POST /api/predict      -> Audio decoding -> 16 kHz mono -> Peak norm 0.90 |
|   POST /api/timeline     -> Segmented window analysis (16 kHz mono)         |
|                                   |                                         |
|                                   v                                         |
|                       backend/app/e2v_extractor.py                          |
+-----------------------------------|-----------------------------------------+
                                    | IPC (stdin/stdout JSON streams)
                                    v
+-----------------------------------------------------------------------------+
|                        ISOLATED EMOTION2VEC+ SIDECAR                        |
|            (experiments/emotion2vec_candidate/.venv_e2v - Python 3.13)       |
|                                                                             |
|   Script: experiments/emotion2vec_candidate/extractor_service.py           |
|   Backbone: emotion2vec/emotion2vec_plus_base (1.04 GB, cached locally)     |
|   Feature Output: 768-D utterance embedding                                 |
|   Warm Latency: ~132 ms per inference                                       |
+-----------------------------------------------------------------------------+
```

### Key Isolation Characteristics:
1. **Zero Package Contamination:** Neither FunASR, ModelScope, nor PyTorch were added to `backend/.venv`. The existing backend environment remains lightweight and unaffected.
2. **Dedicated Checkpoint Storage:** Model profile assets are strictly isolated in `models/emotion2vec_experimental/`:
   - `models/emotion2vec_experimental/emotion_model.joblib`
   - `models/emotion2vec_experimental/preprocessing_config.json`
   - `models/emotion2vec_experimental/metrics.json`
3. **Explicit Profile Selection:** Configurable via environment variable `SER_MODEL_PROFILE=emotion2vec_experimental` or dynamically via `set_active_model_profile("emotion2vec_experimental")`. Production remains the default whenever `SER_MODEL_PROFILE` is unset.
4. **Lifecycle Management:** Worker daemon pre-warms on application startup when `SER_MODEL_PROFILE=emotion2vec_experimental`, eliminating cold-start latency spikes during live user requests, and terminates cleanly on server shutdown.

---

## 2. Complete Automated Backend Test Suite Results

The entire backend test suite was executed against the codebase:

- **Total Tests:** 68
- **Passed:** 68 (100%)
- **Failed:** 0
- **Skipped:** 0
- **Timed Out:** 0
- **Total Execution Time:** 85.37 seconds

### Test Breakdown by Module:

| Test Module | Tests | Result | Coverage Area |
| :--- | :---: | :---: | :--- |
| `backend/tests/test_advanced.py` | 10 | **10 PASSED** | Spectrogram, segment slicing, noise, audio edge cases |
| `backend/tests/test_api_and_training.py` | 4 | **4 PASSED** | API endpoints, live synthetic training pipeline |
| `backend/tests/test_audio_eval.py` | 9 | **9 PASSED** | Multi-format audio decoding, container safety |
| `backend/tests/test_auth_and_analyses.py` | 5 | **5 PASSED** | Authentication, database operations, history tracking |
| `backend/tests/test_candidate_option2.py` | 7 | **7 PASSED** | Staging candidate (Option 2) isolation and immutability |
| `backend/tests/test_dataset.py` | 7 | **7 PASSED** | CREMA-D dataset validation, metadata integrity |
| `backend/tests/test_download.py` | 3 | **3 PASSED** | Dataset downloader, integrity hashes |
| `backend/tests/test_emotion2vec_profile.py` | 4 | **4 PASSED** | Bundle verification, profile switching, predict pipeline |
| `backend/tests/test_fs_safety.py` | 7 | **7 PASSED** | Path traversal, symlink safety, upload constraints |
| `backend/tests/test_readiness.py` | 12 | **12 PASSED** | Production readiness, baseline model validation |

---

## 3. Live Application Testing & Verification

Live application servers were launched and verified via HTTP requests over port 8000.

### A. Production Profile Verification (Default)

Server launched with default settings (`SER_MODEL_PROFILE` unset):

1. **`GET /api/health`:**
   - Status: `200 OK`
   - Payload: `{"status": "ok", "model_ready": true}`
2. **`GET /api/model/status`:**
   - Status: `200 OK`
   - Active Profile: `"production"`
   - Model Name: `"SVM (RBF, C=5)"`
   - OOD Safeguard: `true`
   - OOD Threshold: `10.12` (296-D acoustic space)
3. **`GET /api/model/info`:**
   - Status: `200 OK`
   - Architecture: `StandardScaler then SVC (C=5, class_weight=balanced, gamma=scale, kernel=rbf)`
   - Feature Dimension: `296`
4. **`POST /api/predict` (WAV Upload: `Neutral1.wav`):**
   - Status: `200 OK`
   - Model Profile Returned: `"production"`
   - Predicted Emotion: `"fear"` (confidence 43.86%, typical of production RBF sensitivity on conversational audio)
   - OOD Triggered: `true` (max deviation 62.52 vs 10.12 threshold)

---

### B. Experimental Profile Verification (`emotion2vec_experimental`)

Server launched with `SER_MODEL_PROFILE=emotion2vec_experimental`:

1. **Daemon Pre-Warming:**
   - Daemon initialized on startup: `emotion2vec+ sidecar worker is warm and ready.`
   - Model loaded into memory prior to serving user traffic.
2. **`GET /api/model/status`:**
   - Status: `200 OK`
   - Active Profile: `"emotion2vec_experimental"`
   - Model Name: `"emotion2vec+ (Base) + Logistic Regression (C=0.05)"`
   - OOD Safeguard: `true`
   - OOD Threshold: `3.83` (calibrated 99.5th percentile for 768-D space)
3. **`GET /api/model/info`:**
   - Status: `200 OK`
   - Architecture: `StandardScaler then LogisticRegression (C=0.05, class_weight=balanced, max_iter=500)`
   - Feature Dimension: `768`
   - Backbone: `emotion2vec/emotion2vec_plus_base`
4. **`POST /api/predict` (WAV Upload: `Sad2.wav`):**
   - Status: `200 OK`
   - Predicted Emotion: **`sad`**
   - Confidence: **`83.97%`**
   - Margin: **`0.7848`**
   - Score Breakdown:
     * `sad`: 0.8397
     * `fear`: 0.0549
     * `disgust`: 0.0504
     * `neutral`: 0.0366
     * `happy`: 0.0107
     * `angry`: 0.0077
   - OOD Status: `false` (max deviation: 1.54 vs threshold 3.83)
   - Profile Tag: `"emotion2vec_experimental"`
   - Speech-to-text Transcription: Synchronized English transcript delivered with word timestamps
5. **`POST /api/predict` (MP3 Upload: `Sad2.mp3.mpeg`):**
   - Status: `200 OK`
   - Predicted Emotion: **`sad`**
   - Confidence: **`83.98%`**
   - Margin: **`0.7849`**
   - OOD Status: `false` (max deviation: 1.54 vs threshold 3.83)
   - Latency: **1,778 ms** (including audio decoding, 768-D embedding extraction, classification, and Whisper transcription)
6. **`POST /api/timeline` (WAV Upload: `Sad2.wav`, window=2.0s, hop=1.0s):**
   - Status: `200 OK`
   - Total Segments Processed: 8
   - Successful Segments: 8 / 8 (0 failed)
   - Dominant Segment Emotion: `sad` (up to 89.76% top score)

---

### C. Profile Switching & Default Persistence

1. Environment variable removed (`Remove-Item Env:SER_MODEL_PROFILE`).
2. Server restarted and queried via `GET /api/model/status`.
3. Verified output:
   - Profile reverted immediately to `"production"`.
   - OOD threshold reverted to `10.12`.
   - Model name reverted to `"SVM (RBF, C=5)"`.
4. Confirms that switching profiles does not mutate production defaults or cause state leakage.

---

### D. Frontend Display Verification

Frontend source inspection confirmed compatibility with the experimental profile:
1. `frontend/src/api.ts`:
   - `ModelStatus` interface includes optional `profile?: string` and `ood_threshold?: number`.
   - `PredictResult` includes `model.profile` and `ood_details`.
2. `frontend/src/pages/Analyze.tsx`:
   - Line 1018 dynamically renders `activeItem.result.model.name` (displays `"emotion2vec+ (Base) + Logistic Regression (C=0.05)"`).
   - Line 1023 renders `activeItem.result.model.id`.
3. `frontend/src/pages/ModelInfoPage.tsx`:
   - Dynamically inspects the active bundle's architecture (`StandardScaler then LogisticRegression...`).
   - Preprocessing panel dynamically renders 768 features.

---

## 4. Cryptographic Hash Verification

All checkpoint files were verified using SHA-256 before and after live server tests:

| Artifact | File Path | SHA-256 Hash | Integrity Status |
| :--- | :--- | :--- | :--- |
| **Production Model** | `models/emotion_model.joblib` | `9DB13E3E393FC0B6283FF7EB7405BEB61C2170CEF7271A2E35452801B1E294C4` | **Unchanged (100% Intact)** |
| **Option 2 Staging** | `models/candidate_option2/emotion_model.joblib` | `576D50EB306FC79D078E851170E9790E3477DCCB27239075868BEE37598A80B4` | **Unchanged (100% Intact)** |
| **Candidate LR Head** | `experiments/emotion2vec_candidate/candidate_logistic_regression.joblib` | `1ED60EC67E6E8ABC41C4CA159ABB0E44ACB7525601A941E50172A4224B6A7F83` | **Unchanged (100% Intact)** |
| **Experimental Bundle** | `models/emotion2vec_experimental/emotion_model.joblib` | `43604BB217E1CAE02A5FCC12D6491CE1E45A466EFBAB691356BA296D3619A5CE` | **Verified Intact** |
| **Held-Out Test Embeddings** | `experiments/emotion2vec_candidate/test_embeddings.npz` | `89A841748F541481C6DF17CEA3CC32DF93A6218602FDFF7918AB004099740490` | **Unchanged (100% Intact)** |
| **Development Embeddings** | `experiments/emotion2vec_candidate/dev_embeddings.npz` | `4242FE4652B913762C6C851639BADE3EA2CA275F0D56C80E3350EA8200C43A61` | **Unchanged (100% Intact)** |

---

## 5. Summary & Conclusions

1. **Complete Backend Test Suite:** All 68 tests across 10 modules pass cleanly with zero failures or timeouts.
2. **Sidecar IPC Isolation:** Foundation neural model execution is completely encapsulated in `.venv_e2v`. The primary backend environment remains clean.
3. **Live Endpoint Parity:** Both `/api/predict` and `/api/timeline` function flawlessly on WAV and MP3 audio inputs.
4. **Pre-Warming Optimization:** Sidecar daemon pre-warming during application startup eliminates cold-start timeout risks and delivers warm inference in ~132 ms.
5. **No Model Overwrites:** Production and Option 2 artifacts remain completely untouched.
