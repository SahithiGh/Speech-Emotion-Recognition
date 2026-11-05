# Production Model Promotion Report: emotion2vec+ (Base) + Logistic Regression

**Execution Date**: 2026-11-04  
**Project**: Speech Emotion Recognition (SER) System  
**Promotion Target**: `emotion2vec+ (Base) + Logistic Regression (C=0.05)`  
**Baseline Model**: `SVM (RBF, C=5)` (Preserved with instant rollback support)  
**Option 2 Staging Model**: `SVM (RBF, C=5, Staging)` (Preserved)

---

## 1. Executive Summary

In accordance with controlled promotion protocols, the **emotion2vec+ (Base) + Logistic Regression (C=0.05)** model previously evaluated under `emotion2vec_experimental` has been successfully promoted to the primary **Production** model for the Speech Emotion Recognition system.

A clean, fresh application startup without any environment variables now boots directly into the high-performance **emotion2vec+** model, while preserving:
1. **Total Artifact Immutability**: No models were retrained, modified, overwritten, or deleted.
2. **Deterministic Rollback**: The original SVM model is preserved both at `models/emotion_model.joblib` and in `models/svm_rollback_backup/` with verified bit-for-bit SHA256 integrity.
3. **Option 2 Staging Integrity**: `models/candidate_option2/` remains completely preserved.
4. **All Functional Safeguards**: Audio quality assessment (heavy noise rejection, clipping, silence detection), mismatch popup alert, timeline segmentation, and transcript analysis remain 100% operational.
5. **Quality Verification**: Full backend test suite achieved **81/81 PASSED (100%)**, frontend production build passed cleanly, and live browser/API verification confirmed reliable end-to-end operation.

---

## 2. Checksum & Artifact Verification

### 2.1 Artifact Identification & Checksum Reconciliation
Before making any changes, all artifacts were inspected and cryptographically verified:

| Artifact Path | SHA256 Checksum | Purpose / Description | Status |
| :--- | :--- | :--- | :--- |
| `models/emotion2vec_production/emotion_model.joblib` | `43604BB217E1CAE02A5FCC12D6491CE1E45A466EFBAB691356BA296D3619A5CE` | **Promoted Primary Production Model** | **Active Default** |
| `models/emotion2vec_experimental/emotion_model.joblib` | `43604BB217E1CAE02A5FCC12D6491CE1E45A466EFBAB691356BA296D3619A5CE` | Canonical emotion2vec+ package bundle | **Verified Match** |
| `experiments/emotion2vec_candidate/candidate_logistic_regression.joblib` | `1ED60EC67E6E8ABC41C4CA159ABC0E44ACB7525601A941E50172A4224B6A7F83` | Raw sklearn Pipeline (Phase 4 training output) | **Reconciled** |
| `models/svm_rollback_backup/emotion_model.joblib` | `9DB13E3E393FC0B6283FF7EB7405BEB61C2170CEF7271A2E35452801B1E294C4` | Immutable SVM Rollback Archive | **Preserved** |
| `models/emotion_model.joblib` | `9DB13E3E393FC0B6283FF7EB7405BEB61C2170CEF7271A2E35452801B1E294C4` | Baseline SVM Root Artifact | **Preserved Untouched** |
| `models/candidate_option2/emotion_model.joblib` | `576D50EB306FC79D078E851170E9790E3477DCCB27239075868BEE37598A80B4` | Option 2 Staging Artifact | **Preserved Untouched** |

### 2.2 Investigation of Candidate Checksum (`1ed60ec6...`)
The checksum starting with `1ed60ec67e6e8abc` was investigated by inspecting its contents using `joblib.load`:
- **File**: `experiments/emotion2vec_candidate/candidate_logistic_regression.joblib` (38,417 bytes)
  - Type: Raw scikit-learn `Pipeline` object consisting of `StandardScaler()` and `LogisticRegression(C=0.05, class_weight='balanced', max_iter=500)`.
- **File**: `models/emotion2vec_experimental/emotion_model.joblib` (36,781 bytes)
  - Type: Application dictionary bundle containing `{"pipeline": Pipeline(...), "metadata": {...}, "preprocessing": {...}}`.
