FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PDF_DATA_DIR=/app/data
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    fonts-liberation2 fonts-dejavu-core tesseract-ocr tesseract-ocr-tur \
    tesseract-ocr-eng ghostscript libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
COPY static static
COPY tessdata tessdata
RUN useradd --create-home --uid 10001 pdf && mkdir -p /app/data && chown pdf:pdf /app/data
USER pdf
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1", "--no-access-log"]
