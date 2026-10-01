"""PDF Atölye – yerel web sunucusu (FastAPI)."""
from __future__ import annotations

import asyncio
import io
import os
import shutil
import secrets
import time
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

import pymupdf
from fastapi import Body, FastAPI, File, HTTPException, UploadFile, Request
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import backends, store, updates
from .fonts import available_families
from .tools.ai import ai_configured, load_config, save_config
from .tools.edit import redaction_regexes
from .tools.forms import detect_fields, list_fields
from .tools.optimize import TESSDATA
from .tools.textedit import find_rects, public_lines
from .util import UserError, zip_files
from . import jobs
from .settings import settings
from .access import RequestGuard, COOKIE, SESSION_SECONDS, issue_session, owner
from .version import VERSION

STATIC = store.ROOT / "static"
_slots = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _slots
    settings.validate()
    store.init()
    if updates.supported():
        await asyncio.to_thread(updates.cleanup_stale)
    _slots = asyncio.Semaphore(settings.max_jobs)
    async def sweep():
        while True:
            await asyncio.sleep(60)
            await asyncio.to_thread(store.cleanup)
    cleaner = asyncio.create_task(sweep())
    try:
        yield
    finally:
        cleaner.cancel()
        try:
            await cleaner
        except asyncio.CancelledError:
            pass


app = FastAPI(title="PDF Atölye", version=VERSION, lifespan=lifespan,
              docs_url=None if settings.hosted else "/docs", redoc_url=None,
              openapi_url=None if settings.hosted else "/openapi.json")
app.add_middleware(RequestGuard)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


@app.get("/desktop/{token}")
def desktop_session(token: str):
    if not settings.desktop_token or not secrets.compare_digest(token, settings.desktop_token):
        raise HTTPException(404)
    response = RedirectResponse("/", status_code=303, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    response.set_cookie("pdf_desktop", token, httponly=True, samesite="strict", path="/")
    return response


@app.get("/api/runtime")
def runtime():
    return {"mode": settings.mode, "version": VERSION, "desktop": bool(settings.desktop_token), "login_required": settings.hosted,
            "updates": updates.supported(),
            "max_upload_mb": settings.max_upload_mb, "max_files": settings.max_files,
            "retention_hours": settings.retention_hours, "max_pages": settings.max_pages}


class LoginBody(BaseModel):
    password: str = Field(max_length=1024)


_login_attempts = []


@app.post("/api/login")
async def login(body: LoginBody):
    if not settings.hosted:
        return {"ok": True}
    now = time.monotonic()
    _login_attempts[:] = [t for t in _login_attempts if now - t < 60]
    if len(_login_attempts) >= 10:
        raise HTTPException(429, "Çok fazla giriş denemesi. Bir dakika sonra tekrar dene.")
    _login_attempts.append(now)
    if not secrets.compare_digest(body.password.encode(), settings.access_password.encode()):
        raise HTTPException(401, "Giriş parolası yanlış.")
    response = JSONResponse({"ok": True})
    response.set_cookie(COOKIE, issue_session(), httponly=True, secure=settings.secure_cookie,
                        samesite="strict", max_age=SESSION_SECONDS, path="/")
    return response


@app.post("/api/logout")
def logout():
    clear_files()
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE, path="/", secure=settings.secure_cookie, httponly=True, samesite="strict")
    return response


@app.exception_handler(UserError)
async def user_error(_req, exc: UserError):
    return JSONResponse({"error": str(exc)}, status_code=400)


def _entry(fid: str) -> store.Entry:
    try:
        return store.get(fid)
    except KeyError:
        raise HTTPException(404, "Dosya bulunamadı. Süresi dolmuş olabilir; yeniden yükle.")


def _open(entry: store.Entry) -> pymupdf.Document:
    if entry.kind != "pdf":
        raise UserError("Bu işlem yalnızca PDF dosyaları için.")
    doc = pymupdf.open(entry.path)
    if doc.needs_pass and not (entry.password and doc.authenticate(entry.password)):
        doc.close()
        raise UserError("Bu PDF parola korumalı. Önce parolayı gir.")
    return doc


# ---------------- genel ----------------

@app.get("/api/capabilities")
def capabilities():
    caps = backends.capabilities()
    caps["ocr_languages"] = sorted(p.stem for p in TESSDATA.glob("*.traineddata"))
    caps["ai"] = ai_configured()
    caps["fonts"] = available_families()
    caps["mode"] = settings.mode
    caps["ai"] = caps["ai"] and not settings.hosted
    caps["browser"] = caps["browser"] and not settings.hosted
    return caps


@app.get("/api/settings")
def get_settings():
    if settings.hosted:
        return {"has_key": False, "key_hint": "", "read_only": True}
    cfg = load_config()
    key = cfg.get("anthropic_api_key") or ""
    return {"has_key": bool(key or os.environ.get("ANTHROPIC_API_KEY")),
            "key_hint": ("…" + key[-4:]) if key else ""}


