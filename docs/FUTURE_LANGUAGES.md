# Future phase: Hindi and Telugu (NOT implemented, deliberately)

The application supports **English only** (CREMA-D). Hindi and Telugu are not offered because no licensed dataset has been obtained, no model has been trained and no evaluation exists for them.
Reusing the English model on Hindi or Telugu speech, or translating its output, would not be valid and is not done.

## Candidate datasets found in a literature search (all details UNVERIFIED; check each source before use)
| Language | Dataset | What published sources say | Open questions |
|---|---|---|---|
| Hindi | IITKGP-SEHSC | Eight emotions, 15 sentences, self-induced emotion (per a 2022 dataset comparison paper) | Access route and permitted use; one student report says the authors could not be reached |
| Hindi | MNITJ-SEHSD | A Hindi emotional speech database (2023 paper) | License and download terms |
| Hindi | BhavVani | About 13 hours, 8,734 utterances, seven emotion labels, taken from a TV sitcom | Rights to the underlying broadcast audio; not acted speech |
| Hindi | Kaggle "Speech Emotion Recognition Hindi" | A small dataset, reportedly under ODbL (from a student presentation) | Size, speakers, provenance, actual license |
| Telugu | IIIT-H TEMD | About 5 hours, semi-natural, actors and non-actors (LREC 2020) | Access conditions, speaker metadata, label set |

## Required steps before enabling a language
1. Confirm the license, permitted uses and citation requirements, in writing from the dataset owner where unclear.
2. Verify languages, emotion labels (they differ from CREMA-D's six), speaker metadata, audio quality and size.
3. Add a language-specific manifest, loader and training run (the pipeline is already parameterised by dataset paths and the language registry `backend/app/languages.py`).
4. Evaluate each language independently with speaker-independent splits; record limitations and the supported classes.
5. Only then add the language to the registry, which is what the interface reads. No other screen needs to change.
