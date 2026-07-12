from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.intent_understanding import get_intent_understanding_instructions


@dataclass
class BrainPrompt:
    system_prompt: str
    user_prompt: str
    metadata: dict[str, Any]


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _format_retrieval_items(retrieval: list[dict[str, Any]], limit: int = 6) -> str:
    blocks: list[str] = []

    for index, item in enumerate(retrieval[:limit], start=1):
        source_type = _safe_text(item.get("source_type")) or "unknown"
        title = _safe_text(item.get("title")) or "Untitled"
        score = item.get("score", 0)
        reason = _safe_text(item.get("reason"))
        text = _safe_text(item.get("text"))

        if not text:
            continue

        blocks.append(
            "\n".join(
                [
                    f"[Source {index}]",
                    f"Type: {source_type}",
                    f"Title: {title}",
                    f"Relevance Score: {score}",
                    f"Reason: {reason}",
                    "",
                    text,
                ]
            )
        )

    if not blocks:
        return "No directly relevant StudySnap learning context was found."

    return "\n\n---\n\n".join(blocks)


def _format_learning_profile(profile: dict[str, Any]) -> str:
    if not profile:
        return "No learning profile is available yet."

    return "\n".join(
        [
            f"Study Room ID: {profile.get('study_room_id')}",
            f"Learning Stage: {profile.get('learning_stage')}",
            f"Mastery Level: {profile.get('mastery_level')}",
            f"Confidence Level: {profile.get('confidence_level')}",
            f"Recommended Focus: {profile.get('recommended_focus')}",
        ]
    )


def _format_coach(coach: dict[str, Any]) -> str:
    if not coach:
        return "No coach recommendation is available yet."

    next_action = coach.get("next_action") or {}

    return "\n".join(
        [
            f"Coach Message: {coach.get('coach_message')}",
            f"Priority: {coach.get('priority')}",
            f"Reason: {coach.get('reason')}",
            f"Next Action: {next_action.get('label')}",
            f"Estimated Minutes: {coach.get('estimated_minutes')}",
        ]
    )


def build_brain_prompt(
    *,
    question: str,
    retrieval: list[dict[str, Any]],
    learning_profile: dict[str, Any],
    coach: dict[str, Any],
) -> BrainPrompt:
    """
    Brain Prompt Builder v1.

    This creates one structured prompt from:
    - the student's question
    - retrieved notes/PDFs/flashcards/memories
    - the student's learning profile
    - the Brain coach recommendation
    """

    clean_question = _safe_text(question)
    retrieved_context = _format_retrieval_items(retrieval)
    profile_context = _format_learning_profile(learning_profile)
    coach_context = _format_coach(coach)

    system_prompt = """
You are StudySnap AI, a personalized learning coach and tutor.

Your job is to help the student understand, remember, and apply what they are studying.

Rules:
1. Use the retrieved StudySnap learning context first when it is relevant.
2. If the retrieved context is not enough, use general educational knowledge, but say when the answer is based on general knowledge.
3. Keep the answer clear, structured, and student-friendly.
4. Explain difficult ideas step by step.
5. Use the Brain Coach recommendation only if it clearly matches the student's current question or retrieved context.
6. If the Brain Coach recommendation is unrelated, ignore it and suggest a next action based on the retrieved context instead.
7. Do not invent sources or pretend the retrieved context says something it does not say.
""".strip() + "\n\n" + get_intent_understanding_instructions()

    user_prompt = f"""
Student Question:
{clean_question}

==============================

Student Learning Profile:
{profile_context}

==============================

Brain Coach Recommendation:
{coach_context}

==============================

Retrieved StudySnap Context:
{retrieved_context}

==============================

Now answer the student's question.

Answer format:
- Direct answer
- Simple explanation
- Key points to remember
- Suggested next study action
""".strip()

    return BrainPrompt(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        metadata={
            "retrieval_count": len(retrieval),
            "used_retrieval_count": min(len(retrieval), 6),
            "has_learning_profile": bool(learning_profile),
            "has_coach": bool(coach),
            "coach_priority": coach.get("priority") if coach else None,
        },
    )


def brain_prompt_to_dict(prompt: BrainPrompt) -> dict[str, Any]:
    return {
        "system_prompt": prompt.system_prompt,
        "user_prompt": prompt.user_prompt,
        "metadata": prompt.metadata,
    }
