from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.flashcard import Flashcard
from app.models.learning_event import LearningEvent
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user


router = APIRouter(tags=["Learning Insights"])


def calculate_learning_score(total_events: int, average_confidence: int, correct_count: int, wrong_count: int) -> int:
    if total_events <= 0:
        return 0

    accuracy_score = 0
    answered_total = correct_count + wrong_count

    if answered_total > 0:
        accuracy_score = int((correct_count / answered_total) * 100)

    activity_score = min(total_events * 5, 100)

    score = int((average_confidence * 0.4) + (accuracy_score * 0.4) + (activity_score * 0.2))
    return max(0, min(score, 100))




def calculate_learning_index(
    learning_score: int,
    average_confidence: int,
    correct_count: int,
    wrong_count: int,
    study_streak: int,
    cards_reviewed_today: int,
) -> int:
    answered_total = correct_count + wrong_count
    accuracy_score = int((correct_count / answered_total) * 100) if answered_total > 0 else 0
    streak_score = min(study_streak * 10, 100)
    daily_activity_score = min(cards_reviewed_today * 5, 100)

    index = int(
        (learning_score * 4.0)
        + (average_confidence * 2.5)
        + (accuracy_score * 2.0)
        + (streak_score * 1.0)
        + (daily_activity_score * 0.5)
    )

    return max(0, min(index, 1000))


def get_learning_index_message(learning_index: int, today_change: int) -> str:
    if learning_index == 0:
        return "Start studying to activate your StudySnap Learning Index."

    if today_change > 0:
        return "Your learning value is increasing today."

    if learning_index >= 750:
        return "Your learning index is strong. Keep protecting your progress."

    if learning_index >= 500:
        return "Your learning index is growing. A few more reviews can push it higher."

    return "Your learning index is still building. Start with a focused review session."


def get_ai_recommendation(learning_score: int, average_confidence: int, wrong_today: int, cards_reviewed_today: int) -> str:
    if cards_reviewed_today == 0:
        return "Start with a short flashcard review or quiz today so StudySnap can learn your current strengths and weak areas."

    if wrong_today >= 5:
        return "You missed several cards today. Review the weak topics first, then try a short quiz to confirm your understanding."

    if average_confidence < 60:
        return "Your confidence is still building. Focus on explanations before doing more reviews."

    if learning_score >= 80:
        return "Great work. You are showing strong progress today. Keep your streak going with a quick review session."

    return "You are making progress. Review a few more cards today to improve your learning score."


