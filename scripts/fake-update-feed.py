"""Yerel, yavaşlatılmış sahte GitHub sürüm kaynağı (yalnızca test).

Kullanım:
  python scripts/fake-update-feed.py --setup PDF-Atolye-Setup.exe [--version 9.9.9] [--port 8899] [--rate 6000000]

Uygulamayı PDF_UPDATE_FEED=http://127.0.0.1:8899/releases.json ile başlat. Kaynak yalnızca
loopback adresinde çalışır; app/updates.py başka yerel olmayan kaynakları reddeder.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Throttled(SimpleHTTPRequestHandler):
    rate = 6e6

    def copyfile(self, source, outputfile):
        while chunk := source.read(256 * 1024):
            outputfile.write(chunk)
            time.sleep(len(chunk) / self.rate)


def build_feed(root: Path, setup: Path, version: str, base: str) -> None:
    folder = root / f"v{version}"
    folder.mkdir(parents=True)
    shutil.copyfile(setup, folder / "PDF-Atolye-Setup.exe")
    digest = hashlib.sha256((folder / "PDF-Atolye-Setup.exe").read_bytes()).hexdigest()
    (folder / "SHA256SUMS.txt").write_text(f"{digest}  PDF-Atolye-Setup.exe\n", encoding="utf-8")
    notes = (f"# PDF Atölye {version}\n\n## Yenilikler\n\n- **Güncelleme denetimi**: yeni sürüm uygulama içinden indirilir.\n"
             "- Karanlık tema seçimi.\n- [Test raporu](https://example.com) bağlantısı.")
    release = {
        "tag_name": f"v{version}", "name": f"PDF Atölye {version} — test", "draft": False, "prerelease": True,
        "published_at": "2026-10-01T12:00:00Z", "body": notes,
        "html_url": f"https://github.com/jordenss00-coder/Pdf/releases/tag/v{version}",
        "assets": [
            {"name": "PDF-Atolye-Setup.exe", "size": setup.stat().st_size,
             "browser_download_url": f"{base}/v{version}/PDF-Atolye-Setup.exe"},
            {"name": "SHA256SUMS.txt", "size": 90, "browser_download_url": f"{base}/v{version}/SHA256SUMS.txt"},
        ],
    }
    (root / "releases.json").write_text(json.dumps([release], ensure_ascii=False), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--setup", type=Path, required=True, help="Sunulacak kurulum dosyası (herhangi bir dosya olabilir)")
    parser.add_argument("--version", default="9.9.9")
    parser.add_argument("--port", type=int, default=8899)
    parser.add_argument("--rate", type=float, default=6e6, help="bayt/saniye; ilerleme çubuğunu görmek için")
    args = parser.parse_args()
    base = f"http://127.0.0.1:{args.port}"
    with tempfile.TemporaryDirectory(prefix="pdf-feed-") as td:
        build_feed(Path(td), args.setup, args.version, base)
        Throttled.rate = args.rate
        print(f"Sahte sürüm kaynağı: {base}/releases.json (v{args.version})", flush=True)
        ThreadingHTTPServer(("127.0.0.1", args.port), partial(Throttled, directory=td)).serve_forever()


if __name__ == "__main__":
    main()
