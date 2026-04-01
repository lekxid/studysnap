from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str
    content: str
    study_room_id: int


class NoteResponse(BaseModel):
    id: int
    title: str
    content: str
    study_room_id: int
    owner_id: int

    class Config:
        from_attributes = True
