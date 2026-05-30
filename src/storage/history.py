"""SQLite-backed chat history storage, keyed by uid."""

from __future__ import annotations

import json
import pathlib
import sqlite3
import time

_DB = pathlib.Path("data/history.db")
_MAX_MESSAGES = 200


def init_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                uid          TEXT PRIMARY KEY,
                messages_json TEXT NOT NULL,
                updated_at   REAL NOT NULL
            )
        """)


def save_history(uid: str, messages: list[dict]) -> None:
    slim = messages[-_MAX_MESSAGES:]
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT INTO chat_history (uid, messages_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                messages_json = excluded.messages_json,
                updated_at    = excluded.updated_at
            """,
            (uid, json.dumps(slim, ensure_ascii=False), time.time()),
        )


def load_history(uid: str) -> list[dict]:
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            "SELECT messages_json FROM chat_history WHERE uid = ?", (uid,)
        ).fetchone()
    return json.loads(row[0]) if row else []


def clear_history(uid: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("DELETE FROM chat_history WHERE uid = ?", (uid,))
