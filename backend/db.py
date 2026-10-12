"""Kết nối CSDL: SQLite (mặc định, một máy chủ) hoặc PostgreSQL (khi đặt DATABASE_URL, ví dụ Neon trên Vercel).

Mã truy vấn viết một lần với dấu '?' và cú pháp chung cho cả hai (ON CONFLICT ...). Lớp Conn đổi '?'
thành '%s' cho PostgreSQL, đọc hết kết quả ngay (không giữ con trỏ) và đóng kết nối khi không dùng nữa.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Iterable


class Rows(list):
    def fetchall(self):
        return list(self)

    def fetchone(self):
        return self[0] if self else None


class Conn:
    def __init__(self, raw: Any, pg: bool):
        self.raw, self.pg, self.closed = raw, pg, False

    def execute(self, sql: str, params: Iterable = ()) -> Rows:
        if self.pg:
            sql = sql.replace("?", "%s")
        cur = self.raw.execute(sql, tuple(params))
        return Rows(cur.fetchall() if cur.description else [])

    def commit(self) -> None:
        self.raw.commit()

    def __enter__(self) -> "Conn":
        return self

    def __exit__(self, et, e, tb) -> None:
        if et is None:
            self.raw.commit()
        else:
            self.raw.rollback()

    def close(self) -> None:
        if not self.closed:
            self.closed = True
            self.raw.close()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass


def connect_sqlite(path: str) -> Conn:
    raw = sqlite3.connect(path, timeout=15)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA busy_timeout=15000")
    raw.execute("PRAGMA synchronous=NORMAL")    # an toàn với WAL, ghi nhanh hơn nhiều
    return Conn(raw, pg=False)


def connect_pg(url: str) -> Conn:
    import psycopg
    from psycopg.rows import dict_row
    # prepare_threshold=None: không dùng prepared statement phía máy chủ, để chạy được qua bộ gộp kết nối
    # PgBouncer (DATABASE_URL của Neon/Vercel là chuỗi kết nối "pooled")
    return Conn(psycopg.connect(url, row_factory=dict_row, connect_timeout=10, prepare_threshold=None), pg=True)
