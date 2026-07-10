from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserSessionResponse(BaseModel):
    id: int
    device_name: str
    browser: str
    operating_system: str
    ip_address: str | None = None
    is_trusted: bool
    is_current: bool
    created_at: datetime
    last_active_at: datetime
    revoked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionMessageResponse(BaseModel):
    message: str
