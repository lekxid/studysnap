import json
from openai import OpenAI
from app.config import settings

client = OpenAI(api_key=settings.openai_api_key)


def generate_lesson(question: str, context: str = ""):
    system_prompt = """
You are StudySnap AI.

Return ONLY valid JSON with these exact keys:
title, difficulty, estimated_time, summary, key_points, example,
common_mistakes, practice_question, related_topics, next_step.

Rules:
- Student friendly, but not childish.
- Clear and useful.
- key_points must be a list of strings.
- common_mistakes must be a list of strings.
- related_topics must be a list of strings.
- No markdown.
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Question: {question}\n\nContext: {context}"},
        ],
        temperature=0.4,
        max_tokens=900,
        response_format={"type": "json_object"},
    )

    text = response.choices[0].message.content or "{}"

    try:
        return json.loads(text)
    except Exception:
        return {
            "title": "AI Lesson",
            "difficulty": "Medium",
            "estimated_time": "5 min",
            "summary": text,
            "key_points": [],
            "example": "",
            "common_mistakes": [],
            "practice_question": "",
            "related_topics": [],
            "next_step": "Ask a follow-up question or generate flashcards.",
        }
