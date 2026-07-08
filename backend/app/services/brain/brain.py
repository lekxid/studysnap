from sqlalchemy.orm import Session

from app.models.learning_event import LearningEvent
from app.models.user import User
from app.services.brain.search import brain_search
from app.services.brain.pipeline import run_brain_pipeline


class BrainService:
    """
    Central intelligence layer for StudySnap.

    Routes should stay thin and ask BrainService for:
    - search
    - learning memory
    - recommendations
    - project analysis
    - course import
    - Smart AI context
    """

    def __init__(self, db: Session, current_user: User):
        self.db = db
        self.current_user = current_user

    def search(self, query: str, limit: int = 12):
        """
        Universal Brain search.
        """
        return brain_search(
            db=self.db,
            current_user=self.current_user,
            query=query,
            limit=limit,
        )

    def learn(self, event_type: str, payload: dict):
        """
        Store learning memory from user activity.

        This reuses LearningEvent as Brain Memory v1.
        """

        event = LearningEvent(
            user_id=self.current_user.id,
            study_room_id=payload.get("study_room_id"),
            activity_type=event_type,
            reference_id=payload.get("reference_id"),
            result=payload.get("result"),
            confidence=payload.get("confidence"),
        )

        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)

        return {
            "saved": True,
            "event": {
                "id": event.id,
                "user_id": event.user_id,
                "study_room_id": event.study_room_id,
                "activity_type": event.activity_type,
                "reference_id": event.reference_id,
                "result": event.result,
                "confidence": event.confidence,
                "created_at": event.created_at,
            },
        }

    def analyze_project(self, study_room_id: int, text: str = ""):
        """
        Analyze learning content for a project.

        Later this will combine:
        - PDFs
        - Notes
        - Flashcards
        - Quizzes
        """

        pipeline_result = run_brain_pipeline(
            event_type="created_project",
            payload={
                "study_room_id": study_room_id,
                "text": text,
            },
        )

        return {
            "study_room_id": study_room_id,
            "pipeline": pipeline_result,
            "analysis": pipeline_result["analysis"],
            "weak_topics": [],
            "strong_topics": [],
            "recommendations": [],
        }

    def recommend(self, study_room_id: int | None = None):
        """
        Generate study recommendations.
        """
        return {
            "study_room_id": study_room_id,
            "recommendations": [
                "Review one note.",
                "Practice a few flashcards.",
                "Ask AI one hard question.",
            ],
        }

    def summarize(self):
        """
        User-level Brain summary.
        """
        total_events = (
            self.db.query(LearningEvent)
            .filter(LearningEvent.user_id == self.current_user.id)
            .count()
        )

        return {
            "user_id": self.current_user.id,
            "total_memory_events": total_events,
            "message": "Brain Memory v1 is active.",
        }


def get_brain(db: Session, current_user: User) -> BrainService:
    return BrainService(db=db, current_user=current_user)
