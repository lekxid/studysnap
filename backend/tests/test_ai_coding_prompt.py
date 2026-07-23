from app.services.ai_service import (
    build_studysnap_system_prompt,
)


def test_coding_request_enables_coding_agent_mode():
    prompt = build_studysnap_system_prompt(
        "Clear Explain",
        (
            "Codex, inspect this TypeScript build error "
            "and give me a safe patch for the repo."
        ),
    )

    assert "CODING AGENT MODE:" in prompt
    assert "Never claim" in prompt
    assert "copy-pasteable" in prompt
    assert "tests" in prompt


def test_non_coding_question_stays_in_normal_mode():
    prompt = build_studysnap_system_prompt(
        "Clear Explain",
        "Explain blood pressure simply.",
    )

    assert "CODING AGENT MODE:" not in prompt
