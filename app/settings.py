"""Deployment settings. Hosted mode is for a password-protected small team."""
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    mode: str = os.getenv("PDF_MODE", "local")
    hosts: tuple = tuple(x.strip() for x in os.getenv("PDF_ALLOWED_HOSTS", "127.0.0.1,localhost,[::1]").split(",") if x.strip())
    secret: str = os.getenv("PDF_SESSION_SECRET", "")
    access_password: str = os.getenv("PDF_ACCESS_PASSWORD", "")
    secure_cookie: bool = os.getenv("PDF_SECURE_COOKIE", "true").lower() == "true"
    max_upload_mb: int = int(os.getenv("PDF_MAX_UPLOAD_MB", "50"))
    max_files: int = int(os.getenv("PDF_MAX_FILES", "20"))
    max_pages: int = int(os.getenv("PDF_MAX_PAGES", "500"))
    retention_hours: int = int(os.getenv("PDF_RETENTION_HOURS", "2"))
    job_timeout: int = int(os.getenv("PDF_JOB_TIMEOUT", "180"))
    max_jobs: int = int(os.getenv("PDF_MAX_JOBS", "2"))
    session_mb: int = int(os.getenv("PDF_SESSION_MB", "200"))

    @property
    def hosted(self):
        return self.mode == "hosted"

    def validate(self):
        if self.mode not in ("local", "hosted"):
            raise RuntimeError("PDF_MODE must be local or hosted")
        if any(v <= 0 for v in (self.max_upload_mb, self.max_files, self.max_pages,
                               self.retention_hours, self.job_timeout, self.max_jobs, self.session_mb)):
            raise RuntimeError("PDF limits must be positive")
        if self.hosted and (len(self.secret) < 32 or len(self.access_password) < 12):
            raise RuntimeError("Hosted mode requires PDF_SESSION_SECRET (32+ characters) and PDF_ACCESS_PASSWORD (12+ characters)")
        if "*" in self.hosts:
            raise RuntimeError("PDF_ALLOWED_HOSTS must list explicit host names")


settings = Settings()
