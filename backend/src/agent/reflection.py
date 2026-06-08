from __future__ import annotations

import json

from log import get_logger

_log = get_logger("agent.reflection")

_FETCH_TOOLS = {"fetch_schedule", "fetch_absence", "fetch_grades", "get_leaves"}


def reflect(tool_name: str, result_json: str) -> str:
    """Inspect a tool result and enrich it when useful.

    - Logs a warning when the result contains an error.
    - Appends a "(查無資料)" note when a fetch tool returns an empty list,
      so the LLM understands the empty response without extra reasoning.
    - Injects a cross-validation hint when get_leave_form returns no scheduled
      periods, since the form page is not the authoritative schedule source.
    """
    try:
        data = json.loads(result_json)
    except json.JSONDecodeError:
        return result_json

    if isinstance(data, dict) and "error" in data:
        _log.warning("tool %s returned error: %s", tool_name, data["error"])
        return result_json

    if tool_name in _FETCH_TOOLS and isinstance(data, list) and len(data) == 0:
        return json.dumps({"results": [], "note": "查無資料"}, ensure_ascii=False)

    if tool_name == "get_leave_form" and isinstance(data, dict):
        if not data.get("scheduled"):
            data["note"] = (
                "請假表單顯示今日無排課節次，但此資料來自請假表單頁，"
                "可能因系統延遲或資料來源不同而不準確。"
                "請務必呼叫 fetch_schedule 交叉確認今日實際課表，"
                "確認後再告知使用者是否有課。"
            )
            return json.dumps(data, ensure_ascii=False)

    return result_json
