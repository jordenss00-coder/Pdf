# PDF Atölye 0.3.1 — kullanım kolaylığı

- Ana ekrana tek, kilitsiz PDF bırakıldığında belge doğrudan düzenleyicide açılır.
- Birden fazla dosyada küçük önizlemeler gösterilir.
- Ctrl + fare tekerleği ile işaretçinin bulunduğu yere yakınlaştırma.
- Ctrl + sürükleme, Boşluk + sürükleme ve orta fare tuşuyla sayfada gezinme.
- G tuşuyla seçilen, fareyle sürüklemeye uygun gezinme aracı.
- Ctrl + artı/eksi ile yakınlaştırma, Ctrl + 0 ile genişliğe sığdırma.
- Sol araç panelinde sürekli görünen Türkçe adlar ve kısayol tuşları.
- Kısayollar yardım penceresi ve görünür kullanım ipuçları.
- Belge ayrı alanda kayar; büyütülen sayfa ayar panelinin altına taşmaz.
- Ctrl + S değişiklikleri işler ve indirilebilir sonucu açar.
- Açık PDF'yi başka araca aktarma menüsü; kaydedilmemiş değişikliklerde uyarı.

## Güncelleme

PDF Atölye'yi kapat, yeni `PDF-Atolye-Setup.exe` dosyasını çalıştır.
Önceki kurulumun üzerine kurulabilir. Kullanıcı profili ve ayarlar korunur.
Paket Windows 10/11 x64 içindir; WebView2 gerekir. Kod imzası ve otomatik
güncelleme henüz yoktur. Office → PDF için Office veya LibreOffice gerekir.

## Doğrulama

27 Python testi ve 11 JavaScript modülünün sözdizimi kontrolü geçti.
Edge üzerinde yapay iki sayfalı PDF ile bırakma, önizleme, yakınlaştırma odağı,
Ctrl ile sürükleme, yanlışlıkla çizim oluşmaması, sığdırma, kısayol yardımı,
metin yazma, geri al/yinele, 800 piksel pencere ve Ctrl + S sınandı.
Güncel paket testleri [test raporunda](https://github.com/jordenss00-coder/Pdf/blob/main/docs/TEST_REPORT.md).
