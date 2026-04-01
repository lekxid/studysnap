from sqlalchemy import Column, Integer, ForeignKey, DateTime, String
from datetime import datetime
from app.database import Base


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    study_room_id = Column(Integer, ForeignKey("study_rooms.id"))

    activity_type = Column(String)  # note, quiz, flashcard
    duration_minutes = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
