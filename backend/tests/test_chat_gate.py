"""_enforce_llm_quota 閘門邏輯測試（不需真實登入 / Docker）。"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

import storage._db as _db
from storage import usage
import api.app as app


class _FakeRegistry:
    def __init__(self, byok: bool) -> None:
        self._byok = byok

    def is_byok(self, _token: str) -> bool:
        return self._byok


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(_db, "_DB", tmp_path / "t.db")
    usage.init_usage_db()
    yield


def _use_registry(monkeypatch, byok: bool):
    monkeypatch.setattr(app, "_registry", _FakeRegistry(byok))


async def test_byok_always_passes(temp_db, monkeypatch):
    _use_registry(monkeypatch, byok=True)
    monkeypatch.setattr(app, "_SERVER_LLM_AVAILABLE", False)  # 即使無伺服器金鑰
    await app._enforce_llm_quota("tok", "u1")  # 不應 raise


async def test_no_server_key_returns_llm_001(temp_db, monkeypatch):
    _use_registry(monkeypatch, byok=False)
    monkeypatch.setattr(app, "_SERVER_LLM_AVAILABLE", False)
    monkeypatch.setattr(app, "_FREE_DAILY_PER_USER", 20)
    with pytest.raises(HTTPException) as ei:
        await app._enforce_llm_quota("tok", "u1")
    assert ei.value.status_code == 402
    assert ei.value.detail["error_code"] == "LLM_001"


async def test_per_user_quota_returns_quota_001(temp_db, monkeypatch):
    _use_registry(monkeypatch, byok=False)
    monkeypatch.setattr(app, "_SERVER_LLM_AVAILABLE", True)
    monkeypatch.setattr(app, "_FREE_DAILY_PER_USER", 1)
    monkeypatch.setattr(app, "_FREE_DAILY_GLOBAL", 100)
    await app._enforce_llm_quota("tok", "u1")  # 第 1 則 OK
    with pytest.raises(HTTPException) as ei:
        await app._enforce_llm_quota("tok", "u1")  # 第 2 則超額
    assert ei.value.detail["error_code"] == "QUOTA_001"


async def test_global_quota_returns_quota_002(temp_db, monkeypatch):
    _use_registry(monkeypatch, byok=False)
    monkeypatch.setattr(app, "_SERVER_LLM_AVAILABLE", True)
    monkeypatch.setattr(app, "_FREE_DAILY_PER_USER", 100)
    monkeypatch.setattr(app, "_FREE_DAILY_GLOBAL", 1)
    await app._enforce_llm_quota("tok", "a")  # 全站第 1 則
    with pytest.raises(HTTPException) as ei:
        await app._enforce_llm_quota("tok", "b")  # 全站熔斷
    assert ei.value.detail["error_code"] == "QUOTA_002"