- **Numerical Identity Verification**:
  - `np.allclose(pipeline_raw.named_steps['clf'].coef_, bundle_pipeline.named_steps['clf'].coef_) == True`
  - `np.allclose(pipeline_raw.named_steps['clf'].intercept_, bundle_pipeline.named_steps['clf'].intercept_) == True`
  - `np.allclose(pipeline_raw.named_steps['scale'].mean_, bundle_pipeline.named_steps['scale'].mean_) == True`
  - `np.allclose(pipeline_raw.named_steps['scale'].scale_, bundle_pipeline.named_steps['scale'].scale_) == True`
  - `list(pipeline_raw.classes_) == list(bundle_pipeline.classes_) == ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad']`
- **Conclusion**: The raw pipeline file and the experimental bundle file represent the **exact same trained mathematical model**. The packaging bundle adds metadata and configuration for runtime serving.

---

## 3. Architecture & Code Updates

### 3.1 Model Registry & Profile Configuration (`backend/app/config.py`)
1. **Default Profile**: `SER_MODEL_PROFILE` defaults to `"production"`.
2. **Production Resolution**:
   - `MODEL_PATH` resolves to `models/emotion2vec_production/emotion_model.joblib` (fallback to `models/emotion2vec_experimental/emotion_model.joblib`).
   - `PRODUCTION_MODEL_PATH` points to the canonical emotion2vec+ production artifact.
3. **Rollback Profile**: Added profile `"svm_rollback"` (aliases: `"svm"`, `"baseline"`), resolving to `models/svm_rollback_backup/emotion_model.joblib`.
4. **Staging Profile**: `"staging"` / `"candidate_option2"` continues to resolve to `models/candidate_option2/emotion_model.joblib`.
5. **Experimental Alias**: `"emotion2vec_experimental"` continues to resolve cleanly.

### 3.2 Dynamic Input Dimension Detection (`backend/app/predict.py` & `backend/app/timeline.py`)
Rather than relying solely on string profile matching, feature extraction dynamically queries the pipeline input dimension:
```python
scaler = getattr(bundle["pipeline"], "named_steps", {}).get("scale") or getattr(bundle["pipeline"], "named_steps", {}).get("scaler")
clf = getattr(bundle["pipeline"], "named_steps", {}).get("clf")
n_feats = None
if scaler is not None and hasattr(scaler, "mean_"):
    n_feats = scaler.mean_.shape[0]
elif clf is not None and hasattr(clf, "n_features_in_"):
    n_feats = clf.n_features_in_
else:
    n_feats = bundle.get("preprocessing", {}).get("n_features")

is_e2v = (n_feats == 768)
```
- For **768-D** models (promoted emotion2vec+): Calls `extract_e2v_embedding(y)`.
- For **296-D** models (SVM rollback or developer test runs): Calls `extract_features(y)`.
This prevents shape mismatch errors (`ValueError: X has 768 features, but StandardScaler is expecting 296`) when unit tests create mock models or when rolling back.

### 3.3 Dynamic OOD Threshold & Status Reporting (`backend/app/main.py`)
The `/api/model/status` endpoint dynamically reports model parameters based on the active profile:
- **Production (`emotion2vec+`)**: OOD safeguard threshold is set to `3.83` (calibrated on 768-D latent embeddings).
- **SVM Rollback**: OOD safeguard threshold is set to `10.12` (calibrated on 296-D acoustic features).

### 3.4 Frontend StatusBadge & UI Labels (`frontend/src/components/Layout.tsx`)
The global navigation badge reads the active profile from the backend health/status API:
- `production` -> `Model ready (Production)`
- `emotion2vec_experimental` -> `Model ready (Experimental)`
- `staging` -> `Model ready (Staging)`
- `svm_rollback` -> `Model ready (SVM Rollback)`

---

## 4. Automated Verification Results

### 4.1 Backend Test Suite (Pytest)
Command: `pytest backend/tests -v`
- **Result**: **81 passed, 0 failed, 20 warnings in 155.95s (100% Pass Rate)**
- Test modules verified:
  1. `test_advanced.py`: 10/10 passed (spectrograms, timeline analysis, transcription plumbing).
  2. `test_api_and_training.py`: 4/4 passed (API contracts, dataset verification, full round-trip train/eval/predict).
  3. `test_audio_eval.py`: 9/9 passed (WAV/MP3 decoding, resampling, bootstrap & speaker metrics).
  4. `test_audio_quality.py`: 11/11 passed (heavy noise rejection, clean speech pass-through, silence & clipping handling).
  5. `test_auth_and_analyses.py`: 5/5 passed (user isolation, auth lifecycle, consistency logic).
  6. `test_candidate_option2.py`: 7/7 passed (staging bundle integrity, mono/stereo, edge cases).
  7. `test_dataset.py`: 7/7 passed (CREMA-D facts, LFS pointer detection, CV folds).
  8. `test_download.py`: 3/3 passed (integrity verification, resume, corruption detection).
  9. `test_emotion2vec_profile.py`: 6/6 passed (promoted production profile, SVM rollback profile, e2v sidecar IPC).
  10. `test_fs_safety.py`: 7/7 passed (directory traversal safety, safe extraction, backup checks).
  11. `test_readiness.py`: 12/12 passed (health separation, error shielding, rate limits).

