"""Báo cáo cho giảng viên: danh sách buổi, chi tiết từng buổi (dòng thời gian, theo giai đoạn),
phiếu đánh giá của giảng viên, xuất CSV.

Mọi số liệu dựng lại từ câu lệnh xAPI đã lưu, nên dữ liệu từ bản web và bản Unreal dùng chung một báo cáo.
"""
from __future__ import annotations

import csv
import io
import json
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from backend.dblock import WRITE_LOCK
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from simcore import ScenarioEngine, load_all
from simcore.xapi import BASE_IRI

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = load_all(ROOT / "scenarios")
router = APIRouter(prefix="/api")


def _db():
    from backend.app import _db as db
    return db()      # bảng được tạo một lần trong backend.app.SCHEMA


def _ext(s: dict, key: str, where: str = "result") -> Any:
    return ((s.get(where) or {}).get("extensions") or {}).get(f"{BASE_IRI}/ext/{key}")


def _scenario_of(s: dict):
    iri = s["context"]["contextActivities"]["parent"][0]["id"].split("/scenario/")[-1]
    sid = iri.split("/")[0]
    return iri, SCENARIOS.get(sid)


def _step_id(s: dict) -> Optional[str]:
    oid = s["object"]["id"]
    return oid.rsplit("/step/", 1)[1] if "/step/" in oid else None


_MIN_DT = datetime.min.replace(tzinfo=timezone.utc)


def _dt(ts: Optional[str]) -> datetime:
    try:
        d = datetime.fromisoformat((ts or "").replace("Z", "+00:00"))
    except ValueError:
        return _MIN_DT
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _seconds(ts: Optional[str], t0: Optional[str]) -> Optional[float]:
    if not ts or not t0:
        return None
    f = lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))
    return round((f(ts) - f(t0)).total_seconds(), 1)


def _by_registration() -> dict[str, list[dict]]:
    con = _db()
    by_reg: dict[str, list[dict]] = defaultdict(list)
    for r in con.execute("SELECT body FROM statements WHERE registration IS NOT NULL"):
        s = json.loads(r["body"])
        by_reg[s["context"]["registration"]].append(s)
    for ss in by_reg.values():
        # So theo THỜI ĐIỂM, không theo chuỗi: "08:00:05Z" (không có phần lẻ giây) đứng sau "08:00:05.5Z" khi so chuỗi
        ss.sort(key=lambda s: _dt(s.get("timestamp")))
    return by_reg


def _assessments(reg: Optional[str] = None) -> list[dict]:
    con = _db()
    q = "SELECT body FROM assessments" + (" WHERE registration=?" if reg else "") + " ORDER BY created"
    return [json.loads(r["body"]) for r in con.execute(q, (reg,) if reg else ())]


def summarize(reg: str, ss: list[dict]) -> dict:
    final = next((s for s in ss if s["verb"]["id"].endswith(("/passed", "/failed"))), None)
    quiz = next((s for s in ss if s["verb"]["id"].endswith("/answered")), None)
    first = ss[0]
    iri, sc = _scenario_of(first)
    res = (final or {}).get("result") or {}
    case_id = _ext(first, "case", "context")
    case = sc.case(case_id) if sc and sc.cases and case_id else None
    qres = (quiz or {}).get("result") or {}
    return {
        "registration": reg, "scenario": iri, "scenario_title": sc.title if sc else iri,
        "team": _ext(first, "team", "context"), "module": _ext(first, "module", "context"),
        "case": case_id, "case_title": case["title"] if case else None,
        "started": first.get("timestamp"), "finished": final is not None,
        "passed": res.get("success"), "score": (res.get("score") or {}).get("raw"), "duration": res.get("duration"),
        "missed_critical": _ext(final or {}, "missed-critical") or [],
        "critical_errors": _ext(final or {}, "critical-errors"),
        "quiz": None if not quiz else {"correct": qres["score"]["raw"], "total": qres["score"]["max"]},
        "errors": [{"step": s["object"]["definition"]["name"].get("vi-VN") if s["object"].get("definition") else s["object"]["id"],
                    "step_id": _step_id(s), "message": (s.get("result") or {}).get("response"),
                    "severity": _ext(s, "severity"), "kind": _ext(s, "issue-kind"),
                    "role": _ext(s, "role", "context"), "at": s.get("timestamp")}
                   for s in ss if s["verb"]["id"].endswith("/erred")],
    }


