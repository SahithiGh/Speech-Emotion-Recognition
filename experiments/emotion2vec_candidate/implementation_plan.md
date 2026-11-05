# Implementation Plan: Isolated `emotion2vec+` Candidate Experiment

**Plan Version**: 1.0 (Draft / Pre-Implementation)  
**Proposed Candidate**: Candidate Option 4 (`models/candidate_option4/`)  
**Target Backbone**: `emotion2vec/emotion2vec_plus_base` (Frozen 768-dimensional Feature Extractor)  
**Target Downstream Head**: Custom 6-Class Calibrated Classifier (`angry`, `disgust`, `fear`, `happy`, `neutral`, `sad`)  
**Location**: `experiments/emotion2vec_candidate/`  
**Standing Safety Constraints**: Zero modifications to production, staging (Option 2), or archived Option 3. No weights, datasets, or packages are downloaded during this planning phase.

---

## 1. Technical Investigation & Prerequisites

### 1.1 Exact Model-Loading & Embedding-Extraction API
The official FunASR API supports loading `emotion2vec_plus_base` directly from Hugging Face or ModelScope hubs:

```python
from funasr import AutoModel

# 1. Load model with frozen weights from Hugging Face hub
model = AutoModel(
    model="emotion2vec/emotion2vec_plus_base",
    hub="hf",
    device="cpu",  # or "cuda" if available
)

# 2. Extract 768-dimensional utterance-level continuous embedding
# Input: 1D NumPy float32 array at 16,000 Hz or path to 16 kHz WAV file
results = model.generate(
    waveform,                # shape (n_samples,), float32
    granularity="utterance", # extracts single global vector for the entire segment
    extract_embedding=True,  # returns 768-dim continuous feature embedding
)

# Output structure: list of dicts
# results[0]["feats"] contains the 768-dimensional NumPy float32 array
embedding = np.asarray(results[0]["feats"], dtype=np.float32)  # shape: (768,)
```

### 1.2 Verification of 768-Dimensional Utterance Embeddings
- **Verified**: When `granularity="utterance"` and `extract_embedding=True` are specified, the model performs mean-pooling over the final Transformer hidden states ($T \times 768$) to produce an invariant representation vector $\mathbf{e} \in \mathbb{R}^{768}$.
- This 768-dimensional vector completely replaces the hand-crafted 296-dimensional DSP feature vector.

### 1.3 Preprocessing, Normalization & Duration Constraints
- **Sampling Rate**: Strictly **16,000 Hz** (16 kHz).
- **Channels**: Single-channel **mono**.
- **Amplitude Normalization**: Peak-normalize waveform to $[-1.0, 1.0]$:
  $$y_{\text{norm}} = \frac{y}{\max(|y|) + \epsilon} \cdot 0.90$$
- **Duration**:
  - Minimum: $0.5\text{ s}$ (8,000 samples).
  - Maximum: $6.0\text{ s}$ (matching our existing `MAX_SECONDS = 6.0` boundary for CREMA-D prompts).

### 1.4 Training Data Overlap & Data Contamination Risk Analysis
- **Empirical Finding**: The `emotion2vec+ seed` model was supervised on **EmoBox** (published at Interspeech 2024 by Ziyang Ma et al.).
- **EmoBox Corpora**: EmoBox bundles **32 public emotional speech datasets, including CREMA-D**.
- **Contamination Consequence**:
  - While `emotion2vec_plus_base` is an unsupervised representation model fine-tuned on pseudo-labeled web audio, parts of the CREMA-D corpus may have been exposed during the seed initialization stage.
  - *Scientific Safeguard*: To prevent false claims of generalization, all evaluation metrics on CREMA-D must explicitly note the potential for seed-corpus overlap, and evaluation must include out-of-domain external conversational audio (`Sad2`, `Happy2`, `Neutral1`, `angry_sample`) where zero prior exposure is guaranteed.

### 1.5 Environment Compatibility & Dependency Risks
- **Current Workspace State**:
  - Python version: **3.13.16** (Active in `backend/.venv`).
  - PyTorch version: **2.14.1+cpu** (Active in `backend/.venv`).
  - `funasr` and `modelscope`: **Not installed**.
  - `torchaudio`: **Not installed**.
