# DEPLOYMENT

Local only by design (no hosting, cloud, Docker or secrets). Backend: `uvicorn app.main:app --port 8000`. Frontend: Vite dev server on 5173 with `/api` proxy.
If ever hosted: `npm run build` produces `frontend/dist`; serve it behind a reverse proxy that forwards `/api` to the backend, and require HTTPS so the microphone works.
Environment variable names: none. Rollback: delete `models/emotion_model.joblib` to return to "Model not trained yet".
