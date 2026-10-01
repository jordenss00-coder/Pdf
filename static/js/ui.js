// DOM yardımcıları, ikonlar, bildirimler, diyaloglar.

/** h("div.a.b#id", {attrs}, ...children) */
export function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || "div");
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs !== undefined && attrs !== null && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  // value en sona: range/number girişlerinde önce min/max/step atanmalı
  const entries = Object.entries(attrs || {}).sort(([a], [b]) => (a === "value") - (b === "value"));
  for (const [k, v] of entries) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === undefined || sv === null) continue;
        if (sk.startsWith("--")) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const pascal = (s) => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

/** Lucide ikonunu SVG olarak döndürür. */
export function icon(name, cls = "") {
  const L = window.lucide;
  const node = L && L.icons && L.icons[pascal(name)];
  if (!node) return h("span.lucide-missing", { "aria-hidden": "true" });
  const svg = L.createElement(node);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("lucide");
  if (cls) svg.classList.add(cls);
  return svg;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function toast(msg, kind = "") {
  const t = h(`div.toast${kind ? "." + kind : ""}`, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3500);
}

export function fmtBytes(n) {
  if (!n && n !== 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${u[i]}`;
}

/** Modal diyalog. actions: [{label, value, primary, danger}] -> Promise<value|null> */
export function dialog({ title, body, actions = [{ label: "Tamam", value: true, primary: true }], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { closedby: "any", "aria-labelledby": "dlg-title" });
    if (wide) dlg.style.width = "min(760px, calc(100vw - 32px))";
    let result = null;
    const close = (v) => { result = v; dlg.close(); };
    const form = h("form", { method: "dialog", onsubmit: (e) => {
      e.preventDefault();
      const primary = actions.find((a) => a.primary);
      close(primary ? (typeof primary.value === "function" ? primary.value() : primary.value) : true);
    } },
      h("div.dlg-head", h("h2#dlg-title", title),
        h("button.icon-btn", { type: "button", "aria-label": "Kapat", onclick: () => close(null) }, icon("x"))),
      h("div.dlg-body", body),
      actions.length ? h("div.dlg-foot", actions.map((a) =>
        h(`button.btn${a.primary ? ".primary" : ""}${a.danger ? ".danger" : ""}`,
          { type: a.primary ? "submit" : "button",
            onclick: a.primary ? null : () => close(typeof a.value === "function" ? a.value() : a.value) },
          a.label))) : null);
    dlg.append(form);
    // closedby desteklemeyen tarayıcılar için dışarı tıklayınca kapatma
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      dlg.addEventListener("click", (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
        if (!inside) dlg.close();
      });
    }
    dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    if (onOpen) onOpen(dlg, close);
  });
}

export async function askPassword(name) {
  const inp = h("input.input", { type: "password", autocomplete: "off", placeholder: "Parola" });
  return dialog({
    title: "Parola gerekli",
    body: [h("p", { style: { margin: 0 } }, `"${name}" parola korumalı. Açmak için parolasını gir.`), inp],
    actions: [{ label: "Vazgeç", value: null }, { label: "Aç", value: () => inp.value, primary: true }],
    onOpen: () => inp.focus(),
  });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export function pickFiles({ accept = "", multiple = true } = {}) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", accept, multiple, style: { display: "none" } });
    inp.addEventListener("change", () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener("cancel", () => { resolve([]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

/** Bir öğeye dosya sürükle-bırak desteği ekler. */
export function dropTarget(el, onFiles, cls = "dragging") {
  let depth = 0;
  el.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; el.classList.add(cls); e.preventDefault(); } });
  el.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  el.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove(cls); });
  el.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; el.classList.remove(cls);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  });
}
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* depolama kapalı */ } },
};
