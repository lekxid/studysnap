from datetime import datetime

from sqlalchemy.orm import Session

from app.models.learning_event import LearningEvent
from app.models.quiz import Quiz
from app.models.quiz_attempt import QuizAttempt


def format_event_time(
    value: datetime | None,
) -> str:
    if value is None:
        return "unknown time"

    return value.strftime(
        "%Y-%m-%d %H:%M"
    )


def safe_percentage(
    score: int | None,
    total: int | None,
) -> int | None:
    safe_score = int(score or 0)
    safe_total = int(total or 0)

    if safe_total <= 0:
        return None

    return round(
        (safe_score / safe_total) * 100
    )


def build_learning_progress_context(
    db: Session,
    study_room_id: int,
    learner_user_id: int,
    event_limit: int = 18,
    event_candidate_limit: int = 100,
    quiz_attempt_limit: int = 8,
) -> str:
    """
    Build recent personal learning evidence for
    a Study Room.

    Room materials continue to come from the room
    owner. Progress evidence is restricted to the
    student currently using General AI.
    """

    events = (
        db.query(LearningEvent)
        .filter(
            LearningEvent.user_id
            == learner_user_id,
            LearningEvent.study_room_id
            == study_room_id,
        )
        .order_by(
            LearningEvent.created_at.desc(),
            LearningEvent.id.desc(),
        )
        .limit(event_candidate_limit)
        .all()
    )

    quiz_attempt_rows = (
        db.query(
            QuizAttempt,
            Quiz,
        )
        .join(
            Quiz,
            QuizAttempt.quiz_id
            == Quiz.id,
        )
        .filter(
            QuizAttempt.user_id
            == learner_user_id,
            Quiz.study_room_id
            == study_room_id,
        )
        .order_by(
            QuizAttempt.created_at.desc(),
            QuizAttempt.id.desc(),
        )
        .limit(quiz_attempt_limit)
        .all()
    )

    if not events and not quiz_attempt_rows:
        return ""

    result_counts = {
        "correct": 0,
        "wrong": 0,
        "partial": 0,
        "reviewed": 0,
    }

    confidence_values: list[int] = []

    for event in events:
        result = (
            event.result or ""
        ).strip().lower()

        if result in result_counts:
            result_counts[result] += 1

        if event.confidence is not None:
            confidence_values.append(
                max(
                    0,
                    min(
                        int(event.confidence),
                        100,
                    ),
                )
            )

    answered_count = (
        result_counts["correct"]
        + result_counts["wrong"]
        + result_counts["partial"]
    )

    accuracy = None

    if answered_count > 0:
        accuracy = round(
            (
                result_counts["correct"]
                / answered_count
            )
            * 100
        )

    average_confidence = None

    if confidence_values:
        average_confidence = round(
            sum(confidence_values)
            / len(confidence_values)
        )

    lines = [
        "PERSONAL ROOM LEARNING SUMMARY",
        (
            "RECORDED LEARNING EVENTS: "
            f"{len(events)}"
        ),
        (
            "CORRECT RESULTS: "
            f"{result_counts['correct']}"
        ),
        (
            "WRONG RESULTS: "
            f"{result_counts['wrong']}"
        ),
        (
            "PARTIAL RESULTS: "
            f"{result_counts['partial']}"
        ),
        (
            "REVIEWED ITEMS: "
            f"{result_counts['reviewed']}"
        ),
    ]

    if accuracy is not None:
        lines.append(
            f"RECORDED ACCURACY: {accuracy}%"
        )
    else:
        lines.append(
            "RECORDED ACCURACY: "
            "not enough answered evidence"
        )

    if average_confidence is not None:
        lines.append(
            "AVERAGE RECORDED CONFIDENCE: "
            f"{average_confidence}%"
        )

    recent_events = events[:event_limit]

    if recent_events:
        lines.extend(
            [
                "",
                "RECENT LEARNING ACTIVITY:",
            ]
        )

        for event in recent_events:
            details = [
                format_event_time(
                    event.created_at
                ),
                (
                    event.activity_type
                    or "study activity"
                ),
            ]

            if event.result:
                details.append(
                    f"result={event.result}"
                )

            if event.confidence is not None:
                details.append(
                    "confidence="
                    f"{event.confidence}%"
                )

            if event.reference_id is not None:
                details.append(
                    "reference="
                    f"{event.reference_id}"
                )

            lines.append(
                "- " + " | ".join(details)
            )

    if quiz_attempt_rows:
        lines.extend(
            [
                "",
                "RECENT QUIZ ATTEMPTS:",
            ]
        )

        for attempt, quiz in quiz_attempt_rows:
            title = (
                quiz.title
                or "Untitled Quiz"
            ).strip()

            percentage = safe_percentage(
                attempt.score,
                attempt.total,
            )

            score_text = (
                f"{int(attempt.score or 0)}"
                f"/{int(attempt.total or 0)}"
            )

            if percentage is not None:
                score_text += (
                    f" ({percentage}%)"
                )

            lines.append(
                "- "
                + format_event_time(
                    attempt.created_at
                )
                + " | "
                + title
                + " | score="
                + score_text
            )

    lines.extend(
        [
            "",
            (
                "Use this evidence only when the "
                "student asks about progress, "
                "mistakes, readiness, weak areas, "
                "review needs, or what to study next."
            ),
            (
                "Do not invent missing attempts, "
                "concept names, scores, or results."
            ),
        ]
    )

    return "\n".join(lines)
