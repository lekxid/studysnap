from pathlib import Path

from app.services.artifact_service import (
    artifact_content_is_final,
    build_artifact_generation_instructions,
    build_pdf_bytes,
    suggest_artifact_title,
)


def test_humanization_and_adjustments_happen_before_export():
    instructions = (
        build_artifact_generation_instructions(
            "pdf",
            (
                "Humanize my resume, apply the "
                "adjustments, and send it as PDF."
            ),
        )
    ).lower()

    assert "humanization" in instructions
    assert "all requested corrections" in instructions
    assert "complete final document" in instructions
    assert "never invent" in instructions


def test_clarifications_are_not_exportable():
    rejected = (
        "Could you please confirm or provide "
        "the updated details before I create it?"
    )

    assert not artifact_content_is_final(
        rejected
    )

    assert not artifact_content_is_final(
        "NEEDS_CLARIFICATION: Please send "
        "your work history."
    )


def test_completed_resume_is_exportable():
    content = """
# Victor Akhidue

## Professional Summary
Reliable support professional with experience
working safely and communicating respectfully.

## Work Experience
Provided dependable support while following
privacy and workplace procedures.

## Education
Personal Support Worker Program.

## Skills
Communication, safety, teamwork, and organization.
"""

    assert artifact_content_is_final(
        content
    )


def test_resume_content_gets_resume_filename_title():
    content = """
# Victor Akhidue

## Professional Summary
Reliable and organized professional.

## Work Experience
Supported daily workplace operations.

## Education
Completed relevant education.

## Skills
Communication and teamwork.
"""

    assert (
        suggest_artifact_title(
            "Yes please, humanize it and make PDF.",
            content,
        )
        == "Updated Resume"
    )


def test_pdf_builder_produces_real_pdf():
    payload = build_pdf_bytes(
        "Updated Resume",
        """
# Victor Akhidue

## Skills
- Communication
- Teamwork
""",
    )

    assert payload.startswith(b"%PDF")
    assert len(payload) > 500


def test_dangerous_previous_answer_export_is_removed():
    source = (
        Path(__file__)
        .parents[1]
        .joinpath(
            "app/routes/ai.py"
        )
        .read_text(
            encoding="utf-8"
        )
    )

    assert "export_source_message" not in source
    assert (
        "content=export_source_message.content"
        not in source
    )

    assert (
        "def build_recent_attachment_context("
        in source
    )

    assert "content=final_content" in source
    assert "content=answer" in source
    assert (
        "artifact_content_is_final("
        in source
    )
