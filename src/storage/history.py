"""SQLite-backed chat history storage, keyed by session_id."""

from __future__ import annotations

import json
import pathlib
import sqlite3
import time
import uuid

_DB = pathlib.Path(__file__).parent.parent.parent / "data" / "history.db"
_MAX_MESSAGES = 200


def init_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        _migrate(conn)


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _migrate(conn: sqlite3.Connection) -> None:
    """Create or migrate chat_history to session_id-keyed schema."""
    from .sessions import init_sessions_db as _init_sessions
    _init_sessions()

    old_exists = _table_exists(conn, "chat_history")

    if old_exists and not _has_column(conn, "chat_history", "session_id"):
        # Migrate: old schema had uid as PK; create sessions and re-key
        old_rows = conn.execute(
            "SELECT uid, messages_json, updated_at FROM chat_history"
        ).fetchall()

        conn.execute("DROP TABLE chat_history")
        _create_history_table(conn)

        now = time.time()
        for uid, messages_json, updated_at in old_rows:
            session_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO chat_sessions (session_id, uid, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (session_id, uid, "（遷移的對話）", now, updated_at),
            )
            conn.execute(
                "INSERT INTO chat_history (session_id, uid, messages_json, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, uid, messages_json, updated_at),
            )
    elif not old_exists:
        _create_history_table(conn)


def _create_history_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            session_id    TEXT PRIMARY KEY,
            uid           TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            updated_at    REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_uid ON chat_history (uid)")


def save_history(session_id: str, uid: str, messages: list[dict]) -> None:
    slim = messages[-_MAX_MESSAGES:]
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT INTO chat_history (session_id, uid, messages_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                messages_json = excluded.messages_json,
                updated_at    = excluded.updated_at
            """,
            (session_id, uid, json.dumps(slim, ensure_ascii=False), time.time()),
        )


def load_history(session_id: str) -> list[dict]:
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            "SELECT messages_json FROM chat_history WHERE session_id = ?", (session_id,)
        ).fetchone()
    return json.loads(row[0]) if row else []


def clear_history(session_id: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("DELETE FROM chat_history WHERE session_id = ?", (session_id,))
