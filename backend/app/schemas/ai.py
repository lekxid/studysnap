from pydantic import BaseModel


class AskAIRequest(BaseModel):
    question: str
    context: str = ""
    study_room_id: int | None = None


class AskAIResponse(BaseModel):
    answer: str


class GenerateFlashcardsRequest(BaseModel):
    content: str
    study_room_id: int


class GenerateFlashcardsResponse(BaseModel):
    flashcards: list[dict]
