"""
chatbot edge-case test suite
Groups:
  1. ChatMemory.get_context  (replaces _trim_messages)
  2. _message_to_dict
  3. dispatch — error paths
  4. dispatch — tool routes (happy path)
  5. render_image (cache miss / hit / custom title)
  6. ask_user — now raises AskUserError
  7. Input validation edge cases
  8. System prompt / security assertions
  9. _load_ai_guide
  10. _err helper
"""
import json
import pytest
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import httpx

from agent.memory import ChatMemory
from agent.tools import dispatch, AskUserError
from agent.agent import _message_to_dict, SYSTEM_PROMPT, _load_ai_guide
from agent.tools import _err  # noqa: F401 (tested in group 10)


# ─── helpers ─────────────────────────────────────────────────────────────────

def _make_msg(role: str) -> dict:
    return {"role": role, "content": "x"}


def _fake_openai_msg(role="assistant", content="hello", tool_calls=None):
    """Mimics the object returned by openai sdk (has .role .content .tool_calls)."""
    return SimpleNamespace(role=role, content=content, tool_calls=tool_calls or [])


# ═══════════════════════════════════════════════════════════════════════════════
# Group 1 — ChatMemory.get_context  (was _trim_messages)
# ═══════════════════════════════════════════════════════════════════════════════

def _mem_with(msgs: list[dict]) -> ChatMemory:
    m = ChatMemory()
    m.history = list(msgs)
    return m


def test_trim_under_limit():
    msgs = [_make_msg("user") for _ in range(20)]
    m = _mem_with(msgs)
    assert m.get_context() == msgs


def test_trim_over_limit():
    msgs = [_make_msg("user") for _ in range(45)]
    result = _mem_with(msgs).get_context()
    assert len(result) == 40
    assert result == msgs[-40:]


def test_trim_strips_leading_tool():
    msgs = [_make_msg("user")] * 5 + [_make_msg("tool")] + [_make_msg("user")] * 39
    result = _mem_with(msgs).get_context()
    assert result[0]["role"] != "tool"


def test_trim_strips_multiple_leading_tools():
    msgs = [_make_msg("user")] * 5 + [_make_msg("tool")] * 3 + [_make_msg("user")] * 37
    result = _mem_with(msgs).get_context()
    assert result[0]["role"] != "tool"


def test_trim_exactly_at_limit():
    msgs = [_make_msg("user") for _ in range(40)]
    assert _mem_with(msgs).get_context() == msgs


def test_trim_one_over_limit():
    msgs = [_make_msg("user") for _ in range(41)]
    result = _mem_with(msgs).get_context()
    assert len(result) == 40


def test_trim_all_tail_messages_tool_fallback_to_last_user():
    # Bug fixed: previously returned []; now falls back to the last user message
    msgs = [_make_msg("user")] + [_make_msg("tool")] * 40
    result = _mem_with(msgs).get_context()
    assert len(result) == 1
    assert result[0]["role"] == "user"


def test_trim_empty_history():
    assert _mem_with([]).get_context() == []


# ═══════════════════════════════════════════════════════════════════════════════
# Group 2 — _message_to_dict
# ═══════════════════════════════════════════════════════════════════════════════

def test_msg_to_dict_text():
    msg = _fake_openai_msg(content="hi", tool_calls=[])
    d = _message_to_dict(msg)
    assert d["role"] == "assistant"
    assert d["content"] == "hi"
    assert "tool_calls" not in d


def test_msg_to_dict_with_tool_calls():
    fn = SimpleNamespace(name="fetch_grades", arguments="{}")
    tc = SimpleNamespace(id="tc1", function=fn)
    msg = _fake_openai_msg(content=None, tool_calls=[tc])
    d = _message_to_dict(msg)
    assert "tool_calls" in d
    assert d["tool_calls"][0]["id"] == "tc1"
    assert d["tool_calls"][0]["function"]["name"] == "fetch_grades"
    assert d["tool_calls"][0]["function"]["arguments"] == "{}"


