# Audit of Speech_Emotion_Recognition_CREMA_D.zip (first version)

Method: the first ZIP (sha256 4d28880a...) was extracted and inspected; code was executed with probes; the official CREMA-D repository's file list and placeholder files were read through git (audio itself was unreachable).

| # | Finding | Evidence | Action |
|---|---|---|---|
| 1 | Missing files, broken imports, path errors | pyflakes clean, `pip check` clean, all 8 original tests passed | none needed |
| 2 | Frontend/backend API mismatch | all three URLs matched | none; new tests keep it checked |
| 3 | Filename parsing and labels | all 7,442 real names parse; 91 speakers; 1,271 x 5 emotions + 1,087 neutral | now asserted in a test against the bundled official list |
| 4 | Training and inference features | identical (max difference 0.0) | kept; test added |
| 5 | **Dataset could be partly placeholders and training would continue silently** | code path in train.py | training now refuses unless `--allow-partial`; every file checked against the official list (name, size, optional SHA-256); non-CREMA-D files rejected |
| 6 | **Download relied on Git + Git LFS and stored the data up to three times** (clone, LFS cache, copy) | download_dataset.bat | replaced with a stdlib downloader that streams to the final place, verifies SHA-256 per file, resumes |
| 7 | **Single 13-speaker validation split made model selection noisy** | design review | speaker-grouped stratified 5-fold CV on development speakers; test speakers touched once |
| 8 | No uncertainty or baselines reported | metrics.json | speaker bootstrap 95% interval, majority and chance baselines, per-speaker range, balanced accuracy, class distribution |
| 9 | Leakage check used `assert` (removed by `python -O`) | train.py | explicit exception |
| 10 | **No input duration cap** (a 10 minute file was accepted); no clipping or short-clip warning | probe | 60 s cap, notes for clipped, short and truncated audio |
| 11 | **Browser microphone processing (echo cancel, noise suppression, auto gain) left on**, distorting voices relative to the training audio | useRecorder.ts | switched off; uploads of WAV/MP3/OGG/FLAC are sent unconverted to avoid double resampling |
| 12 | Feature extraction used all CPU cores; cache lost if interrupted | features_table.py | at most 4 workers; checkpointed cache keyed by name and size |
| 13 | Pitch statistics included non-speech frames; no tempo or pause features | audio.py | pitch on speech frames only, speech ratio, energy percentiles, log-mel and flatness (296 features) |
| 14 | Dev tools (pytest, httpx) in runtime requirements | requirements.txt | split into requirements-dev.txt; tested versions in requirements-tested.txt |
| 15 | Batch files: nested quoting broke for paths with spaces; port clash undetected | review | `start /D`, quoted paths, port checks, doctor script |
| 16 | Metrics correctness | recomputed by hand in a test | confirmed correct; no fabricated numbers anywhere |
| 17 | Accessibility gaps: no tabpanel semantics, no focus management, no theme | review | tabs pattern with arrow keys, focus to page heading on navigation, axe scan clean in both themes |
| 18 | Confusion-matrix text contrast would fail with realistic values | axe on a varied-matrix fixture (found during this work) | tint and text colours redesigned; verified |

Not verifiable in this environment: real-audio training, real accuracy, Windows execution of the .bat files, real microphones.

# Second audit (Premium v3): findings against the extended master prompt

| # | Finding | Action |
|---|---|---|
| 19 | An invented fixed confidence threshold (0.40) marked results as uncertain | Removed. Uncertainty now comes from out-of-fold validation accuracy per score range, with a documented rule and a minimum sample count; otherwise no claim is made |
| 20 | Model validity was only checked by feature version | Full artifact check (keys, features, sample rate, six classes, test prediction); health endpoint reports model readiness separately; incompatible models are never reported as trained |
| 21 | Limits (15 MB, 60 s) duplicated in frontend and backend | Backend is the single source (`/api/config`), configurable by environment variables |
| 22 | No timeout, concurrency cap, startup validation or optional rate limit | Added, with tests |
| 23 | Results lacked processing time, model metadata, spectrogram, timeline, report | Added and tested against real outputs (see README section 7) |
| 24 | Test results were scored "once"; comparison of candidates absent | Candidates are compared on the same held-out speakers as descriptive information; selection still uses validation only. Wording corrected everywhere |
| 25 | No explanation of what the model uses | Global permutation importance by named feature group on validation speakers; per-prediction explanations deliberately not offered |
| 26 | Palette applied through scattered colour values | Single token file, exact palettes, contrast audit script and axe scans in both themes |
| 27 | Visually hidden score table widened the page on phones | Wrapped in a clipped container (found by the overflow test) |
| 28 | Instruction conflict on typography (one brief said choose fonts freely, later briefs name Space Grotesk, DM Sans, IBM Plex Mono) | Followed the latest explicit instruction; fonts are centralized, so changing them is a one-file edit |
| 29 | Sample library: no recordings with clear distribution rights available | Mechanism built with an honest empty state; no audio bundled |
| 30 | Hindi and Telugu | Deferred; literature search and required steps in `docs/FUTURE_LANGUAGES.md` |
