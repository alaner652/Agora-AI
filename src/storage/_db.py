"""Shared SQLite connection factory.

All storage modules open connections through `connect()` so that the same
concurrency PRAGMAs are applied everywhere:

- journal_mode=WAL   readers don't block the single writer (and vice versa);
                     persisted on the DB file, set idempotently per connection.
- busy_timeout=5000  wait up to 5s for a lock instead of raising
                     "database is locked" immediately under concurrency.
- synchronous=NORMAL safe with WAL, far fewer fsyncs than the FULL default.

Use as a drop-in for `sqlite3.connect(_DB)`:

    from ._db import connect
    with connect() as conn:
        conn.execute(...)
"""

from __future__ import annotations

import pathlib
import sqlite3

_DB = pathlib.Path("data/history.db")


def connect() -> sqlite3.Connection:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB, timeout=5.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn
