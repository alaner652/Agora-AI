"""切換舊 session 的重現測試：ask_user 的選項回覆（user_kind="option"）必須
以 selectedOption 重建，多步 ask_user 不被壓平。不需真實登入 / Docker。"""

from __future__ import annotations

import pytest

import storage._db as _db
from storage.messages import (
    get_session_display_messages,
    init_messages_db,
    upsert_conversation_turn,
)
from storage.sessions import init_sessions_db, upsert_session_meta

_SID = "2026-06-09-session-01"
_UID = "u1"


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(_db, "_DB", tmp_path / "t.db")
    init_sessions_db()
    init_messages_db()
    upsert_session_meta(_SID, _UID, "2026-06-09T00:00:00", "", 0, "請假")
    yield


def test_option_turn_reproduces_as_selected_option(temp_db):
    # Turn 1: 一般輸入 + 工具 + ask_user 問題（存成 assistant text）
    upsert_conversation_turn(
        _SID, 1, "幫我明天請病假", "請問您要請病假的節次為何？",
        [{"name": "get_leave_form", "ok": True}], 1.0,
    )
    # Turn 2: 選項回覆（user_kind="option"）+ 後續 assistant
    upsert_conversation_turn(
        _SID, 2, "全部", "好的，已為您送出全天病假申請。",
        [], 2.0, user_kind="option",
    )

    msgs = get_session_display_messages(_SID, _UID)
    assert msgs is not None

    # Turn 1 的問題以 assistant text 重現（不是空泡泡）
    assert {"role": "user", "content": "幫我明天請病假"} in msgs
    assert any(m["role"] == "assistant" and m["content"].startswith("請問您要請病假") for m in msgs)

    # Turn 2 的選項回覆帶 selectedOption，前端才能畫成 chip
    opt = next(m for m in msgs if m["role"] == "user" and m.get("selectedOption"))
    assert opt["selectedOption"] == "全部"

    # 一般輸入不應誤標成 option
    normal = next(m for m in msgs if m["role"] == "user" and m["content"] == "幫我明天請病假")
    assert "selectedOption" not in normal


def test_plain_text_turn_has_no_selected_option(temp_db):
    upsert_conversation_turn(_SID, 1, "查成績", "這是您的成績…", [], 1.0)
    msgs = get_session_display_messages(_SID, _UID)
    user_msgs = [m for m in msgs if m["role"] == "user"]
    assert user_msgs == [{"role": "user", "content": "查成績"}]
