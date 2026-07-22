"""Система аккаунтов: CRUD, PIN, сессии."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from .db import get_db, kv_get

SESSION_COOKIE = "glubiny_session"
SESSION_DAYS = 30
PBKDF2_ITER = 200_000
PIN_MIN = 4
PIN_MAX = 8
DEFAULT_MIGRATION_PIN = "1234"


class PinError(ValueError):
    """Некорректный или отсутствующий PIN."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _expires_iso(days: int = SESSION_DAYS) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(microsecond=0).isoformat()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_pin(pin: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", str(pin or "").encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITER)
    return f"pbkdf2${PBKDF2_ITER}${dk.hex()}", salt


def validate_pin(pin: Any, *, required: bool = True) -> str:
    value = str(pin or "").strip()
    if not value:
        if required:
            raise PinError(f"PIN обязателен ({PIN_MIN}–{PIN_MAX} цифр)")
        return ""
    if not value.isdigit() or not (PIN_MIN <= len(value) <= PIN_MAX):
        raise PinError(f"PIN: {PIN_MIN}–{PIN_MAX} цифр")
    return value


def verify_pin(pin: str, pin_hash: str, pin_salt: str) -> bool:
    if not pin_hash:
        return False
    pin = str(pin or "")
    if pin_hash.startswith("pbkdf2$"):
        try:
            _, iter_s, hexhash = pin_hash.split("$", 2)
            iters = int(iter_s)
        except ValueError:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), pin_salt.encode("utf-8"), iters)
        return secrets.compare_digest(dk.hex(), hexhash)
    # Обратная совместимость со старым sha256(salt:pin).
    legacy = hashlib.sha256(f"{pin_salt}:{pin}".encode("utf-8")).hexdigest()
    return secrets.compare_digest(legacy, pin_hash)


def _row_to_public(row: Any) -> dict[str, Any]:
    out = {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "characterId": row["character_id"],
        "hasPin": bool(row["pin_hash"]),
    }
    if "party_id" in row.keys():
        out["partyId"] = row["party_id"]
    return out


def _row_to_account(row: Any) -> dict[str, Any]:
    out = {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "characterId": row["character_id"],
        "hasPin": bool(row["pin_hash"]),
    }
    if "party_id" in row.keys():
        out["partyId"] = row["party_id"]
    return out


def ensure_migrated() -> None:
    count = get_db().execute("SELECT COUNT(*) AS c FROM accounts").fetchone()["c"]
    if count:
        return
    legacy = kv_get("accounts")
    if legacy:
        import_legacy_json(legacy)


def import_legacy_json(raw: Any) -> None:
    if not isinstance(raw, list):
        return
    db = get_db()
    for item in raw:
        if not isinstance(item, dict) or not item.get("id") or not item.get("name"):
            continue
        role = "player" if item.get("role") == "player" else "master"
        pin = str(item.get("pin") or "").strip()
        if pin:
            pin_hash, pin_salt = hash_pin(pin)
        else:
            pin_hash, pin_salt = hash_pin(DEFAULT_MIGRATION_PIN)
        db.execute(
            """
            INSERT OR REPLACE INTO accounts
                (id, name, role, character_id, pin_hash, pin_salt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                str(item["id"]),
                str(item["name"]).strip() or "Без имени",
                role,
                str(item["characterId"]) if item.get("characterId") else None,
                pin_hash,
                pin_salt,
            ),
        )
    db.commit()
    ensure_default_master()


def ensure_default_master() -> None:
    row = get_db().execute("SELECT id FROM accounts WHERE role = 'master' LIMIT 1").fetchone()
    if row:
        return
    create({"name": "Мастер", "role": "master", "characterId": None, "pin": DEFAULT_MIGRATION_PIN})


def ensure_pins_migrated() -> list[str]:
    """Назначает PIN аккаунтам без хеша (однократно при старте)."""
    db = get_db()
    rows = db.execute(
        "SELECT id, name FROM accounts WHERE pin_hash = '' OR pin_hash IS NULL"
    ).fetchall()
    if not rows:
        return []
    pin_hash, pin_salt = hash_pin(DEFAULT_MIGRATION_PIN)
    updated: list[str] = []
    for row in rows:
        db.execute(
            """
            UPDATE accounts
            SET pin_hash = ?, pin_salt = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (pin_hash, pin_salt, row["id"]),
        )
        updated.append(str(row["name"]))
    db.commit()
    return updated


