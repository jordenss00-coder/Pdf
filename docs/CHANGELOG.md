# Değişiklik günlüğü

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
