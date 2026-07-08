from sqlalchemy.orm import Session

from app.models.learning_event import LearningEvent
from app.models.user import User
from app.services.brain.search import brain_search
from app.services.brain.pipeline import run_brain_pipeline
from app.services.brain.repository import BrainMemoryRepository
from app.services.brain.intelligence import (
    build_brain_insights,
    brain_insights_to_dict,
)
from app.services.brain.coach import (
    build_brain_coach_decision,
    brain_coach_decision_to_dict,
)
from app.services.brain.context import build_brain_context
from app.services.brain.learning_profile import (
    build_learning_profile,
    learning_profile_to_dict,
)
from app.services.brain.priority import build_brain_priority_result
from app.services.brain.retrieval import retrieve_learning_context


class BrainService:
    """
    Central intelligence layer for StudySnap.
    """

    def __init__(self, db: Session, current_user: User):
        self.db = db
        self.current_user = current_user

    def retrieve(
        self,
        query: str,
        study_room_id: int | None = None,
        limit: int = 8,
    ):
        return retrieve_learning_context(
            db=self.db,
            current_user=self.current_user,
            query=query,
            study_room_id=study_room_id,
            limit=limit,
        )

    def search(self, query: str, limit: int = 12):
        return brain_search(
            db=self.db,
            current_user=self.current_user,
            query=query,
            limit=limit,
        )

    def get_insights(self, study_room_id: int | None = None):
        repository = BrainMemoryRepository(self.db)
        insights = build_brain_insights(
            repository=repository,
            user_id=self.current_user.id,
            study_room_id=study_room_id,
        )

        return brain_insights_to_dict(insights)

    def get_learning_profile(self, study_room_id: int | None = None):
        repository = BrainMemoryRepository(self.db)
        insights = build_brain_insights(
            repository=repository,
            user_id=self.current_user.id,
            study_room_id=study_room_id,
        )
        profile = build_learning_profile(insights=insights)

        return learning_profile_to_dict(profile)

    def get_coach(self, study_room_id: int | None = None):
        repository = BrainMemoryRepository(self.db)
        insights = build_brain_insights(
            repository=repository,
            user_id=self.current_user.id,
            study_room_id=study_room_id,
        )
        profile = build_learning_profile(insights=insights)
        context = build_brain_context(profile=profile)

        priority_result = build_brain_priority_result(
            insights=insights,
            context=context,
        )
        decision = build_brain_coach_decision(
            insights=insights,
            priority_result=priority_result,
        )

        result = brain_coach_decision_to_dict(decision)
        result["learning_profile"] = learning_profile_to_dict(profile)

        return result

    def learn(self, event_type: str, payload: dict):
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
        pipeline_result = run_brain_pipeline(
            event_type="created_project",
            payload={
                "user_id": self.current_user.id,
                "study_room_id": study_room_id,
                "text": text,
            },
            db=self.db,
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
        return {
            "study_room_id": study_room_id,
            "recommendations": [
                "Review one note.",
                "Practice a few flashcards.",
                "Ask AI one hard question.",
            ],
        }

    def summarize(self):
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
