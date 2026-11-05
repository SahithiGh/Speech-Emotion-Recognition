# Phase 8: Frontend and User Acceptance Testing (UAT) Report

**Target Verification:** Speech Emotion Recognition Web Application  
**Profiles Evaluated:** Production (`production`) & Experimental (`emotion2vec_experimental`)  
**Frontend Stack:** React 18, TypeScript, Vite (Port 5173)  
**Backend Stack:** FastAPI, Python 3.13, Uvicorn (Port 8000)  
**Execution Date:** November 2026  

---

## 1. Executive Summary

Phase 8 evaluated the live user experience, browser rendering, audio file ingestion, and profile switching between the production baseline model and the isolated `emotion2vec_experimental` profile. Testing was conducted using headless Chrome automation with full screenshot capture, console log inspection, and backend log verification.

### Core Outcomes:
1. **Zero UI Redesign or Dependency Changes:** Frontend and backend dependencies were executed as-is without modification.
2. **End-to-End Pipeline Validation:** Audio uploads across both WAV and MP3 formats decoded cleanly and produced real-time emotion classifications with score distributions, waveform visualizations, and speech-to-text transcriptions.
3. **Model Identifiability:** Active model architecture, parameter configurations, and feature dimensions are dynamically exposed in the `/model` view and on `/analyze` under "Model and Analysis Metadata".
4. **OOD Safeguards:** Production correctly flagged external conversational audio as out-of-distribution (max deviation 62.52 vs 10.12 threshold), while `emotion2vec_experimental` recognized `Sad2.wav` and `Sad2.mp3` as in-distribution (max deviation 1.54 vs 3.83 threshold).
5. **Clean Reversion:** Unsetting the environment variable immediately restores production model behavior (`SVM (RBF, C=5)`) with zero state leakage.
6. **Benchmark Disclosures:** All metrics remain framed within the context of CREMA-D evaluation; no unvalidated claims of 96% real-world conversational reliability are made.

---

## 2. Test Matrix and Visual Artifacts

All test screenshots are preserved in `experiments/phase8_screenshots/`:

