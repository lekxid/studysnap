from sqlalchemy.orm import Session

from app.models.pdf_document import PDFDocument


def build_pdf_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    limit: int = 3,
    content_limit: int = 2000,
) -> str:
    """
    Build PDF context for StudySnap AI.

    Uses recent PDFs from the current study room only.
    """

    pdfs = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.study_room_id == study_room_id,
            PDFDocument.owner_id == owner_id,
        )
        .order_by(PDFDocument.id.desc())
        .limit(limit)
        .all()
    )

    if not pdfs:
        return ""

    formatted_pdfs = []

    for pdf in pdfs:
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
