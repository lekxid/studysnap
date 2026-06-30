from pydantic import BaseModel


class LessonResponse(BaseModel):
    title: str
    difficulty: str
    estimated_time: str
    summary: str
    key_points: list[str]
    example: str
    common_mistakes: list[str]
    practice_question: str
    related_topics: list[str]
    next_step: str
