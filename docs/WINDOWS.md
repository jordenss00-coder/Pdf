# Windows masaüstü sürümü — 0.3.0

## Kullanım

GitHub Releases'teki `PDF-Atolye-Setup.exe` kurulum dosyası hedefleniyor.
Paket henüz doğrulama aşamasındaysa Actions çıktısı nihai sürüm olarak değerlendirilmez.
Son durum STATUS ve TEST_REPORT'tadır.

- Windows 10/11, x64; Microsoft Edge WebView2 Runtime gerekir.
- Python kullanıcı bilgisayarına ayrıca kurulmaz; paketin içindedir.
- Kullanıcı hesabına kurulur; yönetici yetkisi istemez.
- Başlat menüsü ve isteğe bağlı masaüstü kısayolu oluşturur.
- Kendi penceresinde çalışır; terminal veya tarayıcı sekmesi açılmaz.
- PDF motoru sadece `127.0.0.1` üzerinden uygulama penceresine hizmet eder.
  Rastgele oturum anahtarı olmadan API kullanılamaz.
- Pencere kapanınca arka plan sunucusu ve alt işlemleri durdurulur.
- Temel PDF araçları çevrimdışı çalışır. AI ve web sayfası dönüşümü internet kullanır.

## Dosyalar ve ayarlar

`%LOCALAPPDATA%\PDFAtolye` altında:

- `data`: süreli yüklemeler ve çıktılar
- `config.json`: isteğe bağlı AI anahtarı
- `webview`: pencere profili ve kaydedilen iş akışları
- `desktop.log`: başlatma günlüğü
- `desktop-port.txt`: aynı yerel adresi yeniden kullanmak için bağlantı noktası

“İndir” sonucu seçtiğin konuma kaydeder. Geçici dosyalar arşiv değildir.
Kaldırma kurulum dosyalarını siler; kullanıcı ayarları ve profili korunur.
Başka bir program kayıtlı portu kullanırsa yeni port seçilir; tarayıcı kökenine
bağlı eski iş akışları o oturumda görünmeyebilir.

## Dış bileşenler

- Office → PDF: Microsoft Office veya LibreOffice.
- PDF/A: Ghostscript isteğe bağlı; bağımsız uygunluk doğrulaması ayrıca gerekir.
- AI: API anahtarı ve ANTHROPIC_MODEL ortam değişkeni.
- WebView2 eksikse uygulama hata mesajı verir; Microsoft'un resmi
  [WebView2 Runtime sayfasından](https://developer.microsoft.com/microsoft-edge/webview2/) kurulabilir.
- Bu sürüm kod imzalı değildir. İmzalama sertifikası sağlanmadı; Windows yayıncıyı
  doğrulayamayabilir. SHA256SUMS dosyası indirme bütünlüğü kontrolü içindir.

## Kaynaktan geliştirme

Python 3.12 x64 önerilir. `start-desktop.bat` bağımlılıkları kurar ve `pythonw`
ile pencereyi başlatır. İlk kurulumda terminal görülür; son kullanıcı kurulum
paketinde bu adım yoktur. Tarayıcı sürümü `start.bat` ile hâlâ açılabilir.

## Paketleme

```powershell
python -m pip install -r requirements-desktop.txt
./scripts/build-windows.ps1
```

PyInstaller ve Inno Setup 6 kullanılır. Çıktılar `release/` klasöründedir:
kurulum EXE'si, klasörlü ZIP ve SHA-256 listesi. ZIP içindeki `_internal`
klasörü EXE ile birlikte tutulmalıdır.

GitHub `Build Windows Desktop` iş akışı paketi üretir; paketlenmiş EXE'yi
yükle → döndür/DOCX/Markdown → indir döngüsünden geçirir; sessiz kurulum,
kurulmuş EXE ve kaldırma adımlarını kontrol eder. Bu kontroller gerçek
pencerede dosya seçme/indirme etkileşim testinin yerini tutmaz.

Kaynaklar: [pywebview API](https://pywebview.flowrl.com/api/),
[paketleme](https://pywebview.flowrl.com/guide/freezing),
[PyInstaller çalışma zamanı](https://pyinstaller.org/en/stable/runtime-information.html).
