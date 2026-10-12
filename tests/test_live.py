"""Theo dõi trực tiếp: sinh viên làm trong trình duyệt, gửi tiến độ; giảng viên thấy từng buổi đang làm."""
import base64
import json

import pytest
from fastapi.testclient import TestClient

from backend.settings import hash_password
from simcore import load_all
from simcore.session import Session
from tests.test_runtime import M5, Clock, bot_until_wait

SC = load_all("scenarios")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "live.db"))
    from backend.app import app
    with TestClient(app) as c:
        yield c


def start(c, learner="SV-live", **kw):
    r = c.post("/api/run/start", json={"scenario_id": M5, "learner": learner, "role": "asst", "case_id": "A", **kw})
    assert r.status_code == 200, r.text
    return r.json()


def row(c, reg):
    return next(x for x in c.get("/api/live").json()["sessions"] if x["registration"] == reg)


def test_progress_appears_live_then_result(client):
    st = start(client)
    r0 = row(client, st["registration"])
    assert r0["status"] == "active" and r0["progress"] is None and r0["team"] == "SV-live (asst)"   # vừa bắt đầu
    s, clk = Session(SC[M5], "A", "asst", "SV-live"), Clock()
    w = bot_until_wait(s, clk)
    assert client.post("/api/run/progress", json={"token": st["token"], "log": s.log}).json() == {"ok": True}
    p = row(client, st["registration"])["progress"]
    assert p["done"] > 0 and p["required"] > p["done"] and p["waiting_for_student"] == ["Đặt người bệnh nằm ngửa"]
    assert p["issues"] == 0 and p["phase"] and p["case_title"]
    # học viên đứng sai vị trí: lỗi hiện ngay ở lần gửi tiếp theo
    s.do("asst", "position_supine", None, {}, clk())
    bot_until_wait(s, clk)
    s.do("asst", "take_position", "cam_spot", {"point": [-0.9, 1, 1.0]}, clk())
    client.post("/api/run/progress", json={"token": st["token"], "log": s.log})
    p2 = row(client, st["registration"])["progress"]
    assert p2["issues"] == 1 and p2["last_issues"][-1]["kind"] == "wrong_position" and p2["done"] > p["done"]
    # nộp bài: chuyển sang "đã nộp", có điểm; gửi tiến độ sau đó không ghi đè
    r = client.post("/api/results", json={"token": st["token"], "log": s.log, "t_end": s.last_t}).json()
    x = row(client, st["registration"])
    assert x["status"] == "submitted" and x["result"]["score"] == r["result"]["score"]
    assert client.post("/api/run/progress", json={"token": st["token"], "log": s.log}).json()["submitted"] is True


def test_many_students_in_parallel_listed(client):
    toks = [start(client, learner=f"SV{i:02d}")["token"] for i in range(12)]
    for i, t in enumerate(toks[:8]):
        s, clk = Session(SC[M5], "A", "asst", f"SV{i:02d}"), Clock()
        bot_until_wait(s, clk)
        assert client.post("/api/run/progress", json={"token": t, "log": s.log}).status_code == 200
    rows = client.get("/api/live").json()["sessions"]
    assert len(rows) == 12 and sum(1 for x in rows if x["progress"]) == 8
    assert all(x["status"] == "active" for x in rows)


def test_progress_checks_like_submit(client):
    st = start(client)
    s, clk = Session(SC[M5], "A", "asst", "SV-live"), Clock()
    bot_until_wait(s, clk)
    log = json.loads(json.dumps(s.log))
    log[0]["action"] = "suction"                                   # ê kíp ảo làm khác quy trình
    assert client.post("/api/run/progress", json={"token": st["token"], "log": log}).status_code == 422
    log = json.loads(json.dumps(s.log))
    for e in log:
        e["t"] = e["t"] + 10_000                                   # vượt thời lượng thật của buổi
    assert client.post("/api/run/progress", json={"token": st["token"], "log": log}).status_code == 422
    body, mac = st["token"].split(".")
    p = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    p["learner"] = "nguoi-khac"
    forged = base64.urlsafe_b64encode(json.dumps(p).encode()).decode().rstrip("=") + "." + mac
    assert client.post("/api/run/progress", json={"token": forged, "log": s.log}).status_code == 401
    assert row(client, st["registration"])["progress"] is None     # không lưu gì từ các lần gửi sai


def test_live_is_instructor_only(tmp_path, monkeypatch):
    h = hash_password("Mat-khau-dai-123", iterations=1000)
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "p.db"))
    monkeypatch.setenv("ROBO_ENV", "production")
    monkeypatch.setenv("ROBO_INSTRUCTORS", f"gv.lan={h}")
    monkeypatch.setenv("ROBO_TOKEN", "tok")
    from backend.app import app
    auth = {"Authorization": "Basic " + base64.b64encode(b"gv.lan:Mat-khau-dai-123").decode()}
    with TestClient(app) as c:
        assert c.get("/live").status_code == 401 and c.get("/api/live").status_code == 401
        assert c.get("/live", headers=auth).status_code == 200 and c.get("/api/live", headers=auth).status_code == 200
        st = start(c)
        s, clk = Session(SC[M5], "A", "asst", "SV-live"), Clock()
        bot_until_wait(s, clk)
        assert c.post("/api/run/progress", json={"token": st["token"], "log": s.log}).status_code == 200   # sinh viên không cần đăng nhập
