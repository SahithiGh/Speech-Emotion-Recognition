import io
import time
import pytest
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app
from app import db
from app.conversation_analysis import process_full_conversation_analysis
from app.export import generate_pdf_report, generate_csv_export

client = TestClient(app)


def make_wav(duration: float = 3.0, freq: float = 220.0, sr: int = 16000) -> bytes:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV")
    return buf.getvalue()


def test_conversation_analysis_processing_direct():
    sr = 16000
    # Two distinct synthetic speakers (200 Hz and 400 Hz) with a gap
    t1 = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    y1 = (0.35 * np.sin(2 * np.pi * 200 * t1)).astype(np.float32)

    gap = np.zeros(int(sr * 0.5), dtype=np.float32)

    t2 = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    y2 = (0.35 * np.sin(2 * np.pi * 400 * t2)).astype(np.float32)

    combined = np.concatenate([y1, gap, y2])
    res = process_full_conversation_analysis(combined, sr=sr)

    assert "speakers" in res
    assert len(res["speakers"]) >= 1
    assert "conversation_timeline" in res
    assert "emotion_tracks" in res
    assert "emotion_journey" in res
    assert "voice_analysis" in res

    # Voice analysis properties
    va = res["voice_analysis"]
    assert "pitch" in va
    assert "energy" in va
    assert "speaker_metrics" in va
    assert "disclaimer" in va

    # PDF & CSV generation from direct analysis dict
    pdf_bytes = generate_pdf_report(res)
    assert pdf_bytes.startswith(b"%PDF")

    csv_bytes = generate_csv_export(res)
    assert csv_bytes.startswith(b"PK")


def test_api_analyze_conversation_and_job_progress():
    wav_data = make_wav(duration=2.5, freq=250.0)
    res = client.post(
        "/api/analyze/conversation",
        files={"file": ("test_conv.wav", wav_data, "audio/wav")},
    )
    assert res.status_code == 200
    job_id = res.json()["job_id"]
    assert job_id

    # Poll until done
    done = False
    for _ in range(30):
        time.sleep(0.5)
        p_res = client.get(f"/api/jobs/{job_id}/progress")
        assert p_res.status_code == 200
        prog = p_res.json()
        assert "stage" in prog
        assert "progress_pct" in prog
        if prog["done"]:
            done = True
            result = prog["result"]
            assert result is not None
            assert "speakers" in result
            assert "conversation_timeline" in result
            assert "emotion_tracks" in result
            assert "emotion_journey" in result
            assert "voice_analysis" in result
            break

    assert done, "Job should finish within timeout"


def test_speaker_rename_and_exports_flow():
    # 1. Register a test user
    email = f"test_conv_{int(time.time())}@example.com"
    reg = client.post(
        "/api/auth/register",
        json={"email": email, "full_name": "Speaker Test User", "password": "Password123!"},
    )
    assert reg.status_code == 200
    token = reg.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Save an analysis with speakers
    save_payload = {
        "original_filename": "meeting.wav",
        "predicted_emotion": "happy",
        "confidence": 0.88,
        "margin": 0.45,
        "scores": {"happy": 0.88, "neutral": 0.08, "sad": 0.01, "angry": 0.01, "fear": 0.01, "disgust": 0.01},
        "analyzed_seconds": 5.0,
        "is_uncertain": False,
        "transcript": "Good morning everyone.",
        "speakers": [
            {
                "speaker_id": "spk_A",
                "name": "Speaker A",
                "speaking_seconds": 3.0,
                "speaking_percentage": 60.0,
                "dominant_emotion": "happy",
                "confidence": 0.88,
                "emotion_distribution": {"happy": 100.0},
            },
            {
                "speaker_id": "spk_B",
                "name": "Speaker B",
                "speaking_seconds": 2.0,
                "speaking_percentage": 40.0,
                "dominant_emotion": "neutral",
                "confidence": 0.75,
                "emotion_distribution": {"neutral": 100.0},
            },
        ],
        "conversation_timeline": [
            {"start": 0.0, "end": 3.0, "speaker_id": "spk_A", "speaker_name": "Speaker A", "emotion": "happy", "top_score": 0.88},
            {"start": 3.0, "end": 5.0, "speaker_id": "spk_B", "speaker_name": "Speaker B", "emotion": "neutral", "top_score": 0.75},
        ],
        "emotion_tracks": {
            "happy": [{"time": 0.0, "probability": 0.88}, {"time": 2.0, "probability": 0.85}],
            "neutral": [{"time": 0.0, "probability": 0.08}, {"time": 2.0, "probability": 0.10}],
        },
        "emotion_journey": [
            {"start": 0.0, "end": 3.0, "emotion": "happy", "confidence": 0.88},
            {"start": 3.0, "end": 5.0, "emotion": "neutral", "confidence": 0.75},
        ],
        "voice_analysis": {
            "overall_pitch": {"mean_hz": 210.5, "median_hz": 208.0, "min_hz": 180.0, "max_hz": 260.0},
            "overall_vocal_energy": {"mean_db": -22.4, "max_db": -12.1},
        },
    }

    saved_res = client.post("/api/analyses/save", json=save_payload, headers=headers)
    assert saved_res.status_code == 200
    analysis_id = saved_res.json()["analysis"]["id"]

    # 3. Rename speaker
    rename_res = client.post(
        f"/api/analyses/{analysis_id}/speakers/rename",
        json={"speaker_id": "spk_A", "name": "Dr. Sarah Adams"},
        headers=headers,
    )
    assert rename_res.status_code == 200
    updated_analysis = rename_res.json()["analysis"]
    spk_names = [s["name"] for s in updated_analysis["speakers"]]
    assert "Dr. Sarah Adams" in spk_names

    # Check timeline updated
    assert updated_analysis["conversation_timeline"][0]["speaker_name"] == "Dr. Sarah Adams"

    # 4. Test PDF export of saved analysis
    pdf_res = client.get(f"/api/analyses/{analysis_id}/export/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF")

    # 5. Test CSV export of saved analysis
    csv_res = client.get(f"/api/analyses/{analysis_id}/export/csv", headers=headers)
    assert csv_res.status_code == 200
    assert csv_res.content.startswith(b"PK")
