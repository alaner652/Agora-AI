from __future__ import annotations

import json

from log import get_logger

_log = get_logger(__name__)

_FETCH_TOOLS = {"fetch_schedule", "fetch_absence", "fetch_grades", "get_leaves"}


def reflect(tool_name: str, result_json: str) -> str:
    """Inspect a tool result and enrich it when useful.

    - Logs a warning when the result contains an error.
    - Appends a "(查無資料)" note when a fetch tool returns an empty list,
      so the LLM understands the empty response without extra reasoning.
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

    return result_json
