import io
import os
import sys
import wave
import json
import requests
import numpy as np
import soundfile as sf
import av

sys.path.insert(0, os.path.abspath('backend'))
from app import audio, audio_quality, predict

API_URL = "http://127.0.0.1:8000/api/predict"

def make_clean_wav(duration_s=3.0, sr=16000, freq=280.0):
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    sig = 0.4 * (0.6 * np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t))
    # Syllabic envelope
    mod = np.clip(np.sin(2 * np.pi * 2.0 * t), 0, 1)
    sig = (sig * mod).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, sig, sr, format='WAV', subtype='PCM_16')
    return buf.getvalue()

def make_synthetic_video_mp4(audio_bytes: bytes, filename="test_video.mp4") -> bytes:
    """Pack mono audio into an MP4 container with a blank video track using PyAV."""
    y, sr = sf.read(io.BytesIO(audio_bytes), dtype='float32')
    out_buf = io.BytesIO()
    container = av.open(out_buf, mode='w', format='mp4')
    
    # Audio stream (AAC)
    audio_stream = container.add_stream('aac', rate=sr)
    # Video stream (h264, 1 frame/sec)
    video_stream = container.add_stream('libx264', rate=1)
    video_stream.width = 320
    video_stream.height = 240
    video_stream.pix_fmt = 'yuv420p'
    
    dur_frames = int(len(y) / sr)
    for i in range(max(1, dur_frames)):
        frame = av.VideoFrame(320, 240, 'rgb24')
        for plane in frame.planes:
            plane.update(b'\x20' * (plane.buffer_size))
        frame.pts = i
        for packet in video_stream.encode(frame):
            container.mux(packet)
    for packet in video_stream.encode(None):
        container.mux(packet)
        
    # Audio frames
    audio_frame = av.AudioFrame.from_ndarray(y.reshape(1, -1), format='fltp', layout='mono')
    audio_frame.sample_rate = sr
    audio_frame.pts = 0
    for packet in audio_stream.encode(audio_frame):
        container.mux(packet)
    for packet in audio_stream.encode(None):
        container.mux(packet)
        
    container.close()
    return out_buf.getvalue()

print("=" * 70)
print("COMPREHENSIVE AUTOMATIC NOISE REDUCTION PIPELINE VERIFICATION")
print("=" * 70)

results = {}

# TEST 1: Clean Speech
print("\n[TEST 1] Clean Speech Upload")
clean_wav = open("backend_reference/neutral_sample.wav", "rb").read()
resp = requests.post(API_URL, files={"file": ("neutral_sample.wav", clean_wav, "audio/wav")})
if resp.status_code != 200:
    print("  Resp error:", resp.status_code, resp.json())
assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
d1 = resp.json()
print("  Prediction Accepted:", d1.get("prediction_accepted"))
print("  Quality Status:", d1.get("audio_quality", {}).get("status"))
print("  Noise Reduction Applied:", d1.get("noise_reduction", {}).get("applied"))
print("  Predicted Emotion:", d1.get("emotion"), f"({d1.get('confidence'):.2%})")
assert d1.get("audio_quality", {}).get("status") == "GOOD"
assert d1.get("noise_reduction", {}).get("applied") is False
results["clean_speech"] = "PASSED"

# TEST 2: Moderately Noisy Speech (Noisy1.wav)
print("\n[TEST 2] Moderately Noisy Speech (Noisy1.wav)")
noisy1_bytes = open("backend_reference/Noisy1.wav", "rb").read()
resp = requests.post(API_URL, files={"file": ("Noisy1.wav", noisy1_bytes, "audio/wav")})
assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
d2 = resp.json()
nr2 = d2.get("noise_reduction", {})
print("  Prediction Accepted:", d2.get("prediction_accepted"))
print("  Initial Status:", d2.get("initial_audio_quality", {}).get("status"))
print("  Final Status:", d2.get("audio_quality", {}).get("status"))
print("  Noise Reduction Applied:", nr2.get("applied"))
print("  Floor Before:", nr2.get("noise_floor_before"), "-> Floor After:", nr2.get("noise_floor_after"))
print("  Floor Reduction:", f"{nr2.get('noise_floor_reduction_pct')}%")
print("  SNR Before:", nr2.get("snr_before"), "dB -> SNR After:", nr2.get("snr_after"), f"dB (+{nr2.get('snr_improvement_db')} dB)")
print("  Predicted Emotion:", d2.get("emotion"), f"({d2.get('confidence'):.2%})")
assert nr2.get("applied") is True
assert nr2.get("noise_floor_after") < nr2.get("noise_floor_before")
assert d2.get("emotion") is not None
results["moderate_noise"] = "PASSED"

