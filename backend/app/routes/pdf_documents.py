import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pdf_document import PDFDocument
from app.models.user import User
from app.services.ai_service import generate_studysnap_answer
from app.services.rooms.access import (
    require_room_ai,
    require_room_contributor,
    require_room_item_change,
    require_room_view,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["PDF Documents"])

UPLOAD_DIR = Path("uploads/pdfs")
MAX_FILE_SIZE = 10 * 1024 * 1024


class PDFChatRequest(BaseModel):
    question: str


def extract_pdf_text(file_path: Path) -> str:
    try:
        reader = PdfReader(str(file_path))
        pages = []

        for page in reader.pages:
            pages.append(
                page.extract_text() or ""
            )

        return "\n\n".join(pages).strip()
    except Exception:
        return ""


def get_pdf_or_404(
    db: Session,
    pdf_id: int,
) -> PDFDocument:
    pdf_document = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.id == pdf_id
        )
        .first()
    )

    if pdf_document is None:
        raise HTTPException(
            status_code=404,
            detail="PDF not found",
        )

    return pdf_document


@router.get("/{study_room_id}")
def get_pdfs(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_view(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    return (
        db.query(PDFDocument)
        .filter(
            PDFDocument.study_room_id
            == study_room_id
        )
        .order_by(PDFDocument.id.desc())
        .all()
    )


@router.post("/{study_room_id}")
async def upload_pdf(
    study_room_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed",
        )

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=(
                "PDF file is too large. "
                "Maximum size is 10MB."
            ),
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF is empty.",
        )

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    original_filename = (
        file.filename or "document.pdf"
    )

    stored_filename = (
        f"{uuid.uuid4()}.pdf"
    )

    file_path = (
        UPLOAD_DIR / stored_filename
    )

    try:
        with file_path.open("xb") as output_file:
            output_file.write(contents)

        extracted_text = extract_pdf_text(
            file_path
        )

        pdf_document = PDFDocument(
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=str(file_path),
            file_size=len(contents),
            extracted_text=extracted_text,
            study_room_id=study_room_id,
            owner_id=current_user.id,
        )

        db.add(pdf_document)
        db.commit()
        db.refresh(pdf_document)

        return pdf_document

    except HTTPException:
        raise

    except Exception:
        db.rollback()
        file_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=500,
            detail="The PDF could not be stored.",
        )

    finally:
        await file.close()


@router.post("/{pdf_id}/summary")
def summarize_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = get_pdf_or_404(
        db=db,
        pdf_id=pdf_id,
    )

    require_room_ai(
        db=db,
        room_id=pdf_document.study_room_id,
        user_id=current_user.id,
    )

    if not pdf_document.extracted_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text found in this PDF."
            ),
        )

    text = (
        pdf_document.extracted_text[:12000]
    )

    prompt = f"""
You are StudySnap AI. Summarize this PDF for a student.

Return:
1. Short summary
2. Key points
3. Important definitions
4. Study tips
5. Practice questions

PDF text:
{text}
"""

    summary = generate_studysnap_answer(
        prompt
    )

    return {
        "pdf_id": pdf_document.id,
        "filename": (
            pdf_document.original_filename
        ),
        "summary": summary,
    }


@router.post("/{pdf_id}/chat")
def chat_with_pdf(
    pdf_id: int,
    data: PDFChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = get_pdf_or_404(
        db=db,
        pdf_id=pdf_id,
    )

    require_room_ai(
        db=db,
        room_id=pdf_document.study_room_id,
        user_id=current_user.id,
    )

    question = data.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    if not pdf_document.extracted_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text found in this PDF."
            ),
        )

    text = (
        pdf_document.extracted_text[:12000]
    )

    prompt = f"""
You are StudySnap AI. Answer the student's question using the PDF content below.

Rules:
- Use simple student-friendly language.
- If the answer is not in the PDF, say that clearly.
- Give examples when helpful.
- Keep the answer focused.

PDF filename:
{pdf_document.original_filename}

PDF content:
{text}

Student question:
{question}
"""

    answer = generate_studysnap_answer(
        prompt
    )

    return {
        "pdf_id": pdf_document.id,
        "filename": (
            pdf_document.original_filename
        ),
        "question": question,
        "answer": answer,
    }


@router.delete("/{pdf_id}")
def delete_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = get_pdf_or_404(
        db=db,
        pdf_id=pdf_id,
    )

    require_room_item_change(
        db=db,
        room_id=pdf_document.study_room_id,
        user_id=current_user.id,
        item_owner_id=pdf_document.owner_id,
    )

    file_path = Path(
        pdf_document.file_path
    )

    db.delete(pdf_document)
    db.commit()

    try:
        file_path.unlink(
            missing_ok=True
        )
    except OSError:
        pass

    return {
        "message": "PDF deleted"
    }
