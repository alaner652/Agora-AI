import dataclasses

from client import post_data
from log import get_logger
from parsers.absence import parse_absence
from parsers.select import parse_select

_log = get_logger("actions.fetch_absence")

FORM_URL   = "/tsint/ak_pro/ak002_00.jsp"
RESULT_URL = "/tsint/ak_pro/ak002_01.jsp"


async def get_options(jsessionid: str) -> dict:
    """取得缺曠查詢的學期與假別選項。"""
    html = await post_data(jsessionid, FORM_URL, {"fncid": "AK002"})
    return {
        "semesters":   parse_select(html, "yms"),
        "leave_types": parse_select(html, "leave"),
    }


def _split_roc_date(s: str) -> tuple[str, str, str]:
    """拆分民國 YYYMMDD (7碼) 為 (year, month, day)，格式不符時拋出 ValueError。"""
    if len(s) != 7 or not s.isdigit():
        raise ValueError(f"日期格式錯誤（應為民國 YYYMMDD 7 碼）：{s!r}")
    return s[:3], s[3:5], s[5:7]


async def get_absence(
    jsessionid: str,
    yms: str,
    leave: str = "00",
    start: str = "",
    end: str   = "",
) -> list[dict]:
    """查詢缺曠記錄，回傳缺曠清單。

    start / end 格式：民國年月日緊排，例如 "1150101"（7 碼）。
    """
    sy, sm, sd = _split_roc_date(start) if start else ("", "", "")
    ey, em, ed = _split_roc_date(end)   if end   else ("", "", "")
    html = await post_data(jsessionid, RESULT_URL, {
        "yms":         yms,
        "leave":       leave,
        "etxt_syear":  sy,
        "etxt_smonth": sm,
        "etxt_sday":   sd,
        "etxt_eyear":  ey,
        "etxt_emonth": em,
        "etxt_eday":   ed,
        "spath":       "",
        "sdate":       start,
        "edate":       end,
    })
    entries = [dataclasses.asdict(e) for e in parse_absence(html)]
    _log.info("get_absence yms=%s start=%s end=%s → %d entries", yms, start, end, len(entries))
    return entries
