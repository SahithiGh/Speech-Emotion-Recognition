"""Download the real CREMA-D WAV files into data/AudioWAV and verify every file.

- Needs only Python (no Git, no Git LFS). Uses GitHub's public Git LFS download service for the official repository.
- Every file is checked against the SHA-256 and size in the official file list (backend/app/resources/crema_d_manifest.csv.gz).
- Safe to stop and run again: verified files are kept, missing or damaged files are fetched again.
- Needs about 610 MB of free disk space and no extra temporary copies.

Usage:  python scripts/download_crema_d.py [--dest DIR] [--workers 6] [--verify-existing]
"""
import argparse
import csv
import gzip
import hashlib
import json
import os
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(os.environ.get("SER_HOME") or Path(__file__).resolve().parents[1])
DEFAULT_MANIFEST = Path(__file__).resolve().parents[1] / "backend" / "app" / "resources" / "crema_d_manifest.csv.gz"
LFS_BATCH_URL = os.environ.get("SER_LFS_BATCH_URL", "https://github.com/CheyneyComputerScience/CREMA-D.git/info/lfs/objects/batch")
UA = {"User-Agent": "speech-emotion-recognition-minor-project"}
QUOTA_WORDS = ("quota", "budget", "bandwidth", "rate limit", "exceeded")


class QuotaError(Exception):
    pass


def read_manifest(path):
    rows = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for r in csv.reader(line for line in f if not line.startswith("#")):
            rows[r[0]] = (r[1], int(r[2]))
    return rows


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def lfs_batch(oids_sizes):
    body = json.dumps({"operation": "download", "transfers": ["basic"],
                       "objects": [{"oid": o, "size": s} for o, s in oids_sizes]}).encode()
    req = urllib.request.Request(LFS_BATCH_URL, data=body, headers={
        **UA, "Accept": "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return {o["oid"]: o for o in json.load(r)["objects"]}
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode("utf-8", "replace")
            if e.code in (403, 429) or any(w in msg.lower() for w in QUOTA_WORDS):
                raise QuotaError(f"GitHub refused the download request ({e.code}): {msg}")
            if attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def fetch_one(name, oid, size, action, dest):
    """Download one object to <name>.part, verify size + SHA-256, then move it into place."""
    part = dest / (name + ".part")
    last = "unknown error"
    for attempt in range(3):
        try:
            req = urllib.request.Request(action["href"], headers={**UA, **action.get("header", {})})
            h, n = hashlib.sha256(), 0
            with urllib.request.urlopen(req, timeout=60) as r, open(part, "wb") as f:
                for block in iter(lambda: r.read(1 << 16), b""):
                    f.write(block); h.update(block); n += len(block)
            if n != size:
                last = f"size {n} != expected {size}"
            elif h.hexdigest() != oid:
                last = "SHA-256 does not match the official value"
            else:
                os.replace(part, dest / name)
                return name, None
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                raise QuotaError(f"download refused ({e.code})")
            last = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = f"{type(e).__name__}: {e}"
        time.sleep(1 + attempt)
    if part.exists():
        part.unlink()
    return name, last


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", default=str(ROOT / "data" / "AudioWAV"))
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--chunk", type=int, default=100, help="files per download-link request")
    ap.add_argument("--verify-existing", action="store_true", help="re-hash files already on disk (slower)")
    args = ap.parse_args(argv)

    manifest = read_manifest(args.manifest)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Official CREMA-D list: {len(manifest)} files, {sum(s for _, s in manifest.values()) / 1e6:.0f} MB")

    todo = []
    for name, (oid, size) in sorted(manifest.items()):
        p = dest / name
        ok = p.is_file() and p.stat().st_size == size and (not args.verify_existing or sha256_of(p) == oid)
        if not ok:
            todo.append(name)
    for stray in dest.glob("*.part"):
        stray.unlink()
    print(f"Already verified on disk: {len(manifest) - len(todo)}   To download: {len(todo)}")
    if not todo:
        print("Nothing to do. The dataset is complete.")
        return 0
    need = sum(manifest[n][1] for n in todo)
    free = shutil.disk_usage(dest).free
    if free < need + 100e6:
        print(f"ERROR: not enough free disk space. Need about {need / 1e6:.0f} MB, have {free / 1e6:.0f} MB. Free some space and run again.")
        return 1

    done, failed, lock = 0, [], threading.Lock()
    try:
        for i in range(0, len(todo), args.chunk):
            names = todo[i:i + args.chunk]
            objs = lfs_batch(sorted({(manifest[n][0], manifest[n][1]) for n in names}))
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futs = []
                for n in names:
                    oid, size = manifest[n]
                    o = objs.get(oid, {})
                    action = (o.get("actions") or {}).get("download")
                    if not action:
                        err = (o.get("error") or {}).get("message", "no download link returned")
                        if any(w in err.lower() for w in QUOTA_WORDS):
                            raise QuotaError(err)
                        failed.append((n, err))
                        continue
                    futs.append(pool.submit(fetch_one, n, oid, size, action, dest))
                for fu in as_completed(futs):
                    name, err = fu.result()
                    with lock:
                        if err:
                            failed.append((name, err))
                        else:
                            done += 1
            print(f"  {done + len(failed)}/{len(todo)} processed ({done} verified, {len(failed)} failed)")
    except QuotaError as e:
        print(f"\nSTOPPED: {e}\nGitHub limits the bandwidth of Git LFS downloads for this repository. Wait and run this script again\n"
              "(verified files are kept), or see 'If the download is blocked' in data/README.md.")
        return 2
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"\nSTOPPED: network problem ({e}). Check your connection and run this script again; it resumes.")
        return 1

    if failed:
        print(f"\n{len(failed)} files failed (first 5): {failed[:5]}\nRun this script again to retry them.")
        return 1
    print(f"\nDownloaded and verified {done} files. Next: python scripts/check_dataset.py --deep")
    return 0


if __name__ == "__main__":
    sys.exit(main())
