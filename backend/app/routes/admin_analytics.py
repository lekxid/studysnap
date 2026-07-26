from __future__ import annotations

from collections import Counter, defaultdict
from datetime import (
    datetime,
    timedelta,
    timezone,
)

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.models.artifact import Artifact
from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.product_event import (
    ProductEvent,
)
from app.models.quiz import Quiz
from app.models.smart_scan import SmartScan
from app.models.study_material import (
    StudyMaterial,
)
from app.models.study_plan import StudyPlan
from app.models.study_room import StudyRoom
from app.models.user import User
from app.models.user_session import UserSession
from app.services.ai_usage import build_ai_usage_summary
from app.services.product_analytics import (
    is_platform_admin_email,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["Founder Analytics"],
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def aware_utc(
    value: datetime | None,
) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def iso_timestamp(
    value: datetime | None,
) -> str | None:
    normalized = aware_utc(value)

    return (
        normalized.isoformat()
        if normalized
        else None
    )


def require_platform_admin(
    current_user: User = Depends(
        get_current_user
    ),
) -> User:
    if not is_platform_admin_email(
        current_user.email
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Founder analytics access "
                "is not enabled for this "
                "account."
            ),
        )

    return current_user


@router.get("/access")
def analytics_access(
    current_user: User = Depends(
        get_current_user
    ),
):
    return {
        "is_platform_admin":
            is_platform_admin_email(
                current_user.email
            ),
    }


def count_rows(
    db: Session,
    model,
) -> int:
    return int(
        db.query(func.count(model.id))
        .scalar()
        or 0
    )


def sum_column(
    db: Session,
    column,
) -> int:
    return int(
        db.query(
            func.coalesce(
                func.sum(column),
                0,
            )
        ).scalar()
        or 0
    )


_GENERATED_TEST_EMAIL_PREFIXES = (
    "auth-",
    "lifecycle-",
    "link-",
    "room-",
)

_RESERVED_TEST_EMAIL_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
}


def is_generated_test_account_email(
    email: str | None,
) -> bool:
    normalized = (
        email or ""
    ).strip().lower()

    local_part, separator, domain = (
        normalized.partition("@")
    )

    if (
        not separator
        or domain
        not in _RESERVED_TEST_EMAIL_DOMAINS
    ):
        return False

    return local_part.startswith(
        _GENERATED_TEST_EMAIL_PREFIXES
    )


