from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.models.central_action import (
    CentralAction,
    utc_now,
)
from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.quiz import Quiz
from app.models.quiz_question import (
    QuizQuestion,
)
from app.models.study_plan import StudyPlan
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.ai_service import (
    generate_basic_flashcards,
    generate_basic_quiz,
)
from app.services.rooms.access import (
    require_room_contributor,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["Central Actions"],
)

ActionType = Literal[
    "save_note",
    "create_flashcards",
    "create_quiz",
    "add_to_planner",
]

ACTION_LABELS = {
    "save_note": "Save as note",
    "create_flashcards": "Create cards",
    "create_quiz": "Create quiz",
    "add_to_planner": "Add to planner",
}

ROOM_REQUIRED_ACTIONS = {
    "save_note",
    "create_flashcards",
    "create_quiz",
}

MAX_ACTION_CONTENT_CHARS = 100_000
MAX_TITLE_CHARS = 250


class CentralActionPreviewRequest(BaseModel):
    action_type: ActionType

    study_room_id: int | None = None

    source_message_id: int | None = None

    payload: dict[str, Any] = Field(
        default_factory=dict,
    )

    idempotency_key: str | None = Field(
        default=None,
        max_length=500,
    )


def json_dumps(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )


def json_loads(
    value: str | None,
    fallback: Any,
) -> Any:
    if not value:
        return fallback

    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def clean_text(
    value: Any,
    *,
    field_name: str,
    maximum: int,
    required: bool = True,
) -> str:
    if value is None:
        cleaned = ""
    elif isinstance(value, str):
        cleaned = value.strip()
    else:
        cleaned = str(value).strip()

    if required and not cleaned:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} cannot be empty.",
        )

    if len(cleaned) > maximum:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{field_name} is too long. "
                f"The maximum is {maximum} characters."
            ),
        )

    return cleaned


def parse_datetime_value(
    value: Any,
    *,
    field_name: str,
) -> datetime:
    if isinstance(value, datetime):
        return value

    if not isinstance(value, str):
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} must be a date and time.",
        )

    cleaned = value.strip()

    if not cleaned:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} cannot be empty.",
        )

    try:
        return datetime.fromisoformat(
            cleaned.replace(
                "Z",
                "+00:00",
            )
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{field_name} must use a valid ISO date "
                "and time."
            ),
        ) from exc


def get_owned_action(
    db: Session,
    action_id: int,
    owner_id: int,
    *,
    lock: bool = False,
) -> CentralAction:
    query = db.query(CentralAction).filter(
        CentralAction.id == action_id,
        CentralAction.owner_id == owner_id,
    )

    if lock:
        query = query.with_for_update()

    action = query.first()

    if action is None:
        raise HTTPException(
            status_code=404,
            detail="Action not found.",
        )

    return action


def resolve_source_context(
    db: Session,
    *,
    source_message_id: int | None,
    owner_id: int,
) -> tuple[
    AIMessage | None,
    AIConversation | None,
]:
    if source_message_id is None:
        return None, None

    message = (
        db.query(AIMessage)
        .filter(
            AIMessage.id == source_message_id,
        )
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Source AI message not found.",
        )

    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.id
            == message.conversation_id,
            AIConversation.owner_id
            == owner_id,
        )
        .first()
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Source AI message not found.",
        )

    if message.role != "assistant":
        raise HTTPException(
            status_code=400,
            detail=(
                "Central actions can only use a "
                "StudySnap AI answer as their source."
            ),
        )

    return message, conversation


def resolve_room(
    db: Session,
    *,
    action_type: str,
    requested_room_id: int | None,
    conversation: AIConversation | None,
    owner_id: int,
) -> StudyRoom | None:
    room_id = requested_room_id

    if (
        room_id is None
        and conversation is not None
    ):
        room_id = conversation.study_room_id

    if room_id is None:
        if action_type in ROOM_REQUIRED_ACTIONS:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Choose a Study Room before "
                    f"using {ACTION_LABELS[action_type]}."
                ),
            )

        return None

    require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=owner_id,
    )

    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == room_id,
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Study Room not found.",
        )

    return room


