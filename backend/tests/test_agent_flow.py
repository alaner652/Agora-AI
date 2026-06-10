"""Agent 流程守則的迴歸測試：Tool Registry、schema 驗證、precondition 閘門、
有限遞迴的結構化失敗、重複失敗偵測。不需真實登入 / LLM / Docker。"""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx

import agent.tools as tools_mod
from agent.agent import (
    ChatAgent,
    DoneEvent,
    TextDeltaEvent,
    ToolResultEvent,
)
from agent.errors import ErrorCode
from agent.memory import ChatMemory
from agent.tool_meta import validate_args
from agent.tools import REGISTRY, TOOLS, dispatch, get_meta

# ---------------------------------------------------------------------------
# Fake LLM plumbing — mimics the OpenAI chat.completions.create shape.
# ---------------------------------------------------------------------------

def _tool_call(call_id: str, name: str, arguments: dict):
    fn = SimpleNamespace(name=name, arguments=json.dumps(arguments), model_extra=None)
    return SimpleNamespace(id=call_id, type="function", function=fn, model_extra=None)


def _assistant(content=None, tool_calls=None):
    return SimpleNamespace(
        role="assistant", content=content, tool_calls=tool_calls, model_extra=None,
    )


def _response(message):
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None, model="fake")


class _FakeLLM:
    """Returns scripted responses; repeats the last one when the script runs out."""

    def __init__(self, messages: list, repeat_last: bool = True) -> None:
        self._queue = [_response(m) for m in messages]
        self._repeat_last = repeat_last
        self._last = self._queue[-1] if self._queue else None
        self.create_calls = 0
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    def _create(self, **kwargs):
        self.create_calls += 1
        if self._queue:
            self._last = self._queue.pop(0)
        elif not self._repeat_last:
            raise AssertionError("FakeLLM ran out of scripted responses")
        return self._last


def _make_agent(llm, uid: str = "u1", logger=None) -> ChatAgent:
    mem = ChatMemory()
    mem.remember("uid", uid)
    return ChatAgent(jsessionid="sess", llm=llm, model="fake", memory=mem, logger=logger)


def _settings(monkeypatch, **llm_cfg) -> None:
    monkeypatch.setattr(
        "storage.settings.get_settings", lambda _uid: {"llm": llm_cfg}
    )


async def _collect(agen) -> list:
    return [ev async for ev in agen]


# ---------------------------------------------------------------------------
# 1. Tool Registry — single source of truth (原則 1/5)
# ---------------------------------------------------------------------------

def test_tools_derived_from_registry():
    names = [t["function"]["name"] for t in TOOLS]
    assert set(names) == set(REGISTRY)
    assert len(names) == len(REGISTRY)


def test_every_spec_has_handler():
    for name, spec in REGISTRY.items():
        assert spec.handler is not None, name
        assert callable(spec.handler)


def test_get_meta_unknown_is_inert():
    spec = get_meta("no_such_tool")
    assert spec.danger_level == 0
    assert spec.preconditions == []


# ---------------------------------------------------------------------------
# 2. Schema 邊界驗證 + enum (原則 5)
# ---------------------------------------------------------------------------

def test_validate_args_missing_required():
    spec = REGISTRY["apply_leave"]
    err = validate_args(spec, {"periods": ["1"], "leave_id": "22", "leave_name": "病假", "reason": "x"})
    assert err is not None and "date" in err


def test_validate_args_bad_enum():
    spec = REGISTRY["apply_leave"]
    err = validate_args(spec, {
        "date": "1150601", "periods": ["1"], "leave_id": "99",
        "leave_name": "病假", "reason": "x",
    })
    assert err is not None and "leave_id" in err


def test_validate_args_bad_array_item():
    spec = REGISTRY["apply_leave"]
    err = validate_args(spec, {
        "date": "1150601", "periods": ["1", "午休"], "leave_id": "22",
        "leave_name": "病假", "reason": "x",
    })
    assert err is not None and "periods" in err


def test_validate_args_wrong_type():
    spec = REGISTRY["fetch_schedule"]
    assert validate_args(spec, {"semester_value": 1142}) is not None


def test_validate_args_valid_passes():
    spec = REGISTRY["apply_leave"]
    err = validate_args(spec, {
        "date": "1150601", "periods": ["1", "2"], "leave_id": "22",
        "leave_name": "病假", "reason": "感冒",
    })
    assert err is None


async def test_dispatch_rejects_before_handler(monkeypatch):
    called = False

    async def _spy(**kwargs):
        nonlocal called
        called = True
        return {"success": True, "message": "ok"}

    monkeypatch.setattr(tools_mod, "_apply_leave", _spy)
    out = await dispatch("apply_leave", {
        "date": "1150601", "periods": ["1"], "leave_id": "99",
        "leave_name": "病假", "reason": "x",
    }, "sess", ChatMemory())
    data = json.loads(out)
    assert data["error_code"] == ErrorCode.TOOL_SCHEMA
    assert called is False  # schema gate fired before the action ran


async def test_dispatch_unknown_tool():
    out = await dispatch("definitely_not_a_tool", {}, "sess", ChatMemory())
    assert json.loads(out)["error_code"] == ErrorCode.TOOL_UNKNOWN


# ---------------------------------------------------------------------------
# 3. Precondition / danger 閘門 (原則 2)
# ---------------------------------------------------------------------------

