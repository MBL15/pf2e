"""HTTP-сервер «Глубины»: статика, API и аккаунты на Python."""

from __future__ import annotations

import json
import mimetypes
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from . import accounts as acc
from .db import get_db, get_db_path, kv_get, kv_set, load_full_state, save_full_state

ROOT = Path(__file__).resolve().parent.parent
PORT = int(__import__("os").environ.get("PORT", "8765"))

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


def send_json(handler: BaseHTTPRequestHandler, status: int, data: Any) -> None:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
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
    handler.send_header(
        "Set-Cookie",
        f"{acc.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={acc.SESSION_DAYS * 86400}",
    )


def clear_session_cookie(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Set-Cookie", f"{acc.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")


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

    def _require_master(self) -> dict[str, Any] | None:
        account = self._current_account()
        if not account:
            send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Not logged in"})
            return None
        if account.get("role") != "master":
            send_json(self, HTTPStatus.FORBIDDEN, {"error": "Master only"})
            return None
        return account

    def _route_get(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            send_json(self, HTTPStatus.OK, {"ok": True, "db": get_db_path()})
            return

        if path == "/api/state":
            send_json(self, HTTPStatus.OK, load_full_state())
            return

        if path == "/api/accounts":
            send_json(self, HTTPStatus.OK, {"accounts": acc.list_public()})
            return

        if path == "/api/accounts/me":
            account = acc.session_account(session_token(self))
            if not account:
                send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Not logged in"})
                return
            send_json(self, HTTPStatus.OK, {"account": account})
            return

        if path == "/api/characters":
            send_json(self, HTTPStatus.OK, {"characters": kv_get("characters")})
            return

        if path == "/api/enemies":
            send_json(self, HTTPStatus.OK, {"enemies": kv_get("enemies")})
            return

        if path == "/api/map":
            send_json(self, HTTPStatus.OK, {"map": kv_get("map")})
            return

        if path.startswith("/api/"):
            send_json(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        self._serve_static()

    def _route_put(self) -> None:
        path = urlparse(self.path).path
        body = read_json(self)

        if path == "/api/state":
            account = self._require_session()
            if not account:
                return
            # Управление аккаунтами — только мастер.
            if isinstance(body, dict) and "accounts" in body and account.get("role") != "master":
                send_json(self, HTTPStatus.FORBIDDEN, {"error": "Master only"})
                return
            save_full_state(body)
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/accounts":
            if not self._require_master():
                return
            acc.import_legacy_json(body.get("accounts", body))
            send_json(self, HTTPStatus.OK, {"ok": True, "accounts": acc.list_public()})
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
            if not self._require_session():
                return
            kv_set("characters", body.get("characters", body))
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/enemies":
            if not self._require_session():
                return
            kv_set("enemies", body.get("enemies", body))
            send_json(self, HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/map":
            if not self._require_session():
                return
            kv_set("map", body.get("map", body))
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

        if path == "/api/accounts/login":
            account_id = str(body.get("accountId") or "")
            pin = str(body.get("pin") or "")
            result = acc.login(account_id, pin)
            if not result:
                send_json(self, HTTPStatus.UNAUTHORIZED, {"error": "Invalid credentials"})
                return
            account, token = result
            body_bytes = json.dumps({"account": account}, ensure_ascii=False).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
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
            clear_session_cookie(self)
            self.send_header("Content-Length", str(len(body_bytes)))
            self.end_headers()
            self.wfile.write(body_bytes)
            return

        if path == "/api/accounts/unlink-character":
            if not self._require_session():
                return
            character_id = str(body.get("characterId") or "")
            if character_id:
                acc.unlink_character(character_id)
            send_json(self, HTTPStatus.OK, {"ok": True})
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
        if ext in (".js", ".mjs", ".css", ".html"):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    get_db()
    acc.cleanup_sessions()
    acc.ensure_migrated()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Глубины: http://127.0.0.1:{PORT}")
    print(f"SQLite:  {get_db_path()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановка…")
        server.server_close()


if __name__ == "__main__":
    main()
