import re

# 使用 [^'"]+ 而非 .+? 避免跨引號誤匹配
_ALERT_RE = re.compile(r"alert\(['\"]([^'\"]+)['\"]\)")


def classify_alert(
    html: str,
    success_kw: list[str],
    failure_kw: list[str],
    fallback_msg: str = "（無訊息）",
) -> dict:
    """從 HTML 中解析 alert() 訊息並分類成功/失敗。

    Returns:
        {"success": True/False/None, "message": str}
    """
    m = _ALERT_RE.search(html)
    message = m.group(1) if m else ""
    if any(kw in message for kw in success_kw):
        return {"success": True, "message": message}
    if any(kw in message for kw in failure_kw):
        return {"success": False, "message": message}
    return {"success": None, "message": message or fallback_msg}
