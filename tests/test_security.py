"""Cấu hình chạy thật: đăng nhập giảng viên, mã lớp, token xAPI, tài liệu API, header bảo mật."""
import base64

import pytest
from fastapi.testclient import TestClient

from backend.settings import Settings, hash_password, verify_password

PW_HASH = hash_password("Mat-khau-dai-123", iterations=1000)
GOOD = {"Authorization": "Basic " + base64.b64encode("gv.lan:Mat-khau-dai-123".encode()).decode()}
BAD = {"Authorization": "Basic " + base64.b64encode(b"gv.lan:sai").decode()}


@pytest.fixture()
def prod(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "p.db"))
    monkeypatch.setenv("ROBO_ENV", "production")
    monkeypatch.setenv("ROBO_INSTRUCTORS", f"gv.lan={PW_HASH};gv.minh={PW_HASH}")
    monkeypatch.setenv("ROBO_CLASS_CODE", "NOISOI-K47")
    monkeypatch.setenv("ROBO_TOKEN", "tok-unreal-xyz")
    from backend.app import app
    with TestClient(app) as c:
        yield c


def test_password_hash_roundtrip_and_format():
    h = hash_password("abc", iterations=1000)
    assert verify_password("abc", h) and not verify_password("abd", h)
    assert "$" not in h                       # an toàn với tệp .env của Docker Compose
    assert not verify_password("abc", "plain-text")


def test_production_refuses_to_start_without_accounts(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "x.db"))
    monkeypatch.setenv("ROBO_ENV", "production")
    for k in ("ROBO_INSTRUCTORS", "ROBO_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    from backend.app import app
    with pytest.raises(RuntimeError, match="ROBO_INSTRUCTORS"):
        with TestClient(app):
            pass
    assert Settings(env="production", instructors={"a": "123"}, xapi_token="t").problems()


def test_result_import_is_instructor_only(prod):
    body = {"scenario_id": "m2_sterile_basics", "learner": "SV3", "role": "stu", "log": []}
    assert prod.post("/api/results/import", json=body).status_code == 401
    r = prod.post("/api/results/import", json=body, headers=GOOD)
    assert r.status_code == 200
    d = prod.get(f"/api/session/{r.json()['registration']}", headers=GOOD).json()
    assert d["finished"]


def test_vercel_requires_postgres(tmp_path, monkeypatch):
    s = Settings(env="production", instructors={"a": PW_HASH}, xapi_token="t", on_vercel=True)
    assert any("DATABASE_URL" in p for p in s.problems())
    assert not Settings(env="production", instructors={"a": PW_HASH}, xapi_token="t", on_vercel=True,
                        database_url="postgresql://x").problems()


@pytest.mark.parametrize("path", ["/", "/session?reg=x", "/video-markers", "/api/sessions", "/api/summary", "/api/export.csv",
                                  "/xapi/statements", "/api/media/m5_lap_appendectomy_ntp/yt_lFUi_ozMJUc/export"])
def test_instructor_pages_need_login(prod, path):
    r = prod.get(path)
    assert r.status_code == 401 and r.headers["www-authenticate"].startswith("Basic")
    assert prod.get(path, headers=BAD).status_code == 401
    assert prod.get(path, headers=GOOD).status_code in (200, 404)


@pytest.mark.parametrize("path", ["/sim", "/health", "/api/scenarios", "/api/scenarios/full", "/api/media/m5_lap_appendectomy_ntp",
                                  "/static/sim/app.js", "/static/sim/three.min.js"])
def test_student_pages_are_public(prod, path):
    assert prod.get(path).status_code == 200


def test_class_code_required(prod):
    body = {"scenario_id": "m2_sterile_basics", "learner": "SV1", "role": "stu"}
    assert prod.post("/api/run/start", json=body).status_code == 403
    assert prod.post("/api/run/start", json={**body, "class_code": "sai"}).status_code == 403
    assert prod.post("/api/run/start", json={**body, "class_code": " NOISOI-K47 "}).status_code == 200


def test_xapi_write_needs_token(prod):
    st = {"actor": {"objectType": "Agent", "account": {"homePage": "https://x.vn", "name": "u1"}},
          "verb": {"id": "http://adlnet.gov/expapi/verbs/completed"}, "object": {"id": "https://x.vn/a"}}
    h = {"X-Experience-API-Version": "1.0.3"}
    assert prod.post("/xapi/statements", json=st, headers=h).status_code == 401
    assert prod.post("/xapi/statements", json=st, headers={**h, "Authorization": "Bearer sai"}).status_code == 401
    assert prod.post("/xapi/statements", json=st, headers={**h, "Authorization": "Bearer tok-unreal-xyz"}).status_code == 200


def test_assessment_records_logged_in_account(prod):
    r = prod.post("/api/run/start", json={"scenario_id": "m2_sterile_basics", "learner": "SV2", "role": "stu", "class_code": "NOISOI-K47"}).json()
    assert prod.post("/api/results", json={"token": r["token"], "log": [], "t_end": 1}).status_code == 200
    a = prod.post("/api/assessments", headers=GOOD, json={"registration": r["registration"], "assessor": "Ai đó",
                                                          "ratings": {"prep": 3}, "overall": "chua_dat"}).json()
    assert a["account"] == "gv.lan"


def test_docs_hidden_and_security_headers(prod):
    assert prod.get("/docs").status_code == 404 and prod.get("/openapi.json").status_code == 404
    r = prod.get("/sim")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "youtube-nocookie.com" in r.headers["content-security-policy-report-only"]
    assert prod.get("/api/scenarios").headers["cache-control"] == "no-store"
    h = prod.get("/health").json()
    assert h["ok"] and "version" in h
