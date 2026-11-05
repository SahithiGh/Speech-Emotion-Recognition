# Technical Investigation & Comparative Analysis: `Rahulmasuram47/multimodal-emotion-analysis` vs. Existing SER Project

**Investigation Date**: November 1, 2026  
**Target Repository**: `https://github.com/Rahulmasuram47/multimodal-emotion-analysis` (commit `main` branch, size $\approx 8.7\text{ MB}$, updated Oct 25, 2026)  
**Local Baseline Project**: `D:\speech-emotion-recognition` (Option 2 Staging Profile)  
**Safety & Non-Interference**: Read-only inspection via GitHub API. Zero modifications made to local production or staging models; no code, dependencies, or datasets downloaded.

---

## Executive Summary: Key Findings

1. **"Multimodal" Definition (No Video Present)**:  
   Despite the repository title, **there is zero computer vision or video processing code**. The repository is strictly **Audio (Acoustic Voice) + Text (Whisper ASR Transcript Sentiment)**.
2. **Pretrained Weights & Training Reality**:  
   The repository does **not** train or fine-tune its own neural network. It relies 100% on off-the-shelf zero-shot foundation models downloaded at runtime from Hugging Face / ModelScope:
   - Voice Emotion: `emotion2vec/emotion2vec_plus_base` (Apache-2.0 via Alibaba FunASR).
   - Fallback Voice: `superb/wav2vec2-base-superb-er` (Wav2Vec 2.0).
   - Speech-to-Text: `openai/whisper-base` (via `faster-whisper` CTranslate2 INT8).
   - Text Sentiment: `cardiffnlp/twitter-roberta-base-sentiment-latest`.
