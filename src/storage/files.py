"""SQLite-backed uploaded-file registry.

Maps opaque file_id → actual storage path.
Prevents path traversal and IDOR by verifying uid on every read.
"""

from __future__ import annotations

import mimetypes
import secrets
import time

from ._db import connect


def init_files_db() -> None:
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_files (
                file_id      TEXT PRIMARY KEY,
                uid          TEXT NOT NULL,
                filename     TEXT NOT NULL,
                mime_type    TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                size         INTEGER,
                created_at   REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_uid ON uploaded_files(uid)")


def insert_file(uid: str, filename: str, storage_path: str, size: int) -> str:
    """Store file metadata and return the new opaque file_id."""
    file_id = secrets.token_urlsafe(16)
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    with connect() as conn:
        conn.execute(
            "INSERT INTO uploaded_files "
            "(file_id, uid, filename, mime_type, storage_path, size, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_id, uid, filename, mime_type, storage_path, size, time.time()),
        )
    return file_id


def get_file(file_id: str, uid: str) -> dict | None:
    """Return file metadata if file_id exists and belongs to uid, else None."""
    with connect() as conn:
        row = conn.execute(
            "SELECT filename, mime_type, storage_path, size "
            "FROM uploaded_files WHERE file_id = ? AND uid = ?",
            (file_id, uid),
        ).fetchone()
    if row is None:
        return None
    return {"filename": row[0], "mime_type": row[1], "storage_path": row[2], "size": row[3]}
