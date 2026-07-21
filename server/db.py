"""SQLite: kv-хранилище и таблица аккаунтов."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "glubiny.sqlite"

_conn: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode = WAL")
    _conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('master', 'player')),
            character_id TEXT,
            pin_hash TEXT NOT NULL DEFAULT '',
            pin_salt TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY NOT NULL,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
        """
    )
    _conn.commit()
    return _conn


def get_db_path() -> str:
    return str(DB_PATH)


def kv_get(key: str) -> Any | None:
    row = get_db().execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return None


def kv_set(key: str, value: Any) -> None:
    get_db().execute(
        """
        INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (key, json.dumps(value, ensure_ascii=False)),
    )
    get_db().commit()


def load_full_state() -> dict[str, Any | None]:
    from . import accounts as acc

    acc.ensure_migrated()
    return {
        "accounts": acc.list_public(),
        "characters": kv_get("characters"),
        "enemies": kv_get("enemies"),
        "map": kv_get("map"),
    }


def save_full_state(partial: dict[str, Any]) -> None:
    if "characters" in partial:
        kv_set("characters", partial["characters"])
    if "enemies" in partial:
        kv_set("enemies", partial["enemies"])
    if "map" in partial:
        kv_set("map", partial["map"])
    if "accounts" in partial:
        from . import accounts as acc

        acc.import_legacy_json(partial["accounts"])
