"""_enforce_llm_quota 閘門邏輯測試（不需真實登入 / Docker）。

現行邏輯：非 BYOK 一律回 LLM_001（強制自備金鑰）。
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

import api.app as app


class _FakeRegistry:
    def __init__(self, byok: bool) -> None:
        self._byok = byok

    def is_byok(self, _token: str) -> bool:
        return self._byok


def _use_registry(monkeypatch, byok: bool):
    monkeypatch.setattr(app, "_registry", _FakeRegistry(byok))


async def test_byok_always_passes(monkeypatch):
    _use_registry(monkeypatch, byok=True)
    await app._enforce_llm_quota("tok", "u1")  # 不應 raise


async def test_no_byok_returns_llm_001(monkeypatch):
    _use_registry(monkeypatch, byok=False)
    with pytest.raises(HTTPException) as ei:
        await app._enforce_llm_quota("tok", "u1")
    assert ei.value.status_code == 402
    assert ei.value.detail["error_code"] == "LLM_001"
