from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    total_study_rooms: int
    total_notes: int
    total_flashcards: int
    total_quizzes: int