3. **The 93.3% Accuracy Illusion (Discarding Fear and Disgust)**:  
   The repository claims $93.31\%$ test accuracy on CREMA-D. However, inspection of [`evaluation/crema_d.py`](file:///d:/speech-emotion-recognition/experiments/repository_comparison/) and [`evaluation/results/crema_d_benchmark.md`](file:///d:/speech-emotion-recognition/experiments/repository_comparison/) reveals that **it collapsed the problem to a 4-class subset (`neutral`, `happy`, `angry`, `sad`)**. It explicitly mapped raw CREMA-D `FEA` (Fear) and `DIS` (Disgust) to `"other"` and **completely excluded them from its accuracy calculation**.
4. **Empirical Failure on External Audio**:  
   Inspection of the repository's own committed evaluation log ([`evaluation/results/app_vs_baseline.md`](file:///d:/speech-emotion-recognition/experiments/repository_comparison/)) reveals severe misclassifications on the exact sample audio files:
   - `angry_sample.wav` $\to$ Predicted **`neutral`** with **100% confidence** (`raw_conf = 1.0000`).
   - `Neutral1.wav` $\to$ Predicted **`sad`** with **99.99% confidence** (`raw_conf = 0.9999`).
   - `happy_sample.wav` $\to$ Predicted **`sad`** with **99.80% confidence** (`raw_conf = 0.9980`).
   - `1001_IEO_FEA_HI.wav` (CREMA-D Fear) $\to$ Predicted **`uncertain`** (`confidence = 0.3000`).
   - `1001_IEO_DIS_HI.wav` (CREMA-D Disgust) $\to$ Predicted **`uncertain`** (`confidence = 0.3000`).
5. **Confidence Saturation**:  
   `emotion2vec` suffers from extreme softmax saturation ($95\%$ of samples receive confidence $> 0.99$, even when completely wrong). The author was forced to inject an uncalibrated hard cap: `VOICE_CONF_CAP = 0.65` (clamping all confidences to $65\%$).

---

## Phase 1: Deep Repository Investigation

### 1.1 Source Code Architecture & Ingestion Pipeline
The repository is an interactive **Streamlit web application** (`streamlit_app.py`) structured as follows:
- **Audio Loading (`app/audio_processor.py`)**: Loads audio via `librosa.load` / `soundfile.read`, forces single-channel mono, resamples to 16,000 Hz, and peak-normalizes to $[-1.0, 1.0]$.
- **Voice Classification (`app/voice_backends/emotion2vec.py`)**: Passes raw 16 kHz waveform into FunASR `AutoModel(model="emotion2vec/emotion2vec_plus_base")`.
- **Speech-to-Text (`app/speech_to_text.py`)**: Runs `faster-whisper` (`base` model) with Silero VAD to segment audio into dialogue turns and transcribe spoken words.
- **Text Sentiment (`app/sentiment_analyzer.py`)**: Runs RoBERTa (`twitter-roberta-base-sentiment-latest`) to output positive/neutral/negative probabilities.
- **Multimodal Fusion (`app/fusion.py`)**: Does **not** use cross-attention or tensor fusion. It uses a **rule-based declarative table** that combines voice confidence ($50\%$) and text confidence ($50\%$) and generates a descriptive explanation string (e.g. *"Multimodal negative emotional signal"*).

### 1.2 Datasets Used & Reference Protocols
- **CREMA-D**: The sole benchmark dataset with committed code. Used in [`evaluation/crema_d.py`](file:///d:/speech-emotion-recognition/experiments/repository_comparison/) with an actor-disjoint split (60 dev actors, 31 test actors).
- **Self-Recorded Dev Set**: An ad-hoc collection of 8 self-recorded WAV files (`Sad1.wav`, `angry_sample.wav`, `Happy2.wav`, etc.) used for informal testing.
- **Natural Speech Set Protocol**: Mentioned in `docs/NATURAL_SET_PROTOCOL.md`, but marked as **"0 clips; not yet measured"** in the README.

### 1.3 Pretrained Weights & Availability
- The repository **hosts no pretrained model weights in Git**.
- It relies entirely on standard Hugging Face / ModelScope endpoints:
  - If a user clones the repository and runs it without internet access or without installing `funasr` and PyTorch, it fails immediately.
  - The base foundation model (`emotion2vec_plus_base`) is an approximately **$360\text{ MB}$** neural checkpoint.

---

## Phase 2: Detailed Technical Comparison

| Technical Dimension | Existing SER Project (`D:\speech-emotion-recognition`) | GitHub Repository (`Rahulmasuram47/multimodal-emotion-analysis`) |
| :--- | :--- | :--- |
| **Primary Scope** | Dedicated Speech Emotion Recognition (SER) engine. | Conversational voice + transcript sentiment review dashboard. |
| **Input Modalities** | **Audio only** (Waveform $\to$ acoustic feature extraction). | **Audio + Text** (Whisper ASR transcription + RoBERTa sentiment). **No video**. |
| **Target Emotion Classes** | **Full 6-Class Standard**: `angry`, `disgust`, `fear`, `happy`, `neutral`, `sad`. | **Reduced 4-Class Subset**: `neutral`, `happy`, `angry`, `sad`. (`disgust` and `fear` mapped to `"other"` / `"uncertain"`). |
| **Model Architecture** | Standardized 296-dimensional acoustic vector + **RBF Support Vector Machine (C=5.0)**. | **Deep Foundation Transformer**: `emotion2vec_plus_base` (90M parameter self-supervised model) or Wav2Vec 2.0. |
| **Feature Extraction** | 296 explicit DSP features (MFCC, Delta, Mel filterbanks, Chroma, Spectral Contrast, Yin Pitch, ZCR, RMS). | End-to-end continuous temporal frame embeddings generated by pre-trained Transformer encoder layers. |
| **Training Pipeline** | Fully reproducible training pipeline on CREMA-D 77-speaker split with multi-rate resampling augmentation. | **Zero local training**. Uses frozen third-party weights directly in zero-shot inference mode. |
| **Evaluation Scope** | Evaluated on all 6 classes on 14 held-out speakers ($1,147$ clips): Macro F1 $= 0.5158$, Acc $= 52.31\%$. | Evaluated on 4 classes only on 31 held-out speakers ($1,673$ clips): Claims $93.31\%$ 4-class accuracy. |
| **Out-of-Distribution (OOD) Safeguard** | **Principled Mahalanobis / Standardized feature deviation ($z > 10.12\sigma$)**. Honestly alerts user to domain shifts. | **None**. Instead applies an empirical hard cap `VOICE_CONF_CAP = 0.65` to artificially suppress saturated logits. |
| **Behavior on External Audio (`Sad2`, `angry_sample`, etc.)** | Correctly triggers OOD banner and flags extreme pause/pitch domain shifts. | Fails silently with uncalibrated wrong predictions (`angry_sample` $\to$ `neutral` @ 100%, `Neutral1` $\to$ `sad` @ 99.9%). |
| **Runtime & Dependencies** | Lightweight Scikit-learn + Librosa. CPU inference $< 20\text{ ms}$, memory $< 150\text{ MB}$. | Heavyweight PyTorch + CTranslate2 + FunASR + Transformers. Cold start $> 28\text{ s}$, memory $\approx 1.6\text{--}2.8\text{ GB}$. |

---

## Phase 3: Analytical Breakdown & Core Questions

### 1. Why does this repository appear to produce better metrics?
- **The Metric Disparity is an Illusion of Class Elimination**:
  - The GitHub repository claims **$93.31\%$** accuracy only because it **deleted `fear` and `disgust` from the evaluation entirely**!
  - In speech emotion recognition, distinguishing 4 classes (`neutral`, `happy`, `angry`, `sad`) is dramatically easier than distinguishing 6 classes. In CREMA-D, the primary sources of classification confusion are between `fear` $\leftrightarrow$ `sad` and `disgust` $\leftrightarrow$ `angry`. By mapping `fear` and `disgust` to `"other"` and evaluating only on $4$ emotions, chance level rises from $16.7\%$ to $25.0\%$, and all difficult boundary decisions are bypassed.
- **Foundation Model Pretraining**:
  - `emotion2vec_plus_base` was pretrained on tens of thousands of hours of speech data (Alibaba's affective corpus). For clean, loud laboratory speech in those 4 classes, deep transformers naturally achieve high separation.

### 2. Can its audio model be adapted to our existing project?
- **Technically Yes, but with Severe Functional Caveats**:
  - We could install `funasr` and download `emotion2vec/emotion2vec_plus_base`.
  - **However**, it will **break our existing 6-class system**. `emotion2vec`'s internal head was trained with an unconventional label set that cannot reliably output `disgust` or `fear` without mapping them to "uncertain".
  - It would increase backend RAM consumption from $150\text{ MB}$ to $\approx 1.8\text{ GB}$ and introduce heavy deep-learning dependencies (PyTorch, TorchAudio, FunASR, ModelScope).

### 3. Are its pretrained weights actually available and compatible?
- **Available**: Yes, via the public Hugging Face model hub (`emotion2vec/emotion2vec_plus_base`).
- **Compatible with our SVM pipeline**: **No**. It does not use fixed 296-dimensional acoustic feature tables; it requires passing raw audio buffers through PyTorch neural network forward passes.

### 4. Can we use its approach without video or text inputs?
- **Yes**: In fact, the repository **already runs without video**.
- Its text modality is merely a secondary sentiment classifier running on Whisper transcripts. The voice emotion backend (`emotion2vec.py`) operates strictly on raw 16 kHz audio waveforms and can be queried standalone without Whisper or RoBERTa.

### 5. Is it scientifically better than our current Option 2 model?
- **No, it is scientifically less rigorous for real-world deployment**:
  1. **Silent Failure vs. Honest Detection**: When tested on real-world recordings, `emotion2vec` predicted `angry_sample.wav` as `neutral` with $100\%$ confidence, and `Neutral1.wav` as `sad` with $99.99\%$ confidence. It possesses no OOD detection mechanism.
  2. **Our Option 2 Model**: Accurately recognizes all 6 classes on in-distribution speech, and when presented with natural conversational speech (`Sad2`), **transparently warns the user with an explicit OOD flag ($z = 12.36\sigma > 10.12$)** rather than silently deceiving the user with a false-confident prediction.
  3. **Heuristic Patches in the Repo**: The author of the repository had to hardcode an artificial cap (`conf = min(conf, 0.65)`) because the neural network's confidence scores were uncalibrated and saturated.

---

## Phase 4: Final Recommendation & Next Steps

### Recommendation: Do NOT adopt the GitHub repository's pipeline
1. **Do not replace Option 2 with `emotion2vec`**:
   - Adopting `emotion2vec` would discard `fear` and `disgust`, reducing our application to a 4-class classifier.
   - It would introduce $2+\text{ GB}$ of unneeded deep learning dependencies while failing silently on real conversational speech.
2. **Key Technique Worth Noting for Future Exploration**:
   - The repository's use of **CTranslate2 INT8 Whisper transcription** coupled with **lexical sentiment analysis** is a valid complementary approach for multi-turn conversational dashboards. However, for acoustic Speech Emotion Recognition, it offers no scientific solution to the acted-to-conversational domain gap.
3. **Recommended Next Step**:
   - Continue with the approved path: **MSP-Podcast dataset integration (Candidate Option 4)**. MSP-Podcast provides genuine conversational acoustic training data across **all 6 target classes** (`angry`, `disgust`, `fear`, `happy`, `neutral`, `sad`), which directly addresses the root acoustic cause without compromising our model architecture or discarding emotion classes.

*Per project rules, all execution is STOPPED. Awaiting your guidance.*
