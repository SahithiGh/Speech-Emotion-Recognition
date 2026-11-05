# Phase 5: Final Held-Out Test Evaluation Report

**Evaluation Timestamp**: 2026-11-01 23:53:02  
**Test Dataset**: CREMA-D Held-Out Test Split (1,147 clips, 14 unseen speakers)  
**Execution Environment**: `experiments\emotion2vec_candidate\.venv_e2v`  
**Status**: **COMPLETED (All 3 Candidates Evaluated on Held-Out Test Set)**  

---

## 1. Executive Summary & Comparison with Existing Baselines

The three `emotion2vec+` candidate classification heads were evaluated on the **1,147 held-out test samples** from **14 unseen speakers** (`outputs/speaker_split.json["test"]`).

| Model Architecture | Test Accuracy | Balanced Accuracy (UAR) | Macro F1 | Delta vs. Production | Delta vs. Option 2 | Model Size | Head Latency (Single Sample) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Production Baseline** (Acoustic RBF SVM) | 52.40% | 52.29% | 0.5176 | — | +0.09% | ~1.6 MB | ~4.5 ms |
| **Option 2 Staging** (Acoustic SVM + Aug) | 52.31% | 52.25% | 0.5158 | -0.09% | — | ~1.6 MB | ~4.5 ms |
| **Candidate 1: Logistic Regression** ($C=0.05$) | **90.93%** | **91.02%** | **0.9098** | **+38.53%** | **+38.62%** | **37.5 KB** | **0.203 ms** |
| **Candidate 2: RBF SVM** ($C=5.0$) | **90.67%** | **90.75%** | **0.9071** | **+38.27%** | **+38.36%** | **8.42 MB** | **0.896 ms** |
| **Candidate 3: MLP Probe** (Hidden 256) | **90.58%** | **90.65%** | **0.9065** | **+38.18%** | **+38.27%** | **2.30 MB** | **0.294 ms** |

> [!IMPORTANT]
> **Key Finding**: All three candidates achieve **90.6% to 90.9% accuracy** on the held-out test speakers, representing a massive **+38.5 percentage point improvement** over both production (52.40%) and Option 2 staging (52.31%). Candidate 1 (Logistic Regression) achieved the highest test Macro F1 (0.9098) while possessing the smallest footprint (37.5 KB).

---

## 2. CRITICAL BENCHMARK LIMITATION DISCLOSURE

> [!WARNING]
> ### Mandatory Disclosure: Pretraining Contamination
> As documented in the official publication (*"emotion2vec: Self-Supervised Pre-Training for Speech Emotion Representation"*, Ma et al., 2023), **CREMA-D was included in the upstream pretraining dataset** of `emotion2vec` and `emotion2vec+`.
> 
> Consequently:
> 1. Although the 14 test speakers are strictly disjoint from the 77 development speakers used to fit the classifier head, the representation backbone has already observed the acoustic conditions of CREMA-D.
> 2. This near-91% test accuracy demonstrates the **exceptional latent representation quality** of `emotion2vec+` for speech in the CREMA-D domain.
> 3. **It CANNOT and MUST NOT be claimed as proof of independent generalization to natural conversational speech** (e.g. MSP-Podcast or in-the-wild recordings). Cross-dataset evaluation on conversational corpora remains essential.

---

## 3. Per-Class Precision, Recall, and F1 Comparison

| Emotion Class | Metric | Production Baseline | Option 2 Staging | Candidate 1 (LogReg) | Candidate 2 (RBF SVM) | Candidate 3 (MLP) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Angry** | Precision | 0.569 | 0.568 | **0.941** | **0.941** | **0.945** |
| (N=196) | Recall | 0.740 | 0.745 | **0.974** | **0.974** | **0.969** |
| | **F1-Score** | **0.643** | **0.645** | **0.957** | **0.957** | **0.957** |
| **Disgust** | Precision | 0.491 | 0.490 | **0.891** | **0.891** | **0.887** |
| (N=196) | Recall | 0.403 | 0.383 | **0.878** | **0.878** | **0.878** |
| | **F1-Score** | **0.443** | **0.430** | **0.884** | **0.884** | **0.882** |
| **Fear** | Precision | 0.485 | 0.471 | **0.884** | **0.891** | **0.857** |
| (N=196) | Recall | 0.480 | 0.459 | **0.852** | **0.832** | **0.857** |
| | **F1-Score** | **0.482** | **0.465** | **0.868** | **0.860** | **0.857** |
| **Happy** | Precision | 0.494 | 0.494 | **0.939** | **0.939** | **0.944** |
| (N=196) | Recall | 0.418 | 0.413 | **0.939** | **0.939** | **0.944** |
| | **F1-Score** | **0.453** | **0.450** | **0.939** | **0.939** | **0.944** |
| **Neutral** | Precision | 0.526 | 0.503 | **0.935** | **0.929** | **0.940** |
| (N=167) | Recall | 0.479 | 0.497 | **0.946** | **0.940** | **0.934** |
| | **F1-Score** | **0.502** | **0.500** | **0.940** | **0.935** | **0.937** |
| **Sad** | Precision | 0.553 | 0.576 | **0.868** | **0.852** | **0.866** |
| (N=196) | Recall | 0.617 | 0.638 | **0.872** | **0.883** | **0.857** |
| | **F1-Score** | **0.583** | **0.605** | **0.870** | **0.867** | **0.862** |

