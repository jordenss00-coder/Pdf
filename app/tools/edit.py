"""Düzenleme: editör işlemleri, sayfa numarası, filigran, üst/alt bilgi, kırpma, karartma, meta veri."""
from __future__ import annotations

import base64
import datetime as dt
import io
import math
import re

import pymupdf

from ..fonts import FontResolver, get_font
from ..util import UserError, normalize_rotation, parse_pages, rect_from, rgb, save_pdf, stem
from . import tool
from .textedit import apply_text_edits, build_regex, find_rects


def _decode_data_url(data: str) -> bytes:
    if not data:
        raise UserError("Görsel verisi eksik.")
    if "," in data and data.startswith("data:"):
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


def _image_with_opacity(raw: bytes, opacity: float = 1.0, angle: float = 0) -> bytes:
    if opacity >= 0.999 and not angle:
        return raw
    from PIL import Image
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    if angle:
        im = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    if opacity < 0.999:
        a = im.getchannel("A").point(lambda v: int(v * opacity))
        im.putalpha(a)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _baseline(font: pymupdf.Font, size: float, top: float, k: int, lh: float = 1.2) -> float:
    asc, desc = font.ascender, font.descender
    return top + k * lh * size + (lh - (asc - desc)) * size / 2 + asc * size


def _draw_text_box(page, op):
    text = (op.get("text") or "").replace("\r", "")
    if not text.strip():
        return
    size = float(op.get("size") or 14)
    font = get_font(op.get("family") or "arial", bool(op.get("bold")), bool(op.get("italic")))
    color = rgb(op.get("color"), (0, 0, 0))
    x, y, w = float(op["x"]), float(op["y"]), float(op.get("w") or 0)
    align = op.get("align", "left")
    opacity = float(op.get("opacity", 1))
    if op.get("bg"):
        page.draw_rect(rect_from(op), color=None, fill=rgb(op["bg"]), width=0, fill_opacity=opacity)
    tw = pymupdf.TextWriter(page.rect)
    for k, line in enumerate(text.split("\n")):
        lw = font.text_length(line, fontsize=size)
        lx = x
        if align == "center" and w:
            lx = x + (w - lw) / 2
        elif align == "right" and w:
            lx = x + w - lw
        if line:
            tw.append((lx, _baseline(font, size, y, k)), line, font=font, fontsize=size)
    tw.write_text(page, color=color, opacity=opacity)


def _arrow(page, p1, p2, color, width, opacity):
    page.draw_line(p1, p2, color=color, width=width, stroke_opacity=opacity, lineCap=1)
    ang = math.atan2(p2.y - p1.y, p2.x - p1.x)
    L = max(8, width * 4)
    a1 = pymupdf.Point(p2.x - L * math.cos(ang - 0.45), p2.y - L * math.sin(ang - 0.45))
    a2 = pymupdf.Point(p2.x - L * math.cos(ang + 0.45), p2.y - L * math.sin(ang + 0.45))
    page.draw_polyline([a1, p2, a2, a1], color=color, fill=color, width=width / 2,
                       stroke_opacity=opacity, fill_opacity=opacity, closePath=True)


