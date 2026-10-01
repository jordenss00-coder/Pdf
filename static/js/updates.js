// Masaüstü güncellemeleri: açılışta denetim, üst şeritte bildirim, indirme ve kurulum.
// Kurulumu masaüstü penceresi başlatır (window.pywebview.api.install_update).
import { h, icon, toast, dialog, fmtBytes } from "./ui.js";
import * as api from "./api.js";

let state = null;
let poll = null;
const listeners = new Set();
const ACTIVE = new Set(["downloading", "verifying"]);

const vnum = (v) => String(v || "").split(".").map(Number);
const newer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* depolama kapalı */ } },
};

function set(next) {
  state = next;
  const active = ACTIVE.has(state?.download?.state);
  if (active && !poll) poll = setInterval(refresh, 700);
  if (!active && poll) { clearInterval(poll); poll = null; }
  document.getElementById("settings-btn")?.classList.toggle("has-badge", !!state?.available);
  renderBar();
  listeners.forEach((fn) => fn(state));
}

async function refresh() {
  try { set(await api.updateStatus()); } catch { /* uygulama kapanıyor olabilir */ }
}

export function onUpdateChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function initUpdates(runtime) {
  const last = local.get("pdf-last-version");
  local.set("pdf-last-version", runtime.version);
  if (last && newer(runtime.version, last)) toast(`PDF Atölye ${runtime.version} sürümüne güncellendi.`);
  if (!runtime.updates) return;
  try { set(await api.updateStatus(true)); } catch { /* çevrimdışı ya da kapalı */ }
}

export async function checkNow() {
  try {
    const s = await api.updateCheck();
    set(s);
    if (s.error) toast(s.error, "err");
    else if (!s.available) toast("PDF Atölye güncel.");
  } catch (e) { toast(e.message, "err"); }
}

export async function startDownload() {
  try { set(await api.updateDownload()); } catch (e) { toast(e.message, "err"); }
}

export async function installUpdate() {
  if (typeof window.pywebview?.api?.install_update !== "function") {
    toast("Kurulum yalnızca PDF Atölye masaüstü penceresinden başlatılabilir.", "err");
    return;
  }
  const version = state?.download?.version;
  const ok = await dialog({
    title: "Güncellemeyi kur",
    body: [h("p", `PDF Atölye kapanacak, ${version} sürümü kurulacak ve uygulama yeniden açılacak.`),
      h("p.hint", "Devam eden işlemler durdurulur. Ayarların korunur.")],
    actions: [{ label: "Vazgeç", value: null }, { label: "Kapat ve kur", value: true, primary: true }],
  });
  if (!ok) return;
  let res;
  try { res = await window.pywebview.api.install_update(); } catch { res = null; }
  if (!res?.ok) { toast(res?.error || "Kurulum başlatılamadı.", "err"); refresh(); return; }
  document.body.append(h("div.busy", { role: "status" }, h("div.busy-box",
    h("b", "Güncelleme kuruluyor"), h("span", "PDF Atölye kapanıyor; kurulum bitince yeniden açılacak."),
    h("div.inkbar.indet", h("i")))));
}

