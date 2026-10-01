import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch

import desktop


class DesktopTests(unittest.TestCase):
    def test_source_and_frozen_dispatch(self):
        with patch.object(sys, "frozen", False, create=True):
            args = desktop.command("--worker", "job.json")
            self.assertEqual(Path(args[1]).name, "desktop.py")
        with patch.object(sys, "frozen", True, create=True):
            self.assertEqual(desktop.command("--worker", "job.json"), [sys.executable, "--worker", "job.json"])

    def test_user_directory_and_configuration(self):
        with tempfile.TemporaryDirectory() as td, patch.dict(os.environ, {"PDF_DESKTOP_HOME": td}):
            self.assertEqual(desktop.user_directory(), Path(td))
            desktop.configure(Path(td))
            self.assertEqual(os.environ["PDF_MODE"], "local")
            self.assertEqual(Path(os.environ["PDF_DATA_DIR"]), Path(td) / "data")
            self.assertEqual(Path(os.environ["PDF_CONFIG_FILE"]), Path(td) / "config.json")
            self.assertEqual(Path(os.environ["PDF_UPDATE_DIR"]), Path(td) / "updates")

    def test_update_starts_only_verified_installer(self):
        from app.updates import UpdateError
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            api = desktop.DesktopApi(root)
            self.assertFalse(api.install_update()["ok"])
            setup = root / "updates" / "PDF-Atolye-Setup-99.0.0.exe"
            with patch("app.updates.pending_installer", return_value=(setup, "99.0.0")), \
                 patch.object(desktop.subprocess, "Popen") as popen:
                self.assertEqual(desktop.start_installer(root), "99.0.0")
            args, kwargs = popen.call_args
            self.assertEqual(args[0], [str(setup), *desktop.UPDATE_FLAGS])
            self.assertIn("/UPDATE=1", args[0])
            self.assertEqual(kwargs["cwd"], str(setup.parent))
            with patch("app.updates.pending_installer", side_effect=UpdateError("yok")):
                self.assertEqual(api.install_update(), {"ok": False, "error": "yok"})

    @unittest.skipUnless(os.name == "nt", "Windows mutex")
    def test_app_mutex_is_visible_while_held(self):
        import ctypes
        handle = desktop.hold_app_mutex()
        try:
            self.assertTrue(handle)
            opened = ctypes.windll.kernel32.OpenMutexW(0x00100000, False, desktop.APP_MUTEX)
            self.assertTrue(opened)
            ctypes.windll.kernel32.CloseHandle(opened)
        finally:
            desktop.release_app_mutex(handle)
        self.assertFalse(ctypes.windll.kernel32.OpenMutexW(0x00100000, False, desktop.APP_MUTEX))

    def test_port_reuse_and_conflict(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            port = desktop.choose_port(root)
            self.assertEqual(desktop.choose_port(root), port)
            with socket.socket() as occupied:
                occupied.bind(("127.0.0.1", port))
                self.assertNotEqual(desktop.choose_port(root), port)

    @unittest.skipUnless(os.name == "nt", "Windows instance lock")
    def test_single_instance_lock_releases(self):
        with tempfile.TemporaryDirectory() as td:
            first = desktop.SingleInstance(Path(td))
            try:
                with self.assertRaisesRegex(RuntimeError, "zaten açık"):
                    desktop.SingleInstance(Path(td))
            finally:
                first.close()
            desktop.SingleInstance(Path(td)).close()
