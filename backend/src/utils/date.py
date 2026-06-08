from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# 校務系統的「今天」一律以台北當地時間判定，避免容器跑 UTC 時
# 半夜（台北 00:00–08:00）算成昨天。對齊 summary.py 的時區處理。
TZ = ZoneInfo("Asia/Taipei")


def today_taipei() -> date:
    return datetime.now(TZ).date()


def to_roc(d: date) -> str:
    return f"{d.year - 1911}{d.month:02d}{d.day:02d}"


def today_roc() -> str:
    return to_roc(today_taipei())


def days_ago_roc(n: int) -> str:
    return to_roc(today_taipei() - timedelta(days=n))
