import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from dataclasses import replace
from unittest.mock import patch

import httpx

from app import updates
from app.settings import settings
from app.tools import ai

FEED = "http://127.0.0.1:9/releases"
PAYLOAD = b"MZ fake installer bytes " * 4096


def release(tag, *, draft=False, base="http://127.0.0.1:9", assets=("PDF-Atolye-Setup.exe", "SHA256SUMS.txt"), size=len(PAYLOAD)):
    return {"tag_name": tag, "name": f"PDF Atölye {tag}", "draft": draft, "prerelease": True, "body": "Notlar",
            "html_url": f"https://github.com/{updates.REPO}/releases/tag/{tag}",
            "assets": [{"name": n, "size": size if n.endswith(".exe") else 100,
                        "browser_download_url": f"{base}/{tag}/{n}"} for n in assets]}


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pdf-updates-")
        root = Path(self.temp.name)
        self.folder = root / "updates"
        self.releases = [release("v0.9.0"), release("v1.2.0"), release("v1.3.0", draft=True), release("v0.1.0")]
        self.sums = f"{hashlib.sha256(PAYLOAD).hexdigest()}  PDF-Atolye-Setup.exe\n"
        self.payload = PAYLOAD
        self.requests = []
        def handler(request):
            self.requests.append(request.url.path)
            if request.url.path == "/releases":
                return httpx.Response(200, json=self.releases)
            if request.url.path.endswith("SHA256SUMS.txt"):
                return httpx.Response(200, text=self.sums)
            if request.url.path.endswith("PDF-Atolye-Setup.exe"):
                return httpx.Response(200, content=self.payload)
            return httpx.Response(404)
        transport = httpx.MockTransport(handler)
        self.patches = [
            patch.dict(os.environ, {"PDF_UPDATE_FEED": FEED, "PDF_UPDATE_DIR": str(self.folder)}),
            patch.object(updates, "WINDOWS", True),
            patch.object(updates, "settings", replace(settings, desktop_token="desktop-test-token")),
            patch.object(updates, "VERSION", "0.4.0"),
            patch.object(updates, "_client", lambda timeout=30: httpx.Client(transport=transport, follow_redirects=True)),
            patch.object(updates, "downloader", updates.Downloader()),
            patch.object(ai, "CONFIG", root / "config.json"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def wait_download(self):
        deadline = time.monotonic() + 10
        while updates.downloader.snapshot()["state"] in ("downloading", "verifying"):
            self.assertLess(time.monotonic(), deadline)
            time.sleep(0.02)
        return updates.downloader.snapshot()

    def test_versions_and_release_selection(self):
        self.assertEqual(updates.parse_version("v0.10.2"), (0, 10, 2))
        for bad in ("", "1.2", "v1.2.3-beta", "latest", None):
            self.assertIsNone(updates.parse_version(bad))
        chosen = updates.select_release(self.releases, "0.4.0")
        self.assertEqual(chosen["version"], "1.2.0")  # Drafts are skipped.
        self.assertIsNone(updates.select_release(self.releases, "1.2.0"))
        self.assertIsNone(updates.select_release([release("v2.0.0", assets=("PDF-Atolye-Setup.exe",))], "0.4.0"))
        self.assertIsNone(updates.select_release([release("v2.0.0", base="https://example.com")], "0.4.0"))

    def test_only_github_or_loopback_feeds(self):
        with patch.dict(os.environ, {"PDF_UPDATE_FEED": ""}):
            self.assertTrue(updates.allowed_asset(f"https://github.com/{updates.REPO}/releases/download/v1.0.0/PDF-Atolye-Setup.exe"))
            self.assertFalse(updates.allowed_asset("https://github.com/someone/else/releases/download/v1.0.0/PDF-Atolye-Setup.exe"))
        with patch.dict(os.environ, {"PDF_UPDATE_FEED": "https://example.com/releases"}):
            with self.assertRaises(updates.UpdateError):
                updates.fetch_releases()

    def test_check_caches_and_reports_errors(self):
        status = updates.check(force=True)
        self.assertTrue(status["available"])
        self.assertEqual(status["latest"]["version"], "1.2.0")
        self.assertNotIn("setup_url", status["latest"])
        calls = len(self.requests)
        updates.check(auto=True)
        self.assertEqual(len(self.requests), calls, "auto check uses the recent cached result")
        updates.set_auto(False)
        self.assertFalse(updates.status()["auto"])
        self.releases = {"message": "rate limited"}
        self.assertIsNone(updates.check(force=True)["latest"])
        with patch.object(updates, "_client", side_effect=httpx.ConnectError("offline")):
            self.assertIn("ulaşılamadı", updates.check(force=True)["error"])

    def test_download_verifies_and_prepares_installer(self):
        updates.check(force=True)
        updates.start_download()
        state = self.wait_download()
        self.assertEqual(state["state"], "ready", state)
        setup, version = updates.pending_installer(self.folder, "0.4.0")
        self.assertEqual((setup.name, version), ("PDF-Atolye-Setup-1.2.0.exe", "1.2.0"))
        self.assertEqual(setup.read_bytes(), PAYLOAD)
        with self.assertRaisesRegex(updates.UpdateError, "yeni değil"):
            updates.pending_installer(self.folder, "1.2.0")
        setup.write_bytes(PAYLOAD + b"tampered")
        with self.assertRaisesRegex(updates.UpdateError, "değişmiş"):
            updates.pending_installer(self.folder, "0.4.0")
        updates.cleanup_stale(self.folder, "0.4.0")
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_wrong_checksum_is_rejected(self):
        updates.check(force=True)
        self.payload = PAYLOAD[:-1] + b"X"
        updates.start_download()
        state = self.wait_download()
        self.assertEqual(state["state"], "error")
        self.assertIn("SHA-256", state["error"])
        self.assertFalse(list(self.folder.glob("*.exe")) or list(self.folder.glob("*.part")))
        with self.assertRaises(updates.UpdateError):
            updates.pending_installer(self.folder, "0.4.0")

    def test_pending_record_cannot_point_elsewhere(self):
        self.folder.mkdir()
        target = self.folder / "other.exe"
        target.write_bytes(PAYLOAD)
        (self.folder / "pending.json").write_text(json.dumps(
            {"version": "9.0.0", "file": "../other.exe", "sha256": hashlib.sha256(PAYLOAD).hexdigest()}))
        with self.assertRaisesRegex(updates.UpdateError, "geçersiz"):
            updates.pending_installer(self.folder, "0.4.0")

    def test_disabled_outside_windows_desktop(self):
        with patch.object(updates, "settings", replace(settings, desktop_token="")):
            self.assertFalse(updates.supported())
            self.assertFalse(updates.check(force=True)["supported"])
            with self.assertRaises(updates.UpdateError):
                updates.start_download()
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
