"""Command line prediction:  python predict.py your_audio.wav"""
import json
import sys

from app.errors import AudioError, ModelNotTrainedError
from app.predict import predict_file

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python predict.py your_audio.wav")
        sys.exit(2)
    try:
        print(json.dumps(predict_file(sys.argv[1]), indent=2))
    except (AudioError, ModelNotTrainedError, OSError) as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
