# Models folder

`train_model.bat` writes the trained classifier here:

- `emotion_model.joblib` - scaler + classifier + label list
- `preprocessing_config.json` - audio and feature settings used in training (prediction reuses them)

These files do not exist until training has actually succeeded. Without them the website shows
"Model not trained yet". Delete the files to reset.