def all_sessions() -> list[dict]:
    asses = defaultdict(list)
    for a in _assessments():
        asses[a["registration"]].append(a)
    out = []
    for reg, ss in _by_registration().items():
        x = summarize(reg, ss)
        a = asses.get(reg)
        x["assessment"] = None if not a else {"assessor": a[-1]["assessor"], "overall": a[-1]["overall"],
                                              "mean_rating": a[-1]["mean_rating"]}
        out.append(x)
    out.sort(key=lambda x: _dt(x["started"]), reverse=True)
    return out


def detail(reg: str) -> dict:
    ss = _by_registration().get(reg)
    if not ss:
        raise HTTPException(404, "Không có buổi này")
    base = summarize(reg, ss)
    _, sc = _scenario_of(ss[0])
    t0 = ss[0].get("timestamp")
    timeline = []
    for s in ss:
        verb = s["verb"]["id"].rsplit("/", 1)[-1]
        if verb == "initialized":
            continue
        timeline.append({"t": _seconds(s.get("timestamp"), t0), "verb": verb, "step_id": _step_id(s),
                         "title": (s["object"].get("definition") or {}).get("name", {}).get("vi-VN"),
                         "role": _ext(s, "role", "context"), "actor": (s["actor"].get("account") or {}).get("name") or s["actor"].get("name"),
                         "message": (s.get("result") or {}).get("response"), "severity": _ext(s, "severity"),
                         "kind": _ext(s, "issue-kind")})
    steps, phases = [], []
    if sc:
        eng = ScenarioEngine(sc, base["case"]) if sc.cases else ScenarioEngine(sc)
        done_at = {e["step_id"]: e for e in timeline if e["verb"] == "completed"}
        errs = defaultdict(list)
        for e in base["errors"]:
            if e["step_id"]:
                errs[e["step_id"]].append(e)
        for st in sc.steps:
            d = done_at.get(st.id)
            steps.append({"id": st.id, "title": st.title, "phase": st.phase, "roles": list(st.roles), "critical": st.critical,
                          "required": st.id in eng.required, "done": d is not None, "t": d["t"] if d else None,
                          "by_role": d["role"] if d else None, "errors": [e["message"] for e in errs.get(st.id, [])],
                          "src": st.src})
        for ph in (sc.phases or [{"id": None, "title": "Toàn bộ"}]):
            ps = [x for x in steps if x["phase"] == ph["id"] and x["required"]] if sc.phases else [x for x in steps if x["required"]]
            ne = sum(len(x["errors"]) for x in ps)
            phases.append({"id": ph["id"], "title": ph["title"], "required": len(ps), "done": sum(x["done"] for x in ps),
                           "missed_critical": [x["id"] for x in ps if x["critical"] and not x["done"]], "errors": ne})
    quiz = next((s for s in ss if s["verb"]["id"].endswith("/answered")), None)
    quiz_items = []
    if quiz and sc:
        qmap = {q["id"]: q for q in sc.quiz}
        for it in _ext(quiz, "quiz-items") or []:
            q = qmap.get(it["id"], {})
            quiz_items.append({"id": it["id"], "q": q.get("q"), "correct": it["correct"],
                               "chosen": q["options"][it["chosen"]] if isinstance(it.get("chosen"), int) and 0 <= it["chosen"] < len(q.get("options", [])) else None,
                               "answer": q["options"][q["answer"]] if q else None})
    case = sc.case(base["case"]) if sc and sc.cases and base["case"] else None
    return {**base, "case_summary": case.get("summary") if case else None, "timeline": timeline, "steps": steps,
            "phases": phases, "quiz_items": quiz_items, "rubric": list(sc.rubric) if sc else [],
            "source": sc.source if sc else None, "assessments": _assessments(reg)}


class AssessmentIn(BaseModel):
    registration: str
    assessor: str = Field(min_length=1, max_length=60)
    ratings: dict[str, int] = {}
    overall: str = Field(pattern="^(dat|chua_dat|can_lam_lai)$")
    comment: str = Field(default="", max_length=2000)


