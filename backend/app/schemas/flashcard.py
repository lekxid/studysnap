from pydantic import BaseModel


class FlashcardCreate(BaseModel):
    question: str
    answer: str
    study_room_id: int


class FlashcardResponse(BaseModel):
    id: int
    question: str
    answer: str
    study_room_id: int
    owner_id: int

    class Config:
        from_attributes = True
