"""Free-tier LLM usage counters — per-user + global daily caps.

Counts server-LLM `/chat` messages so we can offer a small free quota while
keeping cost bounded; once a cap is hit the caller steers the user to BYOK.
BYOK users are never counted here (they pay their own way).

One row per (scope, day): scope is the uid, plus a sentinel `__global__` row
that aggregates everyone for the site-wide fuse. Day boundary is Asia/Taipei
so "today" matches the students' wall clock.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from ._db import connect

_GLOBAL = "__global__"
_TZ = ZoneInfo("Asia/Taipei")


def _today() -> str:
    return datetime.now(_TZ).date().isoformat()


def init_usage_db() -> None:
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_quota (
                scope TEXT NOT NULL,
                day   TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (scope, day)
            )
        """)


def record_and_check(uid: str, per_user_limit: int, global_limit: int) -> tuple[bool, str]:
    """Atomically check both caps and, only if neither is hit, bump both by 1.

    Returns (allowed, error_code). On a hit returns (False, "QUOTA_001") for the
    per-user cap or (False, "QUOTA_002") for the site-wide cap, without
    incrementing. On success returns (True, "").
    """
    day = _today()
    with connect() as conn:
        # BEGIN IMMEDIATE so the read-then-write is serialised against other
        # writers (busy_timeout makes concurrent callers wait, not error).
        conn.execute("BEGIN IMMEDIATE")
        user_count = _count(conn, uid, day)
        if user_count >= per_user_limit:
            return False, "QUOTA_001"
        global_count = _count(conn, _GLOBAL, day)
        if global_count >= global_limit:
            return False, "QUOTA_002"
        for scope in (uid, _GLOBAL):
            conn.execute(
                """
                INSERT INTO llm_quota (scope, day, count) VALUES (?, ?, 1)
                ON CONFLICT(scope, day) DO UPDATE SET count = count + 1
                """,
                (scope, day),
            )
    return True, ""


def _count(conn, scope: str, day: str) -> int:
    row = conn.execute(
        "SELECT count FROM llm_quota WHERE scope = ? AND day = ?", (scope, day)
    ).fetchone()
    return row[0] if row else 0