def test_msg_to_dict_none_content():
    fn = SimpleNamespace(name="fetch_grades", arguments="{}")
    tc = SimpleNamespace(id="tc2", function=fn)
    msg = _fake_openai_msg(content=None, tool_calls=[tc])
    d = _message_to_dict(msg)
    assert "content" not in d


def test_msg_to_dict_tool_call_structure():
    fn = SimpleNamespace(name="get_leaves", arguments='{"start":"1150101","end":"1150531"}')
    tc = SimpleNamespace(id="abc", function=fn)
    msg = _fake_openai_msg(content=None, tool_calls=[tc])
    d = _message_to_dict(msg)
    assert d["tool_calls"][0]["type"] == "function"


def test_msg_to_dict_empty_tool_calls_no_key():
    msg = _fake_openai_msg(content="text", tool_calls=[])
    d = _message_to_dict(msg)
    assert "tool_calls" not in d


def test_msg_to_dict_multiple_tool_calls():
    fn1 = SimpleNamespace(name="tool_a", arguments="{}")
    fn2 = SimpleNamespace(name="tool_b", arguments='{"x":1}')
    tc1 = SimpleNamespace(id="id1", function=fn1)
    tc2 = SimpleNamespace(id="id2", function=fn2)
    msg = _fake_openai_msg(content=None, tool_calls=[tc1, tc2])
    d = _message_to_dict(msg)
    assert len(d["tool_calls"]) == 2
    assert d["tool_calls"][0]["id"] == "id1"
    assert d["tool_calls"][1]["id"] == "id2"


# ═══════════════════════════════════════════════════════════════════════════════
# Group 3 — dispatch: error paths
# ═══════════════════════════════════════════════════════════════════════════════

async def test_unknown_tool(memory, jsessionid):
    result = json.loads(await dispatch("nonexistent", {}, jsessionid, memory))
    assert "error" in result
    assert "nonexistent" in result["error"]


async def test_timeout_error(memory, jsessionid):
    with patch("agent.tools._sched_options", new=AsyncMock(side_effect=httpx.TimeoutException(""))):
        result = json.loads(await dispatch("get_semester_options", {}, jsessionid, memory))
    assert "error" in result
    assert "逾時" in result["error"]


async def test_value_error_non_session(memory, jsessionid):
    with patch("agent.tools._sched_options", new=AsyncMock(side_effect=ValueError("其他錯誤"))):
        result = json.loads(await dispatch("get_semester_options", {}, jsessionid, memory))
    assert result["error"] == "其他錯誤"
    assert result["success"] is False


async def test_value_error_session_expired_propagates(memory, jsessionid):
    """Session 過期 ValueError 應向上拋出，由 ChatAgent 層處理 refresh。"""
    with patch("agent.tools._sched_options", new=AsyncMock(side_effect=ValueError("Session 過期"))):
        with pytest.raises(ValueError, match="Session 過期"):
            await dispatch("get_semester_options", {}, jsessionid, memory)


async def test_key_error_missing_arg(memory, jsessionid):
    result = json.loads(await dispatch("fetch_schedule", {}, jsessionid, memory))
    assert "error" in result


async def test_type_error(memory, jsessionid):
    with patch("agent.tools.get_leaves", new=AsyncMock(side_effect=TypeError("wrong type"))):
        result = json.loads(
            await dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, memory)
        )
    assert "error" in result


async def test_network_error_returns_json_error(memory, jsessionid):
    with patch("agent.tools._sched_options", new=AsyncMock(side_effect=httpx.ConnectError(""))):
        result = json.loads(await dispatch("get_semester_options", {}, jsessionid, memory))
    assert "error" in result
    assert "連線失敗" in result["error"]


async def test_read_error_returns_json_error(memory, jsessionid):
    with patch("agent.tools._sched_options", new=AsyncMock(side_effect=httpx.ReadError(""))):
        result = json.loads(await dispatch("get_semester_options", {}, jsessionid, memory))
    assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Group 4 — dispatch: tool happy paths
