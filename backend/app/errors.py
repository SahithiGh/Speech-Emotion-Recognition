"""Small custom exceptions so the API and scripts can show friendly messages."""


class AudioError(Exception):
    """The audio could not be used (corrupt, silent, too short...). `code` is sent to the website."""

    def __init__(self, message: str, code: str = "bad_audio"):
        super().__init__(message)
        self.code = code


class DatasetError(Exception):
    """The CREMA-D dataset is missing or unusable."""


class ModelNotTrainedError(Exception):
    """No usable trained model exists yet."""
