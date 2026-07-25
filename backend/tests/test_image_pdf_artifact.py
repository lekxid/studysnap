from io import BytesIO

from PIL import Image

from app.services.artifact_service import (
    build_image_pdf_bytes,
    detect_artifact_export_request,
)


def tiny_png() -> bytes:
    buffer = BytesIO()

    Image.new(
        "RGB",
        (40, 30),
        "white",
    ).save(
        buffer,
        format="PNG",
    )

    return buffer.getvalue()


def test_change_to_pdf_is_export():
    assert (
        detect_artifact_export_request(
            "change to pdf"
        )
        == "pdf"
    )


def test_dpf_typo_is_export():
    assert (
        detect_artifact_export_request(
            "make a dpf of it"
        )
        == "pdf"
    )


def test_image_pdf_is_verified():
    payload = build_image_pdf_bytes(
        "Test Image",
        tiny_png(),
    )

    assert payload.startswith(b"%PDF")
    assert len(payload) > 1000
