// Dosya listesi çalışma alanı: küçük resimler, sıralama, ekleme/çıkarma.
import { h, icon, fmtBytes, dropTarget, toast, askPassword } from "./ui.js";
import * as api from "./api.js";

const EXT_LABEL = { word: "DOC", excel: "XLS", powerpoint: "PPT", html: "HTML", other: "?" };

export function fileThumb(f, w = 220) {
  if (f.kind === "pdf" && !f.locked && f.pageCount) {
    return h("img", { src: api.pageUrl(f.id, 0, w), alt: "", loading: "lazy" });
  }
  if (f.kind === "image") return h("img", { src: api.pageUrl(f.id, 0, w), alt: "", loading: "lazy" });
  if (f.locked) return h("span.ext", icon("lock"));
  return h("span.ext", EXT_LABEL[f.kind] || f.name.split(".").pop().toUpperCase());
}

export default function mountFiles(el, ctx) {
  const t = ctx.tool;
  const grid = h("div.file-grid");
  const bar = h("div.pages-bar");
  el.append(bar, grid);
  dropTarget(el, (fl) => ctx.addFiles(fl));
  let sortable = null;

  function draw() {
    grid.replaceChildren();
    ctx.files.forEach((f, i) => {
      const card = h(`div.fcard${f.locked ? ".locked" : ""}`, { dataset: { id: f.id }, tabindex: 0 },
        t.sortable && ctx.files.length > 1 ? h("span.order", i + 1) : null,
        h("div.thumb", fileThumb(f)),
        h("div.name", { title: f.name }, f.name),
        h("div.meta", [fmtBytes(f.size), f.pageCount ? `${f.pageCount} sayfa` : "", f.locked ? "parola korumalı" : ""].filter(Boolean).join(" · ")),
        h("button.x", { type: "button", "aria-label": `${f.name} dosyasını kaldır`, onclick: (e) => { e.stopPropagation(); ctx.removeFile(f.id); } }, icon("x")));
      if (f.locked && !t.allowLocked) {
        card.addEventListener("click", async () => {
          const pw = await askPassword(f.name);
          if (pw === null) return;
          try { Object.assign(f, await api.unlock(f.id, pw)); draw(); } catch (e) { toast(e.message, "err"); }
        });
      }
      grid.append(card);
    });
    if (t.multi) {
      grid.append(h("button.fcard.add", { type: "button", onclick: () => ctx.pick() },
        h("div", { style: { display: "grid", justifyItems: "center", gap: "6px" } }, h("span", { style: { fontSize: "28px" } }, icon("plus")), "Dosya ekle")));
    }
    bar.replaceChildren(...[
      h("span.hint", t.sortable && ctx.files.length > 1 ? "Sırayı değiştirmek için kartları sürükle." : t.multi ? "Daha fazla dosya ekleyebilir ya da buraya bırakabilirsin." : "Başka bir dosyayla değiştirmek için buraya bırak."),
      t.sortable && ctx.files.length > 1 ? h("button.btn.sm.ghost", { type: "button", onclick: sortByName }, icon("arrow-down-a-z"), "Ada göre sırala") : null,
      h("span.count", `${ctx.files.length} dosya`)].filter(Boolean));
    if (t.sortable && window.Sortable) {
      if (sortable) sortable.destroy();
      sortable = window.Sortable.create(grid, {
        animation: 150, filter: ".add", draggable: ".fcard:not(.add)", ghostClass: "sortable-ghost",
        onEnd: () => { ctx.setOrder([...grid.querySelectorAll(".fcard[data-id]")].map((c) => c.dataset.id)); draw(); },
      });
    }
  }

  function sortByName() {
    const ids = [...ctx.files].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })).map((f) => f.id);
    ctx.setOrder(ids);
    draw();
  }

  draw();
  return {
    filesAdded: () => draw(),
    destroy: () => { if (sortable) sortable.destroy(); },
  };
}
