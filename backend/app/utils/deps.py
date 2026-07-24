from datetime import datetime

from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.user_session import UserSession
from app.utils.utc import utc_now_naive

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        user_id = payload.get("user_id")
        email = payload.get("sub")
        session_id = payload.get("session_id")
        session_token = payload.get("session_token")

        user = None

        if user_id is not None:
            user = db.query(User).filter(User.id == int(user_id)).first()

        if user is None and email:
            user = db.query(User).filter(User.email == email).first()

        if user is None:
            raise credentials_exception

        if session_id is not None and session_token:
            user_session = (
                db.query(UserSession)
                .filter(
                    UserSession.id == int(session_id),
                    UserSession.user_id == user.id,
                    UserSession.session_token == session_token,
                    UserSession.revoked_at.is_(None),
                )
                .first()
            )

            if user_session is None:
                raise credentials_exception

            user_session.last_active_at = utc_now_naive()
            db.add(user_session)
            db.commit()

        return user

    except (JWTError, ValueError):
        raise credentials_exception
