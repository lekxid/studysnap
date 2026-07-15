import re
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.quiz import Quiz
from app.models.quiz_question import QuizQuestion
from app.models.pdf_document import PDFDocument
from app.models.study_material import StudyMaterial
from app.models.study_room import StudyRoom
from app.services.material_intelligence import analyze_material
from app.services.ai_service import generate_basic_flashcards, generate_basic_quiz


TOPIC_KEYWORDS: dict[str, list[str]] = {
    "Linux": ["linux", "ubuntu", "bash", "shell", "terminal", "chmod", "sudo", "kernel"],
    "Networking": ["network", "networking", "subnet", "router", "switch", "tcp", "udp", "osi", "dns", "dhcp", "vlan"],
    "Cybersecurity": ["cybersecurity", "security", "malware", "phishing", "encryption", "firewall", "threat"],
    "Programming": ["programming", "python", "javascript", "typescript", "java", "function", "class", "algorithm", "code"],
    "Databases": ["database", "sql", "query", "table", "primary key", "foreign key", "schema"],
    "Cloud Computing": ["cloud", "aws", "azure", "gcp", "docker", "kubernetes", "container"],
    "Anatomy": ["anatomy", "muscle", "bone", "organ", "tissue", "skeletal", "respiratory"],
    "Cardiology": ["cardiology", "heart", "cardiac", "blood pressure", "pulse", "heart failure", "cardiac output"],
    "Personal Support Worker": ["psw", "personal support worker", "resident", "client care", "adl", "infection control"],
    "Palliative Care": ["palliative", "end of life", "hospice", "comfort care", "pain management"],
    "Psychology": ["psychology", "mental health", "depression", "anxiety", "phobia", "cognitive"],
    "Physics": ["physics", "force", "motion", "energy", "velocity", "gravity", "electricity"],
    "Chemistry": ["chemistry", "atom", "molecule", "reaction", "acid", "base", "periodic table"],
    "Biology": ["biology", "cell", "dna", "organism", "ecosystem", "genetics"],
    "Math": ["math", "algebra", "calculus", "equation", "geometry", "statistics"],
    "Business": ["business", "marketing", "finance", "management", "accounting"],
}

FILENAME_STOP_WORDS = {
    "pdf", "doc", "docx", "ppt", "pptx", "png", "jpg", "jpeg", "webp",
    "screenshot", "image", "file", "document", "chapter", "week", "unit",
    "lecture", "notes", "note", "slides", "assignment", "copy", "final",
    "version", "module", "lesson", "class",
}

PDF_UPLOAD_DIR = Path("uploads/pdfs")
MATERIAL_UPLOAD_DIR = Path("uploads/materials")


@dataclass
class UploadedFileCandidate:
    file_index: int
    filename: str
    content_type: str
    size: int
    text: str
    material_type: str
    contents: bytes = b""


