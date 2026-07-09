from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.brain_answer_history import BrainAnswerHistory
from app.models.note import Note
from app.models.study_room import StudyRoom
from app.models.user import User


def _safe_json_dumps(value: Any, fallback: str) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return fallback


def _safe_json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback

    try:
        return json.loads(value)
    except Exception:
        return fallback


def brain_history_to_dict(item: BrainAnswerHistory) -> dict[str, Any]:
    return {
        "id": item.id,
        "question": item.question,
        "answer": item.answer,
        "sources": _safe_json_loads(item.sources_json, []),
        "metadata": _safe_json_loads(item.metadata_json, {}),
        "study_room_id": item.study_room_id,
        "owner_id": item.owner_id,
        "created_at": item.created_at,
    }


def save_brain_answer_history(
    *,
    db: Session,
    current_user: User,
    question: str,
    answer: str,
    sources: list[dict[str, Any]],
    metadata: dict[str, Any],
    study_room_id: int | None,
) -> BrainAnswerHistory:
    item = BrainAnswerHistory(
        question=question,
        answer=answer,
        sources_json=_safe_json_dumps(sources, "[]"),
        metadata_json=_safe_json_dumps(metadata, "{}"),
        study_room_id=study_room_id,
        owner_id=current_user.id,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return item


def list_brain_answer_history(
    *,
    db: Session,
    current_user: User,
    study_room_id: int | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 50))

    query = db.query(BrainAnswerHistory).filter(
        BrainAnswerHistory.owner_id == current_user.id
    )

    if study_room_id is not None:
        query = query.filter(BrainAnswerHistory.study_room_id == study_room_id)

    items = (
        query.order_by(BrainAnswerHistory.created_at.desc(), BrainAnswerHistory.id.desc())
        .limit(safe_limit)
        .all()
    )

    return [brain_history_to_dict(item) for item in items]


def get_brain_answer_history_item(
    *,
    db: Session,
    current_user: User,
    history_id: int,
) -> BrainAnswerHistory | None:
    return (
        db.query(BrainAnswerHistory)
        .filter(
            BrainAnswerHistory.id == history_id,
            BrainAnswerHistory.owner_id == current_user.id,
        )
        .first()
    )


def delete_brain_answer_history_item(
    *,
    db: Session,
    current_user: User,
    history_id: int,
) -> dict[str, Any]:
    history = get_brain_answer_history_item(
        db=db,
        current_user=current_user,
        history_id=history_id,
    )

    if not history:
        raise LookupError("Brain history item not found")

    db.delete(history)
    db.commit()

    return {
        "deleted": True,
        "id": history_id,
    }


def _build_note_content(history: BrainAnswerHistory, sources: list[dict[str, Any]]) -> str:
    source_lines: list[str] = []

    for index, source in enumerate(sources, start=1):
        source_title = source.get("title", "Untitled source")
        source_type = source.get("source_type", "source")
        score = source.get("score", "")
        source_lines.append(f"{index}. {source_title} ({source_type}, score: {score})")

    return "\n\n".join(
        [
            "# StudySnap Brain Answer",
            f"Brain History ID: {history.id}",
            f"Question:\n{history.question}",
            f"Answer:\n{history.answer}",
            "Sources used:\n" + ("\n".join(source_lines) if source_lines else "No sources saved."),
        ]
    )


def save_brain_history_as_note(
    *,
    db: Session,
    current_user: User,
    history_id: int,
    study_room_id: int | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    history = get_brain_answer_history_item(
        db=db,
        current_user=current_user,
        history_id=history_id,
    )

    if not history:
        raise LookupError("Brain history item not found")

    target_room_id = study_room_id or history.study_room_id

    if target_room_id is None:
        raise ValueError("Choose a study room before saving this Brain answer as a note.")

    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == target_room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise LookupError("Study room not found")

    clean_title = (title or f"Brain Answer: {history.question[:70]}").strip()
    if not clean_title:
        clean_title = "Brain Answer"

    sources = _safe_json_loads(history.sources_json, [])
    content = _build_note_content(history=history, sources=sources)

    marker = f"Brain History ID: {history.id}"

    existing_note = (
        db.query(Note)
        .filter(
            Note.owner_id == current_user.id,
            Note.study_room_id == target_room_id,
            Note.content.like(f"%{marker}%"),
        )
        .first()
    )

    if not existing_note:
        existing_note = (
            db.query(Note)
            .filter(
                Note.owner_id == current_user.id,
                Note.study_room_id == target_room_id,
                Note.title == clean_title[:200],
                Note.content == content,
            )
            .first()
        )

    if existing_note:
        return {
            "saved": True,
            "already_saved": True,
            "note": {
                "id": existing_note.id,
                "title": existing_note.title,
                "content": existing_note.content,
                "study_room_id": existing_note.study_room_id,
                "owner_id": existing_note.owner_id,
                "created_at": existing_note.created_at,
            },
        }

    note = Note(
        title=clean_title[:200],
        content=content,
        study_room_id=target_room_id,
        owner_id=current_user.id,
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        "saved": True,
        "already_saved": False,
        "note": {
            "id": note.id,
            "title": note.title,
            "content": note.content,
            "study_room_id": note.study_room_id,
            "owner_id": note.owner_id,
            "created_at": note.created_at,
        },
    }
