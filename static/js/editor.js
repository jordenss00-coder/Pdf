// PDF editörü: sayfalar üzerinde nesne ekleme, mevcut metni düzeltme, form alanları,
// karartma ve kırpma. Tüm koordinatlar PDF noktası (pt) cinsinden, görünür sayfaya göredir.
import { h, icon, toast, pickFiles, readAsDataURL, debounce, dialog } from "./ui.js";
import * as api from "./api.js";
import { openSignature } from "./signature.js";

const PALETTES = {
  edit: ["select", "textedit", "text", "image", "sign", "|", "rect", "ellipse", "line", "arrow", "pen", "|", "highlight", "whiteout", "note", "link"],
  text: ["select", "textedit", "text", "whiteout"],
  sign: ["select", "sign", "initials", "date", "text", "image"],
  redact: ["select", "redact"],
  crop: ["crop"],
  form: ["select", "f-text", "f-check", "f-combo", "f-sign", "|", "detect"],
  find: [],
};
const DEFAULT_TOOL = { edit: "select", text: "textedit", sign: "select", redact: "redact", crop: "crop", form: "select", find: "select" };

const TOOLDEF = {
  hand: { icon: "hand", tip: "Sayfada gezin", key: "g" },
  select: { icon: "mouse-pointer-2", tip: "Seç ve taşı", key: "v" },
  textedit: { icon: "text-cursor", tip: "Mevcut metni düzelt", key: "e" },
  text: { icon: "type", tip: "Metin ekle", key: "t" },
  image: { icon: "image-plus", tip: "Görsel ekle", action: true },
  sign: { icon: "signature", tip: "İmza ekle", action: true },
  initials: { icon: "pen-line", tip: "Paraf ekle", action: true },
  date: { icon: "calendar", tip: "Bugünün tarihini ekle", action: true },
  rect: { icon: "square", tip: "Dikdörtgen", key: "r" },
  ellipse: { icon: "circle", tip: "Elips", key: "o" },
  line: { icon: "minus", tip: "Çizgi", key: "l" },
  arrow: { icon: "move-up-right", tip: "Ok", key: "a" },
  pen: { icon: "pencil", tip: "Serbest çizim", key: "p" },
  highlight: { icon: "highlighter", tip: "Vurgula", key: "h" },
  whiteout: { icon: "eraser", tip: "Beyazla kapat", key: "w" },
  note: { icon: "sticky-note", tip: "Not ekle", key: "n" },
  link: { icon: "link", tip: "Bağlantı ekle", key: "k" },
  redact: { icon: "eye-off", tip: "Karartılacak alanı çiz", key: "r" },
  crop: { icon: "crop", tip: "Kırpma alanı" },
  "f-text": { icon: "text-cursor-input", tip: "Metin alanı ekle", key: "t" },
  "f-check": { icon: "square-check", tip: "Onay kutusu ekle", key: "c" },
  "f-combo": { icon: "list", tip: "Açılır liste ekle", key: "l" },
  "f-sign": { icon: "signature", tip: "İmza alanı ekle", key: "s" },
  detect: { icon: "wand-sparkles", tip: "Alanları otomatik algıla", action: true },
};

const HINTS = {
  hand: "Sayfayı fareyle tutup sürükle. Ctrl + tekerlek ile yakınlaştır.",
  select: "Bir öğeye tıkla, sürükleyerek taşı, köşesinden boyutlandır. Delete ile sil.",
  textedit: "Düzeltmek istediğin satıra tıkla ve yaz. Satırı sürükleyerek de taşıyabilirsin.",
  text: "Metin eklemek istediğin yere tıkla.",
  rect: "Çizmek için sayfa üzerinde sürükle.", ellipse: "Çizmek için sayfa üzerinde sürükle.",
  line: "Sürükleyerek çiz. Shift ile 45° açılara kilitlenir.", arrow: "Sürükleyerek çiz. Shift ile 45° açılara kilitlenir.",
  pen: "Fareyle ya da kalemle serbestçe çiz.", highlight: "Vurgulanacak alanı sürükleyerek seç.",
  whiteout: "Gizlenecek alanı sürükleyerek beyazla kapat.", note: "Not eklemek istediğin yere tıkla.",
  link: "Bağlantı alanını sürükleyerek çiz.", redact: "Kalıcı olarak silinecek alanı sürükleyerek seç.",
  crop: "Kalacak alanı sürükleyerek seç; dışı kesilir.",
  "f-text": "Metin alanının yerini sürükleyerek çiz.", "f-check": "Onay kutusu için tıkla ya da sürükle.",
  "f-combo": "Açılır listenin yerini sürükleyerek çiz.", "f-sign": "İmza alanının yerini sürükleyerek çiz.",
};

const NAMES = {
  text: "Metin", textedit: "Mevcut metin", image: "Görsel", signature: "İmza", rect: "Dikdörtgen", ellipse: "Elips",
  line: "Çizgi", arrow: "Ok", ink: "Serbest çizim", highlight: "Vurgu", whiteout: "Beyaz kutu", note: "Not", link: "Bağlantı",
  redact: "Karartma alanı", crop: "Kırpma alanı", field: "Form alanı",
};

const CSS_FAMILY = {
  arial: "Arial, Helvetica, sans-serif", times: "'Times New Roman', Times, serif", courier: "'Courier New', monospace",
  calibri: "Calibri, Carlito, sans-serif", cambria: "Cambria, serif", verdana: "Verdana, sans-serif", tahoma: "Tahoma, sans-serif",
  georgia: "Georgia, serif", segoe: "'Segoe UI', sans-serif", trebuchet: "'Trebuchet MS', sans-serif", garamond: "Garamond, serif",
  comic: "'Comic Sans MS', cursive", consolas: "Consolas, monospace",
};
const FIELD_KIND = { "f-text": "text", "f-check": "checkbox", "f-combo": "combo", "f-sign": "signature" };
const FIELD_DEFAULT = { text: [180, 20], checkbox: [14, 14], combo: [150, 20], signature: [170, 46] };
const RESIZABLE = new Set(["text", "textedit", "image", "signature", "rect", "ellipse", "line", "arrow", "ink", "highlight", "whiteout", "link", "redact", "crop", "field"]);

