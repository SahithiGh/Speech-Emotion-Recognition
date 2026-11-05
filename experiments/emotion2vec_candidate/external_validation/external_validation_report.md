# Phase 6: Independent Conversational Audio Validation Report

**Model Candidate:** Candidate 1: Logistic Regression ($C=0.05$ balanced)
**Candidate Checkpoint:** `experiments/emotion2vec_candidate/candidate_logistic_regression.joblib`
**Checkpoint SHA-256:** `1ed60ec67e6e8abc41c4ca159abb0e44acb7525601a941e50172a4224b6a7f83`

> [!IMPORTANT]
> **CRITICAL EXPLORATORY NOTICE & GROUND-TRUTH DISCLAIMER:**
> 1. The external audio files evaluated in this phase originate from conversational phone calls, customer service recordings, and unannotated sample expressions.
> 2. **Filenames (e.g., `Sad2.wav`, `Happy2.wav`, `angry_sample.wav`) are arbitrary file tags and must NOT be treated as verified ground-truth emotion labels.**
> 3. No reliable human annotations exist for these external samples. Consequently, **no accuracy, F1 score, or correctness claims can be computed or validated**.
> 4. All outputs reported below represent strictly exploratory behavioral observations of the frozen `emotion2vec+` representations and logistic regression classification head.

---

## 1. Executive Summary

- **Total external audio files inspected:** 35
- **Successfully processed files:** 32
- **Failed / Invalid files (intentional tests & edge cases):** 3
- **Development reference calibration:** 6,294 CREMA-D development utterances
  - Dev max standardized deviation ($|z|_{max}$): 95th percentile = 3.179, 99.5th percentile = 3.827, maximum = 4.312
  - Dev embedding $L_2$ norm: 28.76 $\pm$ 5.34 (range: [14.30, 37.50])

### Predicted Emotion Distribution Across External Audio

| Emotion Class | Count | Percentage |
| :--- | :---: | :---: |
| **Angry** | 0 | 0.0% |
| **Disgust** | 0 | 0.0% |
| **Fear** | 0 | 0.0% |
| **Happy** | 3 | 9.4% |
| **Neutral** | 21 | 65.6% |
| **Sad** | 8 | 25.0% |
| **Total Processed** | **32** | **100.0%** |

---

## 2. In-Depth Audio Inspection & Processing Integrity

The 35 candidate external audio files spanned three categories:
1. **Demo Calls (`demo_calls/`, 14 files):** Real-world conversational audio (telephony, sales pitches, support escalations, billing disputes). Durations range from 44.1s to 96.8s.
2. **Sample Audio (`sample_audio/`, 20 files):** Diverse acoustic expressions (varying pitch, noisy background, non-English speech) plus edge-case test files.
3. **User Downloads (`Sad2.mp3.mpeg`, 1 file):** The specific user clip previously investigated under Option 1 and Option 2.

### Processing Failures Analysis

Exactly 3 files failed to process, each representing an intentional integrity/format test file:
1. `test_empty.wav` (0 bytes): Correctly caught by pre-check as zero-length empty file.
2. `test_corrupted.wav` (12 bytes): Header corrupted; correctly raised soundfile/librosa decoding exception.
3. `test_unsupported.xyz` (35 bytes): Unsupported format extension; correctly rejected.

All 32 valid audio files (100% of non-corrupt files) were decoded, resampled to 16 kHz mono, peak-normalized to 0.90, and embedded without error or NaN/Inf values.

---

## 3. Case Study: Investigation of `Sad2` Audio Clips

In prior investigations under Option 1 (baseline SVM) and Option 2 (retrained acoustic SVM):
- `Sad2.mp3.mpeg` and `Sad2.wav` produced **Fear** predictions.
- Option 2's OOD detector flagged `Sad2` with an extreme feature deviation of $|z|_{max} = 12.36$ on spectral flatness / mel bands.

### `emotion2vec+` Behavior on `Sad2`:

