import dataclasses

from client import post_data
from parser import parse_select, parse_absence

FORM_URL   = "/tsint/ak_pro/ak002_00.jsp"
RESULT_URL = "/tsint/ak_pro/ak002_01.jsp"


async def get_options(jsessionid: str) -> dict:
    """取得缺曠查詢的學期與假別選項。"""
    html = await post_data(jsessionid, FORM_URL, {"fncid": "AK002"})
    return {
        "semesters":   parse_select(html, "yms"),
        "leave_types": parse_select(html, "leave"),
    }


async def get_absence(
    jsessionid: str,
    yms: str,
    leave: str = "00",
    start: str = "",
    end: str   = "",
) -> list[dict]:
    """查詢缺曠記錄，回傳缺曠清單。

    start / end 格式：民國年月日緊排，例如 "1150101"。
    """
    html = await post_data(jsessionid, RESULT_URL, {
        "yms":         yms,
        "leave":       leave,
        "etxt_syear":  start[:3]  if start else "",
        "etxt_smonth": start[3:5] if start else "",
        "etxt_sday":   start[5:7] if start else "",
        "etxt_eyear":  end[:3]    if end   else "",
        "etxt_emonth": end[3:5]   if end   else "",
        "etxt_eday":   end[5:7]   if end   else "",
        "spath":       "",
        "sdate":       start,
        "edate":       end,
    })
    return [dataclasses.asdict(e) for e in parse_absence(html)]
