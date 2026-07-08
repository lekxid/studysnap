from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.brain_memory import BrainMemory


def calculate_mastery_score(
    current_mastery: float,
    incoming_confidence: float,
    seen_count: int,
) -> float:
    """
    Blend previous mastery with new confidence.

    Early learning changes faster. Later learning becomes more stable.
    """

    current_mastery = current_mastery or 0.0
    incoming_confidence = incoming_confidence or 0.0

    if seen_count <= 1:
        weight = 0.65
    elif seen_count <= 3:
        weight = 0.45
    else:
        weight = 0.25

    mastery = (current_mastery * (1 - weight)) + (incoming_confidence * weight)

    return round(max(0.0, min(mastery, 1.0)), 2)


def memory_strength_label(mastery_score: float) -> str:
    if mastery_score >= 0.8:
        return "strong"

    if mastery_score >= 0.55:
        return "developing"

    return "weak"


class BrainMemoryRepository:
    """
    Persistence layer for StudySnap Brain.

    The Brain pipeline should never manipulate SQLAlchemy models directly.
    All database access goes through this repository.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_memory(
        self,
        user_id: int,
        study_room_id: int | None,
        concept_id: str,
    ) -> BrainMemory | None:
        return (
            self.db.query(BrainMemory)
            .filter(
                BrainMemory.user_id == user_id,
                BrainMemory.study_room_id == study_room_id,
                BrainMemory.concept_id == concept_id,
            )
            .first()
        )

    def save(self, memory: BrainMemory) -> BrainMemory:
        self.db.add(memory)
        self.db.commit()
        self.db.refresh(memory)
        return memory

    def upsert_memory(
        self,
        user_id: int,
        study_room_id: int | None,
        concept_memory: dict,
    ) -> BrainMemory:
        concept_id = concept_memory.get("concept_id")
        if not concept_id:
            raise ValueError("concept_memory must include concept_id")

        now = datetime.utcnow()
        incoming_confidence = float(concept_memory.get("confidence") or 0.0)

        memory = self.get_memory(
            user_id=user_id,
            study_room_id=study_room_id,
            concept_id=concept_id,
        )

        if memory is None:
            mastery_score = calculate_mastery_score(
                current_mastery=0.0,
                incoming_confidence=incoming_confidence,
                seen_count=1,
            )

            memory = BrainMemory(
                user_id=user_id,
                study_room_id=study_room_id,
                concept_id=concept_id,
                concept_name=concept_memory.get("name") or concept_id,
                concept_type=concept_memory.get("type") or "concept",
                confidence=incoming_confidence,
                mastery_score=mastery_score,
                strength=memory_strength_label(mastery_score),
                seen_count=1,
                review_count=0,
                source=concept_memory.get("source"),
                needs_review=mastery_score < 0.65,
                last_seen=now,
            )

            self.db.add(memory)
        else:
            next_seen_count = (memory.seen_count or 0) + 1
            mastery_score = calculate_mastery_score(
                current_mastery=memory.mastery_score or 0.0,
                incoming_confidence=incoming_confidence,
                seen_count=next_seen_count,
            )

            memory.concept_name = concept_memory.get("name") or memory.concept_name
            memory.concept_type = concept_memory.get("type") or memory.concept_type
            memory.confidence = incoming_confidence
            memory.mastery_score = mastery_score
            memory.strength = memory_strength_label(mastery_score)
            memory.seen_count = next_seen_count
            memory.source = concept_memory.get("source") or memory.source
            memory.needs_review = mastery_score < 0.65
            memory.last_seen = now

        self.db.commit()
        self.db.refresh(memory)

        return memory

    def upsert_memory_snapshot(
        self,
        memory_snapshot: dict,
    ) -> list[BrainMemory]:
        user_id = memory_snapshot.get("user_id")
        if not user_id:
            return []

        study_room_id = memory_snapshot.get("study_room_id")
        concept_memories = memory_snapshot.get("concepts", [])

        saved_memories = []

        for concept_memory in concept_memories:
            saved_memories.append(
                self.upsert_memory(
                    user_id=user_id,
                    study_room_id=study_room_id,
                    concept_memory=concept_memory,
                )
            )

        return saved_memories

    def mark_reviewed(
        self,
        user_id: int,
        study_room_id: int | None,
        concept_id: str,
    ) -> BrainMemory | None:
        memory = self.get_memory(
            user_id=user_id,
            study_room_id=study_room_id,
            concept_id=concept_id,
        )

        if memory is None:
            return None

        memory.review_count = (memory.review_count or 0) + 1
        memory.last_reviewed = datetime.utcnow()
        memory.needs_review = False

        self.db.commit()
        self.db.refresh(memory)

        return memory

    def list_for_user(
        self,
        user_id: int,
    ) -> list[BrainMemory]:
        return (
            self.db.query(BrainMemory)
            .filter(BrainMemory.user_id == user_id)
            .all()
        )
