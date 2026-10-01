// PDF Atölye – uygulama kabuğu: yönlendirme, ana sayfa, araç sayfası, sonuç.
import { h, icon, clear, toast, fmtBytes, dialog, askPassword, pickFiles, dropTarget } from "./ui.js";
import * as api from "./api.js";
import { CATS, TOOLS, ACCEPT, byId, catOf, toolsFor, kindsLabel, needsMet } from "./tools.js";
import { defaults, renderOptions } from "./options.js";
import mountFiles from "./ws-files.js";
import mountPages from "./ws-pages.js";
import mountEditor from "./editor.js";
import { mountCompare, mountHtml, mountScan } from "./ws-misc.js";
import { mountWorkflows } from "./workflows.js";

const app = document.getElementById("app");
const search = document.getElementById("search");
let caps = {};
let runtime = {};
let category = "all";
let authenticated = false;
let handoff = null; // bir sonraki araca aktarılacak dosyalar
let cleanup = null;

const WORKSPACES = { files: mountFiles, pages: mountPages, editor: mountEditor, compare: mountCompare, html: mountHtml, scan: mountScan };
const EXT_KIND = {};
for (const [kind, acc] of Object.entries(ACCEPT)) {
  for (const e of acc.split(",")) if (e.startsWith(".")) EXT_KIND[e] = kind;
}
const kindOfFile = (f) => {
  const ext = (f.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (f.type.startsWith("image/")) return "image";
  return "other";
};
const acceptFor = (t) => t.accept.map((k) => ACCEPT[k]).join(",");

// ---------------- yönlendirme ----------------

function route() {
  if (runtime.login_required && !authenticated) { loginView(); return; }
  if (cleanup) { try { cleanup(); } catch { /* yoksay */ } cleanup = null; }
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--on-accent");
  if (location.hash === "#/workflows") {
    clear(app);
    const wrap = h("div.wrap.workflow-wrap"); app.append(wrap);
    cleanup = mountWorkflows(wrap, { caps, upload: uploadFiles, process: api.process, busy, idle,
      result: (tool, response) => resultView(tool, response, route) });
    return;
  }
  const m = (location.hash || "").match(/^#\/t\/([\w-]+)/);
  if (m && byId[m[1]]) toolView(byId[m[1]]);
  else homeView();
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ---------------- yükleme ----------------

let busyEl = null;
function busy(title, sub = "", progress = null) {
  if (!busyEl) {
    busyEl = h("div.busy", { role: "status" }, h("div.busy-box", h("b"), h("span"), h("div.inkbar", h("i"))));
    document.body.append(busyEl);
  }
  busyEl.querySelector("b").textContent = title;
  busyEl.querySelector("span").textContent = sub;
  const bar = busyEl.querySelector(".inkbar");
  bar.classList.toggle("indet", progress === null);
  bar.querySelector("i").style.width = progress === null ? "" : `${Math.round(progress * 100)}%`;
}
function idle() { if (busyEl) { busyEl.remove(); busyEl = null; } }

async function uploadFiles(files, { allowLocked = false } = {}) {
  busy("Dosyalar yükleniyor", files.length === 1 ? files[0].name : `${files.length} dosya`, 0);
  let infos;
  try {
    infos = await api.upload(files, (p) => busy("Dosyalar yükleniyor", files.length === 1 ? files[0].name : `${files.length} dosya`, p));
  } finally { idle(); }
  for (let i = 0; i < infos.length; i++) {
    let info = infos[i];
    while (info.locked && !allowLocked) {
      const pw = await askPassword(info.name);
      if (pw === null) { info = null; break; }
      try { info = await api.unlock(info.id, pw); } catch (e) { toast(e.message, "err"); }
    }
    infos[i] = info;
  }
  return infos.filter(Boolean);
}

// ---------------- ana sayfa ----------------

const norm = (s) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

function tile(t) {
  const c = catOf(t);
  const usable = needsMet(t, caps);
  return h("a.tile", { href: `#/t/${t.id}`, style: { "--cat": c.color }, dataset: { q: norm(`${t.name} ${t.desc} ${c.name}`) } },
    h(`span.chip${c.light ? ".light" : ""}${c.ai ? ".ai" : ""}`, icon(t.icon)),
    h("b", t.name),
    h("span.d", t.desc),
    usable ? null : h("span.badge", caps.mode === "hosted" ? "bu sunucuda kapalı" : "kurulum gerekli"));
}

function homeView() {
  clear(app);
  const files = h("div");
  const sheet = h("section.sheet", { "aria-label": "Dosya bırakma alanı" },
    h("div.crop-marks", { "aria-hidden": "true" }, h("i.tl"), h("i.tr"), h("i.bl"), h("i.br")),
    h("div.colorbar", { "aria-hidden": "true" },
      ["--c", "--m", "--y", "--k", "--cy", "--cm", "--my"].map((v) => h("span", { style: { background: `var(${v})` } }))),
    svgReg(),
    h("div.drop-hero",
      h("div",
        h("h1", "PDF için tüm araçlar, tek yerde."),
        h("p", "Birleştir, sıkıştır, düzenle ve dönüştür. Dosyanı seç, aracını kullan, sonucunu indir."),
        h("p.privacy-note", runtime.mode === "hosted" ? `Dosyalar bu sunucuda işlenir. ${runtime.retention_hours} saat sonra temizlenir; istediğin zaman silebilirsin.` : "İşlemler bu bilgisayarda yapılır. Yapay zekâ araçları kullanıldığında belge Anthropic'e gönderilir.")),
      h("div.drop-actions",
        h("button.btn.primary.big", { type: "button", onclick: async () => { const fl = await pickFiles(); if (fl.length) onHomeFiles(fl); } },
          icon("upload"), "Dosya seç"),
        h("div.drop-note", icon("hard-drive"), "PDF, Word, Excel, PowerPoint, görsel ve HTML"))),
    files);
  dropTarget(sheet, (fl) => onHomeFiles(fl));

  async function onHomeFiles(fl) {
    let infos;
    try { infos = await uploadFiles(fl, { allowLocked: true }); } catch (e) { toast(e.message, "err"); return; }
    if (!infos.length) return;
    const kinds = [...new Set(infos.map((i) => i.kind))];
    const list = toolsFor(kinds).filter((t) => needsMet(t, caps));
    clear(files).append(h("div.suggest",
      h("h2", "Bu dosyalarla ne yapalım?"),
      h("p.files-line", infos.map((i) => i.name).join(" · ")),
      list.length
        ? h("div.tool-grid", list.map((t) => {
            const a = tile(t);
            a.addEventListener("click", (e) => { e.preventDefault(); handoff = infos; go(`#/t/${t.id}`); });
            return a;
          }))
        : h("p.note", "Bu dosya türü için uygun araç yok.")));
    files.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const cats = h("div.cats");
  for (const c of CATS) {
    const tools = TOOLS.filter((t) => t.cat === c.id);
    cats.append(h("section.cat", { dataset: { cat: c.id } },
      h("div.cat-head", h("span.swatch", { style: { "--cat": c.color, background: c.ai ? "linear-gradient(135deg,var(--c) 33%,var(--m) 33% 66%,var(--y) 66%)" : c.color } }),
        h("h2", c.name), h("small", c.note)),
      h("div.tool-grid", tools.map(tile))));
  }
  const empty = h("p.empty-search", { hidden: true }, "Bu aramayla eşleşen araç yok. Başka bir kelime dene: “imza”, “word”, “sıkıştır”…");
  const filters = h("nav.category-filters", { "aria-label": "Araç kategorileri" });
  for (const c of [{ id: "all", name: "Tüm araçlar" }, ...CATS]) {
    filters.append(h("button.btn.sm", { type: "button", "aria-pressed": String(category === c.id), onclick: () => {
      category = c.id;
      filters.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === c.name)));
      applySearch();
    } }, c.name));
  }
  const popular = h("section.popular", h("h2", "Sık kullanılanlar"), h("div.quick-tools",
    h("a.btn", { href: "#/workflows" }, icon("workflow"), "İş akışı oluştur"),
    ["merge", "split", "compress", "pdf_to_word", "edit", "sign"].map((id) => h("a.btn", { href: `#/t/${id}` }, icon(byId[id].icon), byId[id].name))));
  app.append(h("div.wrap", h("div.hero", sheet), popular, filters, cats, empty,
    h("footer.project-footer", h("span", `${TOOLS.length} araç · PDF Atölye 0.2.0 · Yükleme başına ${runtime.max_upload_mb || 50} MB`),
      h("a", { href: "https://github.com/jordenss00-coder/Pdf", target: "_blank", rel: "noopener" }, "GitHub · Kurulum ve gelişim raporları"))));
  applySearch();
}

function svgReg() {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 22 22");
  s.setAttribute("class", "reg");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<circle cx="11" cy="11" r="6"/><circle cx="11" cy="11" r="2.5"/><path d="M11 0v22M0 11h22"/>';
  return s;
}

function applySearch() {
  const q = norm(search.value.trim());
  const sections = app.querySelectorAll(".cat");
  if (!sections.length) return;
  let any = false;
  sections.forEach((sec) => {
    let n = 0;
    sec.querySelectorAll(".tile").forEach((t) => {
      const hit = (category === "all" || sec.dataset.cat === category) && (!q || q.split(/\s+/).every((w) => t.dataset.q.includes(w)));
      t.hidden = !hit;
      if (hit) n++;
    });
    sec.hidden = n === 0;
    any ||= n > 0;
  });
  const empty = app.querySelector(".empty-search");
  if (empty) empty.hidden = any;
}

search.addEventListener("input", () => {
  if (!app.querySelector(".cats")) { location.hash = "#/"; return; }
  applySearch();
});
search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = [...app.querySelectorAll(".tile")].find((t) => !t.hidden);
    if (first) first.click();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
    e.preventDefault(); search.focus(); search.select();
  }
});

