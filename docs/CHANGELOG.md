# CHANGELOG

## 2026-10-10 - Initial build
- Added full backend, training/evaluation/prediction pipeline, FastAPI API, React website, Windows scripts, docs.
- Tests: 8 pytest tests pass; frontend build OK; headless-browser UI run OK (using generated tones only for code testing).
- Not done: training on real CREMA-D (data unavailable in build environment).
- Fixed during build: `save_model` now creates the model file's own parent folder; added React Router v7 future flags; widened score value column.

## Premium edition
- Audit of v1 (docs/AUDIT_REPORT.md) and fixes: verified dataset (manifest), Git-free resumable downloader, speaker-grouped CV protocol, uncertainty and baselines, 296 features, duration cap and audio notes, microphone processing off, checkpointed cache, space-safe .bat scripts, doctor script.
- Website: new design system with light and dark themes, mobile menu, sticky CTA, back-to-top, waveform and level meter, FAQ search, Contact, Privacy, Terms, per-page metadata, ErrorBoundary.
- Tests: 20 backend tests, 69 browser checks. Found and fixed during testing: confusion-matrix contrast, route focus stealing under StrictMode, tab icon shrink.

## Premium v3
- Palette: exact bright and dark palettes via `tokens.css`; contrast audit; axe scans in both themes.
- Typography: Space Grotesk, DM Sans, IBM Plex Mono, self-hosted.
- Features: report download (JSON, CSV), spectrogram, emotion timeline, optional transcription (unavailable until an engine is configured), test-set model comparison, feature-group importance, sample-library mechanism, Model info page.
- Backend: validation-based uncertainty, model artifact validation, `/api/config`, health with model readiness, processing time, concurrency limit, optional rate limit, startup validation.
- Tests: 41 backend tests, 124 browser checks, contrast audit. Not done: real CREMA-D training, real transcription, Hindi and Telugu.

## v4
- Homepage redesign: full-viewport footage with layered Fraunces headline, Plus Jakarta Sans interface, IBM Plex Mono data; pause control; reduced-motion poster; contrast measured against the footage.
- Audit fixes: see docs/AUDIT_FINAL.md section G. Added evaluate_model.bat, error-leak test, dev server pinned to 127.0.0.1, npm advisories documented.
- Tests: 42 backend, 167 browser checks. Real CREMA-D training still blocked.
