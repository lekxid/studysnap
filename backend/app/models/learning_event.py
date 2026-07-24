from sqlalchemy import Column, Integer, ForeignKey, DateTime, String
from datetime import datetime
from app.database import Base
from app.utils.utc import utc_now_naive


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    study_room_id = Column(Integer, ForeignKey("study_rooms.id"), nullable=True)

    activity_type = Column(String, nullable=False)  # flashcard, quiz, note, ai
    reference_id = Column(Integer, nullable=True)

    result = Column(String, nullable=True)  # correct, wrong, partial, reviewed
    confidence = Column(Integer, nullable=True)  # 0-100

    created_at = Column(DateTime, default=utc_now_naive)
