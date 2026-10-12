"""Cấu hình chạy thật, đọc từ biến môi trường (xem .env.example).

ROBO_ENV            production | development (mặc định development)
ROBO_DB             đường dẫn SQLite (mặc định ./robo_or_sim.db; trong Docker là /data/robo_or_sim.db)
ROBO_INSTRUCTORS    tài khoản giảng viên: "ten1=pbkdf2:...;ten2=pbkdf2:..." (tạo bằng tools/hash_password.py)
                    Khi đặt biến này, mọi trang và API của giảng viên yêu cầu đăng nhập.
                    Ở production, thiếu biến này thì máy chủ không khởi động.
ROBO_CLASS_CODE     mã lớp sinh viên phải nhập để bắt đầu buổi mô phỏng (khuyến nghị đặt ở production)
ROBO_TOKEN          token cho ứng dụng Unreal gửi câu lệnh xAPI (POST /xapi/statements)
ROBO_SECRET         khóa ký token buổi học (không bắt buộc; mặc định suy ra từ ROBO_TOKEN)
DATABASE_URL        PostgreSQL (ví dụ Neon trên Vercel). Có biến này thì dùng PostgreSQL thay SQLite.
                    Chấp nhận cả POSTGRES_URL (tên biến do tích hợp Neon của Vercel đặt).
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

PBKDF2_ITER = 600_000


def hash_password(password: str, iterations: int = PBKDF2_ITER, salt: Optional[bytes] = None) -> str:
    """Băm mật khẩu bằng PBKDF2-SHA256. Định dạng không chứa ký tự '$' để an toàn với tệp .env của Docker Compose."""
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2:{iterations}:{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, it, salt_hex, hash_hex = stored.split(":")
        if algo != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(it))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    db: str = "robo_or_sim.db"
    instructors: dict = field(default_factory=dict)
    class_code: str = ""
    xapi_token: str = ""
    secret: str = ""
    database_url: str = ""
    on_vercel: bool = False

    @property
    def production(self) -> bool:
        return self.env == "production"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.instructors)

    def problems(self) -> list[str]:
        """Các lỗi cấu hình khiến không được chạy ở production."""
        out = []
        if self.production:
            if not self.instructors:
                out.append("Chưa đặt ROBO_INSTRUCTORS (tài khoản giảng viên).")
            if not self.xapi_token:
                out.append("Chưa đặt ROBO_TOKEN (token xAPI cho ứng dụng Unreal); đặt một chuỗi ngẫu nhiên dài.")
            if self.on_vercel and not self.database_url:
                out.append("Chạy trên Vercel cần DATABASE_URL (PostgreSQL, ví dụ Neon); ổ đĩa của Vercel không lưu được SQLite.")
            for name, h in self.instructors.items():
                if not h.startswith("pbkdf2:"):
                    out.append(f"Mật khẩu của '{name}' chưa được băm; dùng tools/hash_password.py.")
        return out


def _parse_instructors(raw: str) -> dict:
    users = {}
    for part in filter(None, (p.strip() for p in raw.split(";"))):
        if "=" not in part:
            continue
        name, h = part.split("=", 1)
        if name.strip():
            users[name.strip()] = h.strip()
    return users


@lru_cache(maxsize=8)
def _build(env, db, instr, code, token, secret, dburl, vercel) -> Settings:
    on_vercel = bool(vercel)
    default_db = "/tmp/robo_or_sim.db" if on_vercel else "robo_or_sim.db"   # Vercel: chỉ /tmp ghi được (dùng thử)
    return Settings(env=(env or "development").strip().lower(), db=db or default_db,
                    instructors=_parse_instructors(instr or ""), class_code=(code or "").strip(), xapi_token=token or "",
                    secret=secret or "", database_url=(dburl or "").strip(), on_vercel=on_vercel)


def get_settings() -> Settings:
    e = os.environ
    return _build(e.get("ROBO_ENV"), e.get("ROBO_DB"), e.get("ROBO_INSTRUCTORS"), e.get("ROBO_CLASS_CODE"), e.get("ROBO_TOKEN"),
                  e.get("ROBO_SECRET"), e.get("DATABASE_URL") or e.get("POSTGRES_URL"), e.get("VERCEL"))


_AUTH_CACHE: dict[str, tuple[str, float, str]] = {}
_AUTH_TTL_S = 600


def basic_user(authorization: Optional[str], s: Settings) -> Optional[str]:
    """Trả về tên giảng viên nếu header Basic hợp lệ.

    Băm PBKDF2 tốn ~0,2 giây CPU mỗi lần; trình duyệt gửi lại header ở MỌI yêu cầu (bảng điều khiển tự tải
    lại 5 giây/lần), nên kết quả đúng được nhớ 10 phút theo SHA-256 của header (không lưu mật khẩu).
    Đổi mật khẩu trong cấu hình thì bản nhớ cũ mất hiệu lực vì so cả chuỗi băm đang cấu hình."""
    if not authorization or not authorization.startswith("Basic "):
        return None
    key = hashlib.sha256(authorization.encode()).hexdigest()
    hit = _AUTH_CACHE.get(key)
    if hit and hit[1] > time.monotonic() and s.instructors.get(hit[0]) == hit[2]:
        return hit[0]
    name = _basic_user_slow(authorization, s)
    if name:
        if len(_AUTH_CACHE) > 1000:
            _AUTH_CACHE.clear()
        _AUTH_CACHE[key] = (name, time.monotonic() + _AUTH_TTL_S, s.instructors[name])
    return name


def _basic_user_slow(authorization: str, s: Settings) -> Optional[str]:
    try:
        raw = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    name, _, pw = raw.partition(":")
    h = s.instructors.get(name)
    if h is None:
        hash_password(pw, iterations=1000)   # giữ thời gian xử lý gần giống nhau
        return None
    return name if verify_password(pw, h) else None
