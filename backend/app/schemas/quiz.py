from pydantic import BaseModel, ConfigDict


class QuizCreate(BaseModel):
    title: str
    study_room_id: int


class QuizResponse(BaseModel):
    id: int
    title: str
    study_room_id: int
    owner_id: int

    model_config = ConfigDict(from_attributes=True)


class QuizQuestionResponse(BaseModel):
    id: int
    quiz_id: int
    question: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str
    explanation: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GenerateQuizRequest(BaseModel):
    title: str
    content: str
    study_room_id: int


class GenerateQuizResponse(BaseModel):
    quiz_id: int
    title: str
    questions: list[dict]
