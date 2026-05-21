from client import post_data
from log import get_logger
from parsers.leaves import parse_leaves

_log = get_logger("actions.fetch_leaves")

VIEW_URL = "/tsint/ck_pro/ck001_view.jsp"


def _fmt(compact: str) -> str:
    """民國 compact YYYMMDD → YYY/MM/DD，用於 etxt_* 欄位。"""
    return f"{compact[:3]}/{compact[3:5]}/{compact[5:7]}"


async def get_leaves(jsessionid: str, start: str, end: str) -> list[dict]:
    """查詢指定日期範圍內的假單列表。

    start / end：民國 compact YYYMMDD，e.g. "1150501"
    Returns:
        list of leave dicts（見 parser.parse_leaves）
    """
    html = await post_data(jsessionid, VIEW_URL, {
        "etxt_sdate": _fmt(start),
        "etxt_edate": _fmt(end),
        "sdate":      start,
        "edate":      end,
        "sms_bdate":  "",
        "sms_edate":  "",
    })
    entries = parse_leaves(html)
    _log.info("get_leaves %s~%s → %d entries", start, end, len(entries))
    return entries
