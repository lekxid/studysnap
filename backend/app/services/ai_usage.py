from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import os
import re
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.ai_usage_event import AIUsageEvent


PRICING_VERSION = "openai-2026-07-26"

_MICRO_USD_PER_USD = Decimal("1000000")
_ZERO = Decimal("0")

_TEXT_PRICING_USD_PER_MILLION = {
    "gpt-4.1-mini": {
        "input": Decimal("0.40"),
        "cached_input": Decimal("0.10"),
        "output": Decimal("1.60"),
    },
    "gpt-4o-mini": {
        "input": Decimal("0.15"),
        "cached_input": Decimal("0.075"),
        "output": Decimal("0.60"),
    },
}

_IMAGE_PRICE_USD_PER_IMAGE = {
    "gpt-image-1": {
        ("low", "1024x1024"): Decimal("0.011"),
        ("low", "1024x1536"): Decimal("0.016"),
        ("low", "1536x1024"): Decimal("0.016"),
        ("medium", "1024x1024"): Decimal("0.042"),
        ("medium", "1024x1536"): Decimal("0.063"),
        ("medium", "1536x1024"): Decimal("0.063"),
        ("high", "1024x1024"): Decimal("0.167"),
        ("high", "1024x1536"): Decimal("0.25"),
        ("high", "1536x1024"): Decimal("0.25"),
    },
    "gpt-image-1.5": {
        ("low", "1024x1024"): Decimal("0.009"),
        ("low", "1024x1536"): Decimal("0.013"),
        ("low", "1536x1024"): Decimal("0.013"),
        ("medium", "1024x1024"): Decimal("0.034"),
        ("medium", "1024x1536"): Decimal("0.05"),
        ("medium", "1536x1024"): Decimal("0.05"),
        ("high", "1024x1024"): Decimal("0.133"),
        ("high", "1024x1536"): Decimal("0.20"),
        ("high", "1536x1024"): Decimal("0.20"),
    },
    "gpt-image-1-mini": {
        ("low", "1024x1024"): Decimal("0.005"),
        ("low", "1024x1536"): Decimal("0.006"),
        ("low", "1536x1024"): Decimal("0.006"),
        ("medium", "1024x1024"): Decimal("0.011"),
        ("medium", "1024x1536"): Decimal("0.015"),
        ("medium", "1536x1024"): Decimal("0.015"),
        ("high", "1024x1024"): Decimal("0.036"),
        ("high", "1024x1536"): Decimal("0.052"),
        ("high", "1536x1024"): Decimal("0.052"),
    },
}

_SAFE_LABEL = re.compile(
    r"[^a-zA-Z0-9_.:/\-]+"
)


def _safe_label(
    value: Any,
    *,
    fallback: str,
    limit: int,
) -> str:
    cleaned = _SAFE_LABEL.sub(
        "_",
        str(value or "").strip(),
    ).strip("._:/-")

    return (
        cleaned[:limit]
        if cleaned
        else fallback
    )


def _nonnegative_int(
    value: Any,
) -> int:
    try:
        return max(
            0,
            int(value or 0),
        )
    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return 0


def _read(
    value: Any,
    key: str,
) -> Any:
    if value is None:
        return None

    if isinstance(value, dict):
        return value.get(key)

    return getattr(
        value,
        key,
        None,
    )


def _first_present(
    value: Any,
    *keys: str,
) -> Any:
    for key in keys:
        candidate = _read(
            value,
            key,
        )

        if candidate is not None:
            return candidate

    return None


