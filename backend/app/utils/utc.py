"""UTC timestamp helpers.

The current database schema stores timezone-naive UTC datetimes.
This helper uses Python's timezone-aware UTC clock internally and
then removes tzinfo to preserve the existing database contract.
"""

from datetime import UTC, datetime


def utc_now_naive() -> datetime:
    """Return the current time as a database-compatible naive UTC value."""

    return datetime.now(UTC).replace(tzinfo=None)
