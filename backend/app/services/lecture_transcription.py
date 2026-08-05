from __future__ import annotations

# STUDYSNAP_LECTURE_TRANSCRIPTION_RELIABILITY_V1

import logging
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


logger = logging.getLogger(__name__)

SUPPORTED_TRANSCRIPTION_SUFFIXES = {
    ".flac",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpga",
    ".m4a",
    ".ogg",
    ".wav",
    ".webm",
}

MIME_BY_SUFFIX = {
    ".flac": "audio/flac",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
}


@dataclass(frozen=True)
class LectureTranscriptionResult:
    text: str
    model: str
    normalized_audio: bool


class LectureTranscriptionError(RuntimeError):
    def __init__(
        self,
        user_message: str,
        *,
        status_code: int = 502,
        reason: str = "transcription_failed",
        original_error: Exception | None = None,
    ) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.status_code = status_code
        self.reason = reason
        self.original_error = original_error


def _clean_filename(value: str, fallback_suffix: str) -> str:
    raw = Path(value or "lecture").name
    raw = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip(".-")
    if not raw:
        raw = "lecture"

    suffix = Path(raw).suffix.lower()
    if not suffix and fallback_suffix:
        raw = f"{raw}{fallback_suffix}"

    return raw[:180]


def _normalize_content_type(content_type: str | None, suffix: str) -> str:
    base = (content_type or "").split(";", 1)[0].strip().lower()
    if base.startswith("audio/") or base.startswith("video/"):
        return MIME_BY_SUFFIX.get(suffix, base)

    return MIME_BY_SUFFIX.get(
        suffix,
        mimetypes.guess_type(f"file{suffix}")[0] or "application/octet-stream",
    )


def _exception_status(error: Exception) -> int | None:
    status = getattr(error, "status_code", None)
    if isinstance(status, int):
        return status

    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def _exception_text(error: Exception) -> str:
    parts = [str(error)]

    for attr in ("code", "type", "message"):
        value = getattr(error, attr, None)
        if value:
            parts.append(str(value))

    body = getattr(error, "body", None)
    if body:
        parts.append(str(body))

    return " ".join(parts).lower()


def _is_invalid_audio_error(error: Exception) -> bool:
    status = _exception_status(error)
    text = _exception_text(error)
    indicators = (
        "invalid file",
        "invalid audio",
        "audio format",
        "file format",
        "unsupported format",
        "unsupported codec",
        "could not decode",
        "decode audio",
        "corrupt",
    )
    return status in {400, 415, 422} and any(item in text for item in indicators)


def _is_model_access_error(error: Exception) -> bool:
    status = _exception_status(error)
    text = _exception_text(error)
    indicators = (
        "model_not_found",
        "model not found",
        "does not exist",
        "not have access to model",
        "do not have access to model",
        "unsupported model",
    )
    return status in {400, 403, 404} and any(item in text for item in indicators)


def _to_user_error(error: Exception) -> LectureTranscriptionError:
    status = _exception_status(error)
    text = _exception_text(error)

    if status == 401:
        return LectureTranscriptionError(
            "Lecture transcription could not authenticate with the configured AI service. "
            "The recording is still saved.",
            status_code=503,
            reason="authentication",
            original_error=error,
        )

    if status in {402, 429} and any(
        item in text
        for item in ("quota", "billing", "insufficient", "credit", "balance")
    ):
        return LectureTranscriptionError(
            "Lecture transcription is unavailable because the API account has no available "
            "transcription quota. The recording is still saved.",
            status_code=503,
            reason="quota",
            original_error=error,
        )

    if status == 429:
        return LectureTranscriptionError(
            "Lecture transcription is busy right now. The recording is still saved and can be "
            "retried later.",
            status_code=503,
            reason="rate_limit",
            original_error=error,
        )

    if status == 413 or "too large" in text or "maximum content size" in text:
        return LectureTranscriptionError(
            "This lecture recording is too large for one transcription request. The recording "
            "is still saved.",
            status_code=413,
            reason="too_large",
            original_error=error,
        )

    if any(
        item in text
        for item in (
            "timed out",
            "timeout",
            "connection error",
            "connection refused",
            "network",
            "temporary failure",
        )
    ):
        return LectureTranscriptionError(
            "Lecture transcription could not reach the AI service. The recording is still saved "
            "and can be retried later.",
            status_code=503,
            reason="network",
            original_error=error,
        )

    if _is_invalid_audio_error(error):
        return LectureTranscriptionError(
            "StudySnap could not decode this recording for transcription. The audio is still "
            "saved and can be played.",
            status_code=422,
            reason="invalid_audio",
            original_error=error,
        )

    if _is_model_access_error(error):
        return LectureTranscriptionError(
            "The configured transcription model is not available to this API account. The "
            "recording is still saved.",
            status_code=503,
            reason="model_access",
            original_error=error,
        )

    return LectureTranscriptionError(
        "StudySnap saved the recording, but the transcription service could not finish. The "
        "recording is still safe.",
        status_code=502,
        reason="service_error",
        original_error=error,
    )


def _extract_transcript_text(result: Any) -> str:
    if isinstance(result, str):
        return result.strip()

    if isinstance(result, dict):
        return str(result.get("text") or "").strip()

    return str(getattr(result, "text", "") or "").strip()


def _model_candidates(configured_model: str) -> list[str]:
    candidates: list[str] = []
    for value in (
        configured_model.strip(),
        "gpt-4o-mini-transcribe",
        "whisper-1",
    ):
        if value and value not in candidates:
            candidates.append(value)
    return candidates


