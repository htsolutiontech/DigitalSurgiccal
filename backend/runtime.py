"""API buổi mô phỏng, KHÔNG giữ trạng thái trên máy chủ (chạy được trên Vercel, nhiều tiến trình).

Luồng một buổi thực hành:
1. POST /api/run/start      kiểm tra mã lớp, trả token đã ký (HMAC) chứa mã buổi, kịch bản, ca, vai, giờ bắt đầu.
2. Trình duyệt chạy toàn bộ buổi bằng engine.js (bộ chấm + ê kíp ảo), ghi nhật ký thao tác.
3. POST /api/results        gửi token + nhật ký + câu trả lời. Máy chủ chạy lại nhật ký bằng bộ chấm Python
                             (simcore.session.replay_log): ê kíp ảo phải làm đúng như máy chủ, học viên chỉ làm
                             việc của vai mình, thời gian không vượt quá thời lượng thực của buổi. Điểm do máy chủ
                             tính là điểm chính thức; câu hỏi kiến thức chấm trên máy chủ (đáp án không gửi xuống).
4. POST /api/results/import  giảng viên nhập tệp kết quả từ bản tự luyện (GitHub Pages, không có máy chủ).

Giới hạn cần biết: logic kịch bản (thứ tự bước, đáp án câu hỏi tình huống, vùng đứng đúng) nằm trong
trình duyệt nên người rành kỹ thuật đọc được. Câu hỏi kiến thức thì không. Đánh giá tổng kết nên dựa
thêm vào quan sát trực tiếp của giảng viên (phiếu đánh giá).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import secrets
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.dblock import WRITE_LOCK
from backend.settings import get_settings
from simcore import StatementBuilder, load_all
from simcore.session import LogError, Session, progress_snapshot, public_scenario, replay_log, result_json

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = load_all(ROOT / "scenarios")
RAW = {json.loads(p.read_text(encoding="utf-8"))["id"]: json.loads(p.read_text(encoding="utf-8"))
       for p in sorted((ROOT / "scenarios").glob("*.json"))}
router = APIRouter(prefix="/api")
TOKEN_MAX_AGE_S = 12 * 3600
CLOCK_SLACK_S = 10.0


def _store(stmts: list[dict]) -> None:
    from backend.app import store_statements
    store_statements(stmts)


# ---------------- token buổi học (ký HMAC, không cần lưu trên máy chủ) ----------------
def _key() -> bytes:
    s = get_settings()
    seed = s.secret or (f"robo-start:{s.xapi_token}" if s.xapi_token else "robo-start:dev-chi-dung-tren-may-ca-nhan")
    return hashlib.sha256(seed.encode()).digest()


def sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()).decode().rstrip("=")
    mac = base64.urlsafe_b64encode(hmac.new(_key(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{body}.{mac}"


def verify(token: str) -> dict:
    try:
        body, mac = token.split(".")
        good = base64.urlsafe_b64encode(hmac.new(_key(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(mac, good):
            raise ValueError
        p = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except (ValueError, AttributeError, json.JSONDecodeError):
        raise HTTPException(401, "Token buổi học không hợp lệ") from None
    if time.time() - p["iat"] > TOKEN_MAX_AGE_S:
        raise HTTPException(401, "Token buổi học đã hết hạn (quá 12 giờ)")
    return p


# ---------------- kịch bản ----------------
def client_scenario(sid: str, with_quiz_answers: bool = False) -> dict:
    """Kịch bản đầy đủ cho bộ chấm trong trình duyệt. Mặc định bỏ đáp án và giải thích câu hỏi kiến thức."""
    raw = json.loads(json.dumps(RAW[sid]))
    if not with_quiz_answers:
        raw["quiz"] = [{k: v for k, v in q.items() if k not in ("answer", "explain")} for q in raw.get("quiz", [])]
    return raw


@router.get("/scenarios")
def list_scenarios():
    return [public_scenario(sc) for sc in SCENARIOS.values()]


@router.get("/scenarios/full")
def list_scenarios_full():
    return [client_scenario(k) for k in SCENARIOS]


# ---------------- bắt đầu / nộp kết quả ----------------
class StartIn(BaseModel):
    scenario_id: str
    learner: str = Field(min_length=1, max_length=40, description="Mã học viên ẩn danh, không dùng họ tên")
    role: str
    case_id: Optional[str] = None
    class_code: Optional[str] = Field(default=None, max_length=64)


class ResultIn(BaseModel):
    token: str = Field(max_length=4000)
    log: list[dict[str, Any]] = Field(max_length=2000)
    t_end: Optional[float] = None
    quiz_answers: dict[str, int] = {}


class ImportIn(BaseModel):
    scenario_id: str
    learner: str = Field(min_length=1, max_length=40)
    role: str
    case_id: Optional[str] = None
    started_at: Optional[str] = None
    log: list[dict[str, Any]] = Field(max_length=2000)
    t_end: Optional[float] = None
    quiz_answers: dict[str, int] = {}


def _check_class(code_in: Optional[str]) -> None:
    code = get_settings().class_code
    if code and not secrets.compare_digest((code_in or "").strip().encode(), code.encode()):
        raise HTTPException(403, "Sai hoặc thiếu mã lớp. Hỏi giảng viên mã lớp của buổi học.")


def _new_session(sid: str, case_id: Optional[str], role: str, learner: str) -> Session:
    if sid not in SCENARIOS:
        raise HTTPException(404, "Không có kịch bản này")
    sc = SCENARIOS[sid]
    if role not in sc.roles:
        raise HTTPException(400, f"Vai trò phải thuộc {list(sc.roles)}")
    try:
        return Session(sc, case_id, role, learner)
    except KeyError:
        raise HTTPException(400, "Không có ca bệnh này") from None


def _already_submitted(reg: str) -> bool:
    from backend.app import _db
    con = _db()
    try:
        return bool(con.execute("SELECT 1 FROM statements WHERE registration=? AND verb IN (?,?) LIMIT 1",
                                (reg, "http://adlnet.gov/expapi/verbs/passed", "http://adlnet.gov/expapi/verbs/failed")).fetchall())
    finally:
        con.close()


def _record(s: Session, sb: StatementBuilder, quiz_answers: dict, extra: Optional[dict] = None,
            with_init: bool = False) -> Optional[dict]:
    stmts = [sb.initialized(s.member(r), r) for r in s.sc.roles] if with_init else []
    for ev, fb in s.events:
        stmts += sb.from_event(s.member(ev.role), ev, fb)
    stmts += sb.finished(s.group(), s.result)
    graded = None
    if s.sc.quiz and quiz_answers:
        graded = s.grade_quiz(quiz_answers)
        stmts += sb.quiz(s.member(s.role), graded, s.result.duration_s)
    if extra:
        for st in stmts:
            st["context"]["extensions"].update(extra)
    _store(stmts)
    return graded


@router.post("/run/start")
def start(body: StartIn):
    _check_class(body.class_code)
    s = _new_session(body.scenario_id, body.case_id, body.role, body.learner)
    reg = str(uuid.uuid4())
    iat = round(time.time(), 3)
    sb = StatementBuilder(s.sc, s.team, start=datetime.fromtimestamp(iat, timezone.utc), registration=reg, case_id=s.case_id)
    _store([sb.initialized(s.member(r), r) for r in s.sc.roles])   # giảng viên thấy buổi "đang làm"
    tok = sign({"v": 1, "reg": reg, "sid": s.sc.id, "ver": s.sc.version, "case": s.case_id, "role": body.role,
                "learner": body.learner, "iat": iat})
    return {"token": tok, "registration": reg, "case_id": s.case_id}


# ---------------- theo dõi trực tiếp ----------------
class ProgressIn(BaseModel):
    token: str = Field(max_length=4000)
    log: list[dict[str, Any]] = Field(max_length=2000)


LIVE_ACTIVE_S = 45          # quá thời gian này không có tín hiệu: coi là tạm dừng / đã đóng trang
LIVE_KEEP_S = 2 * 86400     # xoá tiến độ cũ hơn 2 ngày (kết quả chính thức nằm ở bảng statements)
ADL = "http://adlnet.gov/expapi/verbs/"


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


@router.post("/run/progress")
def progress(body: ProgressIn):
    """Trình duyệt sinh viên gửi nhật ký đến thời điểm hiện tại (khoảng 10 giây một lần). Máy chủ chạy lại nhật ký
    như khi nộp bài (cùng các kiểm tra) và lưu ảnh chụp tiến độ cho trang Theo dõi trực tiếp. Không ghi điểm."""
    p = verify(body.token)
    sc = SCENARIOS.get(p["sid"])
    if sc is None or sc.version != p["ver"]:
        raise HTTPException(409, "Kịch bản đã được cập nhật sau khi bắt đầu buổi")
    if _already_submitted(p["reg"]):
        return {"ok": False, "submitted": True}
    now = time.time()
    try:
        s = replay_log(sc, p["case"], p["role"], p["learner"], body.log, None, max_t=now - p["iat"] + CLOCK_SLACK_S, finish=False)
    except LogError as e:
        raise HTTPException(422, f"Nhật ký thao tác không hợp lệ: {e}") from None
    case = sc.case(s.case_id) if sc.cases else None
    snap = {"registration": p["reg"], "learner": p["learner"], "role": p["role"], "team": s.team,
            "scenario": sc.id, "scenario_title": sc.title, "case": s.case_id, "case_title": case["title"] if case else None,
            "started": _iso(p["iat"]), **progress_snapshot(s)}
    from backend.app import _db
    con = _db()
    try:
        with WRITE_LOCK, con:
            con.execute("INSERT INTO live_progress VALUES (?,?,?) ON CONFLICT (registration) DO UPDATE SET "
                        "updated=excluded.updated, body=excluded.body", (p["reg"], _iso(now), json.dumps(snap, ensure_ascii=False)))
            if random.random() < 0.02:
                con.execute("DELETE FROM live_progress WHERE updated < ?", (_iso(now - LIVE_KEEP_S),))
    finally:
        con.close()
    return {"ok": True}


@router.get("/live")
def live(hours: float = 6.0):
    """Các buổi bắt đầu trong `hours` giờ gần đây: đang làm (kèm tiến độ), tạm dừng, đã nộp (kèm điểm)."""
    from backend.app import _db
    now = time.time()
    cutoff = _iso(now - max(0.1, min(hours, 72.0)) * 3600)
    con = _db()
    try:
        starts = {}
        for r in con.execute("SELECT registration, ts, body FROM statements WHERE verb=? AND ts>=? ORDER BY ts",
                             (ADL + "initialized", cutoff)):
            starts.setdefault(r["registration"], r)
        regs = list(starts)
        finals, snaps = {}, {}
        for i in range(0, len(regs), 500):
            chunk = regs[i:i + 500]
            q = ",".join("?" * len(chunk))
            for r in con.execute(f"SELECT registration, body FROM statements WHERE verb IN (?,?) AND registration IN ({q})",
                                 (ADL + "passed", ADL + "failed", *chunk)):
                finals[r["registration"]] = json.loads(r["body"])
            for r in con.execute(f"SELECT registration, updated, body FROM live_progress WHERE registration IN ({q})", tuple(chunk)):
                snaps[r["registration"]] = (r["updated"], json.loads(r["body"]))
    finally:
        con.close()

    def secs(ts: str) -> float:
        return round(now - datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp(), 1)

    out = []
    for reg, r in starts.items():
        first = json.loads(r["body"])
        ext = first["context"].get("extensions") or {}
        base = first["context"]["contextActivities"]["parent"][0]["id"].split("/scenario/")[-1].split("/")[0]
        sc = SCENARIOS.get(base)
        team = next((v for k, v in ext.items() if k.endswith("/ext/team")), None)
        row = {"registration": reg, "team": team, "scenario": base, "scenario_title": sc.title if sc else base,
               "started": r["ts"], "elapsed_s": secs(r["ts"]), "progress": None, "last_seen_s": None, "result": None}
        if reg in snaps:
            upd, snap = snaps[reg]
            row.update(progress={k: v for k, v in snap.items() if k not in ("registration", "team", "scenario", "scenario_title", "started")},
                       last_seen_s=secs(upd))
        if reg in finals:
            res = finals[reg].get("result") or {}
            row["status"] = "submitted"
            row["result"] = {"score": (res.get("score") or {}).get("raw"), "passed": res.get("success")}
        else:
            seen = row["last_seen_s"] if row["last_seen_s"] is not None else row["elapsed_s"]
            row["status"] = "active" if seen <= LIVE_ACTIVE_S else "idle"
        out.append(row)
    order = {"active": 0, "idle": 1, "submitted": 2}
    out.sort(key=lambda x: (order[x["status"]], -datetime.fromisoformat(x["started"].replace("Z", "+00:00")).timestamp()))
    return {"now": _iso(now), "active_after_s": LIVE_ACTIVE_S, "sessions": out}


@router.post("/results")
def submit(body: ResultIn):
    p = verify(body.token)
    sc = SCENARIOS.get(p["sid"])
    if sc is None or sc.version != p["ver"]:
        raise HTTPException(409, "Kịch bản đã được cập nhật sau khi bắt đầu buổi; hãy làm lại buổi mới")
    if _already_submitted(p["reg"]):
        raise HTTPException(409, "Buổi này đã nộp kết quả")
    elapsed = time.time() - p["iat"] + CLOCK_SLACK_S
    try:
        s = replay_log(sc, p["case"], p["role"], p["learner"], body.log, body.t_end, max_t=elapsed)
    except LogError as e:
        raise HTTPException(422, f"Nhật ký thao tác không hợp lệ: {e}") from None
    sb = StatementBuilder(sc, s.team, start=datetime.fromtimestamp(p["iat"], timezone.utc), registration=p["reg"], case_id=s.case_id)
    graded = _record(s, sb, body.quiz_answers)
    return {"registration": p["reg"], "result": result_json(s.result), "quiz": graded}


@router.post("/results/import")
def import_result(body: ImportIn, request: Request):
    """Giảng viên nhập tệp kết quả sinh viên tải về từ bản tự luyện (không có máy chủ)."""
    s0 = _new_session(body.scenario_id, body.case_id, body.role, body.learner)
    try:
        s = replay_log(s0.sc, s0.case_id, body.role, body.learner, body.log, body.t_end)
    except LogError as e:
        raise HTTPException(422, f"Tệp kết quả không hợp lệ: {e}") from None
    try:
        start_dt = datetime.fromisoformat((body.started_at or "").replace("Z", "+00:00"))
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
    except ValueError:
        start_dt = datetime.now(timezone.utc)
    reg = str(uuid.uuid4())
    sb = StatementBuilder(s.sc, s.team, start=start_dt, registration=reg, case_id=s.case_id)
    base = sb.base
    graded = _record(s, sb, body.quiz_answers, {f"{base}/ext/source": "import", f"{base}/ext/imported-by": request.state.user or "dev"},
                     with_init=True)
    return {"registration": reg, "result": result_json(s.result), "quiz": graded}