# ═══════════════════════════════════════════════════════════════════════════════

async def test_get_semester_options(memory, jsessionid):
    mock_semesters = [{"label": "114-2", "value": "114,2"}]
    with patch("agent.tools._sched_options", new=AsyncMock(return_value={"semesters": mock_semesters})):
        raw = await dispatch("get_semester_options", {}, jsessionid, memory)
    assert json.loads(raw) == {"semesters": mock_semesters}


async def test_get_semester_options_both_empty_raises_session_expired(memory, jsessionid):
    # When both gateways return empty semesters, force a session refresh
    # so the LLM doesn't loop forever on empty results.
    with patch("agent.tools._sched_options", new=AsyncMock(return_value={"semesters": []})), \
         patch("agent.tools._abs_options", new=AsyncMock(return_value={"semesters": []})):
        with pytest.raises(ValueError, match="Session 過期"):
            await dispatch("get_semester_options", {}, jsessionid, memory)


async def test_fetch_schedule_populates_cache(memory, jsessionid):
    entries = [{"weekday": 1, "period": "1", "course": "微積分"}]
    with patch("agent.tools.get_schedule", new=AsyncMock(return_value=entries)):
        await dispatch("fetch_schedule", {"semester_value": "114,2"}, jsessionid, memory)
    assert memory.cache["schedule"]["entries"] == entries
    assert memory.cache["schedule"]["title"] == "114,2"


async def test_fetch_schedule_remembers_semester(memory, jsessionid):
    with patch("agent.tools.get_schedule", new=AsyncMock(return_value=[])):
        await dispatch("fetch_schedule", {"semester_value": "114,2"}, jsessionid, memory)
    assert memory.recall("last_semester") == "114,2"


async def test_fetch_absence_with_explicit_dates(memory, jsessionid):
    entries = [{"date": "115/05/10", "type": "事假"}]
    with patch("agent.tools.get_absence", new=AsyncMock(return_value=entries)) as mock_abs:
        await dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "1150401", "end": "1150531"},
            jsessionid, memory,
        )
    mock_abs.assert_awaited_once_with(jsessionid, "114,2", start="1150401", end="1150531")
    assert memory.cache["absence"]["entries"] == entries


async def test_fetch_absence_default_dates(memory, jsessionid):
    with patch("agent.tools.get_absence", new=AsyncMock(return_value=[])) as mock_abs, \
         patch("agent.tools.today_roc", return_value="1150528"), \
         patch("agent.tools.days_ago_roc", return_value="1150428"):
        await dispatch("fetch_absence", {"semester_value": "114,2"}, jsessionid, memory)
    mock_abs.assert_awaited_once_with(jsessionid, "114,2", start="1150428", end="1150528")


async def test_fetch_grades_populates_cache(memory, jsessionid):
    entries = [{"course": "資料結構", "score": "85"}]
    with patch("agent.tools.get_grades", new=AsyncMock(return_value=entries)):
        await dispatch("fetch_grades", {}, jsessionid, memory)
    assert memory.cache["grades"]["entries"] == entries
    assert memory.cache["grades"]["title"] == "歷年成績"


async def test_fetch_grades_title_hardcoded(memory, jsessionid):
    with patch("agent.tools.get_grades", new=AsyncMock(return_value=[])):
        await dispatch("fetch_grades", {}, jsessionid, memory)
    assert memory.cache["grades"]["title"] == "歷年成績"


async def test_get_leaves_passes_date_range(memory, jsessionid):
    leaves = [{"barcode": "L001", "can_delete": True}]
    with patch("agent.tools.get_leaves", new=AsyncMock(return_value=leaves)) as mock_lv:
        result = json.loads(
            await dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, memory)
        )
    mock_lv.assert_awaited_once_with(jsessionid, "1150101", "1150531")
    assert result == leaves


