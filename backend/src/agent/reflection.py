from __future__ import annotations

import json

from log import get_logger

from .tools import FETCH_TOOL_NAMES

_log = get_logger("agent.reflection")


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

    if tool_name in FETCH_TOOL_NAMES and isinstance(data, list) and len(data) == 0:
        return json.dumps({"results": [], "note": "查無資料"}, ensure_ascii=False)

    if tool_name == "get_leave_form" and isinstance(data, dict) and not data.get("scheduled"):
        data["note"] = (
            "請假表單顯示今日無排課節次，但此資料來自請假表單頁，"
            "可能因系統延遲或資料來源不同而不準確。"
            "請務必呼叫 fetch_schedule 交叉確認今日實際課表，"
            "確認後再告知使用者是否有課。"
        )
        return json.dumps(data, ensure_ascii=False)

    return result_json


def reflect_repeated_failure(
    tool_name: str, attempt: int, err_msg: str, result_json: str
) -> str:
    """Enrich a failing tool result with a self-reflection instruction.

    Injected when the model has called the same tool with the same args and hit
    the same error more than once. Folds "原始指令 + 錯誤 + 反思" into the tool
    result so the model is forced to change strategy (or ask the user) rather
    than blindly retry the identical call. Keeps the tool_call_id chain intact
    by augmenting the existing result rather than adding a separate message.
    """
    try:
        data = json.loads(result_json)
    except json.JSONDecodeError:
        data = {"error": err_msg}
    if not isinstance(data, dict):
        data = {"result": data, "error": err_msg}

    _log.warning("tool %s repeated failure x%d: %s", tool_name, attempt, err_msg)
    data["reflection"] = (
        f"你已用相同參數呼叫 {tool_name} 連續失敗第 {attempt} 次，錯誤為：{err_msg}。"
        "不要再用相同參數重試。請依錯誤訊息修正參數、改用其他工具，"
        "或呼叫 ask_user 向使用者澄清缺少或不確定的資訊。"
    )
    return json.dumps(data, ensure_ascii=False)
