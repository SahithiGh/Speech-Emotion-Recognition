import json
import sys
from pathlib import Path
from collections import Counter
import numpy as np

sys.path.insert(0, "backend")

from app import config as C
from app.predict import predict_bytes
from sklearn.metrics import classification_report, confusion_matrix

with open("outputs/speaker_split.json") as f:
    split_data = json.load(f)

test_speakers = set(split_data["test"])
print(f"Loaded {len(test_speakers)} held-out test speakers: {sorted(test_speakers)}")

all_files = sorted(C.DATA_DIR.glob("*.wav"))
test_clips = [f for f in all_files if f.name.split("_")[0] in test_speakers]
print(f"Total held-out test clips: {len(test_clips)}")

# Evaluate on a representative sample of 300 held-out clips across all 14 test speakers
np.random.seed(42)
sampled_clips = np.random.choice(test_clips, size=min(300, len(test_clips)), replace=False)

true_labels = []
pred_labels = []

print(f"\nRunning inference on {len(sampled_clips)} held-out test clips...")
for idx, clip_path in enumerate(sampled_clips):
    parts = clip_path.name.split("_")
    true_emo = C.CODE_TO_EMOTION.get(parts[2])
    with open(clip_path, "rb") as f:
        data = f.read()
    res = predict_bytes(data)
    pred_emo = res["emotion"]
    true_labels.append(true_emo)
    pred_labels.append(pred_emo)

print("\n=======================================================")
print("CHECK 7 RESULTS: HELD-OUT TEST EVALUATION")
print("=======================================================")

labels = C.EMOTIONS
cm = confusion_matrix(true_labels, pred_labels, labels=labels)

print("\nTrue Distribution:")
true_counts = Counter(true_labels)
for emo in labels:
    cnt = true_counts.get(emo, 0)
    print(f"  {emo:8s}: {cnt:3d} ({cnt/len(true_labels)*100:.1f}%)")

print("\nPredicted Distribution:")
pred_counts = Counter(pred_labels)
for emo in labels:
    cnt = pred_counts.get(emo, 0)
    print(f"  {emo:8s}: {cnt:3d} ({cnt/len(pred_labels)*100:.1f}%)")

print("\nConfusion Matrix (Rows = True, Columns = Predicted):")
header = "         " + " ".join(f"{e[:4]:>6s}" for e in labels)
print(header)
for i, true_emo in enumerate(labels):
    row_str = f"{true_emo:8s} " + " ".join(f"{cm[i, j]:6d}" for j in range(len(labels)))
    print(row_str)

print("\nClassification Report:")
print(classification_report(true_labels, pred_labels, labels=labels, digits=3))
