from pydantic import BaseModel, ConfigDict


class StudyRoomCreate(BaseModel):
    name: str
    subject: str
    description: str | None = None


class StudyRoomResponse(BaseModel):
    id: int
    name: str
    subject: str
    description: str | None = None
    owner_id: int

    model_config = ConfigDict(from_attributes=True)