async def test_precondition_blocks_apply_leave(monkeypatch):
    _settings(monkeypatch)
    called = False

    async def _spy(**kwargs):
        nonlocal called
        called = True
        return {"success": True, "message": "ok"}

    monkeypatch.setattr(tools_mod, "_apply_leave", _spy)

    llm = _FakeLLM([
        _assistant(tool_calls=[_tool_call("c1", "apply_leave", {
            "date": "1150601", "periods": ["1"], "leave_id": "22",
            "leave_name": "病假", "reason": "x",
        })]),
        _assistant(content="好的"),
    ], repeat_last=False)
    agent = _make_agent(llm)

    events = await _collect(agent.step("幫我請假"))
    blocked = [e for e in events if isinstance(e, ToolResultEvent) and not e.ok]
    assert blocked, "apply_leave should have been gated"
    assert json.loads(blocked[0].data)["error_code"] == ErrorCode.PRECONDITION_UNMET
    assert called is False


async def test_danger_requires_ask_user_after_precondition(monkeypatch):
    _settings(monkeypatch)
    applied = False

    async def _spy_apply(**kwargs):
        nonlocal applied
        applied = True
        return {"success": True, "message": "ok"}

    async def _fake_form(jsessionid, date):
        return {"scheduled": ["1", "2"], "period_order": ["1", "2"], "date": date}

    monkeypatch.setattr(tools_mod, "_apply_leave", _spy_apply)
    monkeypatch.setattr(tools_mod, "get_leave_form", _fake_form)

    llm = _FakeLLM([
        _assistant(tool_calls=[_tool_call("c1", "get_leave_form", {"date": "1150601"})]),
        _assistant(tool_calls=[_tool_call("c2", "apply_leave", {
            "date": "1150601", "periods": ["1"], "leave_id": "22",
            "leave_name": "病假", "reason": "x",
        })]),
        _assistant(content="完成"),
    ], repeat_last=False)
    agent = _make_agent(llm)

    events = await _collect(agent.step("幫我請病假"))
    codes = [
        json.loads(e.data).get("error_code")
        for e in events if isinstance(e, ToolResultEvent) and not e.ok
    ]
    assert ErrorCode.CONFIRMATION_REQUIRED in codes
    assert applied is False  # precondition met, but confirmation still required


# ---------------------------------------------------------------------------
# 4. 有限遞迴：結構化失敗輸出 (原則 4)
# ---------------------------------------------------------------------------

async def test_max_iterations_stops_with_reason(monkeypatch):
    _settings(monkeypatch, max_iterations=3)
    # get_current_date always succeeds and has no side effects → loop never
    # converges, so it must hit the iteration cap.
    llm = _FakeLLM([
        _assistant(tool_calls=[_tool_call("c1", "get_current_date", {})]),
    ], repeat_last=True)
    agent = _make_agent(llm)

    events = await _collect(agent.step("今天幾號"))
    assert llm.create_calls == 3
    texts = "".join(e.text for e in events if isinstance(e, TextDeltaEvent))
    assert "嘗試" in texts  # explicit "tried N times" failure message
    assert isinstance(events[-1], DoneEvent)


# ---------------------------------------------------------------------------
# 5. 重複失敗偵測 + 反思 scaffolding (原則 3)
# ---------------------------------------------------------------------------

async def test_repeated_failure_injects_reflection_then_aborts(monkeypatch):
    _settings(monkeypatch, max_iterations=20)

    async def _boom(*args, **kwargs):
        raise httpx.NetworkError("down")

    monkeypatch.setattr(tools_mod, "get_schedule", _boom)

    llm = _FakeLLM([
        _assistant(tool_calls=[_tool_call("c", "fetch_schedule", {"semester_value": "114,2"})]),
    ], repeat_last=True)
    agent = _make_agent(llm)

    events = await _collect(agent.step("看課表"))
    tool_results = [e for e in events if isinstance(e, ToolResultEvent)]
    # Exactly 3 attempts: fail, fail+reflection, fail+abort.
    assert len(tool_results) == 3
    assert all(not e.ok for e in tool_results)
    assert "reflection" in json.loads(tool_results[1].data)  # 2nd attempt nudged
    texts = "".join(e.text for e in events if isinstance(e, TextDeltaEvent))
    assert "已停止重試" in texts
    assert isinstance(events[-1], DoneEvent)
    assert llm.create_calls == 3  # aborted well before the 20-call cap


# ---------------------------------------------------------------------------
# 6. ask_user round-trip is logged faithfully (session reproduction)
# ---------------------------------------------------------------------------

async def test_ask_user_answer_is_logged_as_option_turn(monkeypatch, tmp_path):
    from agent.conv_logger import ConversationLogger

    _settings(monkeypatch)
    logger = ConversationLogger(log_dir=tmp_path, uid="u1", model="fake")

    llm = _FakeLLM([
        _assistant(tool_calls=[_tool_call("c1", "ask_user", {
            "question": "請問您要請病假的節次為何？", "options": ["全部", "取消申請"],
        })]),
        _assistant(content="好的，已為您送出全天病假申請。"),
    ], repeat_last=False)
    agent = _make_agent(llm, logger=logger)

    await _collect(agent.step("幫我明天請病假"))
    # Asking turn is finalized with the question as assistant text (not empty).
    assert len(logger._session.turns) == 1
    t1 = logger._session.turns[0]
    assert t1.user == "幫我明天請病假"
    assert t1.user_kind == "text"
    assert t1.assistant == "請問您要請病假的節次為何？"

    await _collect(agent.answer_ask_user("全部"))
    # The answer opens its own turn, tagged as an option reply.
    assert len(logger._session.turns) == 2
    t2 = logger._session.turns[1]
    assert t2.user == "全部"
    assert t2.user_kind == "option"
    assert t2.assistant == "好的，已為您送出全天病假申請。"
