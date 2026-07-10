from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class ConnectedAccount(Base):
    __tablename__ = "connected_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    provider = Column(String, nullable=False, index=True)
    account_email = Column(String, nullable=True)

    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_type = Column(String, nullable=True)
    scopes = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    connected_at = Column(DateTime(timezone=True), server_default=func.now())
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_connected_accounts_user_provider"),
    )
