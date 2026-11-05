"""Train and evaluate the emotion classifier on CREMA-D.   Usage (from the backend folder):  python train.py

Protocol (speaker-independent):
  1. A fixed set of TEST speakers (about 15%) is set aside. It is never used for training or model selection.
  2. The remaining DEVELOPMENT speakers are used for speaker-grouped, stratified 5-fold cross-validation.
     In each fold the validation speakers are unseen by that fold's training data. The model with the best
     mean validation macro-F1 is selected.
  3. The selected model is refit on all development speakers and scored on the test speakers; its test result is never used to choose it.
     Other candidates may also be scored on the same test speakers for comparison (descriptive only).
"""
import argparse
import platform
import sys
import time
from collections import Counter
from datetime import datetime, timezone

import joblib
import librosa
import numpy as np
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, f1_score

from app import config as C
from app.audio import FEATURE_GROUPS, N_FEATURES, preprocessing_config
from app.candidates import candidate_models, make_pipeline
from app.dataset import dataset_fingerprint, holdout_test_speakers, scan_dataset, speaker_folds
from app.errors import DatasetError
from app.evaluation import compute_metrics, per_speaker_accuracy, speaker_bootstrap_ci
from app.features_table import build_feature_table
from app.modelio import save_model, save_split


def dist(y):
    c = Counter(y)
    return {e: int(c.get(e, 0)) for e in C.EMOTIONS}


