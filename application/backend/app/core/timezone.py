import os
import time
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    EAT_TZ = ZoneInfo("Africa/Nairobi")
except Exception:
    EAT_TZ = timezone(timedelta(hours=3), name="EAT")


def configure_kenya_timezone() -> None:
    """Set the Python process timezone to Kenya East Africa Time (Africa/Nairobi, UTC+3)."""
    os.environ["TZ"] = "Africa/Nairobi"
    if hasattr(time, "tzset"):
        time.tzset()


configure_kenya_timezone()


def now_eat() -> datetime:
    """Return current Kenya local wall-clock time (Africa/Nairobi, UTC+3) as a naive datetime."""
    return datetime.now(EAT_TZ).replace(tzinfo=None)


def today_eat() -> date:
    """Return today's Kenya calendar date (Africa/Nairobi, UTC+3)."""
    return now_eat().date()