def apply_ops(doc, page, ops, resolver):
    normalize_rotation(page)
    edits = [o for o in ops if o.get("type") == "textedit"]
    if edits:
        apply_text_edits(doc, page, edits, resolver)
    redactions = [o for o in ops if o.get("type") == "redact"]
    for o in redactions:
        page.add_redact_annot(rect_from(o), fill=rgb(o.get("color"), (0, 0, 0)))
    if redactions:
        page.apply_redactions()
    for o in ops:
        t = o.get("type")
        opacity = float(o.get("opacity", 1))
        if t == "text":
            _draw_text_box(page, o)
        elif t in ("image", "signature"):
            raw = _image_with_opacity(_decode_data_url(o.get("data")), opacity, float(o.get("rotate") or 0))
            page.insert_image(rect_from(o), stream=raw, keep_proportion=False)
        elif t in ("rect", "ellipse"):
            stroke = rgb(o["stroke"]) if o.get("stroke") else None
            fill = rgb(o["fill"]) if o.get("fill") else None
            width = float(o.get("width", 2)) if stroke else 0
            fn = page.draw_rect if t == "rect" else page.draw_oval
            fn(rect_from(o), color=stroke, fill=fill, width=width,
               stroke_opacity=opacity, fill_opacity=opacity)
        elif t in ("line", "arrow"):
            p1 = pymupdf.Point(o["x1"], o["y1"])
            p2 = pymupdf.Point(o["x2"], o["y2"])
            color = rgb(o.get("stroke"), (0, 0, 0))
            width = float(o.get("width", 2))
            if t == "arrow":
                _arrow(page, p1, p2, color, width, opacity)
            else:
                page.draw_line(p1, p2, color=color, width=width, stroke_opacity=opacity, lineCap=1)
        elif t == "ink":
            shape = page.new_shape()
            for path in o.get("paths", []):
                pts = [pymupdf.Point(x, y) for x, y in path]
                if len(pts) == 1:
                    pts.append(pts[0] + (0.1, 0.1))
                if len(pts) >= 2:
                    shape.draw_polyline(pts)
            shape.finish(color=rgb(o.get("stroke"), (0, 0, 0)), width=float(o.get("width", 2)),
                         closePath=False, lineCap=1, lineJoin=1, stroke_opacity=opacity)
            shape.commit()
        elif t == "highlight":
            a = page.add_highlight_annot(rect_from(o))
            a.set_colors(stroke=rgb(o.get("color"), (1, 0.9, 0)))
            a.set_opacity(float(o.get("opacity", 0.5)))
            a.update()
        elif t == "whiteout":
            page.draw_rect(rect_from(o), color=None, fill=rgb(o.get("color"), (1, 1, 1)), width=0)
        elif t == "note":
            a = page.add_text_annot((float(o["x"]), float(o["y"])), o.get("text", ""), icon="Note")
            a.set_colors(stroke=rgb(o.get("color"), (1, 0.8, 0)))
            a.set_info(title=o.get("author", "Not"))
            a.update()
        elif t == "link":
            r = rect_from(o)
            if o.get("url"):
                url = o["url"].strip()
                if not re.match(r"^(https?|mailto|tel):", url, re.I):
                    url = "https://" + url
                page.insert_link({"kind": pymupdf.LINK_URI, "from": r, "uri": url})
            elif o.get("target_page"):
                tp = int(o["target_page"]) - 1
                if 0 <= tp < doc.page_count:
                    page.insert_link({"kind": pymupdf.LINK_GOTO, "from": r, "page": tp,
                                      "to": pymupdf.Point(0, 0)})


@tool("edit", kinds=("pdf",))
def edit(ctx):
    ops = ctx.opt("ops") or []
    if not ops:
        raise UserError("Henüz bir değişiklik yapmadın.")
    doc = ctx.open_pdf(ctx.first)
    apply_ops_to_doc(doc, ops)
    if ctx.opt_bool("flatten", False):
        doc.bake()
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_duzenlenmis.pdf"))


@tool("sign", kinds=("pdf",))
def sign(ctx):
    cert = ctx.opt("certificate")
    if ctx.opt("ops"):
        out = edit(ctx)
    elif cert:
        out = ctx.pdf_path(ctx.first)
    else:
        raise UserError("Önce imzanı ekle.")
    if cert:
        from .security import digital_sign
        return digital_sign(ctx, out, cert)
    return out


def apply_ops_to_doc(doc, ops):
    resolver = FontResolver(doc)
    by_page: dict[int, list] = {}
    for o in ops:
        by_page.setdefault(int(o.get("page", 0)), []).append(o)
    for pno, page_ops in sorted(by_page.items()):
        if 0 <= pno < doc.page_count:
            apply_ops(doc, doc[pno], page_ops, resolver)


