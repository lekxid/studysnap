from __future__ import annotations

from types import SimpleNamespace

import app.services.base_ai_provider as provider


class FakeCompletions:
    def __init__(self, text="Local answer", fail=False):
        self.text = text
        self.fail = fail
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("provider failed")

        if kwargs.get("stream"):
            return iter([
                SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            delta=SimpleNamespace(content="Local ")
                        )
                    ]
                ),
                SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            delta=SimpleNamespace(content="stream")
                        )
                    ]
                ),
            ])

        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=self.text)
                )
            ],
            model=kwargs.get("model"),
        )


def fake_client(completions):
    return SimpleNamespace(
        chat=SimpleNamespace(completions=completions)
    )


def configure(monkeypatch):
    monkeypatch.setattr(
        provider.settings,
        "studysnap_base_ai_policy",
        "local_first",
    )
    monkeypatch.setattr(
        provider.settings,
        "studysnap_local_ai_enabled",
        True,
    )
    monkeypatch.setattr(
        provider.settings,
        "studysnap_local_ai_model",
        "studysnap-base-mini",
    )
    monkeypatch.setattr(
        provider.settings,
        "studysnap_local_ai_max_input_chars",
        12000,
    )
    monkeypatch.setattr(
        provider.settings,
        "openai_api_key",
        "test-key",
    )


def test_local_provider_is_primary(monkeypatch):
    configure(monkeypatch)
    local = FakeCompletions("StudySnap local answer")
    cloud = FakeCompletions("Cloud answer")

    monkeypatch.setattr(
        provider,
        "_local_client",
        lambda: fake_client(local),
    )
    monkeypatch.setattr(
        provider,
        "_cloud_client",
        lambda: fake_client(cloud),
    )

    result = provider.complete_text(
        messages=[{"role": "user", "content": "Hello"}],
        purpose="test",
    )

    assert result.provider == "studysnap-local"
    assert result.text == "StudySnap local answer"
    assert len(local.calls) == 1
    assert cloud.calls == []


def test_cloud_fallback_after_local_failure(monkeypatch):
    configure(monkeypatch)
    local = FakeCompletions(fail=True)
    cloud = FakeCompletions("Fallback answer")

    monkeypatch.setattr(
        provider,
        "_local_client",
        lambda: fake_client(local),
    )
    monkeypatch.setattr(
        provider,
        "_cloud_client",
        lambda: fake_client(cloud),
    )

    result = provider.complete_text(
        messages=[{"role": "user", "content": "Hello"}],
        cloud_model="test-cloud",
        purpose="test",
    )

    assert result.provider == "openai"
    assert result.model == "test-cloud"
    assert result.text == "Fallback answer"


def test_stream_uses_local(monkeypatch):
    configure(monkeypatch)
    local = FakeCompletions()
    cloud = FakeCompletions()

    monkeypatch.setattr(
        provider,
        "_local_client",
        lambda: fake_client(local),
    )
    monkeypatch.setattr(
        provider,
        "_cloud_client",
        lambda: fake_client(cloud),
    )

    result = "".join(
        provider.stream_text(
            messages=[{"role": "user", "content": "Hello"}],
            purpose="test",
        )
    )

    assert result == "Local stream"
    assert cloud.calls == []



def test_large_real_prompt_compacts_and_stays_local(monkeypatch):
    configure(monkeypatch)
    local = FakeCompletions("Compacted local answer")
    cloud = FakeCompletions("Cloud answer")

    monkeypatch.setattr(
        provider,
        "_local_client",
        lambda: fake_client(local),
    )
    monkeypatch.setattr(
        provider,
        "_cloud_client",
        lambda: fake_client(cloud),
    )

    latest = "LATEST QUESTION: Explain active recall simply."

    result = provider.complete_text(
        messages=[
            {
                "role": "system",
                "content": "StudySnap rules. " * 1200,
            },
            {
                "role": "user",
                "content": (
                    "Older conversation context. " * 1200
                    + latest
                ),
            },
        ],
        purpose="real_prompt_test",
    )

    assert result.provider == "studysnap-local"
    assert result.text == "Compacted local answer"
    assert cloud.calls == []
    assert len(local.calls) == 1

    sent_messages = local.calls[0]["messages"]
    sent_text = "\\n".join(
        str(item.get("content", ""))
        for item in sent_messages
    )

    assert len(sent_text) <= 9050
    assert latest in sent_text



def test_real_general_prompt_uses_fast_local_shape():
    latest = "Explain active recall in three simple steps."
    messages = [
        {
            "role": "system",
            "content": "Long StudySnap rules. " * 500,
        },
        {
            "role": "user",
            "content": (
                "Conversation and learning context:\n"
                + ("Older context. " * 500)
                + "\nNew student message:\n"
                + latest
            ),
        },
    ]

    compacted = provider._compact_local_messages(messages)
    combined = "\n".join(
        str(item.get("content", ""))
        for item in compacted
    )

    assert latest in combined
    assert len(combined) < 3000
    assert len(compacted) == 2
