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


def _transcribe_lecture_audio_api_primary(
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


# STUDYSNAP_LOCAL_FIRST_LECTURE_V1_1
#
# StudySnap owns the primary lecture-transcription path through its local
# whisper.cpp engine. External APIs remain optional fallbacks. The resulting
# text continues through the existing shared StudyMaterial and General AI
# handoff instead of creating a separate transcript silo.

import os as _studysnap_os
import tempfile as _studysnap_tempfile


def _studysnap_env_enabled(name: str, default: bool = True) -> bool:
    value = _studysnap_os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
        "disabled",
    }


def _studysnap_local_paths() -> tuple[Path, Path]:
    root = Path.home() / "studysnap-tools" / "whisper.cpp"

    binary = Path(
        _studysnap_os.getenv(
            "STUDYSNAP_WHISPER_CPP_BINARY",
            str(root / "build" / "bin" / "whisper-cli"),
        )
    ).expanduser()

    model = Path(
        _studysnap_os.getenv(
            "STUDYSNAP_WHISPER_CPP_MODEL",
            str(root / "models" / "ggml-base.en.bin"),
        )
    ).expanduser()

    return binary, model


def _studysnap_local_threads() -> int:
    default_threads = min(max(_studysnap_os.cpu_count() or 1, 1), 8)
    raw = _studysnap_os.getenv(
        "STUDYSNAP_LOCAL_TRANSCRIPTION_THREADS",
        "",
    ).strip()

    try:
        return min(max(int(raw), 1), 16) if raw else default_threads
    except ValueError:
        return default_threads


def _studysnap_local_timeout() -> float:
    raw = _studysnap_os.getenv(
        "STUDYSNAP_LOCAL_TRANSCRIPTION_TIMEOUT_SECONDS",
        "",
    ).strip()

    try:
        return (
            min(max(float(raw), 60.0), 14_400.0)
            if raw
            else 7_200.0
        )
    except ValueError:
        return 7_200.0


def _studysnap_local_language_supported(
    language: str | None,
    model_path: Path,
) -> bool:
    selected = (language or "").strip().lower()

    if ".en." in model_path.name.lower():
        return selected in {"", "en", "eng", "english"}

    return True


def _studysnap_run_local_transcription(
    *,
    file_path: Path,
    language: str | None,
    ffmpeg_binary: str | None,
    run_command: Callable[..., subprocess.CompletedProcess[Any]],
) -> LectureTranscriptionResult:
    binary, model = _studysnap_local_paths()

    if not binary.is_file() or not _studysnap_os.access(
        binary,
        _studysnap_os.X_OK,
    ):
        raise LectureTranscriptionError(
            "StudySnap's local transcription engine is not installed.",
            status_code=503,
            reason="local_unavailable",
        )

    if not model.is_file() or model.stat().st_size <= 0:
        raise LectureTranscriptionError(
            "StudySnap's local transcription model is not installed.",
            status_code=503,
            reason="local_unavailable",
        )

    if not _studysnap_local_language_supported(language, model):
        raise LectureTranscriptionError(
            "The installed StudySnap local model does not support the selected language.",
            status_code=503,
            reason="local_language_unsupported",
        )

    normalizer = ffmpeg_binary or shutil.which("ffmpeg")
    if not normalizer:
        raise LectureTranscriptionError(
            "FFmpeg is required for StudySnap local transcription.",
            status_code=503,
            reason="local_unavailable",
        )

    with _studysnap_tempfile.TemporaryDirectory(
        prefix="studysnap-local-lecture-",
    ) as directory:
        wav_path = Path(directory) / "lecture-normalized.wav"

        normalize_result = run_command(
            [
                normalizer,
                "-y",
                "-v",
                "error",
                "-i",
                str(file_path),
                "-map",
                "0:a:0",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(wav_path),
            ],
            capture_output=True,
            text=True,
            timeout=600.0,
            check=False,
        )

        if (
            normalize_result.returncode != 0
            or not wav_path.is_file()
            or wav_path.stat().st_size <= 44
        ):
            diagnostic = (
                normalize_result.stderr
                or normalize_result.stdout
                or "FFmpeg normalization failed"
            ).strip()

            raise LectureTranscriptionError(
                "StudySnap could not prepare this recording for local transcription. "
                "The recording is still saved.",
                status_code=422,
                reason="local_normalization_failed",
                original_error=RuntimeError(diagnostic[:700]),
            )

        selected_language = (language or "").strip()
        if not selected_language and ".en." in model.name.lower():
            selected_language = "en"

        command = [
            str(binary),
            "--model",
            str(model),
            "--file",
            str(wav_path),
            "--threads",
            str(_studysnap_local_threads()),
            "--no-timestamps",
        ]

        if selected_language:
            command.extend(["--language", selected_language])

        result = run_command(
            command,
            capture_output=True,
            text=True,
            timeout=_studysnap_local_timeout(),
            check=False,
        )

        transcript = "\n".join(
            line.strip()
            for line in (result.stdout or "").splitlines()
            if line.strip()
        ).strip()

        if result.returncode != 0:
            diagnostic = (
                result.stderr
                or result.stdout
                or "whisper.cpp transcription failed"
            ).strip()

            raise LectureTranscriptionError(
                "StudySnap could not finish local transcription. "
                "The recording is still saved.",
                status_code=503,
                reason="local_failed",
                original_error=RuntimeError(diagnostic[:700]),
            )

        if not transcript:
            raise LectureTranscriptionError(
                "StudySnap's local model returned no readable transcript. "
                "The recording is still saved.",
                status_code=422,
                reason="empty_local_transcript",
            )

        model_name = model.stem
        if model_name.startswith("ggml-"):
            model_name = model_name[5:]

        return LectureTranscriptionResult(
            text=transcript,
            model=f"studysnap-local/whisper.cpp/{model_name}",
            normalized_audio=True,
        )


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
    run_command: Callable[
        ...,
        subprocess.CompletedProcess[Any],
    ] = subprocess.run,
) -> LectureTranscriptionResult:
    local_error: LectureTranscriptionError | None = None

    local_enabled = _studysnap_env_enabled(
        "STUDYSNAP_LOCAL_TRANSCRIPTION_ENABLED",
        True,
    )

    force_local_with_client = _studysnap_env_enabled(
        "STUDYSNAP_LOCAL_TRANSCRIPTION_FORCE_WITH_CLIENT",
        False,
    )

    should_try_local = local_enabled and (
        client is None or force_local_with_client
    )

    if should_try_local:
        try:
            return _studysnap_run_local_transcription(
                file_path=file_path,
                language=language,
                ffmpeg_binary=ffmpeg_binary,
                run_command=run_command,
            )
        except LectureTranscriptionError as error:
            local_error = error

    try:
        return _transcribe_lecture_audio_api_primary(
            file_path=file_path,
            original_filename=original_filename,
            content_type=content_type,
            api_key=api_key,
            configured_model=configured_model,
            language=language,
            timeout_seconds=timeout_seconds,
            client=client,
            ffmpeg_binary=ffmpeg_binary,
            run_command=run_command,
        )
    except LectureTranscriptionError as api_error:
        if local_error is None:
            raise

        if api_error.reason == "not_configured":
            raise local_error from local_error.original_error

        raise LectureTranscriptionError(
            "StudySnap could not finish transcription with its local engine "
            "or the configured external provider. The recording is still saved.",
            status_code=503,
            reason="all_providers_failed",
            original_error=api_error,
        ) from api_error
