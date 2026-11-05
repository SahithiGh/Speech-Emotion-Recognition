# Dataset folder

This project uses **CREMA-D only** (https://github.com/CheyneyComputerScience/CREMA-D). The audio is not included in this project.
The real audio is about 610 MB (7,442 WAV files from 91 speakers).

## Easiest way: automatic, verified download

Double-click `download_dataset.bat` in the project folder. It:

1. downloads each WAV file from GitHub's Git LFS service for the official repository (no Git or Git LFS installation needed),
2. checks every file's size and SHA-256 against the official list stored in `backend\app\resources\crema_d_manifest.csv.gz`,
3. keeps verified files, so if you stop it (Ctrl+C) or lose your connection, running it again resumes and repairs damaged files,
4. finally runs a deep check of the whole folder.

Disk use: only the 610 MB of final files (no second copy).

## What must be here

`data\AudioWAV\` must contain the `.wav` files directly, for example `data\AudioWAV\1001_DFA_ANG_XX.wav`.
Names are `speaker_sentence_emotion_level.wav`; the emotion code (ANG, DIS, FEA, HAP, NEU, SAD) and speaker number come from the name.
The training script refuses files that are not on the official list, so only genuine CREMA-D is used.

## If the download is blocked

GitHub limits Git LFS bandwidth for some repositories. If `download_dataset.bat` reports a bandwidth or quota error, wait some hours and run it again
(verified files are kept). Alternatively obtain the same CREMA-D `AudioWAV` folder from another source, such as a mirror of the dataset, and copy the files into `data\AudioWAV\`.
Then run `check_dataset.bat`. It accepts the files only if every name, size and (with `--deep`) SHA-256 matches the official CREMA-D list, so a modified or different dataset is rejected.

## Git LFS placeholders

If you clone the GitHub repository without Git LFS, or download it as a ZIP, the `.wav` files are tiny text placeholders (about 130 bytes). The checker and the training script detect these and stop with a clear message. Use `download_dataset.bat` instead.

## Check your files

```
check_dataset.bat            quick check of names, sizes and WAV headers
check_dataset.bat --deep     also checks the SHA-256 of every file (reads about 610 MB)
```