def normalize_action_payload(
    *,
    action_type: str,
    raw_payload: dict[str, Any],
    source_message: AIMessage | None,
    conversation: AIConversation | None,
    room: StudyRoom | None,
) -> dict[str, Any]:
    payload = dict(raw_payload or {})

    source_content = (
        source_message.content
        if source_message is not None
        else ""
    )

    source_title = (
        conversation.title
        if conversation is not None
        else ""
    )

    if action_type == "save_note":
        content = clean_text(
            payload.get("content")
            or source_content,
            field_name="Note content",
            maximum=MAX_ACTION_CONTENT_CHARS,
        )

        title = clean_text(
            payload.get("title")
            or source_title
            or "StudySnap AI Note",
            field_name="Note title",
            maximum=MAX_TITLE_CHARS,
        )

        return {
            "title": title,
            "content": content,
        }

    if action_type == "create_flashcards":
        content = clean_text(
            payload.get("content")
            or source_content,
            field_name="Flashcard source content",
            maximum=MAX_ACTION_CONTENT_CHARS,
        )

        requested_count = payload.get(
            "count",
            8,
        )

        try:
            count = int(requested_count)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="Flashcard count must be a number.",
            ) from exc

        if count < 1 or count > 20:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Flashcard count must be "
                    "between 1 and 20."
                ),
            )

        return {
            "content": content,
            "count": count,
            "difficulty": clean_text(
                payload.get("difficulty")
                or "medium",
                field_name="Difficulty",
                maximum=30,
            ),
            "tags": clean_text(
                payload.get("tags")
                or "",
                field_name="Tags",
                maximum=500,
                required=False,
            ),
        }

    if action_type == "create_quiz":
        content = clean_text(
            payload.get("content")
            or source_content,
            field_name="Quiz source content",
            maximum=MAX_ACTION_CONTENT_CHARS,
        )

        title = clean_text(
            payload.get("title")
            or source_title
            or "StudySnap AI Quiz",
            field_name="Quiz title",
            maximum=MAX_TITLE_CHARS,
        )

        return {
            "title": title,
            "content": content,
        }

    if action_type == "add_to_planner":
        title = clean_text(
            payload.get("title")
            or source_title
            or "Study session",
            field_name="Planner title",
            maximum=MAX_TITLE_CHARS,
        )

        subject = clean_text(
            payload.get("subject")
            or (
                room.subject
                if room is not None
                else ""
            ),
            field_name="Planner subject",
            maximum=160,
        )

        scheduled_for = parse_datetime_value(
            payload.get("scheduled_for"),
            field_name="Scheduled time",
        )

        try:
            duration_minutes = int(
                payload.get(
                    "duration_minutes",
                    25,
                )
            )
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Duration must be a number "
                    "of minutes."
                ),
            ) from exc

        if (
            duration_minutes < 1
            or duration_minutes > 1440
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Duration must be between "
                    "1 and 1440 minutes."
                ),
            )

        priority = clean_text(
            payload.get("priority")
            or "Medium",
            field_name="Priority",
            maximum=20,
        ).title()

        if priority not in {
            "Low",
            "Medium",
            "High",
        }:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Priority must be Low, "
                    "Medium, or High."
                ),
            )

        description = clean_text(
            payload.get("description")
            or source_content[:2000],
            field_name="Description",
            maximum=2000,
            required=False,
        )

        return {
            "title": title,
            "subject": subject,
            "description": (
                description or None
            ),
            "scheduled_for": (
                scheduled_for.isoformat()
            ),
            "duration_minutes": (
                duration_minutes
            ),
            "priority": priority,
        }

    raise HTTPException(
        status_code=422,
        detail="Unsupported central action.",
    )