DEFAULT_RUBRIC = [{"id": "prep", "label": "Chuẩn bị"}, {"id": "safety", "label": "An toàn, vô khuẩn"},
                  {"id": "sequence", "label": "Trình tự"}, {"id": "team", "label": "Phối hợp ê kíp"}]


@router.get("/sessions")
def sessions():
    return all_sessions()


@router.get("/session/{reg}")
def session_detail(reg: str):
    return detail(reg)


@router.post("/assessments")
def add_assessment(body: AssessmentIn, request: Request):
    if body.registration not in _by_registration():
        raise HTTPException(404, "Không có buổi này")
    bad = [k for k, v in body.ratings.items() if not 1 <= v <= 5]
    if bad:
        raise HTTPException(400, "Điểm mỗi tiêu chí từ 1 đến 5")
    vals = list(body.ratings.values())
    account = getattr(request.state, "user", None)   # tài khoản đăng nhập, không sửa được từ trình duyệt
    rec = {"id": str(uuid.uuid4()), **body.model_dump(), "account": account, "created": datetime.now(timezone.utc).isoformat(),
           "mean_rating": round(sum(vals) / len(vals), 2) if vals else None}
    con = _db()
    with WRITE_LOCK, con:
        con.execute("INSERT INTO assessments VALUES (?,?,?,?,?)",
                    (rec["id"], rec["registration"], rec["assessor"], rec["created"], json.dumps(rec, ensure_ascii=False)))
    return rec


@router.get("/summary")
def summary(scenario: Optional[str] = None):
    ss = [s for s in all_sessions() if not scenario or s["scenario"].startswith(scenario)]
    done = [s for s in ss if s["finished"]]
    kinds = Counter(e["kind"] for s in ss for e in s["errors"])
    msgs = Counter(e["message"] for s in ss for e in s["errors"])
    roles = Counter(e["role"] for s in ss for e in s["errors"] if e["role"])
    phase_err: Counter = Counter()
    for s in ss:
        sid = s["scenario"].split("/")[0]
        sc = SCENARIOS.get(sid)
        if not sc or not sc.phases:
            continue
        titles = {p["id"]: p["title"] for p in sc.phases}
        for e in s["errors"]:
            if e["step_id"]:
                try:
                    phase_err[titles.get(sc.step(e["step_id"]).phase, "Khác")] += 1
                except KeyError:
                    pass
        for m in s["missed_critical"]:
            try:
                phase_err[titles.get(sc.step(m).phase, "Khác")] += 1
            except KeyError:
                pass
    quizzes = [s["quiz"] for s in ss if s["quiz"]]
    return {
        "sessions": len(ss), "finished": len(done),
        "pass_rate": round(sum(1 for s in done if s["passed"]) / len(done), 3) if done else None,
        "mean_score": round(sum(s["score"] for s in done) / len(done), 1) if done else None,
        "quiz_mean": round(100 * sum(q["correct"] for q in quizzes) / sum(q["total"] for q in quizzes), 1) if quizzes else None,
        "assessed": sum(1 for s in ss if s["assessment"]),
        "errors_by_kind": kinds.most_common(), "top_errors": msgs.most_common(10), "errors_by_role": roles.most_common(),
        "errors_by_phase": phase_err.most_common(),
    }


@router.get("/export.csv")
def export_csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["registration", "bat_dau", "nhom_hoc_vien", "kich_ban", "ca_benh", "diem_quy_trinh", "ket_qua",
                "thoi_gian", "so_loi", "loi_nghiem_trong", "bo_sot_buoc_then_chot", "cau_hoi_dung", "cau_hoi_tong",
                "giang_vien", "danh_gia_gv", "diem_tb_tieu_chi"])
    for s in all_sessions():
        a = s["assessment"] or {}
        q = s["quiz"] or {}
        w.writerow([s["registration"], s["started"], s["team"], s["scenario"], s["case"] or "", s["score"],
                    "" if s["passed"] is None else ("Đạt" if s["passed"] else "Không đạt"), s["duration"] or "",
                    len(s["errors"]), s["critical_errors"] or 0, "; ".join(s["missed_critical"]), q.get("correct", ""),
                    q.get("total", ""), a.get("assessor", ""), a.get("overall", ""), a.get("mean_rating", "")])
    # BOM để Excel mở đúng tiếng Việt
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=ket_qua_mo_phong.csv"})
