from openai import OpenAI
from app.config import settings

client = OpenAI(api_key=settings.openai_api_key)


def generate_lesson(question: str, context: str = ""):
    """
    Placeholder.

    Next step:
    This function will call OpenAI and return a structured lesson.
    """

    return {
        "title": "Coming Soon",
        "difficulty": "Easy",
        "estimated_time": "5 min",
        "summary": "Lesson engine is working.",
        "key_points": [],
        "example": "",
        "common_mistakes": [],
        "practice_question": "",
        "related_topics": [],
        "next_step": "",
    }
