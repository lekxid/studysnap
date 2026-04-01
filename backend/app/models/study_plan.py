from sqlalchemy import Column, Integer, ForeignKey, String, DateTime
from datetime import datetime
from app.database import Base


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    title = Column(String)
    description = Column(String)
    scheduled_for = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
