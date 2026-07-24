from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.utc import utc_now_naive


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
        index=True,
    )

    learning_mode = Column(String, default="Clear Explain", nullable=False)
    knowledge_level = Column(String, default="Medium", nullable=False)
    progress_sharing = Column(String, default="Private", nullable=False)
    favorite_subject = Column(String, default="", nullable=False)
    selected_subjects = Column(JSON, default=list, nullable=False)
    daily_goal = Column(String, default="Review 10 flashcards", nullable=False)
    notifications = Column(String, default="Important only", nullable=False)

    theme = Column(String, default="dark", nullable=False)

    ai_memory_enabled = Column(Boolean, default=True, nullable=False)
    save_notes_to_memory = Column(Boolean, default=True, nullable=False)
    save_flashcards_to_memory = Column(Boolean, default=True, nullable=False)
    save_quiz_results_to_memory = Column(Boolean, default=True, nullable=False)
    save_weak_strong_concepts = Column(Boolean, default=True, nullable=False)
    save_study_history = Column(Boolean, default=True, nullable=False)

    connected_apps = Column(JSON, default=dict, nullable=False)
    auto_import_rules = Column(JSON, default=dict, nullable=False)

    last_opened_subject = Column(String, nullable=True)
    last_opened_pdf_id = Column(Integer, nullable=True)
    last_ai_conversation_id = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=utc_now_naive, nullable=False)
    updated_at = Column(
        DateTime,
        default=utc_now_naive,
        onupdate=utc_now_naive,
        nullable=False,
    )

    user = relationship("User")
