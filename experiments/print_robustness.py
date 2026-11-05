import json

with open("experiments/robustness_results.json", encoding="utf-8") as f:
    res = json.load(f)

conditions = list(res["baseline"].keys())
print("=== ROBUSTNESS TEST RESULTS ON 250 HELD-OUT CLIPS ===\n")
header = f"{'Condition':28s} | {'Base Acc':8s} | {'Opt2 Acc':8s} | {'Base Agr':8s} | {'Opt2 Agr':8s} | {'Base Fear%':10s} | {'Opt2 Fear%':10s}"
print(header)
print("-" * len(header))

for c in conditions:
    b = res["baseline"][c]
    o = res["option2"][c]
    b_acc = f"{b['accuracy']:.1%}"
    o_acc = f"{o['accuracy']:.1%}"
    b_agr = f"{b['agreement_with_native']:.1%}"
    o_agr = f"{o['agreement_with_native']:.1%}"
    b_fear = f"{b['fear_percentage']:.1%}"
    o_fear = f"{o['fear_percentage']:.1%}"
    print(f"{c:28s} | {b_acc:8s} | {o_acc:8s} | {b_agr:8s} | {o_agr:8s} | {b_fear:10s} | {o_fear:10s}")

print("\n--- Detailed Metric Breakdown (Option 2) ---")
for c in conditions:
    o = res["option2"][c]
    print(f"\nCondition: {c}")
    print(f"  Accuracy: {o['accuracy']:.4f} | Macro F1: {o['macro_f1']:.4f} | Balanced Acc (UAR): {o['uar']:.4f}")
    rec_str = ", ".join([f"{k}: {v:.2%}" for k, v in o["per_class_recall"].items()])
    print(f"  Per-class recall: {rec_str}")

