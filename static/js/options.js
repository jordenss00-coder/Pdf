// Şemadan seçenek paneli üretir.
import { h, icon, pickFiles, readAsDataURL, toast } from "./ui.js";
import * as api from "./api.js";

export function defaults(schema = []) {
  const o = {};
  for (const f of schema) {
    if (!f.key) continue;
    if (f.def !== undefined) o[f.key] = Array.isArray(f.def) ? structuredClone(f.def) : f.def;
    else if (f.type === "check") o[f.key] = false;
    else if (f.type === "checks") o[f.key] = [];
    else o[f.key] = "";
  }
  return o;
}

/**
 * @returns {{el: HTMLElement, sync(): void}}
 * sync(): görünürlük koşullarını ve dışarıdan değişen değerleri yeniler.
 */
export function renderOptions(schema, opts, { caps = {}, onChange = () => {} } = {}) {
  const el = h("div", { style: { display: "grid", gap: "16px" } });
  const rows = [];
  const set = (key, val) => { opts[key] = val; onChange(key, val); syncShow(); };

  for (const f of schema) {
    const r = field(f, opts, set, caps);
    if (!r) continue;
    rows.push({ f, ...r });
    el.append(r.wrap);
  }
  function syncShow() {
    for (const r of rows) r.wrap.hidden = r.f.show ? !r.f.show(opts) : false;
  }
  function sync() {
    for (const r of rows) if (r.refresh) r.refresh();
    syncShow();
  }
  syncShow();
  return { el, sync };
}

function wrapField(f, control, extra) {
  return h("div.field",
    f.label ? h("label.field-label", f.label) : null,
    control,
    f.hint ? h("div.hint", f.hint) : null,
    extra || null);
}

