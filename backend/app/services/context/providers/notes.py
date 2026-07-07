from sqlalchemy.orm import Session

from app.models.note import Note
from app.services.context.ranking import relevance_score


def build_notes_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    limit: int = 5,
    candidate_limit: int = 30,
    content_limit: int = 1200,
) -> str:
    """
    Build study note context for StudySnap AI.

    Uses relevance ranking first.
    Falls back to recent notes if no relevant notes exist.
    """

    notes = (
        db.query(Note)
        .filter(
            Note.study_room_id == study_room_id,
            Note.owner_id == owner_id,
        )
        .order_by(Note.id.desc())
        .limit(candidate_limit)
        .all()
    )

    if not notes:
        return ""

    ranked_notes = []

    for note in notes:
        searchable_text = " ".join(
            [
                note.title or "",
                note.content or "",
            ]
        )

        score = relevance_score(question, searchable_text)
        ranked_notes.append((score, note))

    matching_notes = [
        (score, note)
        for score, note in ranked_notes
        if score > 0
    ]

    if matching_notes:
        matching_notes.sort(key=lambda item: item[0], reverse=True)
        selected_notes = [note for score, note in matching_notes[:limit]]
    else:
        selected_notes = notes[:limit]

    formatted_notes = []

    for note in selected_notes:
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