# ---------------- konumlandırma yardımcıları ----------------

def _pos(page_rect, pos: str, w: float, h: float, margin: float):
    """9 konum: top-left, top-center, ..., bottom-right. Sol-üst köşe ve taban çizgisi değil, kutu döner."""
    v, _, hz = pos.partition("-")
    if not hz:
        v, hz = "middle", v
    W, H = page_rect.width, page_rect.height
    x = {"left": margin, "center": (W - w) / 2, "right": W - margin - w}.get(hz, (W - w) / 2)
    y = {"top": margin, "middle": (H - h) / 2, "bottom": H - margin - h}.get(v, H - margin - h)
    return x, y


def _margin(ctx, default=28):
    m = ctx.opt("margin", "recommended")
    return {"small": 14, "recommended": 28, "big": 48}.get(m, None) or ctx.opt_num("margin", default)


def _fill_placeholders(tpl: str, n: int, total: int, fname: str) -> str:
    now = dt.datetime.now()
    return (tpl.replace("{n}", str(n)).replace("{total}", str(total))
            .replace("{date}", now.strftime("%d.%m.%Y")).replace("{time}", now.strftime("%H:%M"))
            .replace("{file}", stem(fname)))


@tool("page_numbers")
def page_numbers(ctx):
    doc = ctx.open_pdf(ctx.first)
    pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
    pos = ctx.opt("position", "bottom-center")
    margin = _margin(ctx)
    start = int(ctx.opt_num("start", 1))
    fmt = ctx.opt("format", "{n}") or "{n}"
    size = ctx.opt_num("size", 11)
    font = get_font(ctx.opt("family", "arial"), ctx.opt_bool("bold"), ctx.opt_bool("italic"))
    color = rgb(ctx.opt("color"), (0, 0, 0))
    total = len(pages) + start - 1 if ctx.opt_bool("count_selected", True) else doc.page_count
    mirror = ctx.opt_bool("mirror", False)
    for k, i in enumerate(pages):
        page = doc[i]
        normalize_rotation(page)
        text = _fill_placeholders(fmt, start + k, total, ctx.first.name)
        w = font.text_length(text, fontsize=size)
        p = pos
        if mirror and (start + k) % 2 == 0:
            p = p.replace("left", "__").replace("right", "left").replace("__", "right")
        x, y = _pos(page.rect, p, w, size, margin)
        tw = pymupdf.TextWriter(page.rect)
        tw.append((x, y + size * font.ascender / (font.ascender - font.descender)), text, font=font, fontsize=size)
        tw.write_text(page, color=color)
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_numarali.pdf"))


@tool("header_footer")
def header_footer(ctx):
    doc = ctx.open_pdf(ctx.first)
    pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
    margin = _margin(ctx, 24)
    size = ctx.opt_num("size", 10)
    font = get_font(ctx.opt("family", "arial"), ctx.opt_bool("bold"), ctx.opt_bool("italic"))
    color = rgb(ctx.opt("color"), (0.2, 0.2, 0.2))
    start = int(ctx.opt_num("start", 1))
    slots = {
        "top-left": ctx.opt("header_left", ""), "top-center": ctx.opt("header_center", ""),
        "top-right": ctx.opt("header_right", ""), "bottom-left": ctx.opt("footer_left", ""),
        "bottom-center": ctx.opt("footer_center", ""), "bottom-right": ctx.opt("footer_right", ""),
    }
    if not any(slots.values()):
        raise UserError("Üst veya alt bilgi için en az bir metin yaz.")
    line = ctx.opt_bool("line", False)
    for k, i in enumerate(pages):
        page = doc[i]
        normalize_rotation(page)
        tw = pymupdf.TextWriter(page.rect)
        for pos, tpl in slots.items():
            if not tpl:
                continue
            text = _fill_placeholders(tpl, start + k, doc.page_count, ctx.first.name)
            w = font.text_length(text, fontsize=size)
            x, y = _pos(page.rect, pos, w, size, margin)
            tw.append((x, y + size * 0.8), text, font=font, fontsize=size)
        tw.write_text(page, color=color)
        if line:
            W, H = page.rect.width, page.rect.height
            if any(slots[p] for p in ("top-left", "top-center", "top-right")):
                page.draw_line((margin, margin + size + 4), (W - margin, margin + size + 4), color=color, width=0.5)
            if any(slots[p] for p in ("bottom-left", "bottom-center", "bottom-right")):
                page.draw_line((margin, H - margin - size - 4), (W - margin, H - margin - size - 4), color=color, width=0.5)
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_ustaltbilgi.pdf"))