// ---------------- araç sayfası ----------------

function setAccent(t) {
  const c = catOf(t);
  const root = document.documentElement;
  root.style.setProperty("--accent", c.ai ? "var(--cm)" : c.color);
  root.style.setProperty("--on-accent", c.light ? "#18223a" : "#fff");
}

function toolHead(t) {
  const c = catOf(t);
  return h("div.tool-head",
    h("a.icon-btn.back", { href: "#/", "aria-label": "Tüm araçlar", title: "Tüm araçlar" }, icon("arrow-left")),
    h(`span.chip${c.light ? ".light" : ""}${c.ai ? ".ai" : ""}`, { style: { "--cat": c.color } }, icon(t.icon)),
    h("div", h("h1", t.name), h("p", t.desc)));
}

function toolView(t) {
  setAccent(t);
  const state = { files: handoff ? handoff.filter((f) => t.accept.includes(f.kind)) : [], opts: defaults(t.opts) };
  handoff = null;
  let ws = null;
  let optsUi = null;
  const listeners = new Set();

  const ctx = {
    tool: t, caps,
    get files() { return state.files; },
    opts: state.opts,
    async addFiles(list) {
      const ok = list.filter((f) => t.accept.includes(kindOfFile(f)));
      if (ok.length < list.length) toast(`Bu araç yalnızca şu dosyaları kabul eder: ${kindsLabel(t.accept)}.`, "err");
      if (!ok.length) return [];
      let infos;
      try { infos = await uploadFiles(t.multi ? ok : ok.slice(0, 1), { allowLocked: t.allowLocked }); }
      catch (e) { toast(e.message, "err"); return []; }
      if (!infos.length) return [];
      state.files = t.multi ? [...state.files, ...infos] : infos;
      if (ws && ws.filesAdded && t.multi) ws.filesAdded(infos);
      else render();
      return infos;
    },
    async pick() {
      const fl = await pickFiles({ accept: acceptFor(t), multiple: !!t.multi });
      if (fl.length) await ctx.addFiles(fl);
    },
    removeFile(id) {
      state.files = state.files.filter((f) => f.id !== id);
      render();
    },
    setOrder(ids) {
      const map = new Map(state.files.map((f) => [f.id, f]));
      state.files = ids.map((i) => map.get(i)).filter(Boolean);
    },
    setOpt(key, val) {
      state.opts[key] = val;
      if (optsUi) optsUi.sync();
      listeners.forEach((fn) => fn(key, val));
    },
    onOpts(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    run: () => run(),
    panelSlot: null,
  };

  function render() {
    if (ws && ws.destroy) ws.destroy();
    ws = null;
    clear(app);
    const wrap = h("div.wrap", toolHead(t));
    app.append(wrap);
    if (!needsMet(t, caps)) {
      wrap.append(h("div.note.warn", missingNote(t)));
      return;
    }
    const needsFiles = !["html", "scan", "compare"].includes(t.ws);
    if (needsFiles && !state.files.length) {
      wrap.append(dropZone());
      return;
    }
    const space = h("div.workspace");
    const slot = h("div", { style: { display: "grid", gap: "16px" } });
    ctx.panelSlot = slot;
    optsUi = t.opts ? renderOptions(t.opts, state.opts, { caps, onChange: (k, v) => listeners.forEach((fn) => fn(k, v)) }) : null;
    const runBtn = h("button.btn.primary.big.block", { type: "button", onclick: () => run() }, t.action, icon("arrow-right"));
    const aiNote = t.needs === "ai" && !caps.ai
      ? h("div.note.warn", "Bu araç için Claude API anahtarı gerekli. ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); openSettings(); } }, "Ayarlar'dan ekle."))
      : null;
    const panel = h("aside.panel", { "aria-label": "Seçenekler" },
      h("div.panel-body", aiNote, slot, optsUi && optsUi.el.childElementCount ? [slot.childElementCount ? h("hr.panel-sep") : null, optsUi.el] : null),
      h("div.panel-foot", runBtn));
    wrap.append(h("div.tool-layout", space, panel));
    ws = WORKSPACES[t.ws](space, ctx);
    if (t.loadMeta && state.files[0]) loadMeta(state.files[0].id);
    if (!slot.childElementCount && !(optsUi && optsUi.el.childElementCount)) {
      slot.append(h("p.note", "Bu işlem için ayar gerekmiyor. Hazırsan düğmeye bas."));
    }
  }

  async function loadMeta(id) {
    try {
      const m = await api.meta(id);
      for (const k of ["title", "author", "subject", "keywords", "creator", "producer"]) state.opts[k] = m[k] || "";
      optsUi && optsUi.sync();
    } catch { /* yoksay */ }
  }

  function dropZone() {
    const c = catOf(t);
    const z = h("section.drop-tool", { "aria-label": "Dosya bırakma alanı" },
      h("div",
        h(`span.chip${c.light ? ".light" : ""}${c.ai ? ".ai" : ""}`, { style: { "--cat": c.color } }, icon(t.icon)),
        h("h2", t.multi ? `${kindsLabel(t.accept)} dosyalarını bırak` : `${kindsLabel(t.accept)} dosyanı bırak`),
        h("p", "ya da bilgisayarından seç"),
        h("button.btn.primary.big", { type: "button", onclick: () => ctx.pick() }, icon("upload"), t.multi ? "Dosyaları seç" : "Dosya seç")));
    dropTarget(z, (fl) => ctx.addFiles(fl));
    return z;
  }

  async function run() {
    const wsErr = ws && ws.validate ? ws.validate() : null;
    const err = wsErr || (t.validate ? t.validate(state.opts, state.files) : null);
    if (err) { toast(err, "err"); return; }
    if (t.needs === "ai" && !caps.ai) { openSettings(); return; }
    const options = t.build ? t.build({ ...state.opts }) : { ...state.opts };
    if (ws && ws.options) Object.assign(options, ws.options());
    const files = ws && ws.fileIds ? ws.fileIds() : state.files.map((f) => f.id);
    busy(busyTitle(t), busySub(t));
    try {
      const res = await api.process(t.backend || t.id, files, options);
      idle();
      resultView(t, res, () => render());
    } catch (e) {
      idle();
      toast(e.message, "err");
    }
  }

  cleanup = () => { if (ws && ws.destroy) ws.destroy(); };
  render();
}

function missingNote(t) {
  if (caps.mode === "hosted" && ["ai", "browser"].includes(t.needs)) return "Bu araç sunucu sürümünde henüz etkin değil. GitHub'dan yerel sürümü kurarak kullanabilirsin.";
  const m = {
    word: "Bu dönüşüm için Microsoft Word ya da LibreOffice gerekli.",
    excel: "Bu dönüşüm için Microsoft Excel ya da LibreOffice gerekli.",
    powerpoint: "Bu dönüşüm için Microsoft PowerPoint ya da LibreOffice gerekli.",
    browser: "Bu dönüşüm için Google Chrome ya da Microsoft Edge gerekli.",
  };
  return m[t.needs] || "Bu araç için ek bir program gerekli.";
}

function busyTitle(t) {
  if (t.cat === "ai") return "Claude belgeyi okuyor";
  if (["word_to_pdf", "excel_to_pdf", "ppt_to_pdf"].includes(t.id)) return "Belge PDF'e dönüştürülüyor";
  if (t.id === "ocr") return "Metin tanınıyor";
  return "İşleniyor";
}
function busySub(t) {
  if (t.cat === "ai") return "Belgenin uzunluğuna göre bir-iki dakika sürebilir.";
  if (["word_to_pdf", "excel_to_pdf", "ppt_to_pdf"].includes(t.id)) return "İlk dönüştürme, Office açılırken biraz uzun sürebilir.";
  if (t.id === "ocr") return "Her sayfa için birkaç saniye sürer.";
  return runtime.mode === "hosted" ? "Dosyan sunucuda hazırlanıyor…" : "Dosyan bu bilgisayarda hazırlanıyor…";
}

// ---------------- sonuç ----------------

const CHAIN = ["edit", "edit_text", "sign", "compress", "merge", "split", "organize", "watermark", "page_numbers", "protect", "form", "ocr", "pdf_to_word", "redact"];

function resultView(t, res, back) {
  const r = res.result;
  const extra = res.extra || {};
  clear(app);
  const main = h("div.result-main");
  main.append(h("h2", "Hazır."));
  if (r.expiresAt) main.append(h("p.hint", `Geçici dosya ${new Date(r.expiresAt * 1000).toLocaleString("tr-TR")} tarihine kadar saklanır. Kalıcı kopya için indir.`));
  main.append(h("div.result-file",
    h("a.btn.primary.big", { href: api.downloadUrl(r.id), download: r.name }, icon("download"), "İndir"),
    r.kind === "pdf" ? h("a.btn.big", { href: api.downloadUrl(r.id, true), target: "_blank", rel: "noopener" }, icon("external-link"), "Tarayıcıda aç") : null,
    h("div.meta", h("b", r.name), h("br"), [fmtBytes(r.size), r.pageCount ? `${r.pageCount} sayfa` : "", extra.files ? `${extra.files} dosya (zip)` : ""].filter(Boolean).join(" · "))));

  if (extra.warning) main.append(h("div.note.warn", extra.warning));
  if (extra.compress) {
    const before = extra.compress.reduce((a, c) => a + c.before, 0);
    const after = extra.compress.reduce((a, c) => a + c.after, 0);
    const pct = before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
    main.append(h("div.stat-line",
      h("div", h("b", `%${pct}`), h("span", "daha küçük")),
      h("div", h("b", fmtBytes(before)), h("span", "önce")),
      h("div", h("b", fmtBytes(after)), h("span", "sonra"))));
    if (pct === 0) main.append(h("div.note", "Dosya zaten iyi sıkıştırılmış; daha fazla küçültülemedi."));
  }
  if (extra.compare) {
    const c = extra.compare;
    main.append(h("div.stat-line",
      h("div", h("b", { style: { color: "var(--my)" } }, c.deleted), h("span", "kaldırılan / değişen (A)")),
      h("div", h("b", { style: { color: "var(--cy)" } }, c.inserted), h("span", "eklenen / değişen (B)")),
      h("div", h("b", c.pages.length), h("span", "farklı sayfa"))));
    if (!c.deleted && !c.inserted) main.append(h("div.note", "İki belge arasında fark bulunamadı."));
  }
  if (extra.replaced) main.append(h("div.stat-line", h("div", h("b", extra.replaced), h("span", "yerde değiştirildi"))));
  if (extra.redacted) main.append(h("div.stat-line", h("div", h("b", extra.redacted), h("span", "alan karartıldı"))));
  if (extra.words) main.append(h("div.stat-line", h("div", h("b", extra.words), h("span", "kelime tanındı"))));
  if (extra.signed) main.append(h("div.note", "Sertifikalı dijital imza eklendi. İmzayı Adobe Acrobat Reader'da doğrulayabilirsin."));
  if (extra.text) {
    main.append(h("div.ai-text", extra.text));
    main.append(h("button.btn.sm", { type: "button", onclick: () => { navigator.clipboard.writeText(extra.text).then(() => toast("Özet kopyalandı.")); } }, icon("copy"), "Metni kopyala"));
  }
  if (r.kind === "pdf" && r.pageCount) {
    const strip = h("div.preview-strip", { "aria-label": "Önizleme" });
    for (let i = 0; i < Math.min(r.pageCount, 10); i++) {
      strip.append(h("img", { src: api.pageUrl(r.id, i, 360), alt: `Sayfa ${i + 1}`, loading: "lazy" }));
    }
    main.append(strip);
  }

  const side = h("aside.panel",
    h("div.panel-body",
      h("h3", "Sonuçla devam et"),
      (() => {
        const next = toolsFor([r.kind]).filter((x) => x.id !== t.id && needsMet(x, caps));
        const pick = r.kind === "pdf" ? CHAIN.map((id) => next.find((x) => x.id === id)).filter(Boolean) : next.slice(0, 10);
        if (!pick.length) return h("p.note", "Bu dosya türüyle devam edilebilecek araç yok.");
        return h("div.next-tools", pick.map((x) => h("a", {
          href: `#/t/${x.id}`, onclick: (e) => { e.preventDefault(); handoff = [r]; go(`#/t/${x.id}`); },
        }, icon(x.icon), x.name)));
      })()),
    h("div.panel-foot",
      h("button.btn.block", { type: "button", onclick: back }, icon("undo-2"), "Ayarları değiştirip tekrar dene"),
      h("a.btn.block.ghost", { href: "#/" }, icon("layout-grid"), "Tüm araçlar")));

  app.append(h("div.wrap", toolHead(t), h("div.result", main, side)));
}

// ---------------- ayarlar ----------------

async function openSettings() {
  if (runtime.login_required && !authenticated) return;
  if (caps.mode === "hosted") {
    await dialog({ title: "Sunucu bilgileri", body: [h("p", `Dosyalar sunucuda işlenir ve ${runtime.retention_hours} saat sonra temizlenir. Yükleme sınırı ${runtime.max_upload_mb} MB, belge sınırı ${runtime.max_pages} sayfadır.`), h("p", "Yapay zekâ ve HTML/URL dönüşümü bu sunucu sürümünde kapalıdır.")], actions: [{ label: "Kapat", value: null }] });
    return;
  }
  let s = {};
  try { s = await api.settings(); } catch { /* yoksay */ }
  const yes = (ok, label, hint) => h("div", h("span", { class: ok ? "ok" : "no" }, icon(ok ? "check" : "minus")), h("span", label), hint && !ok ? h("span.hint", `— ${hint}`) : null);
  const key = h("input.input", { type: "password", placeholder: s.has_key ? `Kayıtlı anahtar ${s.key_hint || ""}` : "sk-ant-…", autocomplete: "off" });
  const body = [
    h("div.field", h("span.field-label", "Bu bilgisayarda bulunanlar"),
      h("div.caps",
        yes(caps.word, "Microsoft Word", "Word dönüşümleri için"),
        yes(caps.excel, "Microsoft Excel", "Excel dönüşümleri için"),
        yes(caps.powerpoint, "Microsoft PowerPoint", "PowerPoint dönüşümleri için"),
        yes(caps.browser, "Chrome / Edge", "HTML'den PDF'e için"),
        yes((caps.ocr_languages || []).length > 0, `OCR dilleri: ${(caps.ocr_languages || []).join(", ") || "yok"}`),
        yes(caps.ghostscript, "Ghostscript", "tam uyumlu PDF/A için (isteğe bağlı)"),
        yes(caps.ai, "Claude API anahtarı", "yapay zekâ araçları için"))),
    h("div.field", h("label.field-label", "Anthropic API anahtarı"), key,
      h("div.hint", "Özetleme ve çeviri belgeyi Anthropic'e gönderir. Anahtar bu bilgisayardaki config.json dosyasında saklanır. Ayrıca ANTHROPIC_MODEL ortam değişkeni ayarlanmalıdır.")),
  ];
  const v = await dialog({
    title: "Ayarlar", body,
    actions: [
      s.has_key ? { label: "Anahtarı sil", value: "delete", danger: true } : null,
      { label: "Kapat", value: null },
      { label: "Kaydet", value: () => key.value, primary: true },
    ].filter(Boolean),
  });
  if (v === null || v === undefined || v === true) return;
  try {
    await api.saveSettings({ anthropic_api_key: v === "delete" ? "" : v });
    caps = await api.capabilities();
    toast(v === "delete" ? "API anahtarı silindi." : v ? "API anahtarı kaydedildi." : "Değişiklik yok.");
    route();
  } catch (e) { toast(e.message, "err"); }
}

// ---------------- başlat ----------------

async function start() {
  document.getElementById("settings-btn").append(icon("settings"));
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  try { runtime = await api.runtime(); } catch { clear(app).append(h("div.wrap", h("p.note.warn", "Sunucuya ulaşılamadı. Uygulamayı başlatıp sayfayı yenile."))); return; }
  try { caps = await api.capabilities(); authenticated = true; } catch { caps = {}; }
  document.getElementById("clear-btn").addEventListener("click", async () => {
    if (runtime.login_required && !authenticated) return;
    const confirmed = await dialog({ title: "Geçici dosyaları sil", body: [h("p", "Bu oturumun yüklenen dosyaları ve sonuçları silinecek. İndirdiğin kopyalar korunur.")], actions: [{ label: "Vazgeç", value: null }, { label: "Dosyalarımı sil", value: "delete", danger: true }] });
    if (confirmed !== "delete") return;
    try { await api.clearFiles(); handoff = null; go("#/"); route(); toast("Geçici dosyalar silindi."); } catch (e) { toast(e.message, "err"); }
  });
  const logout = document.getElementById("logout-btn");
  logout.hidden = !runtime.login_required;
  logout.addEventListener("click", async () => { try { await api.logout(); authenticated = false; handoff = null; route(); } catch (e) { toast(e.message, "err"); } });
  window.addEventListener("hashchange", route);
  route();
}

function loginView() {
  if (cleanup) { cleanup(); cleanup = null; }
  const password = h("input.input", { type: "password", autocomplete: "current-password", required: true, id: "login-password" });
  const error = h("p.note.warn", { hidden: true, role: "alert" });
  const submit = h("button.btn.primary.big", { type: "submit" }, "Oturum aç");
  const form = h("form.login-card", h("h1", "PDF Atölye'ye giriş"), h("p", "Sunucu yöneticisinin paylaştığı giriş parolasını kullan."),
    h("label", { for: "login-password" }, "Giriş parolası"), password, error, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); submit.disabled = true;
    try { await api.login(password.value); caps = await api.capabilities(); authenticated = true; route(); }
    catch (err) { error.hidden = false; error.textContent = err.message; }
    finally { submit.disabled = false; }
  });
  clear(app).append(h("div.wrap", form));
}

window.addEventListener("session-expired", () => { if (runtime.login_required) { authenticated = false; handoff = null; route(); } });

if (window.lucide) start();
else window.addEventListener("load", start, { once: true });
