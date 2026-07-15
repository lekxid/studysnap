from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user import UserResponse
from app.schemas.user_settings import (
    UserSettingsResponse,
    UserSettingsUpdate,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["Users"])

AVATAR_UPLOAD_ROOT = Path("uploads/profile_images")
MAX_AVATAR_SIZE = 5 * 1024 * 1024

ALLOWED_AVATAR_TYPES = {
    "image/jpeg": {
        "formats": {"JPEG"},
        "extension": ".jpg",
    },
    "image/png": {
        "formats": {"PNG"},
        "extension": ".png",
    },
    "image/webp": {
        "formats": {"WEBP"},
        "extension": ".webp",
    },
}


class UserProfileUpdate(BaseModel):
    full_name: str


def get_avatar_directory(user_id: int) -> Path:
    return AVATAR_UPLOAD_ROOT / str(user_id)


def delete_avatar_file(avatar_path: str | None) -> None:
    if not avatar_path:
        return

    path = Path(avatar_path)

    try:
        resolved_root = AVATAR_UPLOAD_ROOT.resolve()
        resolved_path = path.resolve()

        if resolved_root not in resolved_path.parents:
            return

        if resolved_path.is_file():
            resolved_path.unlink()
    except OSError:
        # A missing or inaccessible old image should not prevent a new upload.
        return


def validate_avatar(
    contents: bytes,
    content_type: str | None,
) -> tuple[str, str]:
    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The selected image is empty.",
        )

    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Profile pictures must be 5 MB or smaller.",
        )

    normalized_type = (content_type or "").lower().strip()
    allowed = ALLOWED_AVATAR_TYPES.get(normalized_type)

    if not allowed:
        raise HTTPException(
            status_code=415,
            detail="Use a JPG, PNG, or WebP image.",
        )

    try:
        with Image.open(BytesIO(contents)) as image:
            detected_format = (image.format or "").upper()
            image.verify()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as error:
        raise HTTPException(
            status_code=400,
            detail="The selected file is not a valid image.",
        ) from error

    if detected_format not in allowed["formats"]:
        raise HTTPException(
            status_code=415,
            detail="The file contents do not match the selected image type.",
        )

    return normalized_type, str(allowed["extension"])


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


@router.post("/me/avatar", response_model=UserResponse)
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contents = await file.read()

    try:
        _, extension = validate_avatar(
            contents=contents,
            content_type=file.content_type,
        )
    finally:
        await file.close()

    user_directory = get_avatar_directory(current_user.id)
    user_directory.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid4().hex}{extension}"
    destination = user_directory / filename

    try:
        destination.write_bytes(contents)
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail="StudySnap could not save the profile picture.",
        ) from error

    old_avatar_path = current_user.avatar_path
    current_user.avatar_path = str(destination)

    try:
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    except Exception:
        db.rollback()
        delete_avatar_file(str(destination))
        raise

    if old_avatar_path and old_avatar_path != current_user.avatar_path:
        delete_avatar_file(old_avatar_path)

    return current_user


@router.get("/me/avatar")
def read_my_avatar(
    current_user: User = Depends(get_current_user),
):
    if not current_user.avatar_path:
        raise HTTPException(
            status_code=404,
            detail="No profile picture has been uploaded.",
        )

    avatar_path = Path(current_user.avatar_path)

    try:
        resolved_root = AVATAR_UPLOAD_ROOT.resolve()
        resolved_path = avatar_path.resolve()
    except OSError as error:
        raise HTTPException(
            status_code=404,
            detail="Profile picture not found.",
        ) from error

    if (
        resolved_root not in resolved_path.parents
        or not resolved_path.is_file()
    ):
        raise HTTPException(
            status_code=404,
            detail="Profile picture not found.",
        )

    suffix = resolved_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    media_type = media_types.get(suffix)

    if not media_type:
        raise HTTPException(
            status_code=404,
            detail="Profile picture not found.",
        )

    return FileResponse(
        path=resolved_path,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-cache",
        },
    )


@router.delete("/me/avatar", status_code=204)
def delete_my_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old_avatar_path = current_user.avatar_path

    if not old_avatar_path:
        return Response(status_code=204)

    current_user.avatar_path = None

    db.add(current_user)
    db.commit()

    delete_avatar_file(old_avatar_path)

    return Response(status_code=204)


def get_or_create_user_settings(
    db: Session,
    user_id: int,
) -> UserSettings:
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
            "google_drive": {
                "connected": False,
                "last_synced_at": None,
            },
            "google_docs": {
                "connected": False,
                "last_synced_at": None,
            },
            "icloud": {
                "connected": False,
                "last_synced_at": None,
            },
            "onedrive": {
                "connected": False,
                "last_synced_at": None,
            },
            "dropbox": {
                "connected": False,
                "last_synced_at": None,
            },
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


@router.get(
    "/me/settings",
    response_model=UserSettingsResponse,
)
def read_my_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_or_create_user_settings(
        db=db,
        user_id=current_user.id,
    )


@router.put(
    "/me/settings",
    response_model=UserSettingsResponse,
)
def update_my_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = get_or_create_user_settings(
        db=db,
        user_id=current_user.id,
    )

    updates = payload.model_dump(exclude_unset=True)

    for key, value in updates.items():
        setattr(settings, key, value)

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return settings
