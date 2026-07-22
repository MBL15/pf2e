"""HTTP-сервер «Глубины»: статика, API и аккаунты на Python."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from . import accounts as acc
from . import parties as party
from .db import get_db, get_db_path, kv_get_party, kv_set_party, load_full_state, save_full_state
from .ratelimit import RateLimited, check_rate_limit, client_ip_from_address

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "8765"))
USE_HTTPS = os.environ.get("HTTPS", "").lower() in ("1", "true", "yes")

MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
}

# Только веб-ассеты можно отдавать статикой. Всё остальное (БД, исходники,
# скрипты, dot-файлы) недоступно снаружи.
STATIC_EXT_ALLOW = {
    ".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg",
    ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".map", ".txt",
}
STATIC_DIR_DENY = {"server", "scripts"}

# Максимальный размер тела запроса, чтобы избежать исчерпания памяти.
MAX_BODY_BYTES = 25 * 1024 * 1024


class BadRequest(Exception):
    """Некорректный ввод клиента → 400."""


def add_security_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("X-Frame-Options", "DENY")
    handler.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
    handler.send_header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'",
    )


def send_json(handler: BaseHTTPRequestHandler, status: int, data: Any) -> None:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    add_security_headers(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> Any:
    try:
        length = int(handler.headers.get("Content-Length", "0") or 0)
    except ValueError:
        raise BadRequest("Invalid Content-Length")
    if length < 0 or length > MAX_BODY_BYTES:
        raise BadRequest("Payload too large")
    raw = handler.rfile.read(length) if length else b""
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise BadRequest("Invalid JSON body")


def session_token(handler: BaseHTTPRequestHandler) -> str | None:
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith(f"{acc.SESSION_COOKIE}="):
            return part.split("=", 1)[1].strip() or None
    return None


def set_session_cookie(handler: BaseHTTPRequestHandler, token: str) -> None:
    secure = "; Secure" if USE_HTTPS else ""
    handler.send_header(
        "Set-Cookie",
        f"{acc.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={acc.SESSION_DAYS * 86400}{secure}",
    )


def clear_session_cookie(handler: BaseHTTPRequestHandler) -> None:
    secure = "; Secure" if USE_HTTPS else ""
    handler.send_header(
        "Set-Cookie",
        f"{acc.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}",
    )


def safe_static_path(url_path: str) -> Path | None:
    decoded = unquote(url_path.split("?", 1)[0])
    rel = decoded if decoded != "/" else "/index.html"
    root = ROOT.resolve()
    full = (root / rel.lstrip("/")).resolve()

    try:
        parts = full.relative_to(root).parts
    except ValueError:
        # Выход за пределы корня (path traversal / prefix bypass).
        return None
    if not parts:
        return None
    if any(p.startswith(".") for p in parts):
        return None
    if parts[0] in STATIC_DIR_DENY:
        return None
    if full.suffix.lower() not in STATIC_EXT_ALLOW:
        return None
    return full


class Handler(BaseHTTPRequestHandler):
    server_version = "GlubinyPython/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _guard(self, route) -> None:
        try:
            route()
        except BadRequest as err:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
        except acc.PinError as err:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
        except RateLimited as err:
            send_json(
                self,
                HTTPStatus.TOO_MANY_REQUESTS,
                {"error": "Too many requests", "retryAfterSec": err.retry_after_sec},
            )
        except PermissionError as err:
            send_json(self, HTTPStatus.FORBIDDEN, {"error": str(err)})
        except ValueError as err:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": str(err)})
        except Exception:
            import traceback

            sys.stderr.write(traceback.format_exc())
            try:
                send_json(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Internal server error"})
            except Exception:
                pass

    def do_GET(self) -> None:
        self._guard(self._route_get)

    def do_PUT(self) -> None:
        self._guard(self._route_put)

    def do_POST(self) -> None:
        self._guard(self._route_post)

    def do_DELETE(self) -> None:
        self._guard(self._route_delete)

    def _current_account(self) -> dict[str, Any] | None:
        return acc.session_account(session_token(self))

    def _require_session(self) -> dict[str, Any] | None:
        account = self._current_account()
        if not account:
            send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Not logged in"})
            return None
        return account

    def _client_ip(self) -> str:
        return client_ip_from_address(self.client_address)

    def _require_master(self) -> dict[str, Any] | None:
        account = self._current_account()
        if not account:
            send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Not logged in"})
            return None
        if account.get("role") != "master":
            send_json(self, HTTPStatus.FORBIDDEN, {"error": "Master only"})
            return None
        return account

    def _party_id(self, account: dict[str, Any] | None) -> str | None:
        if not account:
            return None
        pid = account.get("partyId")
        return str(pid) if pid else None

    def _require_party(self, account: dict[str, Any]) -> str | None:
        pid = self._party_id(account)
        if not pid:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": "Not in a party"})
            return None
        return pid

    def _route_get(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            send_json(self, HTTPStatus.OK, {"ok": True, "features": ["parties"]})
            return

        if path == "/api/state":
            account = self._current_account()
            if not account:
                send_json(
                    self,
                    HTTPStatus.OK,
                    {"accounts": None, "characters": None, "enemies": None, "map": None},
                )
                return
            party_id = self._party_id(account)
            if not party_id:
                send_json(
                    self,
                    HTTPStatus.OK,
                    {
                        "accounts": [],
                        "characters": None,
                        "enemies": None,
                        "map": None,
                    },
                )
                return
            send_json(self, HTTPStatus.OK, load_full_state(party_id))
            return

        if path == "/api/accounts":
            account = self._require_session()
            if not account:
                return
            party_id = self._party_id(account)
            send_json(self, HTTPStatus.OK, {"accounts": acc.list_public(party_id)})
            return

        if path == "/api/accounts/me":
            account = acc.session_account(session_token(self))
            if not account:
                send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Not logged in"})
                return
            send_json(self, HTTPStatus.OK, {"account": account})
            return

        if path == "/api/parties/me":
            account = self._require_session()
            if not account:
                return
            ctx = party.party_context(account["id"])
            if not ctx:
                send_json(self, HTTPStatus.OK, {"party": None, "members": []})
                return
            send_json(self, HTTPStatus.OK, ctx)
            return

        if path == "/api/characters":
            account = self._current_account()
            if not account or not self._party_id(account):
                send_json(self, HTTPStatus.OK, {"characters": None})
                return
            party_id = self._party_id(account)
            send_json(self, HTTPStatus.OK, {"characters": kv_get_party(party_id, "characters")})
            return

        if path == "/api/enemies":
            account = self._current_account()
            if not account or not self._party_id(account):
                send_json(self, HTTPStatus.OK, {"enemies": None})
                return
            party_id = self._party_id(account)
            send_json(self, HTTPStatus.OK, {"enemies": kv_get_party(party_id, "enemies")})
            return

        if path == "/api/map":
            account = self._current_account()
            if not account or not self._party_id(account):
                send_json(self, HTTPStatus.OK, {"map": None})
                return
            party_id = self._party_id(account)
            send_json(self, HTTPStatus.OK, {"map": kv_get_party(party_id, "map")})
            return

        if path.startswith("/api/"):
            send_json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        self._serve_static()

    def _route_put(self) -> None:
        path = urlparse(self.path).path
        body = read_json(self)

        if path == "/api/state":
            account = self._require_master()
            if not account:
                return
            party_id = self._require_party(account)
            if party_id is None:
                return
            save_full_state(body, party_id)
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/accounts":
            if not self._require_master():
                return
            acc.import_legacy_json(body.get("accounts", body))
            master = self._current_account()
            party_id = self._party_id(master)
            send_json(self, HTTPStatus.OK, {"ok": True, "accounts": acc.list_public(party_id)})
            return

        if path.startswith("/api/accounts/"):
            if not self._require_master():
                return
            account_id = path.rsplit("/", 1)[-1]
            updated = acc.update(account_id, body)
            if not updated:
                send_json(self, HTTPStatus.NOT_FOUND, {"error": "Account not found"})
                return
            send_json(self, HTTPStatus.OK, {"account": updated})
            return

        if path == "/api/characters":
            if not self._require_master():
                return
            account = self._current_account()
            assert account is not None
            party_id = self._require_party(account)
            if party_id is None:
                return
            kv_set_party(party_id, "characters", body.get("characters", body))
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/enemies":
            if not self._require_master():
                return
            account = self._current_account()
            assert account is not None
            party_id = self._require_party(account)
            if party_id is None:
                return
            kv_set_party(party_id, "enemies", body.get("enemies", body))
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/map":
            if not self._require_master():
                return
            account = self._current_account()
            assert account is not None
            party_id = self._require_party(account)
            if party_id is None:
                return
            kv_set_party(party_id, "map", body.get("map", body))
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        send_json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def _route_post(self) -> None:
        path = urlparse(self.path).path
        body = read_json(self)

        if path == "/api/accounts":
            if not self._require_master():
                return
            account = acc.create(body)
            send_json(self, HTTPStatus.CREATED, {"account": account})
            return

        if path == "/api/accounts/register":
            check_rate_limit(self._client_ip(), "register", max_attempts=5, window_sec=3600)
            role = "player" if body.get("role") == "player" else "player"
            try:
                pin = acc.validate_pin(body.get("pin"), required=True)
            except acc.PinError as err:
                raise BadRequest(str(err)) from err
            payload = {
                "name": body.get("name"),
                "role": role,
                "characterId": body.get("characterId"),
                "pin": pin,
            }
            account = acc.create(payload)
            send_json(self, HTTPStatus.CREATED, {"account": account})
            return

        if path == "/api/accounts/login":
            check_rate_limit(self._client_ip(), "login", max_attempts=8, window_sec=900)
            account_id = str(body.get("accountId") or "")
            name = str(body.get("name") or "").strip()
            pin = str(body.get("pin") or "")
            result = acc.login(account_id, pin, name=name)
            if not result:
                send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Invalid credentials"})
                return
            account, token = result
            body_bytes = json.dumps({"account": account}, ensure_ascii=False).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            add_security_headers(self)
            set_session_cookie(self, token)
            self.send_header("Content-Length", str(len(body_bytes)))
            self.end_headers()
            self.wfile.write(body_bytes)
            return

        if path == "/api/accounts/logout":
            acc.logout(session_token(self))
            body_bytes = b'{"ok":true}'
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            add_security_headers(self)
            clear_session_cookie(self)
            self.send_header("Content-Length", str(len(body_bytes)))
            self.end_headers()
            self.wfile.write(body_bytes)
            return

        if path == "/api/accounts/unlink-character":
            master = self._require_master()
            if not master:
                return
            party_id = self._require_party(master)
            if party_id is None:
                return
            character_id = str(body.get("characterId") or "")
            if character_id:
                acc.unlink_character_in_party(character_id, party_id)
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/parties":
            master = self._require_master()
            if not master:
                return
            created = party.create_party(master["id"], str(body.get("name") or "Партия"))
            ctx = party.party_context(master["id"])
            send_json(self, HTTPStatus.CREATED, ctx or {"party": created, "members": []})
            return

        if path == "/api/parties/join":
            check_rate_limit(self._client_ip(), "party_join", max_attempts=12, window_sec=900)
            account = self._require_session()
            if not account:
                return
            joined = party.join_party(account["id"], str(body.get("code") or ""))
            ctx = party.party_context(account["id"])
            send_json(self, HTTPStatus.OK, ctx or {"party": joined, "members": []})
            return

        if path == "/api/parties/leave":
            account = self._require_session()
            if not account:
                return
            party.leave_party(account["id"])
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/parties/select-hero":
            account = self._require_session()
            if not account:
                return
            updated = party.select_hero(account["id"], str(body.get("characterId") or ""))
            send_json(self, HTTPStatus.OK, {"account": updated})
            return

        send_json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def _route_delete(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/accounts/"):
            if not self._require_master():
                return
            account_id = path.rsplit("/", 1)[-1]
            if acc.delete(account_id):
                send_json(self, HTTPStatus.OK, {"ok": True})
            else:
                send_json(self, HTTPStatus.NOT_FOUND, {"error": "Account not found"})
            return
        send_json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def _serve_static(self) -> None:
        file_path = safe_static_path(urlparse(self.path).path)
        if not file_path or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        ext = file_path.suffix.lower()
        content_type = MIME_OVERRIDES.get(ext) or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        add_security_headers(self)
        if ext in (".js", ".mjs", ".css", ".html"):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    get_db()
    acc.cleanup_sessions()
    acc.ensure_migrated()
    migrated = acc.ensure_pins_migrated()
    party.ensure_legacy_party_migration()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Глубины: http://127.0.0.1:{PORT}")
    print(f"SQLite:  {get_db_path()}")
    if migrated:
        print(
            f"Безопасность: аккаунтам без PIN назначен PIN {acc.DEFAULT_MIGRATION_PIN}: "
            + ", ".join(migrated)
        )
        print("  Смените PIN после входа (админ-панель мастера).")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановка…")
        server.server_close()


if __name__ == "__main__":
    main()
