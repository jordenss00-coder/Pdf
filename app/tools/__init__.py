"""Araç kayıt sistemi.

Her araç `@tool("ad")` ile kaydedilir ve `ctx` alır; bir veya daha fazla çıktı
dosyası (Path) döndürür. Birden fazla çıktı otomatik olarak zip'lenir.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Callable

import pymupdf

from .. import backends, store
from ..util import UserError, save_pdf, stem

TOOLS: dict[str, dict] = {}


def tool(name: str, kinds: tuple = ("pdf",), min_files: int = 1, max_files: int | None = None):
    def deco(fn: Callable):
        TOOLS[name] = {"fn": fn, "kinds": kinds, "min": min_files, "max": max_files}
        return fn
    return deco


class Ctx:
    def __init__(self, entries: list[store.Entry], options: dict, workdir: Path):
        self.entries = entries
        self.options = options or {}
        self.workdir = workdir
        self.extra: dict = {}
        self.result_name: str | None = None
        self._n = 0
        self._documents = []

    def track(self, doc):
        self._documents.append(doc)
        return doc

    def close(self):
        for doc in self._documents:
            if not doc.is_closed:
                doc.close()

    # seçenekler
    def opt(self, key: str, default=None):
        v = self.options.get(key, default)
        return default if v is None else v

    def opt_bool(self, key: str, default: bool = False) -> bool:
        v = self.options.get(key, default)
        if isinstance(v, str):
            return v.lower() in ("1", "true", "yes", "on", "evet")
        return bool(v)

    def opt_num(self, key: str, default: float) -> float:
        try:
            return float(self.options.get(key, default))
        except (TypeError, ValueError):
            return default

    @property
    def first(self) -> store.Entry:
        return self.entries[0]

    def out(self, name: str) -> Path:
        """Çalışma klasöründe benzersiz bir çıktı yolu üretir."""
        self._n += 1
        p = self.workdir / name
        if p.exists():
            p = self.workdir / f"{Path(name).stem}_{self._n}{Path(name).suffix}"
        return p

    # PDF açma
    def open_pdf(self, entry: store.Entry) -> pymupdf.Document:
        """Girdiyi PDF olarak açar. Görsel, Office ve HTML dosyalarını önce PDF'e çevirir."""
        if entry.kind == "pdf":
            try:
                doc = pymupdf.open(entry.path)
            except Exception as e:
                raise UserError(f"'{entry.name}' açılamadı. Dosya bozuk olabilir; 'PDF Onar' aracını dene.") from e
            if doc.needs_pass:
                pw = (self.options.get("passwords") or {}).get(entry.id) or entry.password
                if not pw or not doc.authenticate(pw):
                    doc.close()
                    raise UserError(f"'{entry.name}' parola korumalı. Önce parolayı gir.")
            return self.track(doc)
        if entry.kind == "image":
            return self.track(images_to_doc([entry.path]))
        if entry.kind in ("word", "excel", "powerpoint"):
            dst = self.out(stem(entry.name) + ".pdf")
            backends.office_to_pdf(entry.path, entry.kind, dst)
            return self.track(pymupdf.open(dst))
        if entry.kind == "html":
            dst = self.out(stem(entry.name) + ".pdf")
            backends.html_to_pdf(entry.path.as_uri(), dst)
            return self.track(pymupdf.open(dst))
        raise UserError(f"'{entry.name}' desteklenmeyen bir dosya türü.")

    def pdf_path(self, entry: store.Entry) -> Path:
        """Şifresiz, gerçek bir PDF dosya yolu döndürür (yol isteyen kütüphaneler için)."""
        if entry.kind == "pdf":
            doc = pymupdf.open(entry.path)
            needs = doc.needs_pass
            doc.close()
            if not needs:
                return entry.path
        doc = self.open_pdf(entry)
        p = self.out(stem(entry.name) + "_tmp.pdf")
        save_pdf(doc, p)
        return p


def images_to_doc(paths: list[Path]) -> pymupdf.Document:
    from PIL import Image, ImageOps

    out = pymupdf.open()
    for p in paths:
        with Image.open(p) as im:
            im = ImageOps.exif_transpose(im)
            frames = []
            try:
                for i in range(getattr(im, "n_frames", 1)):
                    im.seek(i)
                    frames.append(im.copy())
            except EOFError:
                pass
            for fr in frames or [im]:
                buf, w, h = image_bytes(fr)
                page = out.new_page(width=w, height=h)
                page.insert_image(page.rect, stream=buf)
    return out


def image_bytes(im) -> tuple[bytes, float, float]:
    """PIL görüntüsünü PDF'e uygun bayta ve nokta (pt) cinsinden boyuta çevirir."""
    dpi = im.info.get("dpi", (96, 96))
    try:
        dx = float(dpi[0]) or 96
    except Exception:
        dx = 96
    dx = dx if 30 <= dx <= 1200 else 96
    w, h = im.size[0] * 72 / dx, im.size[1] * 72 / dx
    buf = io.BytesIO()
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        im.save(buf, "PNG")
    else:
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        im.save(buf, "JPEG", quality=92)
    return buf.getvalue(), w, h


def run(name: str, entries: list[store.Entry], options: dict, workdir: Path | None = None) -> tuple[list[Path], Ctx]:
    spec = TOOLS.get(name)
    if spec is None:
        raise UserError(f"Bilinmeyen araç: {name}")
    if len(entries) < spec["min"]:
        need = spec["min"]
        raise UserError("Önce bir dosya ekle." if need == 1 else f"Bu araç için en az {need} dosya gerekli.")
    if spec["max"] and len(entries) > spec["max"]:
        raise UserError(f"Bu araç en fazla {spec['max']} dosya alır.")
    if spec["kinds"] != ("*",):
        for e in entries:
            if e.kind not in spec["kinds"]:
                raise UserError(f"'{e.name}' bu araç için uygun bir dosya değil.")
    ctx = Ctx(entries, options, workdir or store.work_dir())
    try:
        result = spec["fn"](ctx)
    finally:
        ctx.close()
    if isinstance(result, Path):
        result = [result]
    return list(result or []), ctx


# Araç modüllerini yükle (kayıt için)
from . import organize, optimize, convert, edit, forms, security, compare, ai, textedit, markdown  # noqa: E402,F401
