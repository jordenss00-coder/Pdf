// İmza oluşturma penceresi: çiz, yaz, yükle. Sonuç kırpılmış, şeffaf PNG (data URL).
import { h, icon, dialog, pickFiles, readAsDataURL, store } from "./ui.js";

const FONTS = ["Segoe Script", "Lucida Handwriting", "Brush Script MT", "Freestyle Script", "Mistral", "Ink Free", "Gabriola", "Segoe Print"];
const INKS = [["#10183a", "Lacivert"], ["#000000", "Siyah"], ["#1b4fd8", "Mavi"], ["#c4231b", "Kırmızı"]];
const KEY = "pdfatolye.signatures";

/** Kenarlardaki boş (şeffaf) alanı kırpar. */
function trim(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: hgt } = canvas;
  const data = ctx.getImageData(0, 0, w, hgt).data;
  let x0 = w, y0 = hgt, x1 = -1, y1 = -1;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hgt - 1, y1 + pad);
  const out = h("canvas", { width: x1 - x0 + 1, height: y1 - y0 + 1 });
  out.getContext("2d").drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function inkPicker(state, onChange) {
  return h("div.row", INKS.map(([c, l]) => {
    const b = h("button", { type: "button", title: l, "aria-label": l, "aria-pressed": String(state.ink === c),
      style: { width: "28px", height: "28px", borderRadius: "999px", background: c, border: "2px solid var(--sheet)", boxShadow: "0 0 0 1px var(--rule-2)" } });
    b.addEventListener("click", () => {
      state.ink = c;
      b.parentElement.querySelectorAll("button").forEach((x) => { x.style.boxShadow = "0 0 0 1px var(--rule-2)"; });
      b.style.boxShadow = `0 0 0 2px ${c}`;
      onChange();
    });
    if (state.ink === c) b.style.boxShadow = `0 0 0 2px ${c}`;
    return b;
  }));
}

