from pathlib import Path

import pytest

from simcore import CRITICAL, Event, ScenarioEngine, load_all
from simcore.replay import TEAMS, run_script, team_run

SC = load_all(Path(__file__).resolve().parents[1] / "scenarios")


def ev(t, role, action, target=None, **data):
    return Event(t, f"u-{role}", role, action, target, data)


@pytest.mark.parametrize("sid", list(TEAMS))
def test_expert_team_passes_with_full_score(sid):
    team, spec = next(iter(TEAMS[sid].items()))
    res = team_run(SC, sid, team, spec).result
    assert res.passed and res.score == 100 and not res.issues and not res.missed_critical


def test_m6_novice_fails_for_the_right_reasons():
    res = run_script(SC["m6_emergency_undock"], "C", TEAMS["m6_emergency_undock"]["Ê kíp C"]).result
    refs = {i.ref for i in res.issues if i.severity == CRITICAL}
    assert refs == {"table_move_while_docked", "undock_with_instrument"}
    assert res.missed_critical == ["call_help"]
    assert not res.passed
    # 100 - 25 (bỏ sót) - 2*20 (lỗi nguy hiểm) - 3*2 (quá 30 giây) = 29
    assert res.score == 29


def test_wrong_role_does_not_complete_step():
    e = ScenarioEngine(SC["m6_emergency_undock"])
    e.handle(ev(0, "ptv", "announce_emergency"))
    for i, a in enumerate(["arm1", "arm2", "arm3"]):
        e.handle(ev(1 + i, "asst", "remove_instrument", a))
    fb = e.handle(ev(5, "circ", "remove_camera"))
    assert fb.issue.kind == "wrong_role" and "remove_camera" not in e.done
    assert e.handle(ev(6, "asst", "remove_camera")).step_completed == "remove_camera"


def test_dangerous_action_is_blocked_and_has_no_effect():
    e = ScenarioEngine(SC["m6_emergency_undock"])
    fb = e.handle(ev(0, "asst", "undock_arm", "arm1"))
    assert fb.issue.severity == CRITICAL and "arm1" in e.docked


def test_multi_target_step_needs_all_targets():
    e = ScenarioEngine(SC["m6_emergency_undock"])
    e.handle(ev(0, "ptv", "announce_emergency"))
    e.handle(ev(1, "asst", "remove_instrument", "arm1"))
    e.handle(ev(2, "asst", "remove_instrument", "arm2"))
    assert "remove_instruments" not in e.done
    assert e.handle(ev(3, "asst", "remove_instrument", "arm3")).step_completed == "remove_instruments"


def test_out_of_order_is_recorded_but_step_counts():
    e = ScenarioEngine(SC["m3_safety_checklist"])
    fb = e.handle(ev(0, "anes", "induce_anesthesia"))
    assert fb.issue.kind == "out_of_order" and "induction" in e.done


def test_hand_scrub_too_short_must_be_repeated():
    e = ScenarioEngine(SC["m2_sterile_basics"])
    assert e.handle(ev(0, "stu", "hand_scrub", duration_s=60)).issue.kind == "insufficient_duration"
    assert e.handle(ev(70, "stu", "hand_scrub", duration_s=130)).step_completed == "hand_scrub"


def test_events_after_finish_are_ignored():
    e = ScenarioEngine(SC["m2_sterile_basics"])
    for r in TEAMS["m2_sterile_basics"]["SV 01"]:
        e.handle(ev(r[0], r[1], r[2], r[3], **(r[4] or {})))
    assert e.finished
    assert not e.handle(ev(999, "stu", "contact", point=[1.5, 1.0, 1.2], is_sterile=False)).ok
    assert not e.issues
