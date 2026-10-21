from pydantic import BaseModel, Field, field_validator

STATUSES = ("VERIFIED", "TAMPERED", "MISSING_FROM_DB", "DELETED_AUTHORIZED",
            "NOT_ANCHORED", "INCONSISTENT", "UNAVAILABLE")
MAX_NOTE_LENGTH = 500


class NoteIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_NOTE_LENGTH)

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A note cannot be empty")
        return value
