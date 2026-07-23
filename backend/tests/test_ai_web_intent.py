import pytest

from app.services.ai_intent import (
    has_explicit_web_request,
    should_use_web_search,
)


@pytest.mark.parametrize(
    "message",
    [
        "check internet",
        "chk internet",
        "search the web",
        "look it up",
        "search it",
        "check online",
        "find the latest information",
        "give me sources",
    ],
)
def test_explicit_web_requests_are_detected(
    message,
):
    assert has_explicit_web_request(
        message
    )


def test_short_follow_up_uses_active_context():
    context = """
User: What app is that?
Assistant: It may be a shopper app.
User: It is Shopper.
"""

    assert should_use_web_search(
        "so chk internet",
        context,
    )


def test_earning_follow_up_requests_web_research():
    context = """
The active subject is improving earnings
as a Shopper app worker in Ontario.
"""

    assert should_use_web_search(
        "Dude check internet on how I can earn more",
        context,
    )


@pytest.mark.parametrize(
    "message",
    [
        "Explain photosynthesis",
        "Summarize these class notes",
        "Create five practice questions",
        "What is a sinus rhythm?",
    ],
)
def test_stable_questions_do_not_force_web_search(
    message,
):
    assert not should_use_web_search(
        message
    )


@pytest.mark.parametrize(
    "message",
    [
        "How do I check my internet connection?",
        "My Wi-Fi is not connecting",
        "How do I restart my router?",
        "Run a speed test",
    ],
)
def test_connectivity_questions_are_not_misclassified(
    message,
):
    assert not should_use_web_search(
        message
    )


@pytest.mark.parametrize(
    "message",
    [
        "What is the latest Ontario policy?",
        "What is the weather today?",
        "Check the current price",
        "Who is the current CEO?",
    ],
)
def test_current_information_still_uses_web(
    message,
):
    assert should_use_web_search(
        message
    )

def test_old_web_request_does_not_force_future_stable_questions():
    context = """
User: Check internet for current Shopper tips.
Assistant: Here are the researched tips.
"""

    assert not should_use_web_search(
        "Summarize my biology notes",
        context,
    )