@app.post("/api/settings")
def set_settings(body: dict = Body(...)):
    if settings.hosted:
        raise HTTPException(403, "Sunucu ayarları yalnızca sunucu yöneticisi tarafından değiştirilir.")
    cfg = load_config()
    if "anthropic_api_key" in body:
        key = (body.get("anthropic_api_key") or "").strip()
        if key:
            cfg["anthropic_api_key"] = key
        else:
            cfg.pop("anthropic_api_key", None)
    save_config(cfg)
    return get_settings()


# ---------------- güncellemeler (yalnızca Windows masaüstü) ----------------

def _updates_only():
    if not updates.supported():
        raise HTTPException(404, "Güncellemeler yalnızca Windows masaüstü uygulamasında kullanılabilir.")


@app.get("/api/update")
def update_status(auto: bool = False):
    return updates.check(auto=auto)


@app.post("/api/update/check")
def update_check():
    _updates_only()
    return updates.check(force=True)


@app.post("/api/update/download")
def update_download():
    _updates_only()
    try:
        return updates.start_download()
    except updates.UpdateError as exc:
        raise UserError(str(exc))


@app.post("/api/update/auto")
def update_auto(body: dict = Body(...)):
    _updates_only()
    updates.set_auto(bool(body.get("enabled")))
    return updates.status()


# ---------------- dosyalar ----------------

@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    if len(files) > settings.max_files:
        raise HTTPException(413, f"En fazla {settings.max_files} dosya yüklenebilir.")
    out = []
    total = 0
    try:
        for f in files:
            data = await f.read(settings.max_upload_mb * 1024 * 1024 + 1)
            total += len(data)
            if total > settings.max_upload_mb * 1024 * 1024:
                raise HTTPException(413, f"Toplam yükleme sınırı {settings.max_upload_mb} MB.")
            if not data:
                continue
            if store.kind_of(f.filename or "") == "other":
                raise UserError("Bu dosya türü desteklenmiyor.")
            entry = await asyncio.to_thread(store.add_bytes, data, f.filename or "dosya")
            out.append(entry.info())
    except Exception:
        for info in out:
            store.delete(info["id"])
        raise
    finally:
        for f in files:
            await f.close()
    if not out:
        raise UserError("Yüklenecek dosya bulunamadı.")
    return out


@app.delete("/api/files")
def clear_files():
    ids = store.owned_ids()
    with store._lock:
        if any(fid in store._active for fid in ids):
            raise UserError("Önce devam eden işlemin tamamlanmasını bekle.")
        for fid in ids:
            # Expired entries are cleaned by the periodic sweep.
            try:
                store.delete(fid)
            except KeyError:
                pass
    _render_cache.clear()
    return {"deleted": len(ids)}


@app.delete("/api/files/{fid}")
def delete_file(fid: str):
    _entry(fid)
    store.delete(fid)
    _render_cache.clear()
    return {"deleted": True}


@app.get("/api/files/{fid}")
def file_info(fid: str):
    return _entry(fid).info()


@app.post("/api/files/{fid}/password")
def file_password(fid: str, body: dict = Body(...)):
    entry = _entry(fid)
    pw = body.get("password", "")
    if entry.kind != "pdf":
        raise UserError("Parola yalnızca PDF dosyaları için girilebilir.")
    with store.MU:
        doc = pymupdf.open(entry.path)
        ok = not doc.needs_pass or doc.authenticate(pw)
        doc.close()
    if not ok:
        raise UserError("Parola yanlış.")
    entry.password = pw
    store.refresh(entry)
    return entry.info()


_render_cache: OrderedDict = OrderedDict()
_RENDER_MAX = 400
_RENDER_BYTES = 32 * 1024 * 1024
_render_lock = threading.RLock()


@app.get("/api/files/{fid}/page/{n}")
def render_page(fid: str, n: int, w: int = 300):
    entry = _entry(fid)
    w = max(40, min(int(w), 3000))
    key = (fid, n, w, entry.size)
    with _render_lock:
        if key in _render_cache:
            _render_cache.move_to_end(key)
            return Response(_render_cache[key], media_type="image/jpeg")
    if entry.kind == "image":
        from PIL import Image, ImageOps
        with Image.open(entry.path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((w, w * 4))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=85)
            data = buf.getvalue()
    elif entry.kind == "pdf":
        with store.MU:
            doc = _open(entry)
            try:
                if not 0 <= n < doc.page_count:
                    raise HTTPException(404, "Sayfa yok")
                page = doc[n]
                zoom = min(w / page.rect.width, 6000 / max(page.rect.height, 1))
                pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, annots=True)
                data = pix.tobytes("jpg", jpg_quality=88)
            finally:
                doc.close()
    else:
        raise HTTPException(404, "Önizleme yok")
    with _render_lock:
        _render_cache[key] = data
        while len(_render_cache) > _RENDER_MAX or sum(map(len, _render_cache.values())) > _RENDER_BYTES:
            _render_cache.popitem(last=False)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "max-age=3600"})


