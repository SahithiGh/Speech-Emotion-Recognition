import os
import sys
import numpy as np
import soundfile as sf
import noisereduce as nr

sys.path.insert(0, os.path.abspath('backend'))
from app import audio, audio_quality

samples = ['Noisy1.wav', 'Noisy2.wav', 'neutral_sample.wav', 'angry_sample.wav', 'happy_sample.wav', 'sad_sample.wav']

print("--- EVALUATION OF SPECTRAL GATING DENOISING ---")
for s in samples:
    path = os.path.join('backend_reference', s)
    if not os.path.exists(path):
        continue
    data = open(path, 'rb').read()
    raw_y, sr = audio._decode(data)
    q_orig = audio_quality.assess_audio_quality(raw_y, sr)
    
    # Process
    reduced_y = nr.reduce_noise(y=raw_y, sr=sr, prop_decrease=0.75, stationary=True)
    q_proc = audio_quality.assess_audio_quality(reduced_y, sr)
    
    print(f"\nClip: {s}")
    print(f"  ORIGINAL:  Status={q_orig['status']:<7} SNR={q_orig['snr_db']:>4.1f}dB  Floor={q_orig['noise_floor']:.4f}  SpeechDur={q_orig['speech_duration']:.2f}s")
    print(f"  PROCESSED: Status={q_proc['status']:<7} SNR={q_proc['snr_db']:>4.1f}dB  Floor={q_proc['noise_floor']:.4f}  SpeechDur={q_proc['speech_duration']:.2f}s")
