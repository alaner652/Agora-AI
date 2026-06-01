"""SQLite-backed chat session management (multi-session per user)."""

from __future__ import annotations

import pathlib
import sqlite3
import time
import uuid
from dataclasses import dataclass

_DB = pathlib.Path(__file__).parent.parent.parent / "data" / "history.db"


def init_sessions_db() -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id  TEXT PRIMARY KEY,
                uid         TEXT NOT NULL,
                title       TEXT,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_uid ON chat_sessions (uid)")


@dataclass
class SessionInfo:
    session_id: str
    uid: str
    title: str | None
    created_at: float
    updated_at: float


def create_session(uid: str, title: str | None = None) -> str:
    session_id = str(uuid.uuid4())
    now = time.time()
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            "INSERT INTO chat_sessions (session_id, uid, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, uid, title, now, now),
        )
    return session_id


def list_sessions(uid: str) -> list[SessionInfo]:
    with sqlite3.connect(_DB) as conn:
        rows = conn.execute(
            "SELECT session_id, uid, title, created_at, updated_at FROM chat_sessions WHERE uid = ? ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()
    return [SessionInfo(*row) for row in rows]


def get_session_info(session_id: str) -> SessionInfo | None:
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            "SELECT session_id, uid, title, created_at, updated_at FROM chat_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return SessionInfo(*row) if row else None


def update_session_title(session_id: str, title: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE session_id = ?",
            (title, time.time(), session_id),
        )


def touch_session(session_id: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            "UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?",
            (time.time(), session_id),
        )


def delete_session(session_id: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("DELETE FROM chat_sessions WHERE session_id = ?", (session_id,))
