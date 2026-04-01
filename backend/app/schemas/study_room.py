from pydantic import BaseModel


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

    class Config:
        from_attributes = True
