"""PDF Atölye'yi başlatır ve tarayıcıda açar.

Kullanım:  python run.py [--port 8765] [--no-browser]
"""
from __future__ import annotations

import argparse
import socket
import threading
import time
import webbrowser


def free_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("Boş port bulunamadı.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    import uvicorn

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}"
    if not args.no_browser:
        def open_later():
            time.sleep(1.5)
            webbrowser.open(url)
        threading.Thread(target=open_later, daemon=True).start()
    print(f"\n  PDF Atölye çalışıyor: {url}\n  Kapatmak için bu pencerede Ctrl+C'ye bas.\n")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
