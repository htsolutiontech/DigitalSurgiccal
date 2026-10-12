"""Bộ máy kịch bản: nhận sự kiện hành động của học viên, chấm trình tự, vai trò, luật an toàn,
vô khuẩn, rồi tính điểm.

Thiết kế xác định (deterministic): cùng chuỗi sự kiện luôn cho cùng kết quả. Bản C++ trong ue5/
cài đặt đúng logic này; tests/ trong Python là bộ kiểm thử tham chiếu cho cả hai.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from .scenario import Scenario, Step, eval_cond
from .sterile import SterileField

# Mức độ lỗi
CRITICAL = "critical"   # nguy hiểm cho người bệnh, trượt bài nếu fail_on_any_critical_error
MAJOR = "major"         # sai trình tự
MINOR = "minor"         # sai vai trò, cảnh báo


@dataclass
class Event:
    t: float                     # giây tính từ lúc bắt đầu buổi
    actor: str                   # mã học viên
    role: str                    # vai trò đang đóng trong ca
    action: str
    target: Optional[str] = None
    data: dict = field(default_factory=dict)


@dataclass
class Issue:
    t: float
    kind: str        # out_of_order | wrong_role | rule | insufficient_duration | sterile_breach | too_close | unexpected
    severity: str
    message: str
    actor: str
    role: str
    ref: Optional[str] = None    # id bước hoặc id luật


@dataclass
class Feedback:
    ok: bool
    message: str
    step_completed: Optional[str] = None
    issue: Optional[Issue] = None


@dataclass
class Result:
    scenario_id: str
    duration_s: float
    completed_steps: list[str]
    missed_critical: list[str]
    issues: list[Issue]
    score: float
    passed: bool
    step_times: dict[str, float]
    case_id: Optional[str] = None
    required_steps: list = field(default_factory=list)

    @property
    def critical_errors(self) -> int:
        return sum(1 for i in self.issues if i.severity == CRITICAL)


class ScenarioEngine:
    TOO_CLOSE_COOLDOWN_S = 5.0

    def __init__(self, scenario: Scenario, case_id: Optional[str] = None):
        self.sc = scenario
        self.case = scenario.case(case_id)
        self.facts = (self.case or {}).get("facts", {})
        self.required = {s.id for s in scenario.steps if eval_cond(s.required_if, self.facts)}
        self.done: dict[str, tuple[float, str, str]] = {}
        self.partial: dict[str, set[str]] = {}
        self.issues: list[Issue] = []
        self.finished = False
        self.last_t = 0.0
        st = scenario.initial_state
        self.docked = set(st.get("docked_arms", []))
        self.instruments_in = set(st.get("instruments_in", []))
        self.camera_in = bool(st.get("camera_in", False))
        self.cart_at_table = bool(st.get("cart_at_table", False))
        self.field = SterileField(scenario.zones, scenario.min_observer_distance_m)
        self._last_close: dict[str, float] = {}

    def correct_answer(self, step: Step) -> Optional[str]:
        d = step.decision or {}
        return d["answer"] if "answer" in d else self.facts.get(d.get("answer_fact"))

    # ---------- trạng thái thế giới ----------
    def _state_true(self, name: str, target: Optional[str]) -> bool:
        if name == "any_arm_docked":
            return bool(self.docked)
        if name == "target_has_instrument":
            if target == "camera":
                return self.camera_in
            return target in self.instruments_in
        return False

    def _apply_effect(self, ev: Event) -> None:
        if ev.action == "remove_instrument" and ev.target:
            self.instruments_in.discard(ev.target)
        elif ev.action == "remove_camera":
            self.camera_in = False
        elif ev.action == "undock_arm" and ev.target:
            self.docked.discard(ev.target)
        elif ev.action == "move_cart_away":
            self.cart_at_table = False

    def _issue(self, ev: Event, kind: str, sev: str, msg: str, ref: Optional[str] = None) -> Issue:
        i = Issue(ev.t, kind, sev, msg, ev.actor, ev.role, ref)
        self.issues.append(i)
        return i

    # ---------- xử lý sự kiện ----------
    def _match_step(self, ev: Event) -> Optional[Step]:
        for s in self.sc.steps:
            if s.id in self.done or s.action != ev.action:
                continue
            if s.target is not None and s.target != ev.target and not s.decision:
                continue
            if s.targets and ev.target not in s.targets:
                continue
            if s.targets and ev.target in self.partial.get(s.id, set()):
                continue
            return s
        return None

    def handle(self, ev: Event) -> Feedback:
        if self.finished:
            return Feedback(False, "Buổi đã kết thúc")
        self.last_t = max(self.last_t, ev.t)

        # 1) sự kiện vô khuẩn
        if ev.action == "contact":
            z = self.field.contact(ev.data.get("point", (0, 0, 0)), bool(ev.data.get("is_sterile", False)))
            if z:
                i = self._issue(ev, "sterile_breach", CRITICAL, f"Bộ phận không vô khuẩn chạm vào {z.label}", z.id)
                return Feedback(False, i.message, issue=i)
            return Feedback(True, "")
        if ev.action == "position":
            r = self.field.too_close(ev.data.get("point", (0, 0, 0)), bool(ev.data.get("is_gowned", False)))
            if r and ev.t - self._last_close.get(ev.actor, -1e9) >= self.TOO_CLOSE_COOLDOWN_S:
                self._last_close[ev.actor] = ev.t
                z, d = r
                i = self._issue(ev, "too_close", MINOR, f"Đứng cách {z.label} {d:.2f} m, dưới mức tối thiểu", z.id)
                return Feedback(False, i.message, issue=i)
            return Feedback(True, "")

        # 2) luật an toàn: hành động nguy hiểm bị chặn, không tạo hiệu ứng
        for rule in self.sc.rules:
            if rule.action == ev.action and self._state_true(rule.if_state, ev.target):
                i = self._issue(ev, "rule", rule.severity, rule.message, rule.id)
                return Feedback(False, i.message, issue=i)

        # 3) khớp bước kịch bản
        step = self._match_step(ev)
        if step is None:
            i = self._issue(ev, "unexpected", MINOR, f"Hành động '{ev.action}' không có trong kịch bản ở thời điểm này")
            self._apply_effect(ev)
            return Feedback(False, i.message, issue=i)

        if ev.role not in step.roles:
            i = self._issue(ev, "wrong_role", MINOR, f"'{step.title}' không thuộc vai trò {ev.role}", step.id)
            return Feedback(False, i.message, issue=i)

        if step.min_duration_s is not None and float(ev.data.get("duration_s", 0)) < step.min_duration_s:
            i = self._issue(ev, "insufficient_duration", CRITICAL,
                            f"'{step.title}' chưa đủ {step.min_duration_s:g} giây", step.id)
            return Feedback(False, i.message, issue=i)

        if step.indicated_if and not eval_cond(step.indicated_if, self.facts):
            i = self._issue(ev, "not_indicated", MINOR, f"'{step.title}': không có chỉ định ở ca này", step.id)
            return Feedback(False, i.message, issue=i)

        if step.decision:
            ans = self.correct_answer(step)
            if ev.target != ans:
                lbl = step.decision["options"].get(ev.target, ev.target)
                i = self._issue(ev, "wrong_decision", MAJOR, f"{step.title}: chọn '{lbl}' chưa đúng", step.id)
                return Feedback(False, i.message, issue=i)

        if step.area:
            p = ev.data.get("point")
            x, z = (p[0], p[-1]) if p else (None, None)
            a = step.area
            if x is None or not (a[0] <= x <= a[2] and a[1] <= z <= a[3]):
                i = self._issue(ev, "wrong_position", MAJOR,
                                f"{step.title}: vị trí chưa đúng" + (f" (cần ở {step.area_label})" if step.area_label else ""), step.id)
                return Feedback(False, i.message, issue=i)

        missing = [a for a in step.after if a not in self.done and a in self.required]
        issue = None
        if missing:
            titles = ", ".join(self.sc.step(a).title for a in missing)
            issue = self._issue(ev, "out_of_order", MAJOR, f"Làm '{step.title}' trước khi xong: {titles}", step.id)

        self._apply_effect(ev)
        if step.targets:
            got = self.partial.setdefault(step.id, set())
            got.add(ev.target)
            if got != set(step.targets):
                return Feedback(issue is None, f"{step.title}: {len(got)}/{len(step.targets)}", issue=issue)
        self.done[step.id] = (ev.t, ev.actor, ev.role)
        if self.required <= set(self.done):
            self.finished = True
        return Feedback(issue is None, f"Hoàn thành: {step.title}", step_completed=step.id, issue=issue)

    def terminate(self, t: Optional[float] = None) -> Result:
        """Kết thúc buổi (khi đủ bước hoặc giảng viên dừng) và tính điểm."""
        self.finished = True
        if t is not None:
            self.last_t = max(self.last_t, t)
        sc = self.sc.scoring
        missed = [s.id for s in self.sc.steps if s.critical and s.id in self.required and s.id not in self.done]
        n = lambda kind: sum(1 for i in self.issues if i.kind == kind)
        n_crit = sum(1 for i in self.issues if i.severity == CRITICAL)
        score = 100.0
        score -= sc.critical_miss * len(missed)
        score -= sc.critical_error * n_crit
        score -= sc.out_of_order * n("out_of_order")
        score -= sc.wrong_role * n("wrong_role")
        score -= sc.wrong_decision * n("wrong_decision")
        score -= sc.wrong_position * n("wrong_position")
        score -= sc.not_indicated * n("not_indicated")
        if self.sc.time_limit_s and self.last_t > self.sc.time_limit_s and sc.over_time_per_10s:
            score -= sc.over_time_per_10s * math.ceil((self.last_t - self.sc.time_limit_s) / 10)
        score = max(0.0, round(score, 1))
        passed = score >= sc.pass_threshold and not missed and not (sc.fail_on_any_critical_error and n_crit)
        return Result(self.sc.id, round(self.last_t, 1), list(self.done), missed, list(self.issues), score, passed,
                      {k: v[0] for k, v in self.done.items()}, (self.case or {}).get("id"),
                      [s.id for s in self.sc.steps if s.id in self.required])

    def grade_quiz(self, answers: dict) -> dict:
        """Chấm câu hỏi kiến thức; tách riêng khỏi điểm quy trình."""
        items = []
        for q in self.sc.quiz:
            a = answers.get(q["id"])
            items.append({"id": q["id"], "q": q["q"], "chosen": a, "answer": q["answer"], "correct": a == q["answer"],
                          "explain": q.get("explain")})
        n = len(items)
        right = sum(i["correct"] for i in items)
        return {"items": items, "correct": right, "total": n, "score": round(100 * right / n, 1) if n else None}
