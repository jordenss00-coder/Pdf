"""Local Markdown export: text headings, lists, detected tables and safe web links."""
import re
import statistics

from ..util import parse_pages, stem
from . import tool


def escape(text):
    return re.sub(r"([\\`*_{}\[\]<>|])", r"\\\1", str(text or "")).replace("\n", " ")


@tool("pdf_to_markdown")
def pdf_to_markdown(ctx):
    paths = []
    empty = 0
    for entry in ctx.entries:
        doc = ctx.open_pdf(entry)
        sections = []
        for number in parse_pages(ctx.opt("pages", "all"), doc.page_count):
            page = doc[number]
            blocks = page.get_text("dict", sort=True)["blocks"]
            sizes = [span["size"] for block in blocks if block["type"] == 0
                     for line in block["lines"] for span in line["spans"] if span["text"].strip()]
            body_size = statistics.median(sizes) if sizes else 12
            items, table_boxes = [], []
            if ctx.opt_bool("tables", True):
                try:
                    tables = page.find_tables().tables
                except Exception:
                    tables = []
                for table in tables:
                    rows = table.extract()
                    if not rows or not rows[0]:
                        continue
                    width = max(map(len, rows))
                    lines = ["| " + " | ".join(escape(c) for c in row + [""] * (width - len(row))) + " |" for row in rows]
                    lines.insert(1, "| " + " | ".join(["---"] * width) + " |")
                    items.append((table.bbox[1], table.bbox[0], "\n".join(lines)))
                    table_boxes.append(table.bbox)
            for block in blocks:
                if block["type"] != 0:
                    continue
                for line in block["lines"]:
                    x0, y0, x1, y1 = line["bbox"]
                    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                    if any(a <= cx <= c and b <= cy <= d for a, b, c, d in table_boxes):
                        continue
                    raw = "".join(s["text"] for s in line["spans"]).strip()
                    if not raw:
                        continue
                    size = max(s["size"] for s in line["spans"])
                    text = escape(raw)
                    if re.match(r"^[•●▪]\s*", raw):
                        text = "- " + escape(re.sub(r"^[•●▪]\s*", "", raw))
                    elif ctx.opt_bool("headings", True) and size >= body_size * 1.2:
                        text = ("# " if size >= body_size * 1.6 else "## ") + text
                    items.append((y0, x0, text))
            content = "\n\n".join(text for _, _, text in sorted(items))
            if not content:
                empty += 1
                content = "_Bu sayfada çıkarılabilir metin yok. Önce OCR uygulayın._"
            if ctx.opt_bool("links", True):
                links = sorted({link.get("uri", "") for link in page.get_links()
                                if re.match(r"^https?://", link.get("uri", ""), re.I)})
                if links:
                    content += "\n\n" + "\n".join(f"- <{url.replace('>', '%3E').replace('<', '%3C')}>" for url in links)
            sections.append((f"<!-- Sayfa {number + 1} -->\n\n" if ctx.opt_bool("page_markers", True) else "") + content)
        output = ctx.out(stem(entry.name) + ".md")
        output.write_text("\n\n---\n\n".join(sections) + "\n", encoding="utf-8")
        paths.append(output)
    if empty:
        ctx.extra["warning"] = f"{empty} sayfada metin bulunamadı. Taranmış belgeler için önce OCR kullan."
    ctx.result_name = "markdown.zip"
    return paths
