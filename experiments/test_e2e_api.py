"""End-to-end HTTP integration tests against running backend server."""
import requests
import json

BASE_URL = "http://localhost:8000"

print("--- 1. Testing Normal In-Distribution Audio ---")
with open("data/AudioWAV/1001_DFA_ANG_XX.wav", "rb") as f:
    r = requests.post(f"{BASE_URL}/api/predict", files={"file": ("1001_DFA_ANG_XX.wav", f, "audio/wav")})
assert r.status_code == 200, f"Predict failed: {r.status_code} {r.text}"
res_id = r.json()
print("Prediction:", res_id["emotion"])
print("Confidence:", res_id["confidence"])
print("Uncertain:", res_id["uncertain"])
print("OOD:", res_id["out_of_distribution"])
print("OOD Details:", res_id["ood_details"])
print("Scores:", res_id["scores"])
assert res_id["out_of_distribution"] is False, "Normal audio should not be OOD!"
assert res_id["emotion"] == "angry", f"Expected angry, got {res_id['emotion']}"

print("\n--- 2. Testing Out-of-Distribution Audio (Neutral1.wav) ---")
with open("external_datasets/audio_for_friend/sample_audio/Neutral1.wav", "rb") as f:
    r = requests.post(f"{BASE_URL}/api/predict", files={"file": ("Neutral1.wav", f, "audio/wav")})
assert r.status_code == 200, f"Predict failed: {r.status_code} {r.text}"
res_ood = r.json()
print("Prediction:", res_ood["emotion"])
print("Confidence:", res_ood["confidence"])
print("Uncertain:", res_ood["uncertain"])
print("OOD:", res_ood["out_of_distribution"])
print("OOD Details:", res_ood["ood_details"])
print("Notes:", res_ood["notes"])
assert res_ood["out_of_distribution"] is True, "Neutral1 should be flagged as OOD!"
assert res_ood["uncertain"] is True, "OOD audio should be marked uncertain!"
assert any("deviate from the model's training distribution" in n for n in res_ood["notes"])

print("\n--- 3. Testing Error Handling (Corrupted File) ---")
r_bad = requests.post(f"{BASE_URL}/api/predict", files={"file": ("bad.wav", b"not a wav file", "audio/wav")})
print("Bad audio status:", r_bad.status_code)
print("Bad audio response:", r_bad.json())
assert r_bad.status_code == 422, "Expected 422 for undecodable file"

print("\n--- 4. Testing Spectrogram and Timeline Endpoints ---")
with open("data/AudioWAV/1001_DFA_ANG_XX.wav", "rb") as f:
    audio_bytes = f.read()
r_spec = requests.post(f"{BASE_URL}/api/spectrogram", files={"file": ("test.wav", audio_bytes, "audio/wav")})
assert r_spec.status_code == 200
print("Spectrogram status:", r_spec.status_code, "frames:", r_spec.json().get("frames"))

r_time = requests.post(f"{BASE_URL}/api/timeline", files={"file": ("test.wav", audio_bytes, "audio/wav")}, data={"window_s": 2.0, "hop_s": 1.0})
assert r_time.status_code == 200
print("Timeline status:", r_time.status_code, "segments:", len(r_time.json().get("segments", [])))

print("\n--- 5. Testing Database / History Integration ---")
# Register test user
user_payload = {"email": "test_e2e@example.com", "full_name": "E2E Tester", "password": "SecurePassword123!"}
r_reg = requests.post(f"{BASE_URL}/api/auth/register", json=user_payload)
if r_reg.status_code == 200:
    token = r_reg.json()["token"]
else:
    r_login = requests.post(f"{BASE_URL}/api/auth/login", json={"email": user_payload["email"], "password": user_payload["password"]})
    token = r_login.json()["token"]

headers = {"Authorization": f"Bearer {token}"}
r_save = requests.post(f"{BASE_URL}/api/analyses/save", headers=headers, json={
    "original_filename": "1001_DFA_ANG_XX.wav",
    "predicted_emotion": res_id["emotion"],
    "confidence": res_id["confidence"],
    "margin": res_id["margin"],
    "is_uncertain": res_id["uncertain"],
    "analyzed_seconds": res_id["analyzed_seconds"],
    "scores": res_id["scores"],
    "transcript": "It's eleven o'clock",
})
assert r_save.status_code == 200, f"Save analysis failed: {r_save.text}"
print("Saved analysis ID:", r_save.json()["analysis"]["id"])

r_history = requests.get(f"{BASE_URL}/api/analyses", headers=headers)
assert r_history.status_code == 200
print("Fetched history analyses count:", len(r_history.json()["analyses"]))

print("\nALL HTTP END-TO-END TESTS PASSED SUCCESSFULLY!")
