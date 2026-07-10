import secrets
from datetime import datetime

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.user_session import UserSession


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def detect_browser(user_agent: str) -> str:
    value = user_agent.lower()

    if "edg/" in value or "edge/" in value:
        return "Microsoft Edge"
    if "chrome/" in value and "chromium" not in value:
        return "Chrome"
    if "firefox/" in value:
        return "Firefox"
    if "safari/" in value and "chrome/" not in value:
        return "Safari"

    return "Unknown browser"


def detect_os(user_agent: str) -> str:
    value = user_agent.lower()

    if "windows" in value:
        return "Windows"
    if "android" in value:
        return "Android"
    if "iphone" in value or "ipad" in value or "ios" in value:
        return "iOS"
    if "mac os" in value or "macintosh" in value:
        return "macOS"
    if "linux" in value or "ubuntu" in value:
        return "Linux"

    return "Unknown OS"


def build_device_name(browser: str, operating_system: str) -> str:
    if browser == "Unknown browser" and operating_system == "Unknown OS":
        return "Unknown device"

    return f"{browser} on {operating_system}"


def get_request_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    if request.client:
        return request.client.host

    return None


def create_user_session(
    db: Session,
    request: Request,
    user_id: int,
) -> UserSession:
    user_agent = request.headers.get("user-agent", "")
    browser = detect_browser(user_agent)
    operating_system = detect_os(user_agent)

    session = UserSession(
        user_id=user_id,
        session_token=create_session_token(),
        device_name=build_device_name(browser, operating_system),
        browser=browser,
        operating_system=operating_system,
        ip_address=get_request_ip(request),
        user_agent=user_agent,
        last_active_at=datetime.utcnow(),
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session
