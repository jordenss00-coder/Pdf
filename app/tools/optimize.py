"""Optimizasyon: sıkıştır, onar, OCR, gri tonlama, düzleştir."""
from __future__ import annotations

import shutil

import pymupdf

from .. import store
from ..fonts import get_font
from ..util import UserError, parse_pages, save_pdf, stem
from . import tool

TESSDATA = store.ROOT / "tessdata"

LEVELS = {
    # dpi eşiği, hedef dpi, jpeg kalitesi
    "extreme": (90, 72, 35),
    "recommended": (150, 110, 60),
    "low": (220, 180, 82),
}


@tool("compress", min_files=1)
def compress(ctx):
    level = ctx.opt("level", "recommended")
    thr, target, quality = LEVELS.get(level, LEVELS["recommended"])
    gray = ctx.opt_bool("grayscale", False)
    paths, stats = [], []
    for e in ctx.entries:
        before = e.path.stat().st_size
        doc = ctx.open_pdf(e)
        try:
            doc.rewrite_images(dpi_threshold=thr, dpi_target=target, quality=quality,
                               set_to_gray=gray)
        except Exception:
            pass
        try:
            doc.subset_fonts()
        except Exception:
            pass
        try:
            doc.scrub(metadata=False, xml_metadata=False, attached_files=False, embedded_files=False,
                      javascript=False, thumbnails=True, reset_fields=False, reset_responses=False,
                      clean_pages=True, hidden_text=False, redactions=False, redact_images=0,
                      remove_links=False)
        except Exception:
            pass
        out = ctx.out(f"{stem(e.name)}_sikistirilmis.pdf")
        doc.save(out, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True,
                 clean=True, use_objstms=1)
        doc.close()
        after = out.stat().st_size
        if after >= before and e.kind == "pdf":
            shutil.copyfile(e.path, out)
            after = before
        stats.append({"name": e.name, "before": before, "after": after})
        paths.append(out)
    ctx.extra["compress"] = stats
    ctx.result_name = "sikistirilmis.zip"
    return paths


@tool("repair")
def repair(ctx):
    paths = []
    notes = []
    for e in ctx.entries:
        out = ctx.out(f"{stem(e.name)}_onarilmis.pdf")
        ok = False
        try:
            doc = pymupdf.open(e.path)
            if doc.needs_pass:
                ctx.open_pdf(e)  # parola kontrolü / hata mesajı
            doc.save(out, garbage=4, deflate=True, clean=True)
            doc.close()
            ok = pymupdf.open(out).page_count > 0
        except UserError:
            raise
        except Exception as ex:
            notes.append(f"MuPDF: {ex}")
        if not ok:
            try:
                import pikepdf
                with pikepdf.open(e.path, attempt_recovery=True) as pdf:
                    pdf.save(out)
                ok = True
            except Exception as ex:
                notes.append(f"QPDF: {ex}")
        if not ok:
            raise UserError(f"'{e.name}' onarılamadı. Dosya çok ağır hasarlı olabilir.")
        paths.append(out)
    ctx.result_name = "onarilmis.zip"
    return paths


def _ocr_page(page: pymupdf.Page, language: str, dpi: int, font: pymupdf.Font) -> int:
    """Sayfayı OCR'lar ve kelimeleri görünmez metin olarak sayfanın üzerine yazar."""
    if page.rotation:
        page.remove_rotation()  # koordinatlar görünür sayfayla aynı olsun
    tp = page.get_textpage_ocr(language=language, dpi=dpi, full=True, tessdata=str(TESSDATA))
    words = page.get_text("words", textpage=tp)
    if not words:
        return 0
    tw = pymupdf.TextWriter(page.rect)
    count = 0
    for x0, y0, x1, y1, word, *_ in words:
        w, h = x1 - x0, y1 - y0
        if w <= 0 or h <= 0 or not word.strip():
            continue
        unit = font.text_length(word, fontsize=1)
        if unit <= 0:
            continue
        fs = min(w / unit, h * 1.15)
        baseline = y1 - (h - fs * (font.ascender - font.descender)) / 2 + fs * font.descender
        try:
            tw.append((x0, baseline), word, font=font, fontsize=fs)
            count += 1
        except Exception:
            continue
    tw.write_text(page, render_mode=3)  # 3 = görünmez metin
    return count


@tool("ocr", kinds=("pdf", "image"))
def ocr(ctx):
    langs = ctx.opt("language", "tur+eng")
    available = {p.stem for p in TESSDATA.glob("*.traineddata")}
    for l in langs.split("+"):
        if l not in available:
            raise UserError(f"OCR dili '{l}' kurulu değil. tessdata klasörüne {l}.traineddata ekle.")
    dpi = int(ctx.opt_num("dpi", 300))
    skip_text = ctx.opt_bool("skip_text_pages", True)
    font = get_font("arial")
    paths = []
    total = 0
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
        for i in pages:
            page = doc[i]
            if skip_text and len(page.get_text("text").strip()) > 20:
                continue
            total += _ocr_page(page, langs, dpi, font)
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_ocr.pdf")))
    if total == 0:
        ctx.extra["warning"] = "Tanınacak metin bulunamadı. Sayfalar zaten metin içeriyor olabilir."
    ctx.extra["words"] = total
    ctx.result_name = "ocr.zip"
    return paths


@tool("grayscale")
def grayscale(ctx):
    paths = []
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        try:
            doc.recolor(1)
        except Exception:
            # Yedek yöntem: sayfaları gri görüntü olarak yeniden oluştur
            out = pymupdf.open()
            for p in doc:
                pix = p.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
                np_ = out.new_page(width=p.rect.width, height=p.rect.height)
                np_.insert_image(np_.rect, pixmap=pix)
            doc = out
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_gri.pdf")))
    ctx.result_name = "gri.zip"
    return paths


@tool("flatten")
def flatten(ctx):
    paths = []
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        doc.bake(annots=ctx.opt_bool("annots", True), widgets=ctx.opt_bool("widgets", True))
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_duzlestirilmis.pdf")))
    ctx.result_name = "duzlestirilmis.zip"
    return paths

