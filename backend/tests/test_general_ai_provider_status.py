from app.services import ai_service


def test_local_provider_status(
    monkeypatch,
):
    monkeypatch.setattr(
        ai_service,
        "_ensure_cloud_general_probe_worker",
        lambda: None,
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_is_available",
        lambda: False,
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_has_api_key",
        lambda: True,
    )

    status = (
        ai_service.general_ai_provider_status()
    )

    assert status["provider"] == "local"
    assert status["label"] == "Local AI"
    assert status["automatic_upgrade"] is True


def test_cloud_provider_status(
    monkeypatch,
):
    monkeypatch.setattr(
        ai_service,
        "_ensure_cloud_general_probe_worker",
        lambda: None,
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_is_available",
        lambda: True,
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_has_api_key",
        lambda: True,
    )

    status = (
        ai_service.general_ai_provider_status()
    )

    assert status["provider"] == "openai"
    assert status["label"] == "Cloud AI"
    assert status["cloud_available"] is True
