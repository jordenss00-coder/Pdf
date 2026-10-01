"""Ortak yardımcılar: sayfa aralıkları, renkler, koordinat dönüşümleri, zip."""
from __future__ import annotations

import re
import zipfile
from pathlib import Path

import pymupdf


class UserError(Exception):
    """Kullanıcıya olduğu gibi gösterilecek hata."""


# ---------- sayfa aralıkları ----------

def _page_num(tok: str, n: int) -> int:
    tok = tok.strip().lower()
    if tok in ("son", "last", "z"):
        return n
    if not tok.isdigit():
        raise UserError(f"Geçersiz sayfa numarası: '{tok}'")
    v = int(tok)
    if v < 1 or v > n:
        raise UserError(f"Sayfa {v} yok. Belgede {n} sayfa var.")
    return v


def parse_ranges(spec: str | None, n: int) -> list[list[int]]:
    """'1-3, 5, 8-' gibi bir ifadeyi 0 tabanlı sayfa gruplarına çevirir."""
    spec = (spec or "").strip().lower()
    if spec in ("", "all", "tümü", "hepsi"):
        return [list(range(n))]
    if spec in ("odd", "tek"):
        return [list(range(0, n, 2))]
    if spec in ("even", "çift", "cift"):
        return [list(range(1, n, 2))]
    groups = []
    for part in re.split(r"[,;]", spec):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            a = _page_num(a, n) if a.strip() else 1
            b = _page_num(b, n) if b.strip() else n
            step = 1 if b >= a else -1
            groups.append([i - 1 for i in range(a, b + step, step)])
        else:
            groups.append([_page_num(part, n) - 1])
    if not groups:
        raise UserError("Sayfa aralığı boş.")
    return groups


def parse_pages(spec: str | None, n: int) -> list[int]:
    seen, out = set(), []
    for g in parse_ranges(spec, n):
        for i in g:
            if i not in seen:
                seen.add(i)
                out.append(i)
    return out


def human_ranges(pages: list[int]) -> str:
    """[0,1,2,4] -> '1-3,5'"""
    if not pages:
        return ""
    pages = sorted(pages)
    out, start, prev = [], pages[0], pages[0]
    for p in pages[1:]:
        if p == prev + 1:
            prev = p
            continue
        out.append(f"{start + 1}" if start == prev else f"{start + 1}-{prev + 1}")
        start = prev = p
    out.append(f"{start + 1}" if start == prev else f"{start + 1}-{prev + 1}")
    return ",".join(out)


# ---------- renkler ----------

def rgb(value, default=(0, 0, 0)):
    """'#rrggbb' veya [r,g,b] (0-1 / 0-255) -> (r,g,b) 0-1 aralığında."""
    if value is None or value == "" or value is False:
        return default
    if isinstance(value, str):
        v = value.strip().lstrip("#")
        if len(v) == 3:
            v = "".join(c * 2 for c in v)
        if len(v) != 6:
            return default
        return tuple(int(v[i:i + 2], 16) / 255 for i in (0, 2, 4))
    vals = list(value)[:3]
    if any(x > 1 for x in vals):
        return tuple(x / 255 for x in vals)
    return tuple(vals)


def int_to_hex(c: int) -> str:
    return "#{:06x}".format(c & 0xFFFFFF)


# ---------- koordinatlar ----------
# Arayüz sayfayı döndürülmüş (görünür) haliyle gösterir. PyMuPDF metin/çizim
# koordinatlarını döndürülmemiş sayfaya göre verir; bu iki fonksiyon dönüştürür.

def to_visual(page: pymupdf.Page, r) -> pymupdf.Rect:
    r = pymupdf.Rect(r)
    if page.rotation:
        r = r * page.rotation_matrix
    return r


def point_to_visual(page: pymupdf.Page, p) -> pymupdf.Point:
    p = pymupdf.Point(p)
    if page.rotation:
        p = p * page.rotation_matrix
    return p


def normalize_rotation(page: pymupdf.Page) -> None:
    """Sayfanın görünümünü koruyarak /Rotate değerini 0 yapar.
    Böylece arayüzden gelen görünür koordinatlar doğrudan kullanılabilir."""
    if page.rotation:
        page.remove_rotation()


def rect_from(d) -> pymupdf.Rect:
    if isinstance(d, dict):
        if "x" in d:
            return pymupdf.Rect(d["x"], d["y"], d["x"] + d["w"], d["y"] + d["h"])
        return pymupdf.Rect(d["x0"], d["y0"], d["x1"], d["y1"])
    return pymupdf.Rect(d)


# ---------- dosyalar ----------

def stem(name: str) -> str:
    return Path(name).stem or "dosya"


def zip_files(paths: list[Path], dest: Path) -> Path:
    used = set()
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            arc = p.name
            i = 2
            while arc in used:
                arc = f"{p.stem}_{i}{p.suffix}"
                i += 1
            used.add(arc)
            z.write(p, arc)
    return dest


PAPER = {
    "A3": (842, 1191),
    "A4": (595, 842),
    "A5": (420, 595),
    "Letter": (612, 792),
    "Legal": (612, 1008),
}


def paper_size(name: str, landscape: bool = False) -> tuple[float, float]:
    w, h = PAPER.get(name, PAPER["A4"])
    return (h, w) if landscape else (w, h)


def save_pdf(doc: pymupdf.Document, path: Path, subset: bool = True, **kw) -> Path:
    """Kaydeder; eklenen yazı tiplerinin yalnızca kullanılan karakterlerini gömer."""
    if subset:
        try:
            doc.subset_fonts()
        except Exception:
            pass
    opts = dict(garbage=3, deflate=True)
    opts.update(kw)
    doc.save(path, **opts)
    doc.close()
    return path
