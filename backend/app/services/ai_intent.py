from __future__ import annotations

import re


WEB_SOURCE_INSTRUCTIONS = """
When web search is used:

- Resolve short references from the supplied conversation history before
  searching. For example, after the user identifies an app and then says
  "check internet", search for the active app/topic instead of explaining
  how to test an internet connection.
- Use the web-search tool before claiming that current information was
  checked.
- Prefer official sources, government sources, primary documentation, and
  established publishers.
- Distinguish confirmed facts from reasonable suggestions.
- Include a short Sources section when links are available.
- Format source links as normal Markdown links containing complete HTTPS
  URLs, for example: [Official source](https://example.com/page).
- Never invent a source, URL, date, price, policy, or search result.
- Say briefly when reliable confirmation could not be found.
""".strip()


_EXPLICIT_WEB_PATTERNS = (
    r"\bsearch\s+(?:the\s+)?(?:web|internet|online)\b",
    r"\b(?:check|chk)\s+(?:the\s+)?(?:web|internet|online)\b",
    r"\b(?:look|check)\s+it\s+up\b",
    r"\bsearch\s+it\b",
    r"\bbrowse\s+(?:for|the|online|web|internet)\b",
    r"\bverify\s+(?:it\s+)?(?:online|on\s+the\s+web|on\s+the\s+internet)\b",
    r"\bfind\s+(?:the\s+)?latest\b",
    r"\bfind\s+(?:current|recent|up[- ]to[- ]date)\b",
    r"\bgive\s+me\s+(?:the\s+)?sources?\b",
    r"\bcheck\s+sources?\b",
)

_CURRENT_INFORMATION_PATTERNS = (
    r"\bcurrent\b",
    r"\blatest\b",
    r"\btoday\b",
    r"\bthis\s+week\b",
    r"\brecent(?:ly)?\b",
    r"\bnow\b",
    r"\bup[- ]to[- ]date\b",
    r"\bnews\b",
    r"\bprice\b",
    r"\bweather\b",
    r"\bschedule\b",
    r"\bopening\s+hours?\b",
    r"\bwho\s+is\s+(?:the\s+)?current\b",
)

_CONNECTIVITY_ONLY_PATTERNS = (
    r"\binternet\s+connection\b",
    r"\bwi[- ]?fi\b",
    r"\bmobile\s+data\b",
    r"\brouter\b",
    r"\bspeed\s+test\b",
    r"\bnetwork\s+connection\b",
)


def normalize_intent_text(
    value: str | None,
) -> str:
    return re.sub(
        r"\s+",
        " ",
        str(value or "").lower(),
    ).strip()


def has_explicit_web_request(
    value: str | None,
) -> bool:
    normalized = normalize_intent_text(
        value
    )

    return any(
        re.search(
            pattern,
            normalized,
            flags=re.IGNORECASE,
        )
        for pattern in _EXPLICIT_WEB_PATTERNS
    )


def should_use_web_search(
    question: str,
    context: str = "",
) -> bool:
    question_text = normalize_intent_text(
        question
    )

    if has_explicit_web_request(
        question_text
    ):
        return True

    connectivity_only = any(
        re.search(
            pattern,
            question_text,
            flags=re.IGNORECASE,
        )
        for pattern
        in _CONNECTIVITY_ONLY_PATTERNS
    )

    if connectivity_only:
        return False

    return any(
        re.search(
            pattern,
            question_text,
            flags=re.IGNORECASE,
        )
        for pattern
        in _CURRENT_INFORMATION_PATTERNS
    )
