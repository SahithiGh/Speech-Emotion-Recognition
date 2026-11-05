"""Extract frozen 768-dimensional utterance embeddings from CREMA-D using emotion2vec+.

Phase 3: CREMA-D Embedding Extraction
- Model: emotion2vec/emotion2vec_plus_base (FunASR)
- Audio format: 16 kHz mono, peak-normalized to 0.90
- Dataset: 7,441 verified CREMA-D clips (data/AudioWAV)
- Split:
  - Development: 6,294 samples from 77 speakers
  - Held-out test: 1,147 samples from 14 speakers
- Output caches:
  - experiments/emotion2vec_candidate/dev_embeddings.npz
  - experiments/emotion2vec_candidate/test_embeddings.npz
- Features:
  - Incremental extraction with resume support
  - Batching (batch size 32) to keep RAM < 1.5 GB
  - Complete validation: shapes, finite checks, speaker disjointness, zero leakage
"""

import argparse
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import librosa
import numpy as np
import psutil
from funasr import AutoModel

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
AUDIO_DIR = PROJECT_ROOT / "data" / "AudioWAV"
SPLIT_PATH = PROJECT_ROOT / "outputs" / "speaker_split.json"
CANONICAL_CACHE = PROJECT_ROOT / "experiments" / "exp3_vad_gated" / "vad_native_cache.npz"

PARTIALS_DIR = SCRIPT_DIR / "cache_partials"
DEV_EMB_PATH = SCRIPT_DIR / "dev_embeddings.npz"
TEST_EMB_PATH = SCRIPT_DIR / "test_embeddings.npz"
SUMMARY_PATH = SCRIPT_DIR / "extraction_summary.json"


