"""Các ê kíp "giả lập" chạy kịch bản để kiểm thử và để tạo dữ liệu mẫu cho bảng điều khiển giảng viên.

Mỗi kịch bản có một ê kíp làm đúng (expert) và các ê kíp có lỗi điển hình. Đây là dữ liệu tổng hợp,
không phải dữ liệu học viên thật.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from .engine import Event, Result, ScenarioEngine
from .scenario import Scenario
from .xapi import StatementBuilder, actor

Row = tuple  # (t, role, action, target, data)


@dataclass
class RunOutput:
    team_id: str
    result: Result
    statements: list[dict]
    feedback_log: list[tuple[float, str, str]]


def run_script(sc: Scenario, team_id: str, rows: list[Row], end_t: Optional[float] = None,
               start: Optional[datetime] = None, case_id: Optional[str] = None,
               quiz: Optional[dict] = None) -> RunOutput:
    eng = ScenarioEngine(sc, case_id)
    sb = StatementBuilder(sc, team_id, start=start or datetime(2026, 10, 5, 8, 0, tzinfo=timezone.utc),
                          case_id=(eng.case or {}).get("id"))
    members = {r: actor(f"{team_id}-{r}") for r in sc.roles}
    stmts = [sb.initialized(members[r], r) for r in sc.roles]
    log = []
    for t, role, action, target, data in sorted(rows, key=lambda r: r[0]):
        ev = Event(t=t, actor=f"{team_id}-{role}", role=role, action=action, target=target, data=data or {})
        fb = eng.handle(ev)
        log.append((t, role, fb.message))
        stmts += sb.from_event(members[role], ev, fb)
    res = eng.terminate(end_t)
    team = {"objectType": "Group", "name": team_id, "member": list(members.values())}
    if quiz is not None and sc.quiz:
        stmts += sb.quiz(team, eng.grade_quiz(quiz), res.duration_s)
    stmts += sb.finished(team, res)
    return RunOutput(team_id, res, stmts, log)


def area_center(a) -> list:
    return [(a[0] + a[2]) / 2, 1.0, (a[1] + a[3]) / 2]


def expert_rows(sc: Scenario, case_id: Optional[str] = None, dt: float = 20.0) -> list[Row]:
    """Sinh chuỗi thao tác đúng: duyệt các bước bắt buộc theo thứ tự phụ thuộc."""
    eng = ScenarioEngine(sc, case_id)
    rows: list[Row] = []
    done: set[str] = set()
    t = 0.0
    pending = [s for s in sc.steps if s.id in eng.required]
    while pending:
        for s in pending:
            if all(a in done or a not in eng.required for a in s.after):
                break
        else:
            raise ValueError("kịch bản có bước không thể hoàn thành")
        pending.remove(s)
        data = {}
        if s.min_duration_s:
            data["duration_s"] = s.min_duration_s + 30
        if s.area:
            data["point"] = area_center(s.area)
        targets = list(s.targets) or [eng.correct_answer(s) if s.decision else s.target]
        for tg in targets:
            rows.append((t, s.roles[0], s.action, tg, data))
            t += dt
        done.add(s.id)
    return rows


# ---------------- Module 5: nội soi cắt ruột thừa (BV Nguyễn Tri Phương) ----------------
def m5_novice_rows(sc: Scenario) -> list[Row]:
    """Ca B, nhiều lỗi điển hình: quên điện tâm đồ, đứng sai vị trí, đánh giá sai, quên rửa, quên đếm gạc."""
    rows = []
    for t, role, action, target, data in expert_rows(sc, "B"):
        if action in ("order_ecg", "irrigate", "count_items"):
            continue
        if action == "take_position" and target == "cam_spot":
            rows.append((t - 1, role, action, target, {"point": [-0.9, 1.0, 1.0]}))   # đứng phía đầu, sai
        if action == "assess_appendix":
            rows.append((t - 1, role, action, "acute_uncomplicated", data))           # đánh giá sai
        rows.append((t, role, action, target, data))
    return rows


# ---------------- Module 6: tháo robot khẩn cấp ----------------
M6_EXPERT: list[Row] = [
    (0, "ptv", "announce_emergency", None, None),
    (3, "anes", "acknowledge", None, None),
    (4, "circ", "call_help", None, None),
    (6, "scrub", "open_laparotomy_tray", None, None),
    (8, "asst", "remove_instrument", "arm1", None),
    (14, "asst", "remove_instrument", "arm2", None),
    (20, "asst", "remove_instrument", "arm3", None),
    (26, "asst", "remove_camera", None, None),
    (30, "ptv", "scrub_in", None, None),
    (34, "asst", "undock_arm", "arm1", None),
    (40, "scrub", "undock_arm", "arm2", None),
    (46, "asst", "undock_arm", "arm3", None),
    (52, "scrub", "undock_arm", "camera", None),
    (60, "circ", "move_cart_away", None, None),
    (75, "ptv", "start_laparotomy", None, None),
]

M6_INTERMEDIATE: list[Row] = [
    (0, "ptv", "announce_emergency", None, None),
    (5, "anes", "acknowledge", None, None),
    (9, "circ", "call_help", None, None),
    (12, "asst", "remove_instrument", "arm1", None),
    (20, "asst", "remove_instrument", "arm2", None),
    (29, "asst", "remove_instrument", "arm3", None),
    (36, "circ", "remove_camera", None, None),          # sai vai trò
    (40, "asst", "remove_camera", None, None),
    (48, "asst", "undock_arm", "arm1", None),
    (57, "asst", "undock_arm", "arm2", None),
    (66, "asst", "undock_arm", "arm3", None),
    (74, "asst", "undock_arm", "camera", None),
    (80, "circ", "move_cart_away", None, None),
    (85, "scrub", "open_laparotomy_tray", None, None),
    (95, "ptv", "scrub_in", None, None),
    (130, "ptv", "start_laparotomy", None, None),
]

M6_NOVICE: list[Row] = [
    (0, "ptv", "announce_emergency", None, None),
    (10, "anes", "acknowledge", None, None),
    (25, "anes", "move_table", None, None),             # đổi tư thế bàn khi còn gắn robot
    (40, "asst", "undock_arm", "arm1", None),           # tháo tay khi dụng cụ còn trong ổ bụng
    (60, "asst", "remove_instrument", "arm1", None),
    (80, "asst", "remove_instrument", "arm2", None),
    (100, "asst", "remove_instrument", "arm3", None),
    (130, "asst", "remove_camera", None, None),
    (150, "asst", "undock_arm", "arm1", None),
    (170, "asst", "undock_arm", "arm2", None),
    (190, "asst", "undock_arm", "arm3", None),
    (215, "asst", "undock_arm", "camera", None),
    (240, "circ", "move_cart_away", None, None),
    (250, "scrub", "open_laparotomy_tray", None, None),
    (270, "ptv", "scrub_in", None, None),
    (330, "ptv", "start_laparotomy", None, None),       # quá giờ; chưa gọi hỗ trợ (call_help)
]

# ---------------- Module 3: bảng kiểm an toàn ----------------
_SI = ["si_identity", "si_site", "si_machine", "si_oximeter", "si_allergy", "si_airway", "si_blood"]
_TO = [("to_intro", "circ"), ("to_patient", "circ"), ("to_antibiotic", "anes"), ("to_surgeon", "ptv"),
       ("to_anes", "anes"), ("to_nursing", "scrub"), ("to_imaging", "circ")]
_SO = [("so_procedure", "circ"), ("so_counts", "scrub"), ("so_specimen", "circ"), ("so_equipment", "circ"), ("so_recovery", "ptv")]

M3_EXPERT: list[Row] = (
    [(i * 10, "anes", "confirm", s, None) for i, s in enumerate(_SI)]
    + [(80, "anes", "induce_anesthesia", None, None)]
    + [(300 + i * 15, r, "confirm", s, None) for i, (s, r) in enumerate(_TO)]
    + [(420, "ptv", "incise", None, None)]
    + [(2400 + i * 20, r, "confirm", s, None) for i, (s, r) in enumerate(_SO)]
    + [(2520, "anes", "transfer_out", None, None)]
)

M3_NOVICE: list[Row] = (
    [(i * 10, "anes", "confirm", s, None) for i, s in enumerate(_SI) if s != "si_allergy"]
    + [(70, "anes", "induce_anesthesia", None, None)]                       # khởi mê khi chưa hỏi dị ứng
    + [(300, "circ", "confirm", "to_patient", None), (315, "ptv", "confirm", "to_surgeon", None),
       (330, "scrub", "confirm", "to_nursing", None)]
    + [(340, "ptv", "incise", None, None)]                                  # rạch da trước khi xác nhận kháng sinh
    + [(350, "anes", "confirm", "to_antibiotic", None)]
    + [(2400, "circ", "confirm", "so_procedure", None), (2420, "circ", "confirm", "so_specimen", None)]
    + [(2440, "anes", "transfer_out", None, None)]                          # chưa đếm dụng cụ, gạc, kim
)

# ---------------- Module 2: vô khuẩn ----------------
M2_EXPERT: list[Row] = [
    (0, "stu", "hand_scrub", None, {"duration_s": 150}),
    (160, "stu", "don_gown", None, None),
    (200, "stu", "don_gloves", None, None),
    (230, "stu", "position", None, {"point": [0.6, 1.0, 1.4], "is_gowned": True}),
    (240, "stu", "take_position", None, None),
]

M2_NOVICE: list[Row] = [
    (0, "stu", "hand_scrub", None, {"duration_s": 60}),                     # rửa tay chưa đủ thời gian
    (70, "stu", "hand_scrub", None, {"duration_s": 130}),
    (210, "stu", "position", None, {"point": [1.6, 1.0, 0.8], "is_gowned": False}),   # đứng quá gần bàn dụng cụ
    (215, "stu", "contact", None, {"point": [1.5, 1.0, 1.2], "is_sterile": False}),   # chạm bàn dụng cụ khi chưa vô khuẩn
    (230, "stu", "don_gown", None, None),
    (260, "stu", "don_gloves", None, None),
    (290, "stu", "take_position", None, None),
]

TEAMS = {
    "m5_lap_appendectomy_ntp": {"Nhóm SV 1 (ca A)": ("A", None), "Nhóm SV 2 (ca B)": ("B", None), "Nhóm SV 3 (ca B)": ("B", "novice")},
    "m6_emergency_undock": {"Ê kíp A": M6_EXPERT, "Ê kíp B": M6_INTERMEDIATE, "Ê kíp C": M6_NOVICE},
    "m3_safety_checklist": {"Ê kíp A": M3_EXPERT, "Ê kíp D": M3_NOVICE},
    "m2_sterile_basics": {"SV 01": M2_EXPERT, "SV 02": M2_NOVICE},
}


M5_QUIZ_GOOD = {"q1": 0, "q2": 1, "q3": 1, "q4": 1, "q5": 1}
M5_QUIZ_WEAK = {"q1": 2, "q2": 1, "q3": 0, "q4": 1, "q5": 3}


def team_run(scenarios: dict, sid: str, team: str, spec) -> RunOutput:
    """Chạy một ê kíp mẫu; m5 sinh thao tác từ kịch bản theo ca bệnh."""
    sc = scenarios[sid]
    if isinstance(spec, tuple):
        case_id, kind = spec
        rows = m5_novice_rows(sc) if kind == "novice" else expert_rows(sc, case_id)
        return run_script(sc, team, rows, case_id=case_id, quiz=M5_QUIZ_WEAK if kind == "novice" else M5_QUIZ_GOOD)
    return run_script(sc, team, spec)
