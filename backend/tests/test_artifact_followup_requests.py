import pytest

from app.services.artifact_service import (
    is_artifact_followup_request,
    resolve_artifact_export_request,
)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        (
            "Can I get a PDF for the comparison?",
            "pdf",
        ),
        (
            "I need this as a dpf.",
            "pdf",
        ),
        (
            "Please provide a Word document.",
            "docx",
        ),
        (
            "I want a text file for this.",
            "txt",
        ),
        (
            "Attach this as Markdown.",
            "md",
        ),
    ],
)
def test_natural_file_requests_are_detected(
    message,
    expected,
):
    assert (
        resolve_artifact_export_request(
            message
        )
        == expected
    )


@pytest.mark.parametrize(
    ("follow_up", "previous", "expected"),
    [
        (
            "Okay send it now.",
            [
                "Create a PDF comparing "
                "the two devices."
            ],
            "pdf",
        ),
        (
            "Where is it?",
            [
                "Turn the answer into "
                "a Word document."
            ],
            "docx",
        ),
        (
            "Give me the link.",
            [
                "Please export this "
                "as Markdown."
            ],
            "md",
        ),
        (
            "Download it.",
            [
                "Save this as "
                "a text file."
            ],
            "txt",
        ),
    ],
)
def test_follow_up_uses_recent_file_request(
    follow_up,
    previous,
    expected,
):
    assert is_artifact_followup_request(
        follow_up
    )

    assert (
        resolve_artifact_export_request(
            follow_up,
            previous,
        )
        == expected
    )


@pytest.mark.parametrize(
    "message",
    [
        "Explain photosynthesis.",
        "Send it.",
        "Where?",
        "Okay.",
    ],
)
def test_unrelated_messages_do_not_invent_files(
    message,
):
    assert (
        resolve_artifact_export_request(
            message
        )
        is None
    )


def test_newest_relevant_request_wins():
    recent = [
        "Make this a PDF.",
        "Earlier, save a text file.",
    ]

    assert (
        resolve_artifact_export_request(
            "Send it now.",
            recent,
        )
        == "pdf"
    )
