from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_image_edit_identity_fidelity_contract():
    backend_source = (
        ROOT
        / "app"
        / "routes"
        / "ai.py"
    ).read_text()

    frontend_api_source = (
        ROOT.parent
        / "frontend"
        / "src"
        / "lib"
        / "api.ts"
    ).read_text()

    frontend_chat_source = (
        ROOT.parent
        / "frontend"
        / "src"
        / "features"
        / "ai"
        / "GeneralAIChat.tsx"
    ).read_text()

    assert (
        "identity_image: UploadFile | None"
        in backend_source
    )

    assert (
        '"gpt-image-2"'
        in backend_source
    )

    assert (
        '"input_fidelity"'
        in backend_source
    )

    assert (
        '"quality": "high"'
        in backend_source
    )

    assert (
        "Image 1 is the original "
        in backend_source
    )

    assert (
        '"identity_image"'
        in frontend_api_source
    )

    assert (
        "identityReferenceImage"
        in frontend_chat_source
    )

    assert (
        'quality: "high"'
        in frontend_chat_source
    )
