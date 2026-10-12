import json
from pathlib import Path

import pytest

from simcore import ScenarioError, load_all, load_scenario

ROOT = Path(__file__).resolve().parents[1]


def test_all_scenarios_load():
    sc = load_all(ROOT / "scenarios")
    assert set(sc) == {"m2_sterile_basics", "m3_safety_checklist", "m5_lap_appendectomy_ntp", "m6_emergency_undock"}
    for s in sc.values():
        assert s.approval_status == "draft"  # chưa được hội đồng chuyên môn duyệt


def _write(tmp_path, data):
    p = tmp_path / "x.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


BASE = {"id": "x", "version": "0", "module": 1, "title": "x", "roles": ["a"],
        "steps": [{"id": "s1", "title": "t", "roles": ["a"], "action": "go"}]}


def test_unknown_role_rejected(tmp_path):
    d = json.loads(json.dumps(BASE)); d["steps"][0]["roles"] = ["zzz"]
    with pytest.raises(ScenarioError, match="vai trò"):
        load_scenario(_write(tmp_path, d))


def test_cycle_rejected(tmp_path):
    d = json.loads(json.dumps(BASE))
    d["steps"] = [{"id": "a", "title": "a", "roles": ["a"], "action": "x", "after": ["b"]},
                  {"id": "b", "title": "b", "roles": ["a"], "action": "y", "after": ["a"]}]
    with pytest.raises(ScenarioError, match="vòng lặp"):
        load_scenario(_write(tmp_path, d))


def test_unknown_rule_state_rejected(tmp_path):
    d = json.loads(json.dumps(BASE)); d["rules"] = [{"id": "r", "action": "go", "if_state": "moon_full", "severity": "critical", "message": "m"}]
    with pytest.raises(ScenarioError, match="if_state"):
        load_scenario(_write(tmp_path, d))
