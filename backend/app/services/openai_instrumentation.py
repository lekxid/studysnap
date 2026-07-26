from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import inspect
from time import perf_counter
from typing import Any, Iterator

from openai import OpenAI as _OpenAI

from app.services.ai_usage import (
    estimate_image_cost_microusd,
    persist_ai_usage_event,
)


@dataclass(frozen=True)
class AIUsageContext:
    user_id: int | None = None
    room_id: int | None = None
    feature: str | None = None


_AI_USAGE_CONTEXT: ContextVar[
    AIUsageContext
] = ContextVar(
    "studysnap_ai_usage_context",
    default=AIUsageContext(),
)


_FEATURE_BY_CALLER: dict[
    tuple[str, str],
    str,
] = {
    (
        "app.routes.ai",
        "generate_image",
    ): "image_generation",
    (
        "app.routes.ai",
        "edit_ai_image",
    ): "image_edit",
    (
        "app.routes.ai",
        "ask_ai_with_files",
    ): "general_ai_files",
    (
        "app.routes.ai",
        "ask_ai_with_file",
    ): "general_ai_file",
    (
        "app.routes.ai",
        "ask_ai_with_image",
    ): "general_ai_vision",
    (
        "app.routes.file_brain_ai",
        "ask_file_brain_items",
    ): "file_brain",
    (
        "app.routes.smart_scan",
        "extract_scan_page_text",
    ): "smart_scan_ocr",
    (
        "app.services.ai_service",
        "_generate_current_web_answer",
    ): "general_ai_web",
    (
        "app.services.ai_service",
        "generate_studysnap_answer",
    ): "general_ai",
    (
        "app.services.ai_service",
        "stream_studysnap_answer",
    ): "general_ai_stream",
    (
        "app.services.ai_service",
        "generate_basic_flashcards",
    ): "flashcards",
    (
        "app.services.ai_service",
        "generate_basic_quiz",
    ): "quizzes",
    (
        "app.services.brain.answer",
        "generate_brain_answer",
    ): "brain",
    (
        "app.services.lesson_service",
        "generate_lesson",
    ): "lesson",
    (
        "app.services.material_intelligence",
        "analyze_text_with_ai",
    ): "material_classification",
    (
        "app.services.material_intelligence",
        "analyze_image_with_ai",
    ): "material_vision",
}


_TRACKED_OPERATIONS: dict[
    tuple[str, ...],
    str,
] = {
    (
        "responses",
        "create",
    ): "responses",
    (
        "chat",
        "completions",
        "create",
    ): "chat_completion",
    (
        "images",
        "generate",
    ): "image_generation",
    (
        "images",
        "edit",
    ): "image_edit",
    (
        "embeddings",
        "create",
    ): "embeddings",
    (
        "audio",
        "transcriptions",
        "create",
    ): "audio_transcription",
    (
        "audio",
        "speech",
        "create",
    ): "audio_speech",
}


_TRACKED_PREFIXES = {
    path[:index]
    for path in _TRACKED_OPERATIONS
    for index in range(
        1,
        len(path),
    )
}


def _positive_int(
    value: Any,
) -> int | None:
    try:
        parsed = int(value)
    except (
        TypeError,
        ValueError,
    ):
        return None

    return parsed if parsed > 0 else None


def _object_id(
    value: Any,
) -> int | None:
    if value is None:
        return None

    return _positive_int(
        getattr(
            value,
            "id",
            None,
        )
    )


def _object_room_id(
    value: Any,
) -> int | None:
    if value is None:
        return None

    return _positive_int(
        getattr(
            value,
            "study_room_id",
            None,
        )
    )


def _infer_stack_context() -> AIUsageContext:
    configured = _AI_USAGE_CONTEXT.get()

    user_id = configured.user_id
    room_id = configured.room_id
    feature = configured.feature

    frame = inspect.currentframe()

    try:
        frame = (
            frame.f_back
            if frame is not None
            else None
        )

        inspected = 0

        while (
            frame is not None
            and inspected < 30
        ):
            inspected += 1

            module_name = str(
                frame.f_globals.get(
                    "__name__",
                    "",
                )
            )

            function_name = (
                frame.f_code.co_name
            )

            if module_name == __name__:
                frame = frame.f_back
                continue

            local_values = frame.f_locals

            if user_id is None:
                user_id = _object_id(
                    local_values.get(
                        "current_user"
                    )
                )

            if user_id is None:
                service = local_values.get(
                    "self"
                )

                user_id = _positive_int(
                    getattr(
                        service,
                        "user_id",
                        None,
                    )
                )

                if user_id is None:
                    user_id = _positive_int(
                        getattr(
                            service,
                            "current_user_id",
                            None,
                        )
                    )

            if room_id is None:
                for key in (
                    "effective_room_id",
                    "context_study_room_id",
                    "study_room_id",
                    "room_id",
                ):
                    room_id = _positive_int(
                        local_values.get(key)
                    )

                    if room_id is not None:
                        break

            if room_id is None:
                room_id = _object_room_id(
                    local_values.get(
                        "conversation"
                    )
                )

            if room_id is None:
                payload = local_values.get(
                    "data"
                )

                room_id = _positive_int(
                    getattr(
                        payload,
                        "study_room_id",
                        None,
                    )
                )

            if feature is None:
                feature = (
                    _FEATURE_BY_CALLER.get(
                        (
                            module_name,
                            function_name,
                        )
                    )
                )

            if (
                user_id is not None
                and room_id is not None
                and feature is not None
            ):
                break

            frame = frame.f_back

    finally:
        del frame

    return AIUsageContext(
        user_id=user_id,
        room_id=room_id,
        feature=feature,
    )


