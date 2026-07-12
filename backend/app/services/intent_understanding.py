from __future__ import annotations

import re


INTENT_UNDERSTANDING_INSTRUCTIONS = """
Intent understanding rules:

1. Understand the student's likely meaning even when their message contains
   spelling mistakes, phonetic spelling, texting abbreviations, missing words,
   missing punctuation, or informal grammar.

2. Use the current conversation and available StudySnap context to resolve
   references such as "it", "that file", "the last one", "d room", or
   "what I uploaded before".

3. A single message may contain more than one question or request. Identify
   and respond to each meaningful part instead of answering only the final line.

4. Do not criticize, mock, or unnecessarily correct the student's writing.
   Answer the intended meaning naturally. Correct their wording only when they
   ask for writing or grammar help.

5. Preserve important details exactly, especially names, subjects, dates,
   numbers, medication names, course terms, file names, and room names.

6. Ask one short clarification only when the ambiguity would materially change
   the answer or action. Do not ask the student to rewrite a message that can
   reasonably be understood.

7. Never infer a destructive, security-sensitive, or account-changing action
   from unclear wording. Actions that modify or delete data must remain explicit.

8. Prefer the student's real intent over literal grammar while remaining honest
   when the intended meaning cannot be determined confidently.
""".strip()


def get_intent_understanding_instructions() -> str:
    """Return the shared instructions used by StudySnap conversational AI."""

    return INTENT_UNDERSTANDING_INSTRUCTIONS


def normalize_action_command(command: str | None) -> str:
    """
    Normalize only the command portion used for safe action detection.

    The original student message should still be saved and displayed unchanged.
    This helper removes polite prefixes and handles a few common action-command
    typos without broadly rewriting the student's content.
    """

    text = (command or "").strip()

    if not text:
        return ""

    polite_prefixes = [
        r"^(?:please|pls|plz)[,:]?\s+",
        r"^(?:can|could|would)\s+you\s+",
        r"^i\s+(?:want|need)\s+you\s+to\s+",
    ]

    # Run more than once for phrases such as "please can you create..."
    for _ in range(2):
        for pattern in polite_prefixes:
            text = re.sub(
                pattern,
                "",
                text,
                count=1,
                flags=re.IGNORECASE,
            )

    # Normalize common explicit action verbs only when followed by an
    # action object. This avoids rewriting ordinary learning questions.
    text = re.sub(
        r"^(?:make|mak|mk|creat|crate)\b"
        r"(?=\s+(?:a\s+)?(?:room|project|note)\b)",
        "create",
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    # Common casual form: "create d room Anatomy".
    text = re.sub(
        r"^(create|new|add)\s+d\s+(room|project)\b",
        r"\1 a \2",
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    return text.strip()
