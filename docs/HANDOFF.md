# HANDOFF (Premium v3)

**State:** all code complete and tested on generated test audio; model untrained (no real audio in build environment). See PROJECT_STATUS.md and AUDIT_REPORT.md.
**Next step:** setup_windows.bat, download_dataset.bat, train_model.bat, run_project.bat.
**Protocol:** test speakers held out; 5-fold speaker-grouped CV on the rest chooses the model; refit; test result never used for choosing; all candidates also scored on the same test speakers (descriptive).
**Rules to keep:** exact palettes via tokens, Space Grotesk/DM Sans/IBM Plex Mono, no purple/emoji/pills/em dashes/invented numbers; recordings are inference only; unavailable features say so.
**After real training:** read outputs/metrics.json; if weak, ideas to log: more features, tuning, speaker normalization. Never tune on test speakers.

**v4:** homepage is a video hero (frontend/src/pages/Home.tsx, components/HeroVideo.tsx, assets in public/media). Fonts: Fraunces, Plus Jakarta Sans, IBM Plex Mono. Open items: real training, npm major upgrades before public hosting, sample recordings with clear rights, footage provenance.
