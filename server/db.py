"""SQLite: kv-хранилище, аккаунты и пати."""

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

        CREATE TABLE IF NOT EXISTS parties (
            id TEXT PRIMARY KEY NOT NULL,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            master_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_parties_code ON parties(code);
        """
    )
    _migrate_accounts_party_id(_conn)
    _conn.commit()
    return _conn


def _migrate_accounts_party_id(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
    if "party_id" not in cols:
        conn.execute("ALTER TABLE accounts ADD COLUMN party_id TEXT REFERENCES parties(id) ON DELETE SET NULL")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_party ON accounts(party_id)")


def get_db_path() -> str:
    return str(DB_PATH)


def _party_kv_key(party_id: str, key: str) -> str:
    return f"party:{party_id}:{key}"


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


def kv_get_party(party_id: str | None, key: str) -> Any | None:
    if not party_id:
        return kv_get(key)
    row = get_db().execute(
        "SELECT value FROM kv WHERE key = ?",
        (_party_kv_key(party_id, key),),
    ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return None


def kv_set_party(party_id: str | None, key: str, value: Any) -> None:
    if not party_id:
        kv_set(key, value)
        return
    full_key = _party_kv_key(party_id, key)
    get_db().execute(
        """
        INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (full_key, json.dumps(value, ensure_ascii=False)),
    )
    get_db().commit()


def load_full_state(party_id: str | None = None) -> dict[str, Any | None]:
    from . import accounts as acc

    acc.ensure_migrated()
    members = acc.list_public(party_id) if party_id else acc.list_public()
    return {
        "accounts": members,
        "characters": kv_get_party(party_id, "characters"),
        "enemies": kv_get_party(party_id, "enemies"),
        "map": kv_get_party(party_id, "map"),
    }


def save_full_state(partial: dict[str, Any], party_id: str | None = None) -> None:
    if "characters" in partial:
        kv_set_party(party_id, "characters", partial["characters"])
    if "enemies" in partial:
        kv_set_party(party_id, "enemies", partial["enemies"])
    if "map" in partial:
        kv_set_party(party_id, "map", partial["map"])
    if "accounts" in partial:
        from . import accounts as acc

        acc.import_legacy_json(partial["accounts"])
