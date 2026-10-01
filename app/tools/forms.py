"""PDF formları: mevcut alanları okuma/doldurma, otomatik alan algılama, alan oluşturma."""
from __future__ import annotations

import re

import pymupdf

from ..fonts import get_font
from ..util import UserError, normalize_rotation, rect_from, save_pdf, stem, to_visual
from . import tool

TYPE_NAMES = {
    pymupdf.PDF_WIDGET_TYPE_TEXT: "text",
    pymupdf.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
    pymupdf.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
    pymupdf.PDF_WIDGET_TYPE_COMBOBOX: "combo",
    pymupdf.PDF_WIDGET_TYPE_LISTBOX: "list",
    pymupdf.PDF_WIDGET_TYPE_SIGNATURE: "signature",
    pymupdf.PDF_WIDGET_TYPE_BUTTON: "button",
}
TYPE_CODES = {v: k for k, v in TYPE_NAMES.items()}


# ======================= mevcut alanlar =======================

def list_fields(doc: pymupdf.Document) -> list[dict]:
    out = []
    for page in doc:
        for w in page.widgets() or []:
            kind = TYPE_NAMES.get(w.field_type, "text")
            val = w.field_value
            if kind in ("checkbox", "radio"):
                on = w.on_state() or "Yes"
                val = val not in (False, None, "", "Off") and (val is True or str(val) == str(on) or val == "Yes")
            out.append({
                "xref": w.xref,
                "page": page.number,
                "type": kind,
                "name": w.field_name or "",
                "label": w.field_label or "",
                "value": val,
                "rect": [round(v, 2) for v in to_visual(page, w.rect)],
                "options": list(w.choice_values or []) if kind in ("combo", "list") else [],
                "multiline": bool(w.field_flags & pymupdf.PDF_TX_FIELD_IS_MULTILINE) if kind == "text" else False,
                "readonly": bool(w.field_flags & pymupdf.PDF_FIELD_IS_READ_ONLY),
                "required": bool(w.field_flags & pymupdf.PDF_FIELD_IS_REQUIRED),
                "maxlen": w.text_maxlen or 0,
                "fontsize": w.text_fontsize or 0,
            })
    return out


# ======================= otomatik algılama =======================

CHECK_GLYPHS = set("☐□❑❒▢◻⬜○◯")
WINGDINGS_BOX = set("oqnp¨")
UNDERSCORE_MIN = 3
DOTS_MIN = 6


def _words(page):
    return [(pymupdf.Rect(w[:4]), w[4]) for w in page.get_text("words")]


def _phrase_left(words, field: pymupdf.Rect) -> str:
    cy0, cy1 = field.y0, field.y1
    row = []
    for r, t in words:
        ov = min(r.y1, cy1) - max(r.y0, cy0)
        if ov > 0.4 * min(r.height, field.height) and r.x1 <= field.x0 + 3:
            row.append((r, t))
    row.sort(key=lambda it: it[0].x0, reverse=True)
    parts, last_x0 = [], field.x0
    for r, t in row:
        if last_x0 - r.x1 > (60 if not parts else 14):  # etiketle alan arası daha geniş olabilir
            break
        parts.append(t)
        last_x0 = r.x0
    return " ".join(reversed(parts))


def _phrase_above(words, field: pymupdf.Rect) -> str:
    cand = [(r, t) for r, t in words
            if field.y0 - 22 <= r.y1 <= field.y0 + 2 and r.x1 > field.x0 - 2 and r.x0 < field.x1 + 2]
    cand.sort(key=lambda it: (round(it[0].y0), it[0].x0))
    return " ".join(t for _, t in cand[:6])


def _phrase_right(words, field: pymupdf.Rect) -> str:
    row = [(r, t) for r, t in words
           if min(r.y1, field.y1) - max(r.y0, field.y0) > 0.3 * field.height and r.x0 >= field.x1 - 2]
    row.sort(key=lambda it: it[0].x0)
    parts, last = [], field.x1
    for r, t in row:
        if r.x0 - last > 14:
            break
        parts.append(t)
        last = r.x1
    return " ".join(parts)


def _clean_label(s: str) -> str:
    s = (s or "").replace("\xad", "-")  # yumuşak tire
    s = re.sub(r"[_…]+|\.{2,}", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" :;-–=*\t")
    return s[:48]


def _guess_type(label: str, default: str) -> str:
    l = label.replace("İ", "i").replace("I", "ı").lower()
    if default == "checkbox":
        return "checkbox"
    if re.search(r"\bimza|signature|sign\b", l):
        return "signature"
    return default


