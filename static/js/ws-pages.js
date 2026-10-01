// Sayfa ızgarası: seç (sil/çıkar), böl, döndür, düzenle (sırala, kopyala, boş sayfa).
import { h, icon, dropTarget } from "./ui.js";
import * as api from "./api.js";

const COLORS = ["var(--c)", "var(--m)", "var(--cy)", "var(--cm)", "var(--my)", "#b07d00", "var(--k)"];

export function parseRanges(spec, n) {
  spec = (spec || "").trim().toLowerCase();
  if (!spec) return [[...Array(n).keys()]];
  const groups = [];
  for (let part of spec.split(/[,;]/)) {
    part = part.trim();
    if (!part) continue;
    const num = (s, d) => {
      s = s.trim();
      if (!s) return d;
      if (s === "son" || s === "z") return n;
      const v = parseInt(s, 10);
      return Number.isFinite(v) ? Math.min(Math.max(v, 1), n) : null;
    };
    if (part.includes("-")) {
      const [a, b] = part.split("-");
      const x = num(a, 1), y = num(b, n);
      if (x === null || y === null) continue;
      const g = [];
      for (let i = x; x <= y ? i <= y : i >= y; i += x <= y ? 1 : -1) g.push(i - 1);
      groups.push(g);
    } else {
      const v = num(part, null);
      if (v !== null) groups.push([v - 1]);
    }
  }
  return groups;
}
export const parsePages = (spec, n) => [...new Set(parseRanges(spec, n).flat())];
export function humanRanges(pages) {
  const p = [...pages].sort((a, b) => a - b);
  if (!p.length) return "";
  const out = [];
  let s = p[0], prev = p[0];
  for (const x of p.slice(1)) {
    if (x === prev + 1) { prev = x; continue; }
    out.push(s === prev ? `${s + 1}` : `${s + 1}-${prev + 1}`);
    s = prev = x;
  }
  out.push(s === prev ? `${s + 1}` : `${s + 1}-${prev + 1}`);
  return out.join(", ");
}

let keySeq = 0;
// 90/270 derecede döndürülen dikey sayfa kutuya sığsın diye küçültülür
const rotCss = (deg) => `rotate(${deg}deg)${deg % 180 ? " scale(0.72)" : ""}`;