async def test_get_leaves_empty_result_no_error(memory, jsessionid):
    with patch("agent.tools.get_leaves", new=AsyncMock(return_value=[])):
        result = json.loads(
            await dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, memory)
        )
    assert result == []


async def test_get_leave_form_with_date(memory, jsessionid):
    form = {"period_order": ["1", "2"], "scheduled": ["1"], "date": "1150521"}
    with patch("agent.tools.get_leave_form", new=AsyncMock(return_value=form)) as mock_form:
        result = json.loads(
            await dispatch("get_leave_form", {"date": "1150521"}, jsessionid, memory)
        )
    mock_form.assert_awaited_once_with(jsessionid, "1150521")
    assert result == form


async def test_get_leave_form_no_date_passes_none(memory, jsessionid):
    form = {"period_order": [], "scheduled": [], "date": ""}
    with patch("agent.tools.get_leave_form", new=AsyncMock(return_value=form)) as mock_form:
        await dispatch("get_leave_form", {}, jsessionid, memory)
    mock_form.assert_awaited_once_with(jsessionid, None)


async def test_apply_leave_with_image(memory, jsessionid):
    with patch("agent.tools._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": ["1", "2"],
                "leave_id": "23",
                "leave_name": "公假",
                "reason": "系科公假",
                "image_path": "/tmp/cert.jpg",
            },
            jsessionid, memory,
        )
    kw = mock_apply.await_args.kwargs
    assert kw["image_path"] == "/tmp/cert.jpg"
    assert kw["leave_id"] == "23"
    assert kw["periods"] == ["1", "2"]


async def test_apply_leave_no_image_defaults_none(memory, jsessionid):
    with patch("agent.tools._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": ["1"],
                "leave_id": "21",
                "leave_name": "事假",
                "reason": "私事",
            },
            jsessionid, memory,
        )
    kw = mock_apply.await_args.kwargs
    assert kw["image_path"] is None


async def test_apply_leave_result_passthrough(memory, jsessionid):
    leave_result = {"success": True, "message": "申請完成"}
    with patch("agent.tools._apply_leave", new=AsyncMock(return_value=leave_result)):
        result = json.loads(
            await dispatch(
                "apply_leave",
                {"date": "1150521", "periods": ["1"], "leave_id": "21",
                 "leave_name": "事假", "reason": "私事"},
                jsessionid, memory,
            )
        )
    assert result == leave_result


async def test_delete_leave_passes_all_args(memory, jsessionid):
    with patch("agent.tools._delete_leave", new=AsyncMock(return_value={"success": True})) as mock_del:
        await dispatch(
            "delete_leave",
            {"stdkey": "K001", "barcode": "B001", "sdate": "1150521", "edate": "1150521"},
            jsessionid, memory,
        )
    mock_del.assert_awaited_once_with(
        jsessionid=jsessionid, stdkey="K001", barcode="B001", sdate="1150521", edate="1150521"
    )


async def test_delete_leave_result_passthrough(memory, jsessionid):
    del_result = {"success": False, "message": "已審核，無法刪除"}
    with patch("agent.tools._delete_leave", new=AsyncMock(return_value=del_result)):
        result = json.loads(
            await dispatch(
                "delete_leave",
                {"stdkey": "K1", "barcode": "B1", "sdate": "1150521", "edate": "1150521"},
                jsessionid, memory,
            )
        )
    # success=False results get error_code injected
    assert result["success"] is False
    assert result["message"] == "已審核，無法刪除"
    assert "error_code" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Group 5 — render_image (cache miss / hit / custom title)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_render_cache_miss_schedule(memory, jsessionid):
    result = json.loads(await dispatch("render_image", {"type": "schedule"}, jsessionid, memory))
    assert "error" in result
    assert "schedule" in result["error"]


async def test_render_cache_miss_absence(memory, jsessionid):
    result = json.loads(await dispatch("render_image", {"type": "absence"}, jsessionid, memory))
    assert "error" in result


async def test_render_cache_miss_grades(memory, jsessionid):
    result = json.loads(await dispatch("render_image", {"type": "grades"}, jsessionid, memory))
    assert "error" in result


