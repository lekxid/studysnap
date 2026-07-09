from __future__ import annotations

import os
from typing import Any

from openai import OpenAI

from app.config import settings
from app.services.brain.prompt_builder import BrainPrompt


def _get_brain_model() -> str:
    return (
        os.getenv("STUDYSNAP_BRAIN_MODEL")
        or os.getenv("OPENAI_MODEL")
        or "gpt-4o-mini"
    )


def _get_openai_client() -> OpenAI:
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add it to backend/.env and restart the backend."
        )

    return OpenAI(api_key=settings.openai_api_key, timeout=45.0)


def _usage_to_dict(usage: Any) -> dict[str, Any] | None:
    if usage is None:
        return None

    if hasattr(usage, "model_dump"):
        return usage.model_dump()

    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def generate_brain_answer(prompt: BrainPrompt) -> dict[str, Any]:
    """
    Generate a StudySnap Brain answer from the final Brain prompt.

    This service only handles the OpenAI call.
    Retrieval, profile, coach, and prompt construction stay in BrainService.
    """

    client = _get_openai_client()
    model = _get_brain_model()

    try:
        completion = client.chat.completions.create(
            model=model,
            temperature=0.3,
            max_tokens=1200,
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
        )
    except Exception as exc:
        raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    answer = completion.choices[0].message.content if completion.choices else ""

    if not answer or not answer.strip():
        raise RuntimeError("OpenAI returned an empty Brain answer.")

    return {
        "answer": answer.strip(),
        "model": getattr(completion, "model", model),
        "usage": _usage_to_dict(getattr(completion, "usage", None)),
    }