- **Identified Compatibility Risk**:
  - Python 3.13 is a very recent release. Pre-compiled wheels for `funasr` or specific audio C-extensions may require C++ compilation or fail on Windows without Microsoft Visual C++ Build Tools.
- **Risk Mitigation Strategy**:
  - When approval to proceed is granted, dependencies will be tested via `--dry-run` inside an isolated experimental virtual environment or subprocess without touching `backend/.venv` core production libraries.

---

## 2. Dataset Partitioning, Caching & Leakage Prevention

### 2.1 Speaker Split Preservation
The existing speaker-disjoint split from [`outputs/speaker_split.json`](file:///d:/speech-emotion-recognition/outputs/speaker_split.json) will be loaded and strictly enforced:
- **Development Speakers**: Exactly **77 actors** ($6,294$ valid audio files).
- **Held-Out Test Speakers**: Exactly **14 actors** ($1,147$ audio files).
- **Corrupt File Exclusion**: `1076_MTI_SAD_XX.wav` (known zero-signal file) is excluded.
- **Assertion**: `len(set(dev_speakers).intersection(set(test_speakers))) == 0`.

### 2.2 Physical Cache Separation
To make data leakage impossible, embeddings will be cached in two separate compressed `.npz` files:
1. `experiments/emotion2vec_candidate/dev_embeddings.npz`:
   - Contains `X_dev` ($6,294 \times 768$), `y_dev` ($6,294$), `actors_dev` ($6,294$), and `names_dev`.
2. `experiments/emotion2vec_candidate/test_embeddings.npz`:
   - Contains `X_test` ($1,147 \times 768$), `y_test` ($1,147$), `actors_test` ($1,147$), and `names_test`.
   - **Access Lock**: `test_embeddings.npz` is write-locked during training and can only be opened by the final evaluation script.

---

## 3. Training & Calibration Protocol (Development Data Only)

1. **Feature Standardization**:
   - Fit `StandardScaler` strictly on `X_dev` ($6,294$ samples).
   - The test data is never seen by the scaler.
2. **Classifier Head Architecture**:
   - Compare two candidate linear/kernel heads on top of the 768-dimensional space:
     - **Head Option A (Logistic Regression with L2 Regularization)**: Highly robust in 768-dimensional dense spaces, fast training, naturally calibrated probabilities.
     - **Head Option B (Linear/RBF Support Vector Machine with Platt Scaling)**: Maximum-margin separation.
3. **5-Fold Speaker-Grouped Cross-Validation**:
   - Run 5-fold CV using `speaker_folds(y_dev, actors_dev)` on development data to choose between Head A and Head B and select regularization $C \in \{0.1, 1.0, 5.0, 10.0\}$.
4. **OOD Calibration (Dev Data Only)**:
   - Compute standardized latent deviation $z_i = |e_i - \mu| / \sigma$.
   - Calculate peak deviation per sample: $\max_j |z_{ij}|$.
   - Calibrate the OOD threshold at the 99.9th percentile of development data.

---

## 4. Single-Shot Test Evaluation & Profiling Protocol

### 4.1 Strict One-Shot Guarantee
- The final held-out test set ($1,147$ clips across 14 unseen actors) is evaluated **exactly once**.
- No hyperparameters, scalers, or decision boundaries may be altered after computing test scores.

### 4.2 Resource Profiling Methodology
- **RAM Footprint**: Measure peak RSS memory using `psutil.Process().memory_info().rss` before model load, after model load, and during peak inference.
- **Model Load Time**: Measure wall-clock time from `AutoModel(...)` call to object instantiation.
- **Inference Latency**: Run 5 warm-up passes, then measure median wall-clock latency across 10 repetitions on:
  - $2.0\text{ s}$ audio clip.
  - $5.0\text{ s}$ audio clip.
  - $8.66\text{ s}$ audio clip (`Sad2.mp3.mpeg`).
  - Calculate Real-Time Factor: $\text{RTF} = \frac{\text{Latency}}{\text{Audio Duration}}$.

---

## 5. Proposed Directory & Artifact Structure

All experimental scripts, cached features, checkpoints, and metrics will reside exclusively within:

```
experiments/emotion2vec_candidate/
├── implementation_plan.md                 <-- This document
├── extract_embeddings.py                  <-- Embedding extraction & caching harness
├── train_head.py                          <-- Head training & dev-only cross-validation
├── evaluate_candidate.py                  <-- One-shot test set evaluation & external tests
├── profile_performance.py                 <-- RAM, load time, and latency profiler
├── dev_embeddings.npz                     <-- Cached dev set embeddings (77 speakers)
├── test_embeddings.npz                    <-- Cached held-out test embeddings (14 speakers)
├── candidate_metadata.json                <-- Model configuration & SHA-256 hashes
└── evaluation_report.json                 <-- Full benchmark metrics & confusion matrix
```

If Candidate 4 satisfies all acceptance criteria, the deployable bundle will be exported to:
```
models/candidate_option4/
├── emotion_model.joblib                   <-- Scikit-learn head + Scaler + Pipeline
├── preprocessing_config.json              <-- Audio prep & feature version config
└── metrics.json                           <-- Final frozen benchmark metrics
```

---

## 6. Expected Disk & RAM Requirements

| Resource | Expected Value | Justification |
| :--- | :---: | :--- |
| **Model Weights Download** | $\approx \mathbf{360\text{ MB}}$ | Single PyTorch checkpoint for `emotion2vec_plus_base`. |
| **Cached Embeddings Disk** | $\approx \mathbf{24\text{ MB}}$ | Dev: $6294 \times 768 \times 4\text{ bytes} \approx 19.3\text{ MB}$. Test: $1147 \times 768 \times 4\text{ bytes} \approx 3.5\text{ MB}$. |
| **Total Added Disk Space** | $\approx \mathbf{390\text{ MB}}$ | Completely manageable on `D:\` drive. |
| **Peak Runtime RAM** | $\approx \mathbf{1.2\text{--}1.6\text{ GB}}$ | Required for PyTorch compute graph and Transformer forward pass. |

---

## 7. Comparative Benchmark Metrics & Success Criteria

The experimental candidate will be benchmarked against:
- **Baseline A (Production)**: 296-DSP + SVM (Native CREMA-D).
- **Baseline B (Option 2 Staging)**: 296-DSP + SVM (Resampling Augmentation).
- **Baseline C (Option 3 Archived)**: 296-DSP + VAD-Gating.

### Acceptance Criteria for Promotion:
1. **CREMA-D Held-Out Performance**:
   - Macro F1 $\ge \mathbf{0.65}$ (significantly outperforming Option 2's $0.5158$).
   - Accuracy $\ge \mathbf{65\%}$ across all 6 classes.
   - Balanced recall across all 6 classes (no class $< 40\%$).
2. **Resampling Invariance**:
   - Prediction agreement between native 16 kHz and simulated 48 kHz $\to$ 16 kHz audio $\ge \mathbf{95\%}$.
3. **Conversational Speech Behavior**:
   - Evaluated on `Sad2.mp3.mpeg`, `Happy2.wav`, `Neutral1.wav`, `angry_sample.wav`.
   - Must demonstrate realistic probability distributions without collapsing to static Fear or static Angry.
   - Confidence must be calibrated (no saturated 99.9% false predictions).
4. **Latency Feasibility**:
   - Real-Time Factor on CPU $\le \mathbf{0.15}$ (latency $\le 750\text{ ms}$ for a 5-second clip).

---

## 8. Rollback & Isolation Strategy

1. **Zero Production Mutation**:
   - `models/emotion_model.joblib` and `models/candidate_option2/emotion_model.joblib` are read-only references.
   - `SER_MODEL_PROFILE` in `backend/app/config.py` remains locked to `staging`.
2. **Subprocess Isolation**:
   - Embedding extraction will execute in a standalone CLI script. If Python 3.13 wheel issues arise during package evaluation, no project files are impacted.
3. **De-escalation Path**:
   - If `emotion2vec+` fails to outperform Option 2 on the held-out test set or exhibits severe latency on CPU, the entire `experiments/emotion2vec_candidate/` folder can be deleted or archived with zero impact on the running application.

---

**Plan Status**: Ready for review.  
**Execution Status**: STOPPED. No code executed, no weights downloaded, no packages installed. Awaiting user approval to proceed.