def build_preview(
    *,
    action_type: str,
    payload: dict[str, Any],
    room: StudyRoom | None,
) -> dict[str, Any]:
    room_name = (
        room.name
        if room is not None
        else None
    )

    if action_type == "save_note":
        summary = (
            f'Save "{payload["title"]}" '
            f'to {room_name}.'
        )
    elif action_type == "create_flashcards":
        summary = (
            f'Create up to {payload["count"]} '
            f'cards in {room_name}.'
        )
    elif action_type == "create_quiz":
        summary = (
            f'Create "{payload["title"]}" '
            f'in {room_name}.'
        )
    else:
        summary = (
            f'Add "{payload["title"]}" '
            "to the planner."
        )

    return {
        "label": ACTION_LABELS[action_type],
        "summary": summary,
        "requires_confirmation": True,
        "room_id": (
            room.id
            if room is not None
            else None
        ),
        "room_name": room_name,
    }


def build_idempotency_key(
    *,
    owner_id: int,
    action_type: str,
    room_id: int | None,
    source_message_id: int | None,
    payload: dict[str, Any],
    explicit_key: str | None,
) -> str:
    if explicit_key and explicit_key.strip():
        source = (
            "explicit:"
            + explicit_key.strip()
        )
    else:
        source = json_dumps(
            {
                "owner_id": owner_id,
                "action_type": action_type,
                "study_room_id": room_id,
                "source_message_id": (
                    source_message_id
                ),
                "payload": payload,
            }
        )

    return hashlib.sha256(
        source.encode("utf-8")
    ).hexdigest()


def serialize_action(
    action: CentralAction,
    *,
    duplicate: bool = False,
    already_executed: bool = False,
    already_undone: bool = False,
    undo_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": action.id,
        "action_type": action.action_type,
        "label": ACTION_LABELS.get(
            action.action_type,
            action.action_type,
        ),
        "status": action.status,
        "study_room_id": action.study_room_id,
        "conversation_id": (
            action.conversation_id
        ),
        "source_message_id": (
            action.source_message_id
        ),
        "preview": json_loads(
            action.preview_json,
            {},
        ),
        "result": json_loads(
            action.result_json,
            None,
        ),
        "error_message": (
            action.error_message
        ),
        "duplicate": duplicate,
        "already_executed": (
            already_executed
        ),
        "already_undone": already_undone,
        "can_execute": (
            action.status
            in {
                "preview",
                "failed",
            }
        ),
        "can_undo": (
            action.status == "executed"
        ),
        "undo_result": undo_result,
        "created_at": action.created_at,
        "updated_at": action.updated_at,
        "executed_at": action.executed_at,
        "undone_at": action.undone_at,
    }


