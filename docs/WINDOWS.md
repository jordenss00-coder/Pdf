# Windows masaüstü sürümü

## Kullanım

[PDF-Atolye-Setup.exe dosyasını indir](https://github.com/jordenss00-coder/Pdf/releases/download/v0.3.1/PDF-Atolye-Setup.exe),
çalıştır ve kurulumdan sonra Başlat menüsünden PDF Atölye'yi aç.
Bu bir ön sürümdür; son durum STATUS ve TEST_REPORT'tadır.

- Windows 10/11, x64; Microsoft Edge WebView2 Runtime gerekir.
- Python kullanıcı bilgisayarına ayrıca kurulmaz; paketin içindedir.
- Kullanıcı hesabına kurulur; yönetici yetkisi istemez.
- Başlat menüsü ve isteğe bağlı masaüstü kısayolu oluşturur.
- Kendi penceresinde çalışır; terminal veya tarayıcı sekmesi açılmaz.
- PDF motoru sadece `127.0.0.1` üzerinden uygulama penceresine hizmet eder.
  Rastgele oturum anahtarı olmadan API kullanılamaz.
- Pencere kapanınca arka plan sunucusu ve alt işlemleri durdurulur.
- Temel PDF araçları çevrimdışı çalışır. AI ve web sayfası dönüşümü internet kullanır.

## Güncelleme ve tema (0.4.0)

Uygulama açılışta, en çok 6 saatte bir, GitHub'daki yeni sürümleri denetler.
Yeni sürüm varsa üst şeritte “Neler yeni?” ve “İndir ve kur” görünür. İndirilen
kurulumun boyutu ve SHA-256 özeti `SHA256SUMS.txt` ile doğrulanır; ardından
“Şimdi kur” uygulamayı kapatır, yeni sürümü kurar ve yeniden açar.
Otomatik denetim Ayarlar > Güncellemeler bölümünden kapatılabilir; aynı yerden
elle de denetlenebilir.

Kurulum dosyası elle çalıştırıldığında da kurulu sürümü bulur, önce kaldırır, sonra
yenisini kurar. Uygulama açıksa kapatılması istenir. 0.3.x sürümlerinde güncelleme
düğmesi olmadığından 0.4.0 bir kez elle kurulur.

Üst çubuktaki tema düğmesi açık/koyu tema arasında geçer. Seçim yapılmazsa
Windows teması kullanılır; seçim pencere profilinde saklanır.

## Dosyalar ve ayarlar

### Düzenleyiciyi kullanma (0.3.1)

Ana ekrana tek, kilitsiz PDF bırak veya dosya seç: belge doğrudan açılır.
Sol panelde araç adı ve tuşu görünür. Açık belgeyi başka araçta kullanmak için
dosya adının yanındaki menüyü kullan. Düzenlemeleri önce kaydet; sonuç ekranındaki
araçlarla devam edersen değişmiş belge aktarılır.

| Kontrol | İşlev |
|---|---|
| Ctrl + tekerlek, Ctrl + artı/eksi | PDF'yi yakınlaştır/uzaklaştır |
| Ctrl + 0 | Genişliğe sığdır |
| Ctrl + sürükle, Boşluk + sürükle, orta tuş | Sayfada gezin |
| G | Gezinme aracını seç; sol tuşla sürükle |
| Ctrl + Z / Ctrl + Y | Geri al / yinele |
| Ctrl + S | Değişiklikleri işle, sonuç ekranını aç |
| Kısayollar düğmesi | Diğer tuşları ve açıklamalarını göster |

### Saklama konumu

`%LOCALAPPDATA%\PDFAtolye` altında:

- `data`: süreli yüklemeler ve çıktılar
- `config.json`: isteğe bağlı AI anahtarı ve güncelleme ayarları
- `updates`: indirilen ve doğrulanan kurulum dosyası
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
kurulmuş EXE ve kaldırma adımlarını kontrol eder. Yayımlanmış v0.3.1 üzerine
yükseltmeyi ve yerel bir sürüm kaynağından indirme → SHA-256 → kurulum
güncellemesini de uçtan uca sınar. Gerçek WebView2 penceresinde
ana sayfanın yüklenmesi de otomatik sınanır. Bu kontroller gerçek
pencerede dosya seçme/indirme etkileşim testinin yerini tutmaz.

Kaynaklar: [pywebview API](https://pywebview.flowrl.com/api/),
[paketleme](https://pywebview.flowrl.com/guide/freezing),
[PyInstaller çalışma zamanı](https://pyinstaller.org/en/stable/runtime-information.html).