@contextmanager
def ai_usage_context(
    *,
    user_id: int | None = None,
    room_id: int | None = None,
    feature: str | None = None,
) -> Iterator[None]:
    current = _AI_USAGE_CONTEXT.get()

    token = _AI_USAGE_CONTEXT.set(
        AIUsageContext(
            user_id=(
                _positive_int(user_id)
                or current.user_id
            ),
            room_id=(
                _positive_int(room_id)
                or current.room_id
            ),
            feature=(
                feature
                or current.feature
            ),
        )
    )

    try:
        yield
    finally:
        _AI_USAGE_CONTEXT.reset(token)


def _resolved_context(
    defaults: AIUsageContext,
) -> AIUsageContext:
    runtime = _infer_stack_context()

    return AIUsageContext(
        user_id=(
            runtime.user_id
            or defaults.user_id
        ),
        room_id=(
            runtime.room_id
            or defaults.room_id
        ),
        feature=(
            runtime.feature
            or defaults.feature
            or "unknown"
        ),
    )


def _response_model(
    response: Any,
    kwargs: dict[str, Any],
) -> str | None:
    model = getattr(
        response,
        "model",
        None,
    )

    if model:
        return str(model)

    configured = kwargs.get("model")

    return (
        str(configured)
        if configured
        else None
    )


def _image_count(
    kwargs: dict[str, Any],
) -> int:
    return (
        _positive_int(
            kwargs.get("n")
        )
        or 1
    )


def _persist_result(
    *,
    context: AIUsageContext,
    operation: str,
    response: Any,
    kwargs: dict[str, Any],
    started_at: float,
    status: str,
    error: Exception | None = None,
) -> None:
    latency_ms = max(
        1,
        round(
            (
                perf_counter()
                - started_at
            )
            * 1000
        ),
    )

    model = _response_model(
        response,
        kwargs,
    )

    image_count = 0
    fixed_cost_microusd = None

    if (
        status == "success"
        and operation
        in {
            "image_generation",
            "image_edit",
        }
    ):
        image_count = _image_count(
            kwargs
        )

        estimated_cost, priced = (
            estimate_image_cost_microusd(
                model=model,
                quality=kwargs.get(
                    "quality"
                ),
                size=kwargs.get(
                    "size"
                ),
                image_count=image_count,
            )
        )

        if priced:
            fixed_cost_microusd = (
                estimated_cost
            )

    persist_ai_usage_event(
        user_id=context.user_id,
        room_id=context.room_id,
        feature=(
            context.feature
            or "unknown"
        ),
        operation=operation,
        model=model,
        response=response,
        status=status,
        latency_ms=latency_ms,
        image_count=image_count,
        fixed_cost_microusd=(
            fixed_cost_microusd
        ),
        error_type=(
            error.__class__.__name__
            if error is not None
            else None
        ),
    )


class _TrackedSyncStream:
    def __init__(
        self,
        *,
        stream: Any,
        context: AIUsageContext,
        operation: str,
        kwargs: dict[str, Any],
        started_at: float,
    ) -> None:
        self._stream = stream
        self._iterator = iter(stream)
        self._context = context
        self._operation = operation
        self._kwargs = kwargs
        self._started_at = started_at
        self._usage_response = None
        self._finished = False

    def __iter__(
        self,
    ) -> "_TrackedSyncStream":
        return self

    def __next__(
        self,
    ) -> Any:
        try:
            item = next(
                self._iterator
            )
        except StopIteration:
            self._finish_success()
            raise
        except Exception as exc:
            self._finish_error(exc)
            raise

        if getattr(
            item,
            "usage",
            None,
        ) is not None:
            self._usage_response = item

        return item

    def _finish_success(
        self,
    ) -> None:
        if self._finished:
            return

        self._finished = True

        _persist_result(
            context=self._context,
            operation=self._operation,
            response=self._usage_response,
            kwargs=self._kwargs,
            started_at=self._started_at,
            status="success",
        )

    def _finish_error(
        self,
        error: Exception,
    ) -> None:
        if self._finished:
            return

        self._finished = True

        _persist_result(
            context=self._context,
            operation=self._operation,
            response=self._usage_response,
            kwargs=self._kwargs,
            started_at=self._started_at,
            status="error",
            error=error,
        )

    def close(
        self,
    ) -> None:
        close = getattr(
            self._stream,
            "close",
            None,
        )

        try:
            if callable(close):
                close()
        except Exception as exc:
            self._finish_error(exc)
            raise
        else:
            self._finish_success()

    def __enter__(
        self,
    ) -> "_TrackedSyncStream":
        enter = getattr(
            self._stream,
            "__enter__",
            None,
        )

        if callable(enter):
            enter()

        return self

    def __exit__(
        self,
        exc_type,
        exc,
        traceback,
    ) -> bool:
        exit_method = getattr(
            self._stream,
            "__exit__",
            None,
        )

        suppress = False

        if callable(exit_method):
            suppress = bool(
                exit_method(
                    exc_type,
                    exc,
                    traceback,
                )
            )

        if exc is None:
            self._finish_success()
        elif isinstance(
            exc,
            Exception,
        ):
            self._finish_error(exc)

        return suppress

    def __getattr__(
        self,
        name: str,
    ) -> Any:
        return getattr(
            self._stream,
            name,
        )


