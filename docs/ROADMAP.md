# Geliştirme planı

## Öncelik değişikliği — Windows masaüstü

Kullanıcı artık web yayını yerine Windows uygulaması istiyor. Aşağıdaki web
altyapısı korunur; canlı sunucu/alan adı işleri ertelenmiştir.

- [x] Kendi penceresinde açılan başlatıcı, kullanıcı profiline veri ve ayarlar
- [x] EXE içindeki worker işlemleri, tek örnek kilidi ve özel API erişimi
- [x] PyInstaller/Inno Setup ve GitHub paket üretim akışı
- [x] Paketlenmiş EXE'de PDF işlem testi
- [x] Gerçek WebView2 penceresinin açılma testi
- [x] Kurulum, kurulu EXE ve kaldırma testi
- [x] İndirilebilir GitHub ön sürümü ve son test raporu
- [x] Yüklemede doğrudan PDF görünümü ve çoklu dosya önizlemeleri
- [x] Ctrl + tekerlek/klavye ile yakınlaştırma, sürükleyerek gezinme
- [x] Okunabilir araç adları, görünür kısayollar ve yardım penceresi
- [x] Editör etkileşim testi: yazma, geri alma, çıktı üretme ve küçük pencere
- [ ] Kullanıcının bilgisayarında dosya seçme/indirme ve imza/kamera kontrolleri
- [ ] Kod imzalama ve otomatik güncelleme (sonraki sürüm)

## 1 — Kurulabilir ve test edilebilir temel

- [x] Windows/Linux kurulum betikleri, Docker ve GitHub CI tanımları
- [x] Şifre izinleri ve temel araçlarda dosya kilidi düzeltmeleri
- [x] Başlangıçta toplu silme yerine süreli temizlik
- [x] Sunucu girişi, tarayıcı oturumuna göre dosya sahipliği
- [x] Dosya/bellek/işlem sınırları ve silme düğmesi
- [x] API ve işlem regresyon testleri

Kabul: temel PDF döngüsü ve iki oturumun birbirinin dosyalarına erişememesi testten geçmeli.

## 2 — Araç kapsamı ve kullanım

- [x] Kategori filtreleri, sık kullanılan araçlara kısa erişim
- [x] PDF → Markdown
- [x] Yerel/sunucu gizlilik açıklamaları ve yetenek göstergeleri
- [x] Kaydedilebilir çok adımlı iş akışları (5 araç türü)
- [ ] Her araca ait gerçek belge örnekleriyle kalite testleri

Kabul: her kartın çalışan aracı ya da açık bir kullanılabilirlik açıklaması olmalı.

## 3 — Canlı yayın ve daha geniş kullanım

- [ ] Sunucu ve alan adı belirleme, HTTPS kurulumu
- [x] Linux imajını CI'da çalıştırma; gerçek LibreOffice dönüşümü/font testi, Linux OCR örneği
- [ ] Yedekleme politikası (belgeler geçicidir), disk izleme ve yük testi
- [ ] Anonim herkese açık hizmet için kullanıcı başına hız/kota, izole dönüştürücü,
  ağ çıkış politikası, dayanıklı kuyruk ve ayrı depolama
- [ ] Sunucuda HTML/URL dönüşümü için izole tarayıcı
- [ ] İmza daveti/çoklu imzacı akışı, uzaktan mobil tarama aktarımı
- [ ] PDF/A çıktılarının bağımsız doğrulayıcıyla denetlenmesi

## Raporlama kuralı

Her teslimde STATUS, CHANGELOG ve TEST_REPORT güncellenir. Test edilmemiş özellik
“çalışıyor” diye işaretlenmez. Engeller, başarısız denemeler ve gereken dış erişimler yazılır.