export function openSignature({ initials = false } = {}) {
  const state = { tab: "draw", ink: INKS[0][0], width: 2.6, font: FONTS[0], removeBg: true, upload: null };
  const saved = store.get(KEY, []).filter((s) => !!s.initials === initials);

  // --- çiz
  const canvas = h("canvas.sig-canvas", { "aria-label": "İmza çizim alanı" });
  let drawn = false;
  const setupCanvas = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const c = canvas.getContext("2d");
    c.scale(dpr, dpr);
    c.lineCap = "round"; c.lineJoin = "round";
  };
  let pts = [];
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    pts = [{ x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }];
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pts.length) return;
    const r = canvas.getBoundingClientRect();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const c = canvas.getContext("2d");
    c.strokeStyle = state.ink;
    for (const ev of events) {
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top, p: ev.pressure || 0.5 };
      const a = pts[pts.length - 1];
      c.lineWidth = state.width * (ev.pointerType === "pen" ? 0.5 + p.p : 1);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.quadraticCurveTo(a.x, a.y, (a.x + p.x) / 2, (a.y + p.y) / 2);
      c.lineTo(p.x, p.y);
      c.stroke();
      pts.push(p);
      drawn = true;
    }
  });
  const end = () => { pts = []; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  const width = h("input", { type: "range", min: 1, max: 6, step: 0.2, value: state.width, "aria-label": "Kalem kalınlığı" });
  width.addEventListener("input", () => { state.width = Number(width.value); });
  const drawPane = h("div", { style: { display: "grid", gap: "10px" } },
    canvas,
    h("div.row", inkPicker(state, () => {}), h("span.hint", "Kalınlık"), width,
      h("button.btn.sm.ghost", { type: "button", onclick: () => { setupCanvas(); drawn = false; } }, icon("eraser"), "Temizle")));

  // --- yaz
  const name = h("input.input", { placeholder: initials ? "Baş harfler, ör. A.Y." : "Adın ve soyadın", value: store.get("pdfatolye.signName", "") });
  const fontBox = h("div.typed-sig");
  const drawFonts = () => {
    fontBox.replaceChildren(...FONTS.map((f) => {
      const b = h("button", { type: "button", "aria-pressed": String(state.font === f), style: { fontFamily: `"${f}", cursive`, color: state.ink } }, name.value || "İmza");
      b.addEventListener("click", () => { state.font = f; drawFonts(); });
      return b;
    }));
  };
  name.addEventListener("input", drawFonts);
  const typePane = h("div", { style: { display: "grid", gap: "10px" } }, name, inkPicker(state, drawFonts), fontBox);

  // --- yükle
  const prev = h("div", { style: { minHeight: "120px", display: "grid", placeItems: "center", background: "#fff", border: "1px dashed var(--rule-2)", borderRadius: "8px" } }, h("span.hint", "Henüz görsel yok"));
  const rb = h("input", { type: "checkbox", checked: true });
  rb.addEventListener("change", () => { state.removeBg = rb.checked; });
  const upPane = h("div", { style: { display: "grid", gap: "10px" } },
    h("button.btn", { type: "button", onclick: async () => {
      const [f] = await pickFiles({ accept: "image/*", multiple: false });
      if (!f) return;
      state.upload = await readAsDataURL(f);
      prev.replaceChildren(h("img", { src: state.upload, alt: "", style: { maxHeight: "140px" } }));
    } }, icon("upload"), "İmza görseli seç"),
    prev,
    h("label.check", rb, h("span", "Beyaz arka planı kaldır")));

  const panes = { draw: drawPane, type: typePane, upload: upPane };
  const paneBox = h("div");
  const tabs = h("div.sig-tabs", { role: "tablist" }, [["draw", "Çiz"], ["type", "Yaz"], ["upload", "Yükle"]].map(([k, l]) => {
    const b = h("button", { type: "button", role: "tab", "aria-selected": String(state.tab === k) }, l);
    b.addEventListener("click", () => {
      state.tab = k;
      tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", "false"));
      b.setAttribute("aria-selected", "true");
      paneBox.replaceChildren(panes[k]);
      if (k === "draw") requestAnimationFrame(setupCanvas);
      if (k === "type") { drawFonts(); name.focus(); }
    });
    return b;
  }));
  paneBox.append(drawPane);

  const savedBox = saved.length ? h("div.field", h("span.field-label", "Kayıtlı imzaların"),
    h("div.sig-saved", saved.map((s, i) => {
      const b = h("button", { type: "button", title: "Bu imzayı kullan" }, h("img", { src: s.data, alt: `Kayıtlı imza ${i + 1}` }));
      b.addEventListener("click", () => { pick = s.data; closeFn && closeFn("saved"); });
      return b;
    }))) : null;

  const keep = h("input", { type: "checkbox", checked: true });
  let pick = null;
  let closeFn = null;

  async function produce() {
    if (state.tab === "draw") return drawn ? trim(canvas) : null;
    if (state.tab === "type") {
      const text = name.value.trim();
      if (!text) return null;
      store.set("pdfatolye.signName", text);
      const c = h("canvas", { width: 1400, height: 360 });
      const g = c.getContext("2d");
      g.fillStyle = state.ink;
      g.textBaseline = "middle";
      let size = 150;
      g.font = `${size}px "${state.font}", cursive`;
      while (g.measureText(text).width > 1320 && size > 30) { size -= 6; g.font = `${size}px "${state.font}", cursive`; }
      g.fillText(text, 40, 180);
      return trim(c);
    }
    if (state.upload) {
      const img = new Image();
      img.src = state.upload;
      await img.decode();
      const c = h("canvas", { width: img.naturalWidth, height: img.naturalHeight });
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      if (state.removeBg) {
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
          if (lum > 225) d.data[i + 3] = 0;
          else if (lum > 180) d.data[i + 3] = Math.round(d.data[i + 3] * (225 - lum) / 45);
        }
        g.putImageData(d, 0, 0);
      }
      return trim(c);
    }
    return null;
  }

  return dialog({
    title: initials ? "Paraf oluştur" : "İmza oluştur",
    wide: true,
    body: [savedBox, tabs, paneBox, h("label.check", keep, h("span", "Bu imzayı sonraki kullanımlar için hatırla"))],
    actions: [{ label: "Vazgeç", value: null }, { label: "İmzayı kullan", value: "ok", primary: true }],
    onOpen: (_dlg, close) => { closeFn = close; requestAnimationFrame(setupCanvas); },
  }).then(async (v) => {
    if (v === "saved") return pick;
    if (v !== "ok") return null;
    const data = await produce();
    if (data && keep.checked) {
      const all = store.get(KEY, []);
      all.unshift({ data, initials });
      store.set(KEY, all.slice(0, 8));
    }
    return data;
  });
}
