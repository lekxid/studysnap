from app.services.ai_intent import (
    should_use_web_search,
)
from app.services.ai_service import (
    _latest_student_message_for_web_intent,
    _offline_web_unavailable_answer,
    _openai_credit_unavailable,
)


class FakeQuotaError(Exception):
    status_code = 429
    code = "credit_balance_exhausted"


def test_context_label_does_not_force_web_search():
    wrapped = (
        "Recent conversation context:\n"
        "Student: We discussed study methods.\n\n"
        "New student message:\n"
        "Explain active recall in simple words."
    )

    latest = (
        _latest_student_message_for_web_intent(
            wrapped
        )
    )

    assert latest == (
        "Explain active recall in simple words."
    )
    assert not should_use_web_search(latest)


def test_real_current_question_still_requests_web():
    wrapped = (
        "Recent conversation context:\n"
        "StudySnap AI: Earlier answer.\n\n"
        "New student message:\n"
        "What is the weather in Barrie today?"
    )

    latest = (
        _latest_student_message_for_web_intent(
            wrapped
        )
    )

    assert latest == (
        "What is the weather in Barrie today?"
    )
    assert should_use_web_search(latest)


def test_no_credit_error_returns_honest_offline_answer():
    error = FakeQuotaError(
        "You have no credits remaining."
    )

    assert _openai_credit_unavailable(error)

    fallback = _offline_web_unavailable_answer(
        "What is the latest news?"
    )

    assert "can’t verify live information" in fallback
    assert "won’t guess" in fallback
    assert "What is the latest news?" in fallback
    assert "weather is" not in fallback.lower()
