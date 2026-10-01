# Test raporu — 1 Ekim 2026

## Windows masaüstü 0.3.1 — kullanım kolaylığı

Kullanıcının paylaştığı 55 saniyelik kayıt yerelde incelendi. Kayıt ve kullanıcı
belgeleri depoya eklenmedi; testlerde yapay iki sayfalı PDF kullanıldı.

- 27 Python testi geçti (3,914 saniye); 11 JavaScript modülünün sözdizimi geçerli.
- Gerçek Edge üzerinde `scripts/check-editor.cjs` çalıştırıldı:
  dosya bırakınca doğrudan açılış, iki sayfanın görüntülenmesi, Ctrl + tekerlek
  yakınlaştırması ve işaretçi odağı, Ctrl/Boşluk/orta tuş/gezinme aracıyla taşıma.
- Taşıma sırasında seçili çizim aracının nesne oluşturmadığı doğrulandı.
- Sığdırmada yatay taşma olmaması, kısayol yardımı, metin yazma, geri al/yinele,
  araç değiştirme uyarısından vazgeçince değişikliklerin korunması doğrulandı.
- 1280 × 900 ve 800 × 700 pencerelerde ekran dışına yatay taşma yok.
- Ctrl + S ile sonuç üretildi ve PDF indirildi. Çıktıda iki sayfa ve eklenen metin
  doğrulandı.
