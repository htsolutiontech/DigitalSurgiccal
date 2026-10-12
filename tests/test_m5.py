"""Module 5: quy trình phẫu thuật nội soi cắt ruột thừa (BV Nguyễn Tri Phương)."""
from pathlib import Path

from simcore import Event, ScenarioEngine, load_all
from simcore.replay import M5_QUIZ_GOOD, expert_rows, run_script

SC = load_all(Path(__file__).resolve().parents[1] / "scenarios")["m5_lap_appendectomy_ntp"]


def ev(t, role, action, target=None, **data):
    return Event(t, f"u-{role}", role, action, target, data)


def test_case_dependent_required_steps():
    a, b = ScenarioEngine(SC, "A"), ScenarioEngine(SC, "B")
    assert "pre_ecg" not in a.required and "pre_ecg" in b.required          # ECG khi từ 40 tuổi
    for sid in ("s5_irrigate", "s5_decide", "s6_drain"):
        assert sid not in a.required and sid in b.required                  # viêm phúc mạc


def test_both_cases_expert_pass():
    for case in ("A", "B"):
        res = run_script(SC, "x", expert_rows(SC, case), case_id=case).result
        assert res.passed and res.score == 100 and res.case_id == case


def test_ecg_for_young_patient_is_allowed_without_penalty():
    e = ScenarioEngine(SC, "A")
    assert e.handle(ev(0, "res", "order_ecg")).step_completed == "pre_ecg" and not e.issues


def test_drain_not_indicated_in_uncomplicated_case():
    e = ScenarioEngine(SC, "A")
    fb = e.handle(ev(0, "ptv", "place_drain"))
    assert fb.issue.kind == "not_indicated" and "s6_drain" not in e.done


def test_wrong_decision_must_be_corrected():
    e = ScenarioEngine(SC, "B")
    assert e.handle(ev(0, "ptv", "assess_appendix", "acute_uncomplicated")).issue.kind == "wrong_decision"
    assert "s2_assess" not in e.done
    assert e.handle(ev(1, "ptv", "assess_appendix", "perforated_peritonitis")).step_completed == "s2_assess"


def test_team_position_checked_against_area():
    e = ScenarioEngine(SC, "A")
    assert e.handle(ev(0, "ptv", "take_position", "ptv_spot", point=[0, 1, -0.9])).issue.kind == "wrong_position"
    assert e.handle(ev(1, "ptv", "take_position", "ptv_spot", point=[-0.1, 1, 0.85])).step_completed == "pos_ptv"


def test_quiz_graded_separately():
    e = ScenarioEngine(SC, "B")
    g = e.grade_quiz(M5_QUIZ_GOOD)
    assert g["correct"] == g["total"] == 5 and g["score"] == 100
    assert e.grade_quiz({})["correct"] == 0


def test_every_step_has_phase_and_source():
    for s in SC.steps:
        assert s.phase and s.src, s.id


def test_cannot_close_before_irrigation_in_peritonitis():
    """Ca viêm phúc mạc: đóng trocar trước khi súc rửa và đánh giá là sai trình tự."""
    e = ScenarioEngine(SC, "B")
    for row in expert_rows(SC, "B"):
        if row[2] in ("irrigate", "decide_cleanliness", "place_drain"):
            continue
        if row[2] == "close_ports":
            fb = e.handle(ev(row[0], row[1], row[2], row[3], **row[4]))
            assert fb.issue and fb.issue.kind == "out_of_order"
            return
        e.handle(ev(row[0], row[1], row[2], row[3], **row[4]))
