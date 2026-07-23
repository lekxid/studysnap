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
- When the user asks to download, install, open, listen to, watch, or get
  something, first identify which action they mean.
- For an app, search for and provide verified official App Store, Google
  Play, Microsoft Store, or developer-site destinations when available.
- For copyrighted music, video, books, games, or other commercial media,
  do not claim to provide an unauthorized downloadable file. Provide
  verified legal listening, viewing, purchase, rental, or library options.
- For a StudySnap-generated file or a file the user already owns, do not
  search for an unrelated public download. Refer to the available
  StudySnap file action instead.
- Put the most useful verified destinations near the answer and format
  every destination as a complete Markdown HTTPS link.
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


_DOWNLOAD_ACTION_PATTERNS = (
    r"\bdownload\s+[^\s]",
    r"\binstall\s+[^\s]",
    r"\bget\s+(?:the\s+)?[^\n]{1,80}\b(?:app|application)\b",
    r"\bwhere\s+can\s+i\s+(?:download|install|get|listen|watch|buy|rent)\b",
    r"\b(?:app\s+store|google\s+play|play\s+store|microsoft\s+store)\b",
)

_LOCAL_FILE_DOWNLOAD_PATTERNS = (
    r"\bdownload\s+(?:this|that|the|my|your)\s+"
    r"(?:(?:generated|uploaded|created|made)\s+)?"
    r"(?:file|pdf|document|docx|image|photo|note|report|assignment|presentation|slides?)\b",
    r"\bdownload\s+(?:the\s+)?file\s+(?:i|you)\s+(?:uploaded|created|made|generated)\b",
    r"\bsave\s+(?:this|that|the|my|your)\s+"
    r"(?:file|pdf|document|image|note|report)\b",
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


def has_download_action_request(
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
        for pattern
        in _DOWNLOAD_ACTION_PATTERNS
    )


def is_local_file_download_request(
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
        for pattern
        in _LOCAL_FILE_DOWNLOAD_PATTERNS
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

    if has_download_action_request(
        question_text
    ):
        return not is_local_file_download_request(
            question_text
        )

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