def main():
    ap = argparse.ArgumentParser(description="Train the CREMA-D emotion classifier")
    ap.add_argument("--data-dir", default=str(C.DATA_DIR))
    ap.add_argument("--seed", type=int, default=C.RANDOM_SEED)
    ap.add_argument("--jobs", type=int, default=None, help="CPU cores for feature extraction (default: up to 4)")
    ap.add_argument("--folds", type=int, default=C.CV_FOLDS)
    ap.add_argument("--no-compare", action="store_true", help="skip the test-set comparison of all candidate models (saves a few minutes)")
    ap.add_argument("--no-cache", action="store_true", help="ignore cached features")
    ap.add_argument("--deep-verify", action="store_true", help="also check the SHA-256 of every file (reads ~600 MB)")
    ap.add_argument("--allow-partial", action="store_true", help="train even if some CREMA-D files are missing or damaged")
    ap.add_argument("--skip-manifest-check", action="store_true", help="SOFTWARE TESTING ONLY: do not check files against the official CREMA-D list")
    args = ap.parse_args()
    t0 = time.time()

    print("Step 1/5  Verifying the dataset")
    try:
        report = scan_dataset(args.data_dir, manifest=None if args.skip_manifest_check else "default", deep=args.deep_verify)
    except DatasetError as exc:
        print(f"\nERROR: {exc}")
        return 1
    print("  " + report.summary())
    if args.skip_manifest_check:
        print("  WARNING: files were NOT checked against the official CREMA-D list. Results are marked as unverified.")
    if report.problems() and not args.allow_partial:
        for label, items in (("Git LFS placeholders", report.lfs_pointers), ("wrong size", report.size_mismatch), ("wrong hash", report.hash_mismatch),
                             ("not WAV", report.not_wav), ("not in CREMA-D", report.unlisted), ("bad names", report.bad_names), ("missing", report.missing)):
            if items:
                print(f"  {label}: {len(items)} (e.g. {items[:3]})")
        print("\nERROR: the dataset is incomplete or damaged. Run download_dataset.bat again (it resumes and repairs files),\n"
              "or use --allow-partial to train on the valid files only (results will not be comparable with full CREMA-D).")
        return 1

    print("Step 2/5  Extracting audio features")
    X, clips, skipped = build_feature_table(report.clips, jobs=args.jobs, use_cache=not args.no_cache)
    if skipped:
        print(f"  Skipped {len(skipped)} unreadable clips (first 3): {skipped[:3]}")
    if len(clips) < 60 or X.shape[1] != N_FEATURES:
        print("\nERROR: too few usable clips or unexpected feature size.")
        return 1
    y = np.array([c.emotion for c in clips])
    actors = np.array([c.actor for c in clips])
    labels = sorted(set(y))
    if labels != C.EMOTIONS:
        print(f"\nERROR: expected the six emotions {C.EMOTIONS} but found {labels}.")
        return 1

    print("Step 3/5  Holding out test speakers")
    try:
        split = holdout_test_speakers(clips, seed=args.seed)
    except DatasetError as exc:
        print(f"\nERROR: {exc}")
        return 1
    test_mask = np.isin(actors, split["test"])
    dev_idx = np.where(~test_mask)[0]
    if set(split["test"]) & set(split["development"]) or set(actors[test_mask]) & set(actors[dev_idx]):
        raise RuntimeError("Speaker leakage detected between development and test sets")   # never silenced by python -O
    Xd, yd, gd = X[dev_idx], y[dev_idx], actors[dev_idx]
    Xte, yte, ste = X[test_mask], y[test_mask], actors[test_mask]
    print(f"  development: {len(split['development'])} speakers, {len(yd)} clips | test: {len(split['test'])} speakers, {len(yte)} clips")
    folds = speaker_folds(yd, gd, k=args.folds, seed=args.seed)

    print(f"Step 4/5  Choosing a model with {len(folds)}-fold speaker-grouped cross-validation (development speakers only)")
    table, best_name, best = [], None, -1.0
    for name in candidate_models(args.seed):
        f1s, accs = [], []
        for tr, va in folds:
            pipe = make_pipeline(name, args.seed).fit(Xd[tr], yd[tr])
            pred = pipe.predict(Xd[va])
            f1s.append(float(f1_score(yd[va], pred, average="macro", zero_division=0)))
            accs.append(float(accuracy_score(yd[va], pred)))
        row = {"model": name, "cv_macro_f1_mean": float(np.mean(f1s)), "cv_macro_f1_std": float(np.std(f1s)),
               "cv_accuracy_mean": float(np.mean(accs)), "fold_macro_f1": f1s}
        table.append(row)
        print(f"  {name:32s} macro F1 = {row['cv_macro_f1_mean']:.3f} +/- {row['cv_macro_f1_std']:.3f}")
        if row["cv_macro_f1_mean"] > best:
            best_name, best = name, row["cv_macro_f1_mean"]

    print(f"Step 5/5  Refitting '{best_name}' on all development speakers; scoring the test speakers once")
    final = make_pipeline(best_name, args.seed, probabilities=True).fit(Xd, yd)
    pred = final.predict(Xte)
    metrics = compute_metrics(yte, pred, labels)
    # Reliability by score range, from OUT-OF-FOLD validation predictions of the selected model (test speakers not involved)
    top_scores, correct = [], []
    imp_rng = np.random.default_rng(args.seed)
    importance = {g: [] for g in FEATURE_GROUPS}
    for tr, va in folds:
        fp = make_pipeline(best_name, args.seed, probabilities=True).fit(Xd[tr], yd[tr])
        pr = fp.predict_proba(Xd[va])
        top_scores.extend(pr.max(axis=1)); correct.extend(fp.classes_[pr.argmax(axis=1)] == yd[va])
        base_f1 = f1_score(yd[va], fp.classes_[pr.argmax(axis=1)], average="macro", zero_division=0)
        for g, (_, _, cols) in FEATURE_GROUPS.items():      # permutation importance of each group of sound properties, on validation speakers only
            drops = []
            for _ in range(3):
                Xp = Xd[va].copy(); Xp[:, cols] = Xp[imp_rng.permutation(len(va))][:, cols]
                drops.append(base_f1 - f1_score(yd[va], fp.predict(Xp), average="macro", zero_division=0))
            importance[g].append(float(np.mean(drops)))
    top_scores, correct = np.array(top_scores), np.array(correct)
    edges = C.RELIABILITY_EDGES
    bins = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = (top_scores >= lo) & (top_scores < hi)
        bins.append({"low": lo, "high": hi, "samples": int(sel.sum()), "accuracy": float(correct[sel].mean()) if sel.any() else None})
    feature_importance = {"method": "permutation importance by group of sound properties: how much validation macro F1 drops when that group is shuffled across clips (3 shuffles per fold, averaged over folds)",
                          "caveat": "A global summary of what this model relies on, measured on validation speakers. It does not explain an individual prediction and says nothing about a speaker's real emotional state. Groups can carry overlapping information, so drops do not add up.",
                          "groups": sorted([{"key": g, "label": FEATURE_GROUPS[g][0], "description": FEATURE_GROUPS[g][1], "n_features": len(FEATURE_GROUPS[g][2]),
                                             "importance_mean": float(np.mean(v)), "importance_std": float(np.std(v))} for g, v in importance.items()], key=lambda r: -r["importance_mean"])}
    reliability = {"bins": bins, "source": "out-of-fold validation predictions on development speakers",
                   "rule": f"A result is marked uncertain only if fewer than {C.UNCERTAIN_BELOW_ACCURACY:.0%} of validation predictions with a similar top score were correct "
                           f"and at least {C.MIN_BIN_SAMPLES} validation predictions fall in that range. This display convention is a documented choice, not a statistical guarantee."}
    comparison = None
    if not args.no_compare:
        print("          Comparing every candidate on the same held-out test speakers (descriptive only; selection was already made)")
        comparison = []
        for name in candidate_models(args.seed):
            t1 = time.time()
            cp = make_pipeline(name, args.seed).fit(Xd, yd)
            cm = compute_metrics(yte, cp.predict(Xte), labels)
            comparison.append({"model": name, "selected": name == best_name, "macro_f1": cm["macro_f1"], "uar": cm["macro_recall"], "accuracy": cm["accuracy"],
                               "macro_precision": cm["macro_precision"], "per_class_recall": {k: v["recall"] for k, v in cm["per_class"].items()},
                               "confusion_matrix": cm["confusion_matrix"], "training_seconds": round(time.time() - t1, 1),
                               "settings": {k: str(v) for k, v in cp.steps[-1][1].get_params().items() if k in ("C", "kernel", "gamma", "n_estimators", "max_iter", "learning_rate", "class_weight", "min_samples_leaf", "max_leaf_nodes", "random_state")}})
    base = DummyClassifier(strategy="prior").fit(Xd, yd).predict(Xte)
    metrics.update({
        "trained": True,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": "CREMA-D (acted speech)",
        "model_name": best_name,
        "selection": f"{len(folds)}-fold speaker-grouped stratified cross-validation on development speakers; best mean macro-F1",
        "evaluated_on": "test speakers never used for training or model selection",
        "feature_importance": feature_importance,
        "comparison": comparison,
        "comparison_note": "All candidates were fit on the development speakers and scored on the same test speakers for transparency. The model was chosen beforehand using validation only; these test scores were not used for selection.",
        "reliability": reliability,
        "preprocessing": preprocessing_config(),
        "unweighted_average_recall": metrics["macro_recall"],
        "candidates": table,
        "split": {"test": {"speakers": len(split["test"]), "clips": int(test_mask.sum())},
                  "development": {"speakers": len(split["development"]), "clips": int(len(dev_idx))},
                  "folds": [{"train_speakers": int(len(set(gd[tr]))), "validation_speakers": int(len(set(gd[va]))),
                             "validation_clips": int(len(va))} for tr, va in folds]},
        "class_distribution": {"all": dist(y), "development": dist(yd), "test": dist(yte)},
        "total_clips_used": int(len(clips)), "total_speakers": int(len(set(actors))), "skipped_clips": len(skipped),
        "confidence_intervals": speaker_bootstrap_ci(yte, pred, ste, C.BOOTSTRAP_ROUNDS, args.seed),
        "per_speaker_accuracy": per_speaker_accuracy(yte, pred, ste),
        "baselines": {"majority_class_accuracy": float(accuracy_score(yte, base)),
                      "majority_class_macro_f1": float(f1_score(yte, base, average="macro", zero_division=0)),
                      "uniform_chance_accuracy": 1 / len(labels)},
        "dataset_verification": {"mode": report.verification, "files_matching_official_list": len(report.clips),
                                 "complete": report.complete, "problems": report.problems()},
        "reproducibility": {"seed": args.seed, "dataset_fingerprint": dataset_fingerprint(clips), "feature_version": C.FEATURE_VERSION,
                            "n_features": int(X.shape[1]), "python": platform.python_version(), "sklearn": sklearn.__version__,
                            "librosa": librosa.__version__, "numpy": np.__version__, "joblib": joblib.__version__},
        "training_seconds": round(time.time() - t0, 1),
    })
    split_out = dict(split)
    split_out["folds_validation_speakers"] = [sorted(set(gd[va])) for _, va in folds]
    save_split(split_out)
    save_model(final, labels, preprocessing_config(), metrics)
    print("\n" + metrics["classification_report"])
    print(f"Test accuracy {metrics['accuracy']:.3f} | macro F1 {metrics['macro_f1']:.3f} | balanced accuracy {metrics['balanced_accuracy']:.3f}")
    ci = metrics["confidence_intervals"]
    if ci:
        print(f"95% interval (speaker bootstrap): accuracy {ci['accuracy_95ci'][0]:.3f}-{ci['accuracy_95ci'][1]:.3f}, macro F1 {ci['macro_f1_95ci'][0]:.3f}-{ci['macro_f1_95ci'][1]:.3f}")
    print(f"Saved model to {C.MODEL_PATH} ({metrics['model_size_mb']} MB)\nSaved metrics to {C.METRICS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
