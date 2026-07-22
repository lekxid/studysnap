from datetime import datetime, timezone

from app.services.ai_runtime import (
    current_time_context,
    needs_current_information,
    should_use_web_search,
)


def test_current_time_context_contains_local_and_utc_date():
    value = current_time_context(
        now_utc=datetime(
            2026,
            7,
            20,
            16,
            30,
            tzinfo=timezone.utc,
        )
    )

    assert "Monday, July 20, 2026" in value
    assert "America/Toronto" in value
    assert "2026-07-20 16:30:00 UTC" in value


def test_detects_current_information_questions():
    questions = [
        "What is the weather today?",
        "Who is the current president?",
        "What is the latest measles news?",
        "What is the exchange rate right now?",
        "Is the library open today?",
    ]

    for question in questions:
        assert needs_current_information(question)


def test_ordinary_study_questions_do_not_need_web():
    questions = [
        "What is sinus rhythm?",
        "Explain photosynthesis simply.",
        "Make five flashcards from my notes.",
        "What is the first sign of a pressure injury?",
    ]

    for question in questions:
        assert not needs_current_information(question)


def test_web_search_respects_setting(monkeypatch):
    monkeypatch.setattr(
        "app.services.ai_runtime.settings."
        "web_search_enabled",
        False,
    )

    assert not should_use_web_search(
        "What is the latest news today?"
    )