function plainNotes(md) {
  return String(md || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export async function showNotes() {
  const latest = state?.latest;
  if (!latest) return;
  const when = latest.published_at ? new Date(latest.published_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const v = await dialog({
    title: `Yenilikler · ${latest.version}`,
    body: [
      h("p.hint", [when, latest.prerelease ? "ön sürüm" : null, latest.size ? fmtBytes(latest.size) : null].filter(Boolean).join(" · ")),
      h("div.release-notes", plainNotes(latest.notes) || "Bu sürüm için not yazılmamış."),
      latest.page ? h("a", { href: latest.page, target: "_blank", rel: "noopener" }, "GitHub'da sürüm sayfası") : null,
    ],
    wide: true,
    actions: [{ label: "Kapat", value: null }, { label: "İndir ve kur", value: true, primary: true }],
  });
  if (v) startDownload();
}

const bar = () => document.getElementById("update-bar");
const dismissedFor = () => local.get("pdf-update-dismissed");

function progress(dl) {
  const pct = dl.total ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : null;
  return [
    h("div.inkbar" + (pct === null ? ".indet" : ""), h("i", { style: { width: pct === null ? null : `${pct}%` } })),
    h("span.update-pct", pct === null ? fmtBytes(dl.received) : `%${pct} · ${fmtBytes(dl.received)} / ${fmtBytes(dl.total)}`),
  ];
}

function message(title, sub) {
  return h("div.update-msg", h("b", title), sub ? h("span", sub) : null);
}

function renderBar() {
  const el = bar();
  if (!el) return;
  const s = state || {};
  const dl = s.download || {};
  let kind = "", parts = null;
  if (dl.state === "downloading") {
    parts = [icon("download"), message(`PDF Atölye ${dl.version} indiriliyor`, "Çalışmaya devam edebilirsin."), ...progress(dl)];
  } else if (dl.state === "verifying") {
    parts = [icon("shield-check"), message("İndirilen dosya doğrulanıyor…", "SHA-256 özeti sürüm dosyasıyla karşılaştırılıyor.")];
  } else if (dl.state === "ready" && s.available) {
    kind = "ok";
    parts = [icon("circle-check"), message(`PDF Atölye ${dl.version} kurulmaya hazır`, "Kurulum sırasında uygulama kapanıp yeniden açılır."),
      h("button.btn.sm.primary", { type: "button", onclick: installUpdate }, "Şimdi kur")];
  } else if (dl.state === "error" && s.available) {
    kind = "err";
    parts = [icon("circle-alert"), message("Güncelleme indirilemedi", dl.error),
      h("button.btn.sm", { type: "button", onclick: startDownload }, icon("refresh-cw"), "Tekrar dene")];
  } else if (s.available && dismissedFor() !== s.latest.version) {
    parts = [icon("sparkles"), message(`PDF Atölye ${s.latest.version} yayınlandı`, `Kullandığın sürüm ${s.current}.`),
      h("button.btn.sm.ghost", { type: "button", onclick: showNotes }, "Neler yeni?"),
      h("button.btn.sm.primary", { type: "button", onclick: startDownload }, icon("download"), "İndir ve kur"),
      h("button.icon-btn", { type: "button", "aria-label": "Bu sürüm için gizle", title: "Bu sürüm için gizle",
        onclick: () => { local.set("pdf-update-dismissed", s.latest.version); renderBar(); } }, icon("x"))];
  }
  el.hidden = !parts;
  el.className = `update-bar${kind ? " " + kind : ""}`;
  el.setAttribute("role", "status");
  el.replaceChildren(...(parts ? [h("div.update-inner", parts)] : []));
}

const timeText = (sec) => new Date(sec * 1000).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ayarlar penceresindeki "Güncellemeler" bölümü; durum değiştikçe kendini yeniler. */
export function updateSection() {
  const body = h("div.set-stack");
  const sec = h("section.set-sec", h("h3", "Güncellemeler"), body);
  const render = () => {
    const s = state || { current: "", auto: true, download: {} };
    const dl = s.download || {};
    const checking = h("button.btn.sm", { type: "button", onclick: async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.replaceChildren(icon("loader-circle", "spin"), "Denetleniyor…");
      await checkNow();
    } }, icon("refresh-cw"), "Şimdi denetle");
    let line;
    if (s.available) line = h("div.note", h("b", `Yeni sürüm: ${s.latest.version}`), " ",
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); showNotes(); } }, "Neler yeni?"));
    else if (s.error) line = h("div.note.err", s.error);
    else if (s.checked_at) line = h("div.note", "Güncel sürümü kullanıyorsun.");
    const action = !s.available ? null
      : dl.state === "ready" ? h("button.btn.sm.primary", { type: "button", onclick: installUpdate }, "Şimdi kur")
      : ACTIVE.has(dl.state) ? h("div.update-progress", progress(dl))
      : h("button.btn.sm.primary", { type: "button", onclick: startDownload }, icon("download"), "İndir ve kur");
    const auto = h("input", { type: "checkbox", checked: s.auto !== false, onchange: async (e) => {
      try { set(await api.updateAuto(e.target.checked)); } catch (err) { toast(err.message, "err"); }
    } });
    body.replaceChildren(
      h("div.set-row", h("div", h("b", `Kurulu sürüm ${s.current}`),
        h("div.hint", s.checked_at ? `Son denetim: ${timeText(s.checked_at)}` : "Henüz denetlenmedi.")), checking),
      line, action ? h("div.set-row", action) : null,
      h("label.check", auto, h("span", "Uygulama açılırken güncellemeleri denetle")));
  };
  const off = onUpdateChange(() => { if (!sec.isConnected) { off(); return; } render(); });
  render();
  if (!state) refresh();
  return sec;
}
