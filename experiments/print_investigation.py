import json

with open("experiments/external_investigation.json", encoding="utf-8") as f:
    data = json.load(f)

norm = data["crema_training_reference"]["pitch_norm"]
print("=== CREMA-D TRAINING REFERENCE (77 Development Speakers) ===")
print(f"Mean Pitch: {norm['mean_hz']} Hz | Pitch Std: {norm['std_hz']} Hz | Pitch Range: {norm['range_hz']} Hz | Speech Ratio: {norm['speech_ratio']}\n")

print("=== TARGET EXTERNAL FILES INVESTIGATION ===")
for item in data["target_file_investigations"]:
    fname = item["file"]
    ac = item["acoustics"]
    pr = item["prediction"]
    dist = item["distance_to_training_class_centroids"]
    print(f"\nFile: {fname} (Duration: {ac['duration_seconds']}s, RMS: {ac['rms_energy']:.4f})")
    print(f"  Pitch: mean={ac['pitch_mean_hz']} Hz, std={ac['pitch_std_hz']} Hz, range={ac['pitch_range_hz']} Hz")
    print(f"  Spectral: centroid={ac['spectral_centroid_hz']} Hz, rolloff={ac['spectral_rolloff_hz']} Hz, flatness={ac['spectral_flatness']:.4f}")
    print(f"  Predicted: {pr['predicted']} (conf: {pr['confidence']:.1%}) | {pr['probabilities']}")
    print(f"  Closest training class: {item['closest_training_class']} (Distances: {dist})")
    print("  Top Outlier Features (|z| > 3.0):")
    for o in item["top_outlier_features"][:6]:
        print(f"    col {o['col']:3d} [{o['group']}]: z = {o['z_score']:+6.2f} (val={o['raw_val']}, ref_mean={o['scaler_mean']}, ref_std={o['scaler_std']})")

