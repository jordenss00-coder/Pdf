"""Yüklenen ve üretilen dosyaların geçici deposu.

Her dosya data/<id>/ altında tutulur. Uygulama kişisel kullanım için olduğundan
indeks bellekte tutulur; sunucu yeniden başladığında data klasörü temizlenir.
"""
from __future__ import annotations

import os
import json
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf
from .access import owner
from .settings import settings

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.getenv("PDF_DATA_DIR", str(ROOT / "data"))).resolve()
MAX_AGE_SECONDS = settings.retention_hours * 3600

KINDS = {
    "pdf": {".pdf"},
    "image": {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".jfif"},
    "word": {".doc", ".docx", ".odt", ".rtf", ".txt", ".docm", ".dot", ".dotx"},
    "excel": {".xls", ".xlsx", ".xlsm", ".ods", ".csv"},
    "powerpoint": {".ppt", ".pptx", ".pps", ".ppsx", ".odp", ".pptm"},
    "html": {".html", ".htm", ".mhtml"},
    "cert": {".pfx", ".p12"},
}


def kind_of(name: str) -> str:
    ext = Path(name).suffix.lower()
    for kind, exts in KINDS.items():
        if ext in exts:
            return kind
    return "other"


@dataclass
class Entry:
    id: str
    name: str
    path: Path
    kind: str
    size: int = 0
    pages: list = field(default_factory=list)  # [(w, h)] görünür (döndürülmüş) boyutlar
    encrypted: bool = False
    has_form: bool = False
    password: str | None = None
    created: float = field(default_factory=time.time)
    source: str = "upload"  # upload | result
    owner: str = "local"

    def info(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "size": self.size,
            "pageCount": len(self.pages),
            "pages": [{"w": round(w, 2), "h": round(h, 2)} for w, h in self.pages],
            "encrypted": self.encrypted,
            "locked": self.encrypted and not self.password,
            "hasForm": self.has_form,
            "source": self.source,
            "expiresAt": self.created + MAX_AGE_SECONDS,
        }


_entries: dict[str, Entry] = {}
_lock = threading.RLock()
_active: set[str] = set()
# PyMuPDF iş parçacığı güvenli değil: ana süreçteki tüm erişimler bu kilitle yapılır
MU = threading.RLock()


def init() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    with _lock:
        _entries.clear()
        for manifest in DATA.glob("*/entry.json"):
            try:
                meta = json.loads(manifest.read_text(encoding="utf-8"))
                fid = manifest.parent.name
                name = safe_name(meta["name"])
                path = manifest.parent / name
                if name == "entry.json" or not path.is_file():
                    continue
                entry = Entry(id=fid, name=name, path=path, kind=kind_of(name),
                              owner=meta["owner"], created=float(meta["created"]), source=meta["source"])
                refresh(entry)
                _entries[fid] = entry
            except (ValueError, KeyError, OSError, TypeError):
                continue
    cleanup()


def _new_dir() -> tuple[str, Path]:
    fid = uuid.uuid4().hex
    d = DATA / fid
    d.mkdir(parents=True, exist_ok=True)
    return fid, d


def safe_name(name: str) -> str:
    name = os.path.basename(name or "dosya").strip() or "dosya"
    bad = '<>:"/\\|?*\x00'
    name = "".join("_" if c in bad or ord(c) < 32 else c for c in name)
    name = name[:180].rstrip(". ") or "dosya"
    if name.lower() == "entry.json" or Path(name).stem.upper() in {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(10)], *[f"LPT{i}" for i in range(10)]}:
        name = "_" + name
    return name


def refresh(entry: Entry) -> Entry:
    """PDF meta bilgilerini (sayfa sayısı, boyutlar, şifre, form) yeniden okur."""
    entry.size = entry.path.stat().st_size
    if entry.kind != "pdf":
        return entry
    with MU:
        return _refresh_pdf(entry)


def _refresh_pdf(entry: Entry) -> Entry:
    try:
        doc = pymupdf.open(entry.path)
    except Exception:
        entry.pages = []
        return entry
    with doc:
        entry.encrypted = bool(doc.needs_pass)
        if doc.needs_pass and entry.password:
            if not doc.authenticate(entry.password):
                entry.password = None
        if not doc.needs_pass or entry.password:
            entry.pages = [(p.rect.width, p.rect.height) for p in doc]
            try:
                entry.has_form = bool(doc.is_form_pdf)
            except Exception:
                entry.has_form = False
        else:
            entry.pages = [(0, 0)] * max(doc.page_count, 0)
    return entry


def add_bytes(data: bytes, name: str, source: str = "upload") -> Entry:
    fid, d = _new_dir()
    name = safe_name(name)
    path = d / name
    path.write_bytes(data)
    return _register(fid, name, path, source)


def add_path(src: Path, name: str | None = None, source: str = "result", move: bool = True) -> Entry:
    fid, d = _new_dir()
    name = safe_name(name or src.name)
    path = d / name
    if move:
        shutil.move(str(src), path)
    else:
        shutil.copyfile(src, path)
    return _register(fid, name, path, source)


def _register(fid: str, name: str, path: Path, source: str) -> Entry:
    entry = Entry(id=fid, name=name, path=path, kind=kind_of(name), source=source, owner=owner.get())
    refresh(entry)
    if len(entry.pages) > settings.max_pages:
        shutil.rmtree(path.parent, ignore_errors=True)
        from .util import UserError
        raise UserError(f"Belge en fazla {settings.max_pages} sayfa olabilir.")
    with _lock:
        usage = sum(e.size for e in _entries.values() if e.owner == entry.owner)
        if usage + entry.size > settings.session_mb * 1024 * 1024:
            shutil.rmtree(path.parent, ignore_errors=True)
            from .util import UserError
            raise UserError("Oturumun depolama sınırı doldu. Önce dosyalarını sil.")
        (path.parent / "entry.json").write_text(json.dumps({"name": name, "owner": entry.owner,
            "created": entry.created, "source": source}), encoding="utf-8")
        _entries[fid] = entry
    return entry


def get(fid: str) -> Entry:
    with _lock:
        entry = _entries.get(fid)
    if entry is None or entry.owner != owner.get() or not entry.path.exists() or (time.time() - entry.created > MAX_AGE_SECONDS and fid not in _active):
        raise KeyError(fid)
    return entry


def delete(fid: str) -> None:
    with _lock:
        entry = get(fid)
        if fid in _active:
            from .util import UserError
            raise UserError("İşlem devam ederken dosya silinemez.")
        with MU:
            shutil.rmtree(entry.path.parent)
        del _entries[fid]


def owned_ids():
    with _lock:
        return [fid for fid, e in _entries.items() if e.owner == owner.get()]


def work_dir() -> Path:
    """Bir işlem için geçici çalışma klasörü."""
    d = DATA / "_work" / uuid.uuid4().hex[:12]
    d.mkdir(parents=True, exist_ok=True)
    return d


def cleanup() -> None:
    now = time.time()
    with _lock:
        old = [k for k, e in _entries.items() if now - e.created > MAX_AGE_SECONDS and k not in _active]
        for k in old:
            try:
                with MU:
                    shutil.rmtree(_entries[k].path.parent)
                del _entries[k]
            except OSError:
                pass  # retry on the next scheduled cleanup
    work = DATA / "_work"
    if work.exists():
        for d in work.iterdir():
            try:
                if now - d.stat().st_mtime > max(3600, settings.job_timeout * 2):
                    shutil.rmtree(d, ignore_errors=True)
            except OSError:
                pass