def execute_action_record(
    db: Session,
    *,
    action: CentralAction,
) -> tuple[
    dict[str, Any],
    dict[str, Any],
]:
    payload = json_loads(
        action.payload_json,
        {},
    )

    if action.action_type == "save_note":
        note = Note(
            title=payload["title"],
            content=payload["content"],
            study_room_id=action.study_room_id,
            owner_id=action.owner_id,
        )

        db.add(note)
        db.flush()

        return (
            {
                "entity_type": "note",
                "entity_id": note.id,
                "title": note.title,
                "open_href": (
                    "/notes"
                    f"?roomId={action.study_room_id}"
                    f"&noteId={note.id}"
                ),
            },
            {
                "entity_type": "note",
                "entity_ids": [note.id],
            },
        )

    if (
        action.action_type
        == "create_flashcards"
    ):
        generated = generate_basic_flashcards(
            payload["content"]
        )

        if not isinstance(generated, list):
            raise HTTPException(
                status_code=502,
                detail=(
                    "StudySnap did not return "
                    "valid flashcards."
                ),
            )

        cards: list[Flashcard] = []

        for item in generated[
            : payload["count"]
        ]:
            if not isinstance(item, dict):
                continue

            question = clean_text(
                item.get("question"),
                field_name="Flashcard question",
                maximum=5000,
                required=False,
            )

            answer = clean_text(
                item.get("answer"),
                field_name="Flashcard answer",
                maximum=10_000,
                required=False,
            )

            if not question or not answer:
                continue

            card = Flashcard(
                question=question,
                answer=answer,
                tags=payload["tags"],
                difficulty=(
                    payload["difficulty"]
                ),
                source_type=(
                    "central_action"
                ),
                source_id=str(action.id),
                study_room_id=(
                    action.study_room_id
                ),
                owner_id=action.owner_id,
            )

            db.add(card)
            cards.append(card)

        if not cards:
            raise HTTPException(
                status_code=502,
                detail=(
                    "StudySnap could not create "
                    "usable flashcards."
                ),
            )

        db.flush()

        card_ids = [
            card.id
            for card in cards
        ]

        return (
            {
                "entity_type": "flashcards",
                "entity_ids": card_ids,
                "count": len(card_ids),
                "open_href": (
                    "/flashcards"
                    f"?roomId={action.study_room_id}"
                ),
            },
            {
                "entity_type": "flashcards",
                "entity_ids": card_ids,
            },
        )

    if action.action_type == "create_quiz":
        generated = generate_basic_quiz(
            payload["content"]
        )

        if not isinstance(generated, list):
            raise HTTPException(
                status_code=502,
                detail=(
                    "StudySnap did not return "
                    "a valid quiz."
                ),
            )

        quiz = Quiz(
            title=payload["title"],
            study_room_id=action.study_room_id,
            owner_id=action.owner_id,
        )

        db.add(quiz)
        db.flush()

        questions: list[QuizQuestion] = []

        for item in generated[:20]:
            if not isinstance(item, dict):
                continue

            question_text = clean_text(
                item.get("question"),
                field_name="Quiz question",
                maximum=10_000,
                required=False,
            )

            options = {
                "option_a": clean_text(
                    item.get("option_a"),
                    field_name="Option A",
                    maximum=5000,
                    required=False,
                ),
                "option_b": clean_text(
                    item.get("option_b"),
                    field_name="Option B",
                    maximum=5000,
                    required=False,
                ),
                "option_c": clean_text(
                    item.get("option_c"),
                    field_name="Option C",
                    maximum=5000,
                    required=False,
                ),
                "option_d": clean_text(
                    item.get("option_d"),
                    field_name="Option D",
                    maximum=5000,
                    required=False,
                ),
            }

            correct_answer = clean_text(
                item.get("correct_answer"),
                field_name="Correct answer",
                maximum=10,
                required=False,
            ).upper()

            if (
                not question_text
                or not all(options.values())
                or correct_answer
                not in {
                    "A",
                    "B",
                    "C",
                    "D",
                }
            ):
                continue

            quiz_question = QuizQuestion(
                quiz_id=quiz.id,
                question=question_text,
                option_a=options["option_a"],
                option_b=options["option_b"],
                option_c=options["option_c"],
                option_d=options["option_d"],
                correct_answer=correct_answer,
                explanation=clean_text(
                    item.get("explanation")
                    or "",
                    field_name="Explanation",
                    maximum=10_000,
                    required=False,
                )
                or None,
            )

            db.add(quiz_question)
            questions.append(
                quiz_question
            )

        if not questions:
            raise HTTPException(
                status_code=502,
                detail=(
                    "StudySnap could not create "
                    "usable quiz questions."
                ),
            )

        db.flush()

        return (
            {
                "entity_type": "quiz",
                "entity_id": quiz.id,
                "title": quiz.title,
                "question_count": (
                    len(questions)
                ),
                "open_href": (
                    "/quizzes"
                    f"?roomId={action.study_room_id}"
                    f"&quizId={quiz.id}"
                ),
            },
            {
                "entity_type": "quiz",
                "entity_ids": [quiz.id],
            },
        )

    if (
        action.action_type
        == "add_to_planner"
    ):
        plan = StudyPlan(
            user_id=action.owner_id,
            study_room_id=(
                action.study_room_id
            ),
            title=payload["title"],
            subject=payload["subject"],
            description=(
                payload["description"]
            ),
            scheduled_for=(
                parse_datetime_value(
                    payload["scheduled_for"],
                    field_name=(
                        "Scheduled time"
                    ),
                )
            ),
            duration_minutes=(
                payload["duration_minutes"]
            ),
            priority=payload["priority"],
            status="Planned",
        )

        db.add(plan)
        db.flush()

        return (
            {
                "entity_type": "planner_item",
                "entity_id": plan.id,
                "title": plan.title,
                "scheduled_for": (
                    plan.scheduled_for
                ),
                "open_href": (
                    "/planner"
                    f"?planId={plan.id}"
                ),
            },
            {
                "entity_type": "planner_item",
                "entity_ids": [plan.id],
            },
        )

    raise HTTPException(
        status_code=422,
        detail="Unsupported central action.",
    )


