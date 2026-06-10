"""清除對話的迴歸測試：清除必須讓 GET /history 真的變空 —— 含重設活躍 session、
刪掉 conversation_messages、清掉 live snapshot。不需真實登入 / Docker。"""

from __future__ import annotations

import pytest

import storage._db as _db
from api.routes import _clear_all_conversations, _clear_current_conversation
from storage.history import init_db as init_history_db
from storage.history import load_history, save_history
from storage.messages import (
    get_session_display_messages,
    init_messages_db,
    upsert_conversation_turn,
)
from storage.sessions import init_sessions_db, upsert_session_meta

_UID = "u1"


class _FakeReg:
    """Stand-in for AgentRegistry: tracks new_session and yields a current sid."""

    def __init__(self, current_sid: str | None) -> None:
        self._sid = current_sid
        self.rotated = False

    def get_current_session_id(self, _token: str) -> str | None:
        return self._sid

    async def new_session(self, _token: str) -> None:
        # Real impl flushes + rotates the live agent; here we just mark rotation
        # and clear the "current" pointer so post-clear reconstruction is empty.
        self.rotated = True
        self._sid = None


def _seed_session(sid: str, user: str = "查課表", assistant: str = "好的") -> None:
    upsert_session_meta(sid, _UID, "2026-06-09T00:00:00", "", 1, user)
    upsert_conversation_turn(sid, 1, user, assistant, [{"name": "fetch_schedule", "ok": True}], 1.0)


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(_db, "_DB", tmp_path / "t.db")
    init_sessions_db()
    init_messages_db()
    init_history_db()
    yield


async def test_clear_current_wipes_session_and_snapshot(temp_db):
    sid = "2026-06-09-session-01"
    _seed_session(sid)
    save_history(_UID, [{"role": "user", "content": "查課表"}, {"role": "assistant", "content": "好的"}])

    reg = _FakeReg(current_sid=sid)
    await _clear_current_conversation(reg, "tok", _UID)

    assert reg.rotated is True
    # 該 session 的 rich 訊息（重建顯示用）整個不見 → GET /history 不會撈回
    assert get_session_display_messages(sid, _UID) is None
    # live snapshot 也清空
    assert load_history(_UID) == []


async def test_clear_all_wipes_every_session(temp_db):
    _seed_session("2026-06-09-session-01", user="查課表")
    _seed_session("2026-06-09-session-02", user="查成績")
    save_history(_UID, [{"role": "user", "content": "查成績"}])

    reg = _FakeReg(current_sid="2026-06-09-session-02")
    deleted = await _clear_all_conversations(reg, "tok", _UID)

    assert reg.rotated is True
    assert deleted == 2
    assert get_session_display_messages("2026-06-09-session-01", _UID) is None
    assert get_session_display_messages("2026-06-09-session-02", _UID) is None
    assert load_history(_UID) == []


def test_delete_session_also_removes_conversation_messages(temp_db):
    from storage.sessions import delete_session

    sid = "2026-06-09-session-09"
    _seed_session(sid)
    assert get_session_display_messages(sid, _UID) is not None  # exists before

    assert delete_session(sid, _UID) is True
    # owner row gone AND conversation_messages purged (no orphan rows)
    assert get_session_display_messages(sid, _UID) is None
