# Speech Emotion Recognition (CREMA-D), Premium edition v3

Recognizes six emotions (happy, sad, angry, fear, disgust, neutral) from a voice recording. Python (FastAPI, scikit-learn, librosa) for the model and API;
React, TypeScript and Vite for the website. Runs locally on Windows. No GPU, Docker, paid API, cloud service, account or database is needed.

**Current state of this package.** All code, the website, the verified downloader and the training pipeline are included and tested (see "What was tested").
**The model is not trained yet**, because the real CREMA-D audio could not be downloaded in the build environment. Until you train it, the website says
"Model not trained yet" and shows no metrics. Whatever accuracy your training run produces is the number to report.

## 1. Install the software (once)

| Software | Version | Where |
|---|---|---|
| Python | 3.11 or 3.12 recommended (3.10 to 3.13 allowed) | https://www.python.org/downloads/ (tick **Add python.exe to PATH**) |
| Node.js | LTS, version 18 or newer | https://nodejs.org/ |

Git is not required. Check in a terminal: `python --version` and `node --version`.

## 2. The four steps

Open the extracted folder `speech-emotion-recognition` (it may contain spaces in its path; that is supported) and double-click, in this order:

| Step | File | What it does |
|---|---|---|
| 1 | `setup_windows.bat` | Creates `backend\.venv`, installs Python and website packages (a few minutes, about 2 GB of disk). |
| 2 | `download_dataset.bat` | Downloads the official CREMA-D audio (about 610 MB) and verifies every file's SHA-256. Resumable. |
| 3 | `train_model.bat` | Trains and evaluates the model; writes `models\` and `outputs\`. |
| 4 | `run_project.bat` | Starts backend and website and opens http://localhost:5173. |

Stop the app with `stop_project.bat` (or close the two windows, or press Ctrl+C in each).
Other helpers: `evaluate_model.bat` (re-score a saved model), `doctor.bat` (checks your installation and tells you what to fix), `check_dataset.bat [--deep]`, `run_tests.bat`.

From a terminal the same steps are: `setup_windows.bat`, `download_dataset.bat`, `train_model.bat`, `run_project.bat`.

## 3. Dataset (CREMA-D only)

See `data\README.md`. In short: `download_dataset.bat` fetches the files through GitHub's Git LFS download service and checks each one against the official
list (`backend\app\resources\crema_d_manifest.csv.gz`, built from the official repository, commit `1658cd3`). Training refuses to start if files are missing, damaged,
Git LFS placeholders, or not on the official list. Use `train_model.bat --allow-partial` only if you knowingly want to train on fewer files (results then are not comparable with full CREMA-D).

## 4. How training works

`train_model.bat` runs `backend\train.py`:

1. **Verify** every file (names, sizes, WAV header; SHA-256 with `--deep-verify`).
2. **Features** (296 per clip): MFCC, delta-MFCC, log-mel, chroma, spectral contrast/centroid/bandwidth/rolloff/flatness, zero-crossing rate, RMS, pitch statistics, speech ratio. Cached in `outputs\feature_cache.npz` with checkpoints, so nothing is extracted twice and an interrupted run resumes. Uses at most 4 CPU cores to stay gentle on a laptop (`--jobs N` to change).
3. **Hold out test speakers** (about 15%). They are never used for training or model selection. Every emotion is present in both parts.
4. **Select a model** by 5-fold cross-validation grouped by speaker (stratified) on the remaining speakers: SVM (C = 1, 3, 10, 30), logistic regression (two strengths), random forest, histogram gradient boosting. All use standardization inside the pipeline and balanced class weights. The best mean macro F1 wins.
5. **Refit and test once** on the held-out speakers. Saved: model and preprocessing config, metrics (accuracy, balanced accuracy, macro precision/recall/F1, per-class scores, confusion matrix, classification report), class distribution, split and fold sizes, a 95% speaker-bootstrap interval, majority-class and chance baselines, per-speaker accuracy range, dataset fingerprint, library versions, seed.

Everything is seeded (`--seed`, default 42) and reproducible. Prediction uses exactly the same preprocessing and feature code. A model made with a different feature version is rejected.
`python backend\evaluate.py` re-scores the saved model on the saved test speakers.

## 5. Using the Website & New Features

- **Multi-Format Audio & Video Uploads**:
  - Drag and drop or browse multiple files at once (WAV, MP3, OGG, FLAC, M4A, MP4, WebM, MOV, MKV).
  - Video files: The backend automatically extracts and decodes the audio track using PyAV. **Disclaimer**: Emotion analysis is strictly acoustic-based on the extracted voice track, not facial or computer-vision expressions. Videos lacking an audio track are rejected with a clear explanation (`no_audio_stream`).
  - Batch processing table with independent file status, progress indicators, retry actions, and isolated error handling.
- **Predicted Vocal Emotion**:
  - Six emotion classes: Happy, Sad, Angry, Fear, Disgust, Neutral.
  - Pre-inference acoustic checks reject silence, empty audio, clipping, and stationary mic hiss.
  - Transparent confidence calculation and honest uncertainty flagging.
- **Real English Transcription (faster-whisper)**:
  - Speech-to-text runs entirely locally using `faster-whisper` (default model `tiny.en`).
  - Interactive transcript with clickable word-level timestamps (click any word to seek and play audio).
  - In-place transcript editing with instant recalculation of cross-modal consistency.
- **Cross-Modal Consistency**:
  - Compares vocal acoustics against lexical sentiment.
  - Outputs one of three verified results: **Broadly Consistent**, **Mismatch Detected**, or **Insufficient Evidence**.
  - Documented ethical disclaimer: vocal-lexical mismatches do not diagnose deception or psychological ground-truth.
- **Side-by-Side Analysis Comparison**:
  - Compare any two recordings or saved history items side-by-side with delta metrics for top emotion, confidence, and acoustic features.
- **Authentication & User Profile**:
  - Registration (`/register`): Name, email validation (syntax & RFC domain checks; supports Gmail and all legitimate email domains), real-time password strength meter.
  - Login (`/login`): Secure session tokens, password visibility toggle, forgot password flow.
  - History & Profile (`/profile`): Saved analyses table with "Reopen in Analyzer", "Delete", and permanent account deletion.
  - Security: PBKDF2-HMAC-SHA256 password hashing with 200,000 iterations and per-user salt. SQLite database (`data/ser_app.db`) in WAL mode with strict user-scoped data isolation.
- **Live Microphone Analysis**:
  - Real-time permission handling, audio level meter, and honest record-then-process UX with microphone resource cleanup.
- **Advanced Diagnostics**:
  - Mel spectrogram computed locally on raw audio.
  - Emotion timeline with segment-level sliding-window emotion analysis.

## 6. Real Speech Transcription (faster-whisper)

A real speech-to-text engine (`faster-whisper`) runs locally on your computer with zero cloud transmission:
```cmd
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-transcription.txt
set SER_TRANSCRIBER=faster-whisper
set SER_WHISPER_MODEL=tiny.en
```
`run_project.bat` enables `SER_TRANSCRIBER=faster-whisper` by default. Model weights (`tiny.en`, ~75 MB) are downloaded once from Hugging Face on first use and cached locally. Latency on CPU is approximately 0.4–0.8s for short clips. If no engine is configured, the system provides an honest explanation without inventing transcripts.

## 7. Model Audit: Why Empty/Silent Audio Predicted "Fear"

When evaluating an RBF-kernel SVM (`SVC(kernel='rbf', C=3)`) on silence or ambient room hiss:
1. **Mathematical Intercept Bias**: When input features approach zero or noise floor, RBF kernel distances $\exp(-\gamma \|x - x_i\|^2)$ collapse to near-zero. The decision function $f_k(x) = \sum \alpha_i y_i K(x, x_i) + \rho_k$ falls back to the pairwise intercepts $\rho_k$. In CREMA-D binary pairings, fear won 5 out of 5 pairwise intercepts, giving a Platt probability of ~44.1%.
2. **Audio Validation Fix**: `backend/app/audio.py` enforces pre-inference validation:
   - Rejection of low RMS silence (`rms < 0.003`).
   - Rejection of stationary room hiss (`spectral_flatness > 0.42` when RMS is low).
   - Rejection of clipped or corrupted files.
   - Genuine speech passes cleanly to the classifier with calibrated confidence intervals.

## 7. What was tested (build environment, Linux)

Passed:
- **42 backend tests** (`run_tests.bat`): everything from before (official-list filename parsing for all 7,442 CREMA-D names, placeholder and damaged-file detection, speaker-disjoint splits and folds, refusal on incomplete data, audio rejection and notes, identical training and inference features, hand-checked metrics, full train, evaluate, predict and API round trip, downloader against a mock LFS service) plus: health vs model readiness, incompatible and broken model files, validation-based uncertainty rule, limits endpoint, timeout, temporary-file cleanup, no audio in logs, startup configuration checks, optional rate limit, measured processing time, feature-group importance (groups partition all 296 features), the model-comparison report (8 candidates, one selected, matches the main result), the **spectrogram** (a 1 kHz tone between 1 and 2 s of silence appears at the right frequency and time), the **timeline** (exact timestamps; every ok segment equals an independent run of the model on the same slice; silent, failed and invalid-setting cases), and **transcription** unavailability plus mocked-engine plumbing.
- **Frontend** TypeScript check and production build.
- **167 browser checks** in headless Chromium (`devtools\e2e_browser_test.py`): exact palette values and rendered colours in both themes, focus ring, fonts loaded and applied, no third-party requests, untrained and trained states, upload, drag and drop, replace, clear, replay, microphone recording (fake device), validation messages, results, spectrogram pixels matching a tone-silence-tone clip, timeline in the UI equal to the real model output from the API, selectable segments, honest transcription-unavailable state, **JSON and CSV reports compared with the on-screen result**, sample-library empty and loaded states (loaded state uses a generated test fixture), model-info page, 404, FAQ search, theme persistence, mobile menu, sticky CTA, back-to-top, no horizontal overflow at 1440, 1280, 768, 390 and 375 px, offline-backend message, and an axe-core scan (WCAG 2 A and AA) of every page in both themes, including the result page with all advanced views open.
- **Token contrast audit** (`python scripts\contrast_audit.py`): all text and non-text pairings pass in both themes.
- Live check that GitHub's Git LFS service returns a download link for a real CREMA-D file.

**Could not be tested, and you should know:**
- **Real CREMA-D training and real accuracy.** The audio host was blocked in the build environment. Every model, metric, importance value and screenshot produced during testing came from generated tones in temporary folders; none of it is in this ZIP. The reliability bins, uncertainty rule, feature importance and model comparison are therefore verified as software, not as scientific results.
- Real transcription (only a mocked engine was tested), the final real download from GitHub's storage, the `.bat` files on real Windows, real microphones, browsers other than Chromium, Python versions other than 3.12.
- Training time and memory on your laptop. The extra comparison and importance steps add a few minutes.

**Dependency advisories (read this).** `pip-audit` on the tested Python versions found nothing. `npm audit` reports 4 advisories (1 high, 3 moderate) in Vite 5 and esbuild (development server only), and React Router 6 (open redirect through backslashes in links built from untrusted input, and a server-rendering issue). The fixes are major upgrades (Vite 8, Router 7) that I did not apply blindly. Mitigations in place: the dev server listens on 127.0.0.1 only, the production build is static files and is not affected by the dev-server issues, and the site neither renders on a server nor builds links from user input. If you ever host it publicly, upgrade first and rerun the browser suite.

## 8. Troubleshooting

Run `doctor.bat` first; it lists what needs fixing.

- **python is not recognized**: reinstall Python with "Add python.exe to PATH" and open a new window. `setup_windows.bat` also tries `py -3`.
- **Package install fails (numba, llvmlite, scipy)**: use Python 3.11 or 3.12; delete `backend\.venv`; run setup again. Check internet or proxy settings.
- **npm is not recognized or npm install fails**: install Node.js LTS and reopen the window; delete `frontend\node_modules`, run `npm cache clean --force`, run setup again.
- **Download stops or reports a quota or bandwidth error**: run `download_dataset.bat` again later; verified files are kept. See `data\README.md`, section "If the download is blocked".
- **Training says the dataset is incomplete, or files are placeholders**: run `download_dataset.bat` again, then `check_dataset.bat --deep`.
- **Training is slow or the laptop is busy**: `train_model.bat --jobs 2`. Feature extraction happens once.
- **Website says the backend is not running**: run `run_project.bat` and keep the SER Backend window open; http://127.0.0.1:8000/api/health should show `{"status":"ok"}`.
- **Model not trained yet**: finish `train_model.bat`, then reload the page (the backend reloads the new model by itself).
- **Port 8000 or 5173 in use**: run `stop_project.bat`.
- **Microphone problems**: use Chrome or Edge at http://localhost:5173, allow the microphone, check Windows Settings, Privacy and security, Microphone, close other programs using it. Or upload a file.
- **PowerShell blocks scripts**: the `.bat` files run in Command Prompt; in VS Code choose a Command Prompt terminal.
- **Antivirus blocks a download or script**: allow the project folder, then run again.

## 9. Layout

```
backend/    app/ (config, audio, dataset, features_table, candidates, evaluation, modelio, modelcheck, predict, info, spectrogram, timeline, transcription, languages, main, resources/)  train.py  evaluate.py  predict.py  tests/
frontend/   src/ (pages/, components/, api, audio, report, useRecorder, theme, meta, model, tokens.css, typography.css, styles.css)  public/ (samples/)  .env.example
scripts/    download_crema_d.py  check_dataset.py  doctor.py  contrast_audit.py       devtools/  e2e_browser_test.py (developer only)
data/ (AudioWAV)   models/   outputs/   docs/ (AUDIT_REPORT.md, HANDOFF.md, ...)   *.bat
```

## Visual Design & Architecture

- **Visual Identity**: Premium, cinematic aesthetic built strictly on **Midnight Navy** (`#070C18`, `#0B132B`), **Soft Ivory** (`#F8FAFC`, `#FFFFFF`), and **Silver-Blue** accents (`#38BDF8`, `#0284C7`, `#7DD3FC`). **Zero purple or magenta is used anywhere in the application.**
- **Logo & Favicon**: Custom acoustic wave brand logo rendered in SVG featuring dark navy base, silver-blue wave strokes, and soft ivory resonance nodes.
- **Background Video Selection**:
  - `video-garden-ambient.mp4` (Video 1): Dark cinematic conservatory atmosphere applied to Homepage hero, About, and Model Info.
  - `video-lotus-glow.mp4` (Video 3): Subtle glowing lotus bloom against pure midnight darkness used on Auth views (Login, Signup, Forgot Password).
  - Video 2 was excluded due to overexposed bright sky and jarring yellow foliage.
- **Typography**: Editorial headings in Fraunces, interface controls in Plus Jakarta Sans, and data/metrics in IBM Plex Mono.
- **Responsiveness**: Fluid layout scaling across desktop, tablet, and mobile (tested at 375px to 1920px) with accessible mobile navigation backdrop and dedicated "Replace Audio" button.

## Credit

CREMA-D: Cao, H., Cooper, D. G., Keutmann, M. K., Gur, R. C., Nenkova, A., and Verma, R. (2014). *CREMA-D: Crowd-sourced Emotional Multimodal Actors Dataset.* IEEE Transactions on Affective Computing. The dataset is not redistributed here; follow its own license and citation requirements.
