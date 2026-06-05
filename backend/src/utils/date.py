from datetime import date, timedelta


def to_roc(d: date) -> str:
    return f"{d.year - 1911}{d.month:02d}{d.day:02d}"


def today_roc() -> str:
    return to_roc(date.today())


def days_ago_roc(n: int) -> str:
    return to_roc(date.today() - timedelta(days=n))