@tool("watermark")
def watermark(ctx):
    paths = []
    kind = ctx.opt("kind", "text")
    opacity = ctx.opt_num("opacity", 0.3)
    angle = ctx.opt_num("rotation", 45)
    pos = ctx.opt("position", "middle-center")
    overlay = ctx.opt("layer", "over") != "under"
    tile = pos == "tile"
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
        if kind == "image":
            raw = _decode_data_url(ctx.opt("image"))
            img = _image_with_opacity(raw, opacity, angle)
            ip = pymupdf.open(stream=img)
            iw, ih = ip[0].rect.width, ip[0].rect.height
            ip.close()
            scale_pct = ctx.opt_num("scale", 40) / 100
            for i in pages:
                page = doc[i]
                normalize_rotation(page)
                W = page.rect.width
                w = W * scale_pct
                h = w * ih / iw
                if tile:
                    for y in _frange(20, page.rect.height, h * 1.6):
                        for x in _frange(20, W, w * 1.5):
                            page.insert_image(pymupdf.Rect(x, y, x + w, y + h), stream=img, overlay=overlay)
                else:
                    x, y = _pos(page.rect, pos, w, h, 36)
                    page.insert_image(pymupdf.Rect(x, y, x + w, y + h), stream=img, overlay=overlay)
        else:
            text = ctx.opt("text", "").strip()
            if not text:
                raise UserError("Filigran metnini yaz.")
            size = ctx.opt_num("size", 48)
            font = get_font(ctx.opt("family", "arial"), ctx.opt_bool("bold", True), ctx.opt_bool("italic"))
            color = rgb(ctx.opt("color"), (0.8, 0.1, 0.1))
            for i in pages:
                page = doc[i]
                normalize_rotation(page)
                w = font.text_length(text, fontsize=size)
                spots = []
                if tile:
                    for y in _frange(size * 2, page.rect.height, size * 4):
                        for x in _frange(0, page.rect.width, w + size * 2):
                            spots.append((x + w / 2, y))
                else:
                    x, y = _pos(page.rect, pos, w, size, 36)
                    spots.append((x + w / 2, y + size / 2))
                for cx, cy in spots:
                    tw = pymupdf.TextWriter(page.rect)
                    tw.append((cx - w / 2, cy + size * 0.35), text, font=font, fontsize=size)
                    tw.write_text(page, color=color, opacity=opacity, overlay=overlay,
                                  morph=(pymupdf.Point(cx, cy), pymupdf.Matrix(-angle)))
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_filigranli.pdf")))
    ctx.result_name = "filigranli.zip"
    return paths


def _frange(a, b, step):
    v = a
    while v < b:
        yield v
        v += max(step, 1)


