import pytest
from fastapi import HTTPException

from app.config import settings
from app.routes.auth import validate_signup_invite


def test_invite_check_is_disabled_by_default(
    monkeypatch,
):
    monkeypatch.setattr(
        settings,
        "INVITE_ONLY_SIGNUP",
        False,
    )
    monkeypatch.setattr(
        settings,
        "SIGNUP_INVITE_CODE",
        "",
    )

    validate_signup_invite(None)


def test_valid_invite_code_is_accepted(
    monkeypatch,
):
    monkeypatch.setattr(
        settings,
        "INVITE_ONLY_SIGNUP",
        True,
    )
    monkeypatch.setattr(
        settings,
        "SIGNUP_INVITE_CODE",
        "StudySnapBeta2026",
    )

    validate_signup_invite("StudySnapBeta2026")


@pytest.mark.parametrize(
    "provided_code",
    [
        None,
        "",
        "wrong-code",
        "studysnapbeta2026",
    ],
)
def test_missing_or_invalid_invite_code_is_rejected(
    monkeypatch,
    provided_code,
):
    monkeypatch.setattr(
        settings,
        "INVITE_ONLY_SIGNUP",
        True,
    )
    monkeypatch.setattr(
        settings,
        "SIGNUP_INVITE_CODE",
        "StudySnapBeta2026",
    )

    with pytest.raises(HTTPException) as error:
        validate_signup_invite(provided_code)

    assert error.value.status_code == 403
    assert "invite code" in error.value.detail.lower()
