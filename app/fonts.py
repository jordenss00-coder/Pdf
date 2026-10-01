"""Yazı tipi seçimi.

Türkçe karakterleri (ğ ş ı İ) doğru basabilmek için Windows'un TrueType
yazı tiplerini kullanır. Mevcut metni düzeltirken önce PDF'e gömülü orijinal
yazı tipini dener; yeni metindeki her karakter o yazı tipinde varsa onu kullanır.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

import pymupdf

WIN_FONTS = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"

# aile -> (normal, kalın, italik, kalın-italik)
FAMILIES = {
    "arial": ("arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"),
    "times": ("times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"),
    "courier": ("cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf"),
    "calibri": ("calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"),
    "cambria": ("cambria.ttc", "cambriab.ttf", "cambriai.ttf", "cambriaz.ttf"),
    "verdana": ("verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf"),
    "tahoma": ("tahoma.ttf", "tahomabd.ttf", "tahoma.ttf", "tahomabd.ttf"),
    "georgia": ("georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"),
    "segoe": ("segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"),
    "trebuchet": ("trebuc.ttf", "trebucbd.ttf", "trebucit.ttf", "trebucbi.ttf"),
    "garamond": ("GARA.TTF", "GARABD.TTF", "GARAIT.TTF", "GARABD.TTF"),
    "comic": ("comic.ttf", "comicbd.ttf", "comici.ttf", "comicz.ttf"),
    "consolas": ("consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf"),
}

# Arayüzde gösterilen isimler
LABELS = {
    "arial": "Arial / Helvetica",
    "times": "Times New Roman",
    "courier": "Courier New",
    "calibri": "Calibri",
    "cambria": "Cambria",
    "verdana": "Verdana",
    "tahoma": "Tahoma",
    "georgia": "Georgia",
    "segoe": "Segoe UI",
    "trebuchet": "Trebuchet MS",
    "garamond": "Garamond",
    "comic": "Comic Sans MS",
    "consolas": "Consolas",
}

_BUILTIN = {"arial": "helv", "times": "tiro", "courier": "cour"}


def available_families() -> list[dict]:
    out = []
    for key, files in FAMILIES.items():
        if (WIN_FONTS / files[0]).exists() or (key in ("arial", "times", "courier") and linux_font_path(key)):
            out.append({"id": key, "label": LABELS[key]})
    return out


def linux_font_path(family: str, bold: bool = False, italic: bool = False) -> Path | None:
    family_name = {"times": "Serif", "courier": "Mono"}.get(family, "Sans")
    style = "BoldItalic" if bold and italic else "Bold" if bold else "Italic" if italic else "Regular"
    for folder in ("/usr/share/fonts/truetype/liberation2", "/usr/share/fonts/truetype/liberation"):
        candidate = Path(folder) / f"Liberation{family_name}-{style}.ttf"
        if candidate.is_file():
            return candidate
    return None


def font_path(family: str, bold: bool = False, italic: bool = False) -> Path | None:
    files = FAMILIES.get(family) or FAMILIES["arial"]
    idx = (1 if bold else 0) + (2 if italic else 0)
    for candidate in (files[idx], files[1] if bold else files[0], files[0]):
        p = WIN_FONTS / candidate
        if p.exists():
            return p
    linux = linux_font_path(family, bold, italic)
    if linux:
        return linux
    if family != "arial":
        return font_path("arial", bold, italic)
    return None


@lru_cache(maxsize=64)
def get_font(family: str = "arial", bold: bool = False, italic: bool = False) -> pymupdf.Font:
    p = font_path(family, bold, italic)
    if p is not None:
        return pymupdf.Font(fontfile=str(p))
    base = _BUILTIN.get(family, "helv")
    return pymupdf.Font(base)


def guess_family(fontname: str, flags: int = 0) -> str:
    """PDF yazı tipi adından en yakın Windows ailesini tahmin eder."""
    n = re.sub(r"^[A-Z]{6}\+", "", fontname or "").lower().replace(" ", "")
    table = [
        ("calibri", "calibri"), ("cambria", "cambria"), ("verdana", "verdana"),
        ("tahoma", "tahoma"), ("georgia", "georgia"), ("segoe", "segoe"),
        ("trebuchet", "trebuchet"), ("garamond", "garamond"), ("comic", "comic"),
        ("consolas", "consolas"), ("courier", "courier"), ("mono", "courier"),
        ("times", "times"), ("tiro", "times"), ("serif", "times"), ("roman", "times"),
        ("minion", "times"), ("georgia", "georgia"),
        ("arial", "arial"), ("helv", "arial"), ("sans", "arial"),
    ]
    for key, fam in table:
        if key in n:
            return fam
    if flags & 8:  # monospaced
        return "courier"
    if flags & 4:  # serif
        return "times"
    return "arial"


def style_from(fontname: str, flags: int) -> tuple[bool, bool]:
    n = (fontname or "").lower()
    bold = bool(flags & 16) or any(k in n for k in ("bold", "black", "heavy", "semibold", "demi"))
    italic = bool(flags & 2) or any(k in n for k in ("italic", "oblique"))
    return bold, italic


def css_family(family: str) -> str:
    """Önizleme için CSS font-family karşılığı."""
    m = {
        "arial": "Arial, Helvetica, sans-serif",
        "times": "'Times New Roman', Times, serif",
        "courier": "'Courier New', Courier, monospace",
        "calibri": "Calibri, Carlito, sans-serif",
        "cambria": "Cambria, Caladea, serif",
        "verdana": "Verdana, sans-serif",
        "tahoma": "Tahoma, sans-serif",
        "georgia": "Georgia, serif",
        "segoe": "'Segoe UI', sans-serif",
        "trebuchet": "'Trebuchet MS', sans-serif",
        "garamond": "Garamond, serif",
        "comic": "'Comic Sans MS', cursive",
        "consolas": "Consolas, monospace",
    }
    return m.get(family, m["arial"])


# ---------- orijinal (gömülü) yazı tipini yeniden kullanma ----------

def _strip_subset(name: str) -> str:
    return re.sub(r"^[A-Z]{6}\+", "", name or "")


class FontResolver:
    """Bir belge için gömülü yazı tiplerini önbelleğe alır."""

    def __init__(self, doc: pymupdf.Document):
        self.doc = doc
        self._embedded: dict[tuple[int, str], pymupdf.Font | None] = {}

    def _embedded_font(self, page: pymupdf.Page, fontname: str) -> pymupdf.Font | None:
        target = _strip_subset(fontname)
        key = (page.number, target)
        if key in self._embedded:
            return self._embedded[key]
        font = None
        try:
            for f in page.get_fonts(full=True):
                xref, ext, basefont = f[0], f[1], f[3]
                if _strip_subset(basefont) != target or ext in ("n/a", ""):
                    continue
                _name, ext2, _type, buf = self.doc.extract_font(xref)
                if buf and ext2 in ("ttf", "otf", "cff", "pfa", "pfb", "cfx"):
                    font = pymupdf.Font(fontbuffer=buf)
                break
        except Exception:
            font = None
        self._embedded[key] = font
        return font

    def resolve(self, page: pymupdf.Page, fontname: str, flags: int, text: str,
                family: str | None = None, bold: bool | None = None,
                italic: bool | None = None) -> pymupdf.Font:
        """family 'auto'/None ise önce gömülü yazı tipini dener."""
        g_bold, g_italic = style_from(fontname, flags)
        bold = g_bold if bold is None else bold
        italic = g_italic if italic is None else italic
        if not family or family in ("auto", "original"):
            emb = self._embedded_font(page, fontname)
            if emb is not None and _covers(emb, text):
                return emb
            family = guess_family(fontname, flags)
        return get_font(family, bold, italic)


def _covers(font: pymupdf.Font, text: str) -> bool:
    try:
        for ch in set(text):
            if ch in "\n\r\t":
                continue
            if not font.has_glyph(ord(ch)):
                return False
        return True
    except Exception:
        return False
