from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.models.artifact import Artifact
from app.models.central_action import (
    CentralAction,
)
from app.models.user_resume_state import (
    UserResumeState,
)
from app.models.user_settings import (
    UserSettings,
)


@dataclass(frozen=True)
class ConversationDeletionResult:
    deleted_counts: dict[str, int]
    detached_counts: dict[str, int]


class ConversationDeletionError(
    RuntimeError
):
    pass


def safe_rowcount(result) -> int:
    return max(
        int(result or 0),
        0,
    )


def delete_ai_conversation_graph(
    db: Session,
    conversation_id: int,
) -> ConversationDeletionResult:
    """
    Delete one AI conversation and its messages.

    Generated artifacts and Central Action history are
    preserved by clearing their nullable references.

    The caller controls commit and rollback.
    """

    existing_id = db.execute(
        select(AIConversation.id).where(
            AIConversation.id
            == conversation_id
        )
    ).scalar_one_or_none()

    if existing_id is None:
        raise ConversationDeletionError(
            "AI conversation "
            f"{conversation_id} was not found."
        )

    message_ids = list(
        db.execute(
            select(AIMessage.id).where(
                AIMessage.conversation_id
                == conversation_id
            )
        ).scalars()
    )

    detached_counts: dict[
        str,
        int,
    ] = {}

    artifact_conversations = (
        db.query(Artifact)
        .filter(
            Artifact.conversation_id
            == conversation_id
        )
        .update(
            {
                Artifact.conversation_id:
                    None,
            },
            synchronize_session=False,
        )
    )

    detached_counts[
        "artifacts.conversation_id"
    ] = safe_rowcount(
        artifact_conversations
    )

    action_conversations = (
        db.query(CentralAction)
        .filter(
            CentralAction.conversation_id
            == conversation_id
        )
        .update(
            {
                CentralAction.conversation_id:
                    None,
            },
            synchronize_session=False,
        )
    )

    detached_counts[
        "central_actions.conversation_id"
    ] = safe_rowcount(
        action_conversations
    )

    if message_ids:
        artifact_messages = (
            db.query(Artifact)
            .filter(
                Artifact.message_id.in_(
                    message_ids
                )
            )
            .update(
                {
                    Artifact.message_id:
                        None,
                },
                synchronize_session=False,
            )
        )

        action_messages = (
            db.query(CentralAction)
            .filter(
                CentralAction
                .source_message_id.in_(
                    message_ids
                )
            )
            .update(
                {
                    CentralAction
                    .source_message_id:
                        None,
                },
                synchronize_session=False,
            )
        )
    else:
        artifact_messages = 0
        action_messages = 0

    detached_counts[
        "artifacts.message_id"
    ] = safe_rowcount(
        artifact_messages
    )

    detached_counts[
        "central_actions.source_message_id"
    ] = safe_rowcount(
        action_messages
    )

    resume_states = (
        db.query(UserResumeState)
        .filter(
            UserResumeState
            .last_ai_conversation_id
            == conversation_id
        )
        .update(
            {
                UserResumeState
                .last_ai_conversation_id:
                    None,
            },
            synchronize_session=False,
        )
    )

    detached_counts[
        "user_resume_states."
        "last_ai_conversation_id"
    ] = safe_rowcount(resume_states)

    settings = (
        db.query(UserSettings)
        .filter(
            UserSettings
            .last_ai_conversation_id
            == conversation_id
        )
        .update(
            {
                UserSettings
                .last_ai_conversation_id:
                    None,
            },
            synchronize_session=False,
        )
    )

    detached_counts[
        "user_settings."
        "last_ai_conversation_id"
    ] = safe_rowcount(settings)

    deleted_messages = (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id
            == conversation_id
        )
        .delete(
            synchronize_session=False
        )
    )

    deleted_conversations = (
        db.query(AIConversation)
        .filter(
            AIConversation.id
            == conversation_id
        )
        .delete(
            synchronize_session=False
        )
    )

    if deleted_conversations != 1:
        raise ConversationDeletionError(
            "Expected to delete exactly one "
            "AI conversation, deleted "
            f"{deleted_conversations}."
        )

    return ConversationDeletionResult(
        deleted_counts={
            "ai_conversations":
                safe_rowcount(
                    deleted_conversations
                ),
            "ai_messages":
                safe_rowcount(
                    deleted_messages
                ),
        },
        detached_counts={
            key: value
            for key, value in sorted(
                detached_counts.items()
            )
            if value
        },
    )
