"""İki PDF'i karşılaştırma: metin farkları veya görsel (piksel) farklar."""
from __future__ import annotations

import difflib

import pymupdf

from ..fonts import get_font
from ..util import UserError, save_pdf, stem
from . import tool

RED = (0.9, 0.15, 0.2)
GREEN = (0.1, 0.65, 0.3)
GAP = 24


def _words(doc):
    out = []
    for page in doc:
        for w in page.get_text("words", sort=True):
            out.append((page.number, pymupdf.Rect(w[:4]), w[4]))
    return out


def _side_by_side(a, b):
    """Her A/B sayfa çifti için yan yana yerleştirilmiş tek bir sayfa üretir."""
    out = pymupdf.open()
    n = max(a.page_count, b.page_count)
    offsets = []
    for i in range(n):
        ra = a[i].rect if i < a.page_count else pymupdf.Rect(0, 0, 0, 0)
        rb = b[i].rect if i < b.page_count else pymupdf.Rect(0, 0, 0, 0)
        W = ra.width + GAP + rb.width
        H = max(ra.height, rb.height) + 30
        p = out.new_page(width=W, height=H)
        if i < a.page_count:
            p.show_pdf_page(pymupdf.Rect(0, 30, ra.width, 30 + ra.height), a, i)
        if i < b.page_count:
            p.show_pdf_page(pymupdf.Rect(ra.width + GAP, 30, W, 30 + rb.height), b, i)
        offsets.append((pymupdf.Point(0, 30), pymupdf.Point(ra.width + GAP, 30)))
    return out, offsets


def _label(page, x, text, color):
    tw = pymupdf.TextWriter(page.rect)
    tw.append((x + 6, 20), text, font=get_font("arial", True), fontsize=11)
    tw.write_text(page, color=color)


@tool("compare", min_files=2, max_files=2)
def compare(ctx):
    ea, eb = ctx.entries
    a, b = ctx.open_pdf(ea), ctx.open_pdf(eb)
    mode = ctx.opt("mode", "text")
    out, offsets = _side_by_side(a, b)
    changes = {"deleted": 0, "inserted": 0, "pages": []}
    if mode == "visual":
        import numpy as np
        import cv2
        dpi = 100
        for i in range(min(a.page_count, b.page_count)):
            pa = a[i].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
            pb = b[i].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
            h, w = min(pa.height, pb.height), min(pa.width, pb.width)
            ia = np.frombuffer(pa.samples, np.uint8).reshape(pa.height, pa.width)[:h, :w]
            ib = np.frombuffer(pb.samples, np.uint8).reshape(pb.height, pb.width)[:h, :w]
            diff = cv2.absdiff(ia, ib)
            _, mask = cv2.threshold(diff, 40, 255, cv2.THRESH_BINARY)
            mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=2)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            k = 72 / dpi
            page = out[i]
            for c in contours:
                x, y, cw, ch = cv2.boundingRect(c)
                if cw * ch < 20:
                    continue
                r = pymupdf.Rect(x * k, y * k, (x + cw) * k, (y + ch) * k)
                for off, col in ((offsets[i][0], RED), (offsets[i][1], GREEN)):
                    page.draw_rect(r + (off.x, off.y, off.x, off.y), color=col, width=1.2,
                                   fill=col, fill_opacity=0.15)
                changes["inserted"] += 1
            if contours:
                changes["pages"].append(i + 1)
    else:
        wa, wb = _words(a), _words(b)
        sm = difflib.SequenceMatcher(a=[w[2] for w in wa], b=[w[2] for w in wb], autojunk=False)
        pages = set()
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                continue
            for pno, r, _ in wa[i1:i2]:
                off = offsets[pno][0]
                out[pno].draw_rect(r + (off.x, off.y, off.x, off.y), color=None, fill=RED, fill_opacity=0.3)
                changes["deleted"] += 1
                pages.add(pno + 1)
            for pno, r, _ in wb[j1:j2]:
                off = offsets[pno][1]
                out[pno].draw_rect(r + (off.x, off.y, off.x, off.y), color=None, fill=GREEN, fill_opacity=0.3)
                changes["inserted"] += 1
                pages.add(pno + 1)
        changes["pages"] = sorted(pages)
        if not wa and not wb:
            raise UserError("Belgelerde metin yok. 'Görsel karşılaştırma' modunu dene.")
    for i, page in enumerate(out):
        _label(page, offsets[i][0].x, f"A: {ea.name}", RED)
        _label(page, offsets[i][1].x, f"B: {eb.name}", GREEN)
    ctx.extra["compare"] = changes
    return save_pdf(out, ctx.out(f"karsilastirma_{stem(ea.name)}_{stem(eb.name)}.pdf"))
