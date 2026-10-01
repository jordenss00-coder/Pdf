"""Harici dönüştürücüler: Microsoft Office (COM), Edge/Chrome (headless), Ghostscript."""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from .util import UserError
from .settings import settings

_office_lock = threading.Lock()

# Chrome önce: Edge başlatıcısı PDF'i süreç kapandıktan sonra yazabiliyor
EDGE_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def _office_app_exists(exe: str) -> bool:
    for base in (r"C:\Program Files\Microsoft Office", r"C:\Program Files (x86)\Microsoft Office"):
        if glob.glob(os.path.join(base, "**", exe), recursive=True):
            return True
    return False


def _soffice() -> str | None:
    for p in (r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
        if os.path.exists(p):
            return p
    return shutil.which("soffice")


def browser() -> str | None:
    for p in EDGE_PATHS:
        if os.path.exists(p):
            return p
    return next((p for name in ("chromium", "chromium-browser", "google-chrome") if (p := shutil.which(name))), None)


def ghostscript() -> str | None:
    for name in ("gswin64c", "gswin32c", "gs"):
        p = shutil.which(name)
        if p:
            return p
    hits = sorted(glob.glob(r"C:\Program Files\gs\gs*\bin\gswin64c.exe"))
    return hits[-1] if hits else None


_caps_cache: dict | None = None


def capabilities() -> dict:
    global _caps_cache
    if _caps_cache is None:
        _caps_cache = {
            "word": _office_app_exists("WINWORD.EXE"),
            "excel": _office_app_exists("EXCEL.EXE"),
            "powerpoint": _office_app_exists("POWERPNT.EXE"),
            "libreoffice": _soffice() is not None,
            "browser": browser() is not None,
            "ghostscript": ghostscript() is not None,
        }
    return dict(_caps_cache)


# ---------------- Microsoft Office (COM) ----------------

class _Com:
    def __enter__(self):
        import pythoncom
        pythoncom.CoInitialize()
        return self

    def __exit__(self, *a):
        import pythoncom
        pythoncom.CoUninitialize()


def _dispatch(prog: str):
    import win32com.client
    return win32com.client.DispatchEx(prog)


def word_to_pdf(src: Path, dst: Path) -> Path:
    with _office_lock, _Com():
        app = _dispatch("Word.Application")
        try:
            app.Visible = False
            app.DisplayAlerts = 0
            doc = app.Documents.Open(str(src), ConfirmConversions=False, ReadOnly=True,
                                     AddToRecentFiles=False, Visible=False)
            try:
                doc.ExportAsFixedFormat(str(dst), 17)  # wdExportFormatPDF
            finally:
                doc.Close(False)
        finally:
            app.Quit()
    return dst


def pdf_to_word_msword(src: Path, dst: Path) -> Path:
    """Word'ün PDF yeniden akış (reflow) özelliğiyle PDF -> DOCX."""
    with _office_lock, _Com():
        app = _dispatch("Word.Application")
        try:
            app.Visible = False
            app.DisplayAlerts = 0
            doc = app.Documents.Open(str(src), ConfirmConversions=False, ReadOnly=True,
                                     AddToRecentFiles=False, Visible=False)
            try:
                doc.SaveAs2(str(dst), 16)  # wdFormatDocumentDefault
            finally:
                doc.Close(False)
        finally:
            app.Quit()
    return dst


def excel_to_pdf(src: Path, dst: Path) -> Path:
    with _office_lock, _Com():
        app = _dispatch("Excel.Application")
        try:
            app.Visible = False
            app.DisplayAlerts = False
            wb = app.Workbooks.Open(str(src), ReadOnly=True, AddToMru=False)
            try:
                wb.ExportAsFixedFormat(0, str(dst))  # xlTypePDF
            finally:
                wb.Close(False)
        finally:
            app.Quit()
    return dst


def powerpoint_to_pdf(src: Path, dst: Path) -> Path:
    with _office_lock, _Com():
        app = _dispatch("PowerPoint.Application")
        try:
            pres = app.Presentations.Open(str(src), ReadOnly=True, Untitled=False, WithWindow=False)
            try:
                pres.SaveAs(str(dst), 32)  # ppSaveAsPDF
            finally:
                pres.Close()
        finally:
            app.Quit()
    return dst


def libreoffice_to_pdf(src: Path, dst: Path) -> Path:
    exe = _soffice()
    if not exe:
        raise UserError("LibreOffice bulunamadı.")
    outdir = Path(tempfile.mkdtemp(dir=dst.parent))
    profile = Path(tempfile.mkdtemp(dir=dst.parent))
    try:
        subprocess.run([exe, f"-env:UserInstallation={profile.as_uri()}", "--headless", "--convert-to", "pdf", "--outdir", str(outdir), str(src)],
                       check=True, timeout=120, capture_output=True)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    produced = outdir / (src.stem + ".pdf")
    if not produced.exists():
        raise UserError("LibreOffice dönüştürmesi başarısız oldu.")
    shutil.move(produced, dst)
    shutil.rmtree(outdir, ignore_errors=True)
    return dst


def office_to_pdf(src: Path, kind: str, dst: Path) -> Path:
    caps = capabilities()
    funcs = {"word": word_to_pdf, "excel": excel_to_pdf, "powerpoint": powerpoint_to_pdf}
    if kind == "excel" and src.suffix.lower() == ".csv" and caps["excel"]:
        return excel_to_pdf(src, dst)
    if caps.get(kind):
        try:
            return funcs[kind](src, dst)
        except Exception as e:  # Office hata verirse LibreOffice'i dene
            if not caps["libreoffice"]:
                raise UserError(f"Microsoft Office dönüştürmesi başarısız oldu: {e}") from e
    if caps["libreoffice"]:
        return libreoffice_to_pdf(src, dst)
    names = {"word": "Microsoft Word", "excel": "Microsoft Excel", "powerpoint": "Microsoft PowerPoint"}
    raise UserError(f"Bu dönüşüm için {names.get(kind, 'Office')} veya LibreOffice kurulu olmalı.")


# ---------------- HTML -> PDF (Edge / Chrome headless) ----------------

def html_to_pdf(target: str, dst: Path, header_footer: bool = False, timeout: int = 90) -> Path:
    if settings.hosted:
        raise UserError("HTML/URL dönüşümü sunucuda izole tarayıcı gerektirir. Bu aracı yerel sürümde kullan.")
    exe = browser()
    if not exe:
        raise UserError("HTML dönüştürmek için Microsoft Edge veya Google Chrome gerekli.")
    profile = tempfile.mkdtemp(prefix="edgeprof_")
    args = [exe, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            f"--user-data-dir={profile}", "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=8000", f"--print-to-pdf={dst}"]
    if not header_footer:
        args.append("--no-pdf-header-footer")
    args.append(target)
    try:
        subprocess.run(args, timeout=timeout, capture_output=True)
        # çıktı dosyası gecikmeli yazılabilir: boyutu sabitlenene kadar bekle
        deadline, last = time.time() + 30, -1
        while time.time() < deadline:
            size = dst.stat().st_size if dst.exists() else -1
            if size > 0 and size == last:
                break
            last = size
            time.sleep(0.5)
    except subprocess.TimeoutExpired as e:
        raise UserError("Sayfa zamanında yüklenemedi.") from e
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    if not dst.exists() or dst.stat().st_size == 0:
        raise UserError("HTML sayfası PDF'e dönüştürülemedi. Adresi kontrol et.")
    return dst


# ---------------- Ghostscript ----------------

def gs_pdfa(src: Path, dst: Path, part: int = 2) -> Path:
    gs = ghostscript()
    if not gs:
        raise UserError("Ghostscript bulunamadı.")
    args = [gs, f"-dPDFA={part}", "-dBATCH", "-dNOPAUSE", "-dSAFER", "-dQUIET",
            "-sColorConversionStrategy=RGB", "-dPDFACompatibilityPolicy=1",
            "-sDEVICE=pdfwrite", f"-sOutputFile={dst}", str(src)]
    subprocess.run(args, check=True, timeout=600, capture_output=True)
    return dst
