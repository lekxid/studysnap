from pydantic import BaseModel, ConfigDict


class FlashcardCreate(BaseModel):
    question: str
    answer: str
    study_room_id: int
    tags: str = ""
    difficulty: str = "medium"
    source_type: str = "manual"
    source_id: str | None = None


class FlashcardResponse(BaseModel):
    id: int
    question: str
    answer: str
    tags: str
    difficulty: str
    source_type: str
    source_id: str | None = None
    study_room_id: int
    owner_id: int

    model_config = ConfigDict(from_attributes=True)
