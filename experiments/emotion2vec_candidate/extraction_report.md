# Phase 3: CREMA-D Embedding Extraction Report

**Candidate**: `emotion2vec/emotion2vec_plus_base`  
**Completion Timestamp**: 2026-11-01 23:34:18  
**Project Path**: `D:\speech-emotion-recognition`  
**Execution Environment**: `experiments\emotion2vec_candidate\.venv_e2v`  
**Overall Status**: **`PASS` (100% Verified)**

---

## 1. Executive Summary

Phase 3 extracted frozen 768-dimensional utterance embeddings for all **7,441 valid CREMA-D audio clips** using the official `emotion2vec/emotion2vec_plus_base` foundation model.

- **Total Clips Extracted**: **7,441 / 7,441**
- **Total Failures / Missing Files**: **0**
- **Speaker Independence**: **Strictly Preserved** (0 overlapping speakers between development and test sets)
- **Output Caches**:
  - Development Cache: [dev_embeddings.npz](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/dev_embeddings.npz) (**17.15 MB**)
  - Held-out Test Cache: [test_embeddings.npz](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/test_embeddings.npz) (**3.13 MB**)
- **Summary Metadata**: [extraction_summary.json](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/extraction_summary.json)
- **Total Runtime**: `4,730.1 s` (~78.8 minutes)

---

## 2. Dataset & Speaker Split Verification

The extraction adhered strictly to the canonical CREMA-D split defined in `outputs/speaker_split.json`:

| Split | Speakers | Utterances | % of Dataset | Verification Status |
| :--- | :---: | :---: | :---: | :---: |
| **Development** | 77 | 6,294 | 84.59% | **PASS** (Matches canonical split exactly) |
| **Held-out Test** | 14 | 1,147 | 15.41% | **PASS** (Matches canonical split exactly) |
| **Total** | **91** | **7,441** | **100.0%** | **PASS** (0 unassigned, 0 missing) |

### Cross-Split Speaker Leakage Audit
- Overlap between Development and Held-out Test speakers: **`0`** (`set(dev_speakers) & set(test_speakers) == set()`)
- Speaker leakage detected: **`FALSE`**

---

## 3. Extraction Integrity & Mathematical Checks

Every utterance was preprocessed to mono 16 kHz, peak-normalized to 0.90, and passed through `model.generate(y, granularity="utterance", extract_embedding=True)`.

| Metric | Development Split | Held-out Test Split | Audit Result |
| :--- | :--- | :--- | :--- |
| **Sample Count** | 6,294 | 1,147 | **PASS** |
| **Embedding Matrix Shape** | `(6294, 768)` | `(1147, 768)` | **PASS** (All vectors are 768-D) |
| **Data Type** | `float32` | `float32` | **PASS** |
| **Finite Values Check** | `100% True` | `100% True` | **PASS** |
| **NaN Count** | `0` | `0` | **PASS** (0 NaNs) |
| **Inf Count** | `0` | `0` | **PASS** (0 Infs) |
| **Vector $L_2$ Norm (Mean $\pm$ Std)** | $28.76 \pm 5.34$ | $28.51 \pm 5.33$ | **PASS** (Highly consistent scale) |
| **Embedding Value Range** | `[-6.87, +13.40]` | `[-6.82, +12.30]` | **PASS** (Stable dynamic range) |

---

## 4. Class Distributions

The distribution across the six target emotion classes was verified:

| Emotion | Development Count | Test Count | Total Count |
| :--- | :---: | :---: | :---: |
| **Angry** | 1,075 | 196 | 1,271 |
| **Disgust** | 1,075 | 196 | 1,271 |
| **Fear** | 1,075 | 196 | 1,271 |
| **Happy** | 1,075 | 196 | 1,271 |
| **Neutral** | 920 | 167 | 1,087 |
| **Sad** | 1,074 | 196 | 1,270 |
| **Total** | **6,294** | **1,147** | **7,441** |

*(Note: Neutral has fewer samples in CREMA-D by original dataset design, as each actor produces neutral sentences at a single intensity level.)*

---

## 5. Artifacts & Checksums

| File Path | Size | SHA-256 Hash |
| :--- | :--- | :--- |
| `experiments/emotion2vec_candidate/dev_embeddings.npz` | 17.15 MB | `4242fe4652b913762c6c851639bade3ea2ca275f0d56c80e3350ea8200c43a61` |
| `experiments/emotion2vec_candidate/test_embeddings.npz` | 3.13 MB | `89a841748f541481c6df17cea3cc32df93a6218602fdff7918ab004099740490` |
| `experiments/emotion2vec_candidate/extraction_summary.json` | 2.5 KB | `a7935043bf...` |

---

## 6. Safety & Boundary Audit

1. **Production System Integrity**:
   - `models/emotion_model.joblib`: Untouched.
   - `models/candidate_option2/`: Untouched.
   - `models/candidate_option3/`: Untouched.
2. **Environment & App Boundary**:
   - `backend/.venv`: Untouched.
   - Frontend and backend API code: Untouched.
   - Active FastAPI server on port 8000: Operational without interruption.
3. **Model Training & Evaluation**:
   - **Zero classifiers have been trained.**
   - **Zero evaluations or tuning against the held-out test set have been performed.**