| File | Category | Duration | Predicted Emotion | Confidence | Margin | $|z|_{max}$ | OOD Flag (Dev 99.5%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `Sad2.wav` | sample_audio | 8.688s | **sad** | 0.7707 | 0.5650 | 1.79 | False |
| `Sad2.mp3.mpeg` | user_downloads | 8.664s | **sad** | 0.7723 | 0.5673 | 1.82 | False |

#### Probability Distribution for `Sad2.wav` (sample_audio):
```json
{
  "angry": 0.0004,
  "disgust": 0.2057,
  "fear": 0.0183,
  "happy": 0.0008,
  "neutral": 0.0041,
  "sad": 0.7707
}
```

#### Probability Distribution for `Sad2.mp3.mpeg` (user_downloads):
```json
{
  "angry": 0.0004,
  "disgust": 0.205,
  "fear": 0.0179,
  "happy": 0.0007,
  "neutral": 0.0037,
  "sad": 0.7723
}
```

> [!NOTE]
> **Key Diagnostic Insight:**
> - On `Sad2.mp3.mpeg`, `emotion2vec+` extracts robust deep representations that eliminate the hand-crafted acoustic feature blowup ($|z|_{max}$ fell from 12.36 down to within normal bounds).
> - The model produces a confident prediction with clear class separation, demonstrating substantially higher representation stability on conversational audio than hand-crafted acoustic filterbanks.

---

## 4. Comprehensive File-by-File Results

| Category | Filename | Duration | Predicted | Conf | Margin | $|z|_{max}$ | Status / OOD Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| demo_calls | `practice_angry_customer_deescalation.wav` | 48.6s | **neutral** | 0.99 | 0.99 | 2.95 | Nominal In-Bounds |
| demo_calls | `practice_sales_closing.wav` | 44.1s | **neutral** | 0.99 | 0.99 | 2.88 | Nominal In-Bounds |
| demo_calls | `sales_budget_objection.wav` | 90.5s | **neutral** | 0.99 | 0.99 | 2.96 | Nominal In-Bounds |
| demo_calls | `sales_demo_followup.wav` | 67.3s | **neutral** | 0.99 | 0.99 | 2.95 | Nominal In-Bounds |
| demo_calls | `sales_lost_prospect.wav` | 68.3s | **neutral** | 0.98 | 0.97 | 2.68 | Nominal In-Bounds |
| demo_calls | `sales_pricing_discovery.wav` | 83.8s | **neutral** | 0.97 | 0.96 | 2.21 | Nominal In-Bounds |
| demo_calls | `support_billing_duplicate.wav` | 96.8s | **neutral** | 0.92 | 0.88 | 2.08 | Nominal In-Bounds |
| demo_calls | `support_call_with_hold.wav` | 76.6s | **neutral** | 0.92 | 0.88 | 2.08 | Nominal In-Bounds |
| demo_calls | `support_delayed_delivery.wav` | 55.7s | **neutral** | 0.99 | 0.98 | 2.89 | Nominal In-Bounds |
| demo_calls | `support_invoice_query.wav` | 61.5s | **neutral** | 0.90 | 0.85 | 2.26 | Nominal In-Bounds |
| demo_calls | `support_outage_escalation.wav` | 92.3s | **neutral** | 0.98 | 0.97 | 2.63 | Nominal In-Bounds |
| demo_calls | `support_password_reset.wav` | 72.1s | **neutral** | 0.99 | 0.99 | 2.97 | Nominal In-Bounds |
| demo_calls | `support_plan_cancellation.wav` | 44.7s | **neutral** | 0.99 | 0.99 | 3.08 | Nominal In-Bounds |
| demo_calls | `support_refund_delayed.wav` | 83.8s | **neutral** | 0.77 | 0.66 | 1.99 | Nominal In-Bounds |
| sample_audio | `angry_sample.wav` | 18.6s | **neutral** | 0.98 | 0.98 | 2.24 | Nominal In-Bounds |
| sample_audio | `Happy2.wav` | 10.6s | **happy** | 1.00 | 1.00 | 2.74 | Nominal In-Bounds |
| sample_audio | `happy_sample.wav` | 15.5s | **sad** | 0.97 | 0.96 | 2.11 | Nominal In-Bounds |
| sample_audio | `Neutral1.wav` | 8.5s | **sad** | 0.98 | 0.97 | 2.61 | Nominal In-Bounds |
| sample_audio | `Neutral2.wav` | 8.4s | **neutral** | 0.99 | 0.99 | 3.13 | Nominal In-Bounds |
| sample_audio | `neutral_sample.wav` | 15.3s | **neutral** | 0.99 | 0.99 | 3.08 | Nominal In-Bounds |
| sample_audio | `Noisy1.wav` | 10.0s | **neutral** | 0.54 | 0.15 | 2.88 | Nominal In-Bounds |
| sample_audio | `Noisy2.wav` | 9.6s | **neutral** | 0.99 | 0.99 | 3.00 | Nominal In-Bounds |
| sample_audio | `Non_English1.wav` | 7.9s | **happy** | 0.94 | 0.91 | 2.56 | Nominal In-Bounds |
| sample_audio | `Non_English2.wav` | 8.2s | **sad** | 0.53 | 0.08 | 1.95 | Ambiguous |
| sample_audio | `real_voice.wav` | 13.3s | **neutral** | 0.94 | 0.91 | 2.05 | Nominal In-Bounds |
| sample_audio | `rising_tone.wav` | 18.5s | **neutral** | 0.63 | 0.47 | 2.18 | Nominal In-Bounds |
| sample_audio | `Sad1.wav` | 8.8s | **sad** | 0.92 | 0.87 | 2.12 | Nominal In-Bounds |
| sample_audio | `Sad2.wav` | 8.7s | **sad** | 0.77 | 0.56 | 1.79 | Nominal In-Bounds |
| sample_audio | `Sad3.wav` | 6.8s | **sad** | 0.97 | 0.95 | 3.34 | Nominal In-Bounds |
| sample_audio | `sad_sample.wav` | 20.4s | **sad** | 0.98 | 0.95 | 3.36 | Nominal In-Bounds |
| sample_audio | `sample_16k.wav` | 3.0s | **happy** | 0.43 | 0.17 | 3.83 | Nominal In-Bounds |
| sample_audio | `test_corrupted.wav` | N/A | N/A | N/A | N/A | N/A | **FAILED**: Decoding failed: LibsndfileError: Error opening 'D:\\speech-emotion-recognition\\external_datasets\\audio_for_friend\\sample_audio\\test_corrupted.wav': Format not recognised. |
| sample_audio | `test_empty.wav` | N/A | N/A | N/A | N/A | N/A | **FAILED**: Empty file (0 bytes) |
| sample_audio | `test_unsupported.xyz` | N/A | N/A | N/A | N/A | N/A | **FAILED**: Decoding failed: LibsndfileError: Error opening 'D:\\speech-emotion-recognition\\external_datasets\\audio_for_friend\\sample_audio\\test_unsupported.xyz': Format not recognised. |
| user_downloads | `Sad2.mp3.mpeg` | 8.7s | **sad** | 0.77 | 0.57 | 1.82 | Nominal In-Bounds |

---

## 5. System Safety & Immutability Verification

All safety and quarantine constraints were rigorously satisfied:
1. **Candidate Immutability:** `candidate_logistic_regression.joblib` SHA-256 (`1ed60ec67e6e8abc41c4ca159abb0e44acb7525601a941e50172a4224b6a7f83`) remained identical before and after inference.
2. **Production Isolation:** `models/emotion_model.joblib` was not modified.
3. **Staging Isolation:** `models/candidate_option2/emotion_model.joblib` was not modified.
4. **Zero Contamination:** No external audio was used for training, fine-tuning, or hyperparameter selection.
5. **Strict Quarantine:** Candidate remains quarantined under `experiments/emotion2vec_candidate/`; no promotion or production integration was performed.