@router.get("")
def get_learning_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    seven_days_ago = today_start - timedelta(days=6)

    events = (
        db.query(LearningEvent)
        .filter(LearningEvent.user_id == current_user.id)
        .order_by(LearningEvent.created_at.desc())
        .all()
    )

    today_events = [event for event in events if event.created_at and event.created_at >= today_start]
    recent_events = [event for event in events if event.created_at and event.created_at >= seven_days_ago]

    confidence_values = [
        event.confidence
        for event in events
        if event.confidence is not None
    ]

    average_confidence = int(sum(confidence_values) / len(confidence_values)) if confidence_values else 0

    correct_today = len([event for event in today_events if event.result == "correct"])
    wrong_today = len([event for event in today_events if event.result == "wrong"])

    review_activity_types = {"flashcard", "quiz_question"}

    cards_reviewed_today = len([
        event
        for event in today_events
        if event.activity_type in review_activity_types
    ])

    correct_all = len([event for event in events if event.result == "correct"])
    wrong_all = len([event for event in events if event.result == "wrong"])

    learning_score = calculate_learning_score(
        total_events=len(events),
        average_confidence=average_confidence,
        correct_count=correct_all,
        wrong_count=wrong_all,
    )

    active_days = set()
    for event in events:
        if event.created_at:
            active_days.add(event.created_at.date())

    study_streak = 0
    check_day = today_start.date()

    while check_day in active_days:
        study_streak += 1
        check_day = check_day - timedelta(days=1)

    learning_index = calculate_learning_index(
        learning_score=learning_score,
        average_confidence=average_confidence,
        correct_count=correct_all,
        wrong_count=wrong_all,
        study_streak=study_streak,
        cards_reviewed_today=cards_reviewed_today,
    )

    yesterday_start = today_start - timedelta(days=1)
    yesterday_events = [
        event
        for event in events
        if event.created_at and yesterday_start <= event.created_at < today_start
    ]

    yesterday_confidence_values = [
        event.confidence
        for event in yesterday_events
        if event.confidence is not None
    ]

    yesterday_average_confidence = (
        int(sum(yesterday_confidence_values) / len(yesterday_confidence_values))
        if yesterday_confidence_values
        else 0
    )

    yesterday_correct = len([event for event in yesterday_events if event.result == "correct"])
    yesterday_wrong = len([event for event in yesterday_events if event.result == "wrong"])
    yesterday_cards_reviewed = len([
        event
        for event in yesterday_events
        if event.activity_type == "flashcard"
    ])

    yesterday_learning_score = calculate_learning_score(
        total_events=len(yesterday_events),
        average_confidence=yesterday_average_confidence,
        correct_count=yesterday_correct,
        wrong_count=yesterday_wrong,
    )

    yesterday_learning_index = calculate_learning_index(
        learning_score=yesterday_learning_score,
        average_confidence=yesterday_average_confidence,
        correct_count=yesterday_correct,
        wrong_count=yesterday_wrong,
        study_streak=max(study_streak - 1, 0),
        cards_reviewed_today=yesterday_cards_reviewed,
    )

    learning_index_today_change = learning_index - yesterday_learning_index

    subject_stats = defaultdict(lambda: {"correct": 0, "wrong": 0, "reviewed": 0})

    flashcard_event_ids = [
        event.reference_id
        for event in events
        if event.activity_type == "flashcard" and event.reference_id is not None
    ]

    room_ids = [
        event.study_room_id
        for event in events
        if event.study_room_id is not None
    ]

    flashcard_subject_map = {}
    room_subject_map = {}

    if flashcard_event_ids:
        rows = (
            db.query(Flashcard.id, StudyRoom.subject)
            .join(StudyRoom, Flashcard.study_room_id == StudyRoom.id)
            .filter(Flashcard.owner_id == current_user.id)
            .filter(Flashcard.id.in_(flashcard_event_ids))
            .all()
        )

        flashcard_subject_map = {
            flashcard_id: subject or "General"
            for flashcard_id, subject in rows
        }

    if room_ids:
        room_rows = (
            db.query(StudyRoom.id, StudyRoom.subject, StudyRoom.name)
            .filter(StudyRoom.owner_id == current_user.id)
            .filter(StudyRoom.id.in_(room_ids))
            .all()
        )

        room_subject_map = {
            room_id: subject or name or "General"
            for room_id, subject, name in room_rows
        }

    for event in events:
        if event.activity_type not in review_activity_types:
            continue

        subject = "General"

        if event.study_room_id is not None:
            subject = room_subject_map.get(event.study_room_id, "General")
        elif event.activity_type == "flashcard" and event.reference_id is not None:
            subject = flashcard_subject_map.get(event.reference_id, "General")

        subject_stats[subject]["reviewed"] += 1

        if event.result == "correct":
            subject_stats[subject]["correct"] += 1

        if event.result == "wrong":
            subject_stats[subject]["wrong"] += 1

    weak_topics = []
    strong_topics = []

    for subject, stats in subject_stats.items():
        reviewed = stats["reviewed"]
        correct = stats["correct"]
        wrong = stats["wrong"]

        accuracy = int((correct / reviewed) * 100) if reviewed else 0

        topic = {
            "subject": subject,
            "reviewed": reviewed,
            "correct": correct,
            "wrong": wrong,
            "accuracy": accuracy,
        }

        if reviewed >= 1 and (wrong > correct or accuracy < 60):
            weak_topics.append(topic)

        if reviewed >= 1 and accuracy >= 70:
            strong_topics.append(topic)

    weak_topics = sorted(weak_topics, key=lambda item: (item["accuracy"], -item["wrong"]))[:5]
    strong_topics = sorted(strong_topics, key=lambda item: item["accuracy"], reverse=True)[:5]

    trend = []

    for day_offset in range(6, -1, -1):
        day = today_start - timedelta(days=day_offset)
        next_day = day + timedelta(days=1)

        day_events = [
            event
            for event in recent_events
            if event.created_at and day <= event.created_at < next_day
        ]

        day_confidence_values = [
            event.confidence
            for event in day_events
            if event.confidence is not None
        ]

        day_average_confidence = (
            int(sum(day_confidence_values) / len(day_confidence_values))
            if day_confidence_values
            else 0
        )

        trend.append({
            "date": day.date().isoformat(),
            "reviews": len([event for event in day_events if event.activity_type in review_activity_types]),
            "average_confidence": day_average_confidence,
            "correct": len([event for event in day_events if event.result == "correct"]),
            "wrong": len([event for event in day_events if event.result == "wrong"]),
        })

    return {
        "learning_score": learning_score,
        "learning_index": learning_index,
        "learning_index_today_change": learning_index_today_change,
        "learning_index_message": get_learning_index_message(
            learning_index=learning_index,
            today_change=learning_index_today_change,
        ),
        "average_confidence": average_confidence,
        "cards_reviewed_today": cards_reviewed_today,
        "correct_today": correct_today,
        "wrong_today": wrong_today,
        "study_streak": study_streak,
        "weak_topics": weak_topics,
        "strong_topics": strong_topics,
        "ai_recommendation": get_ai_recommendation(
            learning_score=learning_score,
            average_confidence=average_confidence,
            wrong_today=wrong_today,
            cards_reviewed_today=cards_reviewed_today,
        ),
        "trend": trend,
    }
