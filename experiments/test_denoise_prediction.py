import os
import sys
import numpy as np
import soundfile as sf
import noisereduce as nr
import requests

sys.path.insert(0, os.path.abspath('backend'))
from app import audio, audio_quality, predict

print("Testing prediction on Noisy1.wav and Noisy2.wav with and without noise reduction:")

for s in ['Noisy1.wav', 'Noisy2.wav']:
    path = os.path.join('backend_reference', s)
    data = open(path, 'rb').read()
    raw_y, sr = audio._decode(data)
    
    # Send original to running backend
    res_orig = requests.post("http://127.0.0.1:8000/api/predict", files={"file": (s, data, "audio/wav")}).json()
    
    # Process with noisereduce
    clean_y = nr.reduce_noise(y=raw_y, sr=sr, prop_decrease=0.75, stationary=True)
    import io
    out_buf = io.BytesIO()
    sf.write(out_buf, clean_y, sr, format='WAV')
    clean_bytes = out_buf.getvalue()
    
    res_clean = requests.post("http://127.0.0.1:8000/api/predict", files={"file": ("clean_" + s, clean_bytes, "audio/wav")}).json()
    
    print(f"\n=== {s} ===")
    print(f"ORIGINAL:  Emotion={res_orig.get('emotion')} Conf={res_orig.get('confidence'):.3f} Margin={res_orig.get('margin'):.3f} Quality={res_orig.get('audio_quality', {}).get('status')}")
    print(f"CLEANED:   Emotion={res_clean.get('emotion')} Conf={res_clean.get('confidence'):.3f} Margin={res_clean.get('margin'):.3f} Quality={res_clean.get('audio_quality', {}).get('status')}")
    print("Scores comparison:")
    for emo in ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad']:
        sc_orig = res_orig.get('scores', {}).get(emo, 0)
        sc_clean = res_clean.get('scores', {}).get(emo, 0)
        print(f"  {emo:<8}: orig={sc_orig:.4f} -> clean={sc_clean:.4f}")
