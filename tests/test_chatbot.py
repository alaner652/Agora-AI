"""
chatbot edge-case test suite
Groups:
  1. _trim_messages
  2. _message_to_dict
  3. _dispatch — error paths
  4. _dispatch — tool routes (happy path)
  5. render_image (cache miss / hit / custom title)
  6. ask_user (selection, invalid input, EOF/interrupt)
  7. Input validation edge cases
  8. System prompt / security assertions
"""
import json
import pytest
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import httpx

import chatbot as cb
from chatbot import _dispatch, _trim_messages, _message_to_dict, SYSTEM_PROMPT


# ─── helpers ─────────────────────────────────────────────────────────────────

def _make_msg(role: str) -> dict:
    return {"role": role, "content": "x"}


def _fake_openai_msg(role="assistant", content="hello", tool_calls=None):
    """Mimics the object returned by openai sdk (has .role .content .tool_calls)."""
    return SimpleNamespace(role=role, content=content, tool_calls=tool_calls or [])


# ═══════════════════════════════════════════════════════════════════════════════
# Group 1 — _trim_messages
# ═══════════════════════════════════════════════════════════════════════════════

def test_trim_under_limit():
    msgs = [_make_msg("user") for _ in range(20)]
    assert _trim_messages(msgs) is msgs


def test_trim_over_limit():
    msgs = [_make_msg("user") for _ in range(45)]
    result = _trim_messages(msgs)
    assert len(result) == 40
    assert result == msgs[-40:]


def test_trim_strips_leading_tool():
    # 5 users + 1 tool + 39 users = 45 total
    # last 40 = [tool] + [user]*39  →  strip leading tool → [user]*39
    msgs = [_make_msg("user")] * 5 + [_make_msg("tool")] + [_make_msg("user")] * 39
    result = _trim_messages(msgs)
    assert result[0]["role"] != "tool"


def test_trim_strips_multiple_leading_tools():
    # last 40 start with 3 consecutive tool messages
    msgs = [_make_msg("user")] * 5 + [_make_msg("tool")] * 3 + [_make_msg("user")] * 37
    result = _trim_messages(msgs)
    assert result[0]["role"] != "tool"


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


# ═══════════════════════════════════════════════════════════════════════════════
# Group 3 — _dispatch: error paths
# ═══════════════════════════════════════════════════════════════════════════════

async def test_unknown_tool(data_cache, jsessionid):
    result = json.loads(await _dispatch("nonexistent", {}, jsessionid, data_cache))
    assert "error" in result
    assert "nonexistent" in result["error"]


async def test_timeout_error(data_cache, jsessionid):
    with patch("chatbot._sched_options", new=AsyncMock(side_effect=httpx.TimeoutException(""))):
        result = json.loads(await _dispatch("get_semester_options", {}, jsessionid, data_cache))
    assert "error" in result
    assert "逾時" in result["error"]


async def test_value_error_non_session(data_cache, jsessionid):
    with patch("chatbot._sched_options", new=AsyncMock(side_effect=ValueError("其他錯誤"))):
        result = json.loads(await _dispatch("get_semester_options", {}, jsessionid, data_cache))
    assert result == {"error": "其他錯誤"}


async def test_value_error_session_expired_propagates(data_cache, jsessionid):
    """Session 過期 ValueError 應向上拋出，由 chat() 層處理 refresh。"""
    with patch("chatbot._sched_options", new=AsyncMock(side_effect=ValueError("Session 過期"))):
        with pytest.raises(ValueError, match="Session 過期"):
            await _dispatch("get_semester_options", {}, jsessionid, data_cache)


async def test_key_error_missing_arg(data_cache, jsessionid):
    # fetch_schedule requires "semester_value"; passing empty args causes KeyError
    result = json.loads(await _dispatch("fetch_schedule", {}, jsessionid, data_cache))
    assert "error" in result


async def test_type_error(data_cache, jsessionid):
    with patch("chatbot.get_leaves", new=AsyncMock(side_effect=TypeError("wrong type"))):
        result = json.loads(
            await _dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, data_cache)
        )
    assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Group 4 — _dispatch: tool happy paths
