import re
from pathlib import Path

from client import get_page, post_multipart
from log import get_logger
from parsers.leaves import parse_leave_form

_log = get_logger("actions.apply_leave")

FORM_URL   = "/tsint/ck_pro/ck001_02.jsp"
SUBMIT_URL = "/tsint/ck_pro/ck001_ins.jsp"

_ALERT_RE   = re.compile(r"alert\(['\"](.+?)['\"]\)")
_SUCCESS_KW = ["完成", "成功", "已送出", "存檔", "申請完成", "請假完成", "准假"]
_FAILURE_KW = ["失敗", "錯誤", "請選取", "請輸入", "請選擇", "不得", "必須", "重複", "未到", "附件", "格式不正確"]

_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf"}

PUBLIC_LEAVE_REASONS: list[str] = ["兵役", "法院傳訴", "國家考試", "系科公假"]

LEAVE_TYPES: list[dict] = [
    {"id": "21", "name": "事假"},
    {"id": "22", "name": "病假"},
    {"id": "23", "name": "公假"},
    {"id": "24", "name": "喪假"},
    {"id": "25", "name": "婚假"},
    {"id": "26", "name": "孕(產)假"},
    {"id": "27", "name": "哺育假"},
    {"id": "28", "name": "防疫假"},
    {"id": "29", "name": "生理假"},
    {"id": "31", "name": "原住民假"},
]


def _classify(html: str) -> dict:
    m = _ALERT_RE.search(html)
    message = m.group(1) if m else ""
    if any(kw in message for kw in _SUCCESS_KW):
        return {"success": True,  "message": message}
    if any(kw in message for kw in _FAILURE_KW):
        return {"success": False, "message": message}
    return {"success": None, "message": message or "（無訊息）"}


def _build_lea_value(compact_date: str, period_order: list[str], target_periods: set[str], leave_id: str) -> str:
    values = [leave_id if label in target_periods else "0" for label in period_order]
    return f"{compact_date}%{'%'.join(values)}%"


async def get_leave_form(jsessionid: str, date: str | None = None) -> dict:
    """GET 請假表單頁，回傳節次順序、當日有課節次、日期。

    date: 民國 compact YYYMMDD（None = 今天）
    實作備注：日期切換的 query param 名稱需實際測試確認，目前先用 ls_date1。
    """
    params = {"ls_date1": date} if date else None
    html = await get_page(jsessionid, FORM_URL, params=params)
    return parse_leave_form(html)


async def apply_leave(
    jsessionid: str,
    date: str,
    periods: list[str],
    leave_id: str,
    leave_name: str,
    reason: str,
    image_path: str | None = None,
) -> dict:
    """送出請假申請。

    date:       民國 compact YYYMMDD，e.g. "1150521"
    periods:    要請假的節次 labels，e.g. ["1", "2", "早自習"]
    leave_id:   假別代碼，e.g. "21"
    leave_name: 假別名稱，e.g. "事假"
    reason:     請假原因
    image_path: 附件路徑（公假必填，其他可 None）

    Returns:
        {"success": True/False/None, "message": str}
    """
    target = set(periods)

    # 取得節次順序（用來建 lea_value）
    form = await get_leave_form(jsessionid, date)
    period_order = form["period_order"]
    if not period_order:
        # fallback：使用已知的固定節次順序
        period_order = ["朝會", "早自習", "1", "2", "3", "4", "5", "6", "7", "8", "9", "K", "A", "B", "C", "D", "E"]

    lea_value = _build_lea_value(date, period_order, target, leave_id)

    payload = {
        "rdo1":                   f"{leave_id}#{leave_name}",
        "std_reason":             reason,
        f"reson_{leave_id}":      reason,
        "ls_date1":               date,
        "leaveid":                leave_id,
        "leavename":              leave_name,
        "lea_value":              lea_value,
        "ls_chk":                 "Y",
        "todo":                   "upload",
    }

    if image_path:
        p = Path(image_path)
        ext = p.suffix.lower()
        content_type = _MIME.get(ext, "application/octet-stream")
        file_bytes   = p.read_bytes()
        filename     = p.name
    else:
        file_bytes, content_type, filename = b"", "application/octet-stream", ""

    html = await post_multipart(
        jsessionid, SUBMIT_URL, payload,
        file_bytes=file_bytes, filename=filename, content_type=content_type,
    )
    result = _classify(html)
    _log.info("apply_leave date=%s leave_id=%s → success=%s", date, leave_id, result["success"])
    return result
