from app.services.brain.concepts import extract_concepts
from app.services.brain.knowledge_graph import build_knowledge_graph


SUBJECT_KEYWORDS = {
    "healthcare": {
        "anatomy", "assessment", "blood", "cardiac", "cardiology",
        "care", "heart", "medical", "nursing", "oxygen", "patient",
        "psw", "respiratory", "vital",
    },
    "technology": {
        "api", "backend", "code", "component", "database", "frontend",
        "function", "javascript", "next", "python", "react", "server",
        "typescript",
    },
    "business": {
        "business", "customer", "finance", "market", "marketing",
        "product", "revenue", "sales", "startup", "strategy",
    },
    "science": {
        "biology", "cell", "chemical", "chemistry", "energy",
        "experiment", "physics", "science",
    },
    "math": {
        "algebra", "calculus", "equation", "formula", "geometry",
        "graph", "number", "probability", "statistics",
    },
}


DOCUMENT_TYPE_KEYWORDS = {
    "lecture_notes": {"lecture", "notes", "chapter", "week", "slides"},
    "study_notes": {"summary", "review", "definition", "explain", "examples"},
    "quiz_or_test": {"quiz", "test", "exam", "question", "answer", "multiple"},
    "assignment": {"assignment", "rubric", "submit", "reflection", "essay"},
    "clinical_material": {"patient", "assessment", "care", "symptom", "vital"},
}


def tokenize_for_analysis(text: str) -> list[str]:
    return [
        word.strip(".,:;!?()[]{}").lower()
        for word in (text or "").split()
        if word.strip(".,:;!?()[]{}")
    ]


def score_keyword_groups(words: list[str], groups: dict[str, set[str]]) -> dict[str, int]:
    word_set = set(words)

    return {
        name: len(word_set.intersection(keywords))
        for name, keywords in groups.items()
    }


def best_label(scores: dict[str, int], fallback: str = "general") -> str:
    if not scores:
        return fallback

    label, score = max(scores.items(), key=lambda item: item[1])

    if score <= 0:
        return fallback

    return label


def estimate_difficulty(text: str, concepts: list[str]) -> str:
    words = tokenize_for_analysis(text)
    word_count = len(words)
    concept_count = len(concepts)
    average_word_length = (
        sum(len(word) for word in words) / word_count
        if word_count
        else 0
    )

    if word_count > 800 or concept_count >= 10 or average_word_length >= 7:
        return "advanced"

    if word_count > 250 or concept_count >= 5 or average_word_length >= 6:
        return "intermediate"

    if word_count > 0:
        return "beginner"

    return "unknown"


def estimate_confidence(concepts: list[str], subject: str, document_type: str) -> float:
    confidence = 0.0

    if concepts:
        confidence += 0.45

    if subject != "general":
        confidence += 0.25

    if document_type != "unknown":
        confidence += 0.20

    if len(concepts) >= 5:
        confidence += 0.10

    return round(min(confidence, 0.95), 2)


def analyze_text(text: str) -> dict:
    """
    Learning Analyzer v1.

    This is the intelligence entry point for StudySnap Brain.

    It detects:
    - subject/domain
    - document type
    - concepts
    - difficulty
    - learning signals
    - knowledge graph
    """

    words = tokenize_for_analysis(text)
    concepts = extract_concepts(text)
    knowledge_graph = build_knowledge_graph(text)

    subject_scores = score_keyword_groups(words, SUBJECT_KEYWORDS)
    document_type_scores = score_keyword_groups(words, DOCUMENT_TYPE_KEYWORDS)

    subject = best_label(subject_scores, fallback="general")
    document_type = best_label(document_type_scores, fallback="unknown")
    difficulty = estimate_difficulty(text, concepts)
    confidence = estimate_confidence(concepts, subject, document_type)

    learning_signals = {
        "has_content": bool((text or "").strip()),
        "word_count": len(words),
        "concept_density": round(len(concepts) / max(len(words), 1), 3),
        "needs_ai_review": confidence < 0.65,
    }

    return {
        "subject": subject,
        "document_type": document_type,
        "difficulty": difficulty,
        "concepts": concepts,
        "concept_count": len(concepts),
        "primary_topic": concepts[0] if concepts else None,
        "confidence": confidence,
        "learning_signals": learning_signals,
        "knowledge_graph": knowledge_graph,
    }
