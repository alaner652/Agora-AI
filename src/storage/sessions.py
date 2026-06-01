"""SQLite-backed session storage.

chat_sessions      — metadata only (session_id, uid, started_at, turn_count, title)
chat_session_turns — append-only turn content (session_id, turn_id, user, assistant)

Each turn writes exactly one INSERT into chat_session_turns (O(1)),
instead of rewriting the full conversation JSON (O(n²)).
"""

from __future__ import annotations

import pathlib
import sqlite3
import time

_DB = pathlib.Path("data/history.db")
_MAX_SESSIONS = 50


def init_sessions_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id  TEXT PRIMARY KEY,
                uid         TEXT NOT NULL,
                started_at  TEXT NOT NULL,
                ended_at    TEXT NOT NULL DEFAULT '',
                turn_count  INTEGER NOT NULL DEFAULT 0,
                title       TEXT NOT NULL DEFAULT '',
                updated_at  REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_session_turns (
                session_id  TEXT NOT NULL,
                turn_id     INTEGER NOT NULL,
                user        TEXT NOT NULL,
                assistant   TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (session_id, turn_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_uid ON chat_sessions(uid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_turns_session ON chat_session_turns(session_id)")

        # Migrate: drop legacy columns if present
        cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_sessions)")}
        for old_col in ("turns_json", "messages_json"):
            if old_col in cols:
                try:
                    conn.execute(f"ALTER TABLE chat_sessions DROP COLUMN {old_col}")
                except Exception:
                    pass  # SQLite < 3.35
        for new_col, definition in [
            ("turn_count", "INTEGER NOT NULL DEFAULT 0"),
            ("title", "TEXT NOT NULL DEFAULT ''"),
        ]:
            if new_col not in cols:
                conn.execute(f"ALTER TABLE chat_sessions ADD COLUMN {new_col} {definition}")


def upsert_session_meta(
    session_id: str,
    uid: str,
    started_at: str,
    ended_at: str,
    turn_count: int,
    title: str,
) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT INTO chat_sessions (session_id, uid, started_at, ended_at, turn_count, title, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                ended_at   = excluded.ended_at,
                turn_count = excluded.turn_count,
                title      = CASE WHEN title = '' THEN excluded.title ELSE title END,
                updated_at = excluded.updated_at
            """,
            (session_id, uid, started_at, ended_at, turn_count, title, time.time()),
        )


def insert_session_turn(
    session_id: str,
    turn_id: int,
    user: str,
    assistant: str,
) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO chat_session_turns (session_id, turn_id, user, assistant)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, turn_id, user, assistant),
        )


def list_sessions(uid: str) -> list[dict]:
    with sqlite3.connect(_DB) as conn:
        rows = conn.execute(
            """
            SELECT session_id, started_at, ended_at, turn_count, title
            FROM chat_sessions
            WHERE uid = ?
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (uid, _MAX_SESSIONS),
        ).fetchall()
    return [
        {
            "session_id": session_id,
            "started_at": started_at,
            "ended_at": ended_at,
            "turn_count": turn_count,
            "title": title or "",
        }
        for session_id, started_at, ended_at, turn_count, title in rows
    ]


def get_session_messages_slim(session_id: str, uid: str) -> list[dict] | None:
    with sqlite3.connect(_DB) as conn:
        # Verify ownership
        owner = conn.execute(
            "SELECT 1 FROM chat_sessions WHERE session_id = ? AND uid = ?",
            (session_id, uid),
        ).fetchone()
        if owner is None:
            return None

        rows = conn.execute(
            "SELECT user, assistant FROM chat_session_turns WHERE session_id = ? ORDER BY turn_id",
            (session_id,),
        ).fetchall()

    messages = []
    for user, assistant in rows:
        messages.append({"role": "user", "content": user})
        if assistant:
            messages.append({"role": "assistant", "content": assistant})
    return messages


def delete_session(session_id: str, uid: str) -> bool:
    with sqlite3.connect(_DB) as conn:
        cur = conn.execute(
            "DELETE FROM chat_sessions WHERE session_id = ? AND uid = ?",
            (session_id, uid),
        )
        if cur.rowcount > 0:
            conn.execute(
                "DELETE FROM chat_session_turns WHERE session_id = ?",
                (session_id,),
            )
            return True
    return False
