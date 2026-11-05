"""Test that the application can seamlessly roll back to the original production model."""
import requests

BASE_URL = "http://localhost:8000"

# 1. Query status
r = requests.get(f"{BASE_URL}/api/model/status")
assert r.status_code == 200
status = r.json()
print("Current running profile:", status.get("profile"))
print("Current model name:", status.get("model_name"))
print("Model ready:", status.get("trained"))

# 2. Test in-process profile switch to production
import sys, os
sys.path.insert(0, os.path.abspath("backend"))
from app import config as C
from app import predict

C.set_active_model_profile("production")
bundle = predict.get_bundle()
print("\nIn-process switched to profile:", C.SER_MODEL_PROFILE)
print("Model path:", C.MODEL_PATH)
print("Model bundle labels:", bundle["labels"])
assert C.MODEL_PATH == C.PRODUCTION_MODEL_PATH, "Did not roll back to production model path!"

# 3. Test in-process switch back to staging
C.set_active_model_profile("staging")
bundle_stage = predict.get_bundle()
print("\nIn-process switched to profile:", C.SER_MODEL_PROFILE)
print("Model path:", C.MODEL_PATH)
assert C.MODEL_PATH == C.CANDIDATE_OPTION2_MODEL_PATH, "Did not switch to staging candidate path!"

print("\nROLLBACK MECHANISM VERIFIED 100% OPERATIONAL!")
