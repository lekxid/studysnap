from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.pdf_document import PDFDocument
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.context.ranking import relevance_score


def make_search_result(
    *,
    item_type: str,
    item_id: int,
    title: str,
    subtitle: str,
    href: str,
    text: str,
    query: str,
):
    return {
        "type": item_type,
        "id": item_id,
        "title": title,
        "subtitle": subtitle,
        "href": href,
        "score": relevance_score(query, text),
    }


def brain_search(
    *,
    db: Session,
    current_user: User,
    query: str,
    limit: int = 12,
):
    search_query = query.strip()

    if not search_query:
        return {"query": search_query, "results": []}

    results = []

    rooms = (
        db.query(StudyRoom)
        .filter(StudyRoom.owner_id == current_user.id)
        .order_by(StudyRoom.id.desc())
        .limit(50)
        .all()
    )

    for room in rooms:
        text = " ".join([room.name or "", room.subject or "", room.description or ""])

        results.append(
            make_search_result(
                item_type="project",
                item_id=room.id,
                title=room.name,
                subtitle=f"Project • {room.subject}",
                href=f"/study-rooms/{room.id}",
                text=text,
                query=search_query,
            )
        )

    notes = (
        db.query(Note)
        .filter(Note.owner_id == current_user.id)
        .order_by(Note.id.desc())
        .limit(80)
        .all()
    )

    for note in notes:
        text = " ".join([note.title or "", note.content or ""])

        results.append(
            make_search_result(
                item_type="note",
                item_id=note.id,
                title=note.title,
                subtitle="Note",
                href=f"/study-rooms/{note.study_room_id}?tab=notes",
                text=text,
                query=search_query,
            )
        )

    pdfs = (
        db.query(PDFDocument)
        .filter(PDFDocument.owner_id == current_user.id)
        .order_by(PDFDocument.id.desc())
        .limit(80)
        .all()
    )

    for pdf in pdfs:
        text = " ".join([pdf.original_filename or "", (pdf.extracted_text or "")[:3000]])

        results.append(
            make_search_result(
                item_type="pdf",
                item_id=pdf.id,
                title=pdf.original_filename,
                subtitle="PDF document",
                href=f"/study-rooms/{pdf.study_room_id}?tab=pdf",
                text=text,
                query=search_query,
            )
        )

    flashcards = (
        db.query(Flashcard)
        .filter(Flashcard.owner_id == current_user.id)
        .order_by(Flashcard.id.desc())
        .limit(80)
        .all()
    )

    for card in flashcards:
        text = " ".join(
            [
                card.question or "",
                card.answer or "",
                card.tags or "",
                card.difficulty or "",
            ]
        )

        results.append(
            make_search_result(
                item_type="flashcard",
                item_id=card.id,
                title=card.question[:90],
                subtitle=f"Flashcard • {card.difficulty}",
                href=f"/study-rooms/{card.study_room_id}?tab=flashcards",
                text=text,
                query=search_query,
            )
        )

    matching_results = [result for result in results if result["score"] > 0]
    matching_results.sort(
        key=lambda result: (-result["score"], result["type"], result["id"])
    )

    return {
        "query": search_query,
        "results": matching_results[:limit],
    }
