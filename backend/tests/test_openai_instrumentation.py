from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.services.openai_instrumentation as instrumentation


class FakeCompletions:
    def __init__(
        self,
        *,
        fail: bool = False,
    ) -> None:
        self.fail = fail
        self.last_kwargs = None

    def create(
        self,
        **kwargs,
    ):
        self.last_kwargs = kwargs

        if self.fail:
            raise ValueError(
                "provider failed"
            )

        if kwargs.get("stream"):
            return iter(
                [
                    SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                delta=(
                                    SimpleNamespace(
                                        content="Hello"
                                    )
                                )
                            )
                        ],
                        usage=None,
                        model=kwargs.get(
                            "model"
                        ),
                    ),
                    SimpleNamespace(
                        choices=[],
                        usage=SimpleNamespace(
                            prompt_tokens=10,
                            completion_tokens=4,
                            total_tokens=14,
                        ),
                        model=kwargs.get(
                            "model"
                        ),
                    ),
                ]
            )

        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=(
                        SimpleNamespace(
                            content="Hello"
                        )
                    )
                )
            ],
            usage=SimpleNamespace(
                prompt_tokens=10,
                completion_tokens=4,
                total_tokens=14,
            ),
            model=kwargs.get(
                "model"
            ),
        )


class FakeResponses:
    def create(
        self,
        **kwargs,
    ):
        return SimpleNamespace(
            output_text="Answer",
            usage=SimpleNamespace(
                input_tokens=12,
                output_tokens=5,
                total_tokens=17,
            ),
            model=kwargs.get(
                "model"
            ),
        )


class FakeImages:
    def generate(
        self,
        **kwargs,
    ):
        return SimpleNamespace(
            data=[
                SimpleNamespace(
                    b64_json="image"
                )
            ],
            model=kwargs.get(
                "model"
            ),
        )

    def edit(
        self,
        **kwargs,
    ):
        return SimpleNamespace(
            data=[
                SimpleNamespace(
                    b64_json="image"
                )
            ],
            model=kwargs.get(
                "model"
            ),
        )


def fake_client(
    *,
    fail: bool = False,
):
    completions = FakeCompletions(
        fail=fail
    )

    return (
        SimpleNamespace(
            chat=SimpleNamespace(
                completions=completions
            ),
            responses=FakeResponses(),
            images=FakeImages(),
        ),
        completions,
    )


def test_tracks_success_with_context(
    monkeypatch,
):
    events = []

    monkeypatch.setattr(
        instrumentation,
        "persist_ai_usage_event",
        lambda **kwargs: events.append(
            kwargs
        ),
    )

    client, _ = fake_client()

    tracked = (
        instrumentation
        .instrument_openai_client(
            client
        )
    )

    with instrumentation.ai_usage_context(
        user_id=7,
        room_id=11,
        feature="unit_test",
    ):
        response = (
            tracked
            .chat
            .completions
            .create(
                model="gpt-4.1-mini",
                messages=[],
            )
        )

    assert response.model == (
        "gpt-4.1-mini"
    )

    assert len(events) == 1

    event = events[0]

    assert event["user_id"] == 7
    assert event["room_id"] == 11
    assert event["feature"] == (
        "unit_test"
    )
    assert event["operation"] == (
        "chat_completion"
    )
    assert event["status"] == (
        "success"
    )
    assert event["response"] is response
    assert event["latency_ms"] >= 1


def test_tracks_provider_error(
    monkeypatch,
):
    events = []

    monkeypatch.setattr(
        instrumentation,
        "persist_ai_usage_event",
        lambda **kwargs: events.append(
            kwargs
        ),
    )

    client, _ = fake_client(
        fail=True
    )

    tracked = (
        instrumentation
        .instrument_openai_client(
            client
        )
    )

    with pytest.raises(
        ValueError,
        match="provider failed",
    ):
        tracked.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[],
        )

    assert len(events) == 1

    assert events[0]["status"] == (
        "error"
    )
    assert events[0]["error_type"] == (
        "ValueError"
    )


def test_stream_includes_usage_and_logs_once(
    monkeypatch,
):
    events = []

    monkeypatch.setattr(
        instrumentation,
        "persist_ai_usage_event",
        lambda **kwargs: events.append(
            kwargs
        ),
    )

    client, completions = (
        fake_client()
    )

    tracked = (
        instrumentation
        .instrument_openai_client(
            client
        )
    )

    chunks = list(
        tracked.chat.completions.create(
            model="gpt-4.1-mini",
            stream=True,
            messages=[],
        )
    )

    assert len(chunks) == 2

    assert completions.last_kwargs[
        "stream_options"
    ] == {
        "include_usage": True,
    }

    assert len(events) == 1

    usage = events[0][
        "response"
    ].usage

    assert usage.total_tokens == 14
    assert events[0]["status"] == (
        "success"
    )


def test_image_request_uses_fixed_cost(
    monkeypatch,
):
    events = []

    monkeypatch.setattr(
        instrumentation,
        "persist_ai_usage_event",
        lambda **kwargs: events.append(
            kwargs
        ),
    )

    client, _ = fake_client()

    tracked = (
        instrumentation
        .instrument_openai_client(
            client
        )
    )

    tracked.images.generate(
        model="gpt-image-1",
        prompt="diagram",
        quality="high",
        size="1024x1024",
        n=1,
    )

    assert len(events) == 1

    event = events[0]

    assert event["operation"] == (
        "image_generation"
    )
    assert event["image_count"] == 1
    assert (
        event[
            "fixed_cost_microusd"
        ]
        is not None
    )
    assert event["status"] == (
        "success"
    )
