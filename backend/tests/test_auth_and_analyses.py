"""Automated tests for Authentication, Authorization, User Isolation, Saved Analyses,
Transcription integration, Cross-modal Consistency, and Audio Validation.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import db, consistency, transcription
import numpy as np

client = TestClient(app)


@pytest.fixture(autouse=True)
def init_test_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_ser.db"
    monkeypatch.setattr(db, "DB_PATH", test_db)
    # Clear thread local
    if hasattr(db._local, "conn"):
        db._local.conn = None
    db.init_db()
    yield
    if hasattr(db._local, "conn") and db._local.conn:
        db._local.conn.close()
        db._local.conn = None


def test_user_registration_and_validation():
    # 1. Invalid email syntax
    res = client.post("/api/auth/register", json={
        "email": "notanemail",
        "full_name": "Test User",
        "password": "Password123!"
    })
    assert res.status_code == 400
    assert "valid email" in res.json()["detail"]["message"].lower()

    # 2. Weak password (< 8 chars)
    res = client.post("/api/auth/register", json={
        "email": "user@gmail.com",
        "full_name": "Test User",
        "password": "short"
    })
    assert res.status_code == 400
    assert "at least 8 characters" in res.json()["detail"]["message"].lower()

    # 3. Successful registration with valid Gmail address
    res = client.post("/api/auth/register", json={
        "email": "scientist@gmail.com",
        "full_name": "Dr. Eleanor Vance",
        "password": "SecurePassword123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["user"]["email"] == "scientist@gmail.com"
    assert data["user"]["full_name"] == "Dr. Eleanor Vance"

    # 4. Duplicate account registration rejection
    res2 = client.post("/api/auth/register", json={
        "email": "scientist@gmail.com",
        "full_name": "Another Person",
        "password": "SecurePassword123!"
    })
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]["message"].lower()


def test_login_and_session_lifecycle():
    # Register first
    client.post("/api/auth/register", json={
        "email": "tester@domain.edu",
        "full_name": "Alice Tester",
        "password": "SuperSecretPassword1"
    })

    # Bad password
    res_bad = client.post("/api/auth/login", json={
        "email": "tester@domain.edu",
        "password": "WrongPassword"
    })
    assert res_bad.status_code == 401

    # Correct password
    res_ok = client.post("/api/auth/login", json={
        "email": "tester@domain.edu",
        "password": "SuperSecretPassword1"
    })
    assert res_ok.status_code == 200
    token = res_ok.json()["token"]

    # Verify session with /api/auth/me
    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.json()["user"]["email"] == "tester@domain.edu"

    # Unauthorized request without token
    res_no_auth = client.get("/api/auth/me")
    assert res_no_auth.status_code == 401

    # Logout
    res_logout = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert res_logout.status_code == 200

    # Session invalidated after logout
    res_expired = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_expired.status_code == 401


def test_user_data_isolation_and_analyses_crud():
    # Register User A
    reg_a = client.post("/api/auth/register", json={
        "email": "usera@example.org",
        "full_name": "User Alpha",
        "password": "AlphaPassword123"
    }).json()
    token_a = reg_a["token"]

    # Register User B
    reg_b = client.post("/api/auth/register", json={
        "email": "userb@example.org",
        "full_name": "User Beta",
        "password": "BetaPassword123"
    }).json()
    token_b = reg_b["token"]

    # User A saves an analysis
    analysis_payload = {
        "original_filename": "speech_clip_alpha.wav",
        "predicted_emotion": "happy",
        "confidence": 0.88,
        "margin": 0.42,
        "scores": {"happy": 0.88, "neutral": 0.05, "sad": 0.02, "angry": 0.02, "fear": 0.02, "disgust": 0.01},
        "analyzed_seconds": 3.2,
        "is_uncertain": False,
        "transcript": "Today was a wonderful and productive day.",
        "consistency_status": "consistent",
        "consistency_explanation": "Voice and wording appear broadly consistent.",
        "model_name": "SVM (RBF kernel, C=3)",
        "model_id": "svm_crema_d"
    }

    res_save = client.post("/api/analyses/save", json=analysis_payload, headers={"Authorization": f"Bearer {token_a}"})
    assert res_save.status_code == 200
    analysis_id = res_save.json()["analysis"]["id"]

    # User A can list and view their analysis
    res_list_a = client.get("/api/analyses", headers={"Authorization": f"Bearer {token_a}"})
    assert res_list_a.status_code == 200
    assert len(res_list_a.json()["analyses"]) == 1
    assert res_list_a.json()["analyses"][0]["id"] == analysis_id

    # User B CANNOT see User A's analysis (Strict Isolation)
    res_list_b = client.get("/api/analyses", headers={"Authorization": f"Bearer {token_b}"})
    assert res_list_b.status_code == 200
    assert len(res_list_b.json()["analyses"]) == 0

    # User B CANNOT fetch User A's analysis by ID
    res_get_b = client.get(f"/api/analyses/{analysis_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res_get_b.status_code == 404

    # User B CANNOT delete User A's analysis
    res_del_b = client.delete(f"/api/analyses/{analysis_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res_del_b.status_code == 404

    # User A CAN delete their own analysis
    res_del_a = client.delete(f"/api/analyses/{analysis_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert res_del_a.status_code == 200

    # Verify deleted
    res_list_after = client.get("/api/analyses", headers={"Authorization": f"Bearer {token_a}"})
    assert len(res_list_after.json()["analyses"]) == 0


def test_cross_modal_consistency_logic():
    # 1. Consistent: Happy tone + Joyful phrasing
    res1 = consistency.analyze_cross_modal_consistency(
        transcript="We had a wonderful, brilliant celebration today!",
        predicted_emotion="happy",
        confidence=0.85,
        is_uncertain=False
    )
    assert res1["status"] == "consistent"
    assert res1["display_label"] in {"Broadly Consistent", "Voice and wording appear broadly consistent."}

    # 2. Divergent: Angry tone + Positive words
    res2 = consistency.analyze_cross_modal_consistency(
        transcript="I am so delighted and pleased with this great result.",
        predicted_emotion="angry",
        confidence=0.89,
        is_uncertain=False
    )
    assert res2["status"] == "divergent"
    assert res2["display_label"] in {"Mismatch Detected", "Voice and wording may differ."}
    assert "deception" not in res2["explanation"].lower() or "not proof of deception" in res2["explanation"].lower()

    # 3. Inconclusive: Empty transcript or uncertain prediction
    res3 = consistency.analyze_cross_modal_consistency(
        transcript="",
        predicted_emotion="neutral",
        confidence=0.30,
        is_uncertain=True
    )
    assert res3["status"] == "inconclusive"
    assert res3["display_label"] in {"Insufficient Evidence", "Insufficient evidence to compare."}


def test_transcription_status_endpoint():
    res = client.get("/api/transcription/status")
    assert res.status_code == 200
    data = res.json()
    assert "available" in data
    assert data["runs_locally"] is True
