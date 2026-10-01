# Proje durumu

Son güncelleme: 1 Ekim 2026. Bu belge her geliştirme tesliminde güncellenir.

## Hedef

PDF Atölye'yi GitHub'dan kurulabilen ve sunucuda kullanılabilen Türkçe bir PDF
uygulamasına dönüştürmek. Araç kapsamı ve seç → işle → indir akışı için
[iLovePDF](https://www.ilovepdf.com/) referans alınır. Ürün adı ve tasarım PDF Atölye'ye aittir.

## Başlangıç tespiti

- Yerel FastAPI/PyMuPDF uygulaması; Git geçmişi ve otomatik test yoktu.
- GitHub deposu boş: https://github.com/jordenss00-coder/Pdf
- Temel PDF işlemleri örnek dosyayla çalıştı.
- Boş izin listesi şifrelemede varsayılan izinleri geri açıyordu.
- Açık PDF belgeleri Windows'ta dosya temizliğini engelliyordu.
- Başlangıçta tüm geçici dosyalar siliniyordu.
- Dosya sahipliği, sunucu girişi ve yükleme sınırları yoktu.
- Linux yazı tipi/dönüştürücü desteği ve dağıtım dosyaları eksikti.

## Bu geliştirme

0.2.0 geliştirmesi yerelde tamamlandı:

- Yerel/sunucu modu, parola girişi, oturuma özel dosyalar ve sınırlar.
- Süreli temizlik, yeniden başlatmada indeks, silme ve işlem zaman aşımı.
- Docker/Compose, Linux başlatıcı, LibreOffice/font desteği ve GitHub CI.
- Markdown aracı, kategori filtreleri ve kaydedilebilir iş akışları.
- Şifre izinleri ve temel araçlarda dosya kilidi hataları düzeltildi.
- 22 otomatik test geçti; tarayıcıda iki adımlı iş akışı sonucu doğrulandı.

GitHub'a ilk kaynak gönderimi tamamlandı (`e3e3023`). İlk CI'da Linux testleri
ve Docker derleme/sağlık/font kontrolleri geçti. Genişletilen 22 test ve gerçek
LibreOffice dönüşüm kontrolü sonraki CI koşusunda doğrulanıyor.

## Takip belgeleri

- `ROADMAP.md`: yapılacak işler ve kabul ölçütleri
- `TOOL_MATRIX.md`: referans araçlar, kapsam ve kısıtlar
- `DEPLOYMENT.md`: kurulum ve yayın
- `TEST_REPORT.md`: çalıştırılan testler ve doğrulanamayanlar
- `CHANGELOG.md`: yapılan değişiklikler

## Yayın durumu

Canlı URL henüz yok. Sunucu/alan adı seçimi bekleniyor. Docker çalıştırma
bu makinede Docker bulunmadığı için GitHub Actions üzerinde doğrulanıyor.

## Kalanlar / yapılamayanlar

- Sunucu hesabı/alan adı verilmediği için canlı yayın yapılmadı.
- Herkese açık anonim hizmet hazır değil; bu sürüm parola korumalı küçük ekip içindir.
- Sunucuda HTML/URL ve AI kapalı; izole tarayıcı ve kullanıcı bazlı API yönetimi gerekir.
- İmza daveti, uzak mobil tarama, bulut depolama entegrasyonu yok.
- PDF/A, OCR, Office ve karmaşık formlarda geniş kalite testleri bekliyor.
- AI anahtarı/modeli ve imza sertifikası sağlanmadığından gerçek sağlayıcı/imza testi yapılmadı.
