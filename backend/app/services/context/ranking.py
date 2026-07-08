import re
from collections import Counter
from collections.abc import Callable
from typing import TypeVar


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "from", "how", "i", "in", "is", "it", "me", "my",
    "of", "on", "or", "that", "the", "this", "to", "what",
    "when", "where", "which", "who", "why", "with", "you",
}

T = TypeVar("T")


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9]+", (text or "").lower())


def extract_keywords(text: str) -> set[str]:
    return {
        word
        for word in tokenize(text)
        if len(word) >= 3 and word not in STOPWORDS
    }


def relevance_score(query: str, text: str) -> int:
    """
    Weighted keyword ranking.

    Scoring:
      +10 exact phrase
      +3 per shared keyword
      +1 per repeated keyword occurrence
    """

    query = (query or "").strip().lower()
    text = (text or "").strip().lower()

    if not query or not text:
        return 0

    score = 0

    if query in text:
        score += 10

    query_keywords = extract_keywords(query)
    text_keywords = extract_keywords(text)

    overlap = query_keywords.intersection(text_keywords)

    score += len(overlap) * 3

    counts = Counter(tokenize(text))

    for keyword in overlap:
        if counts[keyword] > 1:
            score += counts[keyword] - 1

    return score


def rank_items(
    query: str,
    items: list[T],
    text_getter: Callable[[T], str],
    limit: int,
) -> list[T]:
    """
    Rank provider items by relevance.

    Falls back to the original order when no item matches.
    """

    if not items:
        return []

    ranked = [
        (relevance_score(query, text_getter(item)), index, item)
        for index, item in enumerate(items)
    ]

    matches = [entry for entry in ranked if entry[0] > 0]

    if not matches:
        return items[:limit]

    matches.sort(key=lambda x: (-x[0], x[1]))

    return [item for _, _, item in matches[:limit]]
