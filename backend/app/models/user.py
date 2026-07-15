from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    learning_mode = Column(String, default="clear")
    avatar_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def avatar_url(self):
        if not self.avatar_path:
            return None

        return "/api/users/me/avatar"
