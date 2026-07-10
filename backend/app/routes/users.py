from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user import UserResponse
from app.schemas.user_settings import UserSettingsResponse, UserSettingsUpdate
from app.utils.deps import get_current_user

router = APIRouter(tags=["Users"])


class UserProfileUpdate(BaseModel):
    full_name: str


@router.put("/me/profile", response_model=UserResponse)
def update_my_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    full_name = payload.full_name.strip()

    if len(full_name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Full name must be at least 2 characters.",
        )

    current_user.full_name = full_name

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user


def get_or_create_user_settings(db: Session, user_id: int) -> UserSettings:
    settings = (
        db.query(UserSettings)
        .filter(UserSettings.user_id == user_id)
        .first()
    )

    if settings:
        return settings

    settings = UserSettings(
        user_id=user_id,
        learning_mode="Clear Explain",
        knowledge_level="Medium",
        progress_sharing="Private",
        favorite_subject="",
        selected_subjects=["Networking / IT", "Linux"],
        daily_goal="Review 10 flashcards",
        notifications="Important only",
        theme="dark",
        ai_memory_enabled=True,
        save_notes_to_memory=True,
        save_flashcards_to_memory=True,
        save_quiz_results_to_memory=True,
        save_weak_strong_concepts=True,
        save_study_history=True,
        connected_apps={
            "google_drive": {"connected": False, "last_synced_at": None},
            "google_docs": {"connected": False, "last_synced_at": None},
            "icloud": {"connected": False, "last_synced_at": None},
            "onedrive": {"connected": False, "last_synced_at": None},
            "dropbox": {"connected": False, "last_synced_at": None},
        },
        auto_import_rules={
            "drive_pdfs": False,
            "google_docs": False,
            "icloud_notes": False,
            "flashcards_folder": False,
            "sync_every_24_hours": False,
        },
    )

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return settings


@router.get("/me/settings", response_model=UserSettingsResponse)
def read_my_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_or_create_user_settings(db=db, user_id=current_user.id)


@router.put("/me/settings", response_model=UserSettingsResponse)
def update_my_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = get_or_create_user_settings(db=db, user_id=current_user.id)

    updates = payload.model_dump(exclude_unset=True)

    for key, value in updates.items():
        setattr(settings, key, value)

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return settings
