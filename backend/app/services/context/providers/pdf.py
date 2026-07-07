from sqlalchemy.orm import Session

from app.models.pdf_document import PDFDocument
from app.services.context.ranking import rank_items


def build_pdf_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    limit: int = 3,
    candidate_limit: int = 20,
    content_limit: int = 2000,
) -> str:
    """
    Build PDF context for StudySnap AI.

    Uses shared relevance ranking first.
    Falls back to recent PDFs if no relevant PDFs exist.
    """

    pdfs = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.study_room_id == study_room_id,
            PDFDocument.owner_id == owner_id,
        )
        .order_by(PDFDocument.id.desc())
        .limit(candidate_limit)
        .all()
    )

    if not pdfs:
        return ""

    selected_pdfs = rank_items(
        query=question,
        items=pdfs,
        text_getter=lambda pdf: " ".join(
            [
                pdf.original_filename or "",
                pdf.extracted_text or "",
            ]
        ),
        limit=limit,
    )

    formatted_pdfs = []

    for pdf in selected_pdfs:
        filename = (pdf.original_filename or "Untitled PDF").strip()
        extracted_text = (pdf.extracted_text or "").strip()

        if not extracted_text:
            continue

        if len(extracted_text) > content_limit:
            extracted_text = extracted_text[:content_limit].rstrip() + "..."

        formatted_pdfs.append(
            f"PDF FILE: {filename}\nPDF CONTENT:\n{extracted_text}"
        )

    return "\n\n---\n\n".join(formatted_pdfs)
