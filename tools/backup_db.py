"""Sao lưu CSDL SQLite an toàn trong lúc máy chủ đang chạy (dùng cơ chế backup của SQLite).

  python tools/backup_db.py --out backups --keep-days 30
  python tools/backup_db.py --restore backups/robo_or_sim_20261010_023000.db   (dừng máy chủ trước khi khôi phục)
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path


def backup(db: str, out: Path, keep_days: int) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    dst = out / f"robo_or_sim_{datetime.now():%Y%m%d_%H%M%S}.db"
    src = sqlite3.connect(db)
    dest = sqlite3.connect(dst)
    with dest:
        src.backup(dest)
    ok = dest.execute("PRAGMA integrity_check").fetchone()[0]
    n = dest.execute("SELECT count(*) FROM statements").fetchone()[0] if dest.execute(
        "SELECT name FROM sqlite_master WHERE name='statements'").fetchone() else 0
    src.close()
    dest.close()
    if ok != "ok":
        dst.unlink(missing_ok=True)
        raise SystemExit(f"Bản sao lưu lỗi kiểm tra toàn vẹn: {ok}")
    cutoff = time.time() - keep_days * 86400
    for f in out.glob("robo_or_sim_*.db"):
        if f.stat().st_mtime < cutoff:
            f.unlink()
    print(f"Đã sao lưu {n} câu lệnh vào {dst}")
    return dst


def restore(db: str, src: Path) -> None:
    con = sqlite3.connect(src)
    ok = con.execute("PRAGMA integrity_check").fetchone()[0]
    con.close()
    if ok != "ok":
        raise SystemExit(f"Tệp sao lưu lỗi: {ok}")
    if Path(db).exists():
        keep = f"{db}.truoc_khoi_phuc_{datetime.now():%Y%m%d_%H%M%S}"
        shutil.copy2(db, keep)
        print(f"Đã giữ CSDL hiện tại ở {keep}")
    for ext in ("-wal", "-shm"):
        Path(db + ext).unlink(missing_ok=True)
    shutil.copy2(src, db)
    print(f"Đã khôi phục {src} vào {db}. Khởi động lại máy chủ.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("ROBO_DB", "robo_or_sim.db"))
    ap.add_argument("--out", default="backups")
    ap.add_argument("--keep-days", type=int, default=30)
    ap.add_argument("--restore", type=Path)
    a = ap.parse_args()
    if a.restore:
        restore(a.db, a.restore)
    else:
        if not Path(a.db).exists():
            sys.exit(f"Không thấy CSDL {a.db}")
        backup(a.db, Path(a.out), a.keep_days)


if __name__ == "__main__":
    main()
