"""SQLite-backed conversation message storage.

Stores full message-level detail including tool calls/results,
enabling replay, debug, LLM behaviour analysis, and future search.

Complements chat_session_turns (kept for backward compat) with richer data.
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import uuid

_DB = pathlib.Path("data/history.db")


def init_messages_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id          TEXT PRIMARY KEY,
                session_id  TEXT NOT NULL,
                turn_id     INTEGER NOT NULL,
                role        TEXT NOT NULL,
                msg_type    TEXT NOT NULL,
                content     TEXT,
                tool_name   TEXT,
                tool_input  TEXT,
                tool_output TEXT,
                ok          INTEGER,
                latency_ms  REAL,
                error_code  TEXT,
                created_at  REAL NOT NULL
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conv_msgs_session "
            "ON conversation_messages(session_id, turn_id)"
        )


def upsert_conversation_turn(
    session_id: str,
    turn_id: int,
    user_text: str,
    assistant_text: str,
    tool_calls: list[dict],
    created_at: float,
) -> None:
    """Write all messages for a completed turn.

    Replaces any prior rows for (session_id, turn_id) so retries are safe.
    Rows inserted in logical order: user → tool_calls → assistant.
    """
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            "DELETE FROM conversation_messages WHERE session_id = ? AND turn_id = ?",
            (session_id, turn_id),
        )
        rows: list[tuple] = []

        # User message
        rows.append((
            str(uuid.uuid4()), session_id, turn_id,
            "user", "text", user_text,
            None, None, None, None, None, None, created_at,
        ))

        # Tool calls
        for tc in tool_calls:
            rows.append((
                str(uuid.uuid4()), session_id, turn_id,
                "tool", "tool_call",
                None,
                tc.get("name"), json.dumps(tc.get("input"), ensure_ascii=False),
                json.dumps(tc.get("output"), ensure_ascii=False),
                1 if tc.get("ok") else 0,
                tc.get("latency_ms"),
                tc.get("error_code"),
                created_at,
            ))

        # Assistant response
        if assistant_text:
            rows.append((
                str(uuid.uuid4()), session_id, turn_id,
                "assistant", "text", assistant_text,
                None, None, None, None, None, None, created_at,
            ))

        conn.executemany(
            """
            INSERT INTO conversation_messages
            (id, session_id, turn_id, role, msg_type, content,
             tool_name, tool_input, tool_output, ok, latency_ms, error_code, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def get_conversation_messages(session_id: str, uid: str) -> list[dict] | None:
    """Return all rich messages for a session, or None if session not found / wrong owner."""
    with sqlite3.connect(_DB) as conn:
        owner = conn.execute(
            "SELECT 1 FROM chat_sessions WHERE session_id = ? AND uid = ?",
            (session_id, uid),
        ).fetchone()
        if owner is None:
            return None

        rows = conn.execute(
            """
            SELECT id, turn_id, role, msg_type, content,
                   tool_name, tool_input, tool_output, ok, latency_ms, error_code, created_at
            FROM conversation_messages
            WHERE session_id = ?
            ORDER BY turn_id, rowid
            """,
            (session_id,),
        ).fetchall()

    result = []
    for (id_, turn_id, role, msg_type, content,
         tool_name, tool_input, tool_output, ok, latency_ms, error_code, created_at) in rows:
        entry: dict = {
            "id": id_,
            "turn_id": turn_id,
            "role": role,
            "type": msg_type,
            "createdAt": created_at,
        }
        if content is not None:
            entry["content"] = content
        if tool_name is not None:
            entry["tool"] = {
                "name": tool_name,
                "input": json.loads(tool_input) if tool_input else None,
                "output": json.loads(tool_output) if tool_output else None,
                "ok": bool(ok) if ok is not None else None,
                "latency_ms": latency_ms,
                "error_code": error_code,
            }
        result.append(entry)
    return result
