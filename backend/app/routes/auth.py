import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.utils.auth import hash_password, verify_password, create_access_token
from app.utils.deps import get_current_user
from app.utils.session_helpers import create_user_session

router = APIRouter(tags=["Authentication"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MessageResponse(BaseModel):
    message: str


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


@router.post("/signup", response_model=UserResponse)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    validate_signup_invite(user_data.invite_code)

    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(user_data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=hash_password(user_data.password),
        learning_mode=user_data.learning_mode,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=TokenResponse)
def login(
    user_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session = create_user_session(db=db, request=request, user_id=user.id)

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


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # For now, do not reveal whether the email exists.
    # This keeps the UI working safely until real email delivery is added.
    if user:
        return {
            "message": "If an account with that email exists, a reset link has been sent."
        }

    return {
        "message": "If an account with that email exists, a reset link has been sent."
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