| Step | Profile | View / Action | Artifact Screenshot | Result |
| :---: | :--- | :--- | :--- | :---: |
| 1 | Production | Model Architecture & Facts | [`01_prod_model_info.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/01_prod_model_info.png) | **PASS** |
| 2 | Production | Normal WAV Upload (`1001_DFA_ANG_XX.wav`) | [`02_prod_wav_analysis.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/02_prod_wav_analysis.png) | **PASS** |
| 3 | Production | MP3 Upload (`Sad2.mp3.mpeg`) | [`03_prod_mp3_analysis.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/03_prod_mp3_analysis.png) | **PASS** |
| 4 | Production | OOD Warning Banner (`Neutral1.wav`) | [`04_prod_ood_warning.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/04_prod_ood_warning.png) | **PASS** |
| 5 | Production | Corrupted Audio Error (`test_corrupted.wav`) | [`05_prod_error_handling.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/05_prod_error_handling.png) | **PASS** |
| 6 | Experimental | Model Architecture & Facts (768-D) | [`06_exp_model_info.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/06_exp_model_info.png) | **PASS** |
| 7 | Experimental | WAV Upload (`Sad2.wav`) -> Emotion `sad` | [`07_exp_wav_sad2.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/07_exp_wav_sad2.png) | **PASS** |
| 8 | Experimental | MP3 Upload (`Sad2.mp3.mpeg`) -> Emotion `sad` | [`08_exp_mp3_sad2.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/08_exp_mp3_sad2.png) | **PASS** |
| 9 | Experimental | Segmented Acoustic Timeline | [`09_exp_timeline.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/09_exp_timeline.png) | **PASS** |
| 10 | Production | Reversion Verification | [`10_revert_prod.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/10_revert_prod.png) | **PASS** |
| 11 | Production | StatusBadge UI Improvement: `Model ready (Production)` | [`11_badge_production.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/11_badge_production.png) | **PASS** |
| 12 | Experimental | StatusBadge UI Improvement: `Model ready (Experimental)` | [`12_badge_experimental.png`](file:///D:/speech-emotion-recognition/experiments/phase8_screenshots/12_badge_experimental.png) | **PASS** |

---

## 3. Production Profile Verification

### A. Model Information View (`/model`)
- **Status:** Ready
- **Model Name:** `SVM (RBF, C=5)`
- **Model ID:** `9db13e3e393f`
- **Architecture:** `StandardScaler then SVC (SVC, parameters: C=5, class_weight=balanced, gamma=scale, kernel=rbf, max_iter=-1)`
- **Feature Pipeline:** 296 acoustic features (MFCC, log-mel, chroma, spectral contrast, pitch YIN, etc.)
- **Expected Input:** Mono speech, resampled to 16 kHz, 0.5 to 6.0 seconds

### B. Prediction and File Ingestion
- **WAV Ingestion (`1001_DFA_ANG_XX.wav`):**
  - Processing Latency: `1,301 ms`
  - Model Displayed: `SVM (RBF, C=5)`
  - Status: Normal in-distribution inference
- **MP3 Ingestion (`Sad2.mp3.mpeg`):**
  - Processing Latency: `1,301 ms`
  - Audio Format Handling: Resampled and decoded cleanly without client errors
- **Out-of-Distribution Detection (`Neutral1.wav`):**
  - OOD Warning: Triggered (`max_deviation`: 62.52 vs 10.12 threshold)
  - UI Warning Callout: Rendered advisory banner highlighting acoustic divergence
- **Corrupted Audio File (`test_corrupted.wav`):**
  - Server returned `422 Unprocessable Content`
  - UI surfaced error alert gracefully without freezing the upload queue

---

## 4. Experimental Profile Verification (`emotion2vec_experimental`)

### A. Model Information View (`/model`)
- **Status:** Ready
- **Model Name:** `emotion2vec+ (Base) + Logistic Regression (C=0.05)`
- **Model ID:** `43604bb217e1`
- **Architecture:** `StandardScaler then LogisticRegression (parameters: C=0.05, class_weight=balanced, max_iter=500)`
- **Preprocessing Features:** `768` (frozen utterance embeddings via `emotion2vec/emotion2vec_plus_base`)
- **Uncertainty Calibration:** Held-out test set logistic calibrated probabilities

### B. Live Audio Ingestion
- **WAV Ingestion (`Sad2.wav`):**
  - **Predicted Emotion:** **`sad`**
  - **Confidence:** **`83.97%`** (Margin: `0.7848`)
  - **Processing Latency:** `2,037 ms` (including sidecar IPC extraction and Whisper transcription)
  - **Model Attribution:** `emotion2vec+ (Base) + Logistic Regression (C=0.05)` (ID: `43604bb217e1`)
  - **OOD Status:** `false` (`max_deviation`: 1.54 vs threshold 3.83)
- **MP3 Ingestion (`Sad2.mp3.mpeg`):**
  - **Predicted Emotion:** **`sad`**
  - **Confidence:** **`83.98%`** (Margin: `0.7849`)
  - **Processing Latency:** **`707 ms`** (warm inference)
  - **Model Attribution:** `emotion2vec+ (Base) + Logistic Regression (C=0.05)`
  - **OOD Status:** `false` (`max_deviation`: 1.54 vs threshold 3.83)
- **Acoustic Timeline Analysis:**
  - Evaluated across 2.0s rolling windows (1.0s hop)
  - Successfully produced 8 continuous segment predictions with zero worker stalls

---

## 5. User Experience & Model Identifiability Observations

### How Active Profile Is Identified by the User:
1. **On `/model` Page:** The active architecture and model name clearly identify whether the production RBF SVM or the experimental Logistic Regression / emotion2vec+ pipeline is running.
2. **On `/analyze` Page:** Each completed prediction card displays a dedicated "Model and Analysis Metadata" definition list showing:
   - `Model`: `SVM (RBF, C=5)` vs `emotion2vec+ (Base) + Logistic Regression (C=0.05)`
   - `Model ID`: `9db13e3e393f` vs `43604bb217e1`
   - `Audio Length` & `Processing Time`
3. **Batch Item List:** Each row shows the predicted vocal emotion, consistency status, and actions.

### StatusBadge Dynamic Profile UI Implementation:
- In the global navigation bar (`Layout.tsx`), the `StatusBadge` was upgraded to dynamically reflect the active profile reported by `GET /api/model/status`:
  * Default Production Profile: **`Model ready (Production)`**
  * Experimental Profile: **`Model ready (Experimental)`**
  * Staging Profile: **`Model ready (Staging)`**
  * Loading / Offline / Incompatible states: Preserved gracefully (`Checking`, `Offline`, `Incompatible`, `Not trained`).
- The update preserves existing CSS styles (`.badge.ok`, `.badge.warn`), SVG icons, and responsive breakpoints.
- Both profile badges were tested in headless Chrome and verified with 0 console errors:
  * `11_badge_production.png`: Verified `"Model ready (Production)"`
  * `12_badge_experimental.png`: Verified `"Model ready (Experimental)"`

---

## 6. Browser Console & Backend Log Inspection

- **Console Exceptions:** 0 uncaught JavaScript exceptions were logged across all views.
- **Network Errors:** Expected HTTP 422 logged during negative testing of corrupted audio (`test_corrupted.wav`); frontend handled the error cleanly without breaking application state.
- **Backend Logs:** No pipe deadlocks or unhandled exceptions occurred in either the main FastAPI process or the isolated `.venv_e2v` sidecar worker daemon.
- **Worker Lifecycle:** Sidecar worker cleanly initialized, pre-warmed on server startup, and terminated without orphaned processes.

---

## 7. Disclosures & Responsible AI Boundaries

1. **Benchmark Limitation Disclosure:** Upstream `emotion2vec+` was pretrained on 40,000 hours of multi-source audio, which included CREMA-D in its pretraining corpus. High test accuracy (90.93%) on the CREMA-D held-out split and empirical bin reliability (96% in the [0.8, 1.0] confidence interval) reflect this benchmark context.
2. **Real-World Conversational Audio:** As demonstrated in Phase 6, predictions on real-world conversational audio remain exploratory until validated against human-annotated ground truth. These predictions are advisory and must not be presented as definitive psychological assessments.
3. **No Promotion:** The experimental profile remains strictly isolated under `SER_MODEL_PROFILE=emotion2vec_experimental`. The production profile remains the default.