### Key Per-Class Observations:
- **Fear Precision**: Jumped from **48.5%** (Production) / **47.1%** (Option 2) to **88.4% – 89.1%** on the held-out test set. Fear false positives dropped drastically.
- **Sad Detection**: Precision improved from **55.3%** to **86.8%**, and Recall improved from **61.7%** to **87.2%** (F1 increased from **0.583** to **0.870**).
- **Angry and Happy**: Both classes achieved **~94% to 97%** precision and recall across all candidates.

---

## 4. Test Confusion Matrices

### Candidate 1: Logistic Regression ($C=0.05$) — Best Test Macro F1: 0.9098
```
Predicted ->   Angry  Disgust   Fear   Happy  Neutral    Sad  | Recall
True Angry       191        3      0       1        0      1  |  97.4%
True Disgust       5      172      8       4        2      5  |  87.8%
True Fear          1        4    167       5        4     15  |  85.2%
True Happy         5        2      4     184        0      1  |  93.9%
True Neutral       1        2      1       1      158      4  |  94.6%
True Sad           0       10      9       1        5    171  |  87.2%
--------------------------------------------------------------
Precision      94.1%    89.1%  88.4%   93.9%    93.5%  86.8%
```

### Candidate 2: RBF SVM ($C=5.0$) — Test Macro F1: 0.9071
```
Predicted ->   Angry  Disgust   Fear   Happy  Neutral    Sad  | Recall
True Angry       191        3      0       1        0      1  |  97.4%
True Disgust       4      172      8       4        2      6  |  87.8%
True Fear          1        5    163       5        5     17  |  83.2%
True Happy         5        2      3     184        0      2  |  93.9%
True Neutral       1        2      2       1      157      4  |  94.0%
True Sad           1        9      7       1        5    173  |  88.3%
--------------------------------------------------------------
Precision      94.1%    89.1%  89.1%   93.9%    92.9%  85.2%
```

### Candidate 3: Multi-Layer Perceptron (MLP) — Test Macro F1: 0.9065
```
Predicted ->   Angry  Disgust   Fear   Happy  Neutral    Sad  | Recall
True Angry       190        4      0       1        0      1  |  96.9%
True Disgust       5      172      9       3        2      5  |  87.8%
True Fear          1        5    168       4        3     15  |  85.7%
True Happy         2        4      4     185        0      1  |  94.4%
True Neutral       1        2      2       2      156      4  |  93.4%
True Sad           2        7     13       1        5    168  |  85.7%
--------------------------------------------------------------
Precision      94.5%    88.7%  85.7%   94.4%    94.0%  86.6%
```

---

## 5. Latency & Resource Footprint Analysis

| Model | Head Checkpoint Size | Head Inference Latency (Single Sample) | Batch Throughput (1,147 clips) | Full Pipeline Latency (e2v+ Backbone + Head) |
| :--- | :---: | :---: | :---: | :---: |
| **Candidate 1: Logistic Regression** | **37.5 KB** | **0.203 ms** | **9.77 ms total** (0.009 ms/clip) | ~250 ms / clip |
| **Candidate 2: RBF SVM** | **8.42 MB** | **0.896 ms** | **578.9 ms total** (0.505 ms/clip) | ~251 ms / clip |
| **Candidate 3: MLP Probe** | **2.30 MB** | **0.294 ms** | **7.69 ms total** (0.007 ms/clip) | ~250 ms / clip |

- All three classification heads execute in **sub-millisecond time** on CPU once the 768-D utterance embedding is extracted.
- Logistic Regression is exceptionally compact (37.5 KB) and executes batch scoring over all 1,147 test samples in under 10 milliseconds.

---

## 6. Immutability & Safety Audit

The SHA-256 hashes of all input files and checkpoints were calculated before and after evaluation:

| File | Pre-Evaluation SHA-256 | Post-Evaluation SHA-256 | Audit Result |
| :--- | :--- | :--- | :---: |
| `test_embeddings.npz` | `89a841748f541481c6df17cea3cc32df93a6218602fdff7918ab004099740490` | `89a841748f541481c6df17cea3cc32df93a6218602fdff7918ab004099740490` | **IDENTICAL** |
| `candidate_logistic_regression.joblib` | `1ed60ec67e6e8abc41c4ca159abb0e44acb7525601a941e50172a4224b6a7f83` | `1ed60ec67e6e8abc41c4ca159abb0e44acb7525601a941e50172a4224b6a7f83` | **IDENTICAL** |
| `candidate_rbf_svm.joblib` | `b01d1e6961345659e65c18dbc74de32098bb77d568f16e84168694fceee8a061` | `b01d1e6961345659e65c18dbc74de32098bb77d568f16e84168694fceee8a061` | **IDENTICAL** |
| `candidate_mlp.joblib` | `1addaa61b1c7c799897df5403fa3cf3c0763203a76972b31a19aa0d9ee8a576c` | `1addaa61b1c7c799897df5403fa3cf3c0763203a76972b31a19aa0d9ee8a576c` | **IDENTICAL** |

**System Integrity Preserved:**
- Production Model (`models/emotion_model.joblib`): Untouched.
- Option 2 Staging (`models/candidate_option2/`): Untouched.
- Option 3 Archived (`models/candidate_option3/`): Untouched.
- Application backend (`backend/.venv`), frontend, and active server on port 8000: Untouched and fully operational.
- **Zero models promoted**.
