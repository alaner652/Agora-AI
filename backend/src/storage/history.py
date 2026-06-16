"""SQLite-backed chat history storage, keyed by uid."""

from __future__ import annotations

import json
import time

from ._db import connect

_HISTORY_CAP = 200


def init_db() -> None:
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                uid               TEXT PRIMARY KEY,
                messages_json     TEXT NOT NULL,
                viewed_session_id TEXT,
                updated_at        REAL NOT NULL
            )
        """)
        # Migrate: add viewed_session_id if table already exists without it
        cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_history)")}
        if "viewed_session_id" not in cols:
            conn.execute("ALTER TABLE chat_history ADD COLUMN viewed_session_id TEXT")


def save_history(uid: str, messages: list[dict], viewed_session_id: str | None = None) -> None:
    slim = messages[-_HISTORY_CAP:]
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO chat_history (uid, messages_json, viewed_session_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                messages_json     = excluded.messages_json,
                viewed_session_id = excluded.viewed_session_id,
                updated_at        = excluded.updated_at
            """,
            (uid, json.dumps(slim, ensure_ascii=False), viewed_session_id, time.time()),
        )


def load_history(uid: str) -> list[dict]:
    with connect() as conn:
        row = conn.execute(
            "SELECT messages_json FROM chat_history WHERE uid = ?", (uid,)
        ).fetchone()
    return json.loads(row[0]) if row else []


def get_viewed_session_id(uid: str) -> str | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT viewed_session_id FROM chat_history WHERE uid = ?", (uid,)
        ).fetchone()
    return row[0] if row else None


def clear_history(uid: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM chat_history WHERE uid = ?", (uid,))
