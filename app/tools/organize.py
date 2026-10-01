"""Sayfa düzenleme: birleştir, böl, sil, çıkar, sırala, döndür, çoklu sayfa, boyutlandır."""
from __future__ import annotations

import pymupdf

from ..util import UserError, human_ranges, paper_size, parse_pages, parse_ranges, save_pdf, stem
from . import tool

ANY = ("pdf", "image", "word", "excel", "powerpoint", "html")


@tool("merge", kinds=ANY, min_files=1)
def merge(ctx):
    if len(ctx.entries) < 2:
        raise UserError("Birleştirmek için en az 2 dosya ekle.")
    out = pymupdf.open()
    toc = []
    for e in ctx.entries:
        src = ctx.open_pdf(e)
        start = out.page_count
        out.insert_pdf(src, annots=True, links=True)
        if ctx.opt_bool("bookmarks", True):
            toc.append([1, stem(e.name), start + 1])
            for lvl, title, page, *_ in src.get_toc(simple=True):
                toc.append([lvl + 1, title, start + page])
        src.close()
    if toc:
        try:
            out.set_toc(toc)
        except Exception:
            pass
    ctx.result_name = "birlestirilmis.pdf"
    return save_pdf(out, ctx.out("birlestirilmis.pdf"))


@tool("split")
def split(ctx):
    e = ctx.first
    doc = ctx.open_pdf(e)
    n = doc.page_count
    mode = ctx.opt("mode", "ranges")
    groups: list[list[int]]
    if mode == "ranges":
        groups = parse_ranges(ctx.opt("ranges", ""), n)
    elif mode == "every":
        k = max(1, int(ctx.opt_num("every", 1)))
        groups = [list(range(i, min(i + k, n))) for i in range(0, n, k)]
    elif mode == "all":
        groups = [[i] for i in range(n)]
    elif mode == "selected":
        pages = parse_pages(ctx.opt("pages", ""), n)
        groups = [[p] for p in pages]
    elif mode == "bookmarks":
        toc = [t for t in doc.get_toc(simple=True) if t[0] == 1]
        if not toc:
            raise UserError("Bu PDF'te yer imi (içindekiler) yok.")
        starts = sorted({max(0, t[2] - 1) for t in toc})
        if starts[0] != 0:
            starts.insert(0, 0)
        groups = [list(range(s, (starts[i + 1] if i + 1 < len(starts) else n))) for i, s in enumerate(starts)]
    elif mode == "size":
        limit = ctx.opt_num("max_mb", 5) * 1024 * 1024
        groups, cur = [], []
        for i in range(n):
            trial = cur + [i]
            tmp = pymupdf.open()
            for p in trial:
                tmp.insert_pdf(doc, from_page=p, to_page=p)
            size = len(tmp.tobytes(garbage=3, deflate=True))
            tmp.close()
            if size > limit and cur:
                groups.append(cur)
                cur = [i]
            else:
                cur = trial
        if cur:
            groups.append(cur)
    else:
        raise UserError("Bilinmeyen bölme türü.")

    groups = [g for g in groups if g]
    base = stem(e.name)
    if ctx.opt_bool("merge_output", False):
        out = pymupdf.open()
        for g in groups:
            for p in g:
                out.insert_pdf(doc, from_page=p, to_page=p)
        return save_pdf(out, ctx.out(f"{base}_secilen.pdf"))
    paths = []
    for g in groups:
        out = pymupdf.open()
        for p in g:
            out.insert_pdf(doc, from_page=p, to_page=p)
        paths.append(save_pdf(out, ctx.out(f"{base}_{human_ranges(g).replace(',', '_')}.pdf")))
    ctx.result_name = f"{base}_bolunmus.zip"
    return paths


@tool("remove_pages")
def remove_pages(ctx):
    doc = ctx.open_pdf(ctx.first)
    pages = parse_pages(ctx.opt("pages", ""), doc.page_count)
    if not ctx.opt("pages"):
        raise UserError("Silinecek sayfaları seç.")
    if len(pages) >= doc.page_count:
        raise UserError("Tüm sayfalar silinemez; en az bir sayfa kalmalı.")
    doc.delete_pages(sorted(pages))
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_duzenlenmis.pdf"))


@tool("extract_pages")
def extract_pages(ctx):
    doc = ctx.open_pdf(ctx.first)
    if not ctx.opt("pages"):
        raise UserError("Çıkarılacak sayfaları seç.")
    pages = parse_pages(ctx.opt("pages"), doc.page_count)
    base = stem(ctx.first.name)
    if ctx.opt_bool("separate", False):
        paths = []
        for p in pages:
            out = pymupdf.open()
            out.insert_pdf(doc, from_page=p, to_page=p)
            paths.append(save_pdf(out, ctx.out(f"{base}_sayfa_{p + 1}.pdf")))
        ctx.result_name = f"{base}_sayfalar.zip"
        return paths
    out = pymupdf.open()
    for p in pages:
        out.insert_pdf(doc, from_page=p, to_page=p)
    return save_pdf(out, ctx.out(f"{base}_{human_ranges(pages).replace(',', '_')}.pdf"))


