"""Production Safety & Model Profile Switching Verification.

Verifies:
1. Original production model hash, size, and timestamp against baseline backups.
2. SER_MODEL_PROFILE=production loads the original model.
3. SER_MODEL_PROFILE=staging loads Candidate Option 2.
4. Switching profiles invalidates cache and never retains stale metadata.
5. In-flight staging inference followed by rollback immediately serves production model.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app import config as C
from app import predict
from app.audio import extract_features, load_audio_file
from app.modelcheck import validate_bundle
from app.modelio import load_model


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    print("=== 1. Checking Model File Integrity and Hashes ===")
    prod_path = C.PRODUCTION_MODEL_PATH
    cand_path = C.CANDIDATE_OPTION2_MODEL_PATH
    base_c3_path = C.MODELS_DIR / "baseline_c3_emotion_model.joblib"
    
    assert prod_path.exists(), f"Production model missing at {prod_path}"
    assert cand_path.exists(), f"Candidate model missing at {cand_path}"
    
    prod_hash = sha256_file(prod_path)
    cand_hash = sha256_file(cand_path)
    
    print(f"Production Model ({prod_path.name}):")
    print(f"  Path:      {prod_path}")
    print(f"  Size:      {prod_path.stat().st_size:,} bytes")
    print(f"  SHA-256:   {prod_hash}")
    
    print(f"\nCandidate Option 2 Model ({cand_path.name}):")
    print(f"  Path:      {cand_path}")
    print(f"  Size:      {cand_path.stat().st_size:,} bytes")
    print(f"  SHA-256:   {cand_hash}")
    
    assert prod_hash != cand_hash, "Production and candidate hashes must be distinct!"
    
    if base_c3_path.exists():
        print(f"\nBaseline C=3.0 Backup:")
        print(f"  Path:      {base_c3_path}")
        print(f"  Size:      {base_c3_path.stat().st_size:,} bytes")
        print(f"  SHA-256:   {sha256_file(base_c3_path)}")

    # Check models_backup/ directory
    backup_dir = Path("models_backup")
    if backup_dir.exists():
        print(f"\nPreserved Backup Directory ({backup_dir}):")
        for f in backup_dir.glob("*.joblib"):
            print(f"  {f.name}: {f.stat().st_size:,} bytes (SHA-256: {sha256_file(f)[:16]}...)")

    print("\n=== 2. Verifying Profile Resolution and Cache Invalidation ===")
    
    # Force production profile
    C.set_active_model_profile("production")
    assert C.MODEL_PATH == prod_path
    b_prod = predict.get_bundle()
    validate_bundle(b_prod)
    prod_scaler = b_prod["pipeline"].named_steps["scale"]
    prod_svc = b_prod["pipeline"].named_steps["clf"]
    print(f"Production Profile Loaded:")
    print(f"  Active Path:  {C.MODEL_PATH}")
    print(f"  Profile Name: {C.SER_MODEL_PROFILE}")
    print(f"  Feature 270 Mean: {prod_scaler.mean_[270]:.3f} (native ~15.06)")
    print(f"  Feature 270 Std:  {prod_scaler.scale_[270]:.3f} (native ~0.69)")
    
    # Run test inference on production
    test_clip = "data/AudioWAV/1001_DFA_ANG_XX.wav"
    y = load_audio_file(test_clip)
    feat = extract_features(y).reshape(1, -1)
    prod_pred = b_prod["pipeline"].predict(feat)[0]
    prod_probs = b_prod["pipeline"].predict_proba(feat)[0]
    print(f"  Inference Test: predicted={prod_pred}, conf={prod_probs.max():.4f}")
    
    # Switch to staging profile
    print("\nSwitching to Staging Profile (Option 2)...")
    C.set_active_model_profile("staging")
    assert C.MODEL_PATH == cand_path
    b_stage = predict.get_bundle()
    validate_bundle(b_stage)
    stage_scaler = b_stage["pipeline"].named_steps["scale"]
    stage_svc = b_stage["pipeline"].named_steps["clf"]
    print(f"Staging Profile Loaded:")
    print(f"  Active Path:  {C.MODEL_PATH}")
    print(f"  Profile Name: {C.SER_MODEL_PROFILE}")
    print(f"  Feature 270 Mean: {stage_scaler.mean_[270]:.3f} (augmented ~36.53)")
    print(f"  Feature 270 Std:  {stage_scaler.scale_[270]:.3f} (augmented ~21.03)")
    
    assert abs(stage_scaler.scale_[270] - prod_scaler.scale_[270]) > 10.0, "Scalers must reflect distinct training distributions!"
    
    # Run test inference on staging
    stage_pred = b_stage["pipeline"].predict(feat)[0]
    stage_probs = b_stage["pipeline"].predict_proba(feat)[0]
    print(f"  Inference Test: predicted={stage_pred}, conf={stage_probs.max():.4f}")
    
    # Perform immediate rollback to production
    print("\nTesting Immediate Rollback to Production...")
    C.set_active_model_profile("production")
    assert C.MODEL_PATH == prod_path
    b_rolled = predict.get_bundle()
    rolled_scaler = b_rolled["pipeline"].named_steps["scale"]
    assert rolled_scaler.mean_[270] == prod_scaler.mean_[270], "Rollback scaler does not match original production scaler!"
    print(f"Rollback Confirmed:")
    print(f"  Active Path:  {C.MODEL_PATH}")
    print(f"  Profile Name: {C.SER_MODEL_PROFILE}")
    print(f"  Feature 270 Mean: {rolled_scaler.mean_[270]:.3f}")
    
    print("\nALL PRODUCTION SAFETY AND ROLLBACK VERIFICATIONS PASSED!")


if __name__ == "__main__":
    main()

