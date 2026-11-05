# Phase 2: Isolated Environment Setup & Minimal Model Smoke Test Report

**Model Evaluated**: `emotion2vec/emotion2vec_plus_base`  
**Execution Timestamp**: 2026-11-01 22:07:04  
**Project Path**: `D:\speech-emotion-recognition`  
**Isolated Environment Path**: `experiments\emotion2vec_candidate\.venv_e2v`  
**Status**: **PASS (All Criteria Verified)**

---

## 1. Environment Isolation & Dependencies

The testing environment was created strictly in an isolated virtual environment to prevent any interference with the operational backend environment (`backend\.venv`).

- **Base Python Interpreter**: Python 3.13.16 64-bit (Windows)
- **Virtual Environment Location**: `experiments\emotion2vec_candidate\.venv_e2v`
- **Key Installed Packages**:
  - `torch`: `2.15.0+cpu`
  - `torchaudio`: `2.11.1+cpu`
  - `funasr`: `1.4.19`
  - `modelscope`: `1.40.2`
  - `soundfile`: `0.14.0`
  - `librosa`: `1.0.0`
  - `scikit-learn`: `1.9.1`
  - `scipy`: `1.18.1`
  - `numpy`: `2.5.4`
  - `psutil`: `7.2.2`
- **Full Dependency Lock**: Preserved at [requirements_installed.txt](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/requirements_installed.txt) (85 total packages).

---

## 2. Official Checkpoint Verification

The official `emotion2vec_plus_base` checkpoint was downloaded via the FunASR / Hugging Face Hub integration:

- **Hugging Face Hub ID**: `emotion2vec/emotion2vec_plus_base`
- **Revision / Commit**: `b318240bfe67db81a8c572ecb37ce9c3759b81c9`
- **Model Checkpoint Path**: `C:\Users\JAI-SREE-RAM\.cache\huggingface\hub\models--emotion2vec--emotion2vec_plus_base\snapshots\b318240bfe67db81a8c572ecb37ce9c3759b81c9\model.pt`
- **Checkpoint File Size**: `1,118,245,678 bytes` (~1.04 GB)
- **Checkpoint SHA-256 Hash**:
  ```
  60710B5AAE1DBE69BDAC8920028FB05882D4314FD09031922B4B61EE9E7AADBD
  ```

---

## 3. Hardware Resource Utilization & Latency

Measurements were captured using `psutil.Process()` on the isolated CPU runtime:

| Metric | Measured Value | Notes |
| :--- | :--- | :--- |
| **Initial Process RAM** | `33.39 MB` | Base Python process prior to importing FunASR/PyTorch |
| **Model Load Time** | `84.14 s` | First-time download, snapshot hash check, and torch deserialization |
| **Post-Load Process RAM** | `1,874.30 MB` | Model weights and runtime graph allocated in memory |
| **Net Model RAM Footprint** | `1,840.91 MB` | ~1.8 GB, safely fits within developer workstation budget |
| **Peak Inference RAM** | `1,874.30 MB` | Zero memory leakage during repeated inference calls |

---

## 4. Utterance Embedding Smoke Test Results

All audio inputs were preprocessed to **mono 16 kHz** and **peak-normalized to 0.90** before calling:
`model.generate(audio_array, granularity="utterance", extract_embedding=True)`

### Sample 1: `Sad2.mp3.mpeg` (Conversational Out-Of-Distribution Test Clip)
- **File Path**: `C:/Users/JAI-SREE-RAM/Downloads/Sad2.mp3.mpeg`
- **Raw Audio Duration**: `8.664 s`
- **Audio Preprocessing Latency**: `527.43 ms` (includes MP3/MPEG decoding via soundfile/librosa)
- **Model Inference Latency**: `1,147.80 ms` (1.15 s)
- **Real-Time Factor (RTF)**: **`0.1325`** (~7.5x faster than real-time on CPU)
- **Embedding Dimension**: **`768`** (Verified `dim == 768`)
- **Finite Check**: **`True`** (0 NaNs, 0 Infs)
- **Non-Empty Check**: **`True`**
- **Vector Distribution**:
  - $L_2$ Norm: `22.5158`
  - Range: `[-3.0977, 4.4685]`
  - Mean: `+0.0031`, Std: `0.8125`
  - First 5 dimensions: `[-0.49423, 0.16135, -0.20107, -0.09207, -0.07432]`

### Sample 2: `Happy2.wav` (Native Benchmark Clip)
- **File Path**: `external_datasets/audio_for_friend/sample_audio/Happy2.wav`
- **Raw Audio Duration**: `10.608 s`
- **Audio Preprocessing Latency**: `25.00 ms`
- **Model Inference Latency**: `1,215.61 ms` (1.22 s)
- **Real-Time Factor (RTF)**: **`0.1146`** (~8.7x faster than real-time on CPU)
- **Embedding Dimension**: **`768`** (Verified `dim == 768`)
- **Finite Check**: **`True`** (0 NaNs, 0 Infs)
- **Non-Empty Check**: **`True`**
- **Vector Distribution**:
  - $L_2$ Norm: `33.1864`
  - Range: `[-4.8071, 10.5099]`
  - Mean: `+0.0136`, Std: `1.1974`
  - First 5 dimensions: `[-2.52556, 0.66047, 0.89464, 0.60461, -0.67524]`

### Sample 3: `Neutral1.wav` (Native Benchmark Clip)
- **File Path**: `external_datasets/audio_for_friend/sample_audio/Neutral1.wav`
- **Raw Audio Duration**: `8.520 s`
- **Audio Preprocessing Latency**: `43.54 ms`
- **Model Inference Latency**: `925.05 ms` (0.93 s)
- **Real-Time Factor (RTF)**: **`0.1086`** (~9.2x faster than real-time on CPU)
- **Embedding Dimension**: **`768`** (Verified `dim == 768`)
- **Finite Check**: **`True`** (0 NaNs, 0 Infs)
- **Non-Empty Check**: **`True`**
- **Vector Distribution**:
  - $L_2$ Norm: `25.0572`
  - Range: `[-3.5038, 4.4024]`
  - Mean: `+0.0086`, Std: `0.9041`
  - First 5 dimensions: `[-0.50059, 0.09534, -0.17017, 0.44381, -0.30706]`

---

## 5. Runtime Warnings & Diagnostics

1. **Unused Decoder Keys in Checkpoint**:
   - `FunASR` emitted warnings: `Warning, miss key in ckpt: modality_encoders.AUDIO.decoder.blocks.*`.
   - **Reason**: The official checkpoint contains the self-supervised masked speech reconstruction encoder-decoder weights. During representation extraction (`extract_embedding=True`), only the encoder is utilized. This warning is expected and has zero impact on embedding validity.
2. **Torchaudio Audio Loading Fallback**:
   - `Notice: ffmpeg is not installed. torchaudio is used to load audio`.
   - In our standalone test script, audio files are loaded via `soundfile` and `librosa`, so ffmpeg is not required for inference.

---

## 6. Safety & Boundary Audit

- **Production Integrity**: `models/emotion_model.joblib` (SHA-256: `f5bc7b...`) remained untouched.
- **Option 2 Staging Integrity**: `models/candidate_option2/` remained untouched.
- **Active FastAPI Server**: Running continuously on port 8000 without interruption.
- **No Classifiers Trained**: No classification heads were trained; zero modifications to application frontend or backend routes.
- **Full Isolation**: No packages were installed or modified in the host environment or `backend/.venv`.

