"""One disposable process per job, with a deadline and Linux process-group cleanup."""
import json
import os
import signal
import subprocess
import sys

from .settings import ROOT, settings
from .util import UserError


def execute(tool, entries, options, workdir):
    request = workdir / "request.json"
    request.write_text(json.dumps({"name": tool, "entries": entries, "options": options,
                                   "workdir": str(workdir)}), encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-m", "app.worker", str(request)], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=os.name != "nt")
    try:
        proc.wait(timeout=settings.job_timeout)
        response = workdir / "response.json"
        if proc.returncode or not response.exists():
            raise UserError("İşlem tamamlanamadı. Dosya hasarlı veya çok büyük olabilir.")
        return json.loads(response.read_text(encoding="utf-8"))
    except subprocess.TimeoutExpired:
        raise UserError(f"İşlem {settings.job_timeout} saniye sınırını aştı. Daha küçük bir belge dene.")
    finally:
        if os.name != "nt":
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        elif proc.poll() is None:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
            proc.kill()
        proc.wait()
