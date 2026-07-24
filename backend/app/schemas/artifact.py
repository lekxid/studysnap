from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ArtifactFormat = Literal["pdf", "docx", "txt", "md"]


class ArtifactCreateTextRequest(BaseModel):
    title: str = Field(default="StudySnap AI Export", max_length=180)
    content: str = Field(min_length=1, max_length=1_000_000)
    format: ArtifactFormat = "pdf"
    conversation_id: int | None = None
    message_id: int | None = None
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ArtifactCreateFromMessageRequest(BaseModel):
    title: str | None = Field(default=None, max_length=180)
    format: ArtifactFormat = "pdf"
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ArtifactResponse(BaseModel):
    id: int
    owner_id: int
    conversation_id: int | None
    message_id: int | None
    kind: str
    filename: str
    file_size: int
    content_type: str
    status: str
    expires_at: datetime | None
    created_at: datetime
    download_url: str
    ticket_url: str


class ArtifactTicketResponse(BaseModel):
    artifact_id: int
    url: str
    expires_at: datetime


class ArtifactDeleteResponse(BaseModel):
    id: int
    deleted: bool
