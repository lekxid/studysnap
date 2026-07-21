"""Shared pytest configuration for StudySnap backend tests.

The test suite must remain isolated from external services. This file:

1. Adds the backend directory to ``sys.path`` so tests can be started from
   either the repository root or the backend directory.
2. Replaces only the final external email-delivery function during tests.
   Email template builders remain real and continue to be tested.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(autouse=True)
def disable_external_email_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prevent backend tests from contacting Azure Communication Services."""

    import app.services.email_service as email_service

    def fake_send_email(
        *args: Any,
        **kwargs: Any,
    ) -> bool:
        return True

    monkeypatch.setattr(
        email_service,
        "send_email",
        fake_send_email,
    )
