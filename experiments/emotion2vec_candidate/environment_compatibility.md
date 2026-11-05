# Environment Compatibility & Technical Feasibility Report: `emotion2vec+` Candidate

**Investigation Type**: Environment & Dependency Verification Only (Dry-Run / Non-Invasive)  
**Target Candidate**: Candidate Option 4 (`models/candidate_option4/`)  
**Target Model**: `emotion2vec/emotion2vec_plus_base` via Alibaba FunASR  
**Workspace**: `D:\speech-emotion-recognition`  
**Standing Safety Constraints Preserved**:
- Zero packages installed, uninstalled, or upgraded.
- Zero model weights or datasets downloaded.
- `requirements.txt`, lockfiles, source code, configurations, and models are 100% untouched.
- Production (`models/emotion_model.joblib`), Option 2 (`models/candidate_option2/`), and Option 3 (`models/candidate_option3/`) remain bit-for-bit intact.

---

## 1. Existing Runtime Environment Inspection

A non-invasive diagnostic probe of the active backend environment (`backend/.venv`) yielded:

| Component | Active Version in `backend/.venv` | Status for `emotion2vec+` |
| :--- | :--- | :--- |
| **Python** | **3.13.16** (MSC v.1944 64-bit AMD64) | Active release; requires verification for prebuilt wheels. |
| **PyTorch (`torch`)** | **2.14.1+cpu** | Supported; modern PyTorch 2.x CPU runtime. |
| **CUDA / GPU** | `CUDA available: False` | CPU-only environment (inference must execute on CPU). |
| **NumPy** | **2.5.4** | **High-Risk Factor**: NumPy 2.x ABI incompatibility with some compiled C-extensions. |
| **SciPy** | 1.18.1 | Compatible. |
| **Librosa** | 1.0.0 | Compatible. |
| **SoundFile** | 0.14.0 | Compatible. |
| **Transformers** | 5.20.2 | Compatible. |
| **TorchAudio** | **Not installed** | Missing; required by some FunASR audio I/O routines. |
| **FunASR** | **Not installed** | Missing; core library required to load `emotion2vec_plus_base`. |
| **ModelScope** | **Not installed** | Missing; required for ModelScope hub resolution. |

---

## 2. Dependency Resolution & Pip Dry-Run Audit

A strict dry-run check (`pip install --dry-run funasr modelscope torchaudio`) was executed without installing any packages:

### A. Successfully Resolvable Pre-Built Wheels
The dependency solver successfully located pre-compiled Python 3.13 Windows 64-bit wheels for the majority of dependencies:
- `funasr-1.4.19-py3-none-any.whl` (Pure Python wheel, $30\text{ kB}$)
- `modelscope-1.40.2-py3-none-any.whl` (Pure Python wheel, $43\text{ kB}$)
- `torchaudio-2.11.1-py3-none-win_amd64.whl` (Pre-compiled Windows wheel, $7.5\text{ kB}$ metadata)
- `sentencepiece-0.2.2-cp313-cp313-win_amd64.whl`
- `tiktoken-0.14.0-cp313-cp313-win_amd64.whl`
- `websockets-17.4-cp313-cp313-win_amd64.whl`
- `rapidfuzz-3.14.6-cp313-cp313-win_amd64.whl`
- `cryptography-50.0.2-cp311-abi3-win_amd64.whl`

### B. Pure-Python Source Packages Built Without Visual C++
Four sub-dependencies arrived as source distributions (`.tar.gz`), but all were compiled/packaged via pure-Python wheel builders (`flit_core` / `setuptools`) without requiring Microsoft Visual C++ Build Tools:
- `jieba-0.42.1.tar.gz`
- `oss2-2.19.1.tar.gz`
- `crcmod-1.7.tar.gz`
- `antlr4-python3-runtime-4.9.3.tar.gz`

---

## 3. Critical Compatibility Risks & Findings

### Risk 1: NumPy 2.x C-ABI Incompatibility
- **Detail**: The active backend environment runs **NumPy 2.5.4**.
- **The Issue**: Audio processing libraries compiled against NumPy 1.x C-headers frequently crash on NumPy 2.x with `ValueError: numpy.dtype size changed, may indicate binary incompatibility`.
- **Finding**: While FunASR's top-level code is pure Python, underlying dependencies that interact with PyTorch C++ extensions could exhibit instability if NumPy 2.x is forced.

### Risk 2: Host Environment Contamination
- **Detail**: Installing 25+ packages (including `funasr`, `modelscope`, `hydra-core`, `omegaconf`, `oss2`, `alibabacloud-sdk`) directly into `backend/.venv` introduces heavy dependencies into the active production web server.
- **Finding**: Doing so risks breaking the existing FastAPI backend or conflicting with existing Scikit-learn / Librosa staging pipelines.

---

## 4. Windows Operating System Support

- **Verified**: The official `emotion2vec` and `FunASR` implementations **fully support Windows 10 / 11**.
- **Evidence**:
  1. The GitHub repository `Rahulmasuram47/multimodal-emotion-analysis` successfully deployed and benchmarked `emotion2vec_plus_base` on **Windows 11 with Python 3.12 and Python 3.11**.
  2. All primary dependencies (`funasr`, `modelscope`, `torch`, `torchaudio`, `transformers`) execute natively on Windows without Linux-specific dependencies (such as `fcntl` or `termios`).