def extract_openai_usage(
    response: Any,
) -> dict[str, int]:
    usage = _read(
        response,
        "usage",
    )

    input_tokens = _nonnegative_int(
        _first_present(
            usage,
            "input_tokens",
            "prompt_tokens",
        )
    )

    output_tokens = _nonnegative_int(
        _first_present(
            usage,
            "output_tokens",
            "completion_tokens",
        )
    )

    details = _first_present(
        usage,
        "input_tokens_details",
        "prompt_tokens_details",
    )

    cached_input_tokens = min(
        input_tokens,
        _nonnegative_int(
            _read(
                details,
                "cached_tokens",
            )
        ),
    )

    reported_total = _nonnegative_int(
        _read(
            usage,
            "total_tokens",
        )
    )

    total_tokens = max(
        reported_total,
        input_tokens + output_tokens,
    )

    return {
        "input_tokens": input_tokens,
        "cached_input_tokens":
            cached_input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _canonical_model(
    model: str | None,
    known_models: set[str],
) -> str | None:
    normalized = (
        model or ""
    ).strip().lower()

    if normalized in known_models:
        return normalized

    for candidate in sorted(
        known_models,
        key=len,
        reverse=True,
    ):
        if normalized.startswith(
            candidate + "-"
        ):
            return candidate

    return None


def _rounded_microusd(
    value: Decimal,
) -> int:
    return int(
        value.quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


def estimate_text_cost_microusd(
    *,
    model: str | None,
    input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
) -> tuple[int, bool]:
    canonical = _canonical_model(
        model,
        set(
            _TEXT_PRICING_USD_PER_MILLION
        ),
    )

    if canonical is None:
        return 0, False

    prices = (
        _TEXT_PRICING_USD_PER_MILLION[
            canonical
        ]
    )

    safe_input = _nonnegative_int(
        input_tokens
    )

    safe_cached = min(
        safe_input,
        _nonnegative_int(
            cached_input_tokens
        ),
    )

    safe_output = _nonnegative_int(
        output_tokens
    )

    uncached_input = (
        safe_input - safe_cached
    )

    # Prices are USD per 1M tokens. Multiplying
    # token count by that rate directly yields
    # micro-USD.
    microusd = (
        Decimal(uncached_input)
        * prices["input"]
        + Decimal(safe_cached)
        * prices["cached_input"]
        + Decimal(safe_output)
        * prices["output"]
    )

    return (
        _rounded_microusd(
            microusd
        ),
        True,
    )


def estimate_image_cost_microusd(
    *,
    model: str | None,
    quality: str | None,
    size: str | None,
    image_count: int = 1,
) -> tuple[int, bool]:
    canonical = _canonical_model(
        model,
        set(
            _IMAGE_PRICE_USD_PER_IMAGE
        ),
    )

    if canonical is None:
        return 0, False

    key = (
        (quality or "").strip().lower(),
        (size or "").strip().lower(),
    )

    unit_price = (
        _IMAGE_PRICE_USD_PER_IMAGE[
            canonical
        ].get(key)
    )

    if unit_price is None:
        return 0, False

    count = max(
        1,
        min(
            _nonnegative_int(
                image_count
            ),
            100,
        ),
    )

    microusd = (
        unit_price
        * Decimal(count)
        * _MICRO_USD_PER_USD
    )

    return (
        _rounded_microusd(
            microusd
        ),
        True,
    )


def record_ai_usage_event(
    *,
    db: Session,
    user_id: int | None,
    feature: str,
    operation: str,
    model: str | None,
    response: Any = None,
    room_id: int | None = None,
    status: str = "success",
    latency_ms: int = 0,
    image_count: int = 0,
    fixed_cost_microusd: int | None = None,
    error_type: str | None = None,
) -> AIUsageEvent:
    usage = extract_openai_usage(
        response
    )

    if fixed_cost_microusd is None:
        estimated_cost, priced = (
            estimate_text_cost_microusd(
                model=model,
                input_tokens=usage[
                    "input_tokens"
                ],
                cached_input_tokens=usage[
                    "cached_input_tokens"
                ],
                output_tokens=usage[
                    "output_tokens"
                ],
            )
        )
    else:
        estimated_cost = max(
            0,
            int(
                fixed_cost_microusd
                or 0
            ),
        )
        priced = True

    normalized_status = (
        "success"
        if status == "success"
        else "error"
    )

    event = AIUsageEvent(
        user_id=(
            user_id
            if isinstance(
                user_id,
                int,
            )
            and user_id > 0
            else None
        ),
        room_id=(
            room_id
            if isinstance(
                room_id,
                int,
            )
            and room_id > 0
            else None
        ),
        provider="openai",
        feature=_safe_label(
            feature,
            fallback="unknown",
            limit=64,
        ),
        operation=_safe_label(
            operation,
            fallback="unknown",
            limit=40,
        ),
        model=_safe_label(
            model,
            fallback="unknown",
            limit=120,
        ),
        status=normalized_status,
        input_tokens=usage[
            "input_tokens"
        ],
        cached_input_tokens=usage[
            "cached_input_tokens"
        ],
        output_tokens=usage[
            "output_tokens"
        ],
        total_tokens=usage[
            "total_tokens"
        ],
        image_count=max(
            0,
            min(
                _nonnegative_int(
                    image_count
                ),
                100,
            ),
        ),
        latency_ms=max(
            0,
            min(
                _nonnegative_int(
                    latency_ms
                ),
                86_400_000,
            ),
        ),
        estimated_cost_microusd=(
            estimated_cost
        ),
        priced=priced,
        pricing_version=(
            PRICING_VERSION
        ),
        error_type=(
            _safe_label(
                error_type,
                fallback="error",
                limit=80,
            )
            if normalized_status
            == "error"
            else None
        ),
    )

    db.add(event)
    db.flush()

    return event


def persist_ai_usage_event(
    **kwargs: Any,
) -> AIUsageEvent | None:
    db = SessionLocal()

    try:
        event = record_ai_usage_event(
            db=db,
            **kwargs,
        )

        db.commit()
        db.refresh(event)

        return event
    except Exception:
        db.rollback()

        # Analytics must never interrupt an
        # AI answer or a student's work.
        return None
    finally:
        db.close()


def _decimal_environment(
    name: str,
) -> Decimal:
    raw = (
        os.getenv(name)
        or ""
    ).strip()

    if not raw:
        return _ZERO

    try:
        value = Decimal(raw)
    except InvalidOperation:
        return _ZERO

    return max(
        _ZERO,
        value,
    )


def _usd(
    microusd: int,
) -> float:
    return float(
        Decimal(
            max(
                0,
                int(
                    microusd or 0
                ),
            )
        )
        / _MICRO_USD_PER_USD
    )


def _percentile_95(
    values: list[int],
) -> int:
    if not values:
        return 0

    ordered = sorted(values)
    index = max(
        0,
        min(
            len(ordered) - 1,
            int(
                round(
                    0.95
                    * (len(ordered) - 1)
                )
            ),
        ),
    )

    return ordered[index]


def build_ai_usage_summary(
    *,
    db: Session,
    included_user_ids: set[int],
    window_start: datetime,
    now: datetime,
) -> dict[str, Any]:
    user_filter = (
        or_(
            AIUsageEvent.user_id.is_(None),
            AIUsageEvent.user_id.in_(
                included_user_ids
            ),
        )
        if included_user_ids
        else AIUsageEvent.user_id.is_(None)
    )

    events = (
        db.query(AIUsageEvent)
        .filter(
            user_filter,
            AIUsageEvent.occurred_at
            >= window_start,
        )
        .order_by(
            AIUsageEvent.occurred_at.asc()
        )
        .all()
    )

    month_start = datetime(
        now.year,
        now.month,
        1,
        tzinfo=timezone.utc,
    )

    month_events = (
        db.query(AIUsageEvent)
        .filter(
            user_filter,
            AIUsageEvent.occurred_at
            >= month_start,
        )
        .all()
    )

    requests = len(events)

    failures = sum(
        1
        for event in events
        if event.status != "success"
    )

    input_tokens = sum(
        int(
            event.input_tokens or 0
        )
        for event in events
    )

    cached_input_tokens = sum(
        int(
            event.cached_input_tokens
            or 0
        )
        for event in events
    )

    output_tokens = sum(
        int(
            event.output_tokens or 0
        )
        for event in events
    )

    total_tokens = sum(
        int(
            event.total_tokens or 0
        )
        for event in events
    )

    cost_microusd = sum(
        int(
            event.estimated_cost_microusd
            or 0
        )
        for event in events
    )

    monthly_cost_microusd = sum(
        int(
            event.estimated_cost_microusd
            or 0
        )
        for event in month_events
    )

    latencies = [
        int(
            event.latency_ms or 0
        )
        for event in events
        if int(
            event.latency_ms or 0
        ) > 0
    ]

    unpriced_requests = sum(
        1
        for event in events
        if not event.priced
    )

    model_rows: dict[
        str,
        dict[str, int],
    ] = defaultdict(
        lambda: {
            "requests": 0,
            "failures": 0,
            "tokens": 0,
            "cost_microusd": 0,
            "latency_total": 0,
            "latency_count": 0,
        }
    )

    feature_rows: dict[
        str,
        dict[str, int],
    ] = defaultdict(
        lambda: {
            "requests": 0,
            "failures": 0,
            "tokens": 0,
            "cost_microusd": 0,
        }
    )

    for event in events:
        model_row = model_rows[
            event.model or "unknown"
        ]

        feature_row = feature_rows[
            event.feature or "unknown"
        ]

        for row in (
            model_row,
            feature_row,
        ):
            row["requests"] += 1
            row["tokens"] += int(
                event.total_tokens or 0
            )
            row["cost_microusd"] += int(
                event.estimated_cost_microusd
                or 0
            )

            if event.status != "success":
                row["failures"] += 1

        latency = int(
            event.latency_ms or 0
        )

        if latency > 0:
            model_row[
                "latency_total"
            ] += latency
            model_row[
                "latency_count"
            ] += 1

    by_model = [
        {
            "model": model,
            "requests": row[
                "requests"
            ],
            "failures": row[
                "failures"
            ],
            "tokens": row[
                "tokens"
            ],
            "estimated_cost_usd":
                _usd(
                    row[
                        "cost_microusd"
                    ]
                ),
            "average_latency_ms": (
                round(
                    row[
                        "latency_total"
                    ]
                    / row[
                        "latency_count"
                    ]
                )
                if row[
                    "latency_count"
                ]
                else 0
            ),
        }
        for model, row
        in sorted(
            model_rows.items(),
            key=lambda item: (
                -item[1]["requests"],
                item[0],
            ),
        )
    ]

    by_feature = [
        {
            "feature": feature,
            "requests": row[
                "requests"
            ],
            "failures": row[
                "failures"
            ],
            "tokens": row[
                "tokens"
            ],
            "estimated_cost_usd":
                _usd(
                    row[
                        "cost_microusd"
                    ]
                ),
        }
        for feature, row
        in sorted(
            feature_rows.items(),
            key=lambda item: (
                -item[1]["requests"],
                item[0],
            ),
        )
    ]

    budget = _decimal_environment(
        "STUDYSNAP_AI_MONTHLY_BUDGET_USD"
    )

    monthly_cost = (
        Decimal(
            monthly_cost_microusd
        )
        / _MICRO_USD_PER_USD
    )

    budget_percent = (
        float(
            (
                monthly_cost
                / budget
                * Decimal("100")
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
        )
        if budget > 0
        else 0.0
    )

    if budget <= 0:
        budget_status = "not_configured"
    elif budget_percent >= 100:
        budget_status = "exceeded"
    elif budget_percent >= 80:
        budget_status = "warning"
    else:
        budget_status = "ok"

    return {
        "pricing_version":
            PRICING_VERSION,
        "requests": requests,
        "successful_requests":
            requests - failures,
        "failed_requests": failures,
        "unpriced_requests":
            unpriced_requests,
        "input_tokens": input_tokens,
        "cached_input_tokens":
            cached_input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd":
            _usd(
                cost_microusd
            ),
        "monthly_estimated_cost_usd":
            _usd(
                monthly_cost_microusd
            ),
        "average_latency_ms": (
            round(
                sum(latencies)
                / len(latencies)
            )
            if latencies
            else 0
        ),
        "p95_latency_ms":
            _percentile_95(
                latencies
            ),
        "monthly_budget_usd":
            float(budget),
        "monthly_budget_used_percent":
            budget_percent,
        "budget_status":
            budget_status,
        "by_model": by_model,
        "by_feature": by_feature,
    }