# TEST 3: Heavily Noisy Speech (Noisy2.wav)
print("\n[TEST 3] Heavily Noisy Speech (Noisy2.wav)")
noisy2_bytes = open("backend_reference/Noisy2.wav", "rb").read()
resp = requests.post(API_URL, files={"file": ("Noisy2.wav", noisy2_bytes, "audio/wav")})
assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
d3 = resp.json()
nr3 = d3.get("noise_reduction", {})
print("  Prediction Accepted:", d3.get("prediction_accepted"))
print("  Initial Status:", d3.get("initial_audio_quality", {}).get("status"))
print("  Final Status:", d3.get("audio_quality", {}).get("status"))
print("  Noise Reduction Applied:", nr3.get("applied"))
print("  Floor Reduction:", f"{nr3.get('noise_floor_reduction_pct')}%")
print("  Predicted Emotion:", d3.get("emotion"), f"({d3.get('confidence'):.2%})")
assert nr3.get("applied") is True
assert nr3.get("noise_floor_reduction_pct", 0) > 50.0
results["heavy_noise"] = "PASSED"

# TEST 4: Pure Silence
print("\n[TEST 4] Pure Silence Upload")
silence_buf = io.BytesIO()
with wave.open(silence_buf, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes(np.zeros(32000, dtype=np.int16).tobytes())
silence_bytes = silence_buf.getvalue()
resp = requests.post(API_URL, files={"file": ("silence.wav", silence_bytes, "audio/wav")})
print("  Status Code:", resp.status_code)
print("  Error Detail:", resp.json())
assert resp.status_code in (400, 422), f"Expected 400 or 422 for silence, got {resp.status_code}"
results["silence"] = "PASSED"

# TEST 5: Corrupted Audio
print("\n[TEST 5] Corrupted Audio Bytes Upload")
corrupted_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00" + b"\xff" * 500
resp = requests.post(API_URL, files={"file": ("corrupt.wav", corrupted_bytes, "audio/wav")})
print("  Status Code:", resp.status_code)
print("  Error Detail:", resp.json())
assert resp.status_code in (400, 422), f"Expected 400 or 422 for corrupt audio, got {resp.status_code}"
results["corrupted"] = "PASSED"

# TEST 6: Video Upload with Audio Extraction
print("\n[TEST 6] Video Upload with Audio Extraction & Noise Reduction")
try:
    video_bytes = make_synthetic_video_mp4(noisy1_bytes)
    resp = requests.post(API_URL, files={"file": ("sample_clip.mp4", video_bytes, "video/mp4")})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    d6 = resp.json()
    print("  Prediction Accepted:", d6.get("prediction_accepted"))
    print("  Extracted Emotion:", d6.get("emotion"), f"({d6.get('confidence'):.2%})")
    print("  Noise Reduction on Video Audio:", d6.get("noise_reduction", {}).get("applied"))
    assert d6.get("emotion") is not None
    assert d6.get("noise_reduction", {}).get("applied") is True
    results["video_upload"] = "PASSED"
except Exception as e:
    print("  Video upload test error:", e)
    results["video_upload"] = f"FAILED: {e}"

# TEST 7: Speech Preservation / Distortion Check
print("\n[TEST 7] Speech Preservation / Distortion Evaluation")
clean_ref = open("backend_reference/neutral_sample.wav", "rb").read()
raw_y, sr = audio._decode(clean_ref)
from app.denoise import reduce_noise_signal
denoised_y, d_meta = reduce_noise_signal(raw_y, sr, initial_noise_floor=0.015, initial_snr_db=13.0)

# Calculate Pearson correlation between original and denoised signal
min_len = min(len(raw_y), len(denoised_y))
r = np.corrcoef(raw_y[:min_len], denoised_y[:min_len])[0, 1]
print(f"  Waveform Correlation: {r:.4f} (high fidelity preservation)")
energy_ratio = np.sum(denoised_y**2) / np.sum(raw_y**2)
print(f"  Energy Preservation Ratio: {energy_ratio:.4f}")
assert r > 0.85, f"Correlation too low: {r}"
results["distortion_check"] = "PASSED"

print("\n" + "=" * 70)
print("FINAL PIPELINE TEST SUMMARY:")
for test_name, status in results.items():
    print(f"  {test_name:<25}: {status}")
print("=" * 70)
