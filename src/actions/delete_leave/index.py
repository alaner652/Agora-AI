import re

from client import post_data

DEL_URL = "/tsint/ck_pro/ck001_del.jsp"

_ALERT_RE   = re.compile(r"alert\(['\"](.+?)['\"]\)")
_SUCCESS_KW = ["刪除", "完成", "成功"]
_FAILURE_KW = ["失敗", "錯誤", "不得", "已核准"]


def _classify(html: str) -> dict:
    m = _ALERT_RE.search(html)
    message = m.group(1) if m else ""
    if any(kw in message for kw in _SUCCESS_KW):
        return {"success": True,  "message": message}
    if any(kw in message for kw in _FAILURE_KW):
        return {"success": False, "message": message}
    # 若無 alert，假單列表消失即視為成功
    return {"success": None, "message": message or "（請重新查詢確認）"}


async def delete_leave(
    jsessionid: str,
    stdkey: str,
    barcode: str,
    sdate: str,
    edate: str,
) -> dict:
    """刪除假單。

    stdkey / barcode：從 get_leaves 回傳的假單資料取得
    sdate / edate：民國 compact YYYMMDD

    Returns:
        {"success": True/False/None, "message": str}
    """
    html = await post_data(jsessionid, DEL_URL, {
        "stdkey":  stdkey,
        "barcode": barcode,
        "dvsid":   "",
        "sdate":   sdate,
        "edate":   edate,
    })
    return _classify(html)
