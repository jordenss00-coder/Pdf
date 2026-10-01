// Araç kataloğu: kategoriler, araçlar ve seçenek şemaları.

export const CATS = [
  { id: "edit", name: "Düzenle ve ekle", color: "var(--m)", note: "Metin, görsel, imza, filigran" },
  { id: "text", name: "Metin ve formlar", color: "var(--my)", note: "Yazıyı düzelt, form doldur ve oluştur" },
  { id: "pages", name: "Sayfalar", color: "var(--c)", note: "Birleştir, böl, sırala, döndür" },
  { id: "from", name: "PDF'ten dönüştür", color: "var(--cm)", note: "Word, Excel, PowerPoint, görsel" },
  { id: "to", name: "PDF'e dönüştür", color: "var(--cy)", note: "Office, görsel, web sayfası, tarama" },
  { id: "optimize", name: "İyileştir", color: "var(--y)", light: true, note: "Sıkıştır, onar, OCR" },
  { id: "security", name: "Güvenlik", color: "var(--k)", note: "Şifrele, karart, karşılaştır" },
  { id: "ai", name: "Yapay zekâ", color: "var(--cm)", ai: true, note: "Claude ile özetle ve çevir" },
];

export const ACCEPT = {
  pdf: ".pdf,application/pdf",
  image: "image/*,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.gif,.jfif",
  word: ".doc,.docx,.docm,.odt,.rtf,.txt,.dot,.dotx",
  excel: ".xls,.xlsx,.xlsm,.ods,.csv",
  powerpoint: ".ppt,.pptx,.pptm,.pps,.ppsx,.odp",
  html: ".html,.htm,.mhtml",
  cert: ".pfx,.p12",
};

const KIND_LABEL = { pdf: "PDF", image: "görsel", word: "Word", excel: "Excel", powerpoint: "PowerPoint", html: "HTML" };
export const kindsLabel = (kinds) => kinds.map((k) => KIND_LABEL[k] || k).join(", ");

const PAPER = [["A4", "A4"], ["A3", "A3"], ["A5", "A5"], ["Letter", "Letter"], ["Legal", "Legal"]];
const ORIENT = [["auto", "Otomatik"], ["portrait", "Dikey"], ["landscape", "Yatay"]];
const MARGIN3 = [["small", "Dar"], ["recommended", "Normal"], ["big", "Geniş"]];
const LANGS = ["İngilizce", "Türkçe", "Almanca", "Fransızca", "İspanyolca", "İtalyanca", "Rusça", "Arapça",
  "Felemenkçe", "Portekizce", "Japonca", "Çince", "Korece", "Yunanca", "Azerbaycan Türkçesi"];
const PAGES_HINT = "Örnek: 1-3, 5, 8- (boş = tüm sayfalar)";

const fontOpt = (key = "family", label = "Yazı tipi") => ({ key, type: "font", label, def: "arial" });

