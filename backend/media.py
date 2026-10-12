"""Video tham khảo theo kịch bản và mốc thời gian video cho từng bước.

- Danh mục video: media/videos.json (do nhóm phát triển quản lý, có nguồn và ghi chú).
- Mốc thời gian theo bước: giảng viên gắn trên trang /video-markers, lưu trong SQLite (bảng media_markers).
  Không tự sinh mốc: công cụ phát triển không xem được nội dung video.
- Ghi, xoá, nhập, xuất mốc là quyền giảng viên (kiểm tra trong backend/app.py khi ROBO_INSTRUCTORS được đặt).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.dblock import WRITE_LOCK
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from simcore import load_all

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "media" / "videos.json").read_text(encoding="utf-8"))
SCENARIOS = load_all(ROOT / "scenarios")
router = APIRouter(prefix="/api/media")


def _db():
    from backend.app import _db as db
    return db()      # bảng được tạo một lần trong backend.app.SCHEMA


def _videos(sid: str) -> list[dict]:
    if sid not in SCENARIOS:
        raise HTTPException(404, "Không có kịch bản này")
    return CATALOG.get(sid, [])


def _video(sid: str, key: str) -> dict:
    v = next((v for v in _videos(sid) if v["key"] == key), None)
    if not v:
        raise HTTPException(404, "Không có video này cho kịch bản")
    return v


def markers(sid: str, key: str) -> dict:
    con = _db()
    rows = con.execute("SELECT step, body FROM media_markers WHERE scenario=? AND video=?", (sid, key))
    return {r["step"]: json.loads(r["body"]) for r in rows}


class MarkerIn(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    note: str = Field(default="", max_length=1000)
    differs: bool = False          # đoạn video khác quy trình chuẩn chấm
    author: str = Field(default="", max_length=60)

    @model_validator(mode="after")
    def _order(self):
        if self.end <= self.start:
            raise ValueError("Cuối đoạn phải sau đầu đoạn")
        return self


class ImportIn(BaseModel):
    markers: dict[str, MarkerIn]
    replace: bool = False


@router.get("/{sid}")
def list_media(sid: str):
    out = []
    for v in _videos(sid):
        m = markers(sid, v["key"])
        out.append({**v, "markers": m, "marked_steps": len(m), "total_steps": len(SCENARIOS[sid].steps)})
    return out


@router.put("/{sid}/{key}/markers/{step}")
def put_marker(sid: str, key: str, step: str, body: MarkerIn):
    _video(sid, key)
    try:
        SCENARIOS[sid].step(step)
    except KeyError:
        raise HTTPException(404, "Không có bước này") from None
    rec = {**body.model_dump(), "updated": datetime.now(timezone.utc).isoformat()}
    con = _db()
    with WRITE_LOCK, con:
        con.execute("INSERT INTO media_markers VALUES (?,?,?,?) "
                        "ON CONFLICT (scenario, video, step) DO UPDATE SET body=excluded.body", (sid, key, step, json.dumps(rec, ensure_ascii=False)))
    return rec


@router.delete("/{sid}/{key}/markers/{step}")
def del_marker(sid: str, key: str, step: str):
    _video(sid, key)
    con = _db()
    with WRITE_LOCK, con:
        con.execute("DELETE FROM media_markers WHERE scenario=? AND video=? AND step=?", (sid, key, step))
    return {"ok": True}


@router.post("/{sid}/{key}/import")
def import_markers(sid: str, key: str, body: ImportIn):
    """Nhập mốc từ tệp JSON (ví dụ do giảng viên khác xuất ra)."""
    _video(sid, key)
    valid = {s.id for s in SCENARIOS[sid].steps}
    bad = [s for s in body.markers if s not in valid]
    if bad:
        raise HTTPException(400, f"Bước không tồn tại: {', '.join(bad)}")
    con = _db()
    now = datetime.now(timezone.utc).isoformat()
    with WRITE_LOCK, con:
        if body.replace:
            con.execute("DELETE FROM media_markers WHERE scenario=? AND video=?", (sid, key))
        for step, m in body.markers.items():
            con.execute("INSERT INTO media_markers VALUES (?,?,?,?) "
                        "ON CONFLICT (scenario, video, step) DO UPDATE SET body=excluded.body",
                        (sid, key, step, json.dumps({**m.model_dump(), "updated": now}, ensure_ascii=False)))
    return {"imported": len(body.markers)}


@router.get("/{sid}/{key}/export")
def export_markers(sid: str, key: str):
    v = _video(sid, key)
    return {"scenario": sid, "video": key, "source_url": v["source_url"], "markers": markers(sid, key)}
