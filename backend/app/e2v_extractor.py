"""Bridge module connecting backend inference with the isolated emotion2vec+ environment.

Extracts 768-dimensional utterance embeddings by delegating audio to
experiments/emotion2vec_candidate/.venv_e2v via a persistent daemon worker
with one-shot CLI fallback.
"""

import json
import logging
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from . import config as C
from .errors import AudioError, ModelNotTrainedError

log = logging.getLogger("ser.e2v")
MSG_PREFIX = "__E2V_MSG__:"


class Emotion2VecBridge:
    """Manages the persistent worker process inside .venv_e2v."""

    def __init__(self):
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None
        self._python_path = C.ROOT / "experiments" / "emotion2vec_candidate" / ".venv_e2v" / "Scripts" / "python.exe"
        self._service_script = C.ROOT / "experiments" / "emotion2vec_candidate" / "extractor_service.py"

    def is_environment_available(self) -> bool:
        return self._python_path.exists() and self._service_script.exists()

    def _read_daemon_msg(self, timeout_s: float = 30.0) -> dict:
        """Read lines from stdout until a message with MSG_PREFIX is received."""
        start = time.monotonic()
        while time.monotonic() - start < timeout_s:
            if self._process is None or self._process.poll() is not None:
                raise RuntimeError("Worker process terminated unexpectedly.")
            line = self._process.stdout.readline()
            if not line:
                if self._process.poll() is not None:
                    raise RuntimeError("Worker process terminated unexpectedly.")
                time.sleep(0.01)
                continue
            line = line.strip()
            if line.startswith(MSG_PREFIX):
                payload = line[len(MSG_PREFIX):]
                return json.loads(payload)
            # Other lines are library logs / warnings; ignore them
        raise TimeoutError(f"Timed out waiting for daemon response after {timeout_s}s")

    def _start_worker(self):
        if not self.is_environment_available():
            raise ModelNotTrainedError(
                f"emotion2vec+ isolated environment not found at {self._python_path}. "
                "Ensure experiments/emotion2vec_candidate/.venv_e2v is initialized."
            )

        log.info("Starting emotion2vec+ sidecar worker daemon: %s", self._python_path)
        try:
            self._process = subprocess.Popen(
                [str(self._python_path), "-u", str(self._service_script), "--daemon"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=os.environ.copy(),
                text=True,
                bufsize=1,
            )

            # Wait for ready banner
            data = self._read_daemon_msg(timeout_s=60.0)
            if data.get("status") != "ready":
                raise RuntimeError(f"Unexpected daemon startup response: {data}")

            log.info("emotion2vec+ sidecar worker is warm and ready.")
        except Exception as exc:
            self.shutdown()
            raise ModelNotTrainedError(f"Failed to initialize emotion2vec+ worker: {exc}") from exc

    def _ensure_worker(self):
        if self._process is None or self._process.poll() is not None:
            self._start_worker()

    def warmup(self):
        """Pre-warm the daemon worker during application startup."""
        with self._lock:
            self._ensure_worker()

    def extract(self, y: np.ndarray) -> np.ndarray:
        """Extract 768-D utterance embedding from mono 16 kHz audio array."""
        y = np.asarray(y, dtype=np.float32)
        if y.ndim != 1 or y.size == 0:
            raise AudioError("Invalid audio signal for embedding extraction.")

        # Peak-normalize to 0.90 to match Phase 3 training extraction
        peak = float(np.max(np.abs(y)))
        if peak > 0:
            y = (y / peak) * 0.90
        y = y.astype(np.float32)

        # Write to temporary WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            sf.write(tmp_path, y, C.SAMPLE_RATE, format="WAV", subtype="PCM_16")

            with self._lock:
                try:
                    self._ensure_worker()
                    # Send extraction request
                    req = json.dumps({"action": "extract", "wav_path": tmp_path}) + "\n"
                    self._process.stdin.write(req)
                    self._process.stdin.flush()

                    res = self._read_daemon_msg(timeout_s=max(45.0, float(C.PREDICT_TIMEOUT_SECONDS)))
                    if res.get("status") != "ok" or "embedding" not in res:
                        raise RuntimeError(res.get("error", "Extraction failed"))

                    emb = np.array(res["embedding"], dtype=np.float32)

                except Exception as exc:
                    log.warning("Daemon communication failed (%s); attempting one-shot fallback...", exc)
                    self.shutdown()
                    emb = self._extract_oneshot(tmp_path)

            if emb.shape != (768,):
                raise ValueError(f"Extracted embedding has unexpected shape: {emb.shape}")
            if not np.all(np.isfinite(emb)):
                raise ValueError("Extracted embedding contains NaN or Inf values")

            return emb

        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def _extract_oneshot(self, wav_path: str) -> np.ndarray:
        """Fallback one-shot execution."""
        worker_env = {**os.environ, "HF_HUB_OFFLINE": "1"}
        proc = subprocess.run(
            [str(self._python_path), str(self._service_script), "--input", wav_path],
            capture_output=True,
            text=True,
            env=worker_env,
            timeout=C.PREDICT_TIMEOUT_SECONDS,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"One-shot extraction failed: {proc.stderr}")

        lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        for line in reversed(lines):
            try:
                res = json.loads(line)
                if res.get("status") == "ok" and "embedding" in res:
                    return np.array(res["embedding"], dtype=np.float32)
            except Exception:
                continue

        raise RuntimeError(f"Could not parse embedding from output: {proc.stdout}")

    def shutdown(self):
        with self._lock:
            if self._process is not None:
                try:
                    self._process.stdin.write(json.dumps({"action": "exit"}) + "\n")
                    self._process.stdin.flush()
                    self._process.wait(timeout=2)
                except Exception:
                    try:
                        self._process.terminate()
                    except Exception:
                        pass
                self._process = None


# Module-level singleton
_bridge: Emotion2VecBridge | None = None


def get_bridge() -> Emotion2VecBridge:
    global _bridge
    if _bridge is None:
        _bridge = Emotion2VecBridge()
    return _bridge


def shutdown_bridge():
    global _bridge
    if _bridge is not None:
        _bridge.shutdown()
        _bridge = None


def extract_e2v_embedding(y: np.ndarray) -> np.ndarray:
    return get_bridge().extract(y)
