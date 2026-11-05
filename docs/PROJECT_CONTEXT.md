# PROJECT_CONTEXT

**Project:** Speech Emotion Recognition using Machine Learning (third-year B.Tech IT minor project).
**Goal:** predict one of six emotions (happy, sad, angry, fear, disgust, neutral) from a voice recording, with a professional local website.
**Dataset:** CREMA-D only (https://github.com/CheyneyComputerScience/CREMA-D), acted speech, 7,442 clips, 91 speakers. No other data, no synthetic training data.
**Stack (fixed by the owner):** React + TypeScript + Vite; Python + FastAPI; scikit-learn + librosa; REST. Windows, no GPU/Docker/paid APIs/cloud.

## Owner instructions that must be preserved
- Never fabricate metrics, never claim training succeeded unless it did; show "Model not trained yet" otherwise.
- Speaker-independent evaluation (test speakers never used for training or selection). Evaluate with accuracy, precision, recall, macro F1, classification report, confusion matrix.
- Real-voice recordings are inference-only; never silently added to training.
- Design: blue and white, professional. Avoid purple, scroll animations, fake metrics/reviews, emoji icons, AI-generated imagery, "Made with AI" labels.
- Plain English explanations; exact commands and paths; do not ask for secrets.

## Pages
| Route | Purpose |
|---|---|
| `/` | Title, simple explanation, start button, 4-step "how it works", six emotions, live model status |
| `/analyze` | Upload or record, playback, Analyze audio, loading state, result with six scores, warning, analyze another |
| `/evaluation` | Real metrics from `outputs/metrics.json`; "Model not trained yet" if absent |
| `/about` | CREMA-D, six emotions, workflow, limitations, privacy |
| `/faq` | Searchable FAQ |
| `/contact` | Contact (shows no address unless configured) |
| `/privacy`, `/terms` | Plain-language policies |
| `*` | 404 page |

## API
`GET /api/health`, `GET /api/model/status`, `GET /api/metrics`, `POST /api/predict` (multipart field `file`).
Errors: 413 too large, 422 bad audio, 503 model missing; body `{"detail":{"code","message"}}`.

## Decisions
- Browser converts any recording/upload to 16 kHz mono WAV (Web Audio API) so the backend needs no ffmpeg. Backend also reads WAV/FLAC/OGG/MP3 directly.
- Model chosen on validation speakers only; test speakers scored once. SVM probabilities enabled for confidence scores.
- Feature cache in `outputs/feature_cache.npz` keyed by file name and feature version.
- Vite dev proxy forwards `/api` to port 8000, so the frontend uses relative URLs.
- Rejected: Docker, deep learning/GPU, extra datasets, microservices.

## Limits
Acted speech; six forced choices; mic/accent/noise effects; estimates only.
