from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PDFDocumentResponse(BaseModel):
    id: int
    original_filename: str
    stored_filename: str
    file_path: str
    file_size: int
    study_room_id: int
    owner_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
