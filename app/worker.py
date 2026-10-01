"""Araçları ayrı bir süreçte çalıştırır.

PyMuPDF iş parçacığı güvenli değildir ve OCR/Office dönüşümleri uzun sürebilir;
bu yüzden işlemler ayrı süreçlerde yapılır, sunucu arayüze yanıt vermeye devam eder.
"""
from __future__ import annotations

import traceback
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")


def run_tool(name: str, entries: list[dict], options: dict, workdir: str | None = None) -> dict:
    from . import store
    from .tools import run
    from .util import UserError

    objs = []
    for d in entries:
        e = store.Entry(id=d["id"], name=d["name"], path=Path(d["path"]), kind=d["kind"],
                        size=d.get("size", 0), password=d.get("password"))
        e.pages = d.get("pages", [])
        objs.append(e)
    try:
        paths, ctx = run(name, objs, options, Path(workdir) if workdir else None)
    except UserError as ex:
        return {"error": str(ex)}
    except Exception as ex:  # beklenmeyen hata: ayrıntıyı günlüğe yaz, kullanıcıya özet ver
        traceback.print_exc()
        return {"error": "İşlem tamamlanamadı. Dosyayı ve seçenekleri kontrol et."}
    return {"paths": [str(p) for p in paths], "extra": ctx.extra, "result_name": ctx.result_name,
            "workdir": str(ctx.workdir)}


if __name__ == "__main__":
    import json
    import sys
    job = Path(sys.argv[1])
    payload = json.loads(job.read_text(encoding="utf-8"))
    result = run_tool(**payload)
    (job.parent / "response.json").write_text(json.dumps(result), encoding="utf-8")