@app.get("/api/files/{fid}/text/{n}")
def page_text(fid: str, n: int):
    entry = _entry(fid)
    with store.MU:
        doc = _open(entry)
        try:
            if not 0 <= n < doc.page_count:
                raise HTTPException(404, "Sayfa yok")
            return {"lines": public_lines(doc[n])}
        finally:
            doc.close()


@app.get("/api/files/{fid}/fields")
def fields(fid: str):
    entry = _entry(fid)
    with store.MU:
        doc = _open(entry)
        try:
            return {"fields": list_fields(doc)}
        finally:
            doc.close()


@app.post("/api/files/{fid}/detect-fields")
def detect(fid: str, body: dict = Body(default={})):
    entry = _entry(fid)
    pages = body.get("pages")
    with store.MU:
        doc = _open(entry)
        try:
            return {"fields": detect_fields(doc, set(pages) if pages else None)}
        finally:
            doc.close()


@app.post("/api/files/{fid}/search")
def search(fid: str, body: dict = Body(...)):
    entry = _entry(fid)
    regexes = redaction_regexes(body)
    hits = []
    if not regexes:
        return {"hits": hits}
    with store.MU:
        doc = _open(entry)
        try:
            for page in doc:
                for rx in regexes:
                    for h in find_rects(page, rx):
                        h["page"] = page.number
                        hits.append(h)
        finally:
            doc.close()
    return {"hits": hits[:5000]}


@app.get("/api/files/{fid}/download")
def download(fid: str, inline: bool = False):
    entry = _entry(fid)
    return FileResponse(entry.path, filename=entry.name,
                        content_disposition_type="inline" if inline and entry.kind == "pdf" else "attachment",
                        headers={"Content-Security-Policy": "sandbox"})


@app.get("/api/files/{fid}/meta")
def meta(fid: str):
    entry = _entry(fid)
    with store.MU:
        doc = _open(entry)
        try:
            m = dict(doc.metadata or {})
            m["toc"] = doc.get_toc(simple=True)[:200]
            return m
        finally:
            doc.close()


# ---------------- işlem ----------------

class ProcessBody(BaseModel):
    files: list[str] = Field(default_factory=list, max_length=100)
    options: dict = Field(default_factory=dict)


@app.post("/api/process/{tool}")
async def process(tool: str, body: ProcessBody):
    if _slots is None:
        raise HTTPException(503, "Sunucu hazırlanıyor.")
    if _slots.locked():
        raise HTTPException(429, "Sunucu şu anda meşgul. Biraz sonra tekrar dene.")
    if settings.hosted and (tool.startswith("ai_") or tool == "html_to_pdf"):
        raise HTTPException(403, "Bu araç sunucu sürümünde henüz etkin değil; yerel sürümü kullanabilirsin.")
    ids = body.files
    options = body.options
    entries = [_entry(i) for i in ids]
    cert = options.get("certificate")
    cert_entry = None
    if isinstance(cert, dict):
        cert.pop("path", None)
        if not cert.get("file"):
            raise UserError("Sertifika dosyasını yeniden yükle.")
        cert_entry = _entry(cert["file"])
        if cert_entry.kind != "cert":
            raise UserError("PFX veya P12 sertifikası gerekli.")
        cert["path"] = str(_entry(cert["file"]).path)
    payload = [{"id": e.id, "name": e.name, "path": str(e.path), "kind": e.kind, "size": e.size,
                "password": e.password, "pages": e.pages} for e in entries]
    pinned = set(ids + ([cert_entry.id] if cert_entry else []))
    async with _slots:
        with store._lock:
            if pinned & store._active:
                raise HTTPException(409, "Bu dosya üzerinde başka bir işlem devam ediyor.")
            for fid in pinned:
                _entry(fid)
            store._active.update(pinned)
        workdir = store.work_dir()
        job = asyncio.create_task(asyncio.to_thread(jobs.execute, tool, payload, options, workdir))
        try:
            # Keep files pinned until the subprocess has exited, even if the request is cancelled.
            try:
                res = await asyncio.shield(job)
            except asyncio.CancelledError:
                await job
                raise
            if "error" in res:
                raise UserError(res["error"])
            paths = [Path(p).resolve() for p in res["paths"]]
            if any(not p.is_relative_to(workdir.resolve()) for p in paths):
                raise UserError("Geçersiz çıktı yolu.")
            if not paths:
                raise UserError("İşlem bir çıktı üretmedi.")
            if len(paths) == 1:
                result = await asyncio.to_thread(store.add_path, paths[0], paths[0].name)
            else:
                name = store.safe_name(res.get("result_name") or "sonuc.zip")
                if not name.endswith(".zip"):
                    name = Path(name).stem + ".zip"
                z = await asyncio.to_thread(zip_files, paths, workdir / name)
                result = await asyncio.to_thread(store.add_path, z, name)
                res["extra"]["files"] = len(paths)
            return {"result": result.info(), "extra": res.get("extra", {})}
        finally:
            with store._lock:
                store._active.difference_update(pinned)
            shutil.rmtree(workdir, ignore_errors=True)


# ---------------- arayüz ----------------

@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=STATIC), name="static")