# ═══════════════════════════════════════════════════════════════════════════════

async def test_get_semester_options(data_cache, jsessionid):
    mock_list = [{"label": "114-2", "value": "114,2"}]
    with patch("chatbot._sched_options", new=AsyncMock(return_value=mock_list)):
        raw = await _dispatch("get_semester_options", {}, jsessionid, data_cache)
    assert json.loads(raw) == mock_list


async def test_fetch_schedule_populates_cache(data_cache, jsessionid):
    entries = [{"weekday": 1, "period": "1", "course": "微積分"}]
    with patch("chatbot.get_schedule", new=AsyncMock(return_value=entries)):
        await _dispatch("fetch_schedule", {"semester_value": "114,2"}, jsessionid, data_cache)
    assert data_cache["schedule"]["entries"] == entries
    assert data_cache["schedule"]["title"] == "114,2"


async def test_fetch_absence_with_explicit_dates(data_cache, jsessionid):
    entries = [{"date": "115/05/10", "type": "事假"}]
    with patch("chatbot.get_absence", new=AsyncMock(return_value=entries)) as mock_abs:
        await _dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "1150401", "end": "1150531"},
            jsessionid, data_cache,
        )
    mock_abs.assert_awaited_once_with(jsessionid, "114,2", start="1150401", end="1150531")
    assert data_cache["absence"]["entries"] == entries


async def test_fetch_absence_default_dates(data_cache, jsessionid):
    with patch("chatbot.get_absence", new=AsyncMock(return_value=[])) as mock_abs, \
         patch("chatbot.today_roc", return_value="1150528"), \
         patch("chatbot.days_ago_roc", return_value="1150428"):
        await _dispatch("fetch_absence", {"semester_value": "114,2"}, jsessionid, data_cache)
    mock_abs.assert_awaited_once_with(jsessionid, "114,2", start="1150428", end="1150528")


async def test_fetch_grades_populates_cache(data_cache, jsessionid):
    entries = [{"course": "資料結構", "score": "85"}]
    with patch("chatbot.get_grades", new=AsyncMock(return_value=entries)):
        await _dispatch("fetch_grades", {}, jsessionid, data_cache)
    assert data_cache["grades"]["entries"] == entries
    assert data_cache["grades"]["title"] == "歷年成績"


async def test_get_leaves_passes_date_range(data_cache, jsessionid):
    leaves = [{"barcode": "L001", "can_delete": True}]
    with patch("chatbot.get_leaves", new=AsyncMock(return_value=leaves)) as mock_lv:
        result = json.loads(
            await _dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, data_cache)
        )
    mock_lv.assert_awaited_once_with(jsessionid, "1150101", "1150531")
    assert result == leaves


async def test_get_leave_form_with_date(data_cache, jsessionid):
    form = {"period_order": ["1", "2"], "scheduled": ["1"], "date": "1150521"}
    with patch("actions.apply_leave.index.get_leave_form", new=AsyncMock(return_value=form)) as mock_form:
        result = json.loads(
            await _dispatch("get_leave_form", {"date": "1150521"}, jsessionid, data_cache)
        )
    mock_form.assert_awaited_once_with(jsessionid, "1150521")
    assert result == form


async def test_get_leave_form_no_date_passes_none(data_cache, jsessionid):
    form = {"period_order": [], "scheduled": [], "date": ""}
    with patch("actions.apply_leave.index.get_leave_form", new=AsyncMock(return_value=form)) as mock_form:
        await _dispatch("get_leave_form", {}, jsessionid, data_cache)
    mock_form.assert_awaited_once_with(jsessionid, None)


async def test_apply_leave_with_image(data_cache, jsessionid):
    with patch("chatbot._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await _dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": ["1", "2"],
                "leave_id": "23",
                "leave_name": "公假",
                "reason": "系科公假",
                "image_path": "/tmp/cert.jpg",
            },
            jsessionid, data_cache,
        )
    kw = mock_apply.await_args.kwargs
    assert kw["image_path"] == "/tmp/cert.jpg"
    assert kw["leave_id"] == "23"
    assert kw["periods"] == ["1", "2"]


