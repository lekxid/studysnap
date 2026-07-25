from app.routes.ai import (
    build_contextual_image_prompt,
)


def test_short_reference_uses_recent_context():
    result = build_contextual_image_prompt(
        "Create an image for both.",
        [
            "user: What is a boy?",
            "assistant: A boy is a young male person.",
            "user: Tell me about love.",
            "assistant: Love means care, connection, and affection.",
            "user: How can both connect?",
        ],
    )

    lowered = result.lower()

    assert "boy" in lowered
    assert "love" in lowered
    assert "current image request" in lowered
    assert "photosynthesis" not in lowered


def test_standalone_image_prompt_is_not_rewritten():
    prompt = (
        "Create an image of a red bicycle "
        "beside a tree."
    )

    result = build_contextual_image_prompt(
        prompt,
        [
            "user: Explain cellular respiration.",
        ],
    )

    assert result == prompt


def test_missing_context_does_not_invent_topic():
    prompt = "Create an image for both."

    result = build_contextual_image_prompt(
        prompt,
        [],
    )

    assert result == prompt
