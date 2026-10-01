# iLovePDF araç karşılaştırması

Referans: [iLovePDF](https://www.ilovepdf.com/), incelendi: 1 Ekim 2026.
“Mevcut” kod ve arayüz bulunduğunu belirtir; kalite eşdeğerliği anlamına gelmez.

| Referans araç | PDF Atölye / durum |
|---|---|
| Merge PDF | Birleştir; temel çıktı test edildi |
| Split PDF | Böl; tek sayfalara bölme test edildi; aralık/boyut/yer imi mevcut |
| Remove pages | Sayfa Sil; test edildi |
| Extract pages | Sayfa Çıkar; test edildi |
| Organize PDF | Sıralama/döndürme/kopyalama/boş sayfa mevcut |
| Compress PDF | Test edildi; kayıplı sıkıştırma kaliteyi etkileyebilir |
| PDF to Word | pdf2docx örneği test edildi; karmaşık yerleşim testi bekliyor |
| PDF to PowerPoint | Görsel slayt örneği test edildi; özgün yapıyı garanti etmez |
| PDF to Excel | Metin aktarımı test edildi; formül çalıştırma engellendi |
| Word to PDF | LibreOffice gerçek dönüşümü CI'da geçti |
| PowerPoint to PDF | LibreOffice gerçek dönüşümü CI'da geçti |
| Excel to PDF | LibreOffice gerçek dönüşümü CI'da geçti |
| Edit PDF | Metin/görsel/şekil/not/bağlantı ve mevcut metin düzeltme |
| PDF to JPG | JPG/PNG sayfa görüntüsü ve gömülü görsel çıkarma |
| JPG to PDF | Görsel sıralama/yön/kenar boşluğu |
| Sign PDF | Çiz/yaz/yükle ve PFX/P12; başkasına imza daveti yok |
| Watermark | Yazı/görsel, saydamlık/konum/açı |
| Rotate PDF | API çıktısı ve açı test edildi |
| HTML to PDF | Yerelde mevcut; sunucuda izole tarayıcı bekliyor |
| Unlock PDF | Bilinen parola ile test edildi |
| Protect PDF | AES-256; boş izin listesi düzeltildi/test edildi |
| PDF to PDF/A | En iyi çaba; bağımsız uygunluk doğrulaması gerekir |
| Repair PDF | PyMuPDF/pikepdf ile kurtarma; tüm hasarlar onarılamaz |
| Page numbers | Temel araç ve tarayıcı iş akışı test edildi |
| Scan to PDF | Aynı cihazın kamerası/fotoğrafı; uzak telefon eşleştirmesi yok |
| OCR PDF | Raster sayfada İngilizce tanıma geçti; Türkçe kalite corpus testi bekliyor |
| Compare PDF | Aynı belgede sıfır fark testi geçti; taranmış belge testi genişletilmeli |
| Redact PDF | Örnek metnin çıkarılan metin/akışlardan kaldırılması geçti; corpus genişletilmeli |
| Crop PDF | Seçim ve otomatik kenar |
| PDF Forms | Alan oluşturma/değer/düzleştirme geçti; karmaşık form testi bekliyor |
| AI Summarizer | Yerelde API/model gerekir; gerçek çağrı yapılmadı; sunucuda kapalı |
| Translate PDF | Yerelde API/model gerekir; yerleşim kusursuzluğu garanti edilmez |
| PDF to Markdown | Yeni: başlık/metin/tablo/bağlantı; heuristik çıkarım |
| Workflows | Yeni: 5 araç türü, en fazla 8 adım; kaydet/yükle/sırala |

Ek araçlar: mevcut metni düzeltme, bul/değiştir, üst-alt bilgi, meta veri,
çoklu sayfa baskı düzeni, boyutlandırma, gri tonlama, düzleştirme, TXT/HTML çıkarma.

Tam eşdeğerlik için kalanlar: çoklu imzacı/davet, uzak tarama aktarımı,
bulut depolama bağlantıları, tüm araçlarla gelişmiş iş akışı, bağımsız PDF/A
doğrulaması ve gerçek belgelerle dönüşüm/karartma/OCR kalite testleri.
