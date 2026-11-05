# Phase 4: emotion2vec+ Classification Heads Training & Cross-Validation Report

**Phase**: Phase 4 — Classification Head Design, Training & Cross-Validation  
**Timestamp**: 2026-11-01 23:48:40  
**Project Path**: `D:\speech-emotion-recognition`  
**Execution Environment**: `experiments\emotion2vec_candidate\.venv_e2v`  
**Status**: **COMPLETED (Held-Out Test Set Quarantined)**

---

## 1. Executive Summary & Core Results

Three candidate classification heads were designed, tuned, and evaluated on the frozen 768-dimensional `emotion2vec+` embeddings using **strictly development data** (6,294 clips across 77 speakers).

Evaluation was conducted using **5-fold speaker-disjoint cross-validation** (`StratifiedGroupKFold`), with `StandardScaler` fitted strictly inside each fold on training speakers only to prevent data leakage.

| Candidate Architecture | Best Hyperparameters | 5-Fold CV Accuracy | Balanced Accuracy | Macro F1 | Checkpoint Size | SHA-256 Hash |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Candidate 1: Logistic Regression** | $C=0.05$, `class_weight='balanced'`, `lbfgs` | **89.59%** | **89.72%** | **0.8965** | 37.5 KB | `1ed60ec67e6e8abc...` |
| **Candidate 2: RBF SVM** | $C=5.0$, $\gamma=\text{'scale'}$, `class_weight='balanced'` | **89.72%** | **89.85%** | **0.8977** | 8.42 MB | `b01d1e6961345659...` |
| **Candidate 3: Multi-Layer Perceptron (MLP)** | Hidden `(256,)`, $\alpha=0.01$, `adam`, early stopping | **89.72%** | **89.84%** | **0.8980** | 2.35 MB | `1addaa61b1c7c799...` |

All three architectures achieve remarkably consistent, high-performing cross-validation results (~89.6% to 89.8% Macro F1), with MLP and RBF SVM showing a slight edge over regularized Logistic Regression.

---

## 2. Strict Data Quarantine & Leakage Prevention

1. **Development Set Isolation**:
   - Only [dev_embeddings.npz](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/dev_embeddings.npz) (6,294 samples, 77 speakers) was loaded.
   - [test_embeddings.npz](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/test_embeddings.npz) (1,147 samples, 14 speakers) was **strictly quarantined and not accessed or evaluated**.
2. **Speaker-Disjoint Cross-Validation Setup**:
   - Split: `StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)` grouped on `speaker_ids`.
   - Fold 1: Train = 5,066 clips (62 speakers), Val = 1,228 clips (15 speakers)
   - Fold 2: Train = 5,064 clips (62 speakers), Val = 1,230 clips (15 speakers)
   - Fold 3: Train = 4,994 clips (61 speakers), Val = 1,300 clips (16 speakers)
   - Fold 4: Train = 5,064 clips (62 speakers), Val = 1,230 clips (15 speakers)
   - Fold 5: Train = 4,988 clips (61 speakers), Val = 1,306 clips (16 speakers)
   - **Cross-Fold Speaker Leakage**: Verified `len(set(train_speakers) & set(val_speakers)) == 0` for every fold.
3. **Pipeline Preprocessing Isolation**:
   - Inside each fold, `StandardScaler()` was fit strictly on `X_train` and then applied to `X_val`. Zero cross-validation leakage.

---

## 3. Detailed Cross-Validation Performance Comparison

### 3.1 Fold-by-Fold Performance Breakdown

| Candidate | Fold 1 Acc (F1) | Fold 2 Acc (F1) | Fold 3 Acc (F1) | Fold 4 Acc (F1) | Fold 5 Acc (F1) | Mean Acc $\pm$ Std | Mean F1 $\pm$ Std |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Logistic Regression** | 88.52% (0.8853) | 91.46% (0.9152) | 91.62% (0.9164) | 87.89% (0.8791) | 88.44% (0.8849) | **89.59% $\pm$ 1.63%** | **0.8962 $\pm$ 0.016** |
| **RBF SVM** | 88.36% (0.8835) | 92.28% (0.9233) | 91.38% (0.9142) | 87.80% (0.8782) | 88.74% (0.8882) | **89.71% $\pm$ 1.77%** | **0.8975 $\pm$ 0.018** |
| **MLP Probe** | 88.84% (0.8888) | 91.30% (0.9140) | 91.69% (0.9175) | 87.80% (0.8787) | 88.90% (0.8895) | **89.71% $\pm$ 1.54%** | **0.8977 $\pm$ 0.016** |

All models exhibit low variance across speaker folds (~1.5% to 1.8% standard deviation), demonstrating stability across different speaker subsets.

---

### 3.2 Per-Class Precision, Recall, and F1-Scores

#### Candidate 1: Logistic Regression ($C=0.05$)
| Emotion Class | Support | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: | :---: |
| **Angry** | 1,075 | 0.952 | 0.946 | 0.949 |
| **Disgust** | 1,075 | 0.901 | 0.885 | 0.893 |
| **Fear** | 1,075 | 0.866 | 0.806 | **0.835** |
| **Happy** | 1,075 | 0.937 | 0.944 | 0.941 |
| **Neutral** | 920 | 0.908 | 0.948 | 0.928 |
| **Sad** | 1,074 | 0.814 | 0.855 | **0.834** |
| **Macro Average** | **6,294** | **0.897** | **0.897** | **0.896** |