def normalize_text(value: str) -> str:
    cleaned = (value or "").lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def clean_topic(value: str, fallback: str = "General Study") -> str:
    cleaned = value or ""
    cleaned = re.sub(r"[_\-]+", " ", cleaned)
    cleaned = re.sub(r"[*_`>#]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return (cleaned or fallback)[:80].strip()


def topic_key(value: str) -> str:
    return normalize_text(value)


def get_material_type(filename: str, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    content_type = content_type or ""

    if content_type == "application/pdf" or suffix == ".pdf":
        return "pdf"

    if content_type.startswith("image/") or suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"

    if content_type.startswith("text/") or suffix in {".txt", ".md", ".csv"}:
        return "note"

    if suffix in {".doc", ".docx"}:
        return "word"

    if suffix in {".ppt", ".pptx"}:
        return "slides"

    if suffix in {".xls", ".xlsx"}:
        return "spreadsheet"

    return "file"


def extract_pdf_text_from_bytes(contents: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(contents))
        pages: list[str] = []

        for page in reader.pages[:8]:
            pages.append(page.extract_text() or "")

        return "\n\n".join(pages).strip()
    except Exception:
        return ""


def decode_text_bytes(contents: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return contents.decode(encoding).strip()
        except Exception:
            continue

    return ""


def extract_text_for_candidate(filename: str, content_type: str, contents: bytes) -> str:
    material_type = get_material_type(filename, content_type)

    if material_type == "pdf":
        return extract_pdf_text_from_bytes(contents)

    if material_type == "note":
        return decode_text_bytes(contents)[:200000]

    return ""


def build_candidate(
    file_index: int,
    filename: str,
    content_type: str,
    contents: bytes,
) -> UploadedFileCandidate:
    material_type = get_material_type(filename, content_type)
    text = extract_text_for_candidate(filename, content_type, contents)

    return UploadedFileCandidate(
        file_index=file_index,
        filename=filename or f"material-{file_index + 1}",
        content_type=content_type or "application/octet-stream",
        size=len(contents),
        text=text,
        material_type=material_type,
        contents=contents,
    )


def derive_topic_from_filename(filename: str) -> str:
    stem = Path(filename or "General Study").stem
    cleaned = re.sub(r"[_\-]+", " ", stem)
    cleaned = re.sub(r"\d+", " ", cleaned)

    words = [
        word
        for word in normalize_text(cleaned).split()
        if word not in FILENAME_STOP_WORDS and len(word) > 2
    ]

    if not words:
        return "General Study"

    return clean_topic(" ".join(words[:4]).title())


def detect_topic(filename: str, text: str) -> dict[str, Any]:
    filename_source = normalize_text(Path(filename or "").stem)
    full_source = f"{filename_source} {normalize_text(text[:8000])}"

    best_topic = ""
    best_score = 0

    for topic, keywords in TOPIC_KEYWORDS.items():
        score = 0

        for keyword in keywords:
            normalized_keyword = normalize_text(keyword)

            if normalized_keyword in filename_source:
                score += 6

            if normalized_keyword in full_source:
                score += 2

        if score > best_score:
            best_topic = topic
            best_score = score

    if best_topic and best_score >= 4:
        return {
            "topic": best_topic,
            "confidence": min(96, 58 + best_score * 4),
            "reason": "Matched topic keywords in the filename or readable file text.",
        }

    return {
        "topic": derive_topic_from_filename(filename),
        "confidence": 42,
        "reason": "Estimated from the file name because the topic was not obvious.",
    }


def get_existing_rooms(db: Session, owner_id: int) -> list[StudyRoom]:
    return (
        db.query(StudyRoom)
        .filter(StudyRoom.owner_id == owner_id)
        .order_by(StudyRoom.id.desc())
        .all()
    )


def find_matching_room(rooms: list[StudyRoom], topic: str) -> StudyRoom | None:
    target = topic_key(topic)

    for room in rooms:
      room_name = topic_key(room.name)
      room_subject = topic_key(getattr(room, "subject", ""))

      if target in {room_name, room_subject}:
          return room

    for room in rooms:
        room_name = topic_key(room.name)
        room_subject = topic_key(getattr(room, "subject", ""))

        if target and (target in room_name or target in room_subject):
            return room

        if room_name and room_name in target:
            return room

        if room_subject and room_subject in target:
            return room

    return None


def room_to_dict(room: StudyRoom) -> dict[str, Any]:
    return {
        "id": room.id,
        "name": room.name,
        "subject": getattr(room, "subject", ""),
        "description": getattr(room, "description", None),
        "owner_id": room.owner_id,
    }


def build_preview(
    candidates: list[UploadedFileCandidate],
    existing_rooms: list[StudyRoom],
) -> dict[str, Any]:
    detected_files: list[dict[str, Any]] = []

    for candidate in candidates:
        detection = detect_topic(candidate.filename, candidate.text)
        matching_room = find_matching_room(existing_rooms, detection["topic"])

        detected_files.append(
            {
                "file_index": candidate.file_index,
                "filename": candidate.filename,
                "size": candidate.size,
                "content_type": candidate.content_type,
                "material_type": candidate.material_type,
                "topic": detection["topic"],
                "confidence": detection["confidence"],
                "reason": detection["reason"],
                "suggested_room_id": matching_room.id if matching_room else None,
                "suggested_room_name": matching_room.name if matching_room else None,
            }
        )

    grouped: dict[str, dict[str, Any]] = {}

    for item in detected_files:
        topic = item["topic"]

        if topic not in grouped:
            grouped[topic] = {
                "topic": topic,
                "files": [],
                "confidence": 0,
                "suggested_room_id": item["suggested_room_id"],
                "suggested_room_name": item["suggested_room_name"],
            }

        grouped[topic]["files"].append(item)

    groups = list(grouped.values())

    for group in groups:
        files = group["files"]
        group["confidence"] = round(
            sum(file["confidence"] for file in files) / max(1, len(files))
        )

    groups.sort(key=lambda item: item["topic"].lower())

    return {
        "groups": groups,
        "files": detected_files,
        "existing_rooms": [room_to_dict(room) for room in existing_rooms],
    }


def create_or_get_room(db: Session, owner_id: int, topic: str) -> StudyRoom:
    existing_rooms = get_existing_rooms(db, owner_id)
    matching_room = find_matching_room(existing_rooms, topic)

    if matching_room:
        return matching_room

    clean = clean_topic(topic)

    room = StudyRoom(
        name=clean,
        subject=clean,
        description=f"Auto-created by StudySnap Smart Organizer for {clean} materials.",
        owner_id=owner_id,
    )

    db.add(room)
    db.commit()
    db.refresh(room)

    return room


def safe_suffix(filename: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if not suffix or len(suffix) > 12:
        return ".bin"
    return suffix


def save_pdf_candidate(
    db: Session,
    owner_id: int,
    room_id: int,
    candidate: UploadedFileCandidate,
) -> PDFDocument:
    PDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4()}.pdf"
    file_path = PDF_UPLOAD_DIR / stored_filename

    file_path.write_bytes(candidate.contents)

    extracted_text = extract_pdf_text_from_bytes(candidate.contents)

    pdf_document = PDFDocument(
        original_filename=candidate.filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_size=candidate.size,
        extracted_text=extracted_text,
        study_room_id=room_id,
        owner_id=owner_id,
    )

    db.add(pdf_document)
    db.commit()
    db.refresh(pdf_document)

    return pdf_document


def save_note_candidate(
    db: Session,
    owner_id: int,
    room_id: int,
    candidate: UploadedFileCandidate,
) -> Note:
    content = candidate.text.strip() or f"Uploaded note file: {candidate.filename}"

    note = Note(
        title=Path(candidate.filename).stem[:100] or "Uploaded Study Note",
        content=content,
        study_room_id=room_id,
        owner_id=owner_id,
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return note


def save_generic_material(
    db: Session,
    owner_id: int,
    room_id: int,
    candidate: UploadedFileCandidate,
) -> StudyMaterial:
    MATERIAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4()}{safe_suffix(candidate.filename)}"
    file_path = MATERIAL_UPLOAD_DIR / stored_filename

    file_path.write_bytes(candidate.contents)

    material = StudyMaterial(
        original_filename=candidate.filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_size=candidate.size,
        content_type=candidate.content_type,
        material_type=candidate.material_type,
        extracted_text=candidate.text,
        study_room_id=room_id,
        owner_id=owner_id,
    )

    db.add(material)
    db.commit()
    db.refresh(material)

    analyze_material(db, material)
    db.refresh(material)

    return material



def build_fallback_flashcards(text: str, filename: str) -> list[dict[str, str]]:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    title = Path(filename).stem or "this material"

    if not cleaned:
        return []

    chunks = [
        chunk.strip()
        for chunk in re.split(r"(?<=[.!?])\s+", cleaned)
        if len(chunk.strip()) > 40
    ]

    cards: list[dict[str, str]] = []

    for index, chunk in enumerate(chunks[:5], start=1):
        cards.append(
            {
                "question": f"What is an important study point from {title} #{index}?",
                "answer": chunk[:500],
            }
        )

    if not cards:
        cards.append(
            {
                "question": f"What is the main idea of {title}?",
                "answer": cleaned[:500],
            }
        )

    return cards[:5]


def build_fallback_quiz(text: str) -> list[dict[str, str]]:
    cleaned = re.sub(r"\s+", " ", text or "").strip()

    if not cleaned:
        return []

    chunks = [
        chunk.strip()
        for chunk in re.split(r"(?<=[.!?])\s+", cleaned)
        if len(chunk.strip()) > 40
    ]

    questions: list[dict[str, str]] = []

    for chunk in chunks[:3]:
        questions.append(
            {
                "question": "Which option best explains this study point?",
                "option_a": chunk[:180],
                "option_b": "This is unrelated to the study material.",
                "option_c": "This means the topic is not important.",
                "option_d": "This is only used outside school.",
                "correct_answer": "A",
                "explanation": chunk[:300],
            }
        )

    return questions[:3]


def generate_starter_assets_for_candidate(
    db: Session,
    owner_id: int,
    room_id: int,
    candidate: UploadedFileCandidate,
    saved_as: str,
    saved_id: int,
) -> dict[str, int]:
    text = (candidate.text or "").strip()

    if len(text) < 80:
        return {
            "flashcards": 0,
            "quizzes": 0,
            "quiz_questions": 0,
        }

    source_type = f"smart_organizer_{saved_as}"
    source_id = str(saved_id)
    limited_text = text[:12000]

    try:
        generated_cards = generate_basic_flashcards(limited_text)[:5]
    except Exception:
        generated_cards = build_fallback_flashcards(limited_text, candidate.filename)

    flashcard_count = 0

    for card in generated_cards:
        question = str(card.get("question", "")).strip()
        answer = str(card.get("answer", "")).strip()

        if not question or not answer:
            continue

        db.add(
            Flashcard(
                question=question[:2000],
                answer=answer[:4000],
                tags=f"smart-organizer,{candidate.material_type}",
                difficulty="medium",
                source_type=source_type,
                source_id=source_id,
                study_room_id=room_id,
                owner_id=owner_id,
            )
        )
        flashcard_count += 1

    quiz_count = 0
    quiz_question_count = 0

    try:
        generated_questions = generate_basic_quiz(limited_text)[:3]
    except Exception:
        generated_questions = build_fallback_quiz(limited_text)

    valid_questions = []

    for item in generated_questions:
        question = str(item.get("question", "")).strip()
        option_a = str(item.get("option_a", "")).strip()
        option_b = str(item.get("option_b", "")).strip()
        option_c = str(item.get("option_c", "")).strip()
        option_d = str(item.get("option_d", "")).strip()
        correct_answer = str(item.get("correct_answer", "A")).strip().upper()[:1]
        explanation = str(item.get("explanation", "")).strip()

        if not question or not option_a or not option_b or not option_c or not option_d:
            continue

        if correct_answer not in {"A", "B", "C", "D"}:
            correct_answer = "A"

        valid_questions.append(
            {
                "question": question,
                "option_a": option_a,
                "option_b": option_b,
                "option_c": option_c,
                "option_d": option_d,
                "correct_answer": correct_answer,
                "explanation": explanation,
            }
        )

    if valid_questions:
        quiz = Quiz(
            title=f"Starter Quiz: {Path(candidate.filename).stem[:70] or 'Study Material'}",
            study_room_id=room_id,
            owner_id=owner_id,
        )

        db.add(quiz)
        db.commit()
        db.refresh(quiz)
        quiz_count = 1

        for item in valid_questions[:3]:
            db.add(
                QuizQuestion(
                    quiz_id=quiz.id,
                    question=item["question"][:2000],
                    option_a=item["option_a"][:1000],
                    option_b=item["option_b"][:1000],
                    option_c=item["option_c"][:1000],
                    option_d=item["option_d"][:1000],
                    correct_answer=item["correct_answer"],
                    explanation=item["explanation"][:2000] if item["explanation"] else None,
                )
            )
            quiz_question_count += 1

    db.commit()

    return {
        "flashcards": flashcard_count,
        "quizzes": quiz_count,
        "quiz_questions": quiz_question_count,
    }


def organize_candidates(
    db: Session,
    owner_id: int,
    candidates: list[UploadedFileCandidate],
    assignments: dict[str, str] | None = None,
) -> dict[str, Any]:
    assignments = assignments or {}

    results: list[dict[str, Any]] = []
    rooms_by_topic: dict[str, StudyRoom] = {}
    generated_flashcards = 0
    generated_quizzes = 0
    generated_quiz_questions = 0

    for candidate in candidates:
        assigned_topic = assignments.get(str(candidate.file_index))
        topic = clean_topic(assigned_topic or detect_topic(candidate.filename, candidate.text)["topic"])
        key = topic_key(topic)

        room = rooms_by_topic.get(key)

        if not room:
            room = create_or_get_room(db, owner_id, topic)
            rooms_by_topic[key] = room

        if candidate.material_type == "pdf":
            saved = save_pdf_candidate(db, owner_id, room.id, candidate)
            saved_as = "pdf"
            saved_id = saved.id
        elif candidate.material_type == "note":
            saved = save_note_candidate(db, owner_id, room.id, candidate)
            saved_as = "note"
            saved_id = saved.id
        else:
            saved = save_generic_material(db, owner_id, room.id, candidate)
            saved_as = "material"
            saved_id = saved.id

        starter_assets = generate_starter_assets_for_candidate(
            db=db,
            owner_id=owner_id,
            room_id=room.id,
            candidate=candidate,
            saved_as=saved_as,
            saved_id=saved_id,
        )

        generated_flashcards += starter_assets["flashcards"]
        generated_quizzes += starter_assets["quizzes"]
        generated_quiz_questions += starter_assets["quiz_questions"]

        results.append(
            {
                "filename": candidate.filename,
                "material_type": candidate.material_type,
                "topic": topic,
                "room": room_to_dict(room),
                "saved_as": saved_as,
                "saved_id": saved_id,
                "generated_flashcards": starter_assets["flashcards"],
                "generated_quizzes": starter_assets["quizzes"],
                "generated_quiz_questions": starter_assets["quiz_questions"],
            }
        )

    return {
        "organized_count": len(results),
        "rooms": [room_to_dict(room) for room in rooms_by_topic.values()],
        "generated_flashcards": generated_flashcards,
        "generated_quizzes": generated_quizzes,
        "generated_quiz_questions": generated_quiz_questions,
        "items": results,
    }
