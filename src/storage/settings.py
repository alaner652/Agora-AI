"""User preferences storage — generic JSON blob keyed by uid.

Holds non-sensitive settings (LLM behaviour params, UI prefs, …).
Sensitive values (API keys) stay in user_llm_config with Fernet encryption.
"""

from __future__ import annotations

import json
import time

from ._db import connect

_DEFAULTS: dict = {
    "llm": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "system_prompt": "",
        "context_length": 20,
    }
}


def init_settings_db() -> None:
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                uid           TEXT PRIMARY KEY,
                settings_json TEXT NOT NULL DEFAULT '{}',
                updated_at    REAL NOT NULL
            )
        """)


def get_settings(uid: str) -> dict:
    """Return defaults deep-merged with the user's stored overrides."""
    with connect() as conn:
        row = conn.execute(
            "SELECT settings_json FROM user_settings WHERE uid = ?", (uid,)
        ).fetchone()
    stored = json.loads(row[0]) if row else {}
    return _deep_merge(_DEFAULTS, stored)


def patch_settings(uid: str, patch: dict) -> dict:
    """Deep-merge `patch` into stored settings, persist, return full settings."""
    merged = _deep_merge(get_settings(uid), patch)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO user_settings (uid, settings_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                settings_json = excluded.settings_json,
                updated_at    = excluded.updated_at
            """,
            (uid, json.dumps(merged, ensure_ascii=False), time.time()),
        )
    return merged


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result
