"""Máy chủ mô phỏng phòng mổ: trang mô phỏng cho sinh viên, bảng điều khiển và báo cáo cho giảng viên,
kho câu lệnh xAPI tối giản (mini-LRS).

Chạy thử trên máy cá nhân:   uvicorn backend.app:app --reload
Chạy thật: xem DEPLOY.md (Docker + Caddy HTTPS, hoặc systemd + Nginx). Cấu hình qua biến môi trường,
mô tả trong backend/settings.py và .env.example.

Từ bản 0.6, buổi mô phỏng chạy trong trình duyệt; máy chủ không giữ trạng thái buổi (xem backend/runtime.py),
nên chạy được trên Vercel (serverless) hoặc nhiều tiến trình. CSDL: SQLite, hoặc PostgreSQL khi đặt DATABASE_URL.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.db import Conn, connect_pg, connect_sqlite
from backend.dblock import WRITE_LOCK
from backend.settings import basic_user, get_settings
from simcore.xapi import validate_statement

log = logging.getLogger("robo_or_sim")
STATIC = Path(__file__).parent / "static"
VERSION = "0.7.0"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    s = get_settings()
    bad = s.problems()
    if bad:
        raise RuntimeError("Cấu hình production chưa hợp lệ:\n- " + "\n- ".join(bad))
    _db().close()   # tạo bảng, bật WAL ngay khi khởi động
    if not s.auth_enabled:
        log.warning("Trang giảng viên KHÔNG yêu cầu đăng nhập (chưa đặt ROBO_INSTRUCTORS). Chỉ dùng trên máy cá nhân.")
    if not s.class_code:
        log.warning("Chưa đặt ROBO_CLASS_CODE: ai mở được trang /sim cũng tạo được buổi mô phỏng.")
    log.info("Robo OR Sim %s, môi trường %s, CSDL %s", VERSION, s.env, s.db)
    yield


_prod_at_import = get_settings().production
app = FastAPI(title="Robo OR Sim", version=VERSION, lifespan=lifespan,
              docs_url=None if _prod_at_import else "/docs", redoc_url=None,
              openapi_url=None if _prod_at_import else "/openapi.json")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


# SQLite chỉ cho một bên ghi tại một thời điểm. Các endpoint đồng bộ chạy song song trong threadpool,
# nên mọi thao tác ghi đi qua WRITE_LOCK để không gặp "database is locked" khi cả lớp cùng thao tác.
_SCHEMA_READY: set[str] = set()
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS statements(
        id TEXT PRIMARY KEY, registration TEXT, verb TEXT, object TEXT, ts TEXT, body TEXT NOT NULL)""",
    "CREATE INDEX IF NOT EXISTS ix_reg ON statements(registration)",
    """CREATE TABLE IF NOT EXISTS assessments(
        id TEXT PRIMARY KEY, registration TEXT NOT NULL, assessor TEXT NOT NULL, created TEXT NOT NULL, body TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS media_markers(
        scenario TEXT NOT NULL, video TEXT NOT NULL, step TEXT NOT NULL, body TEXT NOT NULL,
        PRIMARY KEY (scenario, video, step))""",
    "CREATE TABLE IF NOT EXISTS _health(t TEXT)",
    # tiến độ mới nhất của buổi đang làm (theo dõi trực tiếp); ghi đè mỗi lần trình duyệt gửi
    "CREATE TABLE IF NOT EXISTS live_progress(registration TEXT PRIMARY KEY, updated TEXT NOT NULL, body TEXT NOT NULL)",
]


def _db() -> Conn:
    st = get_settings()
    con = connect_pg(st.database_url) if st.database_url else connect_sqlite(st.db)
    key = st.database_url or st.db
    if key not in _SCHEMA_READY:
        with WRITE_LOCK:
            if con.pg:
                # Nhiều tiến trình/instance Vercel khởi động cùng lúc: khóa để chỉ một bên tạo bảng
                con.execute("SELECT pg_advisory_xact_lock(?)", (727001,))
            else:
                con.execute("PRAGMA journal_mode=WAL")      # cho phép đọc trong lúc ghi
            for q in SCHEMA:
                con.execute(q)
            con.commit()
        _SCHEMA_READY.add(key)
    return con


# ---------------- phân quyền ----------------
INSTRUCTOR_EXACT = {"/", "/session", "/video-markers", "/live", "/api/live", "/api/sessions", "/api/summary", "/api/assessments", "/api/export.csv",
                    "/api/results/import"}
INSTRUCTOR_PREFIX = ("/api/session/",)
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

# Chính sách nội dung: chỉ chạy script của chính site và trình phát YouTube.
# Mặc định ở chế độ "Report-Only" (chỉ báo vi phạm trong Console, không chặn); bật chặn bằng ROBO_CSP_ENFORCE=1
# sau khi đã kiểm tra trên trình duyệt thật (xem DEPLOY.md).
CSP = ("default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; "
       "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; "
       "frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")