@tool("organize", kinds=ANY, min_files=1)
def organize(ctx):
    """sequence: [{file, page, rotate}] veya {blank: true, w, h}"""
    seq = ctx.opt("sequence") or []
    docs = {}
    for e in ctx.entries:
        docs[e.id] = ctx.open_pdf(e)
    if not seq:  # sıra verilmemişse tüm dosyaları sırayla al
        for e in ctx.entries:
            seq += [{"file": e.id, "page": i} for i in range(docs[e.id].page_count)]
    out = pymupdf.open()
    for item in seq:
        if item.get("blank"):
            w = float(item.get("w") or 595)
            h = float(item.get("h") or 842)
            out.new_page(width=w, height=h)
            continue
        src = docs.get(item.get("file"))
        if src is None:
            raise UserError("Sıralamada bilinmeyen bir dosya var.")
        p = int(item.get("page", 0))
        if not 0 <= p < src.page_count:
            continue
        out.insert_pdf(src, from_page=p, to_page=p, annots=True, links=True)
        rot = int(item.get("rotate", 0)) % 360
        if rot:
            pg = out[-1]
            pg.set_rotation((pg.rotation + rot) % 360)
    if out.page_count == 0:
        raise UserError("Sonuçta hiç sayfa kalmadı.")
    name = stem(ctx.first.name) + "_duzenlenmis.pdf" if len(ctx.entries) == 1 else "duzenlenmis.pdf"
    return save_pdf(out, ctx.out(name))


@tool("rotate", kinds=("pdf",), min_files=1)
def rotate(ctx):
    paths = []
    per_page = ctx.opt("per_page") or {}
    angle = int(ctx.opt_num("angle", 90)) % 360
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        if per_page and len(ctx.entries) == 1:
            for k, v in per_page.items():
                i = int(k)
                if 0 <= i < doc.page_count and int(v) % 360:
                    pg = doc[i]
                    pg.set_rotation((pg.rotation + int(v)) % 360)
        else:
            for i in parse_pages(ctx.opt("pages", "all"), doc.page_count):
                pg = doc[i]
                pg.set_rotation((pg.rotation + angle) % 360)
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_dondurulmus.pdf")))
    ctx.result_name = "dondurulmus.zip"
    return paths


@tool("nup")
def nup(ctx):
    """Birden fazla sayfayı tek kağıda yerleştirir (2, 4, 6, 9, 16)."""
    src = ctx.open_pdf(ctx.first)
    per = int(ctx.opt_num("per_sheet", 2))
    grids = {2: (2, 1), 4: (2, 2), 6: (3, 2), 8: (4, 2), 9: (3, 3), 16: (4, 4)}
    cols, rows = grids.get(per, (2, 1))
    first = src[0].rect
    landscape_src = first.width > first.height
    orient = ctx.opt("orientation", "auto")
    if orient == "auto":
        # 2 ve 6'lık düzende dikey sayfalar yatay kağıda sığar
        landscape = (per in (2, 6, 8)) != landscape_src
    else:
        landscape = orient == "landscape"
    W, H = paper_size(ctx.opt("paper", "A4"), landscape)
    if landscape and cols < rows or (not landscape and cols > rows):
        cols, rows = rows, cols
    margin = ctx.opt_num("margin", 18)
    gap = ctx.opt_num("gap", 8)
    border = ctx.opt_bool("border", False)
    order = ctx.opt("order", "horizontal")
    cw = (W - 2 * margin - (cols - 1) * gap) / cols
    ch = (H - 2 * margin - (rows - 1) * gap) / rows
    out = pymupdf.open()
    for i in range(src.page_count):
        k = i % per
        if k == 0:
            sheet = out.new_page(width=W, height=H)
        if order == "vertical":
            c, r = divmod(k, rows)
        else:
            r, c = divmod(k, cols)
        x = margin + c * (cw + gap)
        y = margin + r * (ch + gap)
        cell = pymupdf.Rect(x, y, x + cw, y + ch)
        sheet.show_pdf_page(cell, src, i, keep_proportion=True)
        if border:
            sheet.draw_rect(cell, color=(0.6, 0.6, 0.6), width=0.5)
    return save_pdf(out, ctx.out(f"{stem(ctx.first.name)}_{per}lu.pdf"))


@tool("resize_pages")
def resize_pages(ctx):
    src = ctx.open_pdf(ctx.first)
    paper = ctx.opt("paper", "A4")
    orient = ctx.opt("orientation", "auto")
    margin = ctx.opt_num("margin", 0)
    out = pymupdf.open()
    for i, page in enumerate(src):
        r = page.rect
        landscape = (r.width > r.height) if orient == "auto" else orient == "landscape"
        W, H = paper_size(paper, landscape)
        p = out.new_page(width=W, height=H)
        box = pymupdf.Rect(margin, margin, W - margin, H - margin)
        p.show_pdf_page(box, src, i, keep_proportion=True)
    return save_pdf(out, ctx.out(f"{stem(ctx.first.name)}_{paper}.pdf"))


@tool("reverse")
def reverse(ctx):
    doc = ctx.open_pdf(ctx.first)
    doc.select(list(range(doc.page_count - 1, -1, -1)))
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_ters.pdf"))

