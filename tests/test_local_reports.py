"""Bảng điều khiển giảng viên bản tĩnh (GitHub Pages) phải cho CÙNG báo cáo với bản máy chủ.

Sinh hàng trăm buổi thực hành ngẫu nhiên bằng engine.js, đóng thành tệp kết quả như sinh viên tải về, rồi:
- máy chủ Python: nhập tệp (/api/results/import) và đọc báo cáo (/api/session, /api/summary, /api/export.csv);
- trình duyệt (local_reports.js trên Node): chấm lại cùng tệp đó.
So từng trường: điểm, đạt, lỗi, dòng thời gian, từng bước, giai đoạn, câu hỏi, tổng hợp, CSV. Tệp bị sửa phải bị
cả hai bên từ chối.
"""
import csv
import io
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="cần Node.js")

KEYS = ["scenario", "scenario_title", "team", "module", "case", "case_title", "finished", "passed", "score", "duration",
        "missed_critical", "critical_errors", "quiz", "timeline", "steps", "phases", "quiz_items", "case_summary", "rubric",
        "source"]


def norm(d):
    out = {k: d[k] for k in KEYS}
    out["errors"] = [{k: v for k, v in e.items() if k != "at"} for e in d["errors"]]
    return out


def make_files():
    runs = json.loads(subprocess.run(["node", str(ROOT / "tests" / "parity_runner.js"), "40"], capture_output=True,
                                     text=True, check=True, timeout=300).stdout)
    files = []
    for k, r in enumerate(x for x in runs if x["role"]):
        # phần nghìn giây khác nhau để có cả mốc thời gian tròn giây (từng làm sai thứ tự dòng thời gian)
        files.append({"format": "robo-or-sim-result/1", "scenario_id": r["scenario_id"], "case_id": r["case_id"], "role": r["role"],
                      "learner": r["learner"], "started_at": f"2026-10-10T08:{k % 60:02d}:00.{(k * 37) % 1000:03d}Z",
                      "log": r["log"], "t_end": r["t_end"], "quiz_answers": r["quiz_answers"],
                      "client_result": {"score": 100, "passed": True}})          # điểm ghi sẵn: phải bị bỏ qua
    return files


def tampered(files):
    out = []
    a = json.loads(json.dumps(next(f for f in files if len(f["log"]) > 3)))
    a["log"][2]["t"] = -1                                              # thời gian âm
    out.append(a)
    b = json.loads(json.dumps(next(f for f in files if any(e["bot"] for e in f["log"]))))
    i = next(i for i, e in enumerate(b["log"]) if e["bot"])
    b["log"][i]["action"] = "khong_co_hanh_dong_nay"                    # ê kíp ảo làm khác quy trình
    out.append(b)
    c = json.loads(json.dumps(next(f for f in files if f["role"] != "stu" and f["log"])))
    other = next(x for x in ["stu", "asst", "scrub", "circ", "ptv", "anes"] if x != c["role"])
    c["log"].append({"t": c["log"][-1]["t"] + 1, "role": c["role"], "action": "x", "target": None, "data": {}, "bot": False})
    c["log"][-1]["role"] = other                                       # làm việc của vai khác (hoặc vai không có)
    out.append(c)
    d = json.loads(json.dumps(files[0]))
    d["format"] = "khac"                     # không phải tệp kết quả: trang bảng điều khiển (cả hai bản) từ chối
    out.append(d)
    return out


@pytest.fixture(scope="module")
def both(tmp_path_factory):
    files = make_files()
    bad = tampered(files)
    p = tmp_path_factory.mktemp("lr") / "files.json"
    p.write_text(json.dumps(files + bad), encoding="utf-8")
    js = json.loads(subprocess.run(["node", str(ROOT / "tests" / "local_reports_runner.js"), str(p)], capture_output=True,
                                   text=True, check=True, timeout=300).stdout)
    import os
    os.environ["ROBO_DB"] = str(tmp_path_factory.mktemp("db") / "lr.db")
    from backend.app import app
    py = []
    with TestClient(app) as c:
        for f in files + bad[:3]:
            r = c.post("/api/results/import", json=f)
            py.append(c.get(f"/api/session/{r.json()['registration']}").json() if r.status_code == 200 else {"_status": r.status_code})
        py_summary, py_m5 = c.get("/api/summary").json(), c.get("/api/summary?scenario=m5_lap_appendectomy_ntp").json()
        py_csv = c.get("/api/export.csv").text
    os.environ.pop("ROBO_DB", None)
    py.append({"_status": "không gửi"})     # tệp sai định dạng: trang đã chặn trước khi gửi
    return files, bad, js, py, py_summary, py_m5, py_csv


def test_variety(both):
    files, _, js, *_ = both
    assert len(files) >= 100
    items = [x["detail"] for x in js["items"][:len(files)] if x["ok"]]
    assert any(d["passed"] for d in items) and any(not d["passed"] for d in items)
    assert any(d["quiz_items"] for d in items) and any(d["errors"] for d in items)


def test_every_file_scores_the_same(both):
    files, _, js, py, *_ = both
    diff = []
    for i, f in enumerate(files):
        j, p = js["items"][i], py[i]
        if not j["ok"] or "_status" in p:
            diff.append((i, "nhập", j.get("error"), p.get("_status")))
        elif norm(j["detail"]) != norm(p):
            a, b = norm(j["detail"]), norm(p)
            diff.append((i, f["scenario_id"], [k for k in a if a[k] != b[k]]))
    assert not diff, diff[:3]


def test_tampered_files_rejected_by_both(both):
    files, bad, js, py, *_ = both
    for k in range(len(bad)):
        assert not js["items"][len(files) + k]["ok"]
    for k in range(3):                       # nhật ký bị sửa: máy chủ cũng từ chối
        assert py[len(files) + k].get("_status") in (400, 404, 422)


def test_summary_and_csv_match(both):
    _, _, js, _, py_summary, py_m5, py_csv = both
    assert js["summary"] == py_summary
    assert js["summary_m5"] == py_m5
    rows = lambda text: sorted(tuple(r[2:]) for r in list(csv.reader(io.StringIO(text.lstrip("﻿"))))[1:])
    assert rows(js["csv"]) == rows(py_csv)
