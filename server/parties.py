"""Пати: создание, код приглашения, участники, выбор героя."""

from __future__ import annotations

import random
import secrets
import uuid
from typing import Any

from . import accounts as acc
from .db import get_db, kv_get, kv_get_party, kv_set_party


def _row_to_party(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "masterAccountId": row["master_account_id"],
        "createdAt": row["created_at"],
    }


def _generate_code() -> str:
    db = get_db()
    for _ in range(64):
        code = f"{random.randint(0, 999999):06d}"
        exists = db.execute("SELECT 1 FROM parties WHERE code = ?", (code,)).fetchone()
        if not exists:
            return code
    raise RuntimeError("Could not allocate party code")


def get_party(party_id: str | None) -> dict[str, Any] | None:
    if not party_id:
        return None
    row = get_db().execute("SELECT * FROM parties WHERE id = ?", (party_id,)).fetchone()
    return _row_to_party(row) if row else None


def get_party_by_code(code: str) -> dict[str, Any] | None:
    normalized = str(code or "").strip()
    if len(normalized) != 6 or not normalized.isdigit():
        return None
    row = get_db().execute("SELECT * FROM parties WHERE code = ?", (normalized,)).fetchone()
    return _row_to_party(row) if row else None


def list_members(party_id: str) -> list[dict[str, Any]]:
    rows = get_db().execute(
        """
        SELECT id, name, role, character_id, pin_hash, party_id
        FROM accounts
        WHERE party_id = ?
        ORDER BY role DESC, name COLLATE NOCASE
        """,
        (party_id,),
    ).fetchall()
    return [acc._row_to_public(r) for r in rows]


def create_party(master_account_id: str, name: str) -> dict[str, Any]:
    db = get_db()
    row = db.execute("SELECT party_id, role FROM accounts WHERE id = ?", (master_account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    if row["role"] != "master":
        raise PermissionError("Master only")
    if row["party_id"]:
        existing = get_party(row["party_id"])
        if existing:
            return existing

    party_id = str(uuid.uuid4())
    code = _generate_code()
    title = str(name or "Партия").strip() or "Партия"
    db.execute(
        """
        INSERT INTO parties (id, code, name, master_account_id)
        VALUES (?, ?, ?, ?)
        """,
        (party_id, code, title, master_account_id),
    )
    db.execute(
        "UPDATE accounts SET party_id = ?, updated_at = datetime('now') WHERE id = ?",
        (party_id, master_account_id),
    )
    db.commit()

    # Перенос глобального состояния в пати при первом создании.
    _seed_party_state_from_global(party_id)
    party = get_party(party_id)
    assert party is not None
    return party


def join_party(account_id: str, code: str) -> dict[str, Any]:
    party = get_party_by_code(code)
    if not party:
        raise ValueError("Invalid code")
    db = get_db()
    row = db.execute("SELECT role, party_id FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    if row["role"] != "player":
        raise PermissionError("Only players join by code")
    if row["party_id"] and row["party_id"] != party["id"]:
        raise ValueError("Already in another party")

    db.execute(
        "UPDATE accounts SET party_id = ?, updated_at = datetime('now') WHERE id = ?",
        (party["id"], account_id),
    )
    db.commit()
    return party


def leave_party(account_id: str) -> None:
    db = get_db()
    row = db.execute("SELECT role, party_id FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row or not row["party_id"]:
        return
    if row["role"] == "master":
        raise PermissionError("Master cannot leave — dissolve party instead")
    db.execute(
        "UPDATE accounts SET party_id = NULL, character_id = NULL, updated_at = datetime('now') WHERE id = ?",
        (account_id,),
    )
    db.commit()


def select_hero(account_id: str, character_id: str) -> dict[str, Any]:
    db = get_db()
    row = db.execute("SELECT role, party_id, character_id FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise ValueError("Account not found")
    if row["role"] != "player":
        raise PermissionError("Only players select heroes")
    party_id = row["party_id"]
    if not party_id:
        raise ValueError("Join a party first")

    character_id = str(character_id or "").strip()
    if not character_id:
        raise ValueError("Character required")

    chars = kv_get_party(party_id, "characters") or []
    if not isinstance(chars, list) or not any(
        isinstance(c, dict) and str(c.get("id")) == character_id for c in chars
    ):
        raise ValueError("Character not in party")

    taken = db.execute(
        """
        SELECT id FROM accounts
        WHERE party_id = ? AND character_id = ? AND id != ?
        """,
        (party_id, character_id, account_id),
    ).fetchone()
    if taken:
        raise ValueError("Character already taken")

    db.execute(
        "UPDATE accounts SET character_id = ?, updated_at = datetime('now') WHERE id = ?",
        (character_id, account_id),
    )
    db.commit()
    updated = acc.get_by_id(account_id)
    assert updated is not None
    return updated


def party_context(account_id: str) -> dict[str, Any] | None:
    row = get_db().execute("SELECT party_id FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row or not row["party_id"]:
        return None
    party = get_party(row["party_id"])
    if not party:
        return None
    return {
        "party": party,
        "members": list_members(party["id"]),
    }


def _seed_party_state_from_global(party_id: str) -> None:
    """Копирует глобальные characters/enemies/map в новую пати, если там пусто."""
    from .db import kv_set

    for key in ("characters", "enemies", "map"):
        if kv_get_party(party_id, key) is not None:
            continue
        global_val = kv_get(key)
        if global_val is not None:
            kv_set_party(party_id, key, global_val)


def ensure_legacy_party_migration() -> None:
    """Один раз: если есть глобальные данные, но нет пати — создаём дефолтную."""
    db = get_db()
    if db.execute("SELECT COUNT(*) AS c FROM parties").fetchone()["c"]:
        return
    master = db.execute("SELECT id FROM accounts WHERE role = 'master' ORDER BY created_at LIMIT 1").fetchone()
    if not master:
        return
    has_global = any(kv_get(k) is not None for k in ("characters", "enemies", "map"))
    if not has_global:
        return
    create_party(master["id"], "Партия")