def mark_action_failed(
    db: Session,
    *,
    action_id: int,
    owner_id: int,
    message: str,
) -> None:
    action = get_owned_action(
        db,
        action_id,
        owner_id,
    )

    action.status = "failed"
    action.error_message = message[:4000]

    db.add(action)
    db.commit()


@router.post("/preview")
def preview_action(
    data: CentralActionPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    source_message, conversation = (
        resolve_source_context(
            db,
            source_message_id=(
                data.source_message_id
            ),
            owner_id=current_user.id,
        )
    )

    room = resolve_room(
        db,
        action_type=data.action_type,
        requested_room_id=(
            data.study_room_id
        ),
        conversation=conversation,
        owner_id=current_user.id,
    )

    normalized_payload = (
        normalize_action_payload(
            action_type=data.action_type,
            raw_payload=data.payload,
            source_message=source_message,
            conversation=conversation,
            room=room,
        )
    )

    preview = build_preview(
        action_type=data.action_type,
        payload=normalized_payload,
        room=room,
    )

    idempotency_key = (
        build_idempotency_key(
            owner_id=current_user.id,
            action_type=data.action_type,
            room_id=(
                room.id
                if room is not None
                else None
            ),
            source_message_id=(
                data.source_message_id
            ),
            payload=normalized_payload,
            explicit_key=(
                data.idempotency_key
            ),
        )
    )

    existing = (
        db.query(CentralAction)
        .filter(
            CentralAction.owner_id
            == current_user.id,
            CentralAction.idempotency_key
            == idempotency_key,
        )
        .first()
    )

    if existing is not None:
        return serialize_action(
            existing,
            duplicate=True,
        )

    action = CentralAction(
        owner_id=current_user.id,
        study_room_id=(
            room.id
            if room is not None
            else None
        ),
        conversation_id=(
            conversation.id
            if conversation is not None
            else None
        ),
        source_message_id=(
            data.source_message_id
        ),
        action_type=data.action_type,
        status="preview",
        idempotency_key=idempotency_key,
        payload_json=json_dumps(
            normalized_payload
        ),
        preview_json=json_dumps(
            preview
        ),
    )

    db.add(action)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()

        existing = (
            db.query(CentralAction)
            .filter(
                CentralAction.owner_id
                == current_user.id,
                CentralAction.idempotency_key
                == idempotency_key,
            )
            .first()
        )

        if existing is None:
            raise

        return serialize_action(
            existing,
            duplicate=True,
        )

    db.refresh(action)

    return serialize_action(action)


@router.post("/{action_id}/execute")
def execute_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    action = get_owned_action(
        db,
        action_id,
        current_user.id,
        lock=True,
    )

    if action.status == "executed":
        return serialize_action(
            action,
            duplicate=True,
            already_executed=True,
        )

    if action.status == "undone":
        raise HTTPException(
            status_code=409,
            detail=(
                "This action was already undone. "
                "Create a new preview to run it again."
            ),
        )

    if action.status not in {
        "preview",
        "failed",
    }:
        raise HTTPException(
            status_code=409,
            detail=(
                "This action cannot be executed "
                f"from status {action.status}."
            ),
        )

    if action.study_room_id is not None:
        require_room_contributor(
            db=db,
            room_id=action.study_room_id,
            user_id=current_user.id,
        )

    try:
        result, undo_payload = (
            execute_action_record(
                db,
                action=action,
            )
        )

        action.status = "executed"
        action.result_json = json_dumps(
            result
        )
        action.undo_json = json_dumps(
            undo_payload
        )
        action.error_message = None
        action.executed_at = utc_now()
        action.undone_at = None

        db.add(action)
        db.commit()
        db.refresh(action)

        return serialize_action(action)

    except HTTPException as exc:
        db.rollback()

        mark_action_failed(
            db,
            action_id=action_id,
            owner_id=current_user.id,
            message=str(exc.detail),
        )

        raise

    except Exception as exc:
        db.rollback()

        mark_action_failed(
            db,
            action_id=action_id,
            owner_id=current_user.id,
            message=(
                "The action could not be completed."
            ),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "The action could not be completed."
            ),
        ) from exc


