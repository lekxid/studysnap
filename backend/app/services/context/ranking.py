import re


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "from", "how", "i", "in", "is", "it", "me", "my",
    "of", "on", "or", "that", "the", "this", "to", "what",
    "when", "where", "which", "who", "why", "with", "you",
}


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
