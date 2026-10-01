"""Masaüstü güncellemeleri: GitHub sürümlerini denetler, kurulum dosyasını indirip doğrular.

Kurulumu başlatmak masaüstü penceresinin işidir (desktop.py); sunucu süreci yalnızca
doğrulanmış dosyayı ve `pending.json` kaydını hazırlar.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

from .settings import settings
from .version import VERSION

REPO = "jordenss00-coder/Pdf"
DEFAULT_FEED = f"https://api.github.com/repos/{REPO}/releases?per_page=20"
SETUP = "PDF-Atolye-Setup.exe"
SUMS = "SHA256SUMS.txt"
CHECK_INTERVAL = 6 * 3600
MAX_SETUP_BYTES = 512 * 1024 * 1024
WINDOWS = os.name == "nt"


class UpdateError(Exception):
    pass


def parse_version(text) -> tuple[int, int, int] | None:
    m = re.fullmatch(r"v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})", str(text or "").strip())
    return tuple(int(x) for x in m.groups()) if m else None


def feed_url() -> str:
    return os.getenv("PDF_UPDATE_FEED") or DEFAULT_FEED


def update_dir() -> Path | None:
    value = os.getenv("PDF_UPDATE_DIR")
    return Path(value) if value else None


def supported() -> bool:
    return WINDOWS and bool(settings.desktop_token) and update_dir() is not None


def _loopback(host) -> bool:
    try:
        return host == "localhost" or ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _check_feed(url):
    parts = urlsplit(url)
    if url == DEFAULT_FEED or (parts.scheme in ("http", "https") and _loopback(parts.hostname)):
        return
    raise UpdateError("Güncelleme kaynağı yalnızca GitHub ya da yerel test sunucusu olabilir.")


def allowed_asset(url: str) -> bool:
    """Varlıklar yalnızca bu deponun sürüm indirmelerinden (testte: aynı yerel sunucudan) gelir."""
    feed = feed_url()
    if feed == DEFAULT_FEED:
        return url.startswith(f"https://github.com/{REPO}/releases/download/")
    f, u = urlsplit(feed), urlsplit(url)
    return (u.scheme, u.netloc) == (f.scheme, f.netloc)


def select_release(releases, current: str = VERSION) -> dict | None:
    """Kurulum ve özet dosyası olan, şimdikinden yeni en yüksek sürümü seçer."""
    now = parse_version(current) or (0, 0, 0)
    best = None
    for rel in releases if isinstance(releases, list) else []:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        version = parse_version(rel.get("tag_name"))
        if not version or version <= now or (best and version <= best[0]):
            continue
        assets = {a.get("name"): a for a in rel.get("assets") or [] if isinstance(a, dict)}
        setup, sums = assets.get(SETUP), assets.get(SUMS)
        if not setup or not sums:
            continue
        urls = setup.get("browser_download_url") or "", sums.get("browser_download_url") or ""
        if not all(allowed_asset(u) for u in urls):
            continue
        best = (version, {
            "version": ".".join(map(str, version)),
            "name": str(rel.get("name") or rel.get("tag_name"))[:200],
            "notes": str(rel.get("body") or "")[:6000],
            "published_at": rel.get("published_at"),
            "page": rel.get("html_url") if str(rel.get("html_url") or "").startswith(f"https://github.com/{REPO}/") else None,
            "prerelease": bool(rel.get("prerelease")),
            "setup_url": urls[0], "sums_url": urls[1],
            "size": int(setup.get("size") or 0),
        })
    return best[1] if best else None


def _client(timeout=30):
    import httpx
    return httpx.Client(timeout=timeout, follow_redirects=True,
                        headers={"User-Agent": f"PDF-Atolye/{VERSION}", "Accept": "application/vnd.github+json"})


def fetch_releases():
    url = feed_url()
    _check_feed(url)
    try:
        with _client(15) as client:
            response = client.get(url)
    except Exception:
        raise UpdateError("Güncelleme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.")
    if response.status_code in (403, 429):
        raise UpdateError("GitHub şu an çok fazla istek aldığını bildiriyor. Biraz sonra tekrar dene.")
    if response.status_code != 200:
        raise UpdateError(f"Güncelleme bilgisi alınamadı (HTTP {response.status_code}).")
    try:
        return response.json()
    except ValueError:
        raise UpdateError("Güncelleme bilgisi okunamadı.")


# ---------------- denetim ----------------

_lock = threading.Lock()


def _config():
    from .tools.ai import load_config, save_config
    return load_config, save_config


def auto_enabled() -> bool:
    load_config, _ = _config()
    return load_config().get("update_auto", True) is not False


def set_auto(value: bool) -> None:
    load_config, save_config = _config()
    cfg = load_config()
    cfg["update_auto"] = bool(value)
    save_config(cfg)


def check(force=False, auto=False) -> dict:
    """Önbellekteki sonucu döndürür; zorlanırsa ya da otomatik denetim süresi dolduysa yeniden sorar."""
    if not supported():
        return status()
    load_config, save_config = _config()
    with _lock:
        cached = load_config().get("update_check") or {}
        stale = time.time() - float(cached.get("checked_at") or 0) > CHECK_INTERVAL
        if force or (auto and stale and auto_enabled()):
            entry = {"checked_at": time.time(), "latest": None, "error": None}
            try:
                entry["latest"] = select_release(fetch_releases())
            except UpdateError as exc:
                entry["error"] = str(exc)
            cfg = load_config()
            cfg["update_check"] = entry
            save_config(cfg)
    return status()


def status() -> dict:
    out = {"supported": supported(), "current": VERSION, "available": False, "latest": None,
           "checked_at": None, "error": None, "auto": True, "download": downloader.snapshot()}
    if not out["supported"]:
        return out
    load_config, _ = _config()
    cfg = load_config()
    cached = cfg.get("update_check") or {}
    latest = cached.get("latest")
    out["auto"] = cfg.get("update_auto", True) is not False
    out["checked_at"] = cached.get("checked_at")
    out["error"] = cached.get("error")
    if latest and (parse_version(latest.get("version")) or (0, 0, 0)) > parse_version(VERSION):
        out["available"] = True
        out["latest"] = {k: latest.get(k) for k in ("version", "name", "notes", "published_at", "page", "prerelease", "size")}
    return out


# ---------------- indirme ----------------

def parse_sums(text: str) -> dict:
    sums = {}
    for line in text.lstrip("﻿").splitlines():
        m = re.fullmatch(r"\s*([0-9a-fA-F]{64})\s+\*?(\S.*?)\s*", line)
        if m:
            sums[m.group(2)] = m.group(1).lower()
    return sums


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _setup_name(version: str) -> str:
    return f"PDF-Atolye-Setup-{version}.exe"


class Downloader:
    def __init__(self):
        self._lock = threading.Lock()
        self._state = {"state": "idle", "version": None, "received": 0, "total": 0, "error": None}
        self._thread = None

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self._state)

    def _set(self, **kw):
        with self._lock:
            self._state.update(kw)

    def start(self, release: dict) -> dict:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return dict(self._state)
            self._state = {"state": "downloading", "version": release["version"], "received": 0,
                           "total": int(release.get("size") or 0), "error": None}
            self._thread = threading.Thread(target=self._run, args=(release,), daemon=True)
            self._thread.start()
            return dict(self._state)

    def _run(self, release):
        part = None
        try:
            folder = update_dir()
            folder.mkdir(parents=True, exist_ok=True)
            final = folder / _setup_name(release["version"])
            if not (allowed_asset(release["setup_url"]) and allowed_asset(release["sums_url"])):
                raise UpdateError("Güncelleme dosyasının adresi beklenen yerde değil.")
            with _client(60) as client:
                sums = client.get(release["sums_url"])
                if sums.status_code != 200 or len(sums.content) > 64 * 1024:
                    raise UpdateError("Güncellemenin doğrulama dosyası indirilemedi.")
                expected = parse_sums(sums.text).get(SETUP)
                if not expected:
                    raise UpdateError("Doğrulama dosyasında kurulum özeti bulunamadı.")
                if final.exists() and sha256_file(final) == expected:
                    self._mark_ready(folder, final, release["version"], expected)
                    return
                part = folder / (final.name + ".part")
                digest, received = hashlib.sha256(), 0
                with client.stream("GET", release["setup_url"]) as response, open(part, "wb") as out:
                    if response.status_code != 200:
                        raise UpdateError(f"Kurulum dosyası indirilemedi (HTTP {response.status_code}).")
                    total = int(response.headers.get("content-length") or release.get("size") or 0)
                    self._set(total=total)
                    for chunk in response.iter_bytes(1024 * 256):
                        received += len(chunk)
                        if received > MAX_SETUP_BYTES:
                            raise UpdateError("Kurulum dosyası beklenenden büyük.")
                        digest.update(chunk)
                        out.write(chunk)
                        self._set(received=received)
            self._set(state="verifying")
            if release.get("size") and received != release["size"]:
                raise UpdateError("Kurulum dosyası eksik indi. Tekrar dene.")
            if digest.hexdigest() != expected:
                raise UpdateError("Kurulum dosyasının SHA-256 özeti eşleşmedi; dosya kullanılmadı.")
            os.replace(part, final)
            part = None
            self._mark_ready(folder, final, release["version"], expected)
        except UpdateError as exc:
            self._set(state="error", error=str(exc))
        except Exception:
            self._set(state="error", error="Güncelleme indirilemedi. İnternet bağlantını kontrol edip tekrar dene.")
        finally:
            if part is not None:
                part.unlink(missing_ok=True)

    def _mark_ready(self, folder, final, version, digest):
        (folder / "pending.json").write_text(json.dumps({"version": version, "file": final.name, "sha256": digest}), encoding="utf-8")
        for old in folder.glob("PDF-Atolye-Setup-*.exe"):
            if old != final:
                old.unlink(missing_ok=True)
        self._set(state="ready", error=None)


downloader = Downloader()


def start_download() -> dict:
    if not supported():
        raise UpdateError("Güncellemeler yalnızca Windows masaüstü uygulamasında kullanılabilir.")
    load_config, _ = _config()
    latest = (load_config().get("update_check") or {}).get("latest")
    if not latest or (parse_version(latest.get("version")) or (0, 0, 0)) <= parse_version(VERSION):
        raise UpdateError("İndirilecek yeni bir sürüm yok. Önce güncellemeleri denetle.")
    downloader.start(latest)
    return status()


def pending_installer(folder: Path, current: str = VERSION) -> tuple[Path, str]:
    """Kurulmaya hazır, özeti yeniden doğrulanmış kurulum dosyası ve sürümü."""
    try:
        info = json.loads((folder / "pending.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise UpdateError("Kurulmaya hazır bir güncelleme yok.")
    version, name, digest = info.get("version"), str(info.get("file") or ""), str(info.get("sha256") or "")
    if not parse_version(version) or parse_version(version) <= parse_version(current):
        raise UpdateError("Hazırdaki güncelleme kurulu sürümden yeni değil.")
    if name != _setup_name(version) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise UpdateError("Güncelleme kaydı geçersiz.")
    path = folder / name
    if not path.is_file() or sha256_file(path) != digest:
        raise UpdateError("Kurulum dosyası değişmiş ya da silinmiş. Güncellemeyi yeniden indir.")
    return path, version


def cleanup_stale(folder: Path | None = None, current: str = VERSION) -> None:
    """Kurulmuş ya da yarım kalmış indirmeleri temizler."""
    folder = folder or update_dir()
    if not folder or not folder.is_dir():
        return
    for part in folder.glob("*.part"):
        part.unlink(missing_ok=True)
    try:
        pending_installer(folder, current)
    except UpdateError:
        (folder / "pending.json").unlink(missing_ok=True)
        for old in folder.glob("PDF-Atolye-Setup-*.exe"):
            try:
                old.unlink()
            except OSError:
                pass  # Kurulum hâlâ çalışıyor olabilir; bir sonraki açılışta silinir.
