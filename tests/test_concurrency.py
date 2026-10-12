"""Cả lớp nộp kết quả cùng lúc: ghi CSDL song song không được lỗi."""
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from simcore import load_all
from simcore.session import Session

SC = load_all("scenarios")


def test_parallel_submissions_do_not_lock_database(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "c.db"))
    from backend.app import app
    with TestClient(app) as c:
        def one(i):
            st = c.post("/api/run/start", json={"scenario_id": "m3_safety_checklist", "learner": f"T{i}", "role": "circ"}).json()
            s, t = Session(SC["m3_safety_checklist"], None, "circ", f"T{i}"), 0.0
            for _ in range(200):
                t += 0.01
                if s.result is not None:
                    break
                av = s.student_available()
                if av:
                    st_ = SC["m3_safety_checklist"].step(av[0])
                    s.do("circ", st_.action, st_.target or (st_.targets[0] if st_.targets else None), {}, t)
                else:
                    s.bot(t)
            r = c.post("/api/results", json={"token": st["token"], "log": s.log, "t_end": s.last_t})
            return r.status_code
        with ThreadPoolExecutor(24) as ex:
            codes = list(ex.map(one, range(24)))
        assert set(codes) == {200}, codes
        assert sum(1 for x in c.get("/api/sessions").json() if x["finished"]) == 24
