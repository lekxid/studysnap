from types import SimpleNamespace

from app.models.ai_usage_event import (
    AIUsageEvent,
)
from app.services.ai_usage import (
    PRICING_VERSION,
    estimate_image_cost_microusd,
    estimate_text_cost_microusd,
    extract_openai_usage,
)


def test_extracts_responses_api_usage():
    response = SimpleNamespace(
        usage=SimpleNamespace(
            input_tokens=1200,
            output_tokens=300,
            total_tokens=1500,
            input_tokens_details=(
                SimpleNamespace(
                    cached_tokens=200
                )
            ),
        )
    )

    assert extract_openai_usage(
        response
    ) == {
        "input_tokens": 1200,
        "cached_input_tokens": 200,
        "output_tokens": 300,
        "total_tokens": 1500,
    }


def test_extracts_chat_completion_usage():
    response = SimpleNamespace(
        usage=SimpleNamespace(
            prompt_tokens=500,
            completion_tokens=125,
            total_tokens=625,
            prompt_tokens_details=(
                SimpleNamespace(
                    cached_tokens=100
                )
            ),
        )
    )

    assert extract_openai_usage(
        response
    ) == {
        "input_tokens": 500,
        "cached_input_tokens": 100,
        "output_tokens": 125,
        "total_tokens": 625,
    }


def test_estimates_verified_text_prices():
    cost, priced = (
        estimate_text_cost_microusd(
            model="gpt-4.1-mini",
            input_tokens=1_000_000,
            cached_input_tokens=0,
            output_tokens=1_000_000,
        )
    )

    assert priced is True
    assert cost == 2_000_000

    mini_cost, mini_priced = (
        estimate_text_cost_microusd(
            model="gpt-4o-mini",
            input_tokens=1_000_000,
            cached_input_tokens=0,
            output_tokens=1_000_000,
        )
    )

    assert mini_priced is True
    assert mini_cost == 750_000


def test_unknown_models_are_not_guessed():
    cost, priced = (
        estimate_text_cost_microusd(
            model="unknown-model",
            input_tokens=1_000_000,
            cached_input_tokens=0,
            output_tokens=1_000_000,
        )
    )

    assert cost == 0
    assert priced is False


def test_estimates_verified_image_price():
    cost, priced = (
        estimate_image_cost_microusd(
            model="gpt-image-1",
            quality="low",
            size="1024x1024",
            image_count=2,
        )
    )

    assert priced is True
    assert cost == 22_000


def test_usage_table_is_privacy_safe():
    columns = {
        column.name
        for column in (
            AIUsageEvent.__table__.columns
        )
    }

    forbidden = {
        "prompt",
        "question",
        "answer",
        "content",
        "message",
        "filename",
        "file_path",
    }

    assert not (
        columns & forbidden
    )

    assert (
        PRICING_VERSION
        == "openai-2026-07-26"
    )