def _covered(r: pymupdf.Rect, words) -> bool:
    for wr, _ in words:
        inter = wr & r
        if not inter.is_empty and inter.get_area() > 0.25 * wr.get_area():
            return True
    return False


def detect_page(page: pymupdf.Page) -> list[dict]:
    """Bir sayfadaki olası form alanlarını (döndürülmemiş koordinatlarda) bulur."""
    words = _words(page)
    existing = [w.rect for w in page.widgets() or []]
    W, H = page.rect.width, page.rect.height
    cands: list[tuple[int, pymupdf.Rect, str, str]] = []  # (öncelik, rect, tür, etiket)

    # 1) Alt çizgi ve nokta dizileri:  "Adı Soyadı: ________"  /  "Tarih ........"
    raw = page.get_text("rawdict")
    for b in raw["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                chars = span["chars"]
                fs = span["size"]
                oy = span["origin"][1]
                i = 0
                while i < len(chars):
                    c = chars[i]["c"]
                    if c in "_.…":
                        j = i
                        while j < len(chars) and chars[j]["c"] == c:
                            j += 1
                        n = j - i
                        if (c == "_" and n >= UNDERSCORE_MIN) or (c in ".…" and n >= (DOTS_MIN if c == "." else 2)):
                            x0 = chars[i]["bbox"][0]
                            x1 = chars[j - 1]["bbox"][2]
                            h = max(fs * 1.25, 12)
                            r = pymupdf.Rect(x0, oy - h + 2, x1, oy + 2)
                            cands.append((0, r, "text", ""))
                        i = j
                        continue
                    # kutucuk karakterleri
                    font = span["font"].lower()
                    if c in CHECK_GLYPHS or ("wingding" in font and c in WINGDINGS_BOX):
                        r = pymupdf.Rect(chars[i]["bbox"])
                        side = min(r.width, r.height, fs)
                        cx, cy = (r.x0 + r.x1) / 2, oy - fs * 0.35
                        cands.append((0, pymupdf.Rect(cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2),
                                      "checkbox", ""))
                    i += 1
            # [ ] ve ( ) kalıpları
            lchars = [ch for s in line["spans"] for ch in s["chars"]]
            ltext = "".join(ch["c"] for ch in lchars)
            for m in re.finditer(r"\[\s{0,3}\]|\(\s{1,3}\)", ltext):
                r = pymupdf.Rect()
                for ch in lchars[m.start():m.end()]:
                    r |= pymupdf.Rect(ch["bbox"])
                side = min(r.width, r.height)
                cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
                cands.append((0, pymupdf.Rect(cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2),
                              "checkbox", ""))

    # 2) Çizimler: yatay çizgiler, kareler, kutular
    hlines, boxes = [], []
    for d in page.get_drawings():
        for item in d["items"]:
            op = item[0]
            if op == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 1.2 and abs(p1.x - p2.x) > 28:
                    hlines.append(pymupdf.Rect(min(p1.x, p2.x), p1.y, max(p1.x, p2.x), p1.y))
            elif op in ("re", "qu"):
                r = item[1].rect if op == "qu" else pymupdf.Rect(item[1])
                if r.height < 2.5 and r.width > 28:
                    hlines.append(pymupdf.Rect(r.x0, r.y1, r.x1, r.y1))
                elif r.width >= 5 and r.height >= 5:
                    boxes.append(r)

    # 2a) kareler -> onay kutusu
    rest = []
    for r in boxes:
        if 5 <= r.width <= 22 and abs(r.width - r.height) <= 2.5:
            if not _covered(r, words):
                cands.append((1, r, "checkbox", ""))
        else:
            rest.append(r)
    # 2b) boş kutular -> metin alanı (başka kutu içermeyenler)
    for r in rest:
        if r.width < 36 or not (11 <= r.height <= 160) or r.get_area() > 0.25 * W * H:
            continue
        if any(o != r and r.contains(o) and o.get_area() < r.get_area() * 0.95 for o in rest):
            continue
        inner = r + (1.5, 1.5, -1.5, -1.5)
        if _covered(inner, words):
            # hücrede etiket varsa sağındaki boşluğu kullan
            row_words = [wr for wr, _ in words if inner.intersects(wr)]
            right = max(wr.x1 for wr in row_words)
            if r.x1 - right > 50 and all(wr.y1 <= r.y1 + 1 for wr in row_words):
                cands.append((3, pymupdf.Rect(right + 4, r.y0 + 1.5, r.x1 - 1.5, r.y1 - 1.5), "text", ""))
            continue
        cands.append((2, inner, "text", ""))
    # 2c) yatay çizgiler -> üstünde metin alanı
    for ln in hlines:
        if any(abs(ln.y0 - b.y0) < 1.5 or abs(ln.y0 - b.y1) < 1.5 for b in rest
               if b.x0 - 2 <= ln.x0 and ln.x1 <= b.x1 + 2):
            continue
        h = 16
        for wr, _ in words:  # üstteki ilk metne kadar yükseklik
            if wr.y1 <= ln.y0 - 1 and wr.x1 > ln.x0 and wr.x0 < ln.x1:
                h = min(h, ln.y0 - wr.y1 - 1)
        if h < 9:
            continue
        r = pymupdf.Rect(ln.x0, ln.y0 - h, ln.x1, ln.y0 - 0.5)
        if _covered(r, words):
            continue
        cands.append((1, r, "text", ""))

    # 3) "Etiket:" ve sağı boş satırlar
    lines = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            t = "".join(s["text"] for s in line["spans"]).strip()
            if t:
                lines.append((pymupdf.Rect(line["bbox"]), t))
    content_right = max((r.x1 for r, _ in words), default=W - 40)
    content_right = max(content_right, W * 0.6)
    for r, t in lines:
        if not t.endswith(":") or len(t) > 60:
            continue
        right_words = [wr for wr, _ in words if wr.x0 > r.x1 + 2 and
                       min(wr.y1, r.y1) - max(wr.y0, r.y0) > 0.3 * r.height]
        x_end = min([wr.x0 - 4 for wr in right_words], default=content_right)
        if x_end - (r.x1 + 4) < 60:
            continue
        cands.append((4, pymupdf.Rect(r.x1 + 4, r.y0 - 1, x_end, r.y1 + 1), "text", ""))

    # Tekilleştirme ve etiketleme
    cands.sort(key=lambda c: (c[0], c[1].y0, c[1].x0))
    accepted: list[dict] = []
    for prio, r, kind, _ in cands:
        if r.is_empty or r.width < 4:
            continue
        clash = False
        for other in [a["_r"] for a in accepted] + existing:
            inter = (r & other).get_area()
            if inter > 0.3 * min(r.get_area(), other.get_area()):
                clash = True
                break
        if clash:
            continue
        if kind == "checkbox":
            label = _phrase_right(words, r) or _phrase_left(words, r)
        else:
            label = _phrase_left(words, r) or _phrase_above(words, r)
        label = _clean_label(label)
        kind = _guess_type(label, kind)
        multiline = kind == "text" and r.height > 34
        accepted.append({"_r": r, "type": kind, "label": label, "multiline": multiline})
    return accepted


def _field_name(label: str, used: set, n: int) -> str:
    base = re.sub(r"\s+", "_", label.strip())[:40] or f"alan_{n}"
    name, k = base, 2
    while name in used:
        name = f"{base}_{k}"
        k += 1
    used.add(name)
    return name


def detect_fields(doc: pymupdf.Document, pages=None) -> list[dict]:
    used = {w.field_name for p in doc for w in (p.widgets() or [])}
    out = []
    n = 0
    for page in doc:
        if pages is not None and page.number not in pages:
            continue
        for c in detect_page(page):
            n += 1
            out.append({
                "page": page.number,
                "rect": [round(v, 2) for v in to_visual(page, c["_r"])],
                "type": c["type"],
                "label": c["label"],
                "name": _field_name(c["label"], used, n),
                "multiline": c["multiline"],
            })
    return out


# ======================= doldurma / oluşturma =======================

def _set_value(w: pymupdf.Widget, value):
    kind = TYPE_NAMES.get(w.field_type)
    if kind in ("checkbox", "radio"):
        on = w.on_state() or "Yes"
        w.field_value = on if value in (True, "true", "on", "Yes", 1, "1") else "Off"
        if kind == "radio" and value in (True, "true", "on", "Yes", 1, "1"):
            w.field_value = True
    elif kind in ("text", "combo", "list"):
        w.field_value = "" if value is None else str(value)
    else:
        return False
    return True


def _flatten_text_widgets(page: pymupdf.Page):
    """Metin alanlarını Türkçe destekli yazı tipiyle sayfaya basar ve alanı kaldırır."""
    for w in list(page.widgets() or []):
        if w.field_type not in (pymupdf.PDF_WIDGET_TYPE_TEXT, pymupdf.PDF_WIDGET_TYPE_COMBOBOX):
            continue
        val = str(w.field_value or "")
        r = pymupdf.Rect(w.rect)
        color = w.text_color or (0, 0, 0)
        if val.strip():
            font = get_font("arial")
            multiline = bool(w.field_flags & pymupdf.PDF_TX_FIELD_IS_MULTILINE)
            size = w.text_fontsize or min(11, max(6, r.height * 0.7))
            lines = val.split("\n") if multiline else [val.replace("\n", " ")]
            if not w.text_fontsize:
                widest = max(font.text_length(l, fontsize=1) for l in lines) or 1
                size = min(size, (r.width - 4) / widest)
                if multiline:
                    size = min(size, (r.height - 2) / (1.2 * len(lines)))
            size = max(size, 4)
            tw = pymupdf.TextWriter(page.rect)
            if multiline:
                y = r.y0 + 2 + size * font.ascender
                for line in lines:
                    tw.append((r.x0 + 2, y), line, font=font, fontsize=size)
                    y += size * 1.2
            else:
                y = r.y0 + (r.height + size * (font.ascender + font.descender)) / 2
                tw.append((r.x0 + 2, y), lines[0], font=font, fontsize=size)
            tw.write_text(page, color=color)
        page.delete_widget(w)


@tool("form")
def form(ctx):
    doc = ctx.open_pdf(ctx.first)
    values = {int(v["xref"]): v.get("value") for v in (ctx.opt("values") or []) if "xref" in v}
    remove = {int(x) for x in (ctx.opt("remove") or [])}
    new_fields = ctx.opt("new_fields") or []
    flatten = ctx.opt_bool("flatten", False)
    changed = 0
    # mevcut alanlar
    for page in doc:
        for w in list(page.widgets() or []):
            if w.xref in remove:
                page.delete_widget(w)
                continue
            if w.xref in values and _set_value(w, values[w.xref]):
                w.update()
                changed += 1
    # yeni alanlar
    used = {w.field_name for p in doc for w in (p.widgets() or [])}
    normalized = set()
    for i, f in enumerate(new_fields):
        pno = int(f.get("page", 0))
        if not 0 <= pno < doc.page_count:
            continue
        page = doc[pno]
        if pno not in normalized:
            normalize_rotation(page)
            normalized.add(pno)
        kind = f.get("type", "text")
        w = pymupdf.Widget()
        w.field_type = TYPE_CODES.get(kind, pymupdf.PDF_WIDGET_TYPE_TEXT)
        name = (f.get("name") or "").strip() or f"alan_{i + 1}"
        if name in used and kind != "radio":
            name = _field_name(name, used, i + 1)
        used.add(name)
        w.field_name = name
        if f.get("label"):
            w.field_label = f["label"]
        w.rect = rect_from(f["rect"])
        w.text_font = "Helv"
        w.text_fontsize = float(f.get("fontsize") or 0)
        w.border_width = 0.6 if f.get("border", True) else 0
        w.border_color = (0.55, 0.6, 0.7) if f.get("border", True) else None
        w.fill_color = None
        flags = 0
        if kind == "text" and f.get("multiline"):
            flags |= pymupdf.PDF_TX_FIELD_IS_MULTILINE
        if f.get("required"):
            flags |= pymupdf.PDF_FIELD_IS_REQUIRED
        w.field_flags = flags
        if kind in ("combo", "list"):
            opts = [o.strip() for o in (f.get("options") or []) if str(o).strip()]
            w.choice_values = opts or ["Seçenek 1", "Seçenek 2"]
        val = f.get("value")
        if kind in ("checkbox", "radio"):
            w.field_value = bool(val)
        elif kind != "signature" and val not in (None, ""):
            w.field_value = str(val)
        page.add_widget(w)
        changed += 1
    ops = ctx.opt("ops") or []
    if ops:  # imza alanlarına yerleştirilen imza görselleri vb.
        from .edit import apply_ops_to_doc
        apply_ops_to_doc(doc, ops)
        changed += len(ops)
    if flatten:
        for page in doc:
            for w in list(page.widgets() or []):  # boş imza alanları iz bırakmasın
                if w.field_type == pymupdf.PDF_WIDGET_TYPE_SIGNATURE:
                    page.delete_widget(w)
            _flatten_text_widgets(page)
        doc.bake(annots=False, widgets=True)
    else:
        try:
            doc.need_appearances(True)  # görüntüleyici Türkçe karakterleri yeniden çizsin
        except Exception:
            pass
    if changed == 0 and not remove and not flatten:
        raise UserError("Doldurulacak ya da eklenecek alan yok.")
    suffix = "doldurulmus" if values or flatten else "form"
    return save_pdf(doc, ctx.out(f"{stem(ctx.first.name)}_{suffix}.pdf"))

