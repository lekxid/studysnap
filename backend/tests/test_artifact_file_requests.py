import io
import zipfile

import pytest

from app.services.artifact_service import (
    build_artifact_bytes,
    detect_artifact_export_request,
)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Make this a PDF and download it", "pdf"),
        ("download pdf", "pdf"),
        ("Turn the answer into a Word document", "docx"),
        ("Save this as a text file", "txt"),
        ("Export the response as Markdown", "md"),
    ],
)
def test_detects_explicit_file_creation_requests(
    message,
    expected,
):
    assert (
        detect_artifact_export_request(message)
        == expected
    )


@pytest.mark.parametrize(
    "message",
    [
        "What is a PDF?",
        "How do I create a Word document?",
        "Explain Markdown.",
        "Download WhatsApp",
        "Explain sinus rhythm.",
    ],
)
def test_does_not_misclassify_information_or_app_requests(
    message,
):
    assert (
        detect_artifact_export_request(message)
        is None
    )


def test_builds_valid_docx_file():
    payload, filename, content_type = (
        build_artifact_bytes(
            title="Sinus Rhythm",
            content=(
                "Sinus rhythm is the normal "
                "rhythm of the heart."
            ),
            artifact_format="docx",
        )
    )

    assert filename == "sinus-rhythm.docx"
    assert content_type == (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    )

    with zipfile.ZipFile(
        io.BytesIO(payload)
    ) as archive:
        assert (
            "word/document.xml"
            in archive.namelist()
        )

        document = archive.read(
            "word/document.xml"
        ).decode("utf-8")

    assert "Sinus Rhythm" in document
    assert "normal rhythm" in document
