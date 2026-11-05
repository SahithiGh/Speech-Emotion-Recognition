# SVM Production Model - Rollback Backup

## Purpose
This directory preserves the original baseline Support Vector Classifier (RBF kernel, C=5.0) evaluated on CREMA-D 296-D acoustic features as an immutable rollback backup.

## Artifact Information
- **File**: `emotion_model.joblib`
- **Model Type**: Scikit-Learn Pipeline (`StandardScaler` + `SVC(C=5.0, kernel='rbf', gamma='scale', probability=True)`)
- **Input Features**: 296 acoustic features (MFCC, Mel spectrogram, chroma, spectral contrast, tonnetz, RMS energy, zero crossing rate)
- **Sample Rate**: 16,000 Hz
- **Size**: 7,951,309 bytes
- **SHA-256 Checksum**: `9DB13E3E393FC0B6283FF7EB7405BEB61C2170CEF7271A2E35452801B1E294C4`

## Associated Metadata
- `preprocessing_config.json`: Configuration for 296-D acoustic extraction.
- `metrics.json`: Test metrics evaluated on 14 unseen CREMA-D speakers (1,147 clips). Test accuracy: 52.40%, Macro F1: 51.76%.

## How to Roll Back
To activate this rollback model in the application at any time, set the environment variable:
```bash
# Windows PowerShell
$env:SER_MODEL_PROFILE = "svm_rollback"

# Windows Command Prompt
set SER_MODEL_PROFILE=svm_rollback

# Linux / macOS
export SER_MODEL_PROFILE=svm_rollback
```
Alternatively, copy `emotion_model.joblib` to `models/` or specify `SER_MODEL_PATH=models/svm_rollback_backup/emotion_model.joblib`.

