import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Chạy toàn bộ kiểm thử trên PostgreSQL:  ROBO_TEST_PG="postgresql://postgres@localhost:5432/postgres" pytest
# Mỗi kiểm thử dùng một CSDL mới, xóa sau khi chạy.
PG_ADMIN = os.environ.get("ROBO_TEST_PG")


@pytest.fixture(autouse=True)
def _fresh_postgres(monkeypatch):
    if not PG_ADMIN:
        yield
        return
    import psycopg
    name = "t_" + uuid.uuid4().hex[:12]
    with psycopg.connect(PG_ADMIN, autocommit=True) as c:
        c.execute(f"CREATE DATABASE {name}")
    base = PG_ADMIN.rsplit("/", 1)[0]
    monkeypatch.setenv("DATABASE_URL", f"{base}/{name}")
    yield
    with psycopg.connect(PG_ADMIN, autocommit=True) as c:
        c.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
