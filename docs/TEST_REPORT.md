# Test raporu — 1 Ekim 2026

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
Linux testleri ve Docker derleme/sağlık/font kontrollerini geçti. Son CI durumu STATUS'tadır.

`node scripts/check-js.mjs`: **11 modül** sözdizimi kontrolünü geçti.

## Tarayıcı

Ayrı yerel önizleme ve `test-results/ui-data` kullanıldı.

- Ana sayfa: 43 araç, konsolda hata yok.
- PDF'ten dönüştür filtresi diğer kategorileri gizledi.
- İş akışı kaydı göründü.
- Örnek PDF, numarala → sıkıştır akışında işlendi.
- Sonuç: 1 sayfalık `sample_numarali_sikistirilmis.pdf`, indir bağlantısı ve önizleme;
  numaralanmış ara çıktı yaklaşık 34 KB, sıkıştırılmış çıktı yaklaşık 22 KB.
- Ekran kanıtı: `test-results/workflow-result.png` (yalnızca yerelde, Git dışı).

## Doğrulanmayanlar

- Yerel makinede Docker yok; canlı sunucu/HTTPS kurulmadı.
- Uzak CI sonuçları STATUS dosyasında takip edilir.
- Her aracın tüm seçenekleri, mobil kamera, PFX imza ve karmaşık belge kalitesi doğrulanmadı.
- Ücretli AI çağrısı yapılmadı; model sağlayıcı hesabından seçilmeli.
- PDF/A bağımsız doğrulayıcıyla sınanmadı.
- Yük/penetrasyon testi ve kötü niyetli dosya corpus testi yapılmadı.

Sonuçlar iLovePDF ile kalite eşdeğerliği veya herkese açık hizmet için tam
güvenlik onayı değildir.
