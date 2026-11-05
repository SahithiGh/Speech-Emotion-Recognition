"""Language registry. Only languages with a trained, evaluated model may be listed here.
Hindi and Telugu will be added in a later phase, each with its own licensed dataset, model artifact and evaluation;
the interface reads this list, so no screen needs to change when a verified language is added."""
LANGUAGES = [{"code": "en", "name": "English", "dataset": "CREMA-D", "status": "supported"}]
