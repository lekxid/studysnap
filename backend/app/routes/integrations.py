from datetime import datetime, timedelta
import json
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.connected_account import ConnectedAccount
from app.models.pdf_document import PDFDocument
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes.pdf_documents import MAX_FILE_SIZE, UPLOAD_DIR, extract_pdf_text
from app.utils.deps import get_current_user

router = APIRouter(tags=["Integrations"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"

GOOGLE_DRIVE_SCOPE = "openid email profile https://www.googleapis.com/auth/drive.readonly"
GOOGLE_PROVIDER = "google_drive"


class GoogleAccessTokenExpired(Exception):
    pass


class GoogleDrivePDFImportRequest(BaseModel):
    file_id: str
    study_room_id: int


def google_is_configured() -> bool:
    return bool(
        settings.google_client_id.strip()
        and settings.google_client_secret.strip()
        and settings.google_redirect_uri.strip()
    )


def make_google_state(user_id: int) -> str:
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    return jwt.encode(
        {
            "user_id": user_id,
            "purpose": "google_drive_oauth",
            "exp": expires_at,
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def read_google_state(state: str) -> int:
    try:
        payload = jwt.decode(
            state,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state")

    if payload.get("purpose") != "google_drive_oauth":
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state")

    user_id = payload.get("user_id")

    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state")

    return int(user_id)


def exchange_google_code(code: str) -> dict:
    payload = urlencode(
        {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    request = Request(
        GOOGLE_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8")
        raise HTTPException(
            status_code=400,
            detail=f"Google token exchange failed: {detail}",
        )
    except URLError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not reach Google OAuth server: {error}",
        )


def fetch_google_profile(access_token: str) -> dict:
    request = Request(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError:
        return {}
    except URLError:
        return {}


def refresh_google_access_token(account: ConnectedAccount, db: Session) -> str:
    if not account.refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Google access expired. Please reconnect Google Drive.",
        )

    payload = urlencode(
        {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": account.refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")

    request = Request(
        GOOGLE_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            token_data = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8")
        raise HTTPException(
            status_code=401,
            detail=f"Google token refresh failed. Please reconnect Google Drive. {detail}",
        )
    except URLError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not reach Google OAuth server: {error}",
        )

    access_token = token_data.get("access_token")
    expires_in = int(token_data.get("expires_in") or 3600)

    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Google did not return a refreshed access token. Please reconnect Google Drive.",
        )

    account.access_token = access_token
    account.token_type = token_data.get("token_type") or account.token_type
    account.scopes = token_data.get("scope") or account.scopes
    account.expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    db.add(account)
    db.commit()
    db.refresh(account)

    return access_token


def get_google_account(db: Session, user_id: int) -> ConnectedAccount:
    account = (
        db.query(ConnectedAccount)
        .filter(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.provider == GOOGLE_PROVIDER,
            ConnectedAccount.revoked_at.is_(None),
        )
        .first()
    )

    if account is None:
        raise HTTPException(
            status_code=400,
            detail="Google Drive is not connected yet.",
        )

    return account


def escape_drive_query_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")



def safe_drive_pdf_filename(name: str | None) -> str:
    cleaned = (name or "google-drive-document.pdf").strip()

    for character in ["\\", "/", ":", "*", "?", "\"", "<", ">", "|"]:
        cleaned = cleaned.replace(character, "-")

    cleaned = cleaned.strip(" .") or "google-drive-document.pdf"

    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"

    return cleaned[:180]


def fetch_google_drive_file_metadata(access_token: str, file_id: str) -> dict:
    params = urlencode(
        {
            "fields": "id,name,mimeType,size,webViewLink",
            "supportsAllDrives": "true",
        }
    )
    url = f"{GOOGLE_DRIVE_FILES_URL}/{quote(file_id)}?{params}"

    request = Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8")

        if error.code == 401:
            raise GoogleAccessTokenExpired()

        raise HTTPException(
            status_code=400,
            detail=f"Google Drive file metadata failed: {detail}",
        )
    except URLError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not reach Google Drive server: {error}",
        )


def download_google_drive_file(access_token: str, file_id: str) -> bytes:
    params = urlencode({"alt": "media", "supportsAllDrives": "true"})
    url = f"{GOOGLE_DRIVE_FILES_URL}/{quote(file_id)}?{params}"

    request = Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=45) as response:
            return response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8")

        if error.code == 401:
            raise GoogleAccessTokenExpired()

        raise HTTPException(
            status_code=400,
            detail=f"Google Drive file download failed: {detail}",
        )
    except URLError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not download Google Drive file: {error}",
        )


def fetch_google_drive_files(
    access_token: str,
    page_size: int = 20,
    page_token: str | None = None,
    search: str | None = None,
) -> dict:
    drive_query = "trashed = false"

    if search and search.strip():
        safe_search = escape_drive_query_value(search.strip())
        drive_query = f"trashed = false and name contains '{safe_search}'"

    params = {
        "pageSize": str(page_size),
        "fields": "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)",
        "orderBy": "modifiedTime desc",
        "q": drive_query,
    }

    if page_token:
        params["pageToken"] = page_token

    url = f"{GOOGLE_DRIVE_FILES_URL}?{urlencode(params)}"

    request = Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8")

        if error.code == 401:
            raise GoogleAccessTokenExpired()

        raise HTTPException(
            status_code=400,
            detail=f"Google Drive file listing failed: {detail}",
        )
    except URLError as error:
        raise HTTPException(
            status_code=400,
            detail=f"Could not reach Google Drive server: {error}",
        )


@router.get("/google/status")
def google_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = (
        db.query(ConnectedAccount)
        .filter(
            ConnectedAccount.user_id == current_user.id,
            ConnectedAccount.provider == GOOGLE_PROVIDER,
            ConnectedAccount.revoked_at.is_(None),
        )
        .first()
    )

    return {
        "provider": GOOGLE_PROVIDER,
        "configured": google_is_configured(),
        "connected": account is not None,
        "account_email": account.account_email if account else None,
        "scopes": account.scopes if account else None,
        "last_synced_at": account.last_synced_at.isoformat()
        if account and account.last_synced_at
        else None,
    }


@router.get("/google/connect-url")
def google_connect_url(current_user: User = Depends(get_current_user)):
    if not google_is_configured():
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to backend/.env.",
        )

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_DRIVE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": make_google_state(current_user.id),
    }

    return {"authorization_url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


@router.get("/google/files")
def google_files(
    page_size: int = Query(default=20, ge=1, le=50),
    page_token: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = get_google_account(db=db, user_id=current_user.id)

    try:
        drive_data = fetch_google_drive_files(
            access_token=account.access_token,
            page_size=page_size,
            page_token=page_token,
            search=search,
        )
    except GoogleAccessTokenExpired:
        refreshed_access_token = refresh_google_access_token(account=account, db=db)
        drive_data = fetch_google_drive_files(
            access_token=refreshed_access_token,
            page_size=page_size,
            page_token=page_token,
            search=search,
        )

    return {
        "provider": GOOGLE_PROVIDER,
        "account_email": account.account_email,
        "files": drive_data.get("files", []),
        "next_page_token": drive_data.get("nextPageToken"),
    }



@router.post("/google/import-pdf")
def import_google_drive_pdf(
    data: GoogleDrivePDFImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == data.study_room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    account = get_google_account(db=db, user_id=current_user.id)

    try:
        metadata = fetch_google_drive_file_metadata(
            access_token=account.access_token,
            file_id=data.file_id,
        )
        contents = download_google_drive_file(
            access_token=account.access_token,
            file_id=data.file_id,
        )
    except GoogleAccessTokenExpired:
        refreshed_access_token = refresh_google_access_token(account=account, db=db)
        metadata = fetch_google_drive_file_metadata(
            access_token=refreshed_access_token,
            file_id=data.file_id,
        )
        contents = download_google_drive_file(
            access_token=refreshed_access_token,
            file_id=data.file_id,
        )

    if metadata.get("mimeType") != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only Google Drive PDF files can be imported in this version.",
        )

    if not contents:
        raise HTTPException(status_code=400, detail="Google Drive file was empty.")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="PDF file is too large. Maximum size is 10MB.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original_filename = safe_drive_pdf_filename(metadata.get("name"))
    stored_filename = f"{uuid.uuid4()}.pdf"
    file_path = UPLOAD_DIR / stored_filename

    with open(file_path, "wb") as output_file:
        output_file.write(contents)

    extracted_text = extract_pdf_text(file_path)

    pdf_document = PDFDocument(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_size=len(contents),
        extracted_text=extracted_text,
        study_room_id=room.id,
        owner_id=current_user.id,
    )

    account.last_synced_at = datetime.utcnow()

    db.add(pdf_document)
    db.add(account)
    db.commit()
    db.refresh(pdf_document)
    db.refresh(account)

    return {
        "provider": GOOGLE_PROVIDER,
        "account_email": account.account_email,
        "message": "Google Drive PDF imported into StudySnap.",
        "pdf": {
            "id": pdf_document.id,
            "original_filename": pdf_document.original_filename,
            "stored_filename": pdf_document.stored_filename,
            "file_path": pdf_document.file_path,
            "file_size": pdf_document.file_size,
            "extracted_text": pdf_document.extracted_text,
            "study_room_id": pdf_document.study_room_id,
            "owner_id": pdf_document.owner_id,
            "created_at": pdf_document.created_at.isoformat()
            if pdf_document.created_at
            else None,
        },
    }


@router.get("/google/callback")
def google_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    redirect_base = settings.frontend_app_url.rstrip("/")

    if error:
        return RedirectResponse(
            f"{redirect_base}/settings?integration=google_drive&status=error"
        )

    if not code or not state:
        return RedirectResponse(
            f"{redirect_base}/settings?integration=google_drive&status=missing_code"
        )

    user_id = read_google_state(state)
    token_data = exchange_google_code(code)

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = int(token_data.get("expires_in") or 3600)

    if not access_token:
        raise HTTPException(status_code=400, detail="Google did not return an access token")

    google_profile = fetch_google_profile(access_token)
    google_email = google_profile.get("email")

    account = (
        db.query(ConnectedAccount)
        .filter(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.provider == GOOGLE_PROVIDER,
        )
        .first()
    )

    now = datetime.utcnow()

    if account is None:
        account = ConnectedAccount(
            user_id=user_id,
            provider=GOOGLE_PROVIDER,
            access_token=access_token,
        )

    account.access_token = access_token
    account.refresh_token = refresh_token or account.refresh_token
    account.token_type = token_data.get("token_type")
    account.scopes = token_data.get("scope") or GOOGLE_DRIVE_SCOPE
    account.expires_at = now + timedelta(seconds=expires_in)
    account.last_synced_at = now
    account.revoked_at = None
    account.account_email = google_email or account.account_email

    db.add(account)
    db.commit()

    return RedirectResponse(
        f"{redirect_base}/settings?integration=google_drive&status=connected"
    )
