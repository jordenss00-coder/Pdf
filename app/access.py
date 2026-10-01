"""Signed browser sessions and request limits, without logging document contents."""
import hashlib
import hmac
import secrets
import time
from contextvars import ContextVar
from urllib.parse import urlsplit

from starlette.responses import JSONResponse

from .settings import settings

owner = ContextVar("pdf_owner", default="local")
COOKIE = "pdf_session"
SESSION_SECONDS = 12 * 3600


def issue_session():
    value = f"{secrets.token_hex(24)}.{int(time.time()) + SESSION_SECONDS}"
    sig = hmac.new(settings.secret.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f"{value}.{sig}"


def session_owner(token):
    try:
        ident, expires, sig = token.split(".")
        value = f"{ident}.{expires}"
        expected = hmac.new(settings.secret.encode(), value.encode(), hashlib.sha256).hexdigest()
        if len(ident) == 48 and int(expires) > time.time() and hmac.compare_digest(sig, expected):
            return ident
    except (ValueError, AttributeError):
        pass
    return None


class RequestGuard:
    """ASGI middleware enforces body size before multipart parsing/spooling."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        host = headers.get(b"host", b"").decode("latin1")
        try:
            hostname = urlsplit("//" + host).hostname
        except ValueError:
            hostname = None
        allowed = {h.strip("[]").lower() for h in settings.hosts}
        async def reject(code, message):
            await JSONResponse({"error": message}, status_code=code)(scope, receive, send)
        if not hostname or hostname.lower() not in allowed:
            return await reject(403, "Bu sunucu adına izin verilmiyor.")
        if scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            origin = headers.get(b"origin", b"").decode("latin1")
            if (origin and origin.lower() != f"{scope['scheme']}://{host}".lower()) or headers.get(b"sec-fetch-site") == b"cross-site":
                return await reject(403, "İstek uygulamanın kendi sayfasından gönderilmeli.")
        path = scope["path"]
        current_owner = "local"
        if settings.hosted and path.startswith("/api/") and path not in ("/api/runtime", "/api/login", "/api/health"):
            from http.cookies import SimpleCookie
            cookies = SimpleCookie()
            try:
                cookies.load(headers.get(b"cookie", b"").decode("latin1"))
                token = cookies[COOKIE].value if COOKIE in cookies else ""
                current_owner = session_owner(token)
            except Exception:
                current_owner = None
            if not current_owner:
                return await reject(401, "Oturum açman gerekiyor.")
        limit = (settings.max_upload_mb * 1024 * 1024 + 1024 * 1024) if path == "/api/upload" else 8 * 1024 * 1024
        try:
            if int(headers.get(b"content-length", b"0")) > limit:
                return await reject(413, "İstek boyutu sınırı aşıldı.")
        except ValueError:
            return await reject(400, "Geçersiz istek boyutu.")
        # Buffer at most the configured bound; downstream parsers never see excess bytes.
        chunks, size = [], 0
        if scope["method"] not in ("GET", "HEAD"):
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > limit:
                    return await reject(413, "İstek boyutu sınırı aşıldı.")
                chunks.append(chunk)
                if not message.get("more_body"):
                    break
        delivered = False
        async def bounded_receive():
            nonlocal delivered
            if not delivered and chunks:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        async def secure_send(message):
            if message["type"] == "http.response.start":
                extra = [(b"x-content-type-options", b"nosniff"), (b"x-frame-options", b"DENY"),
                         (b"referrer-policy", b"same-origin")]
                if path.startswith("/api/"):
                    message["headers"] = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                    extra.append((b"cache-control", b"no-store"))
                message.setdefault("headers", []).extend(extra)
            await send(message)
        token = owner.set(current_owner)
        try:
            await self.app(scope, bounded_receive, secure_send)
        finally:
            owner.reset(token)
