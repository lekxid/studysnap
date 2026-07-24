from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)