### 4.2 Frontend Build
Command: `npm --prefix frontend run build`
- **TypeScript Check**: `tsc --noEmit` passed with 0 errors.
- **Vite Bundle**: Built in 2.05s, 1629 modules transformed cleanly.

---

## 5. Live Application Verification

### 5.1 Default Startup (No Environment Variables)
- **Startup Command**: `uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`
- **Backend Logs**:
  ```
  INFO model state at startup: ready
  INFO Transcription engine 'faster-whisper' is warm and ready.
  INFO Starting emotion2vec+ sidecar worker daemon...
  INFO emotion2vec+ sidecar worker is warm and ready.
  INFO Application startup complete.
  ```
- **GET `/api/model/status`**:
  ```json
  {
    "trained": true,
    "state": "ready",
    "emotions": ["angry", "disgust", "fear", "happy", "neutral", "sad"],
    "model_name": "emotion2vec+ (Base) + Logistic Regression (C=0.05)",
    "dataset_verification": "frozen_768d_crema_d",
    "profile": "production",
    "ood_safeguard": true,
    "ood_threshold": 3.83
  }
  ```

### 5.2 Real Audio Upload Verification (Production Profile)
| Audio File | Format | Duration | Audio Quality Status | Prediction Result | Confidence | Acceptance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Happy2.wav` | WAV | 10.61s | `GOOD` | **Happy** | **99.57%** | Accepted |
| `Happy2.mp3.mpeg` | MP3 | 10.58s | `GOOD` | **Happy** | **99.57%** | Accepted |
| `Sad2.wav` | WAV | 8.69s | `GOOD` | **Sad** | **83.97%** | Accepted |
| `Sad2.mp3.mpeg` | MP3 | 8.66s | `GOOD` | **Sad** | **83.98%** | Accepted |
| `Noisy1.wav` | WAV | 5.20s | `NOISY` | *Suppressed* | *0.00%* | **Rejected** |
| `Noisy2.wav` | WAV | 4.80s | `NOISY` | *Suppressed* | *0.00%* | **Rejected** |

### 5.3 Live Browser Verification (Chrome via Puppeteer)
- **StatusBadge**: Displays `"Model ready (Production)"` with green indicator.
- **Model Information Page (`/model`)**: Displays `"emotion2vec+ (Base) + Logistic Regression"`, parameters `C=0.05`, and 6 emotion classes.
- **Console Errors**: 0 errors.

### 5.4 Rollback Verification (`SER_MODEL_PROFILE=svm_rollback`)
- **Startup**: Backend successfully loaded `models/svm_rollback_backup/emotion_model.joblib`.
- **GET `/api/model/status`**:
  - `profile`: `"svm_rollback"`
  - `model_name`: `"SVM (RBF, C=5)"`
  - `ood_threshold`: `10.12`
- **Audio Uploads**: `Happy2.wav` predicted without sidecar dependency; `Noisy1.wav` properly rejected.

---

## 6. Rollback Runbook

If a quick rollback to the baseline SVM model is ever required in any operational environment:

### Method A: Zero-Code Instant Environment Switch (Recommended)
Set the environment variable before starting the application:
```bash
# Windows PowerShell
$env:SER_MODEL_PROFILE="svm_rollback"
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# Linux / macOS Bash
SER_MODEL_PROFILE=svm_rollback python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

### Method B: Physical File Restore
Copy the verified backup files directly over the root models directory:
```bash
# Windows PowerShell
Copy-Item "models\svm_rollback_backup\emotion_model.joblib" "models\emotion_model.joblib"
Copy-Item "models\svm_rollback_backup\metrics.json" "models\metrics.json"
Copy-Item "models\svm_rollback_backup\preprocessing_config.json" "models\preprocessing_config.json"
```
Both rollback procedures are tested, documented, and fully operational.

