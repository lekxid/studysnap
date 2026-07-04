import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pdf_document import PDFDocument
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.ai_service import generate_studysnap_answer
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
            pages.append(page.extract_text() or "")

        return "\n\n".join(pages).strip()
    except Exception:
        return ""


@router.get("/{study_room_id}")
def get_pdfs(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PDFDocument)
        .filter(
            PDFDocument.study_room_id == study_room_id,
            PDFDocument.owner_id == current_user.id,
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
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == study_room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="PDF file is too large. Maximum size is 10MB.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original_filename = file.filename or "document.pdf"
    stored_filename = f"{uuid.uuid4()}.pdf"
    file_path = UPLOAD_DIR / stored_filename

    with open(file_path, "wb") as output_file:
        output_file.write(contents)

    extracted_text = extract_pdf_text(file_path)

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


@router.post("/{pdf_id}/summary")
def summarize_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.id == pdf_id,
            PDFDocument.owner_id == current_user.id,
        )
        .first()
    )

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not pdf_document.extracted_text:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this PDF.",
        )

    text = pdf_document.extracted_text[:12000]

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

    summary = generate_studysnap_answer(prompt)

    return {
        "pdf_id": pdf_document.id,
        "filename": pdf_document.original_filename,
        "summary": summary,
    }


@router.post("/{pdf_id}/chat")
def chat_with_pdf(
    pdf_id: int,
    data: PDFChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.id == pdf_id,
            PDFDocument.owner_id == current_user.id,
        )
        .first()
    )

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not pdf_document.extracted_text:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this PDF.",
        )

    text = pdf_document.extracted_text[:12000]

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
{data.question}
"""

    answer = generate_studysnap_answer(prompt)

    return {
        "pdf_id": pdf_document.id,
        "filename": pdf_document.original_filename,
        "question": data.question,
        "answer": answer,
    }


@router.delete("/{pdf_id}")
def delete_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf_document = (
        db.query(PDFDocument)
        .filter(
            PDFDocument.id == pdf_id,
            PDFDocument.owner_id == current_user.id,
        )
        .first()
    )

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF not found")

    file_path = Path(pdf_document.file_path)

    if file_path.exists():
        os.remove(file_path)

    db.delete(pdf_document)
    db.commit()

    return {"message": "PDF deleted"}