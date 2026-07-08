from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass(slots=True)
class BrainEvent:
    """
    Typed event object for anything that changes a student's learning journey.
    """

    event_type: str
    payload: dict[str, Any] = field(default_factory=dict)
    supported: bool = False
    user_id: int | None = None
    study_room_id: int | None = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass(slots=True)
class BrainConcept:
    """
    Canonical learning concept recognized by StudySnap Brain.
    """

    id: str
    name: str
    type: str = "concept"
    confidence: float = 1.0
    source: str = "rule_based"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BrainRelationship:
    """
    Relationship between two Brain concepts.
    """

    source: str
    target: str
    type: str = "related_to"
    confidence: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LearningSignal:
    """
    Structured learning signal produced by the analyzer.
    """

    name: str
    value: Any
    confidence: float = 1.0


@dataclass(slots=True)
class BrainAnalysis:
    """
    Structured analysis object shared across StudySnap Brain.
    """

    subject: str
    document_type: str
    difficulty: str
    confidence: float

    concepts: list[BrainConcept] = field(default_factory=list)
    relationships: list[BrainRelationship] = field(default_factory=list)
    learning_signals: list[LearningSignal] = field(default_factory=list)

    knowledge_graph: dict[str, Any] = field(default_factory=dict)


def build_brain_event_object(
    event_type: str,
    payload: dict | None = None,
    supported: bool = False,
) -> BrainEvent:
    """
    Convert raw event input into a typed BrainEvent object.
    """

    safe_payload = payload or {}

    return BrainEvent(
        event_type=(event_type or "").strip().lower(),
        payload=safe_payload,
        supported=supported,
        user_id=safe_payload.get("user_id"),
        study_room_id=safe_payload.get("study_room_id"),
    )


def build_brain_concepts(
    concepts: list[str],
    source: str = "rule_based",
) -> list[BrainConcept]:
    """
    Convert plain concept names into BrainConcept objects.
    """

    return [
        BrainConcept(
            id=concept.lower().replace(" ", "_").replace("-", "_"),
            name=concept,
            source=source,
        )
        for concept in concepts
    ]


def build_brain_relationships(
    knowledge_graph: dict,
) -> list[BrainRelationship]:
    """
    Convert graph edges into BrainRelationship objects.
    """

    relationships = []

    for edge in knowledge_graph.get("edges", []):
        relationships.append(
            BrainRelationship(
                source=edge["source"],
                target=edge["target"],
                type=edge.get("type", "related_to"),
            )
        )

    return relationships


def build_learning_signals(
    signals: dict,
) -> list[LearningSignal]:
    """
    Convert analyzer learning signals into LearningSignal objects.
    """

    return [
        LearningSignal(
            name=name,
            value=value,
        )
        for name, value in signals.items()
    ]


def build_brain_analysis(
    raw_analysis: dict,
) -> BrainAnalysis:
    """
    Convert analyzer output into a structured BrainAnalysis object.
    """

    return BrainAnalysis(
        subject=raw_analysis.get("subject", "general"),
        document_type=raw_analysis.get("document_type", "unknown"),
        difficulty=raw_analysis.get("difficulty", "unknown"),
        confidence=raw_analysis.get("confidence", 0.0),
        concepts=build_brain_concepts(
            raw_analysis.get("concepts", [])
        ),
        relationships=build_brain_relationships(
            raw_analysis.get("knowledge_graph", {})
        ),
        learning_signals=build_learning_signals(
            raw_analysis.get("learning_signals", {})
        ),
        knowledge_graph=raw_analysis.get("knowledge_graph", {}),
    )


def brain_event_to_dict(event: BrainEvent) -> dict:
    """
    Convert BrainEvent into a JSON-safe dictionary.
    """

    return asdict(event)


def brain_analysis_to_dict(analysis: BrainAnalysis) -> dict:
    """
    Convert BrainAnalysis into a JSON-safe dictionary.
    """

    return asdict(analysis)