@tool("crop")
def crop(ctx):
    doc = ctx.open_pdf(ctx.first)
    mode = ctx.opt("mode", "manual")
    pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
    if mode == "manual" and ctx.opt("apply", "all") == "current":
        pages = [int(ctx.opt_num("page", 0))]
    pad = ctx.opt_num("padding", 10)
    for i in pages:
        page = doc[i]
        normalize_rotation(page)
        if mode == "auto":
            box = pymupdf.Rect()
            for b in page.get_text("blocks"):
                box |= pymupdf.Rect(b[:4])
            for info in page.get_image_info():
                box |= pymupdf.Rect(info["bbox"])
            for d in page.get_drawings():
                r = d["rect"]
                if r.width < page.rect.width * 0.98 or r.height < page.rect.height * 0.98:
                    box |= r
            if box.is_empty:
                continue
            target = (box + (-pad, -pad, pad, pad)) & page.rect
        else:
            r = ctx.opt("rect")
            if not r:
                raise UserError("Kırpılacak alanı sayfa üzerinde seç.")
            target = rect_from(r) & page.rect
        if target.is_empty or target.width < 10 or target.height < 10:
            continue
        # set_cropbox mediabox koordinatı bekler; mevcut kırpma kutusunun ofsetini ekle
        cb = page.cropbox
        page.set_cropbox(pymupdf.Rect(target.x0 + cb.x0, target.y0 + cb.y0,
                                      target.x1 + cb.x0, target.y1 + cb.y0) & page.mediabox)
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_kirpilmis.pdf"))


REDACT_PRESETS = {
    "email": r"[\w.+-]+@[\w-]+(\.[\w-]+)+",
    "phone": r"(\+?90[\s-]?)?\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\+?\d{1,3}[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2,4}[\s-]?\d{0,4}",
    "tckn": r"(?<!\d)[1-9]\d{10}(?!\d)",
    "iban": r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b",
    "card": r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)",
    "url": r"https?://\S+|www\.\S+",
    "date": r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b",
}


def redaction_regexes(ctx_or_opts) -> list:
    opts = ctx_or_opts if isinstance(ctx_or_opts, dict) else ctx_or_opts.options
    out = []
    for term in opts.get("terms") or []:
        if term and term.strip():
            out.append(build_regex(term.strip(), bool(opts.get("case")), bool(opts.get("whole_word"))))
    for key in opts.get("presets") or []:
        if key in REDACT_PRESETS:
            out.append(re.compile(REDACT_PRESETS[key]))
    return out


@tool("redact")
def redact(ctx):
    doc = ctx.open_pdf(ctx.first)
    color = rgb(ctx.opt("color"), (0, 0, 0))
    areas = ctx.opt("areas") or []
    rx = redaction_regexes(ctx)
    if not areas and not rx:
        raise UserError("Karartılacak alanları seç ya da aranacak metin ekle.")
    count = 0
    touched = set()
    for a in areas:
        pno = int(a.get("page", 0))
        if 0 <= pno < doc.page_count:
            page = doc[pno]
            if pno not in touched:
                normalize_rotation(page)
                touched.add(pno)
            page.add_redact_annot(rect_from(a), fill=color)
            count += 1
    for page in doc:
        if rx and page.number not in touched:
            normalize_rotation(page)
            touched.add(page.number)
        for r in rx:
            for hit in find_rects(page, r, visual=False):
                page.add_redact_annot(pymupdf.Rect(hit["rect"]), fill=color)
                count += 1
    for pno in touched:
        doc[pno].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
    if ctx.opt_bool("clean_metadata", True):
        doc.set_metadata({})
        try:
            doc.del_xml_metadata()
        except Exception:
            pass
    if count == 0:
        raise UserError("Karartılacak bir şey bulunamadı.")
    ctx.extra["redacted"] = count
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_karartilmis.pdf"), garbage=4, clean=True)


@tool("metadata")
def metadata(ctx):
    doc = ctx.open_pdf(ctx.first)
    if ctx.opt_bool("clear", False):
        doc.set_metadata({})
        try:
            doc.del_xml_metadata()
        except Exception:
            pass
    else:
        meta = dict(doc.metadata or {})
        for k in ("title", "author", "subject", "keywords", "creator", "producer"):
            v = ctx.opt(k)
            if v is not None:
                meta[k] = str(v)
        meta.pop("format", None)
        meta.pop("encryption", None)
        doc.set_metadata(meta)
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}.pdf"))
