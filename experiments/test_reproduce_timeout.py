"""Reproduction script for Happy2.mp3.mpeg and Sad2.mp3.mpeg via HTTP POST /api/predict.
"""
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import json

ROOT = r"D:\speech-emotion-recognition"
PYTHON_BIN = os.path.join(ROOT, "backend", ".venv", "Scripts", "python.exe")
HAPPY_PATH = r"C:\Users\JAI-SREE-RAM\Downloads\Happy2.mp3.mpeg"
SAD_PATH = r"C:\Users\JAI-SREE-RAM\Downloads\Sad2.mp3.mpeg"


def post_file(url: str, filepath: str):
    filename = os.path.basename(filepath)
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    with open(filepath, "rb") as f:
        file_bytes = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: audio/mpeg\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            elapsed = time.perf_counter() - t0
            return resp.status, elapsed, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        elapsed = time.perf_counter() - t0
        err_body = exc.read().decode("utf-8")
        return exc.code, elapsed, err_body
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        return None, elapsed, str(exc)


def main():
    profile = sys.argv[1] if len(sys.argv) > 1 else "emotion2vec_experimental"
    print(f"Starting server with SER_MODEL_PROFILE={profile}...")

    env = os.environ.copy()
    if profile == "production":
        env.pop("SER_MODEL_PROFILE", None)
    else:
        env["SER_MODEL_PROFILE"] = profile

    proc = subprocess.Popen(
        [PYTHON_BIN, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=os.path.join(ROOT, "backend"),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        # Wait for server
        for _ in range(30):
            try:
                with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=1) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(1)

        print("Server is up. Testing files...")

        for path in [SAD_PATH, HAPPY_PATH]:
            print(f"\nPosting {os.path.basename(path)}...")
            status, elapsed, body = post_file("http://127.0.0.1:8000/api/predict", path)
            print(f"Response ({elapsed:.2f}s) status={status}:")
            print(body if isinstance(body, str) else json.dumps(body, indent=2)[:300] + "...")

    finally:
        proc.terminate()
        try:
            out, _ = proc.communicate(timeout=5)
            print("\nServer log tail:")
            print("\n".join(out.splitlines()[-20:]))
        except Exception:
            pass


if __name__ == "__main__":
    main()

