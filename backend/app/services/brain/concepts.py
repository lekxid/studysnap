import re
from collections import Counter

from app.services.context.ranking import STOPWORDS, tokenize


EXTRA_STOPWORDS = {
    "able", "about", "above", "after", "again", "also", "because",
    "before", "between", "course", "define", "during", "example",
    "examples", "explain", "following", "important", "include",
    "includes", "including", "into", "learn", "lecture", "lesson",
    "material", "materials", "notes", "page", "pages", "pdf",
    "question", "questions", "review", "section", "student",
    "students", "study", "summary", "teacher", "topic", "topics",
    "understand", "using", "week", "will", "would", "concept",
    "concepts", "cannot", "could", "should", "happen", "happens",
    "studies", "affect", "affects", "connected", "properly", "really", "very", "when", "where",
    "what", "which",
}

LOW_VALUE_WORDS = {
    "able", "cannot", "could", "does", "done", "happen", "happens",
    "affect", "affects", "connected", "help", "helps", "make", "makes", "need", "needs", "properly",
    "really", "show", "shows", "studies", "thing", "things", "want",
    "wants", "will", "would",
}

ACADEMIC_ENDINGS = (
    "tion", "sion", "ment", "ness", "ity", "ism", "ology", "graphy",
    "meter", "scope", "pathy", "emia", "osis", "itis",
)

KNOWN_PHRASE_HINTS = {
    "blood pressure",
    "cardiac output",
    "heart failure",
    "oxygen saturation",
    "respiratory rate",
    "stroke volume",
}


def clean_concept(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s\-]", " ", value or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.title()


def concept_key(value: str) -> str:
    return " ".join(tokenize(value))


def is_low_value_word(word: str) -> bool:
    return (
        word in STOPWORDS
        or word in EXTRA_STOPWORDS
        or word in LOW_VALUE_WORDS
        or len(word) < 3
    )


def looks_academic(word: str) -> bool:
    return len(word) >= 5 and word.endswith(ACADEMIC_ENDINGS)


def is_good_concept(value: str) -> bool:
    words = tokenize(value)

    if not words:
        return False

    if len(words) > 4:
        return False

    meaningful_words = [word for word in words if not is_low_value_word(word)]

    if not meaningful_words:
        return False

    if len(words) == 1:
        word = words[0]
        return (
            len(word) >= 4
            and not is_low_value_word(word)
            and (
                looks_academic(word)
                or len(word) >= 6
            )
        )

    return len(meaningful_words) >= 1


def extract_capitalized_phrases(text: str, limit: int = 20) -> list[str]:
    pattern = r"\b(?:[A-Z][a-zA-Z0-9\-]{2,})(?:\s+[A-Z][a-zA-Z0-9\-]{2,}){0,3}\b"
    phrases = re.findall(pattern, text or "")

    concepts = []
    seen = set()

    for phrase in phrases:
        concept = clean_concept(phrase)
        key = concept_key(concept)

        if key in seen or not is_good_concept(concept):
            continue

        seen.add(key)
        concepts.append(concept)

        if len(concepts) >= limit:
            break

    return concepts


def extract_noun_like_phrases(text: str, limit: int = 30) -> list[str]:
    """
    Conservative 2-word learning phrase extractor.

    Keeps strong phrases like:
    - oxygen saturation
    - cardiac output
    - blood pressure

    Avoids list-neighbor junk like:
    - preload afterload
    - afterload oxygen
    """

    segments = re.split(r"[.;:\n,]", text or "")
    candidates = []

    for segment in segments:
        tokens = tokenize(segment)

        for index in range(len(tokens) - 1):
            first = tokens[index]
            second = tokens[index + 1]

            if is_low_value_word(first) or is_low_value_word(second):
                continue

            phrase_key = f"{first} {second}"

            keep_phrase = (
                phrase_key in KNOWN_PHRASE_HINTS
                or looks_academic(first)
                or looks_academic(second)
                or first.endswith("ic")
                or second.endswith(("tion", "sion", "ment", "ity"))
            )

            if not keep_phrase:
                continue

            phrase = clean_concept(phrase_key)

            if is_good_concept(phrase):
                candidates.append(phrase)

    counts = Counter(candidates)

    concepts = []
    seen = set()

    for phrase, _ in counts.most_common(limit * 2):
        key = concept_key(phrase)

        if key in seen:
            continue

        seen.add(key)
        concepts.append(phrase)

        if len(concepts) >= limit:
            break

    return concepts


def extract_keyword_concepts(text: str, limit: int = 20) -> list[str]:
    words = [
        word
        for word in tokenize(text or "")
        if not is_low_value_word(word)
    ]

    counts = Counter(words)
    common_words = [word for word, _ in counts.most_common(limit * 3)]

    concepts = []
    seen = set()

    for word in common_words:
        concept = clean_concept(word)
        key = concept_key(concept)

        if key in seen or not is_good_concept(concept):
            continue

        seen.add(key)
        concepts.append(concept)

        if len(concepts) >= limit:
            break

    return concepts


def remove_nested_concepts(concepts: list[str]) -> list[str]:
    result = []

    for concept in concepts:
        key = concept_key(concept)
        words = set(tokenize(concept))

        is_nested = False

        for existing in result:
            existing_words = set(tokenize(existing))

            if len(words) == 1 and words.issubset(existing_words):
                is_nested = True
                break

            if key == concept_key(existing):
                is_nested = True
                break

        if not is_nested:
            result.append(concept)

    return result


def extract_concepts(text: str, limit: int = 12) -> list[str]:
    """
    Rule-based Concept Engine v2.2.

    Extracts cleaner learning concepts using:
    - capitalized academic phrases
    - conservative noun-like phrases
    - meaningful keywords
    """

    if not (text or "").strip():
        return []

    candidates = []
    candidates.extend(extract_capitalized_phrases(text, limit=limit))
    candidates.extend(extract_noun_like_phrases(text, limit=limit * 2))
    candidates.extend(extract_keyword_concepts(text, limit=limit))

    concepts = []
    seen = set()

    for candidate in candidates:
        key = concept_key(candidate)

        if key in seen or not is_good_concept(candidate):
            continue

        seen.add(key)
        concepts.append(candidate)

    concepts = remove_nested_concepts(concepts)

    return concepts[:limit]