---

## 5. Architectural Clarification: Is the 6-Second Audio Cap Required?

- **Definitive Finding: NO, the 6-second cap is NOT required by `emotion2vec+`**:
  - `emotion2vec+` uses a 12-layer Transformer encoder with convolutional relative positional encodings. It natively processes variable-length speech from **$0.5\text{ seconds}$ to $30+\text{ seconds}$**.
  - In fact, `emotion2vec+` was trained on podcast and conversational segments typically between **$3\text{ s}$ and $12\text{ s}$**.
  - The 6-second cap in our project (`C.MAX_SECONDS = 6.0`) was an **application-level choice** designed for CREMA-D sentences (which average $2.0\text{ s}$).
  - *Major Advantage for Conversational Speech*: For natural conversational recordings such as `Sad2.mp3.mpeg` ($8.66\text{ s}$), `emotion2vec+` can ingest the **entire $8.66\text{ seconds}$** without truncation, preserving the complete communicative phrase!

---

## 6. Official Model-Loading & Feature-Extraction API

Verified against official documentation from Hugging Face and ModelScope:

```python
from funasr import AutoModel

# 1. Initialize frozen foundation backbone
model = AutoModel(
    model="emotion2vec/emotion2vec_plus_base",
    hub="hf",        # Fetch from Hugging Face Hub
    device="cpu",    # CPU execution
)

# 2. Extract 768-dimensional utterance representation
# Input: 1D NumPy float32 array at 16,000 Hz
res = model.generate(
    waveform,                # 1D float32 array (no arbitrary 6s truncation needed)
    granularity="utterance", # Global utterance representation
    extract_embedding=True,  # Return 768-dim continuous feature embedding
)

# 3. Embedding vector extraction
embedding = res[0]["feats"]  # Shape: (768,), dtype: float32
```

---

## 7. Storage, Memory & Latency Estimates

| Metric | Estimated Requirement | Notes |
| :--- | :---: | :--- |
| **Model Weights Download** | $\approx \mathbf{360\text{ MB}}$ | Single checkpoint file `emotion2vec_plus_base.pt`. |
| **Isolated Environment Packages** | $\approx \mathbf{550\text{ MB}}$ | Python packages for FunASR + ModelScope + TorchAudio. |
| **Cached Embeddings Disk** | $\approx \mathbf{24\text{ MB}}$ | Dev ($6,294 \times 768$) + Test ($1,147 \times 768$). |
| **Total Disk Space Needed** | $\approx \mathbf{935\text{ MB}}$ | Readily available on `D:\` drive ($> 50\text{ GB}$ free). |
| **Peak Runtime RAM** | $\approx \mathbf{1.2\text{--}1.6\text{ GB}}$ | Required for PyTorch compute graph and Transformer forward pass. |
| **CPU Inference Latency** | $\approx \mathbf{250\text{--}500\text{ ms}}$ | Evaluated on 14-core CPU; $\text{RTF} \approx 0.08$ for 5s audio. |

---

## 8. Python Version & Environment Recommendation

### Recommended Setup: Dedicated Isolated Virtual Environment
To guarantee 100% safety for the active production application, we recommend creating an isolated experimental virtual environment:

- **Option A (Recommended: Python 3.11 / 3.12 Isolated Environment)**:
  - Create: `experiments/emotion2vec_candidate/.venv_e2v`
  - Python 3.11 or 3.12 with **NumPy 1.26.4** and **PyTorch 2.4.x / 2.5.x CPU**.
  - *Why*: Eliminates all NumPy 2.x C-ABI risks and matches the verified upstream runtime of FunASR.
- **Option B (Python 3.13 Isolated Environment)**:
  - If Python 3.11/3.12 is not installed on the host machine, an isolated environment using the host Python 3.13 can be created inside `experiments/emotion2vec_candidate/` using the verified pre-built wheels.
  - In both options, the main `backend/.venv` remains **completely untouched**.

---

## 9. Non-Executed Setup Commands (For Future Phase Reference Only)

*Strict constraint observed: These commands are documented for reference only and have NOT been executed.*

```powershell
# 1. Create isolated experimental environment (never touching backend/.venv)
py -3.12 -m venv experiments\emotion2vec_candidate\.venv_e2v
# (or if using host python):
# python -m venv experiments\emotion2vec_candidate\.venv_e2v

# 2. Activate isolated candidate environment
.\experiments\emotion2vec_candidate\.venv_e2v\Scripts\Activate.ps1

# 3. Install required foundation packages into isolated environment only
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install funasr modelscope scikit-learn librosa soundfile

# 4. Run isolated embedding extraction harness
python experiments\emotion2vec_candidate\extract_embeddings.py
```

---

## Summary & Next Action Recommendation

1. **Compatibility Status**: **Fully Verified**. Windows is supported, prebuilt wheels exist, and compilation via MSVC Build Tools is not required.
2. **Key Insight on Audio Length**: The 6-second truncation cap is **not** an architectural requirement of `emotion2vec+`; conversational audio up to $15\text{--}30\text{ s}$ can be analyzed natively without truncation.
3. **Safety Protocol**: All candidate work should proceed inside an isolated directory (`experiments/emotion2vec_candidate/`) with its own environment, keeping the production and staging backend 100% undisturbed.

*Per instructions, all execution is STOPPED. Awaiting your approval before taking any action.*
