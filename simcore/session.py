"""Một buổi mô phỏng: bộ chấm + ê kíp ảo + nhật ký thao tác (bản tham chiếu Python).

Bản 0.6 chạy buổi mô phỏng NGAY TRONG TRÌNH DUYỆT (backend/static/sim/engine.js là bản dịch 1-1 của
tệp này và của engine.py). Trình duyệt ghi nhật ký thao tác; khi kết thúc, máy chủ dùng replay_log()
chạy lại nhật ký bằng bộ chấm Python để ra điểm chính thức, nên máy chủ không cần giữ phiên trong bộ
nhớ (chạy được trên Vercel, nhiều tiến trình, khởi động lại không mất buổi).

tests/test_parity.py chạy hàng trăm buổi ngẫu nhiên bằng engine.js trên Node rồi so với tệp này.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from .engine import Event, Feedback, Result, ScenarioEngine
from .scenario import Scenario
from .xapi import actor

FREE_ACTIONS = ("position", "contact")          # học viên làm được ở mọi vai (đi lại, chạm)
MAX_LOG = 2000


class LogError(ValueError):
    """Nhật ký thao tác không hợp lệ (bị sửa, sai thứ tự thời gian, ê kíp ảo làm sai...)."""


def area_center(a) -> list:
    return [(a[0] + a[2]) / 2, 1.0, (a[1] + a[3]) / 2]


def public_scenario(sc: Scenario, case_id: Optional[str] = None, reveal: bool = False) -> dict:
    """Thông tin kịch bản cho giao diện. reveal=True (thị phạm) thì kèm đáp án và vùng đứng."""
    eng = ScenarioEngine(sc, case_id)
    steps = []
    for s in sc.steps:
        d = {"id": s.id, "title": s.title, "roles": list(s.roles), "action": s.action, "after": list(s.after),
             "critical": s.critical, "target": s.target, "targets": list(s.targets), "min_duration_s": s.min_duration_s,
             "phase": s.phase, "note": s.note, "src": s.src, "required": s.id in eng.required,
             "conditional": bool(s.required_if or s.indicated_if), "area_label": s.area_label, "has_area": bool(s.area)}
        if s.decision:
            d["options"] = s.decision["options"]
            if reveal:
                d["answer"] = eng.correct_answer(s)
        if reveal and s.area:
            d["area"] = list(s.area)
        steps.append(d)
    return {
        "id": sc.id, "version": sc.version, "module": sc.module, "title": sc.title, "roles": list(sc.roles),
        "time_limit_s": sc.time_limit_s, "approval_status": sc.approval_status, "initial_state": sc.initial_state,
        "min_observer_distance_m": sc.min_observer_distance_m, "source": sc.source,
        "zones": [{"id": z.id, "label": z.label, "min": list(z.min), "max": list(z.max)} for z in sc.zones],
        "rules": [{"id": r.id, "action": r.action, "message": r.message} for r in sc.rules],
        "phases": list(sc.phases), "rubric": list(sc.rubric),
        "cases": [{"id": c["id"], "title": c["title"], "summary": c.get("summary")} for c in sc.cases],
        "case": None if not eng.case else {"id": eng.case["id"], "title": eng.case["title"], "summary": eng.case.get("summary"),
                                          "visual": eng.case.get("visual", {})},
        "quiz": [{"id": q["id"], "q": q["q"], "options": q["options"]} for q in sc.quiz],
        "steps": steps,
    }


def issue_json(i) -> dict:
    return {"t": i.t, "kind": i.kind, "severity": i.severity, "message": i.message, "role": i.role, "ref": i.ref}


def result_json(r: Result) -> dict:
    return {"score": r.score, "passed": r.passed, "duration_s": r.duration_s, "missed_critical": r.missed_critical,
            "critical_errors": r.critical_errors, "case_id": r.case_id, "issues": [issue_json(i) for i in r.issues]}


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def clean_data(data: Any) -> dict:
    """Chỉ giữ các trường dữ liệu bộ chấm dùng, đúng kiểu."""
    out: dict = {}
    if not isinstance(data, dict):
        return out
    p = data.get("point")
    if isinstance(p, (list, tuple)) and len(p) == 3 and all(_num(x) for x in p):
        out["point"] = [float(x) for x in p]
    if _num(data.get("duration_s")):
        out["duration_s"] = float(data["duration_s"])
    for k in ("is_sterile", "is_gowned"):
        if isinstance(data.get(k), bool):
            out[k] = data[k]
    return out


class Session:
    def __init__(self, sc: Scenario, case_id: Optional[str] = None, role: Optional[str] = None,
                 learner: str = "GV", team: Optional[str] = None):
        if role is not None and role not in sc.roles:
            raise ValueError(f"Vai trò phải thuộc {list(sc.roles)}")
        self.sc = sc
        self.engine = ScenarioEngine(sc, case_id)          # KeyError nếu không có ca bệnh
        self.case_id = (self.engine.case or {}).get("id")
        self.role = role
        self.learner = learner
        self.team = team or (f"{learner} ({role})" if role else f"Thị phạm {learner}")
        self.log: list[dict] = []
        self.events: list[tuple[Event, Feedback]] = []
        self.result: Optional[Result] = None
        self.last_t = 0.0

    # ---------- định danh ----------
    def who(self, role: str) -> str:
        return self.learner if role == self.role else f"{self.team}-ekip-ao-{role}"

    def member(self, role: str) -> dict:
        return actor(self.who(role))

    def group(self) -> dict:
        return {"objectType": "Group", "name": self.team, "member": [self.member(r) for r in self.sc.roles]}

    # ---------- trạng thái ----------
    def _ready(self, s) -> bool:
        e = self.engine
        return s.id not in e.done and s.id in e.required and all(a in e.done or a not in e.required for a in s.after)

    def student_available(self) -> list[str]:
        if not self.role:
            return []
        return [s.id for s in self.sc.steps if self._ready(s) and self.role in s.roles]

    def state(self, t: float) -> dict:
        e = self.engine
        steps = []
        for s in e.sc.steps:
            got = e.partial.get(s.id, set())
            steps.append({"id": s.id, "done": s.id in e.done, "progress": len(got) if s.targets else int(s.id in e.done),
                          "total": len(s.targets) or 1, "done_targets": sorted(got),
                          "done_by": e.done[s.id][2] if s.id in e.done else None, "t": e.done[s.id][0] if s.id in e.done else None})
        return {"t": t, "finished": e.finished or self.result is not None, "steps": steps,
                "world": {"docked": sorted(e.docked), "instruments_in": sorted(e.instruments_in), "camera_in": e.camera_in,
                          "cart_at_table": e.cart_at_table},
                "issues": [issue_json(i) for i in e.issues], "waiting_for_student": self.student_available()}

    # ---------- ê kíp ảo ----------
    def bot_next(self):
        """Bước ê kíp ảo làm tiếp: bước bắt buộc, đủ điều kiện trước, không thuộc vai của học viên."""
        e = self.engine
        for s in self.sc.steps:
            if not self._ready(s) or (self.role and self.role in s.roles):
                continue
            role = s.roles[0]
            target = s.target
            if s.targets:
                target = next(t for t in s.targets if t not in e.partial.get(s.id, set()))
            if s.decision:
                target = e.correct_answer(s)
            data: dict[str, Any] = {}
            if s.min_duration_s:
                data["duration_s"] = s.min_duration_s + 30
            if s.area:
                data["point"] = area_center(s.area)
            return s, role, target, data
        return None

    # ---------- thao tác ----------
    def _t(self, t: float) -> float:
        t = round(float(t), 2)
        self.last_t = max(self.last_t, t)
        return self.last_t

    def do(self, role: str, action: str, target: Optional[str], data: dict, t: float, bot: bool = False) -> dict:
        t = self._t(t)
        data = clean_data(data)
        ev = Event(t=t, actor=self.who(role), role=role, action=action, target=target, data=data)
        fb = self.engine.handle(ev)
        self.log.append({"t": t, "role": role, "action": action, "target": target, "data": data, "bot": bot})
        self.events.append((ev, fb))
        res = None
        if self.engine.finished and self.result is None:
            res = self.result = self.engine.terminate(t)
        step = self.sc.step(fb.step_completed) if fb.step_completed else None
        out = {"feedback": {"ok": fb.ok, "message": fb.message, "step_completed": fb.step_completed,
                            "note": step.note if step else None, "src": step.src if step else None,
                            "issue": None if not fb.issue else {"kind": fb.issue.kind, "severity": fb.issue.severity,
                                                                "message": fb.issue.message, "ref": fb.issue.ref}},
               "action": {"role": role, "action": action, "target": target}, **self.state(t)}
        if res:
            out["result"] = result_json(res)
        return out

    def bot(self, t: float) -> dict:
        if self.result is not None:
            return {"idle": True, **self.state(self._t(t)), "result": result_json(self.result)}
        n = self.bot_next()
        if not n:
            return {"idle": True, "waiting": bool(self.student_available()), **self.state(self._t(t))}
        s, role, target, data = n
        out = self.do(role, s.action, target, data, t, bot=True)
        out["bot"] = {"step": s.id, "title": s.title, "role": role, "target": target,
                      "point": data.get("point"), "option": (s.decision or {}).get("options", {}).get(target)}
        return out

    def finish(self, t: float) -> dict:
        t = self._t(t)
        if self.result is None:
            self.result = self.engine.terminate(t)
        return {"result": result_json(self.result), **self.state(t)}

    def grade_quiz(self, answers: dict) -> dict:
        graded = self.engine.grade_quiz({k: v for k, v in (answers or {}).items()
                                          if isinstance(v, int) and not isinstance(v, bool)})
        qmap = {q["id"]: q for q in self.sc.quiz}
        for it in graded["items"]:
            it["answer_text"] = qmap[it["id"]]["options"][it["answer"]]
        return graded


def replay_log(sc: Scenario, case_id: Optional[str], role: Optional[str], learner: str,
               log: list, t_end: Optional[float] = None, max_t: Optional[float] = None, finish: bool = True) -> Session:
    """Chạy lại nhật ký từ trình duyệt bằng bộ chấm Python. Thao tác của ê kíp ảo phải đúng như ê kíp ảo
    của máy chủ sẽ làm; thao tác của học viên chỉ thuộc vai đã chọn (trừ đi lại và chạm)."""
    if not isinstance(log, list) or len(log) > MAX_LOG:
        raise LogError("Nhật ký thao tác sai định dạng hoặc quá dài")
    s = Session(sc, case_id, role, learner)
    last = 0.0
    for i, e in enumerate(log):
        if not isinstance(e, dict):
            raise LogError(f"Thao tác {i}: sai định dạng")
        t, r, a, tg = e.get("t"), e.get("role"), e.get("action"), e.get("target")
        if not _num(t) or t < last - 1e-9 or t < 0:
            raise LogError(f"Thao tác {i}: thời gian không hợp lệ")
        if max_t is not None and t > max_t:
            raise LogError(f"Thao tác {i}: thời gian vượt quá thời lượng buổi")
        if r not in sc.roles or not isinstance(a, str) or not (tg is None or isinstance(tg, str)):
            raise LogError(f"Thao tác {i}: vai hoặc hành động không hợp lệ")
        if s.result is not None:
            raise LogError(f"Thao tác {i}: buổi đã kết thúc trước thao tác này")
        last = t
        if e.get("bot"):
            n = s.bot_next()
            if not n:
                raise LogError(f"Thao tác {i}: ê kíp ảo không có bước nào để làm")
            step, br, btg, bdata = n
            if (br, step.action, btg) != (r, a, tg):
                raise LogError(f"Thao tác {i}: ê kíp ảo làm khác quy trình")
            s.do(br, step.action, btg, bdata, t, bot=True)
        else:
            if role is None:
                raise LogError("Buổi thị phạm không có thao tác của học viên")
            if r != role and a not in FREE_ACTIONS:
                raise LogError(f"Thao tác {i}: học viên làm việc của vai khác")
            s.do(r, a, tg, e.get("data") or {}, t)
    end = max(last, t_end if _num(t_end) else last)
    if max_t is not None:
        end = min(end, max_t)
    if finish:
        s.finish(end)
    return s


def progress_snapshot(s: Session) -> dict:
    """Tiến độ của buổi đang làm (cho trang Theo dõi trực tiếp của giảng viên). Không chấm điểm cuối."""
    e, sc = s.engine, s.sc
    req = [st for st in sc.steps if st.id in e.required]
    ready = [st for st in sc.steps if s._ready(st)]
    phases = {p["id"]: p["title"] for p in (sc.phases or [])}
    issues = [issue_json(i) for i in e.issues]
    return {
        "t": round(s.last_t, 1),
        "done": sum(1 for st in req if st.id in e.done), "required": len(req),
        "phase": phases.get(ready[0].phase) if ready else None,
        "current": [{"id": st.id, "title": st.title, "roles": list(st.roles)} for st in ready[:3]],
        "waiting_for_student": [sc.step(x).title for x in s.student_available()],
        "issues": len(issues),
        "critical": sum(1 for i in issues if i["severity"] == "critical"),
        "major": sum(1 for i in issues if i["severity"] == "major"),
        "last_issues": issues[-5:],
        "finished": s.result is not None or e.finished,
    }