def sha256_file(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_audio_clip(audio_path: str) -> np.ndarray:
    """Load audio clip, resample to 16 kHz mono, and peak-normalize to 0.90."""
    y, sr = librosa.load(audio_path, sr=16000, mono=True)
    pk = float(np.max(np.abs(y)))
    if pk > 0:
        y = (y / pk) * 0.90
    return y.astype(np.float32)


def get_dataset_items():
    """Load and verify the 7,441 CREMA-D items and the speaker split."""
    if not CANONICAL_CACHE.exists():
        raise FileNotFoundError(f"Canonical cache not found at {CANONICAL_CACHE}")
    if not SPLIT_PATH.exists():
        raise FileNotFoundError(f"Split file not found at {SPLIT_PATH}")

    with open(SPLIT_PATH, "r", encoding="utf-8") as f:
        split_data = json.load(f)

    dev_speakers = set(split_data["development"])
    test_speakers = set(split_data["test"])

    # Disjointness check
    assert len(dev_speakers & test_speakers) == 0, "Speaker leakage detected in split definition!"
    assert len(dev_speakers) == 77, f"Expected 77 dev speakers, found {len(dev_speakers)}"
    assert len(test_speakers) == 14, f"Expected 14 test speakers, found {len(test_speakers)}"

    c = np.load(CANONICAL_CACHE, allow_pickle=True)
    names = [str(n) for n in c["names"]]
    labels = [str(y) for y in c["y"]]
    actors = [str(a) for a in c["actors"]]

    assert len(names) == 7441, f"Expected 7,441 canonical clips, found {len(names)}"

    dev_items = []
    test_items = []

    for name, label, actor in zip(names, labels, actors):
        item = {
            "name": name,
            "path": str(AUDIO_DIR / name),
            "label": label,
            "speaker_id": actor,
        }
        if actor in dev_speakers:
            dev_items.append(item)
        elif actor in test_speakers:
            test_items.append(item)
        else:
            raise ValueError(f"Actor {actor} not found in development or test speakers!")

    assert len(dev_items) == 6294, f"Expected 6,294 dev clips, found {len(dev_items)}"
    assert len(test_items) == 1147, f"Expected 1,147 test clips, found {len(test_items)}"

    return dev_items, test_items, dev_speakers, test_speakers


def extract_split(split_name: str, items: list, model: AutoModel, batch_size: int = 32):
    """Extract embeddings for a split with resume capability and chunked partial caching."""
    print(f"\n[{split_name.upper()}] Starting extraction for {len(items)} clips (Batch size: {batch_size})...")
    PARTIALS_DIR.mkdir(parents=True, exist_ok=True)

    # Check for existing partials
    completed = {}
    for partial_file in PARTIALS_DIR.glob(f"batch_{split_name}_*.npz"):
        try:
            data = np.load(partial_file, allow_pickle=True)
            p_names = [str(n) for n in data["filenames"]]
            p_embs = data["embeddings"]
            p_labels = [str(l) for l in data["labels"]]
            p_actors = [str(a) for a in data["speaker_ids"]]
            for n, e, l, a in zip(p_names, p_embs, p_labels, p_actors):
                if e.shape == (768,) and np.all(np.isfinite(e)):
                    completed[n] = (e, l, a)
        except Exception as e:
            print(f"Warning: Corrupted partial {partial_file.name}: {e}. Removing.")
            partial_file.unlink(missing_ok=True)

    print(f"[{split_name.upper()}] Resuming: {len(completed)}/{len(items)} already extracted.")

    # Process remaining in batches
    items_to_process = [item for item in items if item["name"] not in completed]
    n_remaining = len(items_to_process)
    print(f"[{split_name.upper()}] Remaining clips to extract: {n_remaining}")

    failures = []
    t_start = time.time()
    extracted_this_run = 0

    for i in range(0, n_remaining, batch_size):
        chunk = items_to_process[i : i + batch_size]
        chunk_paths = [c["path"] for c in chunk]
        chunk_names = [c["name"] for c in chunk]
        chunk_labels = [c["label"] for c in chunk]
        chunk_actors = [c["speaker_id"] for c in chunk]

        # Load audio waveforms in parallel
        try:
            with ThreadPoolExecutor(max_workers=4) as pool:
                wavs = list(pool.map(load_audio_clip, chunk_paths))
        except Exception as e:
            print(f"Error loading audio batch starting at {i}: {e}")
            for item in chunk:
                failures.append({"name": item["name"], "error": str(e)})
            continue

        # Extract embeddings
        try:
            res = model.generate(wavs, granularity="utterance", extract_embedding=True)
            batch_embs = []
            for r in res:
                emb = np.array(r["feats"], dtype=np.float32).squeeze()
                batch_embs.append(emb)
            batch_embs = np.array(batch_embs, dtype=np.float32)

            # Validate batch
            assert batch_embs.shape == (len(chunk), 768), f"Bad shape: {batch_embs.shape}"
            assert np.all(np.isfinite(batch_embs)), "Non-finite values detected in batch!"

            # Save batch partial
            batch_idx = (len(completed) + extracted_this_run) // batch_size
            partial_path = PARTIALS_DIR / f"batch_{split_name}_{batch_idx:05d}.npz"
            np.savez_compressed(
                partial_path,
                filenames=np.array(chunk_names),
                embeddings=batch_embs,
                labels=np.array(chunk_labels),
                speaker_ids=np.array(chunk_actors),
            )

            for n, e, l, a in zip(chunk_names, batch_embs, chunk_labels, chunk_actors):
                completed[n] = (e, l, a)

            extracted_this_run += len(chunk)

            if (i // batch_size + 1) % 10 == 0 or (i + batch_size >= n_remaining):
                elapsed = time.time() - t_start
                rate = extracted_this_run / elapsed if elapsed > 0 else 0
                ram = psutil.Process().memory_info().rss / (1024 * 1024)
                print(
                    f"[{split_name.upper()}] Progress: {len(completed)}/{len(items)} "
                    f"({extracted_this_run} this run, {rate:.1f} clips/s, RAM: {ram:.1f} MB)"
                )
        except Exception as e:
            print(f"Error extracting batch starting at {i}: {e}")
            for item in chunk:
                failures.append({"name": item["name"], "error": str(e)})

    # Consolidate in the canonical order of items
    print(f"[{split_name.upper()}] Assembling final consolidated cache...")
    final_embs = []
    final_names = []
    final_labels = []
    final_actors = []

    for item in items:
        n = item["name"]
        if n in completed:
            e, l, a = completed[n]
            final_embs.append(e)
            final_names.append(n)
            final_labels.append(l)
            final_actors.append(a)
        else:
            failures.append({"name": n, "error": "Not present in completed extractions"})

    final_embs = np.array(final_embs, dtype=np.float32)
    final_names = np.array(final_names)
    final_labels = np.array(final_labels)
    final_actors = np.array(final_actors)

    return final_embs, final_names, final_labels, final_actors, failures


def validate_cache(split_name: str, embs, names, labels, actors, expected_count: int, expected_speakers: set):
    """Validate cache integrity, shapes, finite checks, speaker sets, and class distributions."""
    report = {}
    report["count"] = len(embs)
    report["expected_count"] = expected_count
    report["count_valid"] = len(embs) == expected_count

    report["shape"] = list(embs.shape)
    report["shape_valid"] = embs.shape == (expected_count, 768)

    report["all_finite"] = bool(np.all(np.isfinite(embs)))
    report["no_nan"] = bool(not np.any(np.isnan(embs)))
    report["no_inf"] = bool(not np.any(np.isinf(embs)))

    unique_speakers = set(actors)
    report["num_speakers"] = len(unique_speakers)
    report["expected_num_speakers"] = len(expected_speakers)
    report["speaker_set_matches"] = unique_speakers == expected_speakers

    # Class distribution
    unique_labels, counts = np.unique(labels, return_counts=True)
    report["class_distribution"] = {str(l): int(c) for l, c in zip(unique_labels, counts)}

    # Embedding statistics
    norms = np.linalg.norm(embs, axis=1)
    report["embedding_norm_mean"] = float(np.mean(norms))
    report["embedding_norm_std"] = float(np.std(norms))
    report["embedding_min"] = float(np.min(embs))
    report["embedding_max"] = float(np.max(embs))

    valid = (
        report["count_valid"]
        and report["shape_valid"]
        and report["all_finite"]
        and report["no_nan"]
        and report["no_inf"]
        and report["speaker_set_matches"]
    )
    report["valid"] = valid
    return report


def main():
    parser = argparse.ArgumentParser(description="Extract CREMA-D embeddings using emotion2vec+")
    parser.add_argument("--batch-size", type=int, default=32, help="Extraction batch size (default: 32)")
    args = parser.parse_args()

    t_overall_start = time.time()
    initial_ram = psutil.Process().memory_info().rss / (1024 * 1024)

    print("=" * 80)
    print("PHASE 3: CREMA-D EMBEDDING EXTRACTION FOR EMOTION2VEC+")
    print("=" * 80)
    print(f"Initial RAM: {initial_ram:.1f} MB")

    # Step 1: Verify CREMA-D items and splits
    dev_items, test_items, dev_speakers, test_speakers = get_dataset_items()
    print(f"Dataset verified: 7,441 total clips")
    print(f"  Development: {len(dev_items)} clips from {len(dev_speakers)} speakers")
    print(f"  Held-out Test: {len(test_items)} clips from {len(test_speakers)} speakers")

    # Verify all audio files exist and are readable
    for it in dev_items + test_items:
        p = Path(it["path"])
        if not p.is_file():
            raise FileNotFoundError(f"Missing audio file on disk: {p}")
    print("All 7,441 audio files verified present on disk.")

    # Check if final caches already exist and are valid
    dev_done = False
    test_done = False

    if DEV_EMB_PATH.exists():
        try:
            d = np.load(DEV_EMB_PATH, allow_pickle=True)
            v = validate_cache("development", d["embeddings"], d["filenames"], d["labels"], d["speaker_ids"], 6294, dev_speakers)
            if v["valid"]:
                print("Existing dev_embeddings.npz is complete and fully valid!")
                dev_done = True
        except Exception:
            pass

    if TEST_EMB_PATH.exists():
        try:
            t = np.load(TEST_EMB_PATH, allow_pickle=True)
            v = validate_cache("test", t["embeddings"], t["filenames"], t["labels"], t["speaker_ids"], 1147, test_speakers)
            if v["valid"]:
                print("Existing test_embeddings.npz is complete and fully valid!")
                test_done = True
        except Exception:
            pass

    if dev_done and test_done:
        print("\nBoth dev and test caches are already extracted and verified valid.")
        model = None
    else:
        print("\nLoading official emotion2vec/emotion2vec_plus_base model...")
        t_model = time.time()
        model = AutoModel(model="emotion2vec/emotion2vec_plus_base", hub="hf", disable_update=True)
        print(f"Model loaded in {time.time() - t_model:.2f}s.")

    # Extract Development split
    if not dev_done:
        dev_embs, dev_names, dev_labels, dev_actors, dev_failures = extract_split(
            "development", dev_items, model, batch_size=args.batch_size
        )
        if dev_failures:
            print(f"ERROR: {len(dev_failures)} failures in development extraction!")
            sys.exit(1)

        # Save to dev_embeddings.npz atomically
        tmp_dev_path = DEV_EMB_PATH.with_suffix(".tmp.npz")
        np.savez_compressed(
            tmp_dev_path,
            embeddings=dev_embs,
            filenames=dev_names,
            labels=dev_labels,
            speaker_ids=dev_actors,
        )
        tmp_dev_path.replace(DEV_EMB_PATH)
        print(f"Saved: {DEV_EMB_PATH}")
    else:
        d = np.load(DEV_EMB_PATH, allow_pickle=True)
        dev_embs, dev_names, dev_labels, dev_actors = d["embeddings"], d["filenames"], d["labels"], d["speaker_ids"]
        dev_failures = []

    # Extract Test split
    if not test_done:
        test_embs, test_names, test_labels, test_actors, test_failures = extract_split(
            "test", test_items, model, batch_size=args.batch_size
        )
        if test_failures:
            print(f"ERROR: {len(test_failures)} failures in test extraction!")
            sys.exit(1)

        # Save to test_embeddings.npz atomically
        tmp_test_path = TEST_EMB_PATH.with_suffix(".tmp.npz")
        np.savez_compressed(
            tmp_test_path,
            embeddings=test_embs,
            filenames=test_names,
            labels=test_labels,
            speaker_ids=test_actors,
        )
        tmp_test_path.replace(TEST_EMB_PATH)
        print(f"Saved: {TEST_EMB_PATH}")
    else:
        t = np.load(TEST_EMB_PATH, allow_pickle=True)
        test_embs, test_names, test_labels, test_actors = t["embeddings"], t["filenames"], t["labels"], t["speaker_ids"]
        test_failures = []

    # Final Validation
    print("\nRunning comprehensive validation checks...")
    dev_val = validate_cache("development", dev_embs, dev_names, dev_labels, dev_actors, 6294, dev_speakers)
    test_val = validate_cache("test", test_embs, test_names, test_labels, test_actors, 1147, test_speakers)

    # Check cross-split speaker leakage
    dev_spk_set = set(dev_actors)
    test_spk_set = set(test_actors)
    overlap = dev_spk_set & test_spk_set
    leakage_detected = len(overlap) > 0

    elapsed_total = time.time() - t_overall_start
    dev_size_mb = DEV_EMB_PATH.stat().st_size / (1024 * 1024)
    test_size_mb = TEST_EMB_PATH.stat().st_size / (1024 * 1024)
    dev_sha256 = sha256_file(DEV_EMB_PATH)
    test_sha256 = sha256_file(TEST_EMB_PATH)

    summary = {
        "status": "PASS" if (dev_val["valid"] and test_val["valid"] and not leakage_detected) else "FAIL",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "elapsed_seconds": round(elapsed_total, 2),
        "total_clips_extracted": len(dev_embs) + len(test_embs),
        "total_failures": len(dev_failures) + len(test_failures),
        "speaker_leakage_detected": leakage_detected,
        "speaker_leakage_overlap": list(overlap),
        "development_split": {
            "path": str(DEV_EMB_PATH),
            "size_mb": round(dev_size_mb, 2),
            "sha256": dev_sha256,
            "validation": dev_val,
        },
        "test_split": {
            "path": str(TEST_EMB_PATH),
            "size_mb": round(test_size_mb, 2),
            "sha256": test_sha256,
            "validation": test_val,
        },
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n" + "=" * 80)
    print("EXTRACTION SUMMARY")
    print("=" * 80)
    print(f"Overall Status: {summary['status']}")
    print(f"Total Clips: {summary['total_clips_extracted']} (Dev: {dev_val['count']}, Test: {test_val['count']})")
    print(f"Total Failures: {summary['total_failures']}")
    print(f"Speaker Leakage: {'NONE (Disjoint)' if not leakage_detected else 'DETECTED!'}")
    print(f"Dev Cache: {DEV_EMB_PATH.name} ({dev_size_mb:.2f} MB, SHA256: {dev_sha256[:16]}...)")
    print(f"Test Cache: {TEST_EMB_PATH.name} ({test_size_mb:.2f} MB, SHA256: {test_sha256[:16]}...)")
    print(f"Total Elapsed Time: {elapsed_total:.1f}s ({elapsed_total/60:.2f} min)")
    print(f"Summary JSON: {SUMMARY_PATH}")


if __name__ == "__main__":
    main()

