"""Single error type: every failure becomes a clean JSON {"error": ...} with a status code."""


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message