async def test_apply_leave_no_image_defaults_none(data_cache, jsessionid):
    with patch("chatbot._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await _dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": ["1"],
                "leave_id": "21",
                "leave_name": "事假",
                "reason": "私事",
            },
            jsessionid, data_cache,
        )
    kw = mock_apply.await_args.kwargs
    assert kw["image_path"] is None


async def test_delete_leave_passes_all_args(data_cache, jsessionid):
    with patch("chatbot._delete_leave", new=AsyncMock(return_value={"success": True})) as mock_del:
        await _dispatch(
            "delete_leave",
            {"stdkey": "K001", "barcode": "B001", "sdate": "1150521", "edate": "1150521"},
            jsessionid, data_cache,
        )
    mock_del.assert_awaited_once_with(
        jsessionid=jsessionid, stdkey="K001", barcode="B001", sdate="1150521", edate="1150521"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Group 5 — render_image
# ═══════════════════════════════════════════════════════════════════════════════

async def test_render_cache_miss_schedule(data_cache, jsessionid):
    result = json.loads(await _dispatch("render_image", {"type": "schedule"}, jsessionid, data_cache))
    assert "error" in result
    assert "schedule" in result["error"]


async def test_render_cache_miss_absence(data_cache, jsessionid):
    result = json.loads(await _dispatch("render_image", {"type": "absence"}, jsessionid, data_cache))
    assert "error" in result


async def test_render_cache_miss_grades(data_cache, jsessionid):
    result = json.loads(await _dispatch("render_image", {"type": "grades"}, jsessionid, data_cache))
    assert "error" in result


async def test_render_schedule_after_fetch(data_cache, jsessionid):
    data_cache["schedule"] = {"entries": [], "title": "114,2"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png"), \
         patch("chatbot._show_image"):
        result = json.loads(
            await _dispatch("render_image", {"type": "schedule"}, jsessionid, data_cache)
        )
    assert result == {"path": "/output/schedule.png"}


async def test_render_absence_after_fetch(data_cache, jsessionid):
    data_cache["absence"] = {"entries": [], "title": "缺曠"}
    with patch("utils.render_absence.index.render", return_value="/output/absence.png"), \
         patch("chatbot._show_image"):
        result = json.loads(
            await _dispatch("render_image", {"type": "absence"}, jsessionid, data_cache)
        )
    assert result == {"path": "/output/absence.png"}


async def test_render_grades_after_fetch(data_cache, jsessionid):
    data_cache["grades"] = {"entries": [], "title": "歷年成績"}
    with patch("utils.render_grades.index.render", return_value="/output/grades.png"), \
         patch("chatbot._show_image"):
        result = json.loads(
            await _dispatch("render_image", {"type": "grades"}, jsessionid, data_cache)
        )
    assert result == {"path": "/output/grades.png"}


async def test_render_custom_title(data_cache, jsessionid):
    data_cache["schedule"] = {"entries": [], "title": "預設標題"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png") as mock_r, \
         patch("chatbot._show_image"):
        await _dispatch(
            "render_image", {"type": "schedule", "title": "自訂標題"}, jsessionid, data_cache
        )
    mock_r.assert_called_once_with([], title="自訂標題", output=ANY)


async def test_render_fallback_title_from_cache(data_cache, jsessionid):
    data_cache["schedule"] = {"entries": [], "title": "快取標題"}
    with patch("utils.render_schedule.index.render", return_value="/output/schedule.png") as mock_r, \
         patch("chatbot._show_image"):
        await _dispatch("render_image", {"type": "schedule"}, jsessionid, data_cache)
    mock_r.assert_called_once_with([], title="快取標題", output=ANY)


async def test_render_unknown_type(data_cache, jsessionid):
    # put something in cache so the cache-miss guard is bypassed
    data_cache["foo"] = {"entries": [], "title": ""}
    result = json.loads(await _dispatch("render_image", {"type": "foo"}, jsessionid, data_cache))
    assert "error" in result
    assert "foo" in result["error"]


# ═══════════════════════════════════════════════════════════════════════════════
# Group 6 — ask_user
# ═══════════════════════════════════════════════════════════════════════════════

async def test_ask_user_selects_first_option(data_cache, jsessionid):
    with patch("builtins.input", side_effect=["1"]):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "選假別？", "options": ["病假", "事假"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "病假"}


async def test_ask_user_selects_second_option(data_cache, jsessionid):
    with patch("builtins.input", side_effect=["2"]):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "選假別？", "options": ["病假", "事假"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "事假"}


async def test_ask_user_invalid_then_valid(data_cache, jsessionid):
    # "9" and "abc" are out of range → retries → "2" succeeds
    with patch("builtins.input", side_effect=["9", "abc", "2"]):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "確認？", "options": ["確認", "取消"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "取消"}


async def test_ask_user_zero_is_invalid(data_cache, jsessionid):
    with patch("builtins.input", side_effect=["0", "1"]):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "確認？", "options": ["確認", "取消"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "確認"}


async def test_ask_user_eof_returns_cancel(data_cache, jsessionid):
    with patch("builtins.input", side_effect=EOFError):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "確認？", "options": ["是", "否"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "取消"}


async def test_ask_user_keyboard_interrupt_returns_cancel(data_cache, jsessionid):
    with patch("builtins.input", side_effect=KeyboardInterrupt):
        result = json.loads(
            await _dispatch(
                "ask_user",
                {"question": "確認？", "options": ["是", "否"]},
                jsessionid, data_cache,
            )
        )
    assert result == {"selected": "取消"}


# ═══════════════════════════════════════════════════════════════════════════════
# Group 7 — Input validation edge cases
# ═══════════════════════════════════════════════════════════════════════════════

async def test_apply_leave_file_not_found_returns_error(data_cache, jsessionid):
    """FileNotFoundError from apply_leave is caught and returned as JSON error."""
    with patch("chatbot._apply_leave", new=AsyncMock(side_effect=FileNotFoundError("no such file"))):
        result = json.loads(
            await _dispatch(
                "apply_leave",
                {
                    "date": "1150521",
                    "periods": ["1"],
                    "leave_id": "23",
                    "leave_name": "公假",
                    "reason": "系科公假",
                    "image_path": "/nonexistent/cert.jpg",
                },
                jsessionid, data_cache,
            )
        )
    assert "error" in result


async def test_fetch_absence_bad_start_too_short(data_cache, jsessionid):
    # "11504" has length 5, not 7 → _split_roc_date raises ValueError
    result = json.loads(
        await _dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "11504"},
            jsessionid, data_cache,
        )
    )
    assert "error" in result


async def test_fetch_absence_bad_start_non_digit(data_cache, jsessionid):
    # "115abcd" has length 7 but contains non-digits
    result = json.loads(
        await _dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "115abcd"},
            jsessionid, data_cache,
        )
    )
    assert "error" in result


