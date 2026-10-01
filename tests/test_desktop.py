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
