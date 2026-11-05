"""Turns predictions into the metrics shown on the website. Numbers always come from real predictions."""
import numpy as np
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix,
                             f1_score, precision_recall_fscore_support)


def compute_metrics(y_true, y_pred, labels) -> dict:
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    mp, mr, mf, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average="macro", zero_division=0)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_precision": float(mp),
        "macro_recall": float(mr),
        "unweighted_average_recall": float(mr),
        "macro_f1": float(mf),
        "per_class": {lab: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, lab in enumerate(labels)},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "labels": list(labels),
        "classification_report": classification_report(y_true, y_pred, labels=labels, zero_division=0),
        "n_samples": int(len(y_true)),
    }


def speaker_bootstrap_ci(y_true, y_pred, speakers, rounds: int, seed: int):
    """95% interval obtained by resampling whole test SPEAKERS (clips of one speaker are not independent)."""
    y_true, y_pred, speakers = np.asarray(y_true), np.asarray(y_pred), np.asarray(speakers)
    uniq = np.unique(speakers)
    if len(uniq) < 5:
        return None
    idx = {s: np.where(speakers == s)[0] for s in uniq}
    rng = np.random.default_rng(seed)
    acc, f1 = [], []
    for _ in range(rounds):
        pick = np.concatenate([idx[s] for s in rng.choice(uniq, size=len(uniq), replace=True)])
        acc.append(accuracy_score(y_true[pick], y_pred[pick]))
        f1.append(f1_score(y_true[pick], y_pred[pick], average="macro", zero_division=0))
    q = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]  # noqa: E731
    return {"accuracy_95ci": q(acc), "macro_f1_95ci": q(f1), "method": f"speaker bootstrap, {rounds} resamples"}


def per_speaker_accuracy(y_true, y_pred, speakers) -> dict:
    y_true, y_pred, speakers = np.asarray(y_true), np.asarray(y_pred), np.asarray(speakers)
    accs = [float(np.mean(y_true[speakers == s] == y_pred[speakers == s])) for s in np.unique(speakers)]
    return {"min": min(accs), "median": float(np.median(accs)), "max": max(accs), "speakers": len(accs)}
