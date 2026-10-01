# Kurulum ve sunucu işletimi

## Yerel sürüm

README'deki Windows/Linux adımlarını kullan. Başlatıcı `127.0.0.1` adresine
bağlanır. Aynı veri klasörüne iki sunucu süreci başlatma.
Debian/Ubuntu'da `python3-venv`, `libreoffice`, `fonts-liberation2`, `ghostscript`
paketleri Office dönüşümü ve Türkçe yazı tipleri için kullanılabilir.

## Docker ile parola korumalı sunucu

1. Depoyu klonla; Docker Engine ve Compose kurulu olmalı.
2. `.env.example` dosyasını `.env` olarak kopyala.
3. `PDF_DOMAIN`: yalnızca alan adını yaz (ör. `pdf.sirketiniz.com`).
4. `PDF_ACCESS_PASSWORD`: en az 12 karakterlik giriş parolası.
5. `PDF_SESSION_SECRET`: en az 32 karakter, tercihen rastgele 64 karakter.
   `python -c "import secrets; print(secrets.token_hex(32))"` ile üretilebilir.
6. `docker compose up -d --build` çalıştır.
7. DNS'i sunucuya yönlendir; Caddy/Nginx üzerinden HTTPS sun.
   `deploy/Caddyfile.example` aynı makinede çalışan Caddy içindir.
8. `https://alan-adiniz/api/health` ve giriş/yükleme/indirme döngüsünü doğrula.

HTTPS çerezi varsayılan açık. Yalnızca localhost HTTP denemesinde
`PDF_SECURE_COOKIE=false` kullan; internete yayınlarken `true` bırak.
`.env` Docker Compose tarafından okunur; `python run.py` için değerleri kabuk
ortam değişkeni olarak ayarla.

## İşletim

```sh
docker compose ps
docker compose logs --tail 100 pdf
git pull
docker compose up -d --build
```

Tek Uvicorn worker kullanılır: aktif işlem koordinasyonu bellektedir.
Çok worker/replika desteklenmez. İşler ayrı kısa ömürlü süreçlerde yürütülür;
varsayılan eşzamanlılık 2, süre sınırı 180 saniyedir. Linux'ta süre sonunda
alt süreç grubu da sonlandırılır. Compose 2 GB bellek, 2 CPU, 256 süreç sınırı tanımlar.

Kalıcı volume uzun vadeli arşiv değildir. Disk kapasitesini izle. API erişim
günlüğü Docker komutunda kapalıdır. Oturum anahtarını değiştirmek mevcut
sunucu oturumlarını geçersiz kılar. Giriş parolasını değiştirirken oturum
anahtarını da değiştir.

| Değişken | Varsayılan | Anlam |
|---|---|---|
| PDF_MODE | local | `local` veya `hosted` |
| PDF_ALLOWED_HOSTS | localhost adresleri | Virgülle ayrılan tam sunucu adları |
| PDF_DATA_DIR | proje/data | Geçici dosya konumu |
| PDF_MAX_UPLOAD_MB | 50 | Tek istekteki dosyaların toplamı |
| PDF_MAX_FILES | 20 | Yükleme isteğindeki dosya sayısı |
| PDF_MAX_PAGES | 500 | PDF başına sayfa sınırı |
| PDF_SESSION_MB | 200 | Oturum yüklemeleri ve sonuçları toplamı |
| PDF_RETENTION_HOURS | 2 | Saklama süresi; temizlik dakikada bir |
| PDF_MAX_JOBS | 2 | Eşzamanlı işlem |
| PDF_JOB_TIMEOUT | 180 | İşlem süresi, saniye |
| PDF_SECURE_COOKIE | true | HTTPS çerezi |
| ANTHROPIC_MODEL | boş | Yerel AI model adı; sağlayıcı hesabından doğrulanmalı |

## Sınırlar

- Ortak parola küçük, güvenilen ekip içindir; hesap/rol yönetimi yoktur.
- HTTPS ve sunucu yönetimi barındırma ortamında tamamlanmalıdır.
- Sunucuda HTML/URL dönüşümü kapalı: özel ağ/dosya erişimini engelleyen
  izole tarayıcı henüz yoktur. Birleştirme üzerinden gelen HTML de engellenir.
- Sunucuda AI kapalı; API anahtarı kullanıcı arayüzünden değiştirilemez.
- LibreOffice uygulama container'ı içindedir; belge başına ayrı ağ/bellek
  sandbox'ı yoktur. Anonim herkese açık servis olarak yayınlama.
- Kuyruk kalıcı değildir. Yeniden başlatmada devam eden iş kaybolabilir;
  kullanıcı tekrar deneyebilir. Eski iş klasörleri sonradan temizlenir.
- Önizleme/metin çıkarma ana sunucu sürecinde yapılır. Tam işlem izolasyonu,
  global disk kotası ve yük testi geniş erişimden önce tamamlanmalıdır.
- macOS doğrulanmadı. Bu yerel makinede Docker yok; CI sonuçları ayrıca takip edilir.

Kaynak: [Docker Compose ortam değişkenleri](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
