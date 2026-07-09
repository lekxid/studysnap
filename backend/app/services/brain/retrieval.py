from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.orm import Session

from app.models.brain_memory import BrainMemory
from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.pdf_document import PDFDocument
from app.models.user import User
from app.services.brain.chunker import chunk_text


STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could",
    "did", "do", "does", "for", "from", "give", "go", "had", "has", "have",
    "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in",
    "into", "is", "it", "its", "me", "my", "need", "needs", "of", "on",
    "or", "our", "please", "she", "should", "show", "so", "that", "the",
    "their", "them", "then", "there", "they", "this", "to", "was", "we",
    "were", "what", "when", "where", "which", "who", "why", "will",
    "with", "would", "you", "your",
}


@dataclass
class RetrievalItem:
    source_type: str
    source_id: str
    title: str
    text: str
    score: float
    reason: str
    metadata: dict[str, Any]


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _raw_tokens(value: str) -> list[str]:
    value = value.lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)

    tokens: list[str] = []

    for token in value.split():
        token = token.strip()
        if not token:
            continue

        if len(token) >= 3 or (len(token) >= 2 and any(char.isdigit() for char in token)):
            tokens.append(token)

    return tokens


def tokenize(value: str, *, remove_stop_words: bool = True) -> set[str]:
    tokens = set(_raw_tokens(value))

    if remove_stop_words:
        tokens = {token for token in tokens if token not in STOP_WORDS}

    return tokens


def shorten(value: str, limit: int = 700) -> str:
    value = normalize_text(value)
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def score_text(query: str, title: str, text: str) -> tuple[float, str]:
    query_clean = normalize_text(query).lower()
    title_clean = normalize_text(title).lower()
    text_clean = normalize_text(text).lower()
    target_clean = f"{title_clean} {text_clean}"

    query_tokens = tokenize(query_clean, remove_stop_words=True)
    title_tokens = tokenize(title_clean, remove_stop_words=True)
    text_tokens = tokenize(text_clean, remove_stop_words=True)
    target_tokens = title_tokens.union(text_tokens)

    if not query_tokens:
        return 0.0, "No meaningful searchable terms."

    if not target_tokens:
        return 0.0, "No searchable source text."

    overlap = query_tokens.intersection(target_tokens)

    if not overlap:
        return 0.0, "No meaningful term match."

    title_overlap = query_tokens.intersection(title_tokens)

    overlap_ratio = len(overlap) / max(len(query_tokens), 1)
    title_overlap_ratio = len(title_overlap) / max(len(query_tokens), 1)

    similarity = SequenceMatcher(
        None,
        query_clean,
        target_clean[:900],
    ).ratio()

    exact_title_bonus = 0.16 if query_clean and query_clean in title_clean else 0.0
    exact_text_bonus = 0.10 if query_clean and query_clean in text_clean else 0.0

    query_phrase_bonus = 0.0
    if len(query_tokens) >= 2:
        phrase_hits = sum(1 for token in query_tokens if token in target_tokens)
        if phrase_hits >= 2:
            query_phrase_bonus = 0.08

    all_terms_bonus = 0.08 if overlap == query_tokens else 0.0

    score = min(
        1.0,
        (overlap_ratio * 0.62)
        + (title_overlap_ratio * 0.16)
        + (similarity * 0.04)
        + exact_title_bonus
        + exact_text_bonus
        + query_phrase_bonus
        + all_terms_bonus,
    )

    reason = "Matched important terms: " + ", ".join(sorted(overlap)[:8])

    return round(score, 4), reason


def retrieval_item_to_dict(item: RetrievalItem) -> dict[str, Any]:
    return {
        "source_type": item.source_type,
        "source_id": item.source_id,
        "title": item.title,
        "text": item.text,
        "score": item.score,
        "reason": item.reason,
        "metadata": item.metadata,
    }


