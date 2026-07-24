from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.utc import utc_now_naive


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    session_token = Column(String, unique=True, index=True, nullable=False)

    device_name = Column(String, default="Unknown device", nullable=False)
    browser = Column(String, default="Unknown browser", nullable=False)
    operating_system = Column(String, default="Unknown OS", nullable=False)

    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)

    is_trusted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=utc_now_naive, nullable=False)
    last_active_at = Column(DateTime, default=utc_now_naive, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User")