function field(f, opts, set, caps) {
  const k = f.key;
  switch (f.type) {
    case "note":
      return { wrap: h("div.note", f.text) };

    case "text":
    case "password": {
      const inp = h("input.input", { type: f.type, value: opts[k] ?? "", placeholder: f.placeholder || "", autocomplete: f.type === "password" ? "new-password" : "off" });
      inp.addEventListener("input", () => set(k, inp.value));
      return { wrap: wrapField(f, inp), refresh: () => { if (document.activeElement !== inp) inp.value = opts[k] ?? ""; } };
    }
    case "textarea": {
      const ta = h("textarea.input", { placeholder: f.placeholder || "", rows: 3 });
      ta.value = opts[k] ?? "";
      ta.addEventListener("input", () => set(k, ta.value));
      return { wrap: wrapField(f, ta) };
    }
    case "number": {
      const inp = h("input.input", { type: "number", value: opts[k], min: f.min, max: f.max, step: f.step || 1 });
      inp.addEventListener("input", () => set(k, inp.value === "" ? "" : Number(inp.value)));
      return { wrap: wrapField(f, inp), refresh: () => { if (document.activeElement !== inp) inp.value = opts[k]; } };
    }
    case "color": {
      const inp = h("input.input", { type: "color", value: opts[k] || "#000000" });
      inp.addEventListener("input", () => set(k, inp.value));
      return { wrap: wrapField(f, h("div.row", inp, h("span.hint", "Rengi seçmek için tıkla"))) };
    }
    case "range": {
      const out = h("span.hint");
      const fmt = f.fmt || ((v) => String(v));
      const inp = h("input", { type: "range", min: f.min, max: f.max, step: f.step || 1, value: opts[k] });
      const upd = () => { out.textContent = fmt(Number(inp.value)); };
      inp.addEventListener("input", () => { set(k, Number(inp.value)); upd(); });
      upd();
      return { wrap: wrapField({ ...f, label: null }, h("div", h("div.row", h("label.field-label.grow", f.label), out), inp)) };
    }
    case "check": {
      const inp = h("input", { type: "checkbox", checked: !!opts[k] });
      inp.addEventListener("change", () => set(k, inp.checked));
      return { wrap: h("label.check", inp, h("span", f.label)), refresh: () => { inp.checked = !!opts[k]; } };
    }
    case "checks": {
      const box = h("div", { style: { display: "grid", gap: "8px" } });
      for (const [v, l] of f.options) {
        const inp = h("input", { type: "checkbox", checked: (opts[k] || []).includes(v) });
        inp.addEventListener("change", () => {
          const cur = new Set(opts[k] || []);
          inp.checked ? cur.add(v) : cur.delete(v);
          set(k, [...cur]);
        });
        box.append(h("label.check", inp, h("span", l)));
      }
      return { wrap: wrapField(f, box) };
    }
    case "select":
    case "font": {
      const options = f.type === "font" ? (caps.fonts || [{ id: "arial", label: "Arial" }]).map((x) => [x.id, x.label]) : f.options;
      const sel = h("select.input", options.map(([v, l]) => h("option", { value: v, selected: String(opts[k]) === String(v) }, l)));
      sel.addEventListener("change", () => set(k, sel.value));
      return { wrap: wrapField(f, sel) };
    }
    case "seg": {
      const seg = h("div.seg", { role: "group", "aria-label": f.label });
      const btns = f.options.map(([v, l]) => {
        const b = h("button", { type: "button", "aria-pressed": String(opts[k] === v) }, l);
        b.addEventListener("click", () => { set(k, v); btns.forEach((x, i) => x.setAttribute("aria-pressed", String(f.options[i][0] === v))); });
        return b;
      });
      seg.append(...btns);
      return { wrap: wrapField(f, seg) };
    }
    case "cards": {
      const box = h("div.cards", { role: "group", "aria-label": f.label });
      const btns = f.options.map(([v, title, desc, needs]) => {
        const off = needs && !caps[needs];
        const b = h("button", { type: "button", "aria-pressed": String(opts[k] === v), disabled: off },
          h("b", title), h("span", off ? "Bu bilgisayarda kullanılamıyor." : desc));
        b.addEventListener("click", () => { set(k, v); btns.forEach((x, i) => x.setAttribute("aria-pressed", String(f.options[i][0] === v))); });
        return b;
      });
      box.append(...btns);
      return { wrap: wrapField(f, box) };
    }
    case "pos9": {
      const grid = h("div.pos9", { role: "group", "aria-label": f.label });
      const names = ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
      const labels = ["Sol üst", "Üst orta", "Sağ üst", "Sol orta", "Orta", "Sağ orta", "Sol alt", "Alt orta", "Sağ alt"];
      const btns = names.map((n, i) => {
        const b = h("button", { type: "button", title: labels[i], "aria-label": labels[i], "aria-pressed": String(opts[k] === n) });
        b.addEventListener("click", () => { set(k, n); refresh(); });
        return b;
      });
      grid.append(...btns);
      let tile = null;
      if (f.tile) {
        tile = h("input", { type: "checkbox", checked: opts[k] === "tile" });
        tile.addEventListener("change", () => { set(k, tile.checked ? "tile" : "middle-center"); refresh(); });
      }
      function refresh() {
        btns.forEach((b, i) => b.setAttribute("aria-pressed", String(opts[k] === names[i])));
        if (tile) tile.checked = opts[k] === "tile";
      }
      return { wrap: wrapField(f, grid, tile ? h("label.check", tile, h("span", "Sayfa boyunca döşe (tekrarla)")) : null) };
    }
    case "image": {
      const prev = h("div");
      const draw = () => {
        prev.replaceChildren();
        if (opts[k]) {
          prev.append(h("div.row",
            h("img", { src: opts[k], alt: "", style: { maxHeight: "64px", maxWidth: "140px", background: "#fff", border: "1px solid var(--rule)" } }),
            h("button.btn.sm.ghost", { type: "button", onclick: () => { set(k, ""); draw(); } }, icon("trash-2"), "Kaldır")));
        }
      };
      const btn = h("button.btn.sm", { type: "button" }, icon("image-plus"), "Görsel seç");
      btn.addEventListener("click", async () => {
        const [file] = await pickFiles({ accept: "image/*", multiple: false });
        if (file) { set(k, await readAsDataURL(file)); draw(); }
      });
      draw();
      return { wrap: wrapField(f, h("div", { style: { display: "grid", gap: "8px", justifyItems: "start" } }, btn, prev)) };
    }
    case "upload": {
      const name = h("span.hint");
      const btn = h("button.btn.sm", { type: "button" }, icon("upload"), "Dosya seç");
      btn.addEventListener("click", async () => {
        const [file] = await pickFiles({ accept: f.accept || "", multiple: false });
        if (!file) return;
        try {
          const [info] = await api.upload([file]);
          set(k, info.id);
          name.textContent = info.name;
        } catch (e) { toast(e.message, "err"); }
      });
      return { wrap: wrapField(f, h("div.row", btn, name)) };
    }
    case "pairs": {
      const list = h("div", { style: { display: "grid", gap: "8px" } });
      if (!Array.isArray(opts[k]) || !opts[k].length) opts[k] = [{ find: "", replace: "" }];
      const draw = () => {
        list.replaceChildren();
        opts[k].forEach((p, i) => {
          const a = h("input.input", { value: p.find, placeholder: "Bul", "aria-label": "Aranacak metin" });
          const b = h("input.input", { value: p.replace, placeholder: "Yerine", "aria-label": "Yeni metin" });
          a.addEventListener("input", () => { p.find = a.value; set(k, opts[k]); });
          b.addEventListener("input", () => { p.replace = b.value; set(k, opts[k]); });
          const del = h("button.icon-btn", { type: "button", "aria-label": "Satırı sil", onclick: () => { opts[k].splice(i, 1); if (!opts[k].length) opts[k].push({ find: "", replace: "" }); set(k, opts[k]); draw(); } }, icon("x"));
          list.append(h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "6px", alignItems: "center" } }, a, b, del));
        });
      };
      draw();
      const add = h("button.btn.sm.ghost", { type: "button", onclick: () => { opts[k].push({ find: "", replace: "" }); draw(); } }, icon("plus"), "Satır ekle");
      return { wrap: wrapField(f, h("div", { style: { display: "grid", gap: "8px", justifyItems: "start" } }, list, add)) };
    }
    default:
      return null;
  }
}
