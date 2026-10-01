"""Yapay zekâ araçları (Claude API): PDF özetleme ve düzeni koruyarak çeviri."""
from __future__ import annotations

import base64
import html
import json
import os
import re
from pathlib import Path

import pymupdf

from .. import store
from ..util import UserError, int_to_hex, save_pdf, stem
from . import tool
from ..settings import settings

MODEL = os.getenv("ANTHROPIC_MODEL", "")
CONFIG = Path(os.getenv("PDF_CONFIG_FILE", str(store.ROOT / "config.json")))


# ---------------- ayarlar ----------------

def load_config() -> dict:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def ai_configured() -> bool:
    return not settings.hosted and bool(MODEL and (load_config().get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")))


def _client():
    import anthropic
    key = load_config().get("anthropic_api_key")
    try:
        return anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
    except Exception as e:
        raise UserError("Yapay zekâ araçları için Ayarlar'dan Anthropic API anahtarını gir.") from e


def _call(**kwargs):
    """Claude'u çağırır; reddetme durumunda sunucu taraflı yedek modeli kullanır."""
    import anthropic
    if settings.hosted:
        raise UserError("Yapay zekâ araçları bu sunucu sürümünde kapalı.")
    if not MODEL:
        raise UserError("Sunucuyu başlatmadan önce ANTHROPIC_MODEL ortam değişkenine erişimin olan model adını yaz.")
    client = _client()
    try:
        resp = client.messages.create(
            model=MODEL,
            **kwargs,
        )
    except anthropic.AuthenticationError as e:
        raise UserError("API anahtarı geçersiz. Ayarlar'dan kontrol et.") from e
    except anthropic.PermissionDeniedError as e:
        raise UserError("API anahtarının bu modele erişim izni yok.") from e
    except anthropic.RateLimitError as e:
        raise UserError("API kullanım sınırına ulaşıldı. Biraz sonra tekrar dene.") from e
    except anthropic.BadRequestError as e:
        raise UserError(f"İstek reddedildi: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise UserError("Claude API'ye bağlanılamadı. İnternet bağlantını kontrol et.") from e
    except anthropic.APIStatusError as e:
        raise UserError(f"Claude API hatası ({e.status_code}). Daha sonra tekrar dene.") from e
    if resp.stop_reason == "refusal":
        raise UserError("Model bu belge için yanıt vermeyi reddetti.")
    text = "".join(b.text for b in resp.content if b.type == "text")
    if not text.strip():
        raise UserError("Modelden boş yanıt geldi.")
    return text


# ---------------- özetleme ----------------

LENGTHS = {
    "short": "5-7 maddelik kısa bir özet",
    "medium": "başlıklarla düzenlenmiş, orta uzunlukta bir özet (yaklaşık 1 sayfa)",
    "long": "bölüm bölüm ayrıntılı bir özet; önemli sayılar, tarihler ve kararlar dahil",
}


def _md_to_html(md: str) -> str:
    out, in_list = [], False
    for raw in md.splitlines():
        line = raw.rstrip()
        esc = html.escape(line)
        esc = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", esc)
        m = re.match(r"^(#{1,4})\s+(.*)", esc)
        bullet = re.match(r"^\s*([-*•]|\d+\.)\s+(.*)", esc)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{bullet.group(2)}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if m:
            lvl = min(len(m.group(1)) + 1, 4)
            out.append(f"<h{lvl}>{m.group(2)}</h{lvl}>")
        elif esc.strip():
            out.append(f"<p>{esc}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _text_to_pdf(title: str, body_md: str) -> pymupdf.Document:
    css = ("* {font-family: sans-serif;} body {font-size: 11pt; line-height: 1.45;}"
           "h1 {font-size: 18pt; margin-bottom: 6pt;} h2 {font-size: 14pt; margin-top: 12pt;}"
           "h3 {font-size: 12pt;} li {margin-bottom: 3pt;} .meta {color: #666; font-size: 9pt;}")
    content = f"<h1>{html.escape(title)}</h1>" + _md_to_html(body_md)
    story = pymupdf.Story(html=content, user_css=css)
    buf = pymupdf.open()
    W, H = 595, 842
    where = pymupdf.Rect(56, 56, W - 56, H - 56)
    more = True
    while more:
        page = buf.new_page(width=W, height=H)
        more, _ = story.place(where)
        story.draw(page)
    return buf


@tool("ai_summarize")
def ai_summarize(ctx):
    e = ctx.first
    length = LENGTHS.get(ctx.opt("length", "medium"), LENGTHS["medium"])
    lang = ctx.opt("language", "Türkçe")
    focus = (ctx.opt("focus") or "").strip()
    src = ctx.pdf_path(e)
    size = src.stat().st_size
    doc = pymupdf.open(src)
    prompt = (f"Bu belgenin {length} olarak {lang} dilinde özetini yaz. "
              "Önce belgenin ne olduğunu tek cümleyle söyle, sonra özete geç. "
              "Markdown başlıkları ve madde işaretleri kullan; belgede olmayan bilgi ekleme.")
    if focus:
        prompt += f" Özellikle şu konuya odaklan: {focus}"
    if size < 30 * 1024 * 1024 and doc.page_count <= 600:
        data = base64.standard_b64encode(src.read_bytes()).decode()
        content = [{"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                                    "data": data}},
                   {"type": "text", "text": prompt}]
    else:
        text = "\n\n".join(f"[Sayfa {i + 1}]\n{p.get_text()}" for i, p in enumerate(doc))
        if not text.strip():
            raise UserError("Belgede okunabilir metin yok. Önce OCR uygula.")
        content = [{"type": "text", "text": f"<belge>\n{text}\n</belge>\n\n{prompt}"}]
    summary = _call(max_tokens=16000, output_config={"effort": "medium"},
                    messages=[{"role": "user", "content": content}])
    ctx.extra["text"] = summary
    out = _text_to_pdf(f"Özet: {stem(e.name)}", summary)
    return save_pdf(out, ctx.out(f"{stem(e.name)}_ozet.pdf"))


# ---------------- çeviri ----------------

def _page_blocks(page):
    blocks = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        lines = [ "".join(s["text"] for s in l["spans"]).strip() for l in b["lines"]]
        text = " ".join(l for l in lines if l)
        if not text.strip() or not re.search(r"[^\W\d_]", text):
            continue
        spans = [s for l in b["lines"] for s in l["spans"] if s["text"].strip()]
        dom = max(spans, key=lambda s: len(s["text"]))
        blocks.append({"bbox": pymupdf.Rect(b["bbox"]), "text": text, "size": dom["size"],
                       "color": int_to_hex(dom["color"]), "bold": bool(dom["flags"] & 16),
                       "serif": bool(dom["flags"] & 4)})
    return blocks


def _translate_batch(texts: list[str], lang: str) -> list[str]:
    schema = {
        "type": "object",
        "properties": {"translations": {"type": "array", "items": {"type": "string"}}},
        "required": ["translations"],
        "additionalProperties": False,
    }
    payload = json.dumps({"items": texts}, ensure_ascii=False)
    prompt = (f"Aşağıdaki JSON'daki her metni {lang} diline çevir. Sıra ve sayı aynı kalmalı "
              f"({len(texts)} öğe). Sayıları, özel isimleri, e-posta ve adresleri olduğu gibi bırak. "
              "Zaten hedef dildeyse aynen döndür.\n\n" + payload)
    raw = _call(max_tokens=16000, output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": prompt}])
    items = json.loads(raw).get("translations", [])
    if len(items) != len(texts):
        items = (items + texts[len(items):])[:len(texts)]
    return items


@tool("ai_translate")
def ai_translate(ctx):
    e = ctx.first
    lang = ctx.opt("language", "İngilizce")
    doc = ctx.open_pdf(e)
    all_blocks = []
    for page in doc:
        if page.rotation:
            page.remove_rotation()
        for b in _page_blocks(page):
            all_blocks.append((page.number, b))
    if not all_blocks:
        raise UserError("Çevrilecek metin bulunamadı. Taranmış bir belgeyse önce OCR uygula.")
    # ~10.000 karakterlik gruplar halinde çevir
    translated: list[str] = []
    batch, chars = [], 0
    for _, b in all_blocks:
        if batch and chars + len(b["text"]) > 10000:
            translated += _translate_batch(batch, lang)
            batch, chars = [], 0
        batch.append(b["text"])
        chars += len(b["text"])
    if batch:
        translated += _translate_batch(batch, lang)
    # orijinal metni kaldır, çeviriyi aynı kutulara yerleştir
    for page in doc:
        for pno, b in all_blocks:
            if pno == page.number:
                page.add_redact_annot(b["bbox"], fill=False)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                              graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    for (pno, b), text in zip(all_blocks, translated):
        page = doc[pno]
        fam = "serif" if b["serif"] else "sans-serif"
        weight = "bold" if b["bold"] else "normal"
        css = (f"* {{font-family: {fam}; font-size: {b['size']:.1f}px; color: {b['color']};"
               f" font-weight: {weight}; line-height: 1.15; margin: 0; padding: 0;}}")
        box = b["bbox"] + (0, 0, 2, 2)
        page.insert_htmlbox(box, html.escape(text), css=css, scale_low=0)
    ctx.extra["blocks"] = len(all_blocks)
    return save_pdf(doc, ctx.out(f"{stem(e.name)}_{re.sub(r'\W+', '_', lang).lower()}.pdf"))
