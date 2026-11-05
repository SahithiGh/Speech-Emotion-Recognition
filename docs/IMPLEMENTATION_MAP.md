# IMPLEMENTATION_MAP

| Area | File |
|---|---|
| Settings, paths, emotions | `backend/app/config.py` |
| Audio loading, validation, features | `backend/app/audio.py` |
| Dataset scan, LFS detection, speaker split | `backend/app/dataset.py` |
| Feature table + cache | `backend/app/features_table.py` |
| Metrics | `backend/app/evaluation.py` |
| Save/load model, metrics | `backend/app/modelio.py` |
| Training / evaluation / prediction | `backend/train.py`, `evaluate.py`, `app/predict.py` (CLI: `predict.py`) |
| Candidate models | `backend/app/candidates.py` |
| Official file list | `backend/app/resources/crema_d_manifest.csv.gz` |
| Downloader, checker, doctor | `scripts/*.py` |
| Browser tests (developer) | `devtools/e2e_browser_test.py` |
| REST API | `backend/app/main.py` |
| Tests | `backend/tests/test_pipeline.py` |
| Routes and pages | `frontend/src/App.tsx`, `pages/*.tsx`, `components/Layout.tsx` |
| API client | `frontend/src/api.ts` |
| Audio conversion (to WAV) / recorder | `frontend/src/audio.ts`, `useRecorder.ts` |
| Styles | `frontend/src/styles.css` |

**Commands (Windows):** `setup_windows.bat`, `scripts\download_dataset.bat`, `train_model.bat`, `run_project.bat`, `stop_project.bat`.
**Dev:** `cd backend && .venv\Scripts\python.exe -m pytest tests`; `cd frontend && npm run build`.
**Env vars:** none. **Database:** none. **Third-party services:** none.
