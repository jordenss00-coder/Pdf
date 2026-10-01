# PDF Atölye 0.3.0 — Windows ön sürümü

Windows 10/11 x64 için kendi penceresinde çalışan PDF uygulaması.
Alan adı veya sunucu hesabı gerekmez. Python paketin içindedir.

## Kurulum

1. `PDF-Atolye-Setup.exe` dosyasını indir ve çalıştır.
2. Kurulumdan sonra Başlat menüsünden PDF Atölye'yi aç.
3. İstersen kurulumda masaüstü kısayolunu seç.

ZIP alternatifi: tamamını bir klasöre çıkart, `PDF-Atolye.exe` dosyasını aç.
`_internal` klasörünü EXE'nin yanında tut.

## İçerik

- 43 araç kartı, Türkçe arayüz ve kaydedilebilir PDF iş akışları.
- Yerel PDF motoru; temel işlemler çevrimdışı çalışır.
- Kullanıcı profiline veri/ayar kaydı, özel yerel API erişimi.
- Kullanıcı hesabına kurulum, kısayollar ve kaldırıcı.

## Doğrulama

Test edilen kaynak: `439913654b3c0adf46b0caeee5c66e083205af5c`.
27 yerel test; GitHub'da paketlenmiş EXE ile yükle/döndür/DOCX/Markdown/indir/sil,
kurulum/kaldırma ve gerçek WebView2 penceresinin yüklenmesi geçti.
Windows/Linux genel CI ve Docker kontrolleri de başarılı.

## Bilinen sınırlar

- Microsoft Edge WebView2 Runtime gerekir.
- Office → PDF için Microsoft Office veya LibreOffice ayrıca gerekir.
- AI araçları internet, API anahtarı ve model ayarı gerektirir.
- Paket kod imzalı değildir; Windows yayıncı doğrulama uyarısı gösterebilir.
- Dosya seçme/indirme diyalogları, tüm araç seçenekleri ve karmaşık belgeler
  için geniş elle kullanım testi henüz tamamlanmadı.
- Otomatik güncelleme yok; sonraki sürümün kurulum dosyasıyla güncellenir.

[Windows rehberi](https://github.com/jordenss00-coder/Pdf/blob/main/docs/WINDOWS.md)
ve [test raporu](https://github.com/jordenss00-coder/Pdf/blob/main/docs/TEST_REPORT.md).
