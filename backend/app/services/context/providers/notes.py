from sqlalchemy.orm import Session

from app.models.note import Note


def build_notes_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    limit: int = 5,
    content_limit: int = 1200,
) -> str:
    """
    Build study note context for StudySnap AI.
    """

    notes = (
        db.query(Note)
        .filter(
            Note.study_room_id == study_room_id,
            Note.owner_id == owner_id,
        )
        .order_by(Note.id.desc())
        .limit(limit)
        .all()
    )

    if not notes:
        return ""

    formatted_notes = []

    for note in notes:
        clean_title = (note.title or "Untitled Note").strip()
        clean_content = (note.content or "").strip()

        if not clean_content:
            continue

        if len(clean_content) > content_limit:
            clean_content = clean_content[:content_limit].rstrip() + "..."

        formatted_notes.append(
            f"NOTE TITLE: {clean_title}\nNOTE CONTENT:\n{clean_content}"
        )

    return "\n\n---\n\n".join(formatted_notes)
