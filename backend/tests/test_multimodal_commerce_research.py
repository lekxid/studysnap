from pathlib import Path

from app.services.ai_intent import (
    should_use_web_search,
)


def test_natural_purchase_questions_use_web():
    for question in (
        "Where can I buy this?",
        "Where to buy this model",
        "Is this available near me?",
        "Compare the prices",
        "Which retailer has it in stock?",
        "What is the best place to buy it?",
    ):
        assert should_use_web_search(question)


def test_stable_image_learning_question_does_not_force_web():
    assert not should_use_web_search(
        "Explain the mitochondria in this diagram."
    )


def test_image_route_has_research_bridge():
    source = Path(
        "app/routes/ai.py"
    ).read_text(
        encoding="utf-8"
    )

    assert "MULTIMODAL_COMMERCE_RESEARCH_V1" in source
    assert "visual_facts = answer.strip()" in source
    assert "used_web_search = should_use_web_search(" in source
