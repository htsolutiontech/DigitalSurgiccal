"""Bộ chấm trong trình duyệt (engine.js) và bộ chấm Python phải cho CÙNG kết quả trên cùng nhật ký thao tác.

Chạy engine.js trên Node để sinh hàng trăm buổi ngẫu nhiên (thị phạm và thực hành, làm đúng, làm sai,
sai thứ tự, vi phạm vô khuẩn, chọn sai, đứng sai chỗ...), rồi cho máy chủ Python chạy lại nhật ký và so
điểm, đạt/không đạt, từng lỗi (cả nội dung thông báo), trạng thái cuối, câu hỏi kiến thức.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from simcore import load_all
from simcore.session import public_scenario, replay_log

ROOT = Path(__file__).resolve().parents[1]
SC = load_all(ROOT / "scenarios")
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="cần Node.js để chạy engine.js")


@pytest.fixture(scope="module")
def runs():
    out = subprocess.run(["node", str(ROOT / "tests" / "parity_runner.js"), "60"], capture_output=True, text=True,
                         check=True, timeout=300).stdout
    return json.loads(out)


def test_enough_variety(runs):
    assert len(runs) == 60 * len(SC)
    kinds = {i["kind"] for r in runs for i in r["result"]["issues"]}
    assert {"out_of_order", "wrong_role", "unexpected", "sterile_breach", "too_close", "rule", "wrong_decision",
            "wrong_position", "insufficient_duration"} <= kinds
    assert any(r["result"]["passed"] for r in runs) and any(not r["result"]["passed"] for r in runs)


def test_python_replay_matches_browser_engine(runs):
    bad = []
    for r in runs:
        sc = SC[r["scenario_id"]]
        s = replay_log(sc, r["case_id"], r["role"], r["learner"], r["log"], r["t_end"])
        py = s.finish(r["t_end"])
        if py["result"] != r["result"]:
            bad.append((r["scenario_id"], r["role"], "result", py["result"], r["result"]))
        elif py != r["state"]:
            bad.append((r["scenario_id"], r["role"], "state"))
        if sc.quiz and s.grade_quiz(r["quiz_answers"]) != r["quiz"]:
            bad.append((r["scenario_id"], "quiz"))
        if public_scenario(sc, r["case_id"], r["role"] is None) != r["public"]:
            bad.append((r["scenario_id"], "public"))
    assert not bad, bad[:3]
