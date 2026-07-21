from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings


CURRENT_INFORMATION_PATTERNS = (
    r"\btoday\b",
    r"\btonight\b",
    r"\btomorrow\b",
    r"\byesterday\b",
    r"\bthis (?:morning|afternoon|evening|week|month|year)\b",
    r"\bcurrent(?:ly)?\b",
    r"\blatest\b",
    r"\bmost recent\b",
    r"\brecent(?:ly)?\b",
    r"\bright now\b",
    r"\bup[- ]to[- ]date\b",
    r"\blive\b",
    r"\bbreaking\b",
    r"\bnews\b",
    r"\bweather\b",
    r"\bforecast\b",
    r"\btemperature\b",
    r"\bscore\b",
    r"\bstandings\b",
    r"\bschedule\b",
    r"\bprice\b",
    r"\bstock\b",
    r"\bexchange rate\b",
    r"\bcurrency\b",
    r"\boutbreak\b",
    r"\brecall\b",
    r"\balert\b",
    r"\bwarning\b",
    r"\bdeadline\b",
    r"\blaw\b",
    r"\bregulation\b",
    r"\brule change\b",
    r"\bsoftware version\b",
    r"\bwho is (?:the )?(?:current )?"
    r"(?:president|prime minister|governor|mayor|ceo|leader)\b",
    r"\bis .* (?:open|closed|available|working|down)\b",
)


def configured_timezone_name() -> str:
    value = (
        getattr(
            settings,
            "studysnap_timezone",
            "",
        )
        or "America/Toronto"
    )

    return value.strip() or "America/Toronto"


def configured_timezone() -> ZoneInfo:
    name = configured_timezone_name()

    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def current_time_context(
    *,
    now_utc: datetime | None = None,
) -> str:
    utc_value = now_utc or datetime.now(timezone.utc)

    if utc_value.tzinfo is None:
        utc_value = utc_value.replace(
            tzinfo=timezone.utc,
        )
    else:
        utc_value = utc_value.astimezone(
            timezone.utc,
        )

    timezone_name = configured_timezone_name()
    local_value = utc_value.astimezone(
        configured_timezone()
    )

    return "\n".join(
        [
            "CURRENT DATE AND TIME:",
            (
                "StudySnap local timezone: "
                f"{timezone_name}"
            ),
            (
                "Local date: "
                f"{local_value:%A, %B %d, %Y}"
            ),
            (
                "Local time: "
                f"{local_value:%I:%M %p %Z}"
            ),
            (
                "UTC date and time: "
                f"{utc_value:%Y-%m-%d %H:%M:%S UTC}"
            ),
            (
                "Treat these generated values as the "
                "current date and time for this request."
            ),
            (
                "When the student uses relative dates "
                "such as today or tomorrow, interpret "
                "them using the StudySnap local timezone."
            ),
        ]
    )


def web_search_is_enabled() -> bool:
    return bool(
        getattr(
            settings,
            "web_search_enabled",
            True,
        )
    )


def needs_current_information(
    question: str,
) -> bool:
    clean_question = " ".join(
        (question or "").strip().lower().split()
    )

    if not clean_question:
        return False

    return any(
        re.search(
            pattern,
            clean_question,
            flags=re.IGNORECASE,
        )
        for pattern in CURRENT_INFORMATION_PATTERNS
    )


def should_use_web_search(
    question: str,
) -> bool:
    return (
        web_search_is_enabled()
        and needs_current_information(question)
    )


def web_search_tool() -> dict:
    timezone_name = configured_timezone_name()

    return {
        "type": "web_search",
        "search_context_size": "medium",
        "user_location": {
            "type": "approximate",
            "country": "CA",
            "region": "Ontario",
            "city": "Barrie",
            "timezone": timezone_name,
        },
    }


def current_information_instructions(
    question: str,
) -> str:
    lines = [
        current_time_context(),
        "",
        "CURRENT-INFORMATION RULES:",
        (
            "- Never claim that you cannot access "
            "current information when web search is "
            "available for this request."
        ),
        (
            "- Do not rely on remembered dates for "
            "information that may have changed."
        ),
        (
            "- When web search is used, answer from "
            "the search results and clearly distinguish "
            "verified facts from uncertainty."
        ),
        (
            "- Do not invent search results, sources, "
            "prices, schedules, laws, announcements, "
            "scores, office holders, or breaking news."
        ),
        (
            "- If current information cannot be "
            "verified, say that verification was "
            "unsuccessful instead of guessing."
        ),
    ]

    if should_use_web_search(question):
        lines.extend(
            [
                "",
                (
                    "This request appears to require "
                    "current information. Use the web "
                    "search tool before answering."
                ),
            ]
        )

    return "\n".join(lines)