class _NamespaceProxy:
    def __init__(
        self,
        *,
        target: Any,
        path: tuple[str, ...],
        defaults: AIUsageContext,
    ) -> None:
        self._target = target
        self._path = path
        self._defaults = defaults

    def __getattr__(
        self,
        name: str,
    ) -> Any:
        attribute = getattr(
            self._target,
            name,
        )

        next_path = (
            *self._path,
            name,
        )

        operation = (
            _TRACKED_OPERATIONS.get(
                next_path
            )
        )

        if (
            operation is not None
            and callable(attribute)
        ):
            def tracked_call(
                *args: Any,
                **kwargs: Any,
            ) -> Any:
                call_kwargs = dict(
                    kwargs
                )

                is_stream = bool(
                    call_kwargs.get(
                        "stream"
                    )
                )

                if (
                    next_path
                    == (
                        "chat",
                        "completions",
                        "create",
                    )
                    and is_stream
                    and "stream_options"
                    not in call_kwargs
                ):
                    call_kwargs[
                        "stream_options"
                    ] = {
                        "include_usage": True,
                    }

                context = _resolved_context(
                    self._defaults
                )

                started_at = (
                    perf_counter()
                )

                try:
                    response = attribute(
                        *args,
                        **call_kwargs,
                    )
                except Exception as exc:
                    _persist_result(
                        context=context,
                        operation=operation,
                        response=None,
                        kwargs=call_kwargs,
                        started_at=started_at,
                        status="error",
                        error=exc,
                    )
                    raise

                if is_stream:
                    return _TrackedSyncStream(
                        stream=response,
                        context=context,
                        operation=operation,
                        kwargs=call_kwargs,
                        started_at=started_at,
                    )

                _persist_result(
                    context=context,
                    operation=operation,
                    response=response,
                    kwargs=call_kwargs,
                    started_at=started_at,
                    status="success",
                )

                return response

            return tracked_call

        if next_path in _TRACKED_PREFIXES:
            return _NamespaceProxy(
                target=attribute,
                path=next_path,
                defaults=self._defaults,
            )

        return attribute


def instrument_openai_client(
    client: Any,
    *,
    context: AIUsageContext | None = None,
) -> Any:
    return _NamespaceProxy(
        target=client,
        path=(),
        defaults=(
            context
            or _infer_stack_context()
        ),
    )


class OpenAI:
    """
    Transparent StudySnap wrapper around the official OpenAI client.

    Existing application code can continue using:
        client = OpenAI(...)
        client.responses.create(...)
        client.chat.completions.create(...)
        client.images.generate(...)
        client.images.edit(...)

    Analytics failures never interrupt the OpenAI request.
    """

    def __init__(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        self._client = _OpenAI(
            *args,
            **kwargs,
        )

        self._proxy = (
            instrument_openai_client(
                self._client,
                context=_infer_stack_context(),
            )
        )

    def __getattr__(
        self,
        name: str,
    ) -> Any:
        return getattr(
            self._proxy,
            name,
        )

    def close(
        self,
    ) -> None:
        close = getattr(
            self._client,
            "close",
            None,
        )

        if callable(close):
            close()

    def __enter__(
        self,
    ) -> "OpenAI":
        enter = getattr(
            self._client,
            "__enter__",
            None,
        )

        if callable(enter):
            enter()

        return self

    def __exit__(
        self,
        exc_type,
        exc,
        traceback,
    ) -> bool:
        exit_method = getattr(
            self._client,
            "__exit__",
            None,
        )

        if callable(exit_method):
            return bool(
                exit_method(
                    exc_type,
                    exc,
                    traceback,
                )
            )

        self.close()
        return False