export const TOOLS = [
  {
    id: "pdf_to_markdown", cat: "from", icon: "file-text", name: "PDF → Markdown",
    desc: "Metni, başlıkları ve algılanan tabloları Markdown dosyasına aktar.",
    accept: ["pdf"], ws: "files", multi: true, action: "Markdown'a dönüştür",
    opts: [
      { key: "pages", type: "text", label: "Sayfalar", placeholder: PAGES_HINT },
      { key: "headings", type: "check", label: "Yazı boyutundan başlıkları algıla", def: true },
      { key: "tables", type: "check", label: "Tabloları algıla", def: true },
      { key: "links", type: "check", label: "Web bağlantılarını ekle", def: true },
      { key: "page_markers", type: "check", label: "Sayfa işaretlerini ekle", def: true },
    ],
  },
  // ---------------- Düzenle ve ekle ----------------
  {
    id: "edit", cat: "edit", icon: "pencil-line", name: "PDF Düzenle",
    desc: "Metin, görsel, şekil, çizim, not ve bağlantı ekle; mevcut yazıyı düzelt.",
    accept: ["pdf"], ws: "editor", mode: "edit", action: "Değişiklikleri kaydet",
    opts: [{ key: "flatten", type: "check", label: "Notları ve vurguları sayfaya kalıcı işle", def: false }],
  },
  {
    id: "sign", cat: "edit", icon: "signature", name: "PDF İmzala",
    desc: "İmzanı çiz, yaz ya da yükle; istersen sertifikayla e-imza da ekle.",
    accept: ["pdf"], ws: "editor", mode: "sign", action: "İmzala",
    opts: [
      { key: "cert_on", type: "check", label: "Sertifikayla dijital imza ekle (.pfx / .p12)", def: false },
      { key: "cert_file", type: "upload", label: "Sertifika dosyası", accept: ACCEPT.cert, show: (o) => o.cert_on },
      { key: "cert_password", type: "password", label: "Sertifika parolası", show: (o) => o.cert_on },
      { key: "cert_reason", type: "text", label: "İmza nedeni", placeholder: "Onaylıyorum", show: (o) => o.cert_on },
      { key: "cert_location", type: "text", label: "Konum", placeholder: "İstanbul", show: (o) => o.cert_on },
    ],
    build: (o) => {
      const out = { ...o };
      if (o.cert_on && o.cert_file) {
        out.certificate = { file: o.cert_file, password: o.cert_password || "", reason: o.cert_reason || "", location: o.cert_location || "" };
      }
      return out;
    },
    validate: (o) => (o.cert_on && !o.cert_file ? "Sertifika dosyasını seç." : null),
  },
  {
    id: "watermark", cat: "edit", icon: "stamp", name: "Filigran Ekle",
    desc: "Sayfalara yazı ya da logo filigranı bas; saydamlık, açı ve konumu ayarla.",
    accept: ["pdf"], multi: true, ws: "files", action: "Filigran ekle",
    opts: [
      { key: "kind", type: "seg", label: "Filigran türü", def: "text", options: [["text", "Yazı"], ["image", "Görsel"]] },
      { key: "text", type: "text", label: "Filigran yazısı", def: "GİZLİ", show: (o) => o.kind === "text" },
      { ...fontOpt(), show: (o) => o.kind === "text" },
      { key: "size", type: "number", label: "Yazı boyutu (pt)", def: 60, min: 6, max: 300, show: (o) => o.kind === "text" },
      { key: "color", type: "color", label: "Renk", def: "#cf006d", show: (o) => o.kind === "text" },
      { key: "bold", type: "check", label: "Kalın", def: true, show: (o) => o.kind === "text" },
      { key: "image", type: "image", label: "Görsel (PNG önerilir)", show: (o) => o.kind === "image" },
      { key: "scale", type: "range", label: "Görsel genişliği (sayfanın %'si)", def: 40, min: 5, max: 100, show: (o) => o.kind === "image" },
      { key: "opacity", type: "range", label: "Saydamlık", def: 0.3, min: 0.05, max: 1, step: 0.05, fmt: (v) => `%${Math.round(v * 100)}` },
      { key: "rotation", type: "seg", label: "Açı", def: 45, options: [[0, "0°"], [30, "30°"], [45, "45°"], [90, "90°"], [-45, "−45°"]] },
      { key: "position", type: "pos9", label: "Konum", def: "middle-center", tile: true },
      { key: "layer", type: "seg", label: "Katman", def: "over", options: [["over", "İçeriğin üstünde"], ["under", "Altında"]] },
      { key: "pages", type: "text", label: "Sayfalar", placeholder: "Tümü", hint: PAGES_HINT },
    ],
    validate: (o) => (o.kind === "image" && !o.image ? "Filigran için bir görsel seç." : o.kind === "text" && !o.text ? "Filigran yazısını gir." : null),
  },
  {
    id: "page_numbers", cat: "edit", icon: "list-ordered", name: "Sayfa Numarası",
    desc: "Sayfalara istediğin konumda ve biçimde numara ekle.",
    accept: ["pdf"], ws: "files", action: "Numara ekle",
    opts: [
      { key: "position", type: "pos9", label: "Konum", def: "bottom-center" },
      { key: "margin", type: "seg", label: "Kenar boşluğu", def: "recommended", options: MARGIN3 },
      { key: "format", type: "select", label: "Biçim", def: "{n}", options: [["{n}", "1"], ["{n} / {total}", "1 / 10"], ["Sayfa {n}", "Sayfa 1"], ["Sayfa {n} / {total}", "Sayfa 1 / 10"], ["- {n} -", "- 1 -"], ["custom", "Özel…"]] },
      { key: "custom_format", type: "text", label: "Özel biçim", placeholder: "Sayfa {n} / {total}", hint: "{n} sayfa no, {total} toplam, {date} tarih, {file} dosya adı", show: (o) => o.format === "custom" },
      { key: "start", type: "number", label: "İlk numara", def: 1, min: 0 },
      { key: "pages", type: "text", label: "Numaralanacak sayfalar", placeholder: "Tümü", hint: PAGES_HINT },
      fontOpt(),
      { key: "size", type: "number", label: "Boyut (pt)", def: 11, min: 5, max: 72 },
      { key: "color", type: "color", label: "Renk", def: "#000000" },
      { key: "bold", type: "check", label: "Kalın", def: false },
      { key: "mirror", type: "check", label: "Karşılıklı sayfalar (çift sayfalarda sağ/sol yer değiştirsin)", def: false },
    ],
    build: (o) => ({ ...o, format: o.format === "custom" ? (o.custom_format || "{n}") : o.format }),
  },
  {
    id: "header_footer", cat: "edit", icon: "panel-top", name: "Üst ve Alt Bilgi",
    desc: "Her sayfaya başlık, tarih, dosya adı ya da sayfa numarası yaz.",
    accept: ["pdf"], ws: "files", action: "Üst/alt bilgi ekle",
    opts: [
      { type: "note", text: "Kullanılabilecek alanlar: {n} sayfa no, {total} toplam sayfa, {date} tarih, {time} saat, {file} dosya adı" },
      { key: "header_left", type: "text", label: "Üst bilgi – sol" },
      { key: "header_center", type: "text", label: "Üst bilgi – orta" },
      { key: "header_right", type: "text", label: "Üst bilgi – sağ", placeholder: "{date}" },
      { key: "footer_left", type: "text", label: "Alt bilgi – sol", placeholder: "{file}" },
      { key: "footer_center", type: "text", label: "Alt bilgi – orta" },
      { key: "footer_right", type: "text", label: "Alt bilgi – sağ", placeholder: "Sayfa {n} / {total}" },
      { key: "line", type: "check", label: "Ayırıcı çizgi ekle", def: false },
      fontOpt(),
      { key: "size", type: "number", label: "Boyut (pt)", def: 10, min: 5, max: 40 },
      { key: "color", type: "color", label: "Renk", def: "#333333" },
      { key: "margin", type: "seg", label: "Kenar boşluğu", def: "recommended", options: MARGIN3 },
      { key: "pages", type: "text", label: "Sayfalar", placeholder: "Tümü", hint: PAGES_HINT },
    ],
  },
  {
    id: "crop", cat: "edit", icon: "crop", name: "PDF Kırp",
    desc: "Sayfa üzerinde alan seçerek kırp ya da beyaz kenarları otomatik temizle.",
    accept: ["pdf"], ws: "editor", mode: "crop", action: "Kırp",
    opts: [
      { key: "mode", type: "seg", label: "Yöntem", def: "manual", options: [["manual", "Alanı seç"], ["auto", "Beyaz kenarları kırp"]] },
      { key: "apply", type: "seg", label: "Uygula", def: "all", options: [["all", "Tüm sayfalara"], ["current", "Yalnız bu sayfaya"]], show: (o) => o.mode === "manual" },
      { key: "padding", type: "number", label: "İç boşluk (pt)", def: 10, min: 0, max: 100, show: (o) => o.mode === "auto" },
    ],
  },
  // ---------------- Metin ve formlar ----------------
  {
    id: "edit_text", backend: "edit", cat: "text", icon: "type", name: "Metni Düzelt",
    desc: "PDF'teki yazıya tıkla, yerinde düzelt. Yazı tipi, boyut ve renk korunur.",
    accept: ["pdf"], ws: "editor", mode: "text", action: "Düzeltmeleri kaydet",
  },
  {
    id: "find_replace", cat: "text", icon: "replace", name: "Bul ve Değiştir",
    desc: "Bir kelimeyi ya da ifadeyi tüm belgede tek seferde değiştir.",
    accept: ["pdf"], ws: "editor", mode: "find", action: "Tümünü değiştir",
    opts: [
      { key: "pairs", type: "pairs", label: "Değişiklikler", def: [{ find: "", replace: "" }] },
      { key: "case", type: "check", label: "Büyük/küçük harf duyarlı", def: false },
      { key: "whole_word", type: "check", label: "Yalnızca tam kelime", def: false },
    ],
    validate: (o) => ((o.pairs || []).some((p) => p.find) ? null : "Aranacak metni yaz."),
  },
  {
    id: "form", cat: "text", icon: "clipboard-pen-line", name: "Form Doldur",
    desc: "Doldurulabilir alanları doldur. Düz PDF'te alanlar otomatik algılanır.",
    accept: ["pdf"], ws: "editor", mode: "form", action: "Formu kaydet",
    opts: [{ key: "flatten", type: "check", label: "Kaydederken düzleştir (alanlar düzenlenemez hale gelir)", def: false }],
  },
  {
    id: "form_create", backend: "form", cat: "text", icon: "text-cursor-input", name: "Form Oluştur",
    desc: "Çizgileri, kutucukları ve “Ad: ____” boşluklarını algılayıp doldurulabilir forma çevir.",
    accept: ["pdf"], ws: "editor", mode: "form", autodetect: true, action: "Doldurulabilir PDF oluştur",
    opts: [{ key: "flatten", type: "check", label: "Kaydederken düzleştir", def: false }],
  },
  {
    id: "metadata", cat: "text", icon: "info", name: "Belge Bilgileri",
    desc: "Başlık, yazar, konu ve anahtar kelimeleri düzenle ya da tamamen temizle.",
    accept: ["pdf"], ws: "files", action: "Bilgileri kaydet", loadMeta: true,
    opts: [
      { key: "title", type: "text", label: "Başlık" },
      { key: "author", type: "text", label: "Yazar" },
      { key: "subject", type: "text", label: "Konu" },
      { key: "keywords", type: "text", label: "Anahtar kelimeler" },
      { key: "creator", type: "text", label: "Oluşturan uygulama" },
      { key: "producer", type: "text", label: "Üretici" },
      { key: "clear", type: "check", label: "Tüm bilgileri sil", def: false },
    ],
  },
  // ---------------- Sayfalar ----------------
  {
    id: "merge", cat: "pages", icon: "combine", name: "PDF Birleştir",
    desc: "PDF, görsel ve Office dosyalarını istediğin sırayla tek PDF'te topla.",
    accept: ["pdf", "image", "word", "excel", "powerpoint"], multi: true, sortable: true, ws: "files", action: "Birleştir",
    opts: [{ key: "bookmarks", type: "check", label: "Her dosya için yer imi ekle", def: true }],
    validate: (_o, files) => (files.length < 2 ? "Birleştirmek için en az 2 dosya ekle." : null),
  },
  {
    id: "split", cat: "pages", icon: "scissors", name: "PDF Böl",
    desc: "Aralıklara, sabit sayfa sayısına, yer imlerine ya da boyuta göre ayır.",
    accept: ["pdf"], ws: "pages", mode: "split", action: "Böl",
    opts: [
      { key: "mode", type: "cards", label: "Bölme şekli", def: "ranges", options: [
        ["ranges", "Aralıklara göre", "Her aralık ayrı bir PDF olur."],
        ["every", "Her N sayfada bir", "Eşit parçalara ayır."],
        ["all", "Tüm sayfaları ayır", "Her sayfa ayrı PDF."],
        ["bookmarks", "Yer imlerine göre", "Her bölüm ayrı PDF."],
        ["size", "Dosya boyutuna göre", "Her parça en fazla X MB."]] },
      { key: "ranges", type: "text", label: "Aralıklar", placeholder: "1-3, 4-8, 9-", hint: "Her virgül yeni bir dosya başlatır.", show: (o) => o.mode === "ranges" },
      { key: "merge_output", type: "check", label: "Aralıkları tek PDF'te birleştir", def: false, show: (o) => o.mode === "ranges" },
      { key: "every", type: "number", label: "Kaç sayfada bir", def: 2, min: 1, show: (o) => o.mode === "every" },
      { key: "max_mb", type: "number", label: "En büyük parça (MB)", def: 5, min: 0.1, step: 0.1, show: (o) => o.mode === "size" },
    ],
    validate: (o) => (o.mode === "ranges" && !o.ranges ? "Aralıkları yaz, ya da sayfalardan seç." : null),
  },
  {
    id: "remove_pages", cat: "pages", icon: "file-minus", name: "Sayfa Sil",
    desc: "İstemediğin sayfaları seç ve kaldır.",
    accept: ["pdf"], ws: "pages", mode: "select", action: "Seçili sayfaları sil",
    opts: [{ key: "pages", type: "text", label: "Silinecek sayfalar", placeholder: "Sayfalara tıkla ya da yaz: 2, 5-7", bindSelection: true }],
    validate: (o) => (!o.pages ? "Silinecek sayfaları seç." : null),
  },
  {
    id: "extract_pages", cat: "pages", icon: "file-output", name: "Sayfa Çıkar",
    desc: "Seçtiğin sayfalardan yeni bir PDF oluştur.",
    accept: ["pdf"], ws: "pages", mode: "select", action: "Sayfaları çıkar",
    opts: [
      { key: "pages", type: "text", label: "Çıkarılacak sayfalar", placeholder: "Sayfalara tıkla ya da yaz: 1, 3-4", bindSelection: true },
      { key: "separate", type: "check", label: "Her sayfayı ayrı dosya yap", def: false },
    ],
    validate: (o) => (!o.pages ? "Çıkarılacak sayfaları seç." : null),
  },
  {
    id: "organize", cat: "pages", icon: "layout-grid", name: "Sayfaları Düzenle",
    desc: "Sürükleyerek sırala, döndür, sil, kopyala, boş sayfa ekle; birden fazla PDF'i karıştır.",
    accept: ["pdf", "image"], multi: true, ws: "pages", mode: "organize", action: "Kaydet",
  },
  {
    id: "rotate", cat: "pages", icon: "rotate-cw", name: "PDF Döndür",
    desc: "Tüm sayfaları ya da tek tek sayfaları döndür.",
    accept: ["pdf"], ws: "pages", mode: "rotate", action: "Döndür",
  },
  {
    id: "nup", cat: "pages", icon: "grid-2x2", name: "Kağıda Çoklu Sayfa",
    desc: "2, 4, 6, 9 veya 16 sayfayı tek kağıda yerleştir; baskıdan tasarruf et.",
    accept: ["pdf"], ws: "files", action: "Oluştur",
    opts: [
      { key: "per_sheet", type: "seg", label: "Kağıt başına sayfa", def: 2, options: [[2, "2"], [4, "4"], [6, "6"], [8, "8"], [9, "9"], [16, "16"]] },
      { key: "paper", type: "select", label: "Kağıt", def: "A4", options: PAPER },
      { key: "orientation", type: "seg", label: "Yön", def: "auto", options: ORIENT },
      { key: "order", type: "seg", label: "Sıra", def: "horizontal", options: [["horizontal", "Soldan sağa"], ["vertical", "Yukarıdan aşağı"]] },
      { key: "border", type: "check", label: "Sayfa kenarlarını çiz", def: false },
    ],
  },
  {
    id: "resize_pages", cat: "pages", icon: "scaling", name: "Sayfa Boyutu",
    desc: "Tüm sayfaları A4, A3, Letter gibi tek bir kağıt boyutuna getir.",
    accept: ["pdf"], ws: "files", action: "Boyutlandır",
    opts: [
      { key: "paper", type: "select", label: "Kağıt", def: "A4", options: PAPER },
      { key: "orientation", type: "seg", label: "Yön", def: "auto", options: ORIENT },
      { key: "margin", type: "number", label: "Kenar boşluğu (pt)", def: 0, min: 0, max: 100 },
    ],
  },
  // ---------------- PDF'ten dönüştür ----------------
  {
    id: "pdf_to_word", cat: "from", icon: "file-text", name: "PDF'ten Word'e",
    desc: "PDF'i düzenlenebilir DOCX belgesine çevir.",
    accept: ["pdf"], multi: true, ws: "files", action: "Word'e dönüştür",
    opts: [{ key: "engine", type: "cards", label: "Dönüştürücü", def: "pdf2docx", options: [
      ["pdf2docx", "Düzeni koru", "Sayfa yerleşimi, tablolar ve görseller korunur."],
      ["word", "Microsoft Word ile", "Akışkan, kolay düzenlenen metin (Word kurulu olmalı).", "word"]] }],
  },
  {
    id: "pdf_to_excel", cat: "from", icon: "table", name: "PDF'ten Excel'e",
    desc: "PDF'teki tabloları çalışma sayfalarına aktar.",
    accept: ["pdf"], multi: true, ws: "files", action: "Excel'e dönüştür",
    opts: [
      { key: "layout", type: "seg", label: "Yerleşim", def: "per_table", options: [["per_table", "Her tablo ayrı sayfa"], ["single", "Tek sayfada"]] },
      { key: "numbers", type: "seg", label: "Sayıları dönüştür", def: "tr", options: [["tr", "1.234,56"], ["en", "1,234.56"], ["none", "Metin kalsın"]] },
    ],
  },
  {
    id: "pdf_to_ppt", cat: "from", icon: "presentation", name: "PDF'ten PowerPoint'e",
    desc: "Her sayfayı bir slayta çevir.",
    accept: ["pdf"], multi: true, ws: "files", action: "PowerPoint'e dönüştür",
    opts: [{ key: "mode", type: "cards", label: "Slayt türü", def: "editable", options: [
      ["editable", "Düzenlenebilir", "Metinler ayrı kutularda, arka plan korunur."],
      ["image", "Birebir görünüm", "Her sayfa tam görüntü olarak eklenir."]] }],
  },
  {
    id: "pdf_to_images", cat: "from", icon: "image-down", name: "PDF'ten JPG'ye",
    desc: "Sayfaları görsel olarak kaydet ya da PDF içindeki görselleri çıkar.",
    accept: ["pdf"], multi: true, ws: "files", action: "Görsellere dönüştür",
    opts: [
      { key: "mode", type: "cards", label: "Ne yapılsın?", def: "pages", options: [
        ["pages", "Sayfaları görsele çevir", "Her sayfa bir JPG/PNG olur."],
        ["extract", "Görselleri çıkar", "PDF'e gömülü fotoğrafları ayıkla."]] },
      { key: "format", type: "seg", label: "Biçim", def: "jpg", options: [["jpg", "JPG"], ["png", "PNG"]], show: (o) => o.mode === "pages" },
      { key: "dpi", type: "seg", label: "Çözünürlük", def: 150, options: [[72, "Düşük"], [150, "Normal"], [300, "Yüksek"]], show: (o) => o.mode === "pages" },
      { key: "pages", type: "text", label: "Sayfalar", placeholder: "Tümü", hint: PAGES_HINT, show: (o) => o.mode === "pages" },
    ],
  },
  {
    id: "pdf_to_pdfa", cat: "from", icon: "archive", name: "PDF/A'ya Dönüştür",
    desc: "Arşivleme için PDF/A dönüşümü yap; uygunluğu ayrıca doğrula.",
    accept: ["pdf"], multi: true, ws: "files", action: "PDF/A'ya dönüştür",
    opts: [{ key: "part", type: "seg", label: "Sürüm", def: "2", options: [["1", "PDF/A-1b"], ["2", "PDF/A-2b"], ["3", "PDF/A-3b"]] }],
  },
  {
    id: "pdf_to_text", cat: "from", icon: "file-type", name: "PDF'ten Metne",
    desc: "Tüm metni TXT ya da HTML olarak çıkar.",
    accept: ["pdf"], multi: true, ws: "files", action: "Metni çıkar",
    opts: [{ key: "format", type: "seg", label: "Biçim", def: "txt", options: [["txt", "Düz metin (.txt)"], ["html", "HTML"]] }],
  },
  // ---------------- PDF'e dönüştür ----------------
  {
    id: "images_to_pdf", cat: "to", icon: "image", name: "JPG'den PDF'e",
    desc: "JPG, PNG ve diğer görselleri sıralayıp PDF yap.",
    accept: ["image"], multi: true, sortable: true, ws: "files", action: "PDF'e dönüştür",
    opts: [
      { key: "page_size", type: "seg", label: "Sayfa boyutu", def: "fit", options: [["fit", "Görsel boyutu"], ["A4", "A4"], ["Letter", "Letter"]] },
      { key: "orientation", type: "seg", label: "Yön", def: "auto", options: ORIENT, show: (o) => o.page_size !== "fit" },
      { key: "margin", type: "seg", label: "Kenar boşluğu", def: "none", options: [["none", "Yok"], ["small", "Dar"], ["big", "Geniş"]] },
      { key: "merge", type: "check", label: "Tüm görselleri tek PDF'te birleştir", def: true },
    ],
  },
  {
    id: "word_to_pdf", cat: "to", icon: "file-text", name: "Word'den PDF'e",
    desc: "DOC, DOCX, ODT, RTF ve TXT dosyalarını PDF'e çevir.",
    accept: ["word"], multi: true, ws: "files", action: "PDF'e dönüştür", needs: "word",
    opts: [{ key: "merge", type: "check", label: "Birden fazla dosyayı tek PDF'te birleştir", def: false }],
  },
  {
    id: "excel_to_pdf", cat: "to", icon: "sheet", name: "Excel'den PDF'e",
    desc: "XLS, XLSX, ODS ve CSV tablolarını PDF'e çevir.",
    accept: ["excel"], multi: true, ws: "files", action: "PDF'e dönüştür", needs: "excel",
    opts: [{ key: "merge", type: "check", label: "Birden fazla dosyayı tek PDF'te birleştir", def: false }],
  },
  {
    id: "ppt_to_pdf", cat: "to", icon: "presentation", name: "PowerPoint'ten PDF'e",
    desc: "PPT ve PPTX sunumlarını PDF'e çevir.",
    accept: ["powerpoint"], multi: true, ws: "files", action: "PDF'e dönüştür", needs: "powerpoint",
    opts: [{ key: "merge", type: "check", label: "Birden fazla dosyayı tek PDF'te birleştir", def: false }],
  },
  {
    id: "html_to_pdf", cat: "to", icon: "globe", name: "HTML'den PDF'e",
    desc: "Bir web sayfasını ya da HTML dosyasını PDF olarak kaydet.",
    accept: ["html"], multi: true, ws: "html", action: "PDF'e dönüştür", needs: "browser",
    opts: [{ key: "header_footer", type: "check", label: "Tarih ve adres üst bilgisini ekle", def: false }],
  },
  {
    id: "scan", cat: "to", icon: "camera", name: "Belge Tara",
    desc: "Kamerayla ya da fotoğraftan tara; kenarlar kırpılır ve netleştirilir.",
    accept: ["image"], multi: true, ws: "scan", action: "PDF oluştur",
    opts: [
      { key: "filter", type: "seg", label: "Görünüm", def: "auto", options: [["auto", "Renkli"], ["gray", "Gri"], ["bw", "Siyah-beyaz"], ["none", "Olduğu gibi"]] },
      { key: "auto_crop", type: "check", label: "Belge kenarlarını bul ve düzelt", def: true },
      { key: "page_size", type: "seg", label: "Sayfa", def: "A4", options: [["A4", "A4"], ["fit", "Fotoğraf boyutu"]] },
      { key: "ocr", type: "check", label: "Metni tanı (OCR) – aranabilir PDF", def: false },
    ],
  },
  // ---------------- İyileştir ----------------
  {
    id: "compress", cat: "optimize", icon: "minimize-2", name: "PDF Sıkıştır",
    desc: "Dosya boyutunu kalite ve sıkıştırma seçenekleriyle küçült.",
    accept: ["pdf"], multi: true, ws: "files", action: "Sıkıştır",
    opts: [
      { key: "level", type: "cards", label: "Sıkıştırma düzeyi", def: "recommended", options: [
        ["extreme", "En yüksek", "En küçük dosya, görseller belirgin şekilde düşük kalite."],
        ["recommended", "Önerilen", "İyi kalite, iyi sıkıştırma."],
        ["low", "Hafif", "Yüksek kalite, daha az sıkıştırma."]] },
      { key: "grayscale", type: "check", label: "Görselleri griye çevir", def: false },
    ],
  },
  {
    id: "ocr", cat: "optimize", icon: "scan-text", name: "OCR – Metin Tanıma",
    desc: "Taranmış PDF ve fotoğrafları aranabilir, seçilebilir metne çevir.",
    accept: ["pdf", "image"], multi: true, ws: "files", action: "Metni tanı",
    opts: [
      { key: "language", type: "select", label: "Belgenin dili", def: "tur+eng", options: [["tur+eng", "Türkçe + İngilizce"], ["tur", "Türkçe"], ["eng", "İngilizce"]] },
      { key: "skip_text_pages", type: "check", label: "Zaten metin içeren sayfaları atla", def: true },
      { key: "pages", type: "text", label: "Sayfalar", placeholder: "Tümü", hint: PAGES_HINT },
    ],
  },
  {
    id: "repair", cat: "optimize", icon: "wrench", name: "PDF Onar",
    desc: "Bozuk ya da açılmayan PDF'leri kurtarmayı dene.",
    accept: ["pdf"], multi: true, ws: "files", action: "Onar",
  },
  {
    id: "grayscale", cat: "optimize", icon: "contrast", name: "Siyah-Beyaz Yap",
    desc: "Tüm renkleri griye çevir; baskıda renkli mürekkep harcama.",
    accept: ["pdf"], multi: true, ws: "files", action: "Griye çevir",
  },
  {
    id: "flatten", cat: "optimize", icon: "layers", name: "Düzleştir",
    desc: "Form alanlarını ve notları sayfaya kalıcı olarak işle.",
    accept: ["pdf"], multi: true, ws: "files", action: "Düzleştir",
  },
  // ---------------- Güvenlik ----------------
  {
    id: "protect", cat: "security", icon: "lock", name: "PDF Şifrele",
    desc: "AES-256 ile parola koy; yazdırma ve kopyalama izinlerini belirle.",
    accept: ["pdf"], multi: true, ws: "files", action: "Şifrele",
    opts: [
      { key: "password", type: "password", label: "Parola" },
      { key: "password2", type: "password", label: "Parola (tekrar)" },
      { key: "permissions", type: "checks", label: "İzin verilenler", def: ["print", "copy", "annotate"], options: [["print", "Yazdırma"], ["copy", "Metin kopyalama"], ["annotate", "Not ve form doldurma"], ["modify", "Düzenleme"]] },
    ],
    validate: (o) => (!o.password ? "Bir parola belirle." : o.password !== o.password2 ? "Parolalar eşleşmiyor." : null),
  },
  {
    id: "unlock", cat: "security", icon: "lock-open", name: "Şifre Kaldır",
    desc: "Parolasını bildiğin PDF'ten şifreyi ve kısıtlamaları kaldır.",
    accept: ["pdf"], multi: true, ws: "files", action: "Şifreyi kaldır", allowLocked: true,
    opts: [{ key: "password", type: "password", label: "PDF parolası", hint: "Yalnızca kısıtlama varsa boş bırakabilirsin." }],
  },
  {
    id: "redact", cat: "security", icon: "eye-off", name: "Karart",
    desc: "Kişisel bilgileri kalıcı olarak sil: TC kimlik, IBAN, telefon, e-posta…",
    accept: ["pdf"], ws: "editor", mode: "redact", action: "Kalıcı olarak karart",
    opts: [
      { key: "presets", type: "checks", label: "Otomatik bul", def: [], options: [["tckn", "TC kimlik no"], ["iban", "IBAN"], ["phone", "Telefon"], ["email", "E-posta"], ["card", "Kart numarası"], ["url", "Web adresi"], ["date", "Tarih"]] },
      { key: "terms_text", type: "textarea", label: "Aranacak kelimeler", placeholder: "Her satıra bir ifade", hint: "Bulunan her yer karartılır." },
      { key: "case", type: "check", label: "Büyük/küçük harf duyarlı", def: false },
      { key: "color", type: "color", label: "Karartma rengi", def: "#000000" },
      { key: "clean_metadata", type: "check", label: "Belge bilgilerini (yazar vb.) de sil", def: true },
    ],
    build: (o) => ({ ...o, terms: (o.terms_text || "").split("\n").map((s) => s.trim()).filter(Boolean) }),
  },
  {
    id: "compare", cat: "security", icon: "git-compare", name: "PDF Karşılaştır",
    desc: "İki sürüm arasındaki farkları yan yana renkli olarak göster.",
    accept: ["pdf"], multi: true, ws: "compare", action: "Karşılaştır",
    opts: [{ key: "mode", type: "cards", label: "Karşılaştırma türü", def: "text", options: [
      ["text", "Metin farkları", "Eklenen ve silinen kelimeler işaretlenir."],
      ["visual", "Görsel farklar", "Taranmış belgeler ve çizimler için piksel karşılaştırma."]] }],
    validate: (_o, files) => (files.length !== 2 ? "Karşılaştırmak için iki PDF ekle." : null),
  },
  // ---------------- Yapay zekâ ----------------
  {
    id: "ai_summarize", cat: "ai", icon: "sparkles", name: "Özetle",
    desc: "Uzun belgeleri Claude ile birkaç dakikada özetle.",
    accept: ["pdf"], ws: "files", action: "Özetle", needs: "ai",
    opts: [
      { key: "length", type: "cards", label: "Uzunluk", def: "medium", options: [["short", "Kısa", "5-7 madde"], ["medium", "Orta", "Başlıklarla yaklaşık 1 sayfa"], ["long", "Ayrıntılı", "Bölüm bölüm, sayılar ve tarihlerle"]] },
      { key: "language", type: "select", label: "Özet dili", def: "Türkçe", options: LANGS.map((l) => [l, l]) },
      { key: "focus", type: "text", label: "Odaklanılacak konu (isteğe bağlı)", placeholder: "Örn. ödeme koşulları" },
    ],
  },
  {
    id: "ai_translate", cat: "ai", icon: "languages", name: "PDF Çevir",
    desc: "Sayfa düzenini koruyarak başka bir dile çevir.",
    accept: ["pdf"], ws: "files", action: "Çevir", needs: "ai",
    opts: [{ key: "language", type: "select", label: "Hedef dil", def: "İngilizce", options: LANGS.map((l) => [l, l]) }],
  },
];

export const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export const catOf = (t) => CATS.find((c) => c.id === t.cat);

/** Bir dosya türleri kümesine uyan araçlar (sonuçla devam et / dosya bırakınca öneriler). */
export function toolsFor(kinds) {
  const ks = [...new Set(kinds)];
  return TOOLS.filter((t) => ks.every((k) => t.accept.includes(k)) && (ks.length === 1 || t.multi || t.ws === "pages"));
}

export function needsMet(t, caps) {
  if (caps?.mode === "hosted" && (t.needs === "ai" || t.needs === "browser")) return false;
  if (!t.needs || !caps) return true;
  if (t.needs === "ai") return true; // anahtar yoksa araç içinde uyarı gösterilir
  if (["word", "excel", "powerpoint"].includes(t.needs)) return caps[t.needs] || caps.libreoffice;
  return !!caps[t.needs];
}