def _run_ffmpeg_normalization(
    source: Path,
    destination: Path,
    *,
    ffmpeg_binary: str,
    run_command: Callable[..., subprocess.CompletedProcess[Any]],
) -> None:
    result = run_command(
        [
            ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size <= 44:
        diagnostic = (result.stderr or "").strip().replace("\n", " ")[:500]
        raise LectureTranscriptionError(
            "StudySnap could not prepare this browser recording for transcription. The audio "
            "is still saved and can be played.",
            status_code=422,
            reason="normalization_failed",
            original_error=RuntimeError(diagnostic or "ffmpeg normalization failed"),
        )


def _create_transcription(
    *,
    client: Any,
    source_path: Path,
    upload_filename: str,
    content_type: str,
    model: str,
    language: str | None,
) -> str:
    with source_path.open("rb") as recording:
        kwargs: dict[str, Any] = {
            "model": model,
            "file": (upload_filename, recording, content_type),
            "response_format": "json",
        }
        if language:
            kwargs["language"] = language

        result = client.audio.transcriptions.create(**kwargs)

    transcript = _extract_transcript_text(result)
    if not transcript:
        raise LectureTranscriptionError(
            "The transcription service returned no readable text. The recording is still saved.",
            status_code=422,
            reason="empty_transcript",
        )
    return transcript


def transcribe_lecture_audio(
    *,
    file_path: Path,
    original_filename: str,
    content_type: str | None,
    api_key: str,
    configured_model: str = "gpt-4o-mini-transcribe",
    language: str | None = None,
    timeout_seconds: float = 300.0,
    client: Any | None = None,
    ffmpeg_binary: str | None = None,
    run_command: Callable[..., subprocess.CompletedProcess[Any]] = subprocess.run,
) -> LectureTranscriptionResult:
    if not api_key.strip():
        raise LectureTranscriptionError(
            "Lecture transcription is not configured yet. The recording is still saved.",
            status_code=503,
            reason="not_configured",
        )

    if not file_path.is_file():
        raise LectureTranscriptionError(
            "The recorded lecture audio could not be found.",
            status_code=404,
            reason="missing_recording",
        )

    if file_path.stat().st_size <= 44:
        raise LectureTranscriptionError(
            "The recording is too short or empty to transcribe. The saved audio was not removed.",
            status_code=422,
            reason="empty_recording",
        )

    suffix = Path(original_filename).suffix.lower() or file_path.suffix.lower()
    upload_filename = _clean_filename(original_filename, suffix)
    upload_content_type = _normalize_content_type(content_type, suffix)

    if client is None:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key.strip(),
            timeout=timeout_seconds,
            max_retries=2,
        )

    selected_language = (language or "").strip() or None
    models = _model_candidates(configured_model)
    normalization_binary = ffmpeg_binary or shutil.which("ffmpeg")
    normalized_path: Path | None = None
    normalized_directory: tempfile.TemporaryDirectory[str] | None = None
    last_error: Exception | None = None

    try:
        source_is_supported = suffix in SUPPORTED_TRANSCRIPTION_SUFFIXES

        if not source_is_supported and normalization_binary:
            normalized_directory = tempfile.TemporaryDirectory(prefix="studysnap-lecture-")
            normalized_path = Path(normalized_directory.name) / "lecture-normalized.wav"
            _run_ffmpeg_normalization(
                file_path,
                normalized_path,
                ffmpeg_binary=normalization_binary,
                run_command=run_command,
            )

        for model in models:
            source_path = normalized_path or file_path
            candidate_name = "lecture-normalized.wav" if normalized_path else upload_filename
            candidate_type = "audio/wav" if normalized_path else upload_content_type

            try:
                transcript = _create_transcription(
                    client=client,
                    source_path=source_path,
                    upload_filename=candidate_name,
                    content_type=candidate_type,
                    model=model,
                    language=selected_language,
                )
                return LectureTranscriptionResult(
                    text=transcript,
                    model=model,
                    normalized_audio=normalized_path is not None,
                )
            except LectureTranscriptionError:
                raise
            except Exception as error:
                last_error = error

                if _is_invalid_audio_error(error) and normalized_path is None and normalization_binary:
                    normalized_directory = tempfile.TemporaryDirectory(
                        prefix="studysnap-lecture-"
                    )
                    normalized_path = Path(normalized_directory.name) / "lecture-normalized.wav"
                    _run_ffmpeg_normalization(
                        file_path,
                        normalized_path,
                        ffmpeg_binary=normalization_binary,
                        run_command=run_command,
                    )

                    try:
                        transcript = _create_transcription(
                            client=client,
                            source_path=normalized_path,
                            upload_filename="lecture-normalized.wav",
                            content_type="audio/wav",
                            model=model,
                            language=selected_language,
                        )
                        return LectureTranscriptionResult(
                            text=transcript,
                            model=model,
                            normalized_audio=True,
                        )
                    except LectureTranscriptionError:
                        raise
                    except Exception as normalized_error:
                        last_error = normalized_error

                if _is_model_access_error(last_error):
                    continue

                raise _to_user_error(last_error) from last_error

        if last_error is not None:
            raise _to_user_error(last_error) from last_error

        raise LectureTranscriptionError(
            "No transcription model is configured. The recording is still saved.",
            status_code=503,
            reason="no_model",
        )
    finally:
        if normalized_directory is not None:
            normalized_directory.cleanup()
