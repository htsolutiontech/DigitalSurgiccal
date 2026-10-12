"""Luồng buổi mô phỏng 0.6: trình duyệt chạy buổi, máy chủ chỉ cấp token và chấm lại nhật ký."""
import base64
import json

import pytest
from fastapi.testclient import TestClient

from simcore import load_all
from simcore.session import LogError, Session, replay_log

ALL = {"m2_sterile_basics", "m3_safety_checklist", "m5_lap_appendectomy_ntp", "m6_emergency_undock"}
SC = load_all("scenarios")
M5 = "m5_lap_appendectomy_ntp"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "r.db"))
    from backend.app import app
    with TestClient(app) as c:
        yield c


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        self.t += 0.01
        return self.t


def bot_until_wait(s: Session, clk: Clock, limit=300):
    for _ in range(limit):
        r = s.bot(clk())
        if r.get("idle"):
            return r
    raise AssertionError("ê kíp ảo không dừng")


def start(client, sid=M5, role="asst", case_id="A", learner="SV001", **kw):
    r = client.post("/api/run/start", json={"scenario_id": sid, "learner": learner, "role": role, "case_id": case_id, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def play_m5_asst(case_id="A"):
    """Học viên vai phụ mổ: đứng sai chỗ một lần, còn lại làm đúng."""
    s, clk = Session(SC[M5], case_id, "asst", "SV001"), Clock()
    w = bot_until_wait(s, clk)
    assert w["waiting"] and w["waiting_for_student"] == ["supine"]
    s.do("asst", "position_supine", None, {}, clk())
    bot_until_wait(s, clk)
    bad = s.do("asst", "take_position", "cam_spot", {"point": [-0.9, 1, 1.0]}, clk())
    assert bad["feedback"]["issue"]["kind"] == "wrong_position"
    s.do("asst", "take_position", "cam_spot", {"point": [0.7, 1, 0.9]}, clk())
    assert bot_until_wait(s, clk)["waiting_for_student"] == ["s2_explore"]
    s.do("asst", "explore_peritoneum", None, {}, clk())
    assert bot_until_wait(s, clk)["waiting_for_student"] == ["s5_suction"]
    s.do("asst", "suction", None, {}, clk())
    last = bot_until_wait(s, clk)
    assert last["finished"] and last["result"]["score"] == 96 and last["result"]["passed"]
    return s


def test_scenario_endpoints(client):
    pub = client.get("/api/scenarios").json()
    assert {s["id"] for s in pub} == ALL
    m5 = next(s for s in pub if s["id"] == M5)
    assert all("answer" not in st and "area" not in st for st in m5["steps"])
    full = client.get("/api/scenarios/full").json()
    m5f = next(s for s in full if s["id"] == M5)
    assert any("area" in st for st in m5f["steps"])                    # bộ chấm trong trình duyệt cần
    assert all("answer" not in q and "explain" not in q for q in m5f["quiz"])   # đáp án kiến thức chỉ ở máy chủ


def test_practice_submit_is_rescored_and_reported(client):
    st = start(client)
    s = play_m5_asst()
    r = client.post("/api/results", json={"token": st["token"], "log": s.log, "t_end": s.last_t,
                                          "quiz_answers": {"q1": 0, "q2": 1, "q3": 2, "q4": 1, "q5": 1}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"]["score"] == 96 and body["registration"] == st["registration"]
    assert body["quiz"]["correct"] == 4 and body["quiz"]["items"][2]["answer_text"].startswith("Động mạch")
    d = client.get(f"/api/session/{st['registration']}").json()
    assert d["case"] == "A" and d["quiz"]["correct"] == 4 and d["finished"]
    assert {p["id"] for p in d["phases"]} == {"preop", "check", "setup", "tech", "postop"}
    assert any(x["id"] == "pos_cam" and x["errors"] for x in d["steps"])
    assert not next(x for x in d["steps"] if x["id"] == "s6_drain")["required"]
    # nộp lại lần hai bị từ chối
    assert client.post("/api/results", json={"token": st["token"], "log": s.log}).status_code == 409


def test_started_session_visible_before_submit(client):
    st = start(client, learner="SV-dang-lam")
    ses = {x["registration"]: x for x in client.get("/api/sessions").json()}
    assert st["registration"] in ses and not ses[st["registration"]]["finished"]


def test_server_rejects_tampered_logs(client):
    s = play_m5_asst()
    # 1) sửa thao tác của ê kíp ảo
    log = json.loads(json.dumps(s.log))
    i = next(k for k, e in enumerate(log) if e["bot"])
    log[i]["action"] = "suction"
    st = start(client)
    r = client.post("/api/results", json={"token": st["token"], "log": log})
    assert r.status_code == 422 and "ê kíp ảo" in r.json()["detail"]
    # 2) học viên làm thay vai khác
    log = json.loads(json.dumps(s.log))
    j = next(k for k, e in enumerate(log) if e["bot"] and e["role"] != "asst")
    log[j]["bot"] = False
    st = start(client)
    assert client.post("/api/results", json={"token": st["token"], "log": log}).status_code == 422
    # 3) thời gian dài hơn thời lượng thực của buổi
    log = json.loads(json.dumps(s.log))
    for e in log:
        e["t"] = e["t"] * 1000
    st = start(client)
    r = client.post("/api/results", json={"token": st["token"], "log": log})
    assert r.status_code == 422 and "thời gian" in r.json()["detail"]
    # 4) token bị sửa (đổi vai)
    st = start(client)
    body, mac = st["token"].split(".")
    p = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    p["role"] = "ptv"
    forged = base64.urlsafe_b64encode(json.dumps(p).encode()).decode().rstrip("=") + "." + mac
    assert client.post("/api/results", json={"token": forged, "log": s.log}).status_code == 401


def test_replay_rejects_time_going_backwards():
    s = play_m5_asst()
    log = json.loads(json.dumps(s.log))
    log[5]["t"] = -1
    with pytest.raises(LogError):
        replay_log(SC[M5], "A", "asst", "SV001", log)


def test_offline_file_import_needs_no_token(client):
    s = play_m5_asst("A")
    f = {"scenario_id": M5, "learner": "SV-offline", "role": "asst", "case_id": "A", "started_at": "2026-10-10T08:00:00Z",
         "log": s.log, "t_end": s.last_t, "quiz_answers": {"q1": 0}}
    r = client.post("/api/results/import", json=f).json()
    d = client.get(f"/api/session/{r['registration']}").json()
    assert d["case"] == "A" and d["finished"] and r["result"] == s.finish(s.last_t)["result"]


def test_assessment_and_csv(client):
    st = start(client, sid="m2_sterile_basics", role="stu", case_id=None, learner="SV9")
    client.post("/api/results", json={"token": st["token"], "log": [], "t_end": 1})
    reg = st["registration"]
    assert client.post("/api/assessments", json={"registration": reg, "assessor": "GV A", "ratings": {"prep": 6}, "overall": "dat"}).status_code == 400
    a = client.post("/api/assessments", json={"registration": reg, "assessor": "GV A", "ratings": {"prep": 4, "safety": 2},
                                              "overall": "can_lam_lai", "comment": "Chưa rửa tay đủ"}).json()
    assert a["mean_rating"] == 3
    ses = client.get("/api/sessions").json()
    assert ses[0]["assessment"]["overall"] == "can_lam_lai"
    csv = client.get("/api/export.csv").text
    assert "can_lam_lai" in csv and "SV9 (stu)" in csv
    assert client.get("/session").status_code == 200


def test_bad_inputs(client):
    assert client.post("/api/run/start", json={"scenario_id": "m2_sterile_basics", "learner": "a", "role": "zzz"}).status_code == 400
    assert client.post("/api/run/start", json={"scenario_id": M5, "learner": "a", "role": "asst", "case_id": "Z"}).status_code == 400
    assert client.post("/api/run/start", json={"scenario_id": "nope", "learner": "a", "role": "asst"}).status_code == 404
    assert client.post("/api/results", json={"token": "abc.def", "log": []}).status_code == 401
