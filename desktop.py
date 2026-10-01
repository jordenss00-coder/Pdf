"""Windows entry point and private server/worker dispatch for packaged builds."""
from __future__ import annotations

import argparse
import atexit
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request

# The installer waits for this mutex to disappear before replacing files.
APP_MUTEX = "PDFAtolyeDesktopApp"
UPDATE_FLAGS = ("/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/UPDATE=1")


def command(*args):
    if getattr(sys, "frozen", False):
        return [sys.executable, *args]
    return [sys.executable, str(Path(__file__).resolve()), *args]


def user_directory():
    base = os.getenv("PDF_DESKTOP_HOME")
    return Path(base) if base else Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "PDFAtolye"


def configure(root):
    root.mkdir(parents=True, exist_ok=True)
    os.environ["PDF_MODE"] = "local"
    os.environ["PDF_DATA_DIR"] = str(root / "data")
    os.environ["PDF_CONFIG_FILE"] = str(root / "config.json")
    os.environ["PDF_UPDATE_DIR"] = str(root / "updates")
    os.environ["PDF_ALLOWED_HOSTS"] = "127.0.0.1,localhost"


def show_error(message):
    if os.name == "nt":
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, "PDF Atölye", 0x10)
    elif sys.stderr:
        print(message, file=sys.stderr)


class SingleInstance:
    def __init__(self, root):
        self.file = open(root / "desktop.lock", "a+b")
        if os.fstat(self.file.fileno()).st_size == 0:
            self.file.write(b"0")
            self.file.flush()
        self.file.seek(0)
        if os.name == "nt":
            import msvcrt
            try:
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                self.file.close()
                raise RuntimeError("PDF Atölye zaten açık. Görev çubuğundaki pencereyi kullan.")

    def close(self):
        self.file.close()


def hold_app_mutex():
    if os.name != "nt":
        return None
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
    return kernel32.CreateMutexW(None, False, APP_MUTEX) or None


def release_app_mutex(handle):
    if handle:
        import ctypes
        from ctypes import wintypes
        ctypes.windll.kernel32.CloseHandle(wintypes.HANDLE(handle))


def start_installer(root, flags=UPDATE_FLAGS):
    """Start the verified, pending setup outside this process tree; return its version."""
    from app.updates import pending_installer
    setup, version = pending_installer(root / "updates")
    detached = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    breakaway = getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0)
    args = dict(cwd=str(setup.parent), close_fds=True, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        subprocess.Popen([str(setup), *flags], creationflags=detached | breakaway, **args)
    except OSError:  # Job objects may forbid breakaway.
        subprocess.Popen([str(setup), *flags], creationflags=detached, **args)
    return version


class DesktopApi:
    """Functions the app page can call through window.pywebview.api."""
    def __init__(self, root):
        self._root = root
        self._window = None

    def install_update(self):
        from app.updates import UpdateError
        try:
            version = start_installer(self._root)
        except UpdateError as exc:
            return {"ok": False, "error": str(exc)}
        except OSError:
            return {"ok": False, "error": "Kurulum başlatılamadı. Güncellemeyi yeniden indir."}
        window = self._window
        def close():
            window.confirm_close = False  # destroy() otherwise asks the quit question
            window.destroy()
        threading.Timer(0.8, close).start()
        return {"ok": True, "version": version}


def choose_port(root):
    try:
        preferred = int((root / "desktop-port.txt").read_text())
    except (OSError, ValueError):
        preferred = 18765
    if not 1024 <= preferred <= 65000:
        preferred = 18765
    for port in range(preferred, preferred + 50):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
        (root / "desktop-port.txt").write_text(str(port))
        return port
    raise RuntimeError("Uygulama için boş yerel bağlantı noktası bulunamadı.")


def stop_server(proc):
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
    else:
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def wait_ready(proc, url, token, timeout=60):
    deadline = time.monotonic() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("PDF motoru başlatılamadı. Günlük: %LOCALAPPDATA%\\PDFAtolye\\desktop.log")
        try:
            request = urllib.request.Request(url + "/api/health", headers={"X-PDF-Desktop": token})
            with opener.open(request, timeout=1) as response:
                if json.load(response).get("status") == "ok":
                    return
        except (OSError, ValueError):
            pass
        time.sleep(0.1)
    raise RuntimeError("PDF motorunun açılması zaman aşımına uğradı.")


def serve(port):
    import uvicorn
    # Windowed executables have no stdout/stderr. Use a simple file handler, no isatty().
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, access_log=False,
                log_config=None, log_level="warning")


def self_test(url, token):
    """Real frozen server -> upload -> frozen worker -> download smoke test."""
    import httpx
    import pymupdf
    with httpx.Client(base_url=url, headers={"X-PDF-Desktop": token}, timeout=90, trust_env=False) as client:
        assert client.get("/").status_code == 200
        with pymupdf.open() as source:
            source.new_page().insert_text((72, 72), "PDF Atolye desktop smoke test")
            data = source.tobytes()
        upload = client.post("/api/upload", files={"files": ("sample.pdf", data, "application/pdf")})
        upload.raise_for_status()
        fid = upload.json()[0]["id"]
        for tool, opts in (("rotate", {"angle": 90}), ("pdf_to_word", {}), ("pdf_to_markdown", {})):
            result = client.post("/api/process/" + tool, json={"files": [fid], "options": opts})
            result.raise_for_status()
            output = client.get("/api/files/" + result.json()["result"]["id"] + "/download")
            output.raise_for_status()
            assert len(output.content) > 10
            if tool == "rotate":
                with pymupdf.open(stream=output.content) as doc:
                    assert doc[0].rotation == 90
        client.delete("/api/files").raise_for_status()