async def test_fetch_absence_bad_end_non_digit(data_cache, jsessionid):
    # "invalid" has 7 chars but not digits
    result = json.loads(
        await _dispatch(
            "fetch_absence",
            {"semester_value": "114,2", "start": "1150401", "end": "invalid"},
            jsessionid, data_cache,
        )
    )
    assert "error" in result


async def test_get_leaves_empty_result_no_error(data_cache, jsessionid):
    with patch("chatbot.get_leaves", new=AsyncMock(return_value=[])):
        result = json.loads(
            await _dispatch("get_leaves", {"start": "1150101", "end": "1150531"}, jsessionid, data_cache)
        )
    assert result == []


async def test_apply_leave_empty_periods_passes_through(data_cache, jsessionid):
    """Empty periods list is passed to the action without local validation."""
    with patch("chatbot._apply_leave", new=AsyncMock(return_value={"success": True})) as mock_apply:
        await _dispatch(
            "apply_leave",
            {
                "date": "1150521",
                "periods": [],
                "leave_id": "21",
                "leave_name": "事假",
                "reason": "私事",
            },
            jsessionid, data_cache,
        )
    assert mock_apply.await_args.kwargs["periods"] == []


async def test_delete_leave_empty_stdkey_passes_through(data_cache, jsessionid):
    """Empty stdkey (from failed regex parse) is forwarded without validation."""
    with patch("chatbot._delete_leave", new=AsyncMock(return_value={"success": False})) as mock_del:
        await _dispatch(
            "delete_leave",
            {"stdkey": "", "barcode": "B001", "sdate": "1150521", "edate": "1150521"},
            jsessionid, data_cache,
        )
    assert mock_del.await_args.kwargs["stdkey"] == ""


