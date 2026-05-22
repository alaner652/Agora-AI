from client import post_data
from log import get_logger
from utils.alert import classify_alert

_log = get_logger("actions.delete_leave")

DEL_URL = "/tsint/ck_pro/ck001_del.jsp"

_SUCCESS_KW = ["刪除", "完成", "成功"]
_FAILURE_KW = ["失敗", "錯誤", "不得", "已核准"]


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
    result = classify_alert(html, _SUCCESS_KW, _FAILURE_KW, "（請重新查詢確認）")
    _log.info("delete_leave barcode=%s → success=%s", barcode, result["success"])
    return result