let uid = 0;
const nid = () => `o${++uid}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const today = () => new Date().toLocaleDateString("tr-TR");

export default function mountEditor(root, ctx) {
  const mode = ctx.tool.mode;
  const file = ctx.files[0];
  const pages = file.pages && file.pages.length ? file.pages : [{ w: 595, h: 842 }];
  const dpr = window.devicePixelRatio || 1;
  const S = {
    scale: 1, autoFit: true, tool: DEFAULT_TOOL[mode], objs: [], sel: null, editing: null,
    lines: new Map(), linesLoading: new Set(), fields: [], fieldVals: new Map(), removed: new Set(),
    hits: [], undo: [], redo: [],
    def: {
      text: { size: 14, family: "arial", color: "#18223a", bold: false, italic: false, align: "left" },
      shape: { stroke: "#cf006d", fill: "", width: 2, opacity: 1 },
      pen: { stroke: "#1b4fd8", width: 2, opacity: 1 },
      highlight: { color: "#ffd400", opacity: 0.45 },
      whiteout: { color: "#ffffff" },
    },
  };

  // ---------------- DOM ----------------
  const palette = ["hand", ...(PALETTES[mode] || [])];
  const toolsEl = palette.length ? h("div.ed-tools", { role: "toolbar", "aria-label": "Düzenleme araçları", "aria-orientation": "vertical" }) : null;
  const hintEl = h("span.hint");
  const zoomEl = h("span.zoom");
  const bar = h("div.ed-bar",
    h("button.icon-btn", { type: "button", title: "Uzaklaştır", "aria-label": "Uzaklaştır", onclick: () => zoom(1 / 1.2) }, icon("zoom-out")),
    zoomEl,
    h("button.icon-btn", { type: "button", title: "Yakınlaştır", "aria-label": "Yakınlaştır", onclick: () => zoom(1.2) }, icon("zoom-in")),
    h("button.icon-btn", { type: "button", title: "Sayfa genişliğine sığdır", "aria-label": "Sığdır", onclick: () => { S.autoFit = true; fit(); } }, icon("maximize")),
    mode !== "find" ? [
      h("button.icon-btn", { type: "button", title: "Geri al (Ctrl+Z)", "aria-label": "Geri al", onclick: () => undo() }, icon("undo-2")),
      h("button.icon-btn", { type: "button", title: "Yinele (Ctrl+Y)", "aria-label": "Yinele", onclick: () => redo() }, icon("redo-2")),
    ] : null,
    h("button.btn.sm", { type: "button", onclick: showShortcuts }, icon("keyboard"), "Kısayollar"));
  const pagesEl = h("div.ed-pages");
  const viewport = h("div.ed-viewport", { tabindex: 0, role: "region", "aria-label": "PDF görünümü" }, pagesEl);
  const main = h("div.ed-main", bar, hintEl,
    h("p.ed-navigation-help", "Ctrl + tekerlek: yakınlaştır · Ctrl + sürükle: gezin · Ctrl + 0: sığdır"), viewport);
  const ed = h("div.editor", toolsEl, main);
  if (!toolsEl) ed.style.gridTemplateColumns = "1fr";
  root.append(ed);

  const P = pages.map((p, n) => {
    const img = h("img", { alt: "", loading: n < 2 ? "eager" : "lazy", draggable: false });
    const ov = h("div.ov", { dataset: { n } });
    const el = h("div.pg", { dataset: { n } }, img, ov, h("span.pnum", `${n + 1} / ${pages.length}`));
    pagesEl.append(el);
    ov.addEventListener("pointerdown", (e) => onDown(e, n));
    ov.addEventListener("dblclick", (e) => onDbl(e));
    return { el, img, ov, src: "" };
  });

  // ---------------- araç çubuğu ----------------
  function drawTools() {
    if (!toolsEl) return;
    toolsEl.replaceChildren();
    for (const k of palette) {
      if (k === "|") { toolsEl.append(h("hr")); continue; }
      const d = TOOLDEF[k];
      const b = h("button", { type: "button", title: HINTS[k] || d.tip, "aria-label": d.tip, "aria-pressed": String(!d.action && S.tool === k) },
        icon(d.icon), h("span.tool-label", d.tip), d.key ? h("kbd", d.key.toUpperCase()) : null);
      b.addEventListener("click", () => chooseTool(k));
      toolsEl.append(b);
    }
  }

  function chooseTool(k) {
    commitEditing();
    if (TOOLDEF[k] && TOOLDEF[k].action) { runAction(k); return; }
    S.tool = k;
    S.sel = null;
    drawTools();
    renderAll();
    renderPanel();
  }

  async function runAction(k) {
    const n = visiblePage();
    if (k === "image") {
      const [f] = await pickFiles({ accept: "image/*", multiple: false });
      if (!f) return;
      placeImage(await readAsDataURL(f), "image", n, 200);
    } else if (k === "sign" || k === "initials") {
      const data = await openSignature({ initials: k === "initials" });
      if (data) placeImage(data, "signature", n, k === "initials" ? 70 : 170);
    } else if (k === "date") {
      const c = pageCenter(n);
      addObj({ type: "text", page: n, x: c.x - 40, y: c.y - 10, text: today(), ...S.def.text });
    } else if (k === "detect") {
      await detect(true);
    }
  }

  // ---------------- yerleşim ----------------
  function fit() {
    const avail = viewport.clientWidth - 40;
    const maxW = Math.max(...pages.map((p) => p.w));
    S.scale = clamp(avail / maxW, 0.25, 2.2);
    layout();
  }
  function zoom(f, clientX, clientY) {
    commitEditing();
    const bounds = viewport.getBoundingClientRect();
    const x = clientX ?? bounds.left + viewport.clientWidth / 2;
    const y = clientY ?? bounds.top + viewport.clientHeight / 2;
    const anchor = P.find((p) => { const r = p.el.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }) || P[visiblePage()];
    const before = anchor.el.getBoundingClientRect();
    const px = (x - before.left) / S.scale, py = (y - before.top) / S.scale;
    S.autoFit = false;
    S.scale = clamp(S.scale * f, 0.25, 5);
    layout();
    const after = anchor.el.getBoundingClientRect();
    viewport.scrollLeft += after.left + px * S.scale - x;
    viewport.scrollTop += after.top + py * S.scale - y;
  }
  function layout() {
    zoomEl.textContent = `%${Math.round(S.scale * 100)}`;
    P.forEach((p, n) => {
      const pg = pages[n];
      p.el.style.width = `${pg.w * S.scale}px`;
      p.el.style.height = `${pg.h * S.scale}px`;
      const w = Math.min(3000, Math.ceil((pg.w * S.scale * dpr) / 100) * 100);
      const src = api.pageUrl(file.id, n, w);
      if (p.src !== src) { p.img.src = src; p.src = src; }
    });
    renderAll();
  }
  const onResize = debounce(() => { if (S.autoFit) fit(); }, 150);
  window.addEventListener("resize", onResize);

  let spaceHeld = false, pan = null;
  viewport.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1), -120, 120) * 0.002), e.clientX, e.clientY);
  }, { passive: false });
  viewport.addEventListener("pointerdown", (e) => {
    if (!(e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey || spaceHeld || S.tool === "hand")))) return;
    e.preventDefault();
    e.stopPropagation();
    commitEditing();
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("panning");
  }, true);
  viewport.addEventListener("pointermove", (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    viewport.scrollLeft = pan.left + pan.x - e.clientX;
    viewport.scrollTop = pan.top + pan.y - e.clientY;
  });
  function endPan() { if (pan && viewport.hasPointerCapture(pan.id)) viewport.releasePointerCapture(pan.id); pan = null; viewport.classList.remove("panning"); }
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);
  viewport.addEventListener("lostpointercapture", endPan);
  function releaseSpace(e) { if (!e || e.code === "Space") { spaceHeld = false; viewport.classList.remove("pan-ready"); } }
  function loseFocus() { releaseSpace(); endPan(); }
  document.addEventListener("keyup", releaseSpace);
  window.addEventListener("blur", loseFocus);

  function showShortcuts() {
    return dialog({ title: "PDF düzenleme kısayolları", body: h("div.shortcut-list",
      [["Ctrl + tekerlek / Ctrl + + veya −", "Yakınlaştır / uzaklaştır"], ["Ctrl + 0", "Sayfa genişliğine sığdır"],
       ["Ctrl + sürükle / Boşluk + sürükle", "Sayfada gezin"], ["Orta fare tuşu / G", "Sürükle / gezinme aracını seç"],
       ["Ctrl + S", "Değişiklikleri işle ve sonuç ekranını aç"], ["Ctrl + Z / Ctrl + Y", "Geri al / yinele"],
       ["Delete / Ctrl + D", "Seçili öğeyi sil / çoğalt"], ["Ok tuşları / Shift + ok", "Öğeyi 1 / 10 nokta taşı"],
       ["Escape", "Seçimi bırak"], ...palette.filter((k) => TOOLDEF[k]?.key).map((k) => [TOOLDEF[k].key.toUpperCase(), TOOLDEF[k].tip])]
       .map(([key, label]) => h("div", h("kbd", key), h("span", label)))), actions: [{ label: "Kapat", value: null }] });
  }

  function visiblePage() {
    let best = 0, bestVis = -Infinity;
    P.forEach((p, i) => {
      const r = p.el.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      const vis = Math.min(r.bottom, bounds.bottom) - Math.max(r.top, bounds.top);
      if (vis > bestVis) { bestVis = vis; best = i; }
    });
    return best;
  }
  function pageCenter(n) {
    const r = P[n].el.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    return { x: clamp((bounds.left + viewport.clientWidth / 2 - r.left) / S.scale, 0, pages[n].w),
      y: clamp((bounds.top + viewport.clientHeight / 2 - r.top) / S.scale, 0, pages[n].h) };
  }
  const ptOf = (e, n) => {
    const r = P[n].ov.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / S.scale, 0, pages[n].w), y: clamp((e.clientY - r.top) / S.scale, 0, pages[n].h) };
  };

  // ---------------- geçmiş ----------------
  const snap = () => JSON.stringify({ objs: S.objs, vals: [...S.fieldVals] });
  function checkpoint() {
    S.undo.push(snap());
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
  }
  function restore(s) {
    const d = JSON.parse(s);
    S.objs = d.objs;
    S.fieldVals = new Map(d.vals);
    if (!S.objs.find((o) => o.id === S.sel)) S.sel = null;
    S.editing = null;
    renderAll();
    renderPanel();
  }
  function undo() { if (S.undo.length) { S.redo.push(snap()); restore(S.undo.pop()); } }
  function redo() { if (S.redo.length) { S.undo.push(snap()); restore(S.redo.pop()); } }

  // ---------------- nesneler ----------------
  const byId = (id) => S.objs.find((o) => o.id === id);
  const selected = () => (S.sel ? byId(S.sel) : null);

  function addObj(o, { edit = false, quiet = false } = {}) {
    if (!quiet) checkpoint();
    o.id = nid();
    S.objs.push(o);
    S.sel = o.id;
    if (edit) S.editing = o.id;
    renderPage(o.page);
    renderPanel();
    if (edit) focusEditing();
    return o;
  }
  function removeObj(o) {
    checkpoint();
    S.objs = S.objs.filter((x) => x !== o);
    if (S.sel === o.id) S.sel = null;
    if (S.editing === o.id) S.editing = null;
    renderPage(o.page);
    renderPanel();
  }
  function duplicate(o) {
    const c = structuredClone(o);
    delete c.id;
    move(c, 12, 12);
    if (c.type === "field") c.name = `${c.name}_kopya`;
    addObj(c);
  }

  function placeImage(data, type, n, widthPt) {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(widthPt, pages[n].w * 0.6);
      const hgt = w * img.naturalHeight / img.naturalWidth;
      const c = pageCenter(n);
      addObj({ type, page: n, x: c.x - w / 2, y: c.y - hgt / 2, w, h: hgt, data, opacity: 1 });
      if (S.tool !== "select" && palette.includes("select")) { S.tool = "select"; drawTools(); renderAll(); }
      toast(type === "signature" ? "İmza eklendi. Sürükleyerek yerine taşı." : "Görsel eklendi. Sürükleyerek yerine taşı.");
    };
    img.src = data;
  }

  function bboxOf(o) {
    if (o.type === "line" || o.type === "arrow") {
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    }
    if (o.type === "ink") {
      const xs = o.paths.flat().map((p) => p[0]), ys = o.paths.flat().map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    if (o.type === "textedit") return { x: o.bbox[0] + o.dx, y: o.bbox[1] + o.dy, w: o.bbox[2] - o.bbox[0], h: o.bbox[3] - o.bbox[1] };
    if (o.type === "note") return { x: o.x, y: o.y, w: 22 / S.scale, h: 22 / S.scale };
    return { x: o.x, y: o.y, w: o.w || 0, h: o.h || 0 };
  }

  function move(o, dx, dy) {
    if (o.type === "line" || o.type === "arrow") { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; }
    else if (o.type === "ink") o.paths = o.paths.map((pth) => pth.map(([x, y]) => [x + dx, y + dy]));
    else if (o.type === "textedit") { o.dx += dx; o.dy += dy; }
    else { o.x += dx; o.y += dy; }
  }

  // ---------------- çizim (render) ----------------
  function fontCss(o) {
    return {
      fontFamily: o.family === "auto" ? (o.css || CSS_FAMILY.arial) : (CSS_FAMILY[o.family] || CSS_FAMILY.arial),
      fontWeight: o.bold ? "700" : "400",
      fontStyle: o.italic ? "italic" : "normal",
      color: o.color,
    };
  }

  function objEl(o) {
    const s = S.scale;
    const box = bboxOf(o);
    const base = { left: `${box.x * s}px`, top: `${box.y * s}px` };
    let el;
    switch (o.type) {
      case "text": {
        el = h("div.obj.textbox", { style: { ...base, ...fontCss(o), fontSize: `${o.size * s}px`, textAlign: o.align || "left", background: o.bg || "transparent" } });
        el.textContent = o.text;
        break;
      }
      case "textedit": {
        const lh = (o.bbox[3] - o.bbox[1]) * s;
        el = h("div.obj.tedit", { style: { ...base, ...fontCss(o), fontSize: `${o.size * s}px`, lineHeight: `${lh}px`, minWidth: "6px", minHeight: `${lh}px` } });
        el.textContent = o.deleted ? "" : o.text;
        if (o.deleted) { el.style.width = `${box.w * s}px`; el.style.outline = "1px dashed var(--my)"; el.title = "Silinecek satır"; }
        break;
      }
      case "image":
      case "signature":
        el = h("div.obj.img", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px`, opacity: o.opacity ?? 1 } }, h("img", { src: o.data, alt: "", draggable: false }));
        break;
      case "rect":
      case "ellipse":
        el = h("div.obj", { style: {
          ...base, width: `${o.w * s}px`, height: `${o.h * s}px`, opacity: o.opacity ?? 1,
          border: o.stroke ? `${Math.max(0.5, o.width * s)}px solid ${o.stroke}` : "none",
          background: o.fill || "transparent", borderRadius: o.type === "ellipse" ? "50%" : "0",
        } });
        break;
      case "line":
      case "arrow": {
        el = h("div.obj", { style: { ...base, width: `${Math.max(box.w, 1) * s}px`, height: `${Math.max(box.h, 1) * s}px`, opacity: o.opacity ?? 1 } });
        const x1 = (o.x1 - box.x) * s, y1 = (o.y1 - box.y) * s, x2 = (o.x2 - box.x) * s, y2 = (o.y2 - box.y) * s;
        let head = "";
        if (o.type === "arrow") {
          const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(8, o.width * 4) * s;
          const p1 = [x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)], p2 = [x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)];
          head = `<polygon points="${p1} ${x2},${y2} ${p2}" fill="${o.stroke}"/>`;
        }
        el.innerHTML = `<svg width="100%" height="100%"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke}" stroke-width="${o.width * s}" stroke-linecap="round"/>${head}</svg>`;
        break;
      }
      case "ink": {
        el = h("div.obj", { style: { ...base, width: `${Math.max(box.w, 1) * s}px`, height: `${Math.max(box.h, 1) * s}px`, opacity: o.opacity ?? 1 } });
        const d = o.paths.map((pth) => pth.map(([x, y], i) => `${i ? "L" : "M"}${(x - box.x) * s},${(y - box.y) * s}`).join("")).join("");
        el.innerHTML = `<svg width="100%" height="100%"><path d="${d}" fill="none" stroke="${o.stroke}" stroke-width="${o.width * s}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        break;
      }
      case "highlight":
        el = h("div.obj", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px`, background: o.color, opacity: o.opacity, mixBlendMode: "multiply" } });
        break;
      case "whiteout":
        el = h("div.obj.whiteout", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px`, background: o.color } });
        break;
      case "note":
        el = h("div.obj.note-obj", { style: base, title: o.text || "Not" }, icon("sticky-note"));
        break;
      case "link":
        el = h("div.obj.link-obj", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px` }, title: o.url || (o.target_page ? `Sayfa ${o.target_page}` : "Bağlantı") });
        break;
      case "redact":
        el = h("div.obj.redact-obj", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px` } });
        break;
      case "crop":
        el = h("div.obj.crop-obj", { style: { ...base, width: `${o.w * s}px`, height: `${o.h * s}px` } });
        break;
      case "field":
        el = newFieldEl(o);
        break;
      default:
        el = h("div.obj");
    }
    el.dataset.id = o.id;
    if (S.sel === o.id) el.classList.add("sel");
    if (RESIZABLE.has(o.type)) el.append(h("span.h", { "aria-hidden": "true" }));
    if ((o.type === "text" || o.type === "textedit") && S.editing === o.id) {
      el.contentEditable = "plaintext-only";
      el.spellcheck = false;
      el.addEventListener("input", () => { o.text = el.innerText.replace(/\n$/, ""); syncPanelText(o); });
      el.addEventListener("blur", () => setTimeout(() => { if (S.editing === o.id && document.activeElement !== el) commitEditing(); }, 0));
      el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); commitEditing(); } });
      el.addEventListener("paste", (e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      });
    }
    return el;
  }

  function newFieldEl(o) {
    const s = S.scale;
    const el = h("div.fld.newf", { style: { left: `${o.x * s}px`, top: `${o.y * s}px`, width: `${o.w * s}px`, height: `${o.h * s}px` } });
    const fs = `${clamp(o.h * 0.68, 6, 13) * s}px`;
    let ctrl;
    if (o.kind === "checkbox") {
      ctrl = h("input", { type: "checkbox", checked: !!o.value, "aria-label": o.name });
      ctrl.addEventListener("change", () => { o.value = ctrl.checked; });
    } else if (o.kind === "combo") {
      ctrl = h("select", { "aria-label": o.name, style: { fontSize: fs } }, h("option", { value: "" }, "—"), (o.options || []).map((v) => h("option", { value: v, selected: o.value === v }, v)));
      ctrl.addEventListener("change", () => { o.value = ctrl.value; });
    } else if (o.kind === "signature") {
      el.classList.add("sig");
      ctrl = h("span", "İmza alanı");
    } else if (o.multiline) {
      ctrl = h("textarea", { "aria-label": o.name, style: { fontSize: fs } });
      ctrl.value = o.value || "";
      ctrl.addEventListener("input", () => { o.value = ctrl.value; });
    } else {
      ctrl = h("input", { type: "text", value: o.value || "", "aria-label": o.name, style: { fontSize: fs } });
      ctrl.addEventListener("input", () => { o.value = ctrl.value; });
    }
    el.append(ctrl, h("span.ftag", o.name || "alan"));
    return el;
  }

  function existingFieldEl(f) {
    const s = S.scale;
    const [x0, y0, x1, y1] = f.rect;
    const el = h("div.fld", { style: { left: `${x0 * s}px`, top: `${y0 * s}px`, width: `${(x1 - x0) * s}px`, height: `${(y1 - y0) * s}px` }, title: f.label || f.name });
    const val = S.fieldVals.has(f.xref) ? S.fieldVals.get(f.xref) : f.value;
    const fs = `${(f.fontsize || clamp((y1 - y0) * 0.68, 6, 12)) * s}px`;
    let ctrl;
    if (f.type === "checkbox" || f.type === "radio") {
      ctrl = h("input", { type: "checkbox", checked: !!val, disabled: f.readonly, "aria-label": f.name });
      ctrl.addEventListener("change", () => {
        S.fieldVals.set(f.xref, ctrl.checked);
        if (f.type === "radio" && ctrl.checked) {
          S.fields.filter((x) => x.type === "radio" && x.name === f.name && x.xref !== f.xref).forEach((x) => S.fieldVals.set(x.xref, false));
          renderAll();
        }
      });
    } else if (f.type === "combo" || f.type === "list") {
      ctrl = h("select", { disabled: f.readonly, "aria-label": f.name, style: { fontSize: fs } },
        h("option", { value: "" }, "—"), f.options.map((v) => h("option", { value: v, selected: val === v }, v)));
      ctrl.addEventListener("change", () => S.fieldVals.set(f.xref, ctrl.value));
    } else if (f.type === "signature") {
      el.classList.add("sig");
      ctrl = h("button.btn.sm.ghost", { type: "button", style: { height: "100%", width: "100%", fontSize: "11px" } }, "İmzala");
      ctrl.addEventListener("click", async () => {
        const data = await openSignature();
        if (!data) return;
        const img = new Image();
        img.onload = () => {
          const fw = x1 - x0, fh = y1 - y0;
          const r = Math.min(fw / img.naturalWidth, fh / img.naturalHeight);
          const w = img.naturalWidth * r, hh = img.naturalHeight * r;
          addObj({ type: "signature", page: f.page, x: x0 + (fw - w) / 2, y: y0 + (fh - hh) / 2, w, h: hh, data, opacity: 1 });
        };
        img.src = data;
      });
    } else if (f.multiline) {
      ctrl = h("textarea", { disabled: f.readonly, "aria-label": f.name, style: { fontSize: fs } });
      ctrl.value = val || "";
      ctrl.addEventListener("input", () => S.fieldVals.set(f.xref, ctrl.value));
    } else {
      ctrl = h("input", { type: "text", value: val || "", disabled: f.readonly, maxLength: f.maxlen || undefined, "aria-label": f.name, style: { fontSize: fs } });
      ctrl.addEventListener("input", () => S.fieldVals.set(f.xref, ctrl.value));
    }
    el.append(ctrl);
    return el;
  }

  function renderPage(n) {
    const p = P[n];
    if (!p) return;
    const s = S.scale;
    const ov = p.ov;
    const editingEl = S.editing ? ov.querySelector(`[data-id="${S.editing}"]`) : null;
    const caret = editingEl ? caretOffset(editingEl) : null;
    ov.replaceChildren();
    const draw = ["rect", "ellipse", "line", "arrow", "pen", "highlight", "whiteout", "link", "redact", "crop", "f-text", "f-check", "f-combo", "f-sign"];
    ov.className = `ov t-${draw.includes(S.tool) ? "draw" : S.tool}`;

    if (S.tool === "textedit") {
      const lines = S.lines.get(n);
      if (!lines) loadLines(n);
      else {
        const edited = new Set(S.objs.filter((o) => o.type === "textedit" && o.page === n).map((o) => o.lineId));
        for (const l of lines) {
          if (!l.editable || edited.has(l.id)) continue;
          const [x0, y0, x1, y1] = l.bbox;
          ov.append(h("div.tl", { dataset: { line: l.id }, title: "Düzeltmek için tıkla", style: { left: `${x0 * s}px`, top: `${y0 * s}px`, width: `${(x1 - x0) * s}px`, height: `${(y1 - y0) * s}px` } }));
        }
      }
    }
    for (const hit of S.hits) {
      if (hit.page !== n) continue;
      const [x0, y0, x1, y1] = hit.rect;
      ov.append(h(`div.hit${mode === "find" ? ".find" : ""}`, { style: { left: `${x0 * s}px`, top: `${y0 * s}px`, width: `${(x1 - x0) * s}px`, height: `${(y1 - y0) * s}px` } }));
    }
    if (mode === "form") for (const f of S.fields) if (f.page === n && !S.removed.has(f.xref)) ov.append(existingFieldEl(f));
    for (const o of S.objs) {
      if (o.page !== n) continue;
      if (o.type === "textedit") {
        const [x0, y0, x1, y1] = o.bbox;
        ov.append(h("div.mask", { style: { left: `${(x0 - 1) * s}px`, top: `${y0 * s}px`, width: `${(x1 - x0 + 2) * s}px`, height: `${(y1 - y0) * s}px` } }));
      }
      ov.append(objEl(o));
    }
    if (S.editing) {
      const el = ov.querySelector(`[data-id="${S.editing}"]`);
      if (el) { el.focus(); placeCaret(el, caret); }
    }
  }
  function renderAll() { P.forEach((_, n) => renderPage(n)); updateHint(); }

  function caretOffset(el) {
    const s = window.getSelection();
    if (!s.rangeCount || !el.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }
  function placeCaret(el, offset) {
    const s = window.getSelection();
    const r = document.createRange();
    if (offset === null || offset === undefined) { r.selectNodeContents(el); r.collapse(false); }
    else {
      let rem = offset, node = el.firstChild;
      while (node && node.nodeType === 3 && rem > node.length) { rem -= node.length; node = node.nextSibling; }
      if (node && node.nodeType === 3) r.setStart(node, Math.min(rem, node.length));
      else { r.selectNodeContents(el); r.collapse(false); }
    }
    s.removeAllRanges();
    s.addRange(r);
  }

  async function loadLines(n) {
    if (S.linesLoading.has(n)) return;
    S.linesLoading.add(n);
    try {
      const r = await api.pageText(file.id, n);
      S.lines.set(n, r.lines);
      if (n === 0 && !r.lines.length && pages.length === 1) toast("Bu sayfada düzenlenebilir metin yok. Taranmış bir belgeyse önce OCR uygula.", "err");
    } catch (e) { S.lines.set(n, []); toast(e.message, "err"); }
    renderPage(n);
  }

  // ---------------- düzenleme ----------------
  function focusEditing() {
    requestAnimationFrame(() => {
      const el = pagesEl.querySelector(`[data-id="${S.editing}"]`);
      if (!el) return;
      el.focus();
      const o = byId(S.editing);
      if (o && o.type === "text" && o._fresh) {
        document.execCommand("selectAll", false, null);
        delete o._fresh;
      } else placeCaret(el, null);
    });
  }
  function startEditing(o) {
    if (o.type === "textedit" && o.deleted) return;
    S.sel = o.id;
    S.editing = o.id;
    o._before = o.text;
    renderPage(o.page);
    renderPanel();
    focusEditing();
  }
  function commitEditing() {
    if (!S.editing) return;
    const o = byId(S.editing);
    S.editing = null;
    if (!o) return;
    if (o.type === "text" && !o.text.trim()) {
      S.objs = S.objs.filter((x) => x !== o);
      if (S.sel === o.id) S.sel = null;
    } else if (o._before !== undefined && o._before !== o.text) {
      const cur = o.text;
      o.text = o._before;
      checkpoint();
      o.text = cur;
    }
    delete o._before;
    renderPage(o.page);
    renderPanel();
  }

  function createTextEdit(n, lineId) {
    const l = (S.lines.get(n) || []).find((x) => x.id === lineId);
    if (!l) return;
    const o = addObj({
      type: "textedit", page: n, lineId: l.id, original: l.text, bbox: l.bbox, text: l.text,
      size: l.size, color: l.color, family: "auto", css: l.css, bold: l.bold, italic: l.italic,
      origSize: l.size, origColor: l.color, origBold: l.bold, origItalic: l.italic, dx: 0, dy: 0, deleted: false,
    });
    startEditing(o);
  }

  // ---------------- işaretçi olayları ----------------
  function onDbl(e) {
    const el = e.target.closest(".obj");
    if (!el) return;
    const o = byId(el.dataset.id);
    if (o && (o.type === "text" || o.type === "textedit")) startEditing(o);
    if (o && o.type === "note") { S.sel = o.id; renderPanel(); ctx.panelSlot.querySelector("textarea")?.focus(); }
  }

  function onDown(e, n) {
    if (e.button !== 0) return;
    const t = e.target;
    if (t.isContentEditable) return;
    const fld = t.closest(".fld");
    if (fld && t.closest("input, select, textarea, button")) {
      if (fld.classList.contains("newf")) { S.sel = fld.dataset.id; markSelection(); renderPanel(); }
      return;
    }
    const objEl = t.closest(".obj, .fld.newf");
    if (objEl && objEl.dataset.id) {
      const o = byId(objEl.dataset.id);
      if (!o) return;
      e.preventDefault();
      if (S.editing && S.editing !== o.id) commitEditing();
      S.sel = o.id;
      markSelection();
      renderPanel();
      if (t.classList.contains("h")) drag(e, n, "resize", o);
      else drag(e, n, "move", o);
      return;
    }
    const tl = t.closest(".tl");
    if (tl) { e.preventDefault(); commitEditing(); createTextEdit(n, tl.dataset.line); return; }

    // boş alan
    e.preventDefault();
    const wasEditing = !!S.editing;
    commitEditing();
    const p = ptOf(e, n);
    const tool = S.tool;
    if (tool === "select" || tool === "textedit") {
      if (S.sel) { S.sel = null; markSelection(); renderPanel(); }
      return;
    }
    if (tool === "text") {
      if (wasEditing) return;
      const d = S.def.text;
      const o = addObj({ type: "text", page: n, x: p.x, y: p.y - d.size * 0.6, text: "", ...d }, { edit: true });
      o._before = "";
      return;
    }
    if (tool === "note") {
      addObj({ type: "note", page: n, x: p.x - 11 / S.scale, y: p.y - 11 / S.scale, text: "" });
      setTimeout(() => ctx.panelSlot.querySelector("textarea")?.focus(), 30);
      return;
    }
    if (tool === "line" || tool === "arrow") {
      const d = S.def.shape;
      const o = { type: tool, page: n, x1: p.x, y1: p.y, x2: p.x, y2: p.y, stroke: d.stroke, width: d.width, opacity: d.opacity };
      createDrag(e, n, o, (q, ev) => {
        let { x, y } = q;
        if (ev.shiftKey) {
          const a = Math.round(Math.atan2(y - o.y1, x - o.x1) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(x - o.x1, y - o.y1);
          x = o.x1 + len * Math.cos(a); y = o.y1 + len * Math.sin(a);
        }
        o.x2 = x; o.y2 = y;
      }, () => Math.hypot(o.x2 - o.x1, o.y2 - o.y1) > 3);
      return;
    }
    if (tool === "pen") {
      const d = S.def.pen;
      const o = { type: "ink", page: n, paths: [[[p.x, p.y]]], stroke: d.stroke, width: d.width, opacity: d.opacity };
      createDrag(e, n, o, (q) => {
        const path = o.paths[0];
        const last = path[path.length - 1];
        if (Math.hypot(q.x - last[0], q.y - last[1]) > 0.8 / S.scale) path.push([q.x, q.y]);
      }, () => true);
      return;
    }
    // dikdörtgen tabanlı araçlar
    const rectTools = { rect: "rect", ellipse: "ellipse", highlight: "highlight", whiteout: "whiteout", link: "link", redact: "redact", crop: "crop", "f-text": "field", "f-check": "field", "f-combo": "field", "f-sign": "field" };
    const type = rectTools[tool];
    if (!type) return;
    let o = { type, page: n, x: p.x, y: p.y, w: 0, h: 0 };
    if (type === "rect" || type === "ellipse") Object.assign(o, { stroke: S.def.shape.stroke, fill: S.def.shape.fill, width: S.def.shape.width, opacity: S.def.shape.opacity });
    if (type === "highlight") Object.assign(o, S.def.highlight);
    if (type === "whiteout") Object.assign(o, S.def.whiteout);
    if (type === "link") o.url = "";
    if (type === "field") {
      const kind = FIELD_KIND[tool];
      const count = S.objs.filter((x) => x.type === "field").length + S.fields.length + 1;
      Object.assign(o, { kind, name: `${{ text: "metin", checkbox: "onay", combo: "liste", signature: "imza" }[kind]}_${count}`, value: kind === "checkbox" ? false : "", options: kind === "combo" ? ["Seçenek 1", "Seçenek 2"] : [], multiline: false, required: false });
    }
    if (type === "crop") S.objs = S.objs.filter((x) => x.type !== "crop");
    const x0 = p.x, y0 = p.y;
    createDrag(e, n, o, (q) => {
      o.x = Math.min(x0, q.x); o.y = Math.min(y0, q.y);
      o.w = Math.abs(q.x - x0); o.h = Math.abs(q.y - y0);
      if (type === "field" && o.kind === "checkbox") { const side = Math.max(o.w, o.h); o.w = o.h = side; }
    }, () => {
      if (o.w >= 4 && o.h >= 4) return true;
      if (type === "field") {
        const [w, hh] = FIELD_DEFAULT[o.kind];
        o.w = w; o.h = hh; o.x = clamp(x0, 0, pages[n].w - w); o.y = clamp(y0 - hh / 2, 0, pages[n].h - hh);
        return true;
      }
      if (type === "highlight" || type === "whiteout" || type === "rect" || type === "ellipse") {
        o.w = 120; o.h = type === "highlight" ? 16 : 40; o.x = x0; o.y = y0 - o.h / 2;
        return true;
      }
      return false;
    });
  }

  /** Yeni nesneyi sürükleyerek oluşturur. */
  function createDrag(e, n, o, update, keep) {
    const ov = P[n].ov;
    ov.setPointerCapture(e.pointerId);
    o.id = nid();
    const before = snap();
    S.objs.push(o);
    let el = objEl(o);
    ov.append(el);
    const mv = (ev) => {
      const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      for (const x of evs) update(ptOf(x, n), x);
      const nel = objEl(o);
      el.replaceWith(nel);
      el = nel;
    };
    const up = () => {
      ov.removeEventListener("pointermove", mv);
      ov.removeEventListener("pointerup", up);
      ov.removeEventListener("pointercancel", up);
      if (!keep()) { S.objs = S.objs.filter((x) => x !== o); renderPage(n); return; }
      S.undo.push(before);
      S.redo = [];
      S.sel = o.id;
      renderPage(n);
      renderPanel();
      if (o.type === "link") setTimeout(() => ctx.panelSlot.querySelector("input")?.focus(), 30);
    };
    ov.addEventListener("pointermove", mv);
    ov.addEventListener("pointerup", up);
    ov.addEventListener("pointercancel", up);
  }

  /** Var olan nesneyi taşır ya da boyutlandırır. */
  function drag(e, n, kind, o) {
    const ov = P[n].ov;
    ov.setPointerCapture(e.pointerId);
    const start = ptOf(e, n);
    const orig = structuredClone(o);
    const box0 = bboxOf(orig);
    const before = snap();
    let moved = false;
    let el = ov.querySelector(`[data-id="${o.id}"]`);
    const mv = (ev) => {
      const q = ptOf(ev, n);
      const dx = q.x - start.x, dy = q.y - start.y;
      if (!moved && Math.hypot(dx, dy) * S.scale < 3) return;
      moved = true;
      Object.assign(o, structuredClone(orig));
      if (kind === "move") {
        const b = box0;
        const mdx = clamp(dx, -b.x, pages[n].w - b.x - b.w);
        const mdy = clamp(dy, -b.y, pages[n].h - b.y - b.h);
        move(o, mdx, mdy);
      } else resize(o, orig, box0, dx, dy, ev.shiftKey);
      const nel = objEl(o);
      if (el) el.replaceWith(nel);
      el = nel;
      if (o.type === "textedit") renderPage(n);
    };
    const up = () => {
      ov.removeEventListener("pointermove", mv);
      ov.removeEventListener("pointerup", up);
      ov.removeEventListener("pointercancel", up);
      if (moved) { S.undo.push(before); S.redo = []; renderPage(n); renderPanel(); }
    };
    ov.addEventListener("pointermove", mv);
    ov.addEventListener("pointerup", up);
    ov.addEventListener("pointercancel", up);
  }

  function resize(o, orig, box0, dx, dy, free) {
    if (o.type === "line" || o.type === "arrow") { o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; return; }
    if (o.type === "ink") {
      const sx = Math.max(0.05, (box0.w + dx) / Math.max(box0.w, 1)), sy = Math.max(0.05, (box0.h + dy) / Math.max(box0.h, 1));
      o.paths = orig.paths.map((pth) => pth.map(([x, y]) => [box0.x + (x - box0.x) * sx, box0.y + (y - box0.y) * sy]));
      return;
    }
    if (o.type === "text" || o.type === "textedit") {
      const el = pagesEl.querySelector(`[data-id="${o.id}"]`);
      const h0 = el ? el.offsetHeight / S.scale : orig.size * 1.2;
      o.size = Math.round(clamp(orig.size * (h0 + dy) / Math.max(h0, 1), 4, 300) * 10) / 10;
      return;
    }
    let w = Math.max(4, orig.w + dx), hh = Math.max(4, orig.h + dy);
    if ((o.type === "image" || o.type === "signature") && !free) hh = w * orig.h / orig.w;
    if (o.type === "field" && o.kind === "checkbox") hh = w;
    o.w = w; o.h = hh;
  }

  function markSelection() {
    pagesEl.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
    if (S.sel) pagesEl.querySelector(`[data-id="${S.sel}"]`)?.classList.add("sel");
  }

  // ---------------- form ----------------
  async function loadFields() {
    try {
      const r = await api.fields(file.id);
      S.fields = r.fields;
    } catch (e) { toast(e.message, "err"); }
    renderAll();
    renderPanel();
    if (ctx.tool.autodetect || !S.fields.length) await detect(!ctx.tool.autodetect && !S.fields.length ? "auto" : true);
  }

  async function detect(origin) {
    const hint = hintEl.textContent;
    hintEl.textContent = "Form alanları algılanıyor…";
    try {
      const r = await api.detectFields(file.id);
      const existingRects = S.objs.filter((o) => o.type === "field");
      const fresh = r.fields.filter((f) => !existingRects.some((o) => o.page === f.page && Math.abs(o.x - f.rect[0]) < 2 && Math.abs(o.y - f.rect[1]) < 2));
      if (!fresh.length) {
        if (origin !== "auto") toast("Yeni bir form alanı bulunamadı. Araç çubuğundan elle ekleyebilirsin.");
        else if (!S.fields.length) toast("Bu PDF'te doldurulabilir alan yok. Alanları araç çubuğundan elle ekleyebilirsin.");
        return;
      }
      checkpoint();
      for (const f of fresh) {
        S.objs.push({
          id: nid(), type: "field", kind: f.type, page: f.page, x: f.rect[0], y: f.rect[1], w: f.rect[2] - f.rect[0], h: f.rect[3] - f.rect[1],
          name: f.name, label: f.label, value: f.type === "checkbox" ? false : "", options: [], multiline: f.multiline, required: false,
        });
      }
      renderAll();
      renderPanel();
      toast(origin === "auto" ? `Doldurulabilir alan yoktu; ${fresh.length} alan otomatik algılandı. Kontrol edip doldurabilirsin.` : `${fresh.length} alan algılandı.`);
    } catch (e) { toast(e.message, "err"); } finally { hintEl.textContent = hint; updateHint(); }
  }

  // ---------------- arama (karartma / bul) ----------------
  const doSearch = debounce(async () => {
    const o = ctx.opts;
    let body;
    if (mode === "find") body = { terms: (o.pairs || []).map((p) => p.find).filter(Boolean), case: o.case, whole_word: o.whole_word };
    else body = { terms: (o.terms_text || "").split("\n").map((x) => x.trim()).filter(Boolean), presets: o.presets || [], case: o.case };
    if (!body.terms.length && !(body.presets || []).length) { S.hits = []; renderAll(); return; }
    try { S.hits = (await api.search(file.id, body)).hits; } catch { S.hits = []; }
    renderAll();
  }, 350);

  function updateHint() {
    if (mode === "find") {
      const n = S.hits.length;
      hintEl.textContent = n ? `${n} eşleşme bulundu — sarıyla işaretli yerler değişecek.` : "Sağdaki kutuya aranacak metni yaz; bulunan yerler sayfada işaretlenir.";
      return;
    }
    if (mode === "redact" && S.hits.length) { hintEl.textContent = `${S.hits.length} otomatik eşleşme + ${S.objs.filter((o) => o.type === "redact").length} elle seçilen alan`; return; }
    if (mode === "crop" && ctx.opts.mode === "auto") { hintEl.textContent = "Beyaz kenarlar otomatik bulunacak."; return; }
    hintEl.textContent = HINTS[S.tool] || "";
    viewport.classList.toggle("hand-tool", S.tool === "hand");
  }

  // ---------------- özellikler paneli ----------------
  function syncPanelText(o) {
    const ta = ctx.panelSlot && ctx.panelSlot.querySelector("textarea[data-role=text]");
    if (ta && document.activeElement !== ta) ta.value = o.text;
  }

  function prop(label, control) { return h("div.field", h("span.field-label", label), control); }
  function colorInput(val, onInput) {
    const c = h("input.input", { type: "color", value: val || "#000000" });
    let started = false;
    c.addEventListener("input", () => { if (!started) { checkpoint(); started = true; } onInput(c.value); });
    c.addEventListener("change", () => { started = false; });
    return c;
  }
  function numberInput(val, min, max, step, onInput) {
    const i = h("input.input", { type: "number", value: val, min, max, step });
    i.addEventListener("focus", () => checkpoint(), { once: true });
    i.addEventListener("input", () => { if (i.value !== "") onInput(Number(i.value)); });
    return i;
  }
  function rangeInput(val, min, max, step, onInput) {
    const r = h("input", { type: "range", value: val, min, max, step });
    r.addEventListener("pointerdown", () => checkpoint());
    r.addEventListener("input", () => onInput(Number(r.value)));
    return r;
  }
  function toggle(label, on, onChange) {
    const b = h("button.btn.sm", { type: "button", "aria-pressed": String(!!on), style: on ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "var(--accent)" } : null }, label);
    b.addEventListener("click", () => { checkpoint(); onChange(!on); });
    return b;
  }
  function fontSelect(val, withAuto, onChange) {
    const opts = (ctx.caps.fonts || [{ id: "arial", label: "Arial" }]).map((f) => [f.id, f.label]);
    if (withAuto) opts.unshift(["auto", "Orijinal yazı tipi"]);
    const s = h("select.input", opts.map(([v, l]) => h("option", { value: v, selected: v === val }, l)));
    s.addEventListener("change", () => { checkpoint(); onChange(s.value); });
    return s;
  }

  function textProps(o, isDefault) {
    const rer = () => { if (!isDefault) renderPage(o.page); renderPanel(); };
    const out = [];
    if (!isDefault) {
      const ta = h("textarea.input", { rows: 2, dataset: { role: "text" } });
      ta.value = o.text;
      ta.addEventListener("focus", () => checkpoint(), { once: true });
      ta.addEventListener("input", () => { o.text = ta.value; renderPage(o.page); });
      out.push(prop("Metin", ta));
    }
    out.push(prop("Yazı tipi", fontSelect(o.family, o.type === "textedit", (v) => { o.family = v; rer(); })));
    out.push(h("div.row",
      h("div.grow", prop("Boyut (pt)", numberInput(o.size, 4, 300, 0.5, (v) => { o.size = v; if (!isDefault) renderPage(o.page); }))),
      prop("Renk", colorInput(o.color, (v) => { o.color = v; if (!isDefault) renderPage(o.page); }))));
    out.push(h("div.row",
      toggle("Kalın", o.bold, (v) => { o.bold = v; if (o.family === "auto") o.family = "auto"; rer(); }),
      toggle("İtalik", o.italic, (v) => { o.italic = v; rer(); }),
      o.type === "text" || isDefault ? h("select.input", { style: { width: "auto" }, "aria-label": "Hizalama", onchange: (e) => { checkpoint(); o.align = e.target.value; rer(); } },
        [["left", "Sola"], ["center", "Ortaya"], ["right", "Sağa"]].map(([v, l]) => h("option", { value: v, selected: (o.align || "left") === v }, l))) : null));
    return out;
  }

  function shapeProps(o, isDefault) {
    const rer = () => { if (!isDefault) renderPage(o.page); };
    const strokeNone = h("input", { type: "checkbox", checked: !o.stroke });
    strokeNone.addEventListener("change", () => { checkpoint(); o.stroke = strokeNone.checked ? "" : "#cf006d"; rer(); renderPanel(); });
    const fillNone = h("input", { type: "checkbox", checked: !o.fill });
    fillNone.addEventListener("change", () => { checkpoint(); o.fill = fillNone.checked ? "" : "#f2bd00"; rer(); renderPanel(); });
    return [
      h("div.row", h("div.grow", prop("Kenar rengi", colorInput(o.stroke || "#cf006d", (v) => { o.stroke = v; strokeNone.checked = false; rer(); }))), h("label.check", strokeNone, "Yok")),
      h("div.row", h("div.grow", prop("Dolgu rengi", colorInput(o.fill || "#f2bd00", (v) => { o.fill = v; fillNone.checked = false; rer(); }))), h("label.check", fillNone, "Yok")),
      prop("Kalınlık", numberInput(o.width, 0.5, 30, 0.5, (v) => { o.width = v; rer(); })),
      prop("Opaklık", rangeInput(o.opacity ?? 1, 0.1, 1, 0.05, (v) => { o.opacity = v; rer(); })),
    ];
  }

  function strokeProps(o, isDefault) {
    const rer = () => { if (!isDefault) renderPage(o.page); };
    return [
      prop("Renk", colorInput(o.stroke, (v) => { o.stroke = v; rer(); })),
      prop("Kalınlık", numberInput(o.width, 0.5, 30, 0.5, (v) => { o.width = v; rer(); })),
      prop("Opaklık", rangeInput(o.opacity ?? 1, 0.1, 1, 0.05, (v) => { o.opacity = v; rer(); })),
    ];
  }

  function fieldProps(o) {
    const name = h("input.input", { value: o.name });
    name.addEventListener("focus", () => checkpoint(), { once: true });
    name.addEventListener("input", () => { o.name = name.value.replace(/\s+/g, "_"); const tag = pagesEl.querySelector(`[data-id="${o.id}"] .ftag`); if (tag) tag.textContent = o.name; });
    const kind = h("select.input", [["text", "Metin"], ["checkbox", "Onay kutusu"], ["combo", "Açılır liste"], ["signature", "İmza alanı"]].map(([v, l]) => h("option", { value: v, selected: o.kind === v }, l)));
    kind.addEventListener("change", () => {
      checkpoint();
      o.kind = kind.value;
      o.value = o.kind === "checkbox" ? false : "";
      if (o.kind === "combo" && !o.options.length) o.options = ["Seçenek 1", "Seçenek 2"];
      if (o.kind === "checkbox") { const s = Math.min(o.w, o.h); o.w = o.h = Math.max(s, 10); }
      renderPage(o.page); renderPanel();
    });
    const out = [prop("Alan adı", name), prop("Tür", kind)];
    if (o.kind === "combo") {
      const ta = h("textarea.input", { rows: 3 });
      ta.value = (o.options || []).join("\n");
      ta.addEventListener("change", () => { checkpoint(); o.options = ta.value.split("\n").map((x) => x.trim()).filter(Boolean); renderPage(o.page); });
      out.push(prop("Seçenekler (her satıra bir tane)", ta));
    }
    if (o.kind === "text") {
      const ml = h("input", { type: "checkbox", checked: !!o.multiline });
      ml.addEventListener("change", () => { checkpoint(); o.multiline = ml.checked; renderPage(o.page); });
      out.push(h("label.check", ml, h("span", "Çok satırlı")));
    }
    const rq = h("input", { type: "checkbox", checked: !!o.required });
    rq.addEventListener("change", () => { o.required = rq.checked; });
    out.push(h("label.check", rq, h("span", "Zorunlu alan")));
    if (o.label) out.push(h("div.hint", `Algılanan etiket: “${o.label}”`));
    return out;
  }

  function propsFor(o) {
    const out = [h("h3", NAMES[o.type] || "Öğe")];
    switch (o.type) {
      case "text": out.push(...textProps(o)); break;
      case "textedit": {
        out.push(h("div.hint", `Orijinal: “${o.original}”`));
        out.push(...textProps(o));
        const del = h("button.btn.sm", { type: "button", onclick: () => { checkpoint(); o.deleted = !o.deleted; S.editing = null; renderPage(o.page); renderPanel(); } },
          icon(o.deleted ? "undo-2" : "trash-2"), o.deleted ? "Satırı geri getir" : "Satırı sayfadan sil");
        const reset = h("button.btn.sm.ghost", { type: "button", onclick: () => { removeObj(o); toast("Satır orijinal haline döndü."); } }, icon("rotate-ccw"), "Orijinale dön");
        out.push(h("div.row", { style: { flexWrap: "wrap" } }, del, reset));
        if (o.dx || o.dy) out.push(h("button.btn.sm.ghost", { type: "button", onclick: () => { checkpoint(); o.dx = 0; o.dy = 0; renderPage(o.page); renderPanel(); } }, "Eski konumuna al"));
        break;
      }
      case "image": case "signature":
        out.push(prop("Opaklık", rangeInput(o.opacity ?? 1, 0.1, 1, 0.05, (v) => { o.opacity = v; renderPage(o.page); })));
        out.push(h("div.hint", "Köşeden boyutlandırırken oran korunur; Shift ile serbest boyutlandır."));
        break;
      case "rect": case "ellipse": out.push(...shapeProps(o)); break;
      case "line": case "arrow": case "ink": out.push(...strokeProps(o)); break;
      case "highlight":
        out.push(h("div.row", ["#ffd400", "#7ce36b", "#5bc8ff", "#ff7ab8"].map((c) => h("button", { type: "button", "aria-label": c, style: { width: "30px", height: "30px", borderRadius: "6px", border: o.color === c ? "2px solid var(--ink)" : "1px solid var(--rule-2)", background: c }, onclick: () => { checkpoint(); o.color = c; S.def.highlight.color = c; renderPage(o.page); renderPanel(); } }))));
        out.push(prop("Opaklık", rangeInput(o.opacity, 0.15, 0.9, 0.05, (v) => { o.opacity = v; renderPage(o.page); })));
        break;
      case "whiteout":
        out.push(prop("Renk", colorInput(o.color, (v) => { o.color = v; renderPage(o.page); })));
        out.push(h("div.hint", "Beyaz kutu alttaki içeriği yalnızca görsel olarak örter. Kalıcı silme için “Karart” aracını kullan."));
        break;
      case "note": {
        const ta = h("textarea.input", { rows: 4, placeholder: "Not içeriği" });
        ta.value = o.text;
        ta.addEventListener("input", () => { o.text = ta.value; });
        out.push(prop("Not", ta));
        break;
      }
      case "link": {
        const url = h("input.input", { value: o.url || "", placeholder: "https://… ya da e-posta" });
        url.addEventListener("input", () => { o.url = url.value; o.target_page = null; });
        const pg = h("input.input", { type: "number", min: 1, max: pages.length, value: o.target_page || "", placeholder: "Sayfa no" });
        pg.addEventListener("input", () => { o.target_page = pg.value ? Number(pg.value) : null; if (o.target_page) { o.url = ""; url.value = ""; } });
        out.push(prop("Web adresi", url), prop("ya da belgedeki bir sayfaya git", pg));
        break;
      }
      case "redact": out.push(h("div.hint", "Bu alandaki metin, görsel ve çizimler kaydederken kalıcı olarak silinir.")); break;
      case "crop": out.push(h("div.hint", `Seçili alan: ${Math.round(o.w)} × ${Math.round(o.h)} pt`)); break;
      case "field": out.push(...fieldProps(o)); break;
      default: break;
    }
    const acts = [];
    if (!["crop", "textedit"].includes(o.type)) acts.push(h("button.btn.sm", { type: "button", onclick: () => duplicate(o) }, icon("copy"), "Kopyala"));
    if (o.type !== "textedit") acts.push(h("button.btn.sm.danger", { type: "button", onclick: () => removeObj(o) }, icon("trash-2"), "Sil"));
    if (acts.length) out.push(h("div.row", acts));
    return out;
  }

  function toolPanel() {
    const out = [];
    const tool = S.tool;
    const summary = changeSummary();
    if (mode === "sign") {
      out.push(h("h3", "İmza ekle"));
      out.push(h("div", { style: { display: "grid", gap: "8px" } },
        h("button.btn.primary.block", { type: "button", onclick: () => runAction("sign") }, icon("signature"), "İmzamı ekle"),
        h("button.btn.block", { type: "button", onclick: () => runAction("initials") }, icon("pen-line"), "Paraf ekle"),
        h("button.btn.block", { type: "button", onclick: () => runAction("date") }, icon("calendar"), "Tarih ekle"),
        h("button.btn.block", { type: "button", onclick: () => chooseTool("text") }, icon("type"), "Ad soyad / metin ekle")));
      out.push(h("div.hint", "Eklediğin imzayı sürükleyerek yerleştir, köşesinden boyutlandır."));
    } else if (mode === "form") {
      const nNew = S.objs.filter((o) => o.type === "field").length;
      out.push(h("h3", "Form alanları"));
      out.push(h("div.stat-line", h("div", h("b", S.fields.length), h("span", "mevcut alan")), h("div", h("b", nNew), h("span", "yeni alan"))));
      out.push(h("button.btn.block", { type: "button", onclick: () => detect(true) }, icon("wand-sparkles"), "Alanları otomatik algıla"));
      out.push(h("div.hint", "Alanlara doğrudan sayfa üzerinde yazabilirsin. Yeni alanların adını ve türünü değiştirmek için alanın etiketine tıkla; sürükleyerek taşı."));
    } else if (mode === "crop") {
      out.push(h("h3", "Kırpma"));
      out.push(h("div.hint", ctx.opts.mode === "auto" ? "Her sayfanın beyaz kenarları otomatik bulunup kırpılacak." : "Sayfa üzerinde kalacak alanı sürükleyerek seç."));
    } else if (mode === "find") {
      out.push(h("div.hint", "Değişiklikler orijinal yazı tipi, boyut ve renkle yazılır. Taranmış belgelerde önce OCR uygula."));
    } else if (mode === "redact") {
      out.push(h("h3", "Karartma"));
      out.push(h("div.hint", "Sayfada alan çiz ya da aşağıdan otomatik aranacakları seç. İşaretli her şey kalıcı olarak silinir ve siyah kutuyla kapatılır."));
    } else {
      const d = TOOLDEF[tool];
      out.push(h("h3", d ? d.tip : "Düzenle"));
      if (HINTS[tool]) out.push(h("div.hint", HINTS[tool]));
      if (tool === "text") out.push(...textProps(S.def.text, true));
      if (["rect", "ellipse", "line", "arrow"].includes(tool)) out.push(...(tool === "rect" || tool === "ellipse" ? shapeProps(S.def.shape, true) : strokeProps(S.def.shape, true)));
      if (tool === "pen") out.push(...strokeProps(S.def.pen, true));
      if (tool === "textedit") {
        out.push(h("div.note", "Değiştirdiğin satır orijinal yazı tipiyle yeniden yazılır. Yazı tipinde olmayan bir harf yazarsan en yakın Windows yazı tipi kullanılır."));
      }
    }
    if (summary) out.push(h("div.note", summary));
    return out;
  }

  function changeSummary() {
    const n = S.objs.filter((o) => o.type !== "crop" && (o.type !== "textedit" || isChanged(o))).length;
    if (!n || mode === "form" || mode === "crop") return "";
    return `${n} değişiklik kaydedilmeyi bekliyor.`;
  }

  function renderPanel() {
    const slot = ctx.panelSlot;
    if (!slot) return;
    const o = selected();
    const active = document.activeElement;
    if (o && slot.contains(active) && (active.tagName === "TEXTAREA" || active.type === "text" || active.type === "number")) return;
    slot.replaceChildren(...(o ? propsFor(o) : toolPanel()));
  }

  // ---------------- klavye ----------------
  function onKey(e) {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
    if (document.querySelector("dialog[open]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ["+", "=", "-", "0"].includes(e.key) && !typing) {
      e.preventDefault();
      if (e.key === "0") { S.autoFit = true; fit(); } else zoom(e.key === "-" ? 1 / 1.2 : 1.2);
      return;
    }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (!e.repeat) { commitEditing(); ctx.run(); } return; }
    if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); return; }
    if (typing) return;
    if (e.code === "Space") { e.preventDefault(); spaceHeld = true; viewport.classList.add("pan-ready"); return; }
    const o = selected();
    if ((e.key === "Delete" || e.key === "Backspace") && o) {
      e.preventDefault();
      if (o.type === "textedit") { checkpoint(); o.deleted = true; renderPage(o.page); renderPanel(); }
      else removeObj(o);
      return;
    }
    if (mod && e.key.toLowerCase() === "d" && o) { e.preventDefault(); duplicate(o); return; }
    if (e.key === "Escape") { S.sel = null; markSelection(); if (palette.includes("select")) chooseTool("select"); else renderPanel(); return; }
    if (e.key === "Enter" && o && (o.type === "text" || o.type === "textedit")) { e.preventDefault(); startEditing(o); return; }
    if (o && e.key.startsWith("Arrow")) {
      e.preventDefault();
      checkpoint();
      const step = e.shiftKey ? 10 : 1;
      move(o, e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      renderPage(o.page);
      return;
    }
    if (!mod && !e.altKey) {
      const k = palette.find((t) => TOOLDEF[t] && TOOLDEF[t].key === e.key.toLowerCase());
      if (k) { e.preventDefault(); chooseTool(k); }
    }
  }
  document.addEventListener("keydown", onKey);

  // ---------------- sunucuya gönderilecek seçenekler ----------------
  function isChanged(o) {
    return o.deleted || o.dx || o.dy || o.text !== o.original || o.size !== o.origSize || o.color !== o.origColor ||
      o.bold !== o.origBold || o.italic !== o.origItalic || o.family !== "auto";
  }

  function buildOps() {
    const ops = [];
    for (const o of S.objs) {
      const b = { page: o.page };
      switch (o.type) {
        case "text": ops.push({ ...b, type: "text", x: o.x, y: o.y, w: 0, text: o.text, size: o.size, family: o.family, bold: o.bold, italic: o.italic, color: o.color, align: o.align, bg: o.bg }); break;
        case "textedit":
          if (!isChanged(o)) break;
          ops.push({ ...b, type: "textedit", id: o.lineId, original: o.original, bbox: o.bbox, text: o.text, size: o.size, color: o.color,
            family: o.family, bold: o.bold !== o.origBold ? o.bold : null, italic: o.italic !== o.origItalic ? o.italic : null, dx: o.dx, dy: o.dy, delete: !!o.deleted });
          break;
        case "image": case "signature": ops.push({ ...b, type: "image", x: o.x, y: o.y, w: o.w, h: o.h, data: o.data, opacity: o.opacity ?? 1 }); break;
        case "rect": case "ellipse": ops.push({ ...b, type: o.type, x: o.x, y: o.y, w: o.w, h: o.h, stroke: o.stroke, fill: o.fill, width: o.width, opacity: o.opacity }); break;
        case "line": case "arrow": ops.push({ ...b, type: o.type, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: o.stroke, width: o.width, opacity: o.opacity }); break;
        case "ink": ops.push({ ...b, type: "ink", paths: o.paths, stroke: o.stroke, width: o.width, opacity: o.opacity }); break;
        case "highlight": ops.push({ ...b, type: "highlight", x: o.x, y: o.y, w: o.w, h: o.h, color: o.color, opacity: o.opacity }); break;
        case "whiteout": ops.push({ ...b, type: "whiteout", x: o.x, y: o.y, w: o.w, h: o.h, color: o.color }); break;
        case "note": ops.push({ ...b, type: "note", x: o.x, y: o.y, text: o.text }); break;
        case "link": if (o.url || o.target_page) ops.push({ ...b, type: "link", x: o.x, y: o.y, w: o.w, h: o.h, url: o.url, target_page: o.target_page }); break;
        default: break;
      }
    }
    return ops;
  }

  // ---------------- başlat ----------------
  drawTools();
  fit();
  renderPanel();
  if (mode === "form") loadFields();
  if (mode === "find" || mode === "redact") doSearch();
  const offOpts = ctx.onOpts((key) => {
    if (mode === "find" || mode === "redact") doSearch();
    if (mode === "crop" && key === "mode") { updateHint(); renderPanel(); }
  });
  if (S.tool === "textedit") toast("Düzeltmek istediğin satıra tıkla.");

  return {
    hasChanges() { commitEditing(); return !!(S.objs.length || S.fieldVals.size); },
    options() {
      commitEditing();
      if (mode === "redact") return { areas: S.objs.filter((o) => o.type === "redact").map((o) => ({ page: o.page, x: o.x, y: o.y, w: o.w, h: o.h })) };
      if (mode === "crop") {
        const c = S.objs.find((o) => o.type === "crop");
        return c ? { rect: { x: c.x, y: c.y, w: c.w, h: c.h }, page: c.page } : {};
      }
      if (mode === "form") {
        const sigOps = buildOps();
        return {
          values: [...S.fieldVals].map(([xref, value]) => ({ xref, value })),
          new_fields: S.objs.filter((o) => o.type === "field").map((o) => ({
            page: o.page, rect: [o.x, o.y, o.x + o.w, o.y + o.h], type: o.kind, name: o.name, label: o.label,
            value: o.value, options: o.options, multiline: o.multiline, required: o.required,
          })),
          ops: sigOps,
        };
      }
      if (mode === "find") return {};
      return { ops: buildOps() };
    },
    validate() {
      commitEditing();
      if (mode === "crop") return ctx.opts.mode === "manual" && !S.objs.some((o) => o.type === "crop") ? "Kırpılacak alanı sayfa üzerinde sürükleyerek seç." : null;
      if (mode === "redact") {
        const o = ctx.opts;
        return S.objs.some((x) => x.type === "redact") || (o.presets || []).length || (o.terms_text || "").trim() ? null : "Karartılacak alanı çiz ya da aranacak bilgiyi seç.";
      }
      if (mode === "form") {
        return S.fieldVals.size || S.objs.length || ctx.opts.flatten ? null : "Henüz bir alan doldurmadın ya da eklemedin.";
      }
      if (mode === "find") return null;
      if (mode === "sign" && ctx.opts.cert_on) return null;
      return buildOps().length ? null : "Henüz bir değişiklik yapmadın.";
    },
    destroy() {
      loseFocus();
      document.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", loseFocus);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      offOpts();
    },
  };
}