- Dosya seçiciden çoklu yüklemede iki önizleme göründü; JavaScript istisnası yok.
- Ekran kanıtları: `test-results/editor-desktop.png`, `editor-small.png`.
- [Windows paketleme](https://github.com/jordenss00-coder/Pdf/actions/runs/36856379905)
  (`3bc0dc8`) başarılı: paketli EXE ile yükle/döndür/DOCX/Markdown/indir/sil, kurulum,
  kurulu EXE, kaldırma ve gerçek WebView2 penceresi (43 araç bağlantısı) geçti.
- Aynı paket bu bilgisayarda ZIP'ten açılarak tekrar sınandı: işlem testi ve WebView2
  pencere testi geçti; paketteki `editor.js` kaynakla aynı. SHA-256 değerleri eşleşti.
- Bağımsız tekrar: 27 Python testi, 11 JavaScript modülü ve `check-editor.cjs`
  bu bilgisayarda Edge ile yeniden çalıştırıldı; tümü geçti.

Tekrar çalıştırma: yerel test sunucusu, Playwright/Edge ve yapay iki sayfalı PDF
ile `node scripts/check-editor.cjs dosya.pdf`. `BASE_URL` test sunucusunu,
`PLAYWRIGHT_MODULE` mevcut Playwright kurulumunu seçebilir. Çıktılar Git dışındaki
`test-results` klasörüne yazılır. Betik yalnızca test sunucusuna karşı çalıştırılmalı.

Kalanlar: dokunmatik ekran/kalem hareketleri ve büyük/karmaşık belgelerle geniş
kullanıcı testi. WebView2 içindeki yerel dosya/indirme diyaloglarının tamamı otomatik
olarak sınanmıyor; Edge testi dosya seçme olayını kullanıyor.

Bilinen küçük sorun: Arial ile eklenen metinde boşluk ve bölünmez boşluk aynı
glifi kullandığından PDF'ten kopyalanan metinde boşluk U+00A0 olarak gelebilir.
Görünüm ve PDF içi arama etkilenmiyor; düzeltme sonraki sürüme bırakıldı.

## Windows masaüstü 0.3.0

- Kaynak masaüstü başlatıcısında özel sunucu → yükle → döndür/DOCX/Markdown →
  indir → sil testi geçti (`test-results/desktop-source-smoke.json`).
- Regresyon paketi 27 teste genişletildi. İlk koşuda ikinci uygulama örneğinin
  kilitli dosya baytını okuması Windows'ta PermissionError verdi. Boyut kontrolü
  dosya meta verisine taşındı; dört masaüstü birim testi yeniden geçti.
- Yerelde 27 regresyon testi geçti (5,930 saniye).
- Paketlenmiş EXE, gerçek WebView2 penceresi, kurulum ve kaldırma kontrolleri
  [Windows derlemesinde](https://github.com/jordenss00-coder/Pdf/actions/runs/36850545847)
  **başarılı**. Test edilen kod: `4399136`.
- [Genel CI](https://github.com/jordenss00-coder/Pdf/actions/runs/36850545761)
  de başarılı: Windows/Linux regresyonu, JavaScript ve Docker kontrolleri.
- Gerçek pencerenin açılması otomatik sınandı; yerel dosya seçme/indirme
  diyalogları ve tüm araç seçenekleri elle doğrulanmadı.
- GitHub'da üretilen ZIP bu bilgisayarda ayrı test klasörüne açıldı. Paketli
  EXE'nin işlem testi ve WebView2 testi geçti: ana sayfada 43 araç kartı.
  Yerel kanıtlar: `test-results/packaged-local-smoke.json` ve
  `test-results/packaged-local-ui.json`. EXE ve ZIP SHA-256 değerleri yayımlanan
  SHA256SUMS.txt ile eşleşti.
- Önceki web sürümünün sonuçları aşağıda tarihsel kayıt olarak korunuyor.

## Ortam

Windows, proje `.venv` ortamı (Python 3.14.6). Yapay örnek PDF'ler ve ayrı
geçici klasörler kullanıldı. Kullanıcı belgeleri/API anahtarları GitHub'a veya
dönüşüm servisine gönderilmedi.

## Otomatik kontroller

`python -m unittest discover -s tests -v`: **22 test geçti**, son yerel koşu 3.673 saniye.

Kapsam: giriş/çerez, başka oturumun belgesine tüm API yollarından erişim,
Host/Origin, Content-Length olmadan aşırı boyut, dosya sayısı/boyutu/sayfa/kota,
sunucu ayarları/kapalı araçlar, sertifika yolu, silme/çıkış, yeniden başlatmada
indeks, süreli silme, hata sonrası temizlik, zaman aşımı, değiştirilmiş çerez,
yükle → döndür → indir, temel araçlar, şifre izinleri ve Markdown.

Ek kontroller: PDF → DOCX/PPTX/XLSX, Excel formül metninin literal korunması,
görsel → PDF ve PDF → PNG, raster sayfada İngilizce OCR, form oluşturma/düzleştirme,
metin değiştirme, karartılan metnin çıktı metninden/akışından kaldırılması,
aynı belgenin karşılaştırmasında sıfır fark.

Ek testlerin ilk koşusunda form metnindeki kesintisiz boşluk nedeniyle tek
karşılaştırma başarısızdı. Görsel değer doğruydu; test boşluk normalleştirecek
biçimde düzeltildi ve tüm 22 test geçti. `pip check`: bozuk bağımlılık bulunmadı.

İlk [GitHub CI koşusu](https://github.com/jordenss00-coder/Pdf/actions/runs/36848588991)
Windows/Linux testleri ve Docker derleme/sağlık/font kontrollerini geçti.

Son [GitHub CI koşusu](https://github.com/jordenss00-coder/Pdf/actions/runs/36848912997),
kod sürümü `b697bbc`: **tüm işler başarılı**.

- Windows + Python 3.12: 22 test ve 11 JavaScript modül kontrolü.
- Linux + Python 3.12: 22 test ve 11 JavaScript modül kontrolü.
- Docker imajı derlendi; HTTP sağlık kontrolü geçti.
- LibreOffice ile örnek DOCX, XLSX, PPTX dosyaları PDF'e dönüştürüldü;
  çıkan PDF'lerin sayfa sayısı ve metni doğrulandı.
- Linux fontunda `ğşıİçöü` karakterlerinin varlığı doğrulandı.

`node scripts/check-js.mjs`: **11 modül** sözdizimi kontrolünü geçti.

## Tarayıcı

Ayrı yerel önizleme ve `test-results/ui-data` kullanıldı.

- Ana sayfa: 43 araç, konsolda hata yok.
- PDF'ten dönüştür filtresi diğer kategorileri gizledi.
- İş akışı kaydı göründü.
- Parola korumalı sunucu sürümünde giriş ekranı, başarılı giriş,
  sunucuda işleme/saklama açıklaması ve kapalı araç etiketleri doğrulandı.
- Örnek PDF, numarala → sıkıştır akışında işlendi.
- Sonuç: 1 sayfalık `sample_numarali_sikistirilmis.pdf`, indir bağlantısı ve önizleme;
  numaralanmış ara çıktı yaklaşık 34 KB, sıkıştırılmış çıktı yaklaşık 22 KB.
- Ekran kanıtı: `test-results/workflow-result.png` (yalnızca yerelde, Git dışı).

## Doğrulanmayanlar

- Docker GitHub'da doğrulandı; canlı sunucu/HTTPS kurulmadı.
- Her aracın tüm seçenekleri, mobil kamera, PFX imza ve karmaşık belge kalitesi doğrulanmadı.
- Ücretli AI çağrısı yapılmadı; model sağlayıcı hesabından seçilmeli.
- PDF/A bağımsız doğrulayıcıyla sınanmadı.
- Yük/penetrasyon testi ve kötü niyetli dosya corpus testi yapılmadı.

Sonuçlar iLovePDF ile kalite eşdeğerliği veya herkese açık hizmet için tam
güvenlik onayı değildir.