def needs_instructor(method: str, path: str) -> bool:
    if path in INSTRUCTOR_EXACT or path.startswith(INSTRUCTOR_PREFIX):
        return True
    if path.startswith("/api/media/"):
        # GET /api/media/{kịch bản} là công khai (mô phỏng cần mốc video); còn lại là quyền giảng viên
        return method != "GET" or path.rstrip("/").count("/") > 3
    if path == "/xapi/statements" and method == "GET":
        return True
    return False


@app.middleware("http")
async def guard(request: Request, call_next):
    s = get_settings()
    path, method = request.url.path, request.method
    if s.production and path.startswith(DOC_PATHS):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    request.state.user = None
    if s.auth_enabled:
        user = basic_user(request.headers.get("authorization"), s)
        request.state.user = user
        if needs_instructor(method, path) and not user:
            return Response("Cần đăng nhập tài khoản giảng viên.", status_code=401, media_type="text/plain; charset=utf-8",
                            headers={"WWW-Authenticate": 'Basic realm="Giang vien", charset="UTF-8"'})
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    # YouTube yêu cầu trình duyệt gửi Referer khi nhúng video; không dùng no-referrer
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    csp_header = "Content-Security-Policy" if os.environ.get("ROBO_CSP_ENFORCE") == "1" else "Content-Security-Policy-Report-Only"
    resp.headers.setdefault(csp_header, CSP)
    if needs_instructor(method, path) or path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ---------------- xAPI ----------------
def _xapi_write_allowed(request: Request, authorization: Optional[str]) -> None:
    s = get_settings()
    if request.state.user:
        return
    if s.xapi_token:
        if authorization and secrets.compare_digest(authorization.encode(), f"Bearer {s.xapi_token}".encode()):
            return
        raise HTTPException(401, "Sai hoặc thiếu token xAPI")
    if s.auth_enabled:
        raise HTTPException(401, "Cần token xAPI hoặc tài khoản giảng viên")


def store_statements(items: list[dict]) -> list[str]:
    """Lưu câu lệnh đã kiểm tra hợp lệ; trùng id thì bỏ qua (idempotent)."""
    con = _db()
    ids = []
    with WRITE_LOCK, con:
        for s in items:
            sid = s.get("id") or str(uuid.uuid4())
            s["id"] = sid
            con.execute("INSERT INTO statements VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING",
                        (sid, (s.get("context") or {}).get("registration"), s["verb"]["id"], s["object"]["id"],
                         s.get("timestamp"), json.dumps(s, ensure_ascii=False)))
            ids.append(sid)
    con.close()
    return ids


@app.post("/xapi/statements")
async def post_statements(request: Request, x_experience_api_version: Optional[str] = Header(None),
                          authorization: Optional[str] = Header(None)):
    _xapi_write_allowed(request, authorization)
    if not x_experience_api_version or not x_experience_api_version.startswith("1.0"):
        raise HTTPException(400, "Thiếu header X-Experience-API-Version 1.0.x")
    body: Any = await request.json()
    items = body if isinstance(body, list) else [body]
    if len(items) > 500:
        raise HTTPException(413, "Tối đa 500 câu lệnh mỗi lần gửi")
    errors = {}
    for idx, s in enumerate(items):
        e = validate_statement(s)
        if e:
            errors[idx] = e
    if errors:
        return JSONResponse({"errors": errors}, status_code=400)
    return store_statements(items)


@app.get("/xapi/statements")
def get_statements(registration: Optional[str] = None, limit: int = 200):
    con = _db()
    limit = max(1, min(limit, 2000))
    if registration:
        rows = con.execute("SELECT body FROM statements WHERE registration=? ORDER BY ts LIMIT ?", (registration, limit))
    else:
        rows = con.execute("SELECT body FROM statements ORDER BY ts DESC LIMIT ?", (limit,))
    return {"statements": [json.loads(r["body"]) for r in rows]}


# ---------------- trang ----------------
@app.get("/health")
def health():
    """Dùng cho Docker HEALTHCHECK và giám sát: kiểm tra đọc, ghi được cơ sở dữ liệu."""
    try:
        con = _db()
        with WRITE_LOCK, con:
            con.execute("DELETE FROM _health")
            con.execute("INSERT INTO _health VALUES (?)", (datetime.now(timezone.utc).isoformat(),))
        con.close()
    except Exception as e:      # sqlite3.Error hoặc lỗi kết nối PostgreSQL
        log.exception("health")
        return JSONResponse({"ok": False, "db": type(e).__name__}, status_code=503)
    return {"ok": True, "version": VERSION, "db": "postgres" if get_settings().database_url else "sqlite"}


@app.get("/")
def dashboard():
    return FileResponse(STATIC / "dashboard.html")


@app.get("/sim")
def sim_page():
    return FileResponse(STATIC / "sim" / "index.html")


@app.get("/session")
def session_page():
    return FileResponse(STATIC / "session.html")


@app.get("/live")
def live_page():
    return FileResponse(STATIC / "live.html")


@app.get("/video-markers")
def video_markers_page():
    return FileResponse(STATIC / "video_markers.html")


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


from backend.media import router as media_router  # noqa: E402
from backend.reports import router as report_router  # noqa: E402
from backend.runtime import router as run_router  # noqa: E402

app.include_router(media_router)
app.include_router(report_router)
app.include_router(run_router)
