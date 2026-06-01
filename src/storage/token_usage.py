"""SQLite-backed token usage and cost tracking."""

from __future__ import annotations

import pathlib
import sqlite3
import time
from dataclasses import dataclass

_DB = pathlib.Path(__file__).parent.parent.parent / "data" / "history.db"


def init_token_usage_db() -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS token_usage (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT    NOT NULL,
                uid             TEXT    NOT NULL,
                model           TEXT    NOT NULL,
                input_tokens    INTEGER NOT NULL,
                output_tokens   INTEGER NOT NULL,
                cached_tokens   INTEGER NOT NULL DEFAULT 0,
                thinking_tokens INTEGER NOT NULL DEFAULT 0,
                cost_usd        REAL    NOT NULL,
                timestamp       REAL    NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_uid ON token_usage (uid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage (session_id)")


@dataclass
class UsageStats:
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    cost_usd: float
    turns: int


def record_usage(
    session_id: str,
    uid: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    thinking_tokens: int = 0,
    cost_usd: float = 0.0,
) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT INTO token_usage
                (session_id, uid, model, input_tokens, output_tokens,
                 cached_tokens, thinking_tokens, cost_usd, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, uid, model, input_tokens, output_tokens,
             cached_tokens, thinking_tokens, cost_usd, time.time()),
        )


def get_session_usage(session_id: str) -> UsageStats:
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(input_tokens),  0),
                COALESCE(SUM(output_tokens), 0),
                COALESCE(SUM(cached_tokens), 0),
                COALESCE(SUM(cost_usd),      0.0),
                COUNT(*)
            FROM token_usage WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()
    return UsageStats(
        input_tokens=row[0],
        output_tokens=row[1],
        cached_tokens=row[2],
        cost_usd=row[3],
        turns=row[4],
    )


def get_user_usage(uid: str, days: int = 30) -> UsageStats:
    since = time.time() - days * 86400
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(input_tokens),  0),
                COALESCE(SUM(output_tokens), 0),
                COALESCE(SUM(cached_tokens), 0),
                COALESCE(SUM(cost_usd),      0.0),
                COUNT(*)
            FROM token_usage WHERE uid = ? AND timestamp >= ?
            """,
            (uid, since),
        ).fetchone()
    return UsageStats(
        input_tokens=row[0],
        output_tokens=row[1],
        cached_tokens=row[2],
        cost_usd=row[3],
        turns=row[4],
    )
