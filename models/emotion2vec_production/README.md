# Promoted Production Model: emotion2vec+ (Base) + Logistic Regression

## Promotion Summary
- **Model Architecture**: Frozen `emotion2vec/emotion2vec_plus_base` foundation model (768-D utterance embeddings) with calibrated `LogisticRegression(C=0.05, class_weight='balanced')`.
- **Promotion Status**: Promoted to primary Production model. Active by default without requiring environment variables.
- **SHA-256 Checksum**: `43604BB217E1CAE02A5FCC12D6491CE1E45A466EFBAB691356BA296D3619A5CE`
- **Model Bundle**: `emotion_model.joblib` (36,781 bytes)
- **Sample Rate**: 16,000 Hz, Mono, peak-normalized to 0.90.
- **Classes (6)**: `angry`, `disgust`, `fear`, `happy`, `neutral`, `sad`.

## Performance Metrics (Held-Out Test Set)
- **Test Accuracy**: 90.93%
- **Macro F1 Score**: 90.98%
- **Balanced Accuracy**: 91.02%
- **OOD Threshold (|z|_max)**: 3.83 (99.5th percentile calibrated)

## Pretraining Disclosure
CREMA-D was included in the upstream emotion2vec self-supervised pretraining corpus. Performance reflects high-quality representation extraction and should not be assumed as independent out-of-domain generalization.

