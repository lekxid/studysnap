import re
from collections.abc import Callable
from typing import TypeVar


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "from", "how", "i", "in", "is", "it", "me", "my",
    "of", "on", "or", "that", "the", "this", "to", "what",
    "when", "where", "which", "who", "why", "with", "you",
}


T = TypeVar("T")


def extract_keywords(text: str) -> set[str]:
    """
    Extract simple keywords from student text.

    This is intentionally lightweight.
    Later, StudySnap can replace this with embeddings or semantic ranking.
    """

    words = re.findall(r"[a-zA-Z0-9]+", (text or "").lower())

    return {
        word
        for word in words
        if len(word) >= 3 and word not in STOPWORDS
    }


def relevance_score(query: str, text: str) -> int:
    """
    Score text relevance using keyword overlap.
    """

    query_keywords = extract_keywords(query)
    text_keywords = extract_keywords(text)

    if not query_keywords or not text_keywords:
        return 0

    return len(query_keywords.intersection(text_keywords))


def rank_items(
    query: str,
    items: list[T],
    text_getter: Callable[[T], str],
    limit: int,
) -> list[T]:
    """
    Rank provider items by relevance to the student question.

    If no items match, fallback to the original item order.
    This keeps StudySnap reliable even when the query is vague.
    """

    if not items:
        return []

    ranked_items = []

    for item in items:
        searchable_text = text_getter(item)
        score = relevance_score(query, searchable_text)
        ranked_items.append((score, item))

    matching_items = [
        (score, item)
        for score, item in ranked_items
        if score > 0
    ]

    if not matching_items:
        return items[:limit]

    matching_items.sort(key=lambda pair: pair[0], reverse=True)

    return [
        item
        for score, item in matching_items[:limit]
    ]