async def test_render_schedule_after_fetch(memory, jsessionid):
    memory.cache["schedule"] = {"entries": [], "title": "114,2"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png"):
        result = json.loads(
            await dispatch("render_image", {"type": "schedule"}, jsessionid, memory)
        )
    assert result == {"path": "/output/schedule.png"}


async def test_render_absence_after_fetch(memory, jsessionid):
    memory.cache["absence"] = {"entries": [], "title": "缺曠"}
    with patch("utils.render_absence.index.render", return_value="/output/absence.png"):
        result = json.loads(
            await dispatch("render_image", {"type": "absence"}, jsessionid, memory)
        )
    assert result == {"path": "/output/absence.png"}


async def test_render_grades_after_fetch(memory, jsessionid):
    memory.cache["grades"] = {"entries": [], "title": "歷年成績"}
    with patch("utils.render_grades.index.render", return_value="/output/grades.png"):
        result = json.loads(
            await dispatch("render_image", {"type": "grades"}, jsessionid, memory)
        )
    assert result == {"path": "/output/grades.png"}


async def test_render_custom_title(memory, jsessionid):
    memory.cache["schedule"] = {"entries": [], "title": "預設標題"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png") as mock_r:
        await dispatch(
            "render_image", {"type": "schedule", "title": "自訂標題"}, jsessionid, memory
        )
    mock_r.assert_called_once_with([], title="自訂標題", output=ANY)


async def test_render_fallback_title_from_cache(memory, jsessionid):
    memory.cache["schedule"] = {"entries": [], "title": "快取標題"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png") as mock_r:
        await dispatch("render_image", {"type": "schedule"}, jsessionid, memory)
    mock_r.assert_called_once_with([], title="快取標題", output=ANY)


async def test_render_unknown_type(memory, jsessionid):
    memory.cache["foo"] = {"entries": [], "title": ""}
    result = json.loads(await dispatch("render_image", {"type": "foo"}, jsessionid, memory))
    assert "error" in result
    assert "foo" in result["error"]


# ═══════════════════════════════════════════════════════════════════════════════
# Group 6 — ask_user — now raises AskUserError (no input())
# ═══════════════════════════════════════════════════════════════════════════════

async def test_ask_user_raises_error(memory, jsessionid):
    """ask_user must raise AskUserError; I/O is handled by the caller."""
    with pytest.raises(AskUserError) as exc_info:
        await dispatch(
            "ask_user",
            {"question": "選假別？", "options": ["病假", "事假"]},
            jsessionid, memory,
        )
    assert exc_info.value.question == "選假別？"
    assert exc_info.value.options == ["病假", "事假"]


async def test_ask_user_error_carries_options(memory, jsessionid):
    with pytest.raises(AskUserError) as exc_info:
        await dispatch(
            "ask_user",
            {"question": "確認？", "options": ["確認", "取消"]},
            jsessionid, memory,
        )
    assert "確認" in exc_info.value.options
    assert "取消" in exc_info.value.options


# ═══════════════════════════════════════════════════════════════════════════════
# Group 7 — Input validation edge cases
# ═══════════════════════════════════════════════════════════════════════════════

async def test_apply_leave_file_not_found_returns_error(memory, jsessionid):
    with patch("agent.tools._apply_leave", new=AsyncMock(side_effect=FileNotFoundError("no such file"))):
        result = json.loads(
            await dispatch(
                "apply_leave",
                {
                    "date": "1150521",
                    "periods": ["1"],
                    "leave_id": "23",
                    "leave_name": "公假",
                    "reason": "系科公假",
                    "image_path": "/nonexistent/cert.jpg",
                },
                jsessionid, memory,
            )
        )
    assert "error" in result


async def test_fetch_absence_bad_start_too_short(memory, jsessionid):
    result = json.loads(
        await dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "11504"},
            jsessionid, memory,
        )
    )
    assert "error" in result


async def test_fetch_absence_bad_start_non_digit(memory, jsessionid):
    result = json.loads(
        await dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "115abcd"},
            jsessionid, memory,
        )
    )
    assert "error" in result


