"""Đọc và kiểm tra kịch bản mô phỏng (định dạng JSON trong thư mục scenarios/).

Kịch bản là "nguồn sự thật" dùng chung cho bản Python (kiểm thử, máy chủ) và bản Unreal Engine.
Mọi kịch bản phải qua hội đồng chuyên môn duyệt; trường approval.status cho biết trạng thái.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


class ScenarioError(ValueError):
    """Kịch bản sai cấu trúc."""


@dataclass(frozen=True)
class Step:
    id: str
    title: str
    roles: tuple[str, ...]
    action: str
    after: tuple[str, ...] = ()
    critical: bool = False
    target: Optional[str] = None          # bước chỉ khớp một đối tượng cụ thể (ví dụ mục bảng kiểm)
    targets: tuple[str, ...] = ()         # bước cần làm trên nhiều đối tượng (ví dụ tháo 4 tay robot)
    min_duration_s: Optional[float] = None
    phase: Optional[str] = None
    note: Optional[str] = None
    src: Optional[str] = None
    required_if: Optional[dict] = None    # {"fact","op","value"}: bước chỉ bắt buộc khi điều kiện đúng
    indicated_if: Optional[dict] = None   # làm khi điều kiện sai là "không có chỉ định"
    decision: Optional[dict] = None       # {"options":{key:label}, "answer"| "answer_fact"}
    area: Optional[tuple] = None          # (xmin, zmin, xmax, zmax) vị trí đứng/đặt thiết bị, mét
    area_label: Optional[str] = None


@dataclass(frozen=True)
class Rule:
    id: str
    action: str
    if_state: str
    severity: str
    message: str


@dataclass(frozen=True)
class Zone:
    id: str
    label: str
    min: tuple[float, float, float]
    max: tuple[float, float, float]


@dataclass(frozen=True)
class Scoring:
    critical_miss: float = 25
    critical_error: float = 20
    out_of_order: float = 5
    wrong_role: float = 3
    wrong_decision: float = 8
    wrong_position: float = 4
    not_indicated: float = 4
    over_time_per_10s: float = 0
    pass_threshold: float = 70
    fail_on_any_critical_error: bool = True


@dataclass(frozen=True)
class Scenario:
    id: str
    version: str
    module: int
    title: str
    roles: tuple[str, ...]
    steps: tuple[Step, ...]
    rules: tuple[Rule, ...] = ()
    time_limit_s: Optional[float] = None
    initial_state: dict = field(default_factory=dict)
    zones: tuple[Zone, ...] = ()
    min_observer_distance_m: Optional[float] = None
    scoring: Scoring = Scoring()
    approval_status: str = "draft"
    phases: tuple = ()
    cases: tuple = ()
    quiz: tuple = ()
    rubric: tuple = ()
    source: Optional[dict] = None

    def case(self, case_id: Optional[str]) -> Optional[dict]:
        if not self.cases:
            return None
        for c in self.cases:
            if c["id"] == case_id:
                return c
        if case_id is None:
            return self.cases[0]
        raise KeyError(case_id)

    def step(self, step_id: str) -> Step:
        for s in self.steps:
            if s.id == step_id:
                return s
        raise KeyError(step_id)

    @property
    def iri(self) -> str:
        return f"scenario/{self.id}/{self.version}"


KNOWN_STATES = {"any_arm_docked", "target_has_instrument"}
OPS = {"==": lambda a, b: a == b, "!=": lambda a, b: a != b, ">=": lambda a, b: a >= b,
       ">": lambda a, b: a > b, "<=": lambda a, b: a <= b, "<": lambda a, b: a < b}


def eval_cond(cond: Optional[dict], facts: dict) -> bool:
    """Điều kiện trên dữ kiện ca bệnh. Không có điều kiện thì luôn đúng; thiếu dữ kiện thì sai."""
    if not cond:
        return True
    if cond["fact"] not in facts:
        return False
    return OPS[cond["op"]](facts[cond["fact"]], cond["value"])


def _validate(raw: dict) -> list[str]:
    errs: list[str] = []
    for key in ("id", "version", "module", "title", "roles", "steps"):
        if key not in raw:
            errs.append(f"thiếu trường bắt buộc '{key}'")
    if errs:
        return errs
    roles = set(raw["roles"])
    ids = [s.get("id") for s in raw["steps"]]
    if len(ids) != len(set(ids)):
        errs.append("trùng id bước")
    idset = set(ids)
    for s in raw["steps"]:
        for k in ("id", "title", "roles", "action"):
            if k not in s:
                errs.append(f"bước {s.get('id')}: thiếu '{k}'")
        for r in s.get("roles", []):
            if r not in roles:
                errs.append(f"bước {s['id']}: vai trò '{r}' không có trong danh sách roles")
        for a in s.get("after", []):
            if a not in idset:
                errs.append(f"bước {s['id']}: điều kiện trước '{a}' không tồn tại")
    case_facts = [c.get("facts", {}) for c in raw.get("cases", [])]
    for s in raw["steps"]:
        for key in ("required_if", "indicated_if"):
            c = s.get(key)
            if c and (c.get("op") not in OPS or "fact" not in c):
                errs.append(f"bước {s['id']}: {key} sai cấu trúc")
        d = s.get("decision")
        if d:
            if not d.get("options") or ("answer" not in d and "answer_fact" not in d):
                errs.append(f"bước {s['id']}: decision cần options và answer/answer_fact")
            elif "answer" in d and d["answer"] not in d["options"]:
                errs.append(f"bước {s['id']}: đáp án không nằm trong options")
            elif "answer_fact" in d:
                for f in case_facts:
                    v = f.get(d["answer_fact"])
                    if v is not None and v != "none" and v not in d["options"]:
                        errs.append(f"bước {s['id']}: dữ kiện ca '{v}' không có trong options")
        if s.get("area") is not None and len(s["area"]) != 4:
            errs.append(f"bước {s['id']}: area cần 4 số")
        if s.get("phase") and raw.get("phases") and s["phase"] not in {p["id"] for p in raw["phases"]}:
            errs.append(f"bước {s['id']}: phase '{s['phase']}' không tồn tại")
    for q in raw.get("quiz", []):
        if not (0 <= q.get("answer", -1) < len(q.get("options", []))):
            errs.append(f"câu hỏi {q.get('id')}: đáp án sai chỉ số")
    for r in raw.get("rules", []):
        if r.get("if_state") not in KNOWN_STATES:
            errs.append(f"luật {r.get('id')}: if_state '{r.get('if_state')}' chưa được hỗ trợ")
    # phát hiện vòng lặp phụ thuộc
    graph = {s["id"]: list(s.get("after", [])) for s in raw["steps"]}
    seen, stack = set(), set()

    def visit(n: str) -> bool:
        if n in stack:
            return True
        if n in seen:
            return False
        seen.add(n)
        stack.add(n)
        cyc = any(visit(m) for m in graph.get(n, []))
        stack.discard(n)
        return cyc

    if any(visit(n) for n in graph):
        errs.append("phụ thuộc giữa các bước bị vòng lặp")
    return errs


def load_scenario(path: str | Path) -> Scenario:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    errs = _validate(raw)
    if errs:
        raise ScenarioError("; ".join(errs))
    steps = tuple(
        Step(
            id=s["id"], title=s["title"], roles=tuple(s["roles"]), action=s["action"],
            after=tuple(s.get("after", [])), critical=bool(s.get("critical", False)),
            target=s.get("target"), targets=tuple(s.get("targets", [])),
            min_duration_s=s.get("min_duration_s"), phase=s.get("phase"), note=s.get("note"), src=s.get("src"),
            required_if=s.get("required_if"), indicated_if=s.get("indicated_if"), decision=s.get("decision"),
            area=tuple(s["area"]) if s.get("area") else None, area_label=s.get("area_label"),
        )
        for s in raw["steps"]
    )
    rules = tuple(Rule(**{k: r[k] for k in ("id", "action", "if_state", "severity", "message")}) for r in raw.get("rules", []))
    sf = raw.get("sterile_field") or {}
    zones = tuple(Zone(z["id"], z["label"], tuple(z["min"]), tuple(z["max"])) for z in sf.get("zones", []))
    sc = Scoring(**raw.get("scoring", {}))
    return Scenario(
        id=raw["id"], version=raw["version"], module=int(raw["module"]), title=raw["title"],
        roles=tuple(raw["roles"]), steps=steps, rules=rules, time_limit_s=raw.get("time_limit_s"),
        initial_state=raw.get("initial_state", {}), zones=zones,
        min_observer_distance_m=sf.get("min_observer_distance_m"), scoring=sc,
        approval_status=(raw.get("approval") or {}).get("status", "draft"),
        phases=tuple(raw.get("phases", [])), cases=tuple(raw.get("cases", [])), quiz=tuple(raw.get("quiz", [])),
        rubric=tuple(raw.get("rubric", [])), source=raw.get("source"),
    )


def load_all(folder: str | Path) -> dict[str, Scenario]:
    return {s.id: s for s in (load_scenario(p) for p in sorted(Path(folder).glob("*.json")))}
