from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.user_session import SessionMessageResponse, UserSessionResponse
from app.utils.deps import get_current_user, oauth2_scheme

router = APIRouter(tags=["Sessions"])


def get_token_payload(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


def serialize_session(
    session: UserSession,
    current_session_id: int | None,
) -> UserSessionResponse:
    return UserSessionResponse(
        id=session.id,
        device_name=session.device_name,
        browser=session.browser,
        operating_system=session.operating_system,
        ip_address=session.ip_address,
        is_trusted=session.is_trusted,
        is_current=session.id == current_session_id,
        created_at=session.created_at,
        last_active_at=session.last_active_at,
        revoked_at=session.revoked_at,
    )


@router.get("", response_model=list[UserSessionResponse])
def list_my_sessions(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = get_token_payload(token)
    current_session_id = payload.get("session_id")

    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id)
        .order_by(UserSession.last_active_at.desc())
        .all()
    )

    return [
        serialize_session(session, current_session_id)
        for session in sessions
    ]


@router.delete("/{session_id}", response_model=SessionMessageResponse)
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(UserSession)
        .filter(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.revoked_at is None:
        session.revoked_at = datetime.utcnow()
        db.add(session)
        db.commit()

    return {"message": "Session signed out."}


@router.post("/logout-all", response_model=SessionMessageResponse)
def revoke_all_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
        )
        .all()
    )

    for session in sessions:
        session.revoked_at = datetime.utcnow()
        db.add(session)

    db.commit()

    return {"message": "All devices signed out."}
