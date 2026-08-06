from __future__ import annotations

import os

from app.services.base_ai_provider import complete_text
from app.services.brain.prompt_builder import BrainPrompt


# STUDYSNAP_BASE_AI_PROVIDER_V1


def _get_brain_model() -> str:
    return (
        os.getenv("STUDYSNAP_BRAIN_MODEL")
        or os.getenv("OPENAI_MODEL")
        or "gpt-4o-mini"
    )


def generate_brain_answer(prompt: BrainPrompt) -> dict:
    result = complete_text(
        messages=[
            {
                "role": "system",
                "content": prompt.system_prompt,
            },
            {
                "role": "user",
                "content": prompt.user_prompt,
            },
        ],
        temperature=0.3,
        max_tokens=1200,
        cloud_model=_get_brain_model(),
        purpose="brain",
    )

    return {
        "answer": result.text,
        "model": result.model,
        "provider": result.provider,
        "usage": None,
    }
