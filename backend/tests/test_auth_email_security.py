from datetime import datetime, timezone

from app.routes.auth import (
    digest_reset_token,
    normalize_utc_datetime,
)
from app.services.email_service import (
    build_password_reset_email,
    build_welcome_email,
)


def test_reset_token_is_hashed() -> None:
    raw_token = "private-reset-token"

    digest = digest_reset_token(
        raw_token
    )

    assert digest != raw_token
    assert len(digest) == 64
    assert digest == digest_reset_token(
        raw_token
    )


def test_reset_datetime_normalizes_naive_and_aware() -> None:
    naive = datetime(
        2026,
        7,
        20,
        12,
        0,
    )

    aware = datetime(
        2026,
        7,
        20,
        12,
        0,
        tzinfo=timezone.utc,
    )

    assert (
        normalize_utc_datetime(
            naive
        )
        == aware
    )

    assert (
        normalize_utc_datetime(
            aware
        )
        == aware
    )


def test_welcome_email_contains_product_instructions() -> None:
    subject, plain_text, html_text = (
        build_welcome_email(
            full_name="Test Student",
            login_url=(
                "https://example.com/"
                "login?email=test%40example.com"
            ),
        )
    )

    assert "Welcome to StudySnap" in subject
    assert "Create a Study Room" in plain_text
    assert "AI Tutor" in plain_text
    assert "Flashcards and quizzes" in plain_text
    assert "Study Together" in plain_text
    assert "Open StudySnap" in html_text


def test_reset_email_explains_expiry_and_single_use() -> None:
    _, plain_text, html_text = (
        build_password_reset_email(
            full_name="Test Student",
            reset_url=(
                "https://example.com/"
                "reset-password?token=example"
            ),
            expires_in_minutes=30,
        )
    )

    assert "expires in 30 minutes" in plain_text
    assert "only be used once" in plain_text
    assert "Choose a new password" in html_text