def update_test(url, token, root, report):
    """Feed -> download -> SHA-256 check -> start the real setup silently, as the update button does."""
    import httpx
    with httpx.Client(base_url=url, headers={"X-PDF-Desktop": token}, timeout=60, trust_env=False) as client:
        status = client.post("/api/update/check").json()
        if not status.get("available"):
            raise RuntimeError(f"Update was not offered: {status.get('error')}")
        client.post("/api/update/download").raise_for_status()
        deadline = time.monotonic() + 600
        while True:
            download = client.get("/api/update").json()["download"]
            if download["state"] == "ready":
                break
            if download["state"] == "error" or time.monotonic() > deadline:
                raise RuntimeError(download["error"] or "Update download timed out")
            time.sleep(0.5)
    log = Path(report).with_suffix(".setup.log")
    version = start_installer(root, ("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", f"/LOG={log}"))
    Path(report).write_text(json.dumps({"status": "passed", "version": version, "setup_log": str(log),
                                        "checks": ["feed", "download", "sha256", "pending", "installer-started"]}), encoding="utf-8")


def launch(smoke_report=None, ui_report=None, update_report=None):
    root = user_directory().resolve()
    configure(root)
    instance = SingleInstance(root)
    mutex = hold_app_mutex()
    proc = None
    try:
        port = choose_port(root)
        token = secrets.token_urlsafe(48)
        env = {**os.environ, "PDF_DESKTOP_TOKEN": token}
        url = f"http://127.0.0.1:{port}"
        logfile = root / "desktop.log"
        if logfile.exists() and logfile.stat().st_size > 2 * 1024 * 1024:
            logfile.replace(root / "desktop.previous.log")
        with open(logfile, "ab") as log:
            proc = subprocess.Popen(command("--serve-desktop", str(port)), env=env,
                stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        atexit.register(stop_server, proc)
        wait_ready(proc, url, token)
        if smoke_report:
            self_test(url, token)
            Path(smoke_report).write_text(json.dumps({"status": "passed", "checks": ["private-server", "upload", "frozen-worker", "rotate", "docx", "markdown", "download", "delete"]}), encoding="utf-8")
            return
        if update_report:
            update_test(url, token, root, update_report)
            return
        import webview
        webview.settings["ALLOW_DOWNLOADS"] = True
        webview.settings["ALLOW_FILE_URLS"] = False
        api = DesktopApi(root)
        window = webview.create_window("PDF Atölye", url + "/desktop/" + token, js_api=api,
                              width=1280, height=850, min_size=(800, 600), text_select=True,
                              confirm_close=not bool(ui_report), hidden=bool(ui_report))
        api._window = window
        def check_window():
            result = {"status": "failed", "error": "Window content did not load"}
            try:
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    try:
                        title = window.evaluate_js("document.querySelector('h1')?.textContent || ''")
                        bridge = window.evaluate_js("typeof window.pywebview?.api?.install_update")
                        if title and "PDF" in title and bridge == "function":
                            result = {"status": "passed", "engine": "edgechromium", "heading": title, "update_bridge": bridge,
                                      "tool_links": window.evaluate_js("document.querySelectorAll('a.tile').length")}
                            break
                    except Exception:
                        pass
                    time.sleep(0.2)
            finally:
                Path(ui_report).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
                window.destroy()
        webview.start(check_window if ui_report else None, gui="edgechromium", private_mode=False, storage_path=str(root / "webview"),
                      localization={"global.quitConfirmation": "PDF Atölye kapatılsın mı? Devam eden işlemler durdurulur."})
        if ui_report and json.loads(Path(ui_report).read_text(encoding="utf-8"))["status"] != "passed":
            raise RuntimeError("Window smoke test failed")
    finally:
        if proc:
            stop_server(proc)
            atexit.unregister(stop_server)
        release_app_mutex(mutex)
        instance.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker")
    parser.add_argument("--serve-desktop", type=int)
    parser.add_argument("--smoke-test", metavar="REPORT_JSON")
    parser.add_argument("--ui-smoke-test", metavar="REPORT_JSON")
    parser.add_argument("--update-smoke-test", metavar="REPORT_JSON")
    args = parser.parse_args()
    if args.worker:
        from app.worker import run_job_file
        run_job_file(Path(args.worker))
    elif args.serve_desktop:
        serve(args.serve_desktop)
    else:
        try:
            launch(args.smoke_test, args.ui_smoke_test, args.update_smoke_test)
        except Exception as exc:
            report = args.smoke_test or args.ui_smoke_test or args.update_smoke_test
            if report:
                Path(report).write_text(json.dumps({"status": "failed", "error": str(exc)}), encoding="utf-8")
            else:
                show_error(f"Uygulama açılamadı: {exc}\n\nWindows 10/11 ve Microsoft Edge WebView2 Runtime gereklidir.\nhttps://developer.microsoft.com/microsoft-edge/webview2/")
            raise SystemExit(1)


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
