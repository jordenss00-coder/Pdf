"""Mevcut metni düzeltme ve bul-değiştir.

Yöntem: düzenlenen satırın ortasından geçen ince bir şerit redaksiyonla yalnızca
o satırın karakterleri silinir (görseller ve çizimler korunur), ardından yeni
metin aynı taban çizgisine, aynı boyut/renk ve mümkünse aynı yazı tipiyle yazılır.
"""
from __future__ import annotations

import re

import pymupdf

from ..fonts import FontResolver, css_family, guess_family, style_from
from ..util import UserError, int_to_hex, normalize_rotation, point_to_visual, rgb, save_pdf, stem, to_visual
from . import tool

NBSP = "\xa0"


def _clean(t: str) -> str:
    return t.replace(NBSP, " ")


def _dominant(spans):
    return max(spans, key=lambda s: len(s["text"].strip()) or 0.1)


def extract_lines(page: pymupdf.Page, visual: bool = True) -> list[dict]:
    """Sayfadaki metin satırlarını düzenlenebilir biçimde döndürür."""
    out = []
    data = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_PRESERVE_LIGATURES)
    for bi, b in enumerate(data["blocks"]):
        if b.get("type") != 0:
            continue
        for li, line in enumerate(b["lines"]):
            spans = [s for s in line["spans"] if s["text"]]
            if not spans or not "".join(s["text"] for s in spans).strip():
                continue
            d = _dominant(spans)
            bbox = pymupdf.Rect(line["bbox"])
            origin = pymupdf.Point(spans[0]["origin"])
            dx, dy = line["dir"]
            if visual and page.rotation:
                bbox = to_visual(page, bbox)
                origin = point_to_visual(page, origin)
                m = page.rotation_matrix
                dx, dy = dx * m.a + dy * m.c, dx * m.b + dy * m.d
            fam = guess_family(d["font"], d["flags"])
            bold, italic = style_from(d["font"], d["flags"])
            out.append({
                "id": f"{bi}-{li}",
                "bbox": [round(v, 2) for v in bbox],
                "origin": [round(origin.x, 2), round(origin.y, 2)],
                "text": _clean("".join(s["text"] for s in spans)),
                "size": round(d["size"], 2),
                "font": d["font"],
                "flags": d["flags"],
                "family": fam,
                "css": css_family(fam),
                "bold": bold,
                "italic": italic,
                "color": int_to_hex(d["color"]),
                "editable": abs(dy) < 0.01 and dx > 0,
                "_spans": spans,
                "_line": line,
            })
    return out


def public_lines(page: pymupdf.Page) -> list[dict]:
    return [{k: v for k, v in l.items() if not k.startswith("_")} for l in extract_lines(page)]


def _band(span) -> pymupdf.Rect:
    """Bir span'in yalnızca kendi karakterlerine değen ince yatay şerit."""
    x0, _, x1, _ = span["bbox"]
    oy = span["origin"][1]
    s = span["size"]
    return pymupdf.Rect(x0 + 0.2, oy - 0.5 * s, x1 - 0.2, oy - 0.22 * s)


def _redact_line(page, line):
    for s in line["_spans"]:
        if s["text"].strip():
            page.add_redact_annot(_band(s), fill=False)


def _apply(page):
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)


def _write(page, origin, text, font, size, color, opacity=1.0):
    if not text:
        return
    tw = pymupdf.TextWriter(page.rect)
    tw.append(origin, text, font=font, fontsize=size)
    tw.write_text(page, color=color, opacity=opacity)


def _match_line(lines, op):
    lid = op.get("id")
    orig = _clean(op.get("original", ""))
    for l in lines:
        if l["id"] == lid and (not orig or l["text"] == orig):
            return l
    # Kimlik eşleşmezse: aynı metin + en yakın konum
    want = pymupdf.Rect(op.get("bbox") or (0, 0, 0, 0))
    best, score = None, 0
    for l in lines:
        r = pymupdf.Rect(l["bbox"])
        inter = (r & want).get_area()
        union = r.get_area() + want.get_area() - inter
        iou = inter / union if union else 0
        if orig and l["text"] != orig:
            iou *= 0.5
        if iou > score:
            best, score = l, iou
    return best if score > 0.3 else None


def apply_text_edits(doc, page, ops, resolver: FontResolver) -> int:
    """ops: [{id, original, bbox, text, size?, color?, family?, bold?, italic?, dx?, dy?, delete?}]
    Sayfa döndürmesi önceden normalize edilmiş olmalı."""
    if not ops:
        return 0
    lines = extract_lines(page, visual=False)
    plan = []
    for op in ops:
        line = _match_line(lines, op)
        if line is None:
            continue
        plan.append((line, op))
        _redact_line(page, line)
    if not plan:
        return 0
    _apply(page)
    for line, op in plan:
        if op.get("delete"):
            continue
        text = op.get("text", line["text"]).replace("\r", "")
        size = float(op.get("size") or line["size"])
        fam = op.get("family") or "auto"
        bold = op.get("bold")
        italic = op.get("italic")
        if fam == "auto" and (bold is not None and bold != line["bold"] or
                              italic is not None and italic != line["italic"]):
            fam = line["family"]  # stil değiştiyse orijinal gömülü yazı tipi uymaz
        color = rgb(op.get("color") or line["color"])
        dx, dy = float(op.get("dx") or 0), float(op.get("dy") or 0)
        x, y = line["origin"]
        font = resolver.resolve(page, line["font"], line["flags"], text, family=fam,
                                bold=bold, italic=italic)
        for k, part in enumerate(text.split("\n")):
            _write(page, (x + dx, y + dy + k * size * 1.2), part, font, size, color)
    return len(plan)