def retrieve_notes(
    db: Session,
    current_user: User,
    query: str,
    study_room_id: int | None = None,
) -> list[RetrievalItem]:
    notes_query = db.query(Note).filter(Note.owner_id == current_user.id)

    if study_room_id is not None:
        notes_query = notes_query.filter(Note.study_room_id == study_room_id)

    items: list[RetrievalItem] = []

    for note in notes_query.order_by(Note.created_at.desc()).limit(60).all():
        full_text = normalize_text(note.content)
        if not full_text:
            continue

        chunks = chunk_text(full_text, chunk_size=900, overlap=150)

        for chunk in chunks[:80]:
            score, reason = score_text(
                query=query,
                title=note.title,
                text=chunk.text,
            )

            if score >= 0.16:
                items.append(
                    RetrievalItem(
                        source_type="note_chunk",
                        source_id=f"{note.id}:{chunk.index}",
                        title=f"{note.title} — chunk {chunk.index + 1}",
                        text=shorten(chunk.text, limit=700),
                        score=score,
                        reason=reason,
                        metadata={
                            "note_id": note.id,
                            "chunk_index": chunk.index,
                            "chunk_start": chunk.start,
                            "chunk_end": chunk.end,
                            "study_room_id": note.study_room_id,
                            "created_at": note.created_at.isoformat()
                            if note.created_at
                            else None,
                        },
                    )
                )

    return items


def retrieve_pdfs(
    db: Session,
    current_user: User,
    query: str,
    study_room_id: int | None = None,
) -> list[RetrievalItem]:
    pdf_query = db.query(PDFDocument).filter(PDFDocument.owner_id == current_user.id)

    if study_room_id is not None:
        pdf_query = pdf_query.filter(PDFDocument.study_room_id == study_room_id)

    items: list[RetrievalItem] = []

    for pdf in pdf_query.order_by(PDFDocument.created_at.desc()).limit(40).all():
        full_text = normalize_text(pdf.extracted_text)
        if not full_text:
            continue

        chunks = chunk_text(full_text, chunk_size=1200, overlap=200)

        for chunk in chunks[:120]:
            score, reason = score_text(
                query=query,
                title=pdf.original_filename,
                text=chunk.text,
            )

            if score >= 0.14:
                items.append(
                    RetrievalItem(
                        source_type="pdf_chunk",
                        source_id=f"{pdf.id}:{chunk.index}",
                        title=f"{pdf.original_filename} — chunk {chunk.index + 1}",
                        text=shorten(chunk.text, limit=900),
                        score=score,
                        reason=reason,
                        metadata={
                            "pdf_id": pdf.id,
                            "chunk_index": chunk.index,
                            "chunk_start": chunk.start,
                            "chunk_end": chunk.end,
                            "study_room_id": pdf.study_room_id,
                            "file_size": pdf.file_size,
                            "created_at": pdf.created_at.isoformat()
                            if pdf.created_at
                            else None,
                        },
                    )
                )

    return items


def retrieve_flashcards(
    db: Session,
    current_user: User,
    query: str,
    study_room_id: int | None = None,
) -> list[RetrievalItem]:
    flashcard_query = db.query(Flashcard).filter(Flashcard.owner_id == current_user.id)

    if study_room_id is not None:
        flashcard_query = flashcard_query.filter(
            Flashcard.study_room_id == study_room_id
        )

    items: list[RetrievalItem] = []

    for card in flashcard_query.order_by(Flashcard.created_at.desc()).limit(80).all():
        title = card.question
        text = f"Question: {card.question}\nAnswer: {card.answer}\nTags: {card.tags}"
        score, reason = score_text(query=query, title=title, text=text)

        if score >= 0.20:
            items.append(
                RetrievalItem(
                    source_type="flashcard",
                    source_id=str(card.id),
                    title=shorten(card.question, limit=120),
                    text=shorten(text),
                    score=score,
                    reason=reason,
                    metadata={
                        "study_room_id": card.study_room_id,
                        "difficulty": card.difficulty,
                        "source_type": card.source_type,
                        "source_id": card.source_id,
                        "created_at": card.created_at.isoformat()
                        if card.created_at
                        else None,
                    },
                )
            )

    return items


