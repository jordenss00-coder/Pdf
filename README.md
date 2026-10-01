# PDF Atölye

**Windows masaüstü ön sürümü hazır:** kendi penceresi, masaüstü kısayolu, uygulama içi güncelleme,
Python gerektirmeyen EXE ve kurulum paketi.
[Kurulum dosyasını indir](https://github.com/jordenss00-coder/Pdf/releases/download/v0.4.0/PDF-Atolye-Setup.exe)
· [Windows rehberi](docs/WINDOWS.md) · [Sürüm notları](docs/RELEASE-0.4.0.md).

Türkçe PDF araçları: birleştirme, bölme, sıkıştırma, düzenleme, imza, dönüşüm,
OCR, formlar, karartma ve karşılaştırma. **43 araç kartı** ve kaydedilebilir iş akışları.
FastAPI + PyMuPDF; arayüz için derleme gerekmez.

Araç kapsamı ve kullanım akışı için [iLovePDF](https://www.ilovepdf.com/) referans
alınmıştır. Bağımsız bir projedir; tüm alt özelliklerde ve çıktı kalitesinde
eşdeğerlik iddiası yoktur. [Araç karşılaştırması](docs/TOOL_MATRIX.md).

## Kaynaktan tarayıcı sürümünü çalıştırma

Python 3.12+ ve Git gerekir. İlk kurulum internetten paket indirir.

```sh
git clone https://github.com/jordenss00-coder/Pdf.git
cd Pdf
```

**Windows:** `start.bat` dosyasına çift tıkla.

**Linux:** `sh start.sh` çalıştır.

Tarayıcıda `http://127.0.0.1:8765` açılır. Port doluysa sonraki boş port seçilir.
Kapatmak için Ctrl+C. Güncellemek için `git pull`, ardından yeniden başlat.

Elle kurulum:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux: . .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

Yerel sürüm yalnızca localhost üzerinden çalışır. İsteğe bağlı AI araçları
belgeyi Anthropic'e gönderir; web adresi dönüşümü internete bağlanır.
AI için API anahtarı ve `ANTHROPIC_MODEL` ortam değişkeni gerekir.

## Sunucuda çalıştırma

Docker Compose yapılandırması **parola korumalı küçük ekip kullanımı** içindir.
Anonim, herkese açık büyük servis için ilave izolasyon ve kapasite çalışması gerekir.

```sh
cp .env.example .env
# .env içindeki alan adı, giriş parolası ve oturum anahtarını doldur.
docker compose up -d --build
```

Port varsayılan olarak sunucunun localhost adresine bağlanır. HTTPS ters vekili gerekir.
[Tam kurulum ve sınırlar](docs/DEPLOYMENT.md).
GitHub Pages tek başına Python/PDF sunucusunu çalıştıramaz.

## Veriler

- Varsayılan saklama süresi 2 saat; temizlik dakikada bir denenir.
- Yeniden başlatma tüm belgeleri silmez; süre dolmamış dosyalar yeniden indekslenir.
- Sunucuda her tarayıcı oturumu yalnızca kendi belgelerine erişir.
- “Dosyalarımı sil” yüklemeleri ve sonuçları temizler. Kalıcı kopya için “İndir” kullan.
- Şifreli PDF parolaları yeniden başlatmada saklanmaz; yeniden girilir.
- `data/`, `.env`, `.venv/` ve API anahtarı içerebilen `config.json` Git'e alınmaz.
- İş akışları tarayıcının localStorage alanına kaydedilir; belge içeriği kaydedilmez.

## Araçlar

| Grup | İçerik |
|---|---|
| Sayfalar | Birleştir, böl, sil, çıkar, sırala, döndür, çoklu sayfa, boyutlandır |
| Düzenleme | Metin, görsel, şekil, çizim, not, bağlantı, filigran, numara, kırpma |
| Metin/form | Mevcut metni düzelt, bul-değiştir, form doldur/oluştur, belge bilgileri |
| Dönüşüm | Word, Excel, PowerPoint, JPG/PNG, HTML, TXT, PDF/A, Markdown |
| İyileştirme | Sıkıştır, OCR (Türkçe/İngilizce), onar, gri tonlama, düzleştir |
| Güvenlik | AES-256 parola, şifre kaldırma, karartma, karşılaştırma, PFX/P12 imza |
| AI | Yerelde yapılandırılan Anthropic API ile özet ve çeviri |
| İş akışı | Numarala, sıkıştır, döndür, gri tonlama ve düzleştirmeden en fazla 8 adım |

Sunucuda HTML/URL ve AI kapalıdır. Office → PDF için Microsoft Office veya
LibreOffice gerekir. Docker imajı LibreOffice, Ghostscript ve Türkçe yazı tiplerini içerir.
PDF/A çıktısı bağımsız doğrulayıcıyla kontrol edilmelidir. Kamera HTTPS/localhost gerektirir.

## Test

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
node scripts/check-js.mjs
```

Testler ayrı geçici dosyalar kullanır. GitHub Actions Windows/Linux testlerini ve
Docker derlemesini tanımlar. [Test raporu](docs/TEST_REPORT.md).

## Süreç ve raporlar

- [Güncel durum](docs/STATUS.md)
- [Yapılan değişiklikler](docs/CHANGELOG.md)
- [Yapılacaklar ve engeller](docs/ROADMAP.md)
- [iLovePDF araç matrisi](docs/TOOL_MATRIX.md)
- [Dağıtım rehberi](docs/DEPLOYMENT.md)
- [Test raporu](docs/TEST_REPORT.md)
- [Bağımlılık envanteri](docs/DEPENDENCIES.md)

Belgeler her geliştirme tesliminde güncellenir. Tamamlandı, test edilmedi ve
engellendi durumları ayrı tutulur.

## Klasörler

```text
app/          Python sunucusu ve PDF araçları
static/       HTML, CSS, JavaScript, yerel kütüphaneler
tessdata/     Türkçe ve İngilizce OCR dil dosyaları
tests/        API, oturum ve PDF regresyon testleri
docs/         Durum, kapsam, değişiklik ve test raporları
deploy/       HTTPS ters vekil örneği
data/         Süreli yüklemeler, sonuçlar ve iş klasörleri (Git dışı)
```