# ---------------- arama ----------------

def find_rects(page: pymupdf.Page, regex: re.Pattern, visual: bool = True) -> list[dict]:
    """Regex eşleşmelerinin karakter düzeyindeki dikdörtgenlerini bulur."""
    hits = []
    raw = page.get_text("rawdict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_PRESERVE_LIGATURES)
    for b in raw["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            chars = [c for s in line["spans"] for c in s["chars"]]
            text = "".join(_clean(c["c"]) for c in chars)
            for m in regex.finditer(text):
                if m.end() <= m.start():
                    continue
                r = pymupdf.Rect()
                for c in chars[m.start():m.end()]:
                    r |= pymupdf.Rect(c["bbox"])
                if r.is_empty:
                    continue
                if visual:
                    r = to_visual(page, r)
                hits.append({"rect": [round(v, 2) for v in r], "text": m.group(0)})
    return hits


def build_regex(find: str, case: bool = False, whole: bool = False, is_regex: bool = False) -> re.Pattern:
    if not find:
        raise UserError("Aranacak metni yaz.")
    pat = find if is_regex else re.escape(find)
    if whole:
        pat = rf"(?<!\w){pat}(?!\w)"
    try:
        return re.compile(pat, 0 if case else re.IGNORECASE)
    except re.error as e:
        raise UserError(f"Geçersiz arama ifadesi: {e}") from e


# ---------------- bul ve değiştir ----------------

def _replace_in_page(doc, page, regex, repl, resolver) -> int:
    lines = extract_lines(page, visual=False)
    jobs = []
    count = 0
    for line in lines:
        if not line["editable"]:
            continue
        spans = line["_spans"]
        full = "".join(_clean(s["text"]) for s in spans)
        matches = list(regex.finditer(full))
        if not matches:
            continue
        # eşleşmeler span sınırlarını aşıyor mu?
        bounds, pos = [], 0
        for s in spans:
            bounds.append((pos, pos + len(s["text"])))
            pos += len(s["text"])
        crosses = any(not any(a <= m.start() and m.end() <= b for a, b in bounds) for m in matches)
        count += len(matches)
        if crosses:
            # Satırı tek parça olarak baskın stille yeniden yaz
            jobs.append(("line", line, regex.sub(lambda _m: repl, full)))
        else:
            new_spans = []
            for (a, b), s in zip(bounds, spans):
                seg = _clean(s["text"])
                new = regex.sub(lambda _m: repl, seg) if any(a <= m.start() and m.end() <= b for m in matches) else seg
                new_spans.append((s, new))
            jobs.append(("spans", line, new_spans))
    if not jobs:
        return 0
    for kind, line, payload in jobs:
        if kind == "line":
            _redact_line(page, line)
        else:
            first = next(i for i, (s, new) in enumerate(payload) if _clean(s["text"]) != new)
            for s, _new in payload[first:]:
                if s["text"].strip():
                    page.add_redact_annot(_band(s), fill=False)
    _apply(page)
    for kind, line, payload in jobs:
        if kind == "line":
            font = resolver.resolve(page, line["font"], line["flags"], payload)
            _write(page, line["origin"], payload, font, line["size"], rgb(line["color"]))
            continue
        first = next(i for i, (s, new) in enumerate(payload) if _clean(s["text"]) != new)
        shift = 0.0
        for s, new in payload[first:]:
            font = resolver.resolve(page, s["font"], s["flags"], new)
            ox, oy = s["origin"]
            old_w = s["bbox"][2] - ox
            new_w = font.text_length(new, fontsize=s["size"])
            c = s["color"]
            color = ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255
            _write(page, (ox + shift, oy), new, font, s["size"], color)
            shift += new_w - old_w
    return count


@tool("find_replace")
def find_replace(ctx):
    pairs = ctx.opt("pairs") or [{"find": ctx.opt("find", ""), "replace": ctx.opt("replace", "")}]
    pairs = [p for p in pairs if p.get("find")]
    if not pairs:
        raise UserError("Aranacak metni yaz.")
    case = ctx.opt_bool("case", False)
    whole = ctx.opt_bool("whole_word", False)
    paths, total = [], 0
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        resolver = FontResolver(doc)
        for page in doc:
            normalize_rotation(page)
            for p in pairs:
                rx = build_regex(p["find"], case, whole, ctx.opt_bool("regex", False))
                total += _replace_in_page(doc, page, rx, p.get("replace", ""), resolver)
        paths.append(save_pdf(doc, ctx.out(f"{stem(e.name)}_duzeltilmis.pdf")))
    if total == 0:
        raise UserError("Aranan metin belgede bulunamadı. Taranmış bir belgeyse önce OCR uygula.")
    ctx.extra["replaced"] = total
    ctx.result_name = "duzeltilmis.zip"
    return paths

