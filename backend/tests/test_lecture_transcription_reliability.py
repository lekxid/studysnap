from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.lecture_transcription import (
    LectureTranscriptionError,
    transcribe_lecture_audio,
)


class FakeTranscriptions:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class FakeClient:
    def __init__(self, outcomes):
        self.audio = SimpleNamespace(
            transcriptions=FakeTranscriptions(outcomes),
        )


class FakeAPIError(RuntimeError):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


def make_recording(tmp_path: Path, suffix: str = ".webm") -> Path:
    path = tmp_path / f"recording{suffix}"
    path.write_bytes(b"\x1a\x45\xdf\xa3" + b"audio" * 20)
    return path


def test_primary_transcription_preserves_filename_and_mime(tmp_path: Path) -> None:
    recording = make_recording(tmp_path)
    client = FakeClient([SimpleNamespace(text="Vital signs lecture")])

    result = transcribe_lecture_audio(
        file_path=recording,
        original_filename="lecture-week-7.webm",
        content_type="audio/webm;codecs=opus",
        api_key="test-key",
        client=client,
        ffmpeg_binary="",
    )

    assert result.text == "Vital signs lecture"
    assert result.model == "gpt-4o-mini-transcribe"
    assert result.normalized_audio is False

    call = client.audio.transcriptions.calls[0]
    filename, file_object, content_type = call["file"]
    assert filename == "lecture-week-7.webm"
    assert file_object.closed is True
    assert content_type == "audio/webm"
    assert call["response_format"] == "json"


def test_invalid_browser_audio_is_normalized_and_retried(tmp_path: Path) -> None:
    recording = make_recording(tmp_path)
    client = FakeClient(
        [
            FakeAPIError("Unsupported audio format", 400),
            SimpleNamespace(text="Normalized transcript"),
        ]
    )
    commands = []

    def fake_run(command, **kwargs):
        commands.append(command)
        destination = Path(command[-1])
        destination.write_bytes(b"RIFF" + b"wav" * 30)
        return SimpleNamespace(returncode=0, stderr="")

    result = transcribe_lecture_audio(
        file_path=recording,
        original_filename="firefox-lecture.webm",
        content_type="audio/webm;codecs=opus",
        api_key="test-key",
        client=client,
        ffmpeg_binary="ffmpeg",
        run_command=fake_run,
    )

    assert result.text == "Normalized transcript"
    assert result.normalized_audio is True
    assert len(commands) == 1

    second_call = client.audio.transcriptions.calls[1]
    assert second_call["file"][0] == "lecture-normalized.wav"
    assert second_call["file"][2] == "audio/wav"


def test_unavailable_primary_model_falls_back_to_whisper(tmp_path: Path) -> None:
    recording = make_recording(tmp_path)
    client = FakeClient(
        [
            FakeAPIError("The model does not exist or you do not have access to model", 404),
            SimpleNamespace(text="Fallback transcript"),
        ]
    )

    result = transcribe_lecture_audio(
        file_path=recording,
        original_filename="lecture.webm",
        content_type="audio/webm",
        api_key="test-key",
        client=client,
        ffmpeg_binary="",
    )

    assert result.text == "Fallback transcript"
    assert result.model == "whisper-1"
    assert [
        call["model"] for call in client.audio.transcriptions.calls
    ] == ["gpt-4o-mini-transcribe", "whisper-1"]


def test_quota_failure_returns_specific_safe_message(tmp_path: Path) -> None:
    recording = make_recording(tmp_path)
    client = FakeClient(
        [FakeAPIError("insufficient_quota: check billing", 429)]
    )

    with pytest.raises(LectureTranscriptionError) as caught:
        transcribe_lecture_audio(
            file_path=recording,
            original_filename="lecture.webm",
            content_type="audio/webm",
            api_key="test-key",
            client=client,
            ffmpeg_binary="",
        )

    assert caught.value.reason == "quota"
    assert caught.value.status_code == 503
    assert "recording is still saved" in caught.value.user_message.lower()
    assert len(client.audio.transcriptions.calls) == 1


def test_empty_recording_never_calls_transcription_service(tmp_path: Path) -> None:
    recording = tmp_path / "empty.webm"
    recording.write_bytes(b"tiny")
    client = FakeClient([])

    with pytest.raises(LectureTranscriptionError) as caught:
        transcribe_lecture_audio(
            file_path=recording,
            original_filename="empty.webm",
            content_type="audio/webm",
            api_key="test-key",
            client=client,
            ffmpeg_binary="",
        )

    assert caught.value.reason == "empty_recording"
    assert client.audio.transcriptions.calls == []



def _configure_studysnap_fake_local_engine(
    tmp_path: Path,
    monkeypatch,
) -> None:
    binary = tmp_path / "whisper-cli"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(0o755)

    model = tmp_path / "ggml-base.en.bin"
    model.write_bytes(b"studysnap-local-model")

    monkeypatch.setenv(
        "STUDYSNAP_LOCAL_TRANSCRIPTION_ENABLED",
        "true",
    )
    monkeypatch.setenv(
        "STUDYSNAP_WHISPER_CPP_BINARY",
        str(binary),
    )
    monkeypatch.setenv(
        "STUDYSNAP_WHISPER_CPP_MODEL",
        str(model),
    )


def _studysnap_fake_local_success(command, **kwargs):
    executable = str(command[0])

    if executable.endswith("ffmpeg"):
        Path(command[-1]).write_bytes(
            b"RIFF" + (b"wav" * 100)
        )
        return SimpleNamespace(
            returncode=0,
            stdout="",
            stderr="",
        )

    return SimpleNamespace(
        returncode=0,
        stdout="StudySnap owns this local lecture transcript.",
        stderr="",
    )


def test_studysnap_local_first_transcription_without_api_key(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _configure_studysnap_fake_local_engine(
        tmp_path,
        monkeypatch,
    )
    recording = make_recording(tmp_path)

    result = transcribe_lecture_audio(
        file_path=recording,
        original_filename="lecture.webm",
        content_type="audio/webm",
        api_key="",
        ffmpeg_binary="ffmpeg",
        run_command=_studysnap_fake_local_success,
    )

    assert result.text == (
        "StudySnap owns this local lecture transcript."
    )
    assert result.model == (
        "studysnap-local/whisper.cpp/base.en"
    )
    assert result.normalized_audio is True


def test_studysnap_explicit_client_keeps_primary_provider_contract(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _configure_studysnap_fake_local_engine(
        tmp_path,
        monkeypatch,
    )
    recording = make_recording(tmp_path)
    client = FakeClient(
        [SimpleNamespace(text="Explicit API provider transcript")]
    )

    result = transcribe_lecture_audio(
        file_path=recording,
        original_filename="lecture.webm",
        content_type="audio/webm",
        api_key="test-key",
        client=client,
        ffmpeg_binary="",
    )

    assert result.text == "Explicit API provider transcript"
    assert result.model == "gpt-4o-mini-transcribe"
    assert len(client.audio.transcriptions.calls) == 1
