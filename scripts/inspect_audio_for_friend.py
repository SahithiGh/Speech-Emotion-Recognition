import os
import json
import soundfile as sf
import numpy as np

root = 'external_datasets/audio_for_friend'
print('=== DIRECTORY SCAN ===')
all_files = []
for dirpath, dirnames, filenames in os.walk(root):
    for f in filenames:
        rel = os.path.relpath(os.path.join(dirpath, f), root)
        all_files.append((rel, os.path.join(dirpath, f)))

print(f'Total files: {len(all_files)}')

audio_files = []
non_audio_files = []
for rel, full in sorted(all_files):
    size = os.path.getsize(full)
    ext = os.path.splitext(full)[1].lower()
    if ext in ('.wav', '.mp3', '.ogg', '.flac', '.m4a'):
        audio_files.append((rel, full, size))
    else:
        non_audio_files.append((rel, full, size))

print(f'Audio files: {len(audio_files)}, Non-audio files: {len(non_audio_files)}')
if non_audio_files:
    print('\nNon-audio files:')
    for rel, full, sz in non_audio_files:
        print(f'  {rel} ({sz} bytes)')

print('\n=== AUDIO DETAILS ===')
details = []
for rel, full, sz in audio_files:
    try:
        info = sf.info(full)
        dur = info.duration
        sr = info.samplerate
        ch = info.channels
        subtype = info.subtype
        status = 'valid'
        # Read a portion or all to check content
        data, _ = sf.read(full)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        max_amp = float(np.max(np.abs(data))) if len(data) > 0 else 0.0
        rms = float(np.sqrt(np.mean(data**2))) if len(data) > 0 else 0.0
    except Exception as e:
        dur = 0.0
        sr = 0
        ch = 0
        subtype = 'N/A'
        max_amp = 0.0
        rms = 0.0
        status = f'ERR: {type(e).__name__}'
    details.append({
        'rel': rel, 'size': sz, 'dur': dur, 'sr': sr, 'ch': ch,
        'subtype': subtype, 'status': status, 'max_amp': max_amp, 'rms': rms
    })

print(f"{'Relative File Path':<46} | {'Status':<12} | {'Dur (s)':<7} | {'SR (Hz)':<7} | {'Ch':<2} | {'MaxAmp':<7} | {'RMS':<7} | {'Size':<10}")
print("-" * 115)
for d in details:
    print(f"{d['rel']:<46} | {d['status']:<12} | {d['dur']:>7.2f} | {d['sr']:>7} | {d['ch']:>2} | {d['max_amp']:>7.3f} | {d['rms']:>7.4f} | {d['size']:>9}B")

# Summary of categories
print('\n=== SUBFOLDER BREAKDOWN ===')
folders = {}
for d in details:
    sub = os.path.dirname(d['rel'])
    folders.setdefault(sub, []).append(d)

for sub, flist in folders.items():
    valid_count = sum(1 for x in flist if x['status'] == 'valid')
    total_dur = sum(x['dur'] for x in flist)
    print(f"Folder '{sub}': {len(flist)} files ({valid_count} valid), Total duration: {total_dur:.1f}s ({total_dur/60:.2f} mins)")