async def test_fetch_absence_bad_end_non_digit(memory, jsessionid):
    result = json.loads(
        await dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "1150401", "end": "invalid"},
            jsessionid, memory,
        )
    )
    assert "error" in result


async def test_apply_leave_empty_periods_passes_through(memory, jsessionid):
    with patch("agent.tools._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": [],
                "leave_id": "21",
                "leave_name": "事假",
                "reason": "私事",
            },
            jsessionid, memory,
        )
    assert mock_apply.await_args.kwargs["periods"] == []


async def test_delete_leave_empty_stdkey_passes_through(memory, jsessionid):
    with patch("agent.tools._delete_leave", new=AsyncMock(return_value={"success": False})) as mock_del:
        await dispatch(
            "delete_leave",
            {"stdkey": "", "barcode": "B001", "sdate": "1150521", "edate": "1150521"},
            jsessionid, memory,
        )
    assert mock_del.await_args.kwargs["stdkey"] == ""


async def test_fetch_schedule_missing_semester_value(memory, jsessionid):
    result = json.loads(await dispatch("fetch_schedule", {}, jsessionid, memory))
    assert "error" in result


async def test_apply_leave_missing_required_field(memory, jsessionid):
    result = json.loads(
        await dispatch(
            "apply_leave",
            {"periods": ["1"], "leave_id": "21", "leave_name": "事假", "reason": "私事"},
            jsessionid, memory,
        )
    )
    assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Group 8 — System prompt / security assertions
# ═══════════════════════════════════════════════════════════════════════════════

def test_system_prompt_includes_ai_guide():
    assert "AI 操作指南" in SYSTEM_PROMPT or "腳本清單" in SYSTEM_PROMPT


def test_system_prompt_has_injection_guard():
    assert "忽略" in SYSTEM_PROMPT
    assert "系統設定" in SYSTEM_PROMPT


def test_system_prompt_requires_traditional_chinese():
    assert "繁體中文" in SYSTEM_PROMPT


def test_system_prompt_requires_leave_confirmation():
    assert "確認" in SYSTEM_PROMPT
    assert "請假" in SYSTEM_PROMPT


def test_system_prompt_is_nonempty():
    assert len(SYSTEM_PROMPT.strip()) > 100


# ═══════════════════════════════════════════════════════════════════════════════
# Group 9 — _load_ai_guide
# ═══════════════════════════════════════════════════════════════════════════════

def test_load_ai_guide_missing_file_returns_empty():
    with patch("pathlib.Path.read_text", side_effect=FileNotFoundError):
        result = _load_ai_guide()
    assert result == ""


def test_load_ai_guide_returns_file_content():
    with patch("pathlib.Path.read_text", return_value="# 指南內容"):
        result = _load_ai_guide()
    assert result == "# 指南內容"


# ═══════════════════════════════════════════════════════════════════════════════
# Group 10 — _err helper
# ═══════════════════════════════════════════════════════════════════════════════

def test_err_returns_valid_json_with_error_key():
    result = json.loads(_err("something went wrong"))
    assert result["error"] == "something went wrong"
    assert result["success"] is False
    assert "error_code" in result


def test_err_handles_chinese_text():
    result = json.loads(_err("連線失敗"))
    assert result["error"] == "連線失敗"
    assert result["success"] is False


def test_err_handles_empty_string():
    result = json.loads(_err(""))
    assert result["error"] == ""
    assert result["success"] is False
    assert "error_code" in result


def test_err_output_is_valid_json():
    import json as _json
    _json.loads(_err("test"))  # should not raise


def test_err_with_explicit_error_code():
    from agent.errors import ErrorCode
    result = json.loads(_err("逾時", ErrorCode.NETWORK_TIMEOUT))
    assert result["error_code"] == "NET_001"
    assert result["success"] is False
