# Bağımlılık envanteri

Python paketleri `requirements.txt` içinde sürüm aralıklarıyla tutulur.
Tam sürüm kilidi yoktur; yeni kurulumlar farklı alt sürümler çözebilir.
CI temiz Windows/Linux kurulumlarında bu aralıkları denetler.

- PDF: PyMuPDF, pikepdf
- Sunucu: FastAPI, Uvicorn, python-multipart
- Dönüşüm: pdf2docx, python-pptx, openpyxl
- Görsel: Pillow, OpenCV, NumPy; OCR: PyMuPDF/Tesseract
- İmza: pyHanko; AI: Anthropic SDK; Windows Office: pywin32
- Arayüz: Lucide 0.460.0 (dosya başlığında ISC), Sortable 1.15.6 (MIT)
- OCR: eng.traineddata, tur.traineddata; önceki README'deki kaynak
  [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)
- Container: LibreOffice, Ghostscript, Liberation/DejaVu yazı tipleri

Yeni bir proje lisansı seçilmedi. Üçüncü taraf paketlerin kendi lisansları
geçerlidir. OCR verisinin kaynak sürümü/sağlama toplamı ve tüm dağıtım
bildirimlerinin envanteri henüz tamamlanmadı.
