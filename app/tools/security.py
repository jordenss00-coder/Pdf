"""Güvenlik: parola koruma, kilit açma, sertifikalı dijital imza."""
from __future__ import annotations

import secrets
from pathlib import Path

import pymupdf

from ..util import UserError, stem
from . import tool

PERMS = {
    "print": pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_PRINT_HQ,
    "copy": pymupdf.PDF_PERM_COPY | pymupdf.PDF_PERM_ACCESSIBILITY,
    "modify": pymupdf.PDF_PERM_MODIFY | pymupdf.PDF_PERM_ASSEMBLE,
    "annotate": pymupdf.PDF_PERM_ANNOTATE | pymupdf.PDF_PERM_FORM,
}


@tool("protect")
def protect(ctx):
    user_pw = ctx.opt("password", "")
    if len(user_pw) < 1:
        raise UserError("Bir parola belirle.")
    if ctx.opt("password2") is not None and ctx.opt("password2") != user_pw:
        raise UserError("Parolalar eşleşmiyor.")
    owner_pw = ctx.opt("owner_password") or secrets.token_urlsafe(16)
    allowed = ctx.opt("permissions", ["print", "copy", "annotate"])
    perm = 0
    for k in allowed:
        perm |= PERMS.get(k, 0)
    paths = []
    for e in ctx.entries:
        doc = ctx.open_pdf(e)
        out = ctx.out(f"{stem(e.name)}_korumali.pdf")
        doc.save(out, garbage=3, deflate=True, encryption=pymupdf.PDF_ENCRYPT_AES_256,
                 owner_pw=owner_pw, user_pw=user_pw, permissions=perm)
        doc.close()
        paths.append(out)
    ctx.result_name = "korumali.zip"
    return paths


@tool("unlock")
def unlock(ctx):
    pw = ctx.opt("password", "")
    paths = []
    for e in ctx.entries:
        doc = ctx.open_pdf(e) if not pw else pymupdf.open(e.path)
        if doc.needs_pass:
            p = pw or (ctx.options.get("passwords") or {}).get(e.id) or e.password
            if not p or not doc.authenticate(p):
                raise UserError(f"'{e.name}' için parola yanlış.")
        elif not doc.is_encrypted:
            ctx.extra["warning"] = "Dosya zaten şifreli değildi."
        out = ctx.out(f"{stem(e.name)}_kilitsiz.pdf")
        doc.save(out, garbage=3, deflate=True, encryption=pymupdf.PDF_ENCRYPT_NONE)
        doc.close()
        paths.append(out)
    ctx.result_name = "kilitsiz.zip"
    return paths


def digital_sign(ctx, pdf_path: Path, cert: dict) -> Path:
    """PKCS#12 (.pfx/.p12) sertifikayla görünmez dijital imza ekler."""
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers

    cert_path = cert.get("path")
    if not cert_path or not Path(cert_path).exists():
        raise UserError("Sertifika dosyası bulunamadı; yeniden yükle.")
    pw = (cert.get("password") or "").encode("utf-8")
    try:
        signer = signers.SimpleSigner.load_pkcs12(cert_path, passphrase=pw or None)
    except Exception as e:
        raise UserError("Sertifika açılamadı. Parolayı kontrol et.") from e
    if signer is None:
        raise UserError("Sertifika açılamadı. Parolayı kontrol et.")
    out = ctx.out(f"{stem(pdf_path.name)}_eimzali.pdf")
    meta = signers.PdfSignatureMetadata(
        field_name="Imza_" + secrets.token_hex(3),
        reason=cert.get("reason") or None,
        location=cert.get("location") or None,
    )
    with open(pdf_path, "rb") as inf:
        writer = IncrementalPdfFileWriter(inf, strict=False)
        with open(out, "wb") as outf:
            signers.sign_pdf(writer, meta, signer=signer, output=outf)
    ctx.extra["signed"] = True
    return out
