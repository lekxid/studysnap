from time import perf_counter

from app.services.ai_service import (
    _instant_conversation_answer,
    stream_studysnap_answer,
)


def test_greeting_is_natural():
    assert (
        _instant_conversation_answer("hi")
        == "Hi! How can I help?"
    )


def test_how_are_you_is_natural():
    assert (
        _instant_conversation_answer(
            "how are u doing?"
        )
        == (
            "I’m doing well and ready to help. "
            "How are you?"
        )
    )


def test_study_question_is_not_intercepted():
    assert (
        _instant_conversation_answer(
            "Explain how active recall works."
        )
        is None
    )


def test_wrapped_greeting_streams_immediately():
    prompt = (
        "Recent conversation context:\n"
        "Student: hi\n"
        "StudySnap AI: Hi! How can I help?\n\n"
        "New student message:\n"
        "how are u doing"
    )

    started = perf_counter()
    answer = "".join(
        stream_studysnap_answer(prompt)
    )
    elapsed = perf_counter() - started

    assert answer == (
        "I’m doing well and ready to help. "
        "How are you?"
    )
    assert elapsed < 0.5
