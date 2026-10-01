# Geliştirme planı

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
- [ ] Linux imajını çalıştırma; LibreOffice, OCR, yazı tipleri için entegrasyon testi
- [ ] Yedekleme politikası (belgeler geçicidir), disk izleme ve yük testi
- [ ] Anonim herkese açık hizmet için kullanıcı başına hız/kota, izole dönüştürücü,
  ağ çıkış politikası, dayanıklı kuyruk ve ayrı depolama
- [ ] Sunucuda HTML/URL dönüşümü için izole tarayıcı
- [ ] İmza daveti/çoklu imzacı akışı, uzaktan mobil tarama aktarımı
- [ ] PDF/A çıktılarının bağımsız doğrulayıcıyla denetlenmesi

## Raporlama kuralı

Her teslimde STATUS, CHANGELOG ve TEST_REPORT güncellenir. Test edilmemiş özellik
“çalışıyor” diye işaretlenmez. Engeller, başarısız denemeler ve gereken dış erişimler yazılır.
