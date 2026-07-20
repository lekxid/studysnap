from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
)
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.user import (
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.email_service import (
    send_password_reset_email,
    send_welcome_email,
)
from app.utils.auth import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.utils.deps import get_current_user
from app.utils.session_helpers import create_user_session


router = APIRouter(tags=["Authentication"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class MessageResponse(BaseModel):
    message: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_utc_datetime(
    value: datetime,
) -> datetime:
    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def digest_reset_token(token: str) -> str:
    cleaned = token.strip()

    if not cleaned or len(cleaned) > 512:
        raise HTTPException(
            status_code=400,
            detail=(
                "Reset link is invalid or has already "
                "been used."
            ),
        )

    return hashlib.sha256(
        cleaned.encode("utf-8")
    ).hexdigest()


def normalized_email(value: str) -> str:
    return value.strip().lower()


def frontend_url(path: str) -> str:
    return (
        f"{settings.frontend_app_url.rstrip('/')}"
        f"{path}"
    )


def validate_signup_invite(
    invite_code: str | None,
) -> None:
    if not settings.INVITE_ONLY_SIGNUP:
        return

    expected_code = settings.SIGNUP_INVITE_CODE.strip()
    provided_code = (invite_code or "").strip()

    if (
        not expected_code
        or not provided_code
        or not secrets.compare_digest(
            provided_code,
            expected_code,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "A valid private beta invite code "
                "is required."
            ),
        )


@router.post(
    "/signup",
    response_model=UserResponse,
)
def signup(
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    validate_signup_invite(
        user_data.invite_code
    )

    email = normalized_email(
        user_data.email
    )

    existing_user = (
        db.query(User)
        .filter(
            func.lower(User.email) == email
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    if len(user_data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters"
            ),
        )

    new_user = User(
        email=email,
        full_name=user_data.full_name.strip(),
        password_hash=hash_password(
            user_data.password
        ),
        learning_mode=user_data.learning_mode,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    login_url = frontend_url(
        "/login"
        f"?email={quote(email, safe='')}"
        "&welcome=1"
    )

    background_tasks.add_task(
        send_welcome_email,
        recipient=email,
        full_name=new_user.full_name,
        login_url=login_url,
    )

    return new_user


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    user_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    email = normalized_email(
        user_data.email
    )

    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == email
        )
        .first()
    )

    if (
        not user
        or not verify_password(
            user_data.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    session = create_user_session(
        db=db,
        request=request,
        user_id=user.id,
    )

    access_token = create_access_token(
        {
            "sub": user.email,
            "user_id": user.id,
            "full_name": user.full_name,
            "session_id": session.id,
            "session_token": session.session_token,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "session_id": session.id,
    }


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = normalized_email(
        payload.email
    )

    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == email
        )
        .first()
    )

    generic_message = (
        "If an account with that email exists, "
        "a secure password-reset link has been sent."
    )

    if not user:
        return {
            "message": generic_message,
        }

    now = utc_now()

    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id
            == user.id,
            PasswordResetToken.used_at.is_(
                None
            ),
        )
        .update(
            {
                PasswordResetToken.used_at: now,
            },
            synchronize_session=False,
        )
    )

    raw_token = secrets.token_urlsafe(48)

    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=digest_reset_token(
            raw_token
        ),
        expires_at=(
            now
            + timedelta(
                minutes=(
                    settings
                    .password_reset_expire_minutes
                )
            )
        ),
    )

    db.add(reset_token)
    db.commit()

    reset_url = frontend_url(
        "/reset-password"
        f"?token={quote(raw_token, safe='')}"
        f"&email={quote(email, safe='')}"
    )

    background_tasks.add_task(
        send_password_reset_email,
        recipient=email,
        full_name=user.full_name,
        reset_url=reset_url,
        expires_in_minutes=(
            settings.password_reset_expire_minutes
        ),
    )

    return {
        "message": generic_message,
    }


@router.post(
    "/reset-password",
    response_model=MessageResponse,
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters."
            ),
        )

    if len(payload.password) > 128:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must not exceed "
                "128 characters."
            ),
        )

    token_hash = digest_reset_token(
        payload.token
    )

    reset_token = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash
            == token_hash,
            PasswordResetToken.used_at.is_(
                None
            ),
        )
        .first()
    )

    if not reset_token:
        raise HTTPException(
            status_code=400,
            detail=(
                "Reset link is invalid or has "
                "already been used."
            ),
        )

    now = utc_now()

    if (
        normalize_utc_datetime(
            reset_token.expires_at
        )
        <= now
    ):
        reset_token.used_at = now
        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "This reset link has expired. "
                "Request a new one."
            ),
        )

    user = (
        db.query(User)
        .filter(
            User.id
            == reset_token.user_id
        )
        .first()
    )

    if not user:
        reset_token.used_at = now
        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "Reset link is invalid or has "
                "already been used."
            ),
        )

    user.password_hash = hash_password(
        payload.password
    )

    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id
            == user.id,
            PasswordResetToken.used_at.is_(
                None
            ),
        )
        .update(
            {
                PasswordResetToken.used_at: now,
            },
            synchronize_session=False,
        )
    )

    session_time = now.replace(
        tzinfo=None
    )

    (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(
                None
            ),
        )
        .update(
            {
                UserSession.revoked_at:
                    session_time,
            },
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "message": (
            "Your password has been changed. "
            "Sign in with your new password."
        ),
    }


@router.get(
    "/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(
        get_current_user
    ),
):
    return current_user
