"""Per-user LLM config storage with Fernet-encrypted API keys."""

from __future__ import annotations

import os
import pathlib
import sqlite3
import time
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

_DB = pathlib.Path("data/history.db")

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.getenv("SETTINGS_ENCRYPT_KEY", "")
        if not key:
            raise RuntimeError("SETTINGS_ENCRYPT_KEY 未設定")
        _fernet = Fernet(key.encode())
    return _fernet


def init_user_settings_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_llm_config (
                uid              TEXT PRIMARY KEY,
                base_url         TEXT NOT NULL,
                api_key_enc      TEXT NOT NULL,
                model            TEXT NOT NULL,
                updated_at       REAL NOT NULL
            )
        """)


@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str


def get_llm_config(uid: str) -> LLMConfig | None:
    with sqlite3.connect(_DB) as conn:
        row = conn.execute(
            "SELECT base_url, api_key_enc, model FROM user_llm_config WHERE uid = ?",
            (uid,),
        ).fetchone()
    if row is None:
        return None
    base_url, api_key_enc, model = row
    try:
        api_key = _get_fernet().decrypt(api_key_enc.encode()).decode()
    except InvalidToken:
        return None
    return LLMConfig(base_url=base_url, api_key=api_key, model=model)


def set_llm_config(uid: str, base_url: str, api_key: str, model: str) -> None:
    api_key_enc = _get_fernet().encrypt(api_key.encode()).decode()
    with sqlite3.connect(_DB) as conn:
        conn.execute(
            """
            INSERT INTO user_llm_config (uid, base_url, api_key_enc, model, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                base_url    = excluded.base_url,
                api_key_enc = excluded.api_key_enc,
                model       = excluded.model,
                updated_at  = excluded.updated_at
            """,
            (uid, base_url, api_key_enc, model, time.time()),
        )


def delete_llm_config(uid: str) -> None:
    with sqlite3.connect(_DB) as conn:
        conn.execute("DELETE FROM user_llm_config WHERE uid = ?", (uid,))