def list_public(party_id: str | None = None) -> list[dict[str, Any]]:
    ensure_migrated()
    ensure_default_master()
    if not party_id:
        return []
    rows = get_db().execute(
        """
        SELECT id, name, role, character_id, pin_hash, party_id
        FROM accounts WHERE party_id = ?
        ORDER BY role DESC, name COLLATE NOCASE
        """,
        (party_id,),
    ).fetchall()
    return [_row_to_public(r) for r in rows]


def get_by_id(account_id: str) -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT id, name, role, character_id, pin_hash, party_id FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    return _row_to_account(row) if row else None


def _get_row(account_id: str) -> Any | None:
    return get_db().execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()


def create(data: dict[str, Any]) -> dict[str, Any]:
    role = "player" if data.get("role") == "player" else "master"
    name = str(data.get("name") or ("Игрок" if role == "player" else "Мастер")).strip() or "Без имени"
    character_id = data.get("characterId") if role == "player" else data.get("characterId")
    character_id = str(character_id) if character_id else None
    pin = validate_pin(data.get("pin"), required=True)
    pin_hash, pin_salt = hash_pin(pin)

    account_id = str(data.get("id") or uuid.uuid4())
    get_db().execute(
        """
        INSERT INTO accounts (id, name, role, character_id, pin_hash, pin_salt)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (account_id, name, role, character_id, pin_hash, pin_salt),
    )
    get_db().commit()
    account = get_by_id(account_id)
    assert account is not None
    return account


def update(account_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    row = _get_row(account_id)
    if not row:
        return None

    name = str(data.get("name", row["name"])).strip() or row["name"]
    role = "player" if data.get("role", row["role"]) == "player" else "master"
    character_id = data["characterId"] if "characterId" in data else row["character_id"]
    if character_id is not None:
        character_id = str(character_id) if character_id else None

    pin_hash = row["pin_hash"]
    pin_salt = row["pin_salt"]
    if "pin" in data:
        pin = validate_pin(data.get("pin"), required=True)
        pin_hash, pin_salt = hash_pin(pin)

    get_db().execute(
        """
        UPDATE accounts
        SET name = ?, role = ?, character_id = ?, pin_hash = ?, pin_salt = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (name, role, character_id, pin_hash, pin_salt, account_id),
    )
    get_db().commit()
    return get_by_id(account_id)


def delete(account_id: str) -> bool:
    cur = get_db().execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    get_db().commit()
    ensure_default_master()
    return cur.rowcount > 0


def unlink_character_in_party(character_id: str, party_id: str) -> None:
    from .db import kv_get_party

    chars = kv_get_party(party_id, "characters") or []
    if not isinstance(chars, list) or not any(
        isinstance(c, dict) and str(c.get("id")) == character_id for c in chars
    ):
        raise ValueError("Character not in party")
    get_db().execute(
        """
        UPDATE accounts
        SET character_id = NULL, updated_at = datetime('now')
        WHERE character_id = ? AND party_id = ?
        """,
        (character_id, party_id),
    )
    get_db().commit()


def _row_by_login(account_id: str, name: str) -> Any | None:
    account_id = str(account_id or "").strip()
    name = str(name or "").strip()
    if account_id:
        return _get_row(account_id)
    if not name:
        return None
    rows = get_db().execute(
        "SELECT * FROM accounts WHERE name = ? COLLATE NOCASE",
        (name,),
    ).fetchall()
    if len(rows) != 1:
        return None
    return rows[0]


def login(account_id: str, pin: str, *, name: str = "") -> tuple[dict[str, Any], str] | None:
    row = _row_by_login(account_id, name)
    if not row:
        return None
    if not row["pin_hash"]:
        return None
    if not verify_pin(pin, row["pin_hash"], row["pin_salt"]):
        return None
    account_id = row["id"]
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)",
        (token, account_id, _expires_iso()),
    )
    get_db().commit()
    account = get_by_id(account_id)
    assert account is not None
    return account, token


def logout(token: str | None) -> None:
    if not token:
        return
    get_db().execute("DELETE FROM sessions WHERE token = ?", (token,))
    get_db().commit()


def session_account(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT s.token, s.expires_at, a.id, a.name, a.role, a.character_id, a.pin_hash, a.party_id
        FROM sessions s
        JOIN accounts a ON a.id = s.account_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    if not row:
        return None
    try:
        if _parse_iso(row["expires_at"]) <= datetime.now(timezone.utc):
            logout(token)
            return None
    except ValueError:
        logout(token)
        return None
    return _row_to_account(row)


def cleanup_sessions() -> None:
    get_db().execute("DELETE FROM sessions WHERE expires_at <= datetime('now')")
    get_db().commit()
