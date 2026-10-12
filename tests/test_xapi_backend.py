import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from simcore import load_all, validate_statement
from simcore.replay import TEAMS, run_script, team_run

SC = load_all(Path(__file__).resolve().parents[1] / "scenarios")
HEAD = {"X-Experience-API-Version": "1.0.3"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ROBO_TOKEN", raising=False)
    from backend.app import app
    return TestClient(app)


def test_all_generated_statements_are_valid():
    for sid, teams in TEAMS.items():
        for team, rows in teams.items():
            for s in team_run(SC, sid, team, rows).statements:
                assert validate_statement(s) == [], s


def test_statements_contain_no_email_or_patient_fields():
    out = run_script(SC["m6_emergency_undock"], "A", TEAMS["m6_emergency_undock"]["Ê kíp A"])
    blob = str(out.statements)
    assert "mbox" not in blob and "patient" not in blob.lower()


def test_lrs_rejects_missing_version_and_bad_statement(client):
    assert client.post("/xapi/statements", json={}).status_code == 400
    r = client.post("/xapi/statements", json={"actor": {}, "verb": {"id": "x"}, "object": {"id": "y"}}, headers=HEAD)
    assert r.status_code == 400 and "errors" in r.json()


def test_token_required_when_configured(client, monkeypatch):
    monkeypatch.setenv("ROBO_TOKEN", "abc")
    out = run_script(SC["m2_sterile_basics"], "SV", TEAMS["m2_sterile_basics"]["SV 01"])
    assert client.post("/xapi/statements", json=out.statements, headers=HEAD).status_code == 401
    ok = client.post("/xapi/statements", json=out.statements, headers={**HEAD, "Authorization": "Bearer abc"})
    assert ok.status_code == 200


def test_end_to_end_report(client):
    for sid, teams in TEAMS.items():
        for team, rows in teams.items():
            r = client.post("/xapi/statements", json=team_run(SC, sid, team, rows).statements, headers=HEAD)
            assert r.status_code == 200
    ses = client.get("/api/sessions").json()
    assert len(ses) == 10
    c = next(s for s in ses if s["team"] == "Ê kíp C")
    assert c["passed"] is False and c["score"] == 29 and c["missed_critical"] == ["call_help"]
    summ = client.get("/api/summary", params={"scenario": "m6"}).json()
    assert summ["sessions"] == 3 and summ["pass_rate"] == round(2 / 3, 3)
    assert client.get("/").status_code == 200


def test_posting_same_statements_twice_is_idempotent(client):
    st = run_script(SC["m2_sterile_basics"], "SV", TEAMS["m2_sterile_basics"]["SV 01"]).statements
    client.post("/xapi/statements", json=st, headers=HEAD)
    client.post("/xapi/statements", json=st, headers=HEAD)
    assert len(client.get("/api/sessions").json()) == 1
