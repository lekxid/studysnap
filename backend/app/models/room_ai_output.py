from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class RoomAIOutput(Base):
    __tablename__ = "room_ai_outputs"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("study_rooms.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    output_type = Column(String, nullable=False, index=True)
    action_type = Column(String, nullable=True, index=True)

    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    content_json = Column(Text, nullable=True)

    source_type = Column(String, nullable=True, index=True)
    source_id = Column(String, nullable=True, index=True)

    linked_note_id = Column(Integer, nullable=True)
    linked_quiz_id = Column(Integer, nullable=True)
    linked_flashcard_ids_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
