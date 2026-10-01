# Değişiklik günlüğü

## 0.4.0 — güncelleme, yükseltmeli kurulum, karanlık tema, 1 Ekim 2026

- Uygulama içi güncelleme: GitHub sürümleri açılışta en çok 6 saatte bir denetlenir;
  otomatik denetim ayarlardan kapatılabilir.
- Kurulum dosyası arka planda indirilir; boyutu ve `SHA256SUMS.txt` özeti doğrulanmadan
  kurulmaz. Kurulumdan hemen önce özet yeniden denetlenir.
- Güncelleme şeridi, indirme ilerlemesi, “Neler yeni?” penceresi ve kurulum onayı.
- Kurulum, açık uygulamanın kapanmasını bekler; önceki sürümü sessizce kaldırıp yenisini kurar.
  Kullanıcı verisi korunur. Uygulama içinden başlatılan kurulum bitince uygulama yeniden açılır.
- Kurulumun sürüm numarası `app/version.py` dosyasından alınır.
- Karanlık/açık tema düğmesi; varsayılan sistem teması, açılışta yanlış tema görünmez.
- Koyu modda düzenleyici arka planı, araç menüsü ve hata/tamam renkleri düzeltildi.
- Araç kartları, düğmeler, kategori filtreleri, kaydırma çubukları ve pencerelerde görsel iyileştirmeler.
- Ayarlar penceresi bölümlere ayrıldı: Görünüm, Güncellemeler, Bu bilgisayarda bulunanlar, Yapay zekâ.
- Windows CI: v0.3.1 üzerine yükseltme ve yerel sürüm kaynağından uçtan uca güncelleme testleri.

## 0.3.1 — kullanım kolaylığı, 1 Ekim 2026

- Tek PDF yüklemesinden doğrudan düzenleyiciye geçiş; çoklu yüklemede önizlemeler.
- Ctrl + tekerlek ve klavye ile yakınlaştırma; Ctrl/Boşluk/orta tuş ile gezinme.
- Adları ve tuşları görünür araç paneli, gezinme aracı ve kısayol yardım penceresi.
- PDF için ayrı kaydırma alanı; sağ panelle üst üste binme düzeltildi.
- Ctrl + S ile sonuç oluşturma; açık belgeyi başka araca aktarma menüsü.
- Düzenlenebilir metnin imleç/stil seçicisi plaintext-only durumuna düzeltildi.
- Gerçek Edge etkileşim regresyon betiği: `scripts/check-editor.cjs`.

## 0.3.0 — Windows masaüstü ön sürümü, 1 Ekim 2026

- pywebview/WebView2 ile kendi penceresinde çalışan masaüstü başlatıcısı.
- Gizli arka plan motoru; kapanışta alt süreçlerin durdurulması.
- Masaüstü API'sine oturum anahtarıyla erişim; sabit olmayan özel token.
- Ayar/veri/profil dosyaları kullanıcı hesabında; kurulum klasörüne yazılmaz.
- Paketli EXE'de PDF worker işlemleri için ayrı giriş noktası.
- PyInstaller klasör paketi, Inno Setup kullanıcı kurulumu/kısayol/kaldırma.
- GitHub'da EXE, kurulum, paketli işlem ve kaldırma testleri.
- Gerçek WebView2 penceresi hem GitHub'da hem yerel bilgisayarda doğrulandı.
- Tek örnek kilidinde Windows PermissionError düzeltildi; 27 yerel test geçti.
- GitHub Releases için kurulum EXE'si, ZIP ve SHA-256 bütünlük dosyası.

## 0.2.0 — 1 Ekim 2026

- Yerel ve parola korumalı sunucu modu, imzalı HttpOnly/SameSite oturum çerezi.
- Oturuma özel belge erişimi; sunucu adı/Origin denetimi ve giriş denemesi sınırı.
- Dosya boyutu/sayısı, sayfa, oturum kotası ve eşzamanlı iş sınırları.
- Kısa ömürlü alt süreç, işlem süresi sınırı ve hata sonrası temizlik.
- Başlangıçtaki toplu silme kaldırıldı; süreli temizlik ve disk indeksi eklendi.
- Dosyaları silme/çıkış, no-store belge yanıtları, sınırlı önizleme önbelleği.
- Docker/Compose, Linux başlatıcı, HTTPS vekil örneği ve Windows/Linux CI.
- Linux LibreOffice keşfi/profil ayrımı ve Liberation yazı tipleri.
- PDF → Markdown; 5 araçtan oluşturulan kaydedilebilir 8 adımlı iş akışları.
- Kategori filtreleri, sık kullanılan araçlar ve GitHub rapor bağlantısı.
- Yerel/sunucu gizlilik açıklamaları ve çıktı son kullanma zamanı.
- Şifrelemede boş izin listesi hatası ve temel araçlardaki açık belge tutamaçları düzeltildi.
- Sertifika yolu istemciden kabul edilmiyor; oturumun yüklediği dosya gerekiyor.
- Doğrulanmamış sabit AI modeli/beta parametreleri kaldırıldı; model ortamdan seçiliyor.
- PDF/A ve sıkıştırma açıklamaları gerçek kısıtları yansıtacak biçimde düzeltildi.
- PDF'ten Excel'e aktarımda `=` ile başlayan metinlerin formül olarak çalışması engellendi.
- OCR, Office dışa aktarımı, görsel dönüşümü, form ve karartma içerik testleri eklendi.

Doğrulama ve yayın durumları TEST_REPORT ve STATUS belgelerindedir.

Son doğrulama: Windows/Linux'ta 22 test, 11 JavaScript modülü, Docker ve gerçek
LibreOffice dönüşümleri başarılı. Canlı yayın sunucu/alan adı bekliyor.