@router.post("/{action_id}/undo")
def undo_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    action = get_owned_action(
        db,
        action_id,
        current_user.id,
        lock=True,
    )

    if action.status == "undone":
        return serialize_action(
            action,
            already_undone=True,
        )

    if action.status != "executed":
        raise HTTPException(
            status_code=409,
            detail=(
                "Only a completed action "
                "can be undone."
            ),
        )

    undo_payload = json_loads(
        action.undo_json,
        {},
    )

    entity_type = undo_payload.get(
        "entity_type"
    )

    entity_ids = [
        int(value)
        for value in undo_payload.get(
            "entity_ids",
            [],
        )
        if isinstance(value, int)
        or (
            isinstance(value, str)
            and value.isdigit()
        )
    ]

    deleted_count = 0

    if entity_type == "note":
        deleted_count = (
            db.query(Note)
            .filter(
                Note.id.in_(entity_ids),
                Note.owner_id
                == current_user.id,
            )
            .delete(
                synchronize_session=False
            )
        )

    elif entity_type == "flashcards":
        deleted_count = (
            db.query(Flashcard)
            .filter(
                Flashcard.id.in_(
                    entity_ids
                ),
                Flashcard.owner_id
                == current_user.id,
                Flashcard.source_type
                == "central_action",
                Flashcard.source_id
                == str(action.id),
            )
            .delete(
                synchronize_session=False
            )
        )

    elif entity_type == "quiz":
        quizzes = (
            db.query(Quiz)
            .filter(
                Quiz.id.in_(entity_ids),
                Quiz.owner_id
                == current_user.id,
            )
            .all()
        )

        quiz_ids = [
            quiz.id
            for quiz in quizzes
        ]

        if quiz_ids:
            db.query(QuizQuestion).filter(
                QuizQuestion.quiz_id.in_(
                    quiz_ids
                )
            ).delete(
                synchronize_session=False
            )

            deleted_count = (
                db.query(Quiz)
                .filter(
                    Quiz.id.in_(quiz_ids),
                    Quiz.owner_id
                    == current_user.id,
                )
                .delete(
                    synchronize_session=False
                )
            )

    elif entity_type == "planner_item":
        deleted_count = (
            db.query(StudyPlan)
            .filter(
                StudyPlan.id.in_(
                    entity_ids
                ),
                StudyPlan.user_id
                == current_user.id,
            )
            .delete(
                synchronize_session=False
            )
        )

    else:
        raise HTTPException(
            status_code=409,
            detail=(
                "This action does not have "
                "a supported undo record."
            ),
        )

    action.status = "undone"
    action.undone_at = utc_now()

    db.add(action)
    db.commit()
    db.refresh(action)

    return serialize_action(
        action,
        undo_result={
            "deleted_count": deleted_count,
            "entity_type": entity_type,
        },
    )


@router.get("")
def list_actions(
    action_status: str | None = Query(
        default=None,
        max_length=24,
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    query = db.query(CentralAction).filter(
        CentralAction.owner_id
        == current_user.id,
    )

    if action_status:
        query = query.filter(
            CentralAction.status
            == action_status.strip()
        )

    actions = (
        query.order_by(
            CentralAction.id.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        serialize_action(action)
        for action in actions
    ]


@router.get("/{action_id}")
def read_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    action = get_owned_action(
        db,
        action_id,
        current_user.id,
    )

    return serialize_action(action)
