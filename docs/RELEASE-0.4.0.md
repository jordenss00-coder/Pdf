# PDF Atölye 0.4.0 — güncelleme, yükseltmeli kurulum, karanlık tema

- Uygulama yeni sürümleri kendisi denetler. Yeni sürüm varsa üst şeritte bildirilir.
- “Neler yeni?” ile sürüm notları okunur; “İndir ve kur” kurulum dosyasını arka planda indirir.
- İndirilen dosyanın boyutu ve SHA-256 özeti doğrulanır; eşleşmeyen dosya kullanılmaz.
- “Şimdi kur” onaydan sonra uygulamayı kapatır, yeni sürümü kurar ve uygulamayı yeniden açar.
- Otomatik denetim Ayarlar > Güncellemeler bölümünden kapatılabilir.
- Kurulum dosyası eski sürümü bulur, önce kaldırır, sonra yenisini kurar.
  Ayarlar, iş akışları ve dosyalar korunur.
- Tema düğmesiyle açık/koyu tema seçilir; seçim yapılmazsa sistem teması kullanılır.
- Koyu modda okunmayan alanlar düzeltildi; araç kartları, düğmeler ve pencereler yenilendi.
- Ayarlar penceresi bölümlere ayrıldı.

## 0.3.x'ten geçiş

0.3.x sürümlerinde güncelleme düğmesi yoktur. PDF Atölye'yi kapat ve yeni
`PDF-Atolye-Setup.exe` dosyasını çalıştır: kurulum eski sürümü kendisi kaldırır.
Sonraki sürümler uygulama içinden kurulabilir.

Paket Windows 10/11 x64 içindir; WebView2 gerekir. Kod imzası yoktur;
Windows yayıncıyı doğrulayamayabilir. Office → PDF için Office veya LibreOffice gerekir.

## Doğrulama

37 Python testi ve 13 JavaScript modülünün sözdizimi kontrolü geçti.
GitHub Windows derlemesinde paketli EXE, kurulum/kaldırma, v0.3.1 üzerine yükseltme,
yerel sürüm kaynağından indirme → SHA-256 → kurulum ve gerçek WebView2 penceresi sınandı.
Ayrıntılar [test raporunda](https://github.com/jordenss00-coder/Pdf/blob/main/docs/TEST_REPORT.md).
