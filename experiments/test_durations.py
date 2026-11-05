import sys
import time
from pathlib import Path
import numpy as np

# Ensure root is in sys.path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from backend.app.e2v_extractor import extract_e2v_embedding

print("Testing emotion2vec+ extraction on various audio durations...")
for dur in [6, 10, 20, 30, 60]:
    t0 = time.perf_counter()
    sr = 16000
    t = np.linspace(0, dur, dur * sr, dtype=np.float32)
    # Speech-like audio with fundamental and harmonics
    sig = (
        0.3 * np.sin(2 * np.pi * 180 * t)
        + 0.2 * np.sin(2 * np.pi * 360 * t)
        + 0.1 * np.sin(2 * np.pi * 540 * t)
    ).astype(np.float32)
    
    emb = extract_e2v_embedding(sig)
    elapsed = round((time.perf_counter() - t0), 2)
    print(f"Duration: {dur}s -> shape: {emb.shape}, norm: {np.linalg.norm(emb):.4f}, time: {elapsed}s")

print("All duration extractions completed successfully!")

