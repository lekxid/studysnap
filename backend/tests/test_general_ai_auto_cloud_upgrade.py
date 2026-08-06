from types import SimpleNamespace

from app.services import ai_service


class FakeCompletionEndpoint:
    def __init__(
        self,
        *,
        answer="Cloud StudySnap answer.",
        error=None,
        stream_chunks=None,
    ):
        self.answer = answer
        self.error = error
        self.stream_chunks = stream_chunks
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)

        if self.error is not None:
            raise self.error

        if kwargs.get("stream"):
            chunks = (
                self.stream_chunks
                if self.stream_chunks is not None
                else ["Cloud ", "stream."]
            )

            return iter(
                SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            delta=SimpleNamespace(
                                content=value
                            )
                        )
                    ]
                )
                for value in chunks
            )

        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=self.answer
                    )
                )
            ]
        )


class FakeClient:
    def __init__(self, endpoint):
        self.chat = SimpleNamespace(
            completions=endpoint
        )


class FakeQuotaError(Exception):
    status_code = 429
    code = "credit_balance_exhausted"


def reset_cloud_state(monkeypatch):
    monkeypatch.setattr(
        ai_service,
        "_CLOUD_GENERAL_AVAILABLE",
        False,
    )
    monkeypatch.setattr(
        ai_service,
        "_CLOUD_GENERAL_NEXT_PROBE_AT",
        0.0,
    )
    monkeypatch.setattr(
        ai_service,
        "_CLOUD_GENERAL_PROBE_STARTED",
        False,
    )


def test_quota_failure_is_safe_for_local_fallback():
    assert ai_service._cloud_general_fallback_allowed(
        FakeQuotaError(
            "You have no credits remaining."
        )
    )


def test_cloud_answer_uses_existing_configured_model(
    monkeypatch,
):
    reset_cloud_state(monkeypatch)
    endpoint = FakeCompletionEndpoint(
        answer="Better cloud answer."
    )

    monkeypatch.setattr(
        ai_service,
        "get_openai_client",
        lambda: FakeClient(endpoint),
    )
    monkeypatch.setattr(
        ai_service,
        "_configured_text_model",
        lambda: "configured-study-model",
    )

    answer = ai_service._cloud_general_answer(
        mode="Clear Explain",
        question="Explain active recall.",
        context="Student is reviewing memory.",
    )

    assert answer == "Better cloud answer."
    assert endpoint.calls[0]["model"] == (
        "configured-study-model"
    )
    assert ai_service._cloud_general_is_available()


def test_cloud_stream_yields_real_deltas(
    monkeypatch,
):
    reset_cloud_state(monkeypatch)
    endpoint = FakeCompletionEndpoint(
        stream_chunks=[
            "Better ",
            "cloud ",
            "stream.",
        ]
    )

    monkeypatch.setattr(
        ai_service,
        "get_openai_client",
        lambda: FakeClient(endpoint),
    )
    monkeypatch.setattr(
        ai_service,
        "_configured_text_model",
        lambda: "configured-study-model",
    )

    answer = "".join(
        ai_service._stream_cloud_general_answer(
            mode="Clear Explain",
            question="Explain retrieval practice.",
            context="",
        )
    )

    assert answer == "Better cloud stream."
    assert endpoint.calls[0]["stream"] is True


def test_failed_background_probe_keeps_local_mode(
    monkeypatch,
):
    reset_cloud_state(monkeypatch)
    endpoint = FakeCompletionEndpoint(
        error=FakeQuotaError(
            "No credits remaining."
        )
    )

    monkeypatch.setattr(
        ai_service,
        "get_openai_client",
        lambda: FakeClient(endpoint),
    )
    monkeypatch.setattr(
        ai_service,
        "_configured_text_model",
        lambda: "configured-study-model",
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_has_api_key",
        lambda: True,
    )

    ai_service._probe_cloud_general_once()

    assert not ai_service._cloud_general_is_available()


def test_successful_background_probe_enables_cloud(
    monkeypatch,
):
    reset_cloud_state(monkeypatch)
    endpoint = FakeCompletionEndpoint(
        answer="OK"
    )

    monkeypatch.setattr(
        ai_service,
        "get_openai_client",
        lambda: FakeClient(endpoint),
    )
    monkeypatch.setattr(
        ai_service,
        "_configured_text_model",
        lambda: "configured-study-model",
    )
    monkeypatch.setattr(
        ai_service,
        "_cloud_general_has_api_key",
        lambda: True,
    )

    ai_service._probe_cloud_general_once()

    assert ai_service._cloud_general_is_available()
