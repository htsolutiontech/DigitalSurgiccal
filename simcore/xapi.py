"""Sinh câu lệnh xAPI 1.0.3 từ sự kiện mô phỏng.

- Verb chuẩn lấy từ ADL (http://adlnet.gov/expapi/verbs/...).
- Verb riêng (ví dụ vi phạm vô khuẩn) dùng IRI dưới BASE_IRI; đổi BASE_IRI thành tên miền
  HealthV thật trước khi triển khai.
- Không đưa dữ liệu người bệnh vào câu lệnh. Học viên định danh bằng tài khoản ẩn danh (account),
  không dùng email.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from .engine import Event, Feedback, Result
from .scenario import Scenario

XAPI_VERSION = "1.0.3"
BASE_IRI = "https://xapi.example-healthv.vn"   # TODO: thay bằng tên miền thật
ADL = "http://adlnet.gov/expapi/verbs/"

VERBS = {
    "initialized": (ADL + "initialized", "bắt đầu"),
    "interacted": (ADL + "interacted", "thao tác"),
    "completed": (ADL + "completed", "hoàn thành"),
    "passed": (ADL + "passed", "đạt"),
    "failed": (ADL + "failed", "không đạt"),
    "terminated": (ADL + "terminated", "kết thúc"),
    "erred": (BASE_IRI + "/verbs/erred", "mắc lỗi"),
    "answered": (ADL + "answered", "trả lời"),
}


def _verb(key: str) -> dict:
    iri, label = VERBS[key]
    return {"id": iri, "display": {"vi-VN": label}}


def actor(account_name: str, display: Optional[str] = None, homepage: str = BASE_IRI) -> dict:
    a = {"objectType": "Agent", "account": {"homePage": homepage, "name": account_name}}
    if display:
        a["name"] = display
    return a


class StatementBuilder:
    def __init__(self, scenario: Scenario, team_id: str, start: Optional[datetime] = None,
                 registration: Optional[str] = None, base_iri: str = BASE_IRI, case_id: Optional[str] = None):
        self.case_id = case_id
        self.sc = scenario
        self.team_id = team_id
        self.start = start or datetime.now(timezone.utc)
        self.registration = registration or str(uuid.uuid4())
        self.base = base_iri

    # ---------- phần dùng chung ----------
    def _ts(self, t: float) -> str:
        return (self.start + timedelta(seconds=t)).isoformat().replace("+00:00", "Z")

    def _scenario_obj(self) -> dict:
        return {"objectType": "Activity", "id": f"{self.base}/{self.sc.iri}",
                "definition": {"name": {"vi-VN": self.sc.title},
                               "type": "http://adlnet.gov/expapi/activities/simulation",
                               "extensions": {f"{self.base}/ext/approval-status": self.sc.approval_status}}}

    def _step_obj(self, step_id: str) -> dict:
        try:
            title = self.sc.step(step_id).title
        except KeyError:
            title = step_id
        return {"objectType": "Activity", "id": f"{self.base}/{self.sc.iri}/step/{step_id}",
                "definition": {"name": {"vi-VN": title}, "type": "http://adlnet.gov/expapi/activities/interaction"}}

    def _context(self, role: Optional[str]) -> dict:
        ext = {f"{self.base}/ext/team": self.team_id, f"{self.base}/ext/module": self.sc.module}
        if self.case_id:
            ext[f"{self.base}/ext/case"] = self.case_id
        if role:
            ext[f"{self.base}/ext/role"] = role
        return {"registration": self.registration,
                "contextActivities": {"parent": [{"id": f"{self.base}/{self.sc.iri}"}]},
                "extensions": ext}

    def _stmt(self, who: dict, verb: str, obj: dict, t: float, role: Optional[str], result: Optional[dict] = None) -> dict:
        s = {"id": str(uuid.uuid4()), "actor": who, "verb": _verb(verb), "object": obj,
             "context": self._context(role), "timestamp": self._ts(t), "version": XAPI_VERSION}
        if result is not None:
            s["result"] = result
        return s

    # ---------- câu lệnh cụ thể ----------
    def initialized(self, who: dict, role: str) -> dict:
        return self._stmt(who, "initialized", self._scenario_obj(), 0.0, role)

    def from_event(self, who: dict, ev: Event, fb: Feedback) -> list[dict]:
        out = []
        if fb.step_completed:
            out.append(self._stmt(who, "completed", self._step_obj(fb.step_completed), ev.t, ev.role,
                                  {"completion": True, "success": fb.issue is None,
                                   "extensions": {f"{self.base}/ext/elapsed-s": ev.t}}))
        if fb.issue:
            i = fb.issue
            obj = self._step_obj(i.ref) if i.ref else self._scenario_obj()
            out.append(self._stmt(who, "erred", obj, ev.t, ev.role,
                                  {"success": False, "response": i.message,
                                   "extensions": {f"{self.base}/ext/issue-kind": i.kind,
                                                  f"{self.base}/ext/severity": i.severity}}))
        return out

    def quiz(self, who: dict, graded: dict, t: float) -> list[dict]:
        obj = {"objectType": "Activity", "id": f"{self.base}/{self.sc.iri}/quiz",
               "definition": {"name": {"vi-VN": "Câu hỏi kiến thức"}, "type": "http://adlnet.gov/expapi/activities/assessment"}}
        res = {"score": {"raw": graded["correct"], "min": 0, "max": graded["total"],
                         "scaled": round(graded["correct"] / graded["total"], 3) if graded["total"] else 0},
               "success": graded["total"] > 0 and graded["correct"] / graded["total"] >= 0.6,
               "extensions": {f"{self.base}/ext/quiz-items": [{"id": i["id"], "chosen": i["chosen"], "correct": i["correct"]}
                                                              for i in graded["items"]]}}
        return [self._stmt(who, "answered", obj, t, None, res)]

    def finished(self, team_actor: dict, res: Result) -> list[dict]:
        result = {"score": {"raw": res.score, "min": 0, "max": 100, "scaled": round(res.score / 100, 3)},
                  "success": res.passed, "completion": not res.missed_critical,
                  "duration": f"PT{res.duration_s:g}S",
                  "extensions": {f"{self.base}/ext/missed-critical": res.missed_critical,
                                 f"{self.base}/ext/critical-errors": res.critical_errors,
                                 f"{self.base}/ext/issue-count": len(res.issues)}}
        return [self._stmt(team_actor, "passed" if res.passed else "failed", self._scenario_obj(), res.duration_s, None, result),
                self._stmt(team_actor, "terminated", self._scenario_obj(), res.duration_s, None)]


def validate_statement(s: dict) -> list[str]:
    """Kiểm tra tối thiểu theo xAPI 1.0.3 (không thay thế LRS đạt chuẩn)."""
    errs = []
    a = s.get("actor") or {}
    if not any(k in a for k in ("mbox", "mbox_sha1sum", "openid", "account")) and a.get("objectType") != "Group":
        errs.append("actor thiếu định danh (mbox/account/openid)")
    if "account" in a and not {"homePage", "name"} <= set(a["account"]):
        errs.append("actor.account thiếu homePage hoặc name")
    v = s.get("verb") or {}
    if not str(v.get("id", "")).startswith(("http://", "https://")):
        errs.append("verb.id phải là IRI")
    o = s.get("object") or {}
    if not str(o.get("id", "")).startswith(("http://", "https://")):
        errs.append("object.id phải là IRI")
    sc = (s.get("result") or {}).get("score")
    if sc and "scaled" in sc and not (-1 <= sc["scaled"] <= 1):
        errs.append("result.score.scaled phải trong [-1, 1]")
    reg = (s.get("context") or {}).get("registration")
    if reg:
        try:
            uuid.UUID(reg)
        except ValueError:
            errs.append("context.registration phải là UUID")
    return errs
