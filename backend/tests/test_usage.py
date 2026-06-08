"""免費額度計數 storage.usage 的單元測試。"""

from __future__ import annotations

import pytest

import storage._db as _db
from storage import usage


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """把 SQLite 指向暫存檔並建表，彼此隔離。"""
    monkeypatch.setattr(_db, "_DB", tmp_path / "t.db")
    usage.init_usage_db()
    yield


def test_under_limits_allows_and_increments(temp_db):
    ok, code = usage.record_and_check("u1", per_user_limit=3, global_limit=100)
    assert ok and code == ""
    ok, code = usage.record_and_check("u1", per_user_limit=3, global_limit=100)
    assert ok and code == ""


def test_per_user_cap_blocks_without_incrementing(temp_db):
    for _ in range(2):
        assert usage.record_and_check("u1", 2, 100) == (True, "")
    # 第 3 次：個人額度滿
    assert usage.record_and_check("u1", 2, 100) == (False, "QUOTA_001")
    # 擋下時不增量：把上限放寬到 3 後仍能再用一次
    assert usage.record_and_check("u1", 3, 100) == (True, "")


def test_global_cap_blocks(temp_db):
    # 兩個不同 uid 各用一次，全站總量到 2
    assert usage.record_and_check("a", 100, 2) == (True, "")
    assert usage.record_and_check("b", 100, 2) == (True, "")
    # 第三個人：個人額度還有，但全站保險絲熔斷
    assert usage.record_and_check("c", 100, 2) == (False, "QUOTA_002")


def test_per_user_checked_before_global(temp_db):
    # 個人與全站同時達標時，回個人的 QUOTA_001（先檢查個人）
    assert usage.record_and_check("u1", 1, 1) == (True, "")
    assert usage.record_and_check("u1", 1, 1) == (False, "QUOTA_001")


def test_day_rollover_resets(temp_db, monkeypatch):
    monkeypatch.setattr(usage, "_today", lambda: "2026-06-08")
    assert usage.record_and_check("u1", 1, 100) == (True, "")
    assert usage.record_and_check("u1", 1, 100) == (False, "QUOTA_001")
    # 跨到隔天 → 歸零
    monkeypatch.setattr(usage, "_today", lambda: "2026-06-09")
    assert usage.record_and_check("u1", 1, 100) == (True, "")