export default function mountPages(el, ctx) {
  const mode = ctx.tool.mode;
  const bar = h("div.pages-bar");
  const grid = h("div.page-grid");
  el.append(bar, grid);
  dropTarget(el, (fl) => ctx.addFiles(fl));

  const fileColor = new Map();
  let items = [];
  const sel = new Set();
  const cuts = new Set();
  let lastClick = null;
  let sortable = null;

  function pagesOf(f) {
    if (!fileColor.has(f.id)) fileColor.set(f.id, COLORS[fileColor.size % COLORS.length]);
    const n = f.kind === "image" ? 1 : f.pageCount;
    return Array.from({ length: n }, (_, i) => ({ key: ++keySeq, file: f.id, page: i, rotate: 0, w: f.pages?.[i]?.w || 595, h: f.pages?.[i]?.h || 842 }));
  }
  function reset() {
    items = (mode === "organize" ? ctx.files : ctx.files.slice(0, 1)).flatMap(pagesOf);
    sel.clear();
    cuts.clear();
  }

  const n = () => items.length;

  // ---- seçim <-> 'pages' seçeneği
  function pushSelection() {
    if (mode === "select") ctx.setOpt("pages", humanRanges(sel));
  }
  function pushCuts() {
    const starts = [0, ...[...cuts].sort((a, b) => a - b)];
    const ranges = starts.map((s, i) => {
      const e = (i + 1 < starts.length ? starts[i + 1] : n()) - 1;
      return s === e ? `${s + 1}` : `${s + 1}-${e + 1}`;
    });
    ctx.setOpt("ranges", ranges.join(", "));
  }
  const off = ctx.onOpts((key) => {
    if (mode === "select" && key === "pages") {
      sel.clear();
      if (ctx.opts.pages) parsePages(ctx.opts.pages, n()).forEach((i) => sel.add(i));
      paintState();
    }
    if (mode === "split" && ["mode", "ranges", "every"].includes(key)) paintState();
  });

  function groupsForSplit() {
    const o = ctx.opts;
    const g = new Array(n()).fill(null);
    if (o.mode === "ranges") parseRanges(o.ranges || "", n()).forEach((grp, k) => grp.forEach((i) => { if (g[i] === null) g[i] = k; }));
    else if (o.mode === "every") for (let i = 0; i < n(); i++) g[i] = Math.floor(i / Math.max(1, o.every || 1));
    else if (o.mode === "all") for (let i = 0; i < n(); i++) g[i] = i;
    else return null;
    return g;
  }

  function card(it, idx) {
    const f = ctx.files.find((x) => x.id === it.file);
    const img = it.blank
      ? h("div.blank", { style: { aspectRatio: `${it.w}/${it.h}`, width: it.w > it.h ? "90%" : "64%" } })
      : h("img", { src: api.pageUrl(it.file, it.page, 260), alt: "", loading: "lazy", draggable: false });
    if (!it.blank) img.style.transform = rotCss(it.rotate);
    const label = h("div.plabel",
      mode === "organize" && ctx.files.length > 1 ? h("span.dot", { style: { background: fileColor.get(it.file) }, title: f ? f.name : "" }) : null,
      it.blank ? "Boş" : mode === "organize" ? `${idx + 1}` : `${it.page + 1}`);
    const c = h("div.pcard", { dataset: { key: it.key, idx } },
      h("div.pthumb", { role: mode === "select" || mode === "split" ? "button" : null, tabindex: 0, "aria-label": `Sayfa ${idx + 1}` }, img),
      label);
    const acts = [];
    if (mode === "rotate" || mode === "organize") {
      acts.push(h("button", { type: "button", title: "Sola döndür", "aria-label": "Sola döndür", onclick: (e) => { e.stopPropagation(); rot(it, -90); } }, icon("rotate-ccw")));
      acts.push(h("button", { type: "button", title: "Sağa döndür", "aria-label": "Sağa döndür", onclick: (e) => { e.stopPropagation(); rot(it, 90); } }, icon("rotate-cw")));
    }
    if (mode === "organize") {
      acts.push(h("button", { type: "button", title: "Kopyala", "aria-label": "Sayfayı kopyala", onclick: (e) => { e.stopPropagation(); items.splice(items.indexOf(it) + 1, 0, { ...it, key: ++keySeq }); draw(); } }, icon("copy")));
      acts.push(h("button", { type: "button", title: "Sil", "aria-label": "Sayfayı sil", onclick: (e) => { e.stopPropagation(); items.splice(items.indexOf(it), 1); draw(); } }, icon("trash-2")));
    }
    if (acts.length) c.append(h("div.pact", acts));
    const thumb = c.querySelector(".pthumb");
    thumb.addEventListener("click", (e) => onCardClick(idx, e));
    thumb.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onCardClick(idx, e); } });
    return c;
  }

  function rot(it, d) {
    it.rotate = ((it.rotate + d) % 360 + 360) % 360;
    const img = grid.querySelector(`.pcard[data-key="${it.key}"] img`);
    if (img) img.style.transform = rotCss(it.rotate);
  }

  function onCardClick(idx, e) {
    if (mode === "select") {
      if (e.shiftKey && lastClick !== null) {
        const [a, b] = [Math.min(lastClick, idx), Math.max(lastClick, idx)];
        for (let i = a; i <= b; i++) sel.add(i);
      } else if (sel.has(idx)) sel.delete(idx);
      else sel.add(idx);
      lastClick = idx;
      pushSelection();
      paintState();
    } else if (mode === "split") {
      if (ctx.opts.mode !== "ranges") ctx.setOpt("mode", "ranges");
      if (idx === 0) return;
      cuts.has(idx) ? cuts.delete(idx) : cuts.add(idx);
      pushCuts();
      paintState();
    } else if (mode === "rotate") {
      rot(items[idx], 90);
    }
  }

  function paintState() {
    const cards = grid.querySelectorAll(".pcard");
    const groups = mode === "split" ? groupsForSplit() : null;
    cards.forEach((c, i) => {
      c.classList.toggle("sel", mode === "select" && sel.has(i));
      c.querySelector(".group")?.remove();
      c.classList.remove("dim");
      if (groups) {
        if (groups[i] === null) c.classList.add("dim");
        else c.querySelector(".plabel").append(h("span.group", { style: { background: COLORS[groups[i] % COLORS.length] } }, `${groups[i] + 1}. dosya`));
      }
    });
    updateBar();
  }

  function updateBar() {
    const count = bar.querySelector(".count");
    if (!count) return;
    if (mode === "select") count.textContent = `${sel.size} / ${n()} sayfa seçili`;
    else count.textContent = `${n()} sayfa`;
  }

  function buildBar() {
    const b = [];
    if (mode === "select") {
      b.push(h("button.btn.sm", { type: "button", onclick: () => { for (let i = 0; i < n(); i++) sel.add(i); pushSelection(); paintState(); } }, "Tümünü seç"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => { sel.clear(); for (let i = 0; i < n(); i += 2) sel.add(i); pushSelection(); paintState(); } }, "Tek sayfalar"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => { sel.clear(); for (let i = 1; i < n(); i += 2) sel.add(i); pushSelection(); paintState(); } }, "Çift sayfalar"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => { for (let i = 0; i < n(); i++) sel.has(i) ? sel.delete(i) : sel.add(i); pushSelection(); paintState(); } }, "Seçimi ters çevir"));
      b.push(h("button.btn.sm.ghost", { type: "button", onclick: () => { sel.clear(); pushSelection(); paintState(); } }, "Temizle"));
      b.push(h("span.hint", "Shift ile aralık seç."));
    } else if (mode === "split") {
      b.push(h("span.hint", "Yeni dosyanın başlayacağı sayfaya tıkla; aralıklar otomatik yazılır."));
      b.push(h("button.btn.sm.ghost", { type: "button", onclick: () => { cuts.clear(); ctx.setOpt("ranges", ""); paintState(); } }, "Temizle"));
    } else if (mode === "rotate") {
      b.push(h("button.btn.sm", { type: "button", onclick: () => { items.forEach((it) => rot(it, -90)); } }, icon("rotate-ccw"), "Tümünü sola"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => { items.forEach((it) => rot(it, 90)); } }, icon("rotate-cw"), "Tümünü sağa"));
      b.push(h("button.btn.sm.ghost", { type: "button", onclick: () => { items.forEach((it) => { it.rotate = 0; }); draw(); } }, "Sıfırla"));
      b.push(h("span.hint", "Tek sayfayı döndürmek için üzerine tıkla."));
    } else if (mode === "organize") {
      b.push(h("button.btn.sm", { type: "button", onclick: () => addBlank() }, icon("file-plus"), "Boş sayfa"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => ctx.pick() }, icon("plus"), "Dosya ekle"));
      b.push(h("button.btn.sm", { type: "button", onclick: () => { items.reverse(); draw(); } }, icon("arrow-up-down"), "Ters çevir"));
      b.push(h("button.btn.sm.ghost", { type: "button", onclick: () => { reset(); draw(); } }, "Sıfırla"));
    }
    b.push(h("span.count"));
    bar.replaceChildren(...b);
  }

  function addBlank() {
    const last = items[items.length - 1];
    items.push({ key: ++keySeq, blank: true, rotate: 0, w: last && !last.blank ? last.w : 595, h: last && !last.blank ? last.h : 842 });
    draw();
  }

  function draw() {
    grid.replaceChildren(...items.map(card));
    buildBar();
    paintState();
    if (mode === "organize" && window.Sortable) {
      if (sortable) sortable.destroy();
      sortable = window.Sortable.create(grid, {
        animation: 150, ghostClass: "sortable-ghost",
        onEnd: () => {
          const order = [...grid.children].map((c) => Number(c.dataset.key));
          const map = new Map(items.map((it) => [it.key, it]));
          items = order.map((k) => map.get(k));
          draw();
        },
      });
    }
  }

  reset();
  if (mode === "select" && ctx.opts.pages) parsePages(ctx.opts.pages, n()).forEach((i) => sel.add(i));
  draw();

  return {
    filesAdded(infos) {
      if (mode === "organize") { infos.forEach((f) => items.push(...pagesOf(f))); draw(); }
      else { reset(); draw(); }
    },
    options() {
      if (mode === "organize") {
        return { sequence: items.map((it) => (it.blank ? { blank: true, w: it.w, h: it.h } : { file: it.file, page: it.page, rotate: it.rotate })) };
      }
      if (mode === "rotate") {
        const per = {};
        items.forEach((it, i) => { if (it.rotate) per[i] = it.rotate; });
        return { per_page: per };
      }
      return {};
    },
    validate() {
      if (mode === "organize" && !items.length) return "Hiç sayfa kalmadı.";
      if (mode === "rotate" && !items.some((it) => it.rotate)) return "Önce döndürmek istediğin sayfaları seç.";
      if (mode === "select" && ctx.tool.id === "remove_pages" && sel.size >= n()) return "Tüm sayfalar silinemez.";
      return null;
    },
    destroy() { off(); if (sortable) sortable.destroy(); },
  };
}