def retrieve_memories(
    db: Session,
    current_user: User,
    query: str,
    study_room_id: int | None = None,
) -> list[RetrievalItem]:
    memory_query = db.query(BrainMemory).filter(BrainMemory.user_id == current_user.id)

    if study_room_id is not None:
        memory_query = memory_query.filter(BrainMemory.study_room_id == study_room_id)

    items: list[RetrievalItem] = []

    for memory in memory_query.order_by(BrainMemory.updated_at.desc()).limit(80).all():
        title = memory.concept_name
        text = (
            f"Concept: {memory.concept_name}\n"
            f"Type: {memory.concept_type}\n"
            f"Strength: {memory.strength}\n"
            f"Confidence: {memory.confidence}\n"
            f"Mastery score: {memory.mastery_score}\n"
            f"Needs review: {memory.needs_review}"
        )

        score, reason = score_text(query=query, title=title, text=text)

        review_boost = 0.08 if memory.needs_review and score > 0 else 0.0
        weakness_boost = (
            0.06 if memory.strength in {"new", "weak", "developing"} and score > 0 else 0.0
        )
        final_score = min(1.0, round(score + review_boost + weakness_boost, 4))

        if final_score >= 0.16:
            items.append(
                RetrievalItem(
                    source_type="brain_memory",
                    source_id=str(memory.id),
                    title=memory.concept_name,
                    text=shorten(text),
                    score=final_score,
                    reason=reason,
                    metadata={
                        "study_room_id": memory.study_room_id,
                        "concept_id": memory.concept_id,
                        "concept_type": memory.concept_type,
                        "strength": memory.strength,
                        "confidence": memory.confidence,
                        "mastery_score": memory.mastery_score,
                        "needs_review": memory.needs_review,
                        "updated_at": memory.updated_at.isoformat()
                        if memory.updated_at
                        else None,
                    },
                )
            )

    return items


def dedupe_key(item: RetrievalItem) -> str:
    text = item.text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return " ".join(text.split()[:40])


def rank_results(items: list[RetrievalItem]) -> list[RetrievalItem]:
    return sorted(
        items,
        key=lambda item: (
            item.score,
            1 if item.source_type in {"pdf_chunk", "note_chunk"} else 0,
        ),
        reverse=True,
    )


def remove_duplicates(items: list[RetrievalItem]) -> list[RetrievalItem]:
    kept: list[RetrievalItem] = []
    seen: set[str] = set()

    for item in rank_results(items):
        key = dedupe_key(item)
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        kept.append(item)

    return kept


def build_context_text(items: list[RetrievalItem]) -> str:
    blocks: list[str] = []

    for index, item in enumerate(items, start=1):
        blocks.append(
            f"[{index}] {item.source_type.upper()} — {item.title}\n"
            f"Score: {item.score}\n"
            f"Reason: {item.reason}\n"
            f"{item.text}"
        )

    return "\n\n---\n\n".join(blocks)


def retrieve_learning_context(
    db: Session,
    current_user: User,
    query: str,
    study_room_id: int | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """
    Brain Retrieval Engine v1.1.

    Finds the most relevant learning content instead of dumping everything
    into the AI prompt.
    """

    query = normalize_text(query)
    safe_limit = max(1, min(limit, 20))

    if not query:
        return {
            "query": query,
            "study_room_id": study_room_id,
            "total_results": 0,
            "results": [],
            "context_text": "",
            "message": "Add a search query to retrieve learning context.",
        }

    items: list[RetrievalItem] = []
    items.extend(
        retrieve_notes(
            db=db,
            current_user=current_user,
            query=query,
            study_room_id=study_room_id,
        )
    )
    items.extend(
        retrieve_pdfs(
            db=db,
            current_user=current_user,
            query=query,
            study_room_id=study_room_id,
        )
    )
    items.extend(
        retrieve_flashcards(
            db=db,
            current_user=current_user,
            query=query,
            study_room_id=study_room_id,
        )
    )
    items.extend(
        retrieve_memories(
            db=db,
            current_user=current_user,
            query=query,
            study_room_id=study_room_id,
        )
    )

    ranked_items = remove_duplicates(items)
    top_items = ranked_items[:safe_limit]

    return {
        "query": query,
        "study_room_id": study_room_id,
        "total_results": len(top_items),
        "results": [retrieval_item_to_dict(item) for item in top_items],
        "context_text": build_context_text(top_items),
    }