@router.get("/summary")
def analytics_summary(
    days: int = Query(
        default=30,
        ge=7,
        le=90,
    ),
    db: Session = Depends(get_db),
    _admin: User = Depends(
        require_platform_admin
    ),
):
    now = utc_now()
    window_start = now - timedelta(
        days=days
    )
    seven_days_ago = now - timedelta(
        days=7
    )
    thirty_days_ago = now - timedelta(
        days=30
    )
    today_start = now.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    all_users = db.query(User).all()

    users = [
        user
        for user in all_users
        if not is_generated_test_account_email(
            user.email
        )
    ]

    included_user_ids = {
        user.id
        for user in users
    }

    sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id.in_(
                included_user_ids
            )
        )
        .all()
        if included_user_ids
        else []
    )

    events = (
        db.query(ProductEvent)
        .filter(
            ProductEvent.user_id.in_(
                included_user_ids
            ),
            ProductEvent.occurred_at
            >= window_start,
        )
        .order_by(
            ProductEvent.occurred_at.asc()
        )
        .all()
        if included_user_ids
        else []
    )

    user_map = {
        user.id: user
        for user in users
    }

    last_active_by_user: dict[
        int,
        datetime,
    ] = {}

    for session in sessions:
        active_at = aware_utc(
            session.last_active_at
        )

        if active_at is None:
            continue

        current = (
            last_active_by_user.get(
                session.user_id
            )
        )

        if (
            current is None
            or active_at > current
        ):
            last_active_by_user[
                session.user_id
            ] = active_at

    event_times_by_user: dict[
        int,
        list[datetime],
    ] = defaultdict(list)

    for event in events:
        occurred_at = aware_utc(
            event.occurred_at
        )

        if occurred_at is not None:
            event_times_by_user[
                event.user_id
            ].append(
                occurred_at
            )

    def active_user_ids_since(
        threshold: datetime,
    ) -> set[int]:
        active = {
            user_id
            for user_id, active_at
            in last_active_by_user.items()
            if active_at >= threshold
        }

        for user_id, timestamps in (
            event_times_by_user.items()
        ):
            if any(
                timestamp >= threshold
                for timestamp in timestamps
            ):
                active.add(user_id)

        return active

    active_today = (
        active_user_ids_since(
            today_start
        )
    )
    active_7d = (
        active_user_ids_since(
            seven_days_ago
        )
    )
    active_30d = (
        active_user_ids_since(
            thirty_days_ago
        )
    )

    created_times = {
        user.id: aware_utc(
            user.created_at
        )
        for user in users
    }

    new_today = sum(
        1
        for created_at
        in created_times.values()
        if created_at is not None
        and created_at >= today_start
    )

    new_7d = sum(
        1
        for created_at
        in created_times.values()
        if created_at is not None
        and created_at >= seven_days_ago
    )

    new_30d = sum(
        1
        for created_at
        in created_times.values()
        if created_at is not None
        and created_at >= thirty_days_ago
    )

    category_counts = Counter()
    event_counts = Counter()
    quantity_counts = Counter()

    daily_events: dict[
        str,
        int,
    ] = defaultdict(int)

    daily_users: dict[
        str,
        set[int],
    ] = defaultdict(set)

    for event in events:
        category_counts[
            event.category
        ] += 1

        event_counts[
            event.event_name
        ] += 1

        quantity_counts[
            event.event_name
        ] += int(
            event.quantity or 1
        )

        occurred_at = aware_utc(
            event.occurred_at
        )

        if occurred_at is None:
            continue

        day_key = (
            occurred_at.date().isoformat()
        )

        daily_events[day_key] += 1
        daily_users[day_key].add(
            event.user_id
        )

    daily_activity = []

    for offset in reversed(
        range(days)
    ):
        day = (
            now - timedelta(days=offset)
        ).date()

        day_key = day.isoformat()

        daily_activity.append(
            {
                "date": day_key,
                "events":
                    daily_events[
                        day_key
                    ],
                "active_users": len(
                    daily_users[
                        day_key
                    ]
                ),
            }
        )

    events_30d = [
        event
        for event in events
        if (
            aware_utc(
                event.occurred_at
            )
            or datetime.min.replace(
                tzinfo=timezone.utc
            )
        ) >= thirty_days_ago
    ]

    events_by_user = Counter(
        event.user_id
        for event in events_30d
    )

    categories_by_user: dict[
        int,
        Counter,
    ] = defaultdict(Counter)

    for event in events_30d:
        categories_by_user[
            event.user_id
        ][event.category] += 1

    user_summaries = []

    for user in users:
        categories = (
            categories_by_user[
                user.id
            ]
        )

        top_feature = (
            categories.most_common(1)[0][0]
            if categories
            else None
        )

        user_summaries.append(
            {
                "id": user.id,
                "email": user.email,
                "full_name":
                    user.full_name,
                "created_at":
                    iso_timestamp(
                        user.created_at
                    ),
                "last_active_at":
                    iso_timestamp(
                        last_active_by_user
                        .get(user.id)
                    ),
                "events_30d":
                    int(
                        events_by_user[
                            user.id
                        ]
                    ),
                "top_feature":
                    top_feature,
            }
        )

    user_summaries.sort(
        key=lambda item: (
            item["last_active_at"]
            or "",
            item["created_at"]
            or "",
        ),
        reverse=True,
    )

    recent_events = []

    for event in reversed(
        events[-50:]
    ):
        user = user_map.get(
            event.user_id
        )

        recent_events.append(
            {
                "id": event.id,
                "user_id":
                    event.user_id,
                "user_email": (
                    user.email
                    if user
                    else None
                ),
                "event_name":
                    event.event_name,
                "category":
                    event.category,
                "source":
                    event.source,
                "surface":
                    event.surface,
                "quantity":
                    event.quantity,
                "bytes_count":
                    event.bytes_count,
                "occurred_at":
                    iso_timestamp(
                        event.occurred_at
                    ),
            }
        )

    established_users = {
        user_id
        for user_id, created_at
        in created_times.items()
        if created_at is not None
        and created_at
        < seven_days_ago
    }

    returning_established = (
        established_users
        & active_7d
    )

    return_rate = (
        round(
            (
                len(
                    returning_established
                )
                / len(
                    established_users
                )
            )
            * 100,
            1,
        )
        if established_users
        else 0.0
    )

    ai_usage = build_ai_usage_summary(
        db=db,
        included_user_ids=(
            included_user_ids
        ),
        window_start=window_start,
        now=now,
    )

    inventory = {
        "study_rooms":
            count_rows(
                db,
                StudyRoom,
            ),
        "notes":
            count_rows(
                db,
                Note,
            ),
        "flashcards":
            count_rows(
                db,
                Flashcard,
            ),
        "quizzes":
            count_rows(
                db,
                Quiz,
            ),
        "planner_items":
            count_rows(
                db,
                StudyPlan,
            ),
        "study_materials":
            count_rows(
                db,
                StudyMaterial,
            ),
        "ai_conversations":
            count_rows(
                db,
                AIConversation,
            ),
        "ai_messages":
            count_rows(
                db,
                AIMessage,
            ),
        "artifacts":
            count_rows(
                db,
                Artifact,
            ),
        "smart_scans":
            count_rows(
                db,
                SmartScan,
            ),
        "stored_bytes": (
            sum_column(
                db,
                StudyMaterial.file_size,
            )
            + sum_column(
                db,
                Artifact.file_size,
            )
        ),
    }

    feature_usage = [
        {
            "category": category,
            "events": count,
        }
        for category, count
        in category_counts.most_common()
    ]

    event_usage = [
        {
            "event_name":
                event_name,
            "events":
                event_counts[
                    event_name
                ],
            "quantity":
                quantity,
        }
        for event_name, quantity
        in quantity_counts.most_common()
    ]

    upload_events = [
        event
        for event in events
        if event.event_name
        == "file_uploaded"
    ]

    return {
        "generated_at":
            now.isoformat(),
        "window_days": days,
        "privacy": {
            "content_collected": False,
            "private_messages_visible":
                False,
            "notes_visible": False,
            "file_contents_visible":
                False,
        },
        "ai_usage": ai_usage,
        "totals": {
            "users": len(users),
            "new_users_today":
                new_today,
            "new_users_7d":
                new_7d,
            "new_users_30d":
                new_30d,
            "active_today":
                len(active_today),
            "active_7d":
                len(active_7d),
            "active_30d":
                len(active_30d),
            "events_in_window":
                len(events),
            "uploads_in_window":
                sum(
                    int(
                        event.quantity
                        or 1
                    )
                    for event
                    in upload_events
                ),
            "uploaded_bytes_in_window":
                sum(
                    int(
                        event.bytes_count
                        or 0
                    )
                    for event
                    in upload_events
                ),
            "established_return_rate_7d":
                return_rate,
        },
        "inventory": inventory,
        "feature_usage":
            feature_usage,
        "event_usage":
            event_usage,
        "daily_activity":
            daily_activity,
        "recent_events":
            recent_events,
        "users":
            user_summaries[:100],
    }