#### Candidate 2: RBF SVM ($C=5.0, \gamma=\text{'scale'}$)
| Emotion Class | Support | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: | :---: |
| **Angry** | 1,075 | 0.955 | 0.948 | 0.951 |
| **Disgust** | 1,075 | 0.897 | 0.886 | 0.891 |
| **Fear** | 1,075 | 0.887 | 0.789 | **0.835** |
| **Happy** | 1,075 | 0.941 | 0.945 | 0.943 |
| **Neutral** | 920 | 0.909 | 0.952 | 0.930 |
| **Sad** | 1,074 | 0.803 | 0.872 | **0.836** |
| **Macro Average** | **6,294** | **0.899** | **0.899** | **0.898** |

#### Candidate 3: Multi-Layer Perceptron (MLP) (Hidden 256, $\alpha=0.01$)
| Emotion Class | Support | Precision | Recall | F1-Score |
| :--- | :---: | :---: | :---: | :---: |
| **Angry** | 1,075 | 0.950 | 0.946 | 0.948 |
| **Disgust** | 1,075 | 0.886 | 0.882 | 0.884 |
| **Fear** | 1,075 | 0.879 | 0.801 | **0.838** |
| **Happy** | 1,075 | 0.950 | 0.940 | 0.945 |
| **Neutral** | 920 | 0.919 | 0.947 | 0.933 |
| **Sad** | 1,074 | 0.808 | 0.875 | **0.840** |
| **Macro Average** | **6,294** | **0.899** | **0.898** | **0.898** |

---

### 3.3 Confusion Matrix Analysis (Out-of-Fold Cross-Validation)

#### Candidate 2: RBF SVM Confusion Matrix
```
Predicted ->   Angry  Disgust   Fear   Happy  Neutral    Sad  | Recall
True Angry     1,019       27      9      14        5      1  |  94.8%
True Disgust      20      952     23       9       14     57  |  88.6%
True Fear         10       35    848      21       17    144  |  78.9%
True Happy        13       13     13   1,016       16      4  |  94.5%
True Neutral       4        2      3      11      876     24  |  95.2%
True Sad           1       32     60       9       36    936  |  87.2%
--------------------------------------------------------------
Precision      95.5%    89.7%  88.7%   94.1%    90.9%  80.3%
```

#### Observations on Key Error Modes:
1. **Fear vs. Sad Confusion**:
   - The primary source of residual error remains between **Fear and Sad**: 144 true Fear samples were predicted as Sad, and 60 true Sad samples were predicted as Fear.
   - However, unlike the acoustic feature models (Production/Option 2/Option 3 where Fear precision was ~50% and suffered massive false positives), the `emotion2vec+` representations maintain an **88.7% Fear precision** and **80.3% Sad precision**.
2. **Angry and Happy Separation**:
   - Angry and Happy achieve >94% precision and recall with minimal cross-talk, demonstrating clean acoustic separation in latent space.

---

## 4. Saved Candidate Checkpoints

Each candidate model pipeline (comprising the fitted `StandardScaler` + trained classifier) was trained on the entire development dataset (6,294 clips, 77 speakers) and saved to disk:

1. **Candidate 1 (Logistic Regression)**:
   - Checkpoint: [candidate_logistic_regression.joblib](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/candidate_logistic_regression.joblib)
   - Size: `37.5 KB`
   - SHA-256: `1ed60ec67e6e8abc41c4ca159abb0e44acb7525601a941e50172a4224b6a7f83`
2. **Candidate 2 (RBF SVM)**:
   - Checkpoint: [candidate_rbf_svm.joblib](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/candidate_rbf_svm.joblib)
   - Size: `8.42 MB` (includes support vectors and calibrated Platt probabilities)
   - SHA-256: `b01d1e6961345659e65c18dbc74de32098bb77d568f16e84168694fceee8a061`
3. **Candidate 3 (Multi-Layer Perceptron)**:
   - Checkpoint: [candidate_mlp.joblib](file:///d:/speech-emotion-recognition/experiments/emotion2vec_candidate/candidate_mlp.joblib)
   - Size: `2.35 MB`
   - SHA-256: `1addaa61b1c7c799897df5403fa3cf3c0763203a76972b31a19aa0d9ee8a576c`

---

## 5. CRITICAL BENCHMARK LIMITATION DISCLOSURE

> [!WARNING]
> ### CREMA-D Contamination Disclosure & Interpretation Warning
> As documented in the official emotion2vec publication (*"emotion2vec: Self-Supervised Pre-Training for Speech Emotion Representation"*, Ma et al., 2023), **CREMA-D was one of the training corpora used during self-supervised pretraining** of `emotion2vec` and `emotion2vec+`.
>
> Consequently:
> 1. Even though our 77-speaker / 14-speaker cross-validation split is strictly speaker-disjoint for classifier fitting, the upstream representation encoder has already observed CREMA-D speech during foundation pretraining.
> 2. The high cross-validation performance (**~89.8%**) reflects **in-domain representation probing**, not independent zero-shot or cross-corpus generalization.
> 3. These CREMA-D results must **never** be cited as evidence that the model will generalize identically to completely unseen conversational speech (such as MSP-Podcast, IEMOCAP, or natural dialogue).

---

## 6. Safety & Boundary Audit Compliance

- **Production Model** (`models/emotion_model.joblib`): **100% untouched**.
- **Option 2 Staging Model** (`models/candidate_option2/`): **100% untouched**.
- **Option 3 Archived Model** (`models/candidate_option3/`): **100% untouched**.
- **Operational Backend Environment** (`backend/.venv`): **Untouched**.
- **FastAPI Backend Server & Frontend**: Running normally on port 8000 without changes.
- **No Promotion**: Neither Candidate 1, 2, nor 3 has been promoted or set as active.
- **Held-Out Test Set**: Remains completely unread and quarantined.