async def test_fetch_schedule_missing_semester_value(data_cache, jsessionid):
    """KeyError from missing required arg returns JSON error, not crash."""
    result = json.loads(await _dispatch("fetch_schedule", {}, jsessionid, data_cache))
    assert "error" in result


async def test_apply_leave_missing_required_field(data_cache, jsessionid):
    """Missing 'date' field in apply_leave returns JSON error."""
    result = json.loads(
        await _dispatch(
            "apply_leave",
            {"periods": ["1"], "leave_id": "21", "leave_name": "事假", "reason": "私事"},
            jsessionid, data_cache,
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
# Group 1 追加 — _trim_messages 邊界
# ═══════════════════════════════════════════════════════════════════════════════

def test_trim_exactly_at_limit():
    msgs = [_make_msg("user") for _ in range(40)]
    assert _trim_messages(msgs) is msgs  # 剛好在限制內，回傳同一物件


def test_trim_one_over_limit():
    msgs = [_make_msg("user") for _ in range(41)]
    result = _trim_messages(msgs)
    assert len(result) == 40


def test_trim_all_tail_messages_tool_empties_list():
    # 41 則，tail 40 全是 tool → 逐一剝除後變空 list
    msgs = [_make_msg("user")] + [_make_msg("tool")] * 40
    result = _trim_messages(msgs)
    assert result == []  # 全被 strip，context 清空（edge case，不理想但是現有行為）


# ═══════════════════════════════════════════════════════════════════════════════
# Group 2 追加 — _message_to_dict 邊界
# ═══════════════════════════════════════════════════════════════════════════════

def test_msg_to_dict_empty_tool_calls_no_key():
    # 空 list 為 falsy → 不應輸出 "tool_calls" key
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
# Group 3 追加 — NetworkError 攔截（修復後行為）
# ═══════════════════════════════════════════════════════════════════════════════

async def test_network_error_returns_json_error(data_cache, jsessionid):
    """httpx.ConnectError（NetworkError 子類）應被攔截為 JSON error，不再崩潰。"""
    with patch("chatbot._sched_options", new=AsyncMock(side_effect=httpx.ConnectError(""))):
        result = json.loads(await _dispatch("get_semester_options", {}, jsessionid, data_cache))
    assert "error" in result
    assert "連線失敗" in result["error"]


async def test_read_error_returns_json_error(data_cache, jsessionid):
    """httpx.ReadError 也是 NetworkError 子類，同樣應被攔截。"""
    with patch("chatbot._sched_options", new=AsyncMock(side_effect=httpx.ReadError(""))):
        result = json.loads(await _dispatch("get_semester_options", {}, jsessionid, data_cache))
    assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Group 4 追加 — 工具回傳值的 passthrough
# ═══════════════════════════════════════════════════════════════════════════════

async def test_get_semester_options_empty_list(data_cache, jsessionid):
    with patch("chatbot._sched_options", new=AsyncMock(return_value=[])):
        result = json.loads(await _dispatch("get_semester_options", {}, jsessionid, data_cache))
    assert result == []


async def test_apply_leave_result_passthrough(data_cache, jsessionid):
    leave_result = {"success": True, "message": "申請完成"}
    with patch("chatbot._apply_leave", new=AsyncMock(return_value=leave_result)):
        result = json.loads(
            await _dispatch(
                "apply_leave",
                {"date": "1150521", "periods": ["1"], "leave_id": "21",
                 "leave_name": "事假", "reason": "私事"},
                jsessionid, data_cache,
            )
        )
    assert result == leave_result


async def test_delete_leave_result_passthrough(data_cache, jsessionid):
    del_result = {"success": False, "message": "已審核，無法刪除"}
    with patch("chatbot._delete_leave", new=AsyncMock(return_value=del_result)):
        result = json.loads(
            await _dispatch(
                "delete_leave",
                {"stdkey": "K1", "barcode": "B1", "sdate": "1150521", "edate": "1150521"},
                jsessionid, data_cache,
            )
        )
    assert result == del_result


async def test_render_show_image_called_with_path(data_cache, jsessionid):
    data_cache["grades"] = {"entries": [], "title": "歷年成績"}
    with patch("utils.render_grades.index.render", return_value="/output/grades.png"), \
         patch("chatbot._show_image") as mock_show:
        await _dispatch("render_image", {"type": "grades"}, jsessionid, data_cache)
    mock_show.assert_called_once_with("/output/grades.png")


async def test_fetch_grades_title_hardcoded(data_cache, jsessionid):
    with patch("chatbot.get_grades", new=AsyncMock(return_value=[])):
        await _dispatch("fetch_grades", {}, jsessionid, data_cache)
    assert data_cache["grades"]["title"] == "歷年成績"


# ═══════════════════════════════════════════════════════════════════════════════
# Group 6 追加 — ask_user 更多無效輸入
# ═══════════════════════════════════════════════════════════════════════════════

async def test_ask_user_negative_number_invalid(data_cache, jsessionid):
    # "-1".isdigit() → False → 重試
    with patch("builtins.input", side_effect=["-1", "1"]):
        result = json.loads(
            await _dispatch("ask_user", {"question": "?", "options": ["A", "B"]},
                            jsessionid, data_cache)
        )
    assert result == {"selected": "A"}


async def test_ask_user_float_invalid(data_cache, jsessionid):
    # "1.5".isdigit() → False → 重試
    with patch("builtins.input", side_effect=["1.5", "2"]):
        result = json.loads(
            await _dispatch("ask_user", {"question": "?", "options": ["A", "B"]},
                            jsessionid, data_cache)
        )
    assert result == {"selected": "B"}


async def test_ask_user_empty_string_invalid(data_cache, jsessionid):
    with patch("builtins.input", side_effect=["", "1"]):
        result = json.loads(
            await _dispatch("ask_user", {"question": "?", "options": ["A", "B"]},
                            jsessionid, data_cache)
        )
    assert result == {"selected": "A"}


async def test_ask_user_out_of_range_large(data_cache, jsessionid):
    # 數字超過選項數量（999）→ 重試
    with patch("builtins.input", side_effect=["999", "2"]):
        result = json.loads(
            await _dispatch("ask_user", {"question": "?", "options": ["A", "B"]},
                            jsessionid, data_cache)
        )
    assert result == {"selected": "B"}


# ═══════════════════════════════════════════════════════════════════════════════
# Group 9 — _load_ai_guide
# ═══════════════════════════════════════════════════════════════════════════════

def test_load_ai_guide_missing_file_returns_empty():
    from chatbot import _load_ai_guide
    with patch("pathlib.Path.read_text", side_effect=FileNotFoundError):
        result = _load_ai_guide()
    assert result == ""


def test_load_ai_guide_returns_file_content():
    from chatbot import _load_ai_guide
    with patch("pathlib.Path.read_text", return_value="# 指南內容"):
        result = _load_ai_guide()
    assert result == "# 指南內容"


# ═══════════════════════════════════════════════════════════════════════════════
# Group 10 — _err 工具函式
# ═══════════════════════════════════════════════════════════════════════════════

def test_err_returns_valid_json_with_error_key():
    from chatbot import _err
    assert json.loads(_err("something went wrong")) == {"error": "something went wrong"}


def test_err_handles_chinese_text():
    from chatbot import _err
    result = json.loads(_err("連線失敗"))
    assert result["error"] == "連線失敗"


def test_err_handles_empty_string():
    from chatbot import _err
    result = json.loads(_err(""))
    assert result == {"error": ""}


def test_err_output_is_valid_json():
    from chatbot import _err
    import json as _json
    raw = _err("test")
    _json.loads(raw)  # should not raise
