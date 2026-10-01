// Özel çalışma alanları: karşılaştırma, HTML/URL, kamerayla tarama.
import { h, icon, dropTarget, pickFiles, toast } from "./ui.js";
import * as api from "./api.js";
import mountFiles from "./ws-files.js";

// ---------------- karşılaştırma ----------------
export function mountCompare(el, ctx) {
  const slots = [ctx.files[0] || null, ctx.files[1] || null];
  const box = h("div.cmp");
  el.append(box);

  async function fill(i, list) {
    const pdfs = list.filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) { toast("Yalnızca PDF dosyaları karşılaştırılabilir.", "err"); return; }
    const infos = await ctx.addFiles(pdfs.slice(0, i === null ? 2 : 1));
    if (!infos.length) return;
    if (i === null) { slots[0] = slots[0] || infos[0]; if (infos[1]) slots[1] = infos[1]; else if (!slots[1] && infos[0] !== slots[0]) slots[1] = infos[0]; }
    else slots[i] = infos[0];
    ctx.setOrder(slots.filter(Boolean).map((f) => f.id));
    draw();
  }

  function slot(i) {
    const f = slots[i];
    const label = i === 0 ? "A – eski sürüm" : "B – yeni sürüm";
    const s = h("section.slot.drop-tool", { style: { minHeight: "340px", padding: "18px" } });
    if (f) {
      s.style.placeItems = "stretch";
      s.append(h("div", { style: { display: "grid", gap: "10px", width: "100%" } },
        h("div.row", h("b.grow", label), h("button.btn.sm", { type: "button", onclick: async () => { const fl = await pickFiles({ accept: ".pdf", multiple: false }); if (fl.length) fill(i, fl); } }, icon("refresh-cw"), "Değiştir")),
        h("div", { style: { display: "grid", placeItems: "center", background: "var(--paper)", borderRadius: "6px", padding: "10px", height: "300px" } },
          h("img", { src: api.pageUrl(f.id, 0, 300), alt: "", style: { maxHeight: "280px", boxShadow: "0 1px 4px rgba(0,0,0,.2)" } })),
        h("div.hint", `${f.name} · ${f.pageCount} sayfa`)));
    } else {
      s.append(h("div",
        h("h2", { style: { fontSize: "24px" } }, label),
        h("p", "PDF'i buraya bırak"),
        h("button.btn.primary", { type: "button", onclick: async () => { const fl = await pickFiles({ accept: ".pdf", multiple: false }); if (fl.length) fill(i, fl); } }, icon("upload"), "PDF seç")));
    }
    dropTarget(s, (fl) => fill(i, fl));
    return s;
  }

  function draw() { box.replaceChildren(slot(0), slot(1)); }
  draw();
  return {
    fileIds: () => slots.filter(Boolean).map((f) => f.id),
    validate: () => (slots[0] && slots[1] ? null : "İki PDF'i de ekle."),
    filesAdded: () => {},
  };
}

// ---------------- HTML / web adresi ----------------
export function mountHtml(el, ctx) {
  const url = h("input.input", { type: "url", placeholder: "https://www.ornek.com", style: { height: "52px", fontSize: "17px" }, "aria-label": "Web adresi" });
  url.addEventListener("keydown", (e) => { if (e.key === "Enter") ctx.run(); });
  const list = h("div");
  el.append(h("div", { style: { display: "grid", gap: "18px" } },
    h("div.field", h("label.field-label", "Web sayfasının adresi"), url,
      h("div.hint", "Sayfa Chrome/Edge ile açılıp PDF olarak kaydedilir.")),
    h("div.row", h("span.hint", "ya da HTML dosyası ekle:"), h("button.btn.sm", { type: "button", onclick: () => ctx.pick() }, icon("upload"), "HTML dosyası seç")),
    list));
  let files = null;
  function draw() {
    list.replaceChildren();
    if (ctx.files.length) {
      const holder = h("div");
      list.append(holder);
      files = mountFiles(holder, ctx);
    }
  }
  draw();
  setTimeout(() => url.focus(), 50);
  return {
    options: () => ({ url: url.value.trim() }),
    validate: () => (url.value.trim() || ctx.files.length ? null : "Bir web adresi yaz ya da HTML dosyası ekle."),
    filesAdded: () => draw(),
    destroy: () => files && files.destroy && files.destroy(),
  };
}

// ---------------- kamerayla tarama ----------------
export function mountScan(el, ctx) {
  const video = h("video.scan-video", { autoplay: true, playsinline: true, muted: true, hidden: true });
  const camBtn = h("button.btn", { type: "button" }, icon("camera"), "Kamerayı aç");
  const shotBtn = h("button.btn.primary", { type: "button", hidden: true }, icon("aperture"), "Fotoğraf çek");
  const holder = h("div");
  let stream = null;
  let files = null;

  camBtn.addEventListener("click", async () => {
    if (stream) { stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream;
      video.hidden = false;
      shotBtn.hidden = false;
      camBtn.replaceChildren(icon("camera-off"), "Kamerayı kapat");
    } catch {
      toast("Kameraya erişilemedi. Tarayıcının kamera iznini kontrol et ya da fotoğraf yükle.", "err");
    }
  });
  shotBtn.addEventListener("click", () => {
    const c = h("canvas", { width: video.videoWidth, height: video.videoHeight });
    c.getContext("2d").drawImage(video, 0, 0);
    c.toBlob((blob) => {
      const name = `tarama_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
      ctx.addFiles([new File([blob], name, { type: "image/jpeg" })]);
    }, "image/jpeg", 0.92);
  });
  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    shotBtn.hidden = true;
    camBtn.replaceChildren(icon("camera"), "Kamerayı aç");
  }
  function draw() {
    if (files && files.destroy) files.destroy();
    holder.replaceChildren();
    files = null;
    if (ctx.files.length) files = mountFiles(holder, ctx);
    else holder.append(h("p.note", "Henüz sayfa yok. Kamerayla çek ya da telefonundan aktardığın fotoğrafları ekle; sırayla PDF'in sayfaları olur."));
  }
  el.append(h("div.scan-box",
    h("div.row", { style: { flexWrap: "wrap" } }, camBtn, shotBtn,
      h("button.btn", { type: "button", onclick: () => ctx.pick() }, icon("image-plus"), "Fotoğraf ekle")),
    video, holder));
  dropTarget(el, (fl) => ctx.addFiles(fl));
  draw();
  return {
    filesAdded: () => draw(),
    validate: () => (ctx.files.length ? null : "En az bir sayfa çek ya da fotoğraf ekle."),
    destroy: () => { stop(); if (files && files.destroy) files.destroy(); },
  };
}
